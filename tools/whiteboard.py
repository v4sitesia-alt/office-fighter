#!/usr/bin/env python3
"""
Recorte de board com FUNDO BRANCO (sem transparência): devolve RGBA com o fundo transparente.

O difícil é que o branco do fundo é o mesmo branco do desenho (dentes, mecha prateada, brilho do olho, núcleo
da magia, vapor). A cor não separa os dois, então cada bolsão branco preso no desenho é julgado pelo que está
EM VOLTA dele, e o que a regra errar se corrige à mão, por ponto ou retângulo (como uma varinha mágica):

  1. fundo de fora: branco (menor canal >= 238) ligado à borda da imagem. Vizinhança de 4, pra não vazar pela
     diagonal de um contorno de 1 px;
  2. bolsões presos no desenho, pelo anel de 3 px em volta:
       - anel na cor do efeito (--fx-hue): pequeno com anel escuro é dente/olho de criatura -> FICA; bolsão
         FUNDO na massa do efeito (mediana a >= 14 px do fundo de fora) é o núcleo branco do orbe/feixe -> FICA;
         o resto é vão entre chamas -> SAI;
       - resto (corpo, roupa, cabelo, vapor): na beira da silhueta (a <= 5 px do fundo de fora), com 10 px ou
         mais e anel escuro, é vão entre mechas de cabelo -> SAI; cercado de cinza/bege claro é o miolo de uma
         nuvem de fumaça, vapor ou poeira -> FICA; pequeno (< 120 px) no meio do desenho é brilho, tachinha,
         dente, mecha prateada -> FICA; grande é vão entre braço e corpo -> SAI;
     --keep / --drop "x,y" (o bolsão que contém o ponto) ou "x0,y0,x1,y1" (bolsões com o centro no retângulo)
     corrigem a regra; --fx-keep / --fx-drop "x0,y0,x1,y1" valem só pros bolsões de efeito (ex.: aura em volta
     do corpo, onde o branco é sempre vão). Ponto ganha de retângulo, e retângulo menor ganha do maior;
     --core "x0,y0,x1,y1": estouro em estrela, em que o miolo branco se liga ao fundo por entre os raios e iria
     embora junto. O script acha o centro do estouro e mede, raio a raio, quanto da volta é ocupada pelos raios.
     Branco por dentro do anel mais cheio é o miolo (opaco); dali pra fora ele some conforme os raios rareiam
     (o branco entre as pontas é fundo);
  3. borda do corpo: nos 2 px encostados no fundo removido o alpha sai do "color to alpha" contra o branco (tira
     o halo claro do antialias sem comer o traço escuro);
  4. efeito de magia ligado ao fundo: translúcido pelo mesmo color-to-alpha (névoa clara vira brilho suave, como
     nos boards transparentes), MAS perto de um núcleo branco mantido (orbe, feixe) fica opaco, senão aparece
     um anel escuro em volta do núcleo. Cor de efeito presa dentro do corpo (luz do braço, estampa) fica opaca.

Conferência:  python3 tools/whiteboard.py board.png saida.png --fx-hue 250-335 --debug mapa.png --list 25
  no mapa: cinza = fundo de fora · magenta = bolsão removido · verde = bolsão mantido
"""
import argparse
import numpy as np
from PIL import Image

WHITE_T, BAND, GAIN, FX_GAIN, RING, BIG, CORE_R, DEEP, DEPTH_MAX, EDGE_AREA, EDGE_NEAR, CORE_LO, CORE_HI = 238, 2, 1.1, 1.15, 3, 120, 16, 14, 40, 10, 5, 0.45, 0.8


def label4(mask):
    """Componentes com 4 vizinhos (corridas horizontais + union-find). Devolve (lab, n)."""
    H, W = mask.shape
    p = np.zeros((H, W + 2), np.int8); p[:, 1:-1] = mask
    d = np.diff(p, axis=1)
    sy, sx = np.nonzero(d == 1); _, ex = np.nonzero(d == -1)
    n = len(sx)
    if n == 0: return np.zeros((H, W), np.int32), 0
    parent = list(range(n))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    row0 = np.searchsorted(sy, np.arange(H + 1)).tolist(); S, E = sx.tolist(), ex.tolist()
    for y in range(1, H):
        i, ie, j, je = row0[y - 1], row0[y], row0[y], row0[y + 1]
        while i < ie and j < je:
            if S[i] < E[j] and S[j] < E[i]:          # estrito: encosta por cima, não pela diagonal
                a, b = find(i), find(j)
                if a != b: parent[b] = a
            if E[i] < E[j]: i += 1
            else: j += 1
    roots = np.array([find(i) for i in range(n)])
    _, comp = np.unique(roots, return_inverse=True); comp = comp + 1
    delta = np.zeros((H, W + 1), np.int64)
    np.add.at(delta, (sy, sx), comp); np.add.at(delta, (sy, ex), -comp)
    return np.cumsum(delta, axis=1)[:, :W].astype(np.int32), int(comp.max())


def dilate(m, k=1):
    for _ in range(k):
        p = np.pad(m, 1)
        m = m | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:] | p[:-2, :-2] | p[:-2, 2:] | p[2:, :-2] | p[2:, 2:]
    return m


def erode(m, k=1):
    return ~dilate(~m, k)


def distance(seed, limit):
    """Distância (xadrez) até `seed`, saturada em limit + 1."""
    d = np.full(seed.shape, limit + 1, np.int16); cur = seed.copy(); d[cur] = 0
    for k in range(1, limit + 1):
        nx = dilate(cur); d[nx & ~cur] = k; cur = nx
    return d


def hsv(rgb):
    r, g, b = (rgb[:, :, i].astype(np.float32) for i in range(3))
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    d = mx - mn; s = np.where(mx > 0, d / np.maximum(mx, 1), 0); v = mx / 255
    h = np.zeros_like(mx); nz = d > 0
    rm, gm = nz & (mx == r), nz & (mx == g) & (mx != r); bm = nz & ~rm & ~gm
    h[rm] = (60 * ((g - b)[rm] / d[rm])) % 360
    h[gm] = 60 * ((b - r)[gm] / d[gm]) + 120
    h[bm] = 60 * ((r - g)[bm] / d[bm]) + 240
    return h, s, v


def parse_hue(txt):
    """'250-335' ou '31-48:v0.72' (brilho mínimo: separa o dourado do efeito da roupa marrom de mesmo matiz)."""
    rng, *opt = txt.split(':'); a, b = (float(t) for t in rng.split('-'))
    return (a, b, float(opt[0][1:])) if opt else (a, b)


def fx_mask(rgb, ranges):
    """Pixels na cor do efeito (matiz dentro das faixas, com alguma saturação e brilho)."""
    if not ranges: return np.zeros(rgb.shape[:2], bool)
    h, s, v = hsv(rgb); m = np.zeros(h.shape, bool)
    for a, b, *vmin in ranges:
        hue = ((h >= a) & (h <= b)) if a <= b else ((h >= a) | (h <= b))
        m |= hue & (v >= (vmin[0] if vmin else 0.25))
    return m & (s >= 0.25)


def parse_geom(txt):
    v = [int(t) for t in txt.split(',')]
    if len(v) not in (2, 4): raise SystemExit(f'--keep/--drop: use "x,y" ou "x0,y0,x1,y1" (veio "{txt}")')
    return tuple(v)


def unwhite(rgb, fx_hues=(), keep=(), drop=(), report=None, listing=0, fx_keep=(), fx_drop=(), cores=()):
    """rgb (H,W,3) uint8 -> (rgba uint8, mapa de conferência: 0 desenho, 1 bolsão removido, 2 bolsão mantido, 3 fundo)."""
    H, W, _ = rgb.shape
    mn = rgb.min(axis=2).astype(np.int32); lum = rgb.astype(np.float32).mean(axis=2)
    fxc = fx_mask(rgb, fx_hues)
    _, sat, _ = hsv(rgb); pale = (lum >= 165) & (sat < 0.22)        # cinza/bege claro: fumaça, vapor, poeira
    white = mn >= WHITE_T
    lab, n = label4(white)
    touch = np.zeros(n + 1, bool)
    for e in (lab[0], lab[-1], lab[:, 0], lab[:, -1]): touch[np.unique(e)] = True
    touch[0] = False
    removed = touch[lab]
    check = np.zeros((H, W), np.uint8); core = np.zeros((H, W), bool)
    soft = np.zeros((H, W), np.float32)                # alpha do branco devolvido nos miolos de estouro
    if cores:
        hh, ss, vv = hsv(rgb); wide = np.zeros((H, W), bool)
        for a, b, *_ in fx_hues: wide |= ((hh >= a - 25) & (hh <= b + 25))
        glow = ~white & (vv >= 0.6) & wide               # raios do estouro, do azul cheio ao quase branco (sem o bastão escuro)
    for cx0, cy0, cx1, cy1 in cores:
        g = glow[cy0:cy1, cx0:cx1]; gy, gx = np.nonzero(g)
        if len(gx) < 50: continue
        ox, oy = gx.mean(), gy.mean(); R = int(np.hypot(cx1 - cx0, cy1 - cy0) / 2)
        ang = np.linspace(0, 2 * np.pi, 360, endpoint=False); cov = np.zeros(R + 1, np.float32)
        for r in range(R + 1):
            px, py = np.round(ox + r * np.cos(ang)).astype(int), np.round(oy + r * np.sin(ang)).astype(int)
            ok = (px >= 0) & (px < g.shape[1]) & (py >= 0) & (py < g.shape[0])
            cov[r] = g[py[ok], px[ok]].sum() / 360
        cov = np.convolve(cov, np.ones(5) / 5, mode='same'); peak = int(np.argmax(cov))
        t = np.clip((cov - CORE_LO) / (CORE_HI - CORE_LO), 0, 1); fall = t * t * (3 - 2 * t); fall[:peak + 1] = 1
        yy, xx = np.mgrid[0:cy1 - cy0, 0:cx1 - cx0]; rr = np.minimum(np.round(np.hypot(xx - ox, yy - oy)).astype(int), R)
        a = fall[rr]
        back = removed[cy0:cy1, cx0:cx1] & (a > 0.02)
        soft[cy0:cy1, cx0:cx1][back] = a[back]
        removed[cy0:cy1, cx0:cx1][back] = False; core[cy0:cy1, cx0:cx1][back & (a >= 0.5)] = True; check[cy0:cy1, cx0:cx1][back] = 2
        if report is not None: report.append(f'   miolo de estouro em {cx0},{cy0},{cx1},{cy1}: centro {cx0 + ox:.0f},{cy0 + oy:.0f}, anel dos raios em r={peak} px, {int(back.sum())} px brancos devolvidos')
    depth = distance(removed, DEPTH_MAX)               # quão fundo no desenho, a partir do fundo de fora
    idx = np.nonzero(white & ~removed & ~core); ids = lab[idx]
    order = np.argsort(ids, kind='stable'); ids, ys, xs = ids[order], idx[0][order], idx[1][order]
    starts = np.searchsorted(ids, np.arange(1, n + 2))
    rects = [(g, act, only_fx) for act, L, only_fx in (('keep', keep, False), ('drop', drop, False), ('keep', fx_keep, True), ('drop', fx_drop, True)) for g in L if len(g) == 4]
    rects.sort(key=lambda r: -(r[0][2] - r[0][0]) * (r[0][3] - r[0][1]))      # retângulo menor ganha do maior
    points = {}
    for act, L in (('keep', keep), ('drop', drop)):
        for g in L:
            if len(g) != 2: continue
            k = int(lab[g[1], g[0]]) if 0 <= g[1] < H and 0 <= g[0] < W else 0
            if k and not touch[k]: points[k] = act
            elif report is not None: report.append(f'   aviso: --{act} {g[0]},{g[1]} não cai num bolsão branco preso (é desenho ou fundo de fora)')
    stats = {'drop': 0, 'keep': 0, 'manual': 0}; rows = []
    for k in range(1, n + 1):
        if touch[k]: continue
        a0, a1 = starts[k - 1], starts[k]
        if a1 <= a0: continue
        py, px = ys[a0:a1], xs[a0:a1]; area = len(px)
        y0, y1, x0, x1 = max(0, py.min() - RING), min(H, py.max() + RING + 1), max(0, px.min() - RING), min(W, px.max() + RING + 1)
        comp = lab[y0:y1, x0:x1] == k
        ring = dilate(comp, RING) & ~comp & ~white[y0:y1, x0:x1]
        fx = float(fxc[y0:y1, x0:x1][ring].mean()) if ring.any() else 0.0
        dark = float((lum[y0:y1, x0:x1][ring] < 90).mean()) if ring.any() else 0.0
        smoke = float(pale[y0:y1, x0:x1][ring].mean()) if ring.any() else 0.0
        deep, edge = float(np.median(depth[py, px])), int(depth[py, px].min())
        if fx >= 0.5: act = 'keep' if (dark >= 0.35 and area < 80) or deep >= DEEP else 'drop'
        elif area >= EDGE_AREA and edge <= EDGE_NEAR and dark >= 0.5: act = 'drop'   # vão entre mechas na beira da silhueta
        elif smoke >= 0.6: act = 'keep'                                              # miolo claro de fumaça/vapor/poeira
        else: act = 'keep' if area < BIG else 'drop'
        why = 'regra'
        cx, cy = float(px.mean()), float(py.mean())
        for (rx0, ry0, rx1, ry1), ract, only_fx in rects:
            if rx0 <= cx <= rx1 and ry0 <= cy <= ry1 and (fx >= 0.5 or not only_fx): act, why = ract, 'retângulo'
        if k in points: act, why = points[k], 'ponto'
        stats[act] += 1; stats['manual'] += why != 'regra'
        if act == 'drop': removed[py, px] = True
        elif fx >= 0.3: core[py, px] = True
        check[py, px] = 1 if act == 'drop' else 2
        if listing and area >= listing: rows.append((int(px[0]), int(py[0]), int(cx), int(cy), area, fx, dark, deep, act, why))
    if report is not None:
        report.append(f"   bolsões brancos presos: {stats['drop']} removidos, {stats['keep']} mantidos ({stats['manual']} decididos à mão)")
        for r in sorted(rows, key=lambda r: (r[3] // 100, r[2])):
            report.append('      ponto %4d,%-4d centro %4d,%-4d área %5d  efeito %.2f escuro %.2f fundo %2d  -> %s (%s)' % r)

    near = dilate(removed, BAND) & ~removed
    fx_region = np.zeros((H, W), bool)
    if fx_hues:   # efeito ligado ao fundo removido (estampa e luzes presas no corpo não entram)
        fl, _ = label4(dilate(fxc, 1) & ~removed)
        hit = np.unique(fl[dilate(removed, 1) & (fl > 0)])
        fx_region = np.isin(fl, hit[hit > 0]) & ~removed & (fxc | near)
    out = np.dstack([rgb, np.full((H, W), 255, np.uint8)])
    f = rgb.astype(np.float32); a_min = (255 - f.min(axis=2)) / 255

    def put(m, alpha):
        a = np.clip(alpha, 1e-3, 1)[m]
        c = np.clip((f[m] - (1 - a)[:, None] * 255) / a[:, None], 0, 255)
        out[m, :3] = c.round().astype(np.uint8); out[m, 3] = (a * 255).round().astype(np.uint8)

    put(near & ~fx_region, np.clip(a_min * GAIN, 0, 1))
    if fx_region.any():
        dr, dc = distance(removed, CORE_R).astype(np.float32), distance(core, CORE_R).astype(np.float32)
        w = np.where(dc > CORE_R, 0.0, np.where(dr > CORE_R, 1.0, dr / np.maximum(dr + dc, 1)))   # 0 = perto do fundo, 1 = perto do núcleo
        a = np.clip(a_min * FX_GAIN, 0, 1)
        put(fx_region, a + (1 - a) * w)
    sm = soft > 0
    out[sm, :3] = rgb[sm]; out[sm, 3] = (soft[sm] * 255).round().astype(np.uint8)
    out[removed] = 0
    check[removed & (check == 0)] = 3
    return out, check


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--fx-hue', action='append', default=[]); ap.add_argument('--keep', action='append', default=[]); ap.add_argument('--drop', action='append', default=[])
    ap.add_argument('--fx-keep', action='append', default=[]); ap.add_argument('--fx-drop', action='append', default=[]); ap.add_argument('--core', action='append', default=[])
    ap.add_argument('--debug', default=None); ap.add_argument('--list', type=int, default=0, help='lista os bolsões com pelo menos N px')
    a = ap.parse_args()
    rgb = np.array(Image.open(a.src).convert('RGB'))
    hues = [parse_hue(r) for r in a.fx_hue]
    rep = []
    g = lambda L: [parse_geom(t) for t in L]
    rgba, check = unwhite(rgb, hues, g(a.keep), g(a.drop), rep, a.list, g(a.fx_keep), g(a.fx_drop), g(a.core))
    print('\n'.join(rep))
    Image.fromarray(rgba).save(a.out)
    if a.debug: check_image(rgb, check).save(a.debug)


def check_image(rgb, check):
    vis = (rgb * 0.45).astype(np.uint8); vis[check == 3] = (30, 30, 36); vis[check == 1] = (255, 0, 255); vis[check == 2] = (0, 255, 90)
    return Image.fromarray(vis)


if __name__ == '__main__':
    main()
