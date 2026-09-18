#!/usr/bin/env python3
"""
Monta o atlas de um lutador a partir do board de poses (grade aproximada de COLS x ROWS).

Cada pose é ISOLADA pixel a pixel: o script rotula os componentes conectados do board, descobre a qual pose cada
um pertence e copia só esses pixels pra um atlas novo (sheet.png), com folga entre os frames. Assim nenhum frame
carrega pedaço da pose vizinha, mesmo quando os desenhos se encostam ou um efeito invade a célula ao lado.

  python3 tools/sprites.py <board.png> <outdir> [--cols 5 --rows 7] [--wide r,c] [--fx x0,y0,x1,y1]
                                                [--export 33:arquivo.png] [--debug out.png]

  --wide r,c    a pose da linha r, coluna c ocupa DUAS células (ex.: braço ou língua esticados). A célula seguinte
                vira um frame vazio e nada é cortado. Pode repetir. "r,c,3" = três células.
  --fx          retângulo do board copiado como special_fx.png (projétil). O desenho continua no frame (nada é cortado);
                com --fx-erase ele é apagado do frame.
  --export      salva o frame i (já isolado) como PNG avulso no outdir, pra usar como sprite de projétil.

Saída: sheet.png (atlas) + frames.json. O índice do frame é sempre linha*COLS + coluna; célula vazia gera um frame
"empty" de 1x1. Por frame: sx,sy,sw,sh (retângulo no atlas), ay (linha dos pés), ax (eixo do corpo medido pelos pés),
cx (eixo pelo centroide, usado em pulo/queda/nocaute).

Como as poses são separadas:
  1. componentes conectados exatos (8 vizinhos) dos pixels com alpha > 40;
  2. componente maior que 1,25 célula = duas poses encostadas: é erodido até se partir em núcleos que caem em
     células diferentes, e cada pixel vai pro núcleo mais próximo por dentro do desenho (o corte cai no ponto mais
     fino). Se não partir, corta na coluna/linha mais vazia perto da grade. Poses declaradas em --wide não são partidas;
  3. a maior peça de cada célula é o corpo da pose; peças soltas (faíscas, poeira, gotas) vão pro corpo mais
     PRÓXIMO medido pixel a pixel, não pela caixa;
  4. bordas semitransparentes (alpha 8..40) são devolvidas à pose vizinha mais próxima (3 px).
"""
import sys, os, json, argparse
import numpy as np
from PIL import Image, ImageDraw

ALPHA_T, EDGE_T, EDGE_GROW = 40, 8, 3
FEET_PCT, PAD, ATLAS_W = 0.12, 6, 2048
MAX_ERODE, CUT_FRAC = 14, 0.45


def label_runs(mask):
    """Componentes conectados (8 vizinhos) por corridas horizontais + union-find. Devolve (lab, stats)."""
    H, W = mask.shape
    p = np.zeros((H, W + 2), np.int8); p[:, 1:-1] = mask
    d = np.diff(p, axis=1)
    sy, sx = np.nonzero(d == 1); _, ex = np.nonzero(d == -1)      # corrida [sx, ex) na linha sy
    n = len(sx)
    if n == 0:
        return np.zeros((H, W), np.int32), None
    parent = list(range(n))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    row0 = np.searchsorted(sy, np.arange(H + 1)).tolist(); S, E = sx.tolist(), ex.tolist()
    for y in range(1, H):
        i, ie, j, je = row0[y - 1], row0[y], row0[y], row0[y + 1]
        while i < ie and j < je:
            if S[i] <= E[j] and S[j] <= E[i]:
                a, b = find(i), find(j)
                if a != b: parent[b] = a
            if E[i] < E[j]: i += 1
            else: j += 1
    roots = np.array([find(i) for i in range(n)])
    _, comp = np.unique(roots, return_inverse=True); comp = comp + 1; k = int(comp.max())
    delta = np.zeros((H, W + 1), np.int64)
    np.add.at(delta, (sy, sx), comp); np.add.at(delta, (sy, ex), -comp)
    lab = np.cumsum(delta, axis=1)[:, :W].astype(np.int32)
    ln = (ex - sx).astype(np.float64)
    st = {'n': k, 'area': np.bincount(comp, weights=ln, minlength=k + 1),
          'sumx': np.bincount(comp, weights=(sx + ex - 1) * ln / 2, minlength=k + 1), 'sumy': np.bincount(comp, weights=sy * ln, minlength=k + 1)}
    for key, arr, fn, init in (('x0', sx, np.minimum, W), ('x1', ex, np.maximum, 0), ('y0', sy, np.minimum, H), ('y1', sy + 1, np.maximum, 0)):
        a = np.full(k + 1, init, np.int64); fn.at(a, comp, arr); st[key] = a
    return lab, st


def shifts8(a):
    p = np.pad(a, 1)
    return [p[1 + dy:p.shape[0] - 1 + dy, 1 + dx:p.shape[1] - 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]


def erode4(m):
    p = np.pad(m, 1)
    return m & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]


def grow(own, allowed, iters=None):
    """Espalha os rótulos de `own` por dentro de `allowed` (8 vizinhos) até não sobrar pixel ou acabar `iters`."""
    it = 0
    while iters is None or it < iters:
        free = (own == 0) & allowed
        if not free.any(): break
        best = np.zeros_like(own)
        for s in shifts8(own): best = np.maximum(best, s)
        take = free & (best > 0)
        if not take.any(): break
        own = own.copy(); own[take] = best[take]; it += 1
    return own


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('outdir')
    ap.add_argument('--cols', type=int, default=5); ap.add_argument('--rows', type=int, default=7)
    ap.add_argument('--wide', action='append', default=[]); ap.add_argument('--fx', default=None); ap.add_argument('--fx-erase', action='store_true')
    ap.add_argument('--export', action='append', default=[]); ap.add_argument('--debug', default=None)
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)
    arr = np.array(Image.open(args.src).convert('RGBA'))
    H, W = arr.shape[:2]; cols, rows = args.cols, args.rows; cw, ch = W / cols, H / rows
    meta = {'sheet': 'sheet.png', 'cols': cols, 'rows': rows, 'source': os.path.basename(args.src)}

    if args.fx:
        fx0, fy0, fx1, fy1 = (int(v) for v in args.fx.split(','))
        reg = arr[fy0:fy1, fx0:fx1]; ys, xs = np.nonzero(reg[:, :, 3] > ALPHA_T)
        Image.fromarray(reg[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()).save(os.path.join(args.outdir, 'special_fx.png'))
        if args.fx_erase: arr[fy0:fy1, fx0:fx1] = 0
        meta['fx'] = {'file': 'special_fx.png', 'w': int(xs.max() + 1 - xs.min()), 'h': int(ys.max() + 1 - ys.min())}

    wides = []
    for w in args.wide:
        v = [int(t) for t in w.split(',')]; wides.append((v[0], v[1], v[2] if len(v) > 2 else 2))
    def cell_of(x, y):
        r, c = min(rows - 1, int(y // ch)), min(cols - 1, int(x // cw))
        for wr, wc, wn in wides:
            if r == wr and wc <= c < wc + wn: return (r, wc)
        return (r, c)

    alpha = arr[:, :, 3]; solid = alpha > ALPHA_T
    lab, st = label_runs(solid)
    comps = [{'id': i, 'area': st['area'][i], 'box': [int(st['x0'][i]), int(st['y0'][i]), int(st['x1'][i]), int(st['y1'][i])],
              'cell': cell_of(st['sumx'][i] / st['area'][i], st['sumy'][i] / st['area'][i])} for i in range(1, st['n'] + 1)]
    next_id = st['n'] + 1

    # ---------- 2. poses encostadas
    def straight_cut(m, x0, y0):
        """Corta na coluna/linha mais vazia perto de cada linha da grade atravessada. Devolve máscaras das partes."""
        def cuts(profile, lo, cell):
            out = []; hi = lo + len(profile); g = (int(lo // cell) + 1) * cell
            while g < hi - 1:
                a, b = int(max(lo + 1, g - cell * CUT_FRAC)), int(min(hi - 1, g + cell * CUT_FRAC))
                if b > a:
                    seg = profile[a - lo:b - lo]; z = np.nonzero(seg == 0)[0]
                    out.append(a + int(z[np.argmin(np.abs(z + a - g))]) if len(z) else (a + int(np.argmin(seg)) if seg.min() < 0.15 * seg.max() else int(g)))
                g += cell
            return out
        parts = [m]
        for axis, cell, lo in ((1, cw, x0), (0, ch, y0)):
            nxt = []
            for pm in parts:
                size = pm.shape[axis]
                idx = np.nonzero(pm.any(axis=1 - axis))[0]
                if len(idx) == 0: continue
                if idx.max() + 1 - idx.min() <= 1.25 * cell: nxt.append(pm); continue
                cs = [c - lo for c in cuts(pm.sum(axis=1 - axis), lo, cell)]
                edges = [0] + cs + [size]
                for a, b in zip(edges[:-1], edges[1:]):
                    sub = np.zeros_like(pm)
                    if axis == 1: sub[:, a:b] = pm[:, a:b]
                    else: sub[a:b, :] = pm[a:b, :]
                    if sub.sum() >= 20: nxt.append(sub)
            parts = nxt
        return [(pm, None) for pm in parts]

    def split(c):
        x0, y0, x1, y1 = c['box']; m = lab[y0:y1, x0:x1] == c['id']
        er = m
        for k in range(1, MAX_ERODE + 1):
            er = erode4(er)
            if not er.any(): break
            l2, s2 = label_runs(er); tot = s2['area'].sum(); groups = {}
            for j in range(1, s2['n'] + 1):
                if s2['area'][j] < max(60, 0.004 * tot): continue
                groups.setdefault(cell_of(x0 + s2['sumx'][j] / s2['area'][j], y0 + s2['sumy'][j] / s2['area'][j]), []).append(j)
            big = {cell: js for cell, js in groups.items() if sum(s2['area'][j] for j in js) >= 0.06 * tot}
            if len(big) >= 2:
                own = np.zeros(m.shape, np.int16); cells = list(big)
                for gi, cell in enumerate(cells): own[np.isin(l2, big[cell])] = gi + 1
                own = grow(own, m)
                print(f"   pose encostada {c['box'][2]-c['box'][0]}x{c['box'][3]-c['box'][1]}: separada em {len(cells)} pelo ponto mais fino (erosão {k}px): {cells}", file=sys.stderr)
                return [(own == gi + 1, cell) for gi, cell in enumerate(cells)] + ([((own == 0) & m, None)] if ((own == 0) & m).any() else [])
        print(f"   pose encostada {x1-x0}x{y1-y0} em {c['cell']}: sem ponto fino, corte reto perto da grade. Confira o contact sheet (ou use --wide).", file=sys.stderr)
        return straight_cut(m, x0, y0)

    out = []
    for c in comps:
        x0, y0, x1, y1 = c['box']; w, h = x1 - x0, y1 - y0
        if w <= 1.25 * cw and h <= 1.25 * ch: out.append(c); continue
        wide = [wn for wr, wc, wn in wides if (wr, wc) == c['cell']]      # o centroide cai numa pose declarada larga
        if wide and h <= 1.25 * ch and w <= (wide[0] + 0.6) * cw: out.append(c); continue
        for pm, cell in split(c):
            ys, xs = np.nonzero(pm)
            if len(xs) == 0: continue
            lab[y0:y1, x0:x1][pm] = next_id
            out.append({'id': next_id, 'area': float(len(xs)), 'box': [x0 + int(xs.min()), y0 + int(ys.min()), x0 + int(xs.max()) + 1, y0 + int(ys.max()) + 1],
                        'cell': cell or cell_of(x0 + xs.mean(), y0 + ys.mean())})
            next_id += 1
    comps = out

    # ---------- 3. corpo de cada célula + peças soltas pro corpo mais próximo (pixel a pixel)
    fid = lambda cell: cell[0] * cols + cell[1]
    mains = {}
    for c in comps:
        if c['cell'] not in mains or c['area'] > mains[c['cell']]['area']: mains[c['cell']] = c
    Q = 4; mq = np.zeros((H // Q + 2, W // Q + 2), np.int16)
    for cell, c in mains.items():
        x0, y0, x1, y1 = c['box']; ys, xs = np.nonzero(lab[y0:y1, x0:x1] == c['id'])
        mq[(ys + y0) // Q, (xs + x0) // Q] = fid(cell) + 1
        c['frame'] = fid(cell)
    main_ids = set(id(c) for c in mains.values())
    for c in comps:
        if id(c) in main_ids: continue
        x0, y0, x1, y1 = c['box']; home = fid(c['cell']); best = None
        if c['area'] >= 500:   # objeto grande solto (garrafa, projétil): fica com a pose da própria célula se ela estiver por perto
            qy, qx = np.nonzero(mq == home + 1)
            if len(qx):
                px, py = qx * Q + Q / 2, qy * Q + Q / 2
                dh = np.hypot(np.maximum(0, np.maximum(x0 - px, px - x1)), np.maximum(0, np.maximum(y0 - py, py - y1))).min()
                if dh <= 0.6 * min(cw, ch): c['frame'] = home; continue
        for R in (16, 32, 64, 128, 220):
            qy0, qy1, qx0, qx1 = max(0, (y0 - R) // Q), (y1 + R) // Q + 1, max(0, (x0 - R) // Q), (x1 + R) // Q + 1
            win = mq[qy0:qy1, qx0:qx1]; qy, qx = np.nonzero(win)
            if len(qx) == 0: continue
            px, py = (qx + qx0) * Q + Q / 2, (qy + qy0) * Q + Q / 2
            dist = np.hypot(np.maximum(0, np.maximum(x0 - px, px - x1)), np.maximum(0, np.maximum(y0 - py, py - y1)))
            ids = win[qy, qx]; cand = {int(i): float(dist[ids == i].min()) for i in np.unique(ids)}
            dmin = min(cand.values())
            if dmin > R and R != 220: continue
            near = [i for i, dd in cand.items() if dd <= dmin + 6]
            best = home + 1 if home + 1 in near else min(near, key=lambda i: cand[i]); break
        c['frame'] = (best - 1) if best else home

    # ---------- 4. mapa de dono por pixel + bordas semitransparentes
    lut = np.zeros(next_id + 1, np.int16)
    for c in comps: lut[c['id']] = c['frame'] + 1
    own = grow(lut[lab], alpha > EDGE_T, EDGE_GROW)

    # ---------- atlas
    total = rows * cols; crops = [None] * total; frames = []
    for f in range(total):
        ys, xs = np.nonzero(own == f + 1)
        r, c = divmod(f, cols)
        if len(xs) == 0:
            frames.append({'i': f, 'cell': [r, c], 'sx': 0, 'sy': 0, 'sw': 1, 'sh': 1, 'ax': 0, 'cx': 0, 'ay': 1, 'empty': True}); continue
        x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
        crop = arr[y0:y1, x0:x1].copy(); crop[own[y0:y1, x0:x1] != f + 1] = 0
        sol = crop[:, :, 3] > ALPHA_T
        limit = [(wc + 1) * cw - x0 for wr, wc, wn in wides if (wr, wc) == (r, c)]   # pose larga: eixo medido só no corpo
        if limit: sol = sol & (np.arange(x1 - x0)[None, :] < limit[0])
        sy_, sx_ = np.nonzero(sol)
        if len(sx_) == 0: sy_, sx_ = np.nonzero(crop[:, :, 3] > 0)
        feet = int(sy_.max()) + 1; top = int(sy_.min()); band = max(12, int((feet - top) * FEET_PCT))
        fb = sx_[sy_ >= feet - band]
        crops[f] = crop
        frames.append({'i': f, 'cell': [r, c], 'sw': x1 - x0, 'sh': y1 - y0, 'ax': round(float(fb.mean()), 1), 'cx': round(float(sx_.mean()), 1), 'ay': feet, 'src': [x0, y0]})
    aw = max(ATLAS_W, max(fr['sw'] for fr in frames) + 2 * PAD); x = y = PAD; rowh = 0
    for fr in frames:
        if fr.get('empty'): continue
        if x + fr['sw'] + PAD > aw: x = PAD; y += rowh + PAD; rowh = 0
        fr['sx'], fr['sy'] = x, y; x += fr['sw'] + PAD; rowh = max(rowh, fr['sh'])
    atlas = np.zeros((y + rowh + PAD, aw, 4), np.uint8)
    for fr in frames:
        if not fr.get('empty'): atlas[fr['sy']:fr['sy'] + fr['sh'], fr['sx']:fr['sx'] + fr['sw']] = crops[fr['i']]
    Image.fromarray(atlas).save(os.path.join(args.outdir, 'sheet.png'), optimize=True)
    meta.update({'width': aw, 'height': int(atlas.shape[0]), 'frames': frames})
    json.dump(meta, open(os.path.join(args.outdir, 'frames.json'), 'w'), indent=1)
    for e in args.export:
        i, name = e.split(':'); Image.fromarray(crops[int(i)]).save(os.path.join(args.outdir, name))
    empties = [fr['i'] for fr in frames if fr.get('empty')]
    print(f"{os.path.basename(args.src)}: {total - len(empties)} frames, atlas {aw}x{atlas.shape[0]}" + (f", vazios: {empties}" if empties else ''))

    if args.debug:
        rng = np.random.RandomState(7); pal = rng.randint(60, 255, (total + 1, 3)); pal[0] = 0
        tint = pal[own].astype(np.float32); base = arr[:, :, :3].astype(np.float32)
        vis = np.where((own > 0)[:, :, None], base * 0.55 + tint * 0.45, 20).astype(np.uint8)
        dbg = Image.fromarray(vis); d = ImageDraw.Draw(dbg)
        for r in range(1, rows): d.line([(0, r * ch), (W, r * ch)], fill=(90, 90, 120))
        for c in range(1, cols): d.line([(c * cw, 0), (c * cw, H)], fill=(90, 90, 120))
        for fr in frames:
            if not fr.get('empty'): d.text((fr['src'][0] + 2, fr['src'][1] + 2), f"#{fr['i']}", fill=(255, 255, 0))
        dbg.save(args.debug)
        B = max(260, max(max(fr['sw'], fr['sh']) for fr in frames) + 24)
        sheet = Image.new('RGBA', (B * cols, B * rows), (24, 24, 32, 255)); d2 = ImageDraw.Draw(sheet)
        for fr in frames:
            r, c = fr['cell']
            d2.line([(c * B, r * B + B - 10), (c * B + B, r * B + B - 10)], fill=(255, 60, 60, 120)); d2.rectangle([c * B, r * B, c * B + B - 1, r * B + B - 1], outline=(60, 60, 90, 255))
            d2.text((c * B + 4, r * B + 4), f"#{fr['i']}" + (' vazio' if fr.get('empty') else ''), fill=(255, 255, 0, 255))
            if fr.get('empty'): continue
            ox = int(c * B + min(B - fr['sw'] - 2, max(2, B / 2 - fr['ax']))); oy = int(r * B + B - 10 - fr['ay'])
            sheet.alpha_composite(Image.fromarray(crops[fr['i']]), (ox, max(r * B, oy)))
        sheet.save(args.debug.replace('.png', '-contact.png'))


if __name__ == '__main__':
    main()
