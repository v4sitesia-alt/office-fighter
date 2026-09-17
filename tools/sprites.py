#!/usr/bin/env python3
"""
Extrai os frames de um sprite sheet "solto" (grade aproximada de COLS x ROWS, sem
alinhamento exato entre células) e gera frames.json com o retângulo de origem e as
âncoras de cada frame. O sheet vai para sheet.png (igual ao original, exceto pelo
recorte opcional do projétil, ver --fx).

Uso:
  python3 tools/sprites.py Personagens/Edgard.png public/fighters/edgard \
      [--cols 5 --rows 4] [--fx x0,y0,x1,y1] [--debug out.png]

Saída em <outdir>/frames.json:
  { "sheet": "sheet.png", "width", "height", "cols", "rows",
    "frames": [ { "i", "cell": [row, col], "sx", "sy", "sw", "sh", "ax", "cx", "ay" }, ... ],
    "fx": { "file": "special_fx.png", "w", "h" }      (só com --fx) }

  sx,sy,sw,sh = retângulo de origem no sheet (bbox justo do sprite)
  ay          = linha dos pés (base do bbox)
  ax          = eixo do corpo medido pelos pés (centro da faixa inferior do sprite)
  cx          = eixo do corpo pelo centroide (melhor pra pulo, queda e nocaute)
  O jogo desenha o frame em (pos.x - eixo, chao - ay) e espelha pelo eixo ao virar.

--fx recorta um retângulo do sheet (coordenadas do sheet) como special_fx.png — o
projétil do especial — e apaga esses pixels do sheet.png, pra bola não aparecer
duplicada na mão do lutador enquanto o projétil voa.
"""
import sys, os, json, argparse
from collections import deque
import numpy as np
from PIL import Image, ImageDraw

ALPHA_T  = 40    # alpha mínimo pra considerar o pixel sólido
FEET_PCT = 0.12  # faixa inferior do sprite usada pra achar o eixo do corpo
CUT_WIN  = 60    # janela (px) em volta da linha da grade onde se procura o corte mais fino

try:
    from scipy import ndimage  # opcional, só acelera
except ImportError:
    ndimage = None


def dilate(m, r):
    out = m.copy()
    for _ in range(r):
        p = np.pad(out, 1)
        out = (p[1:-1, 1:-1] | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
               | p[:-2, :-2] | p[:-2, 2:] | p[2:, :-2] | p[2:, 2:])
    return out


def label(mask):
    if ndimage is not None:
        lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
        return lab, n
    H, W = mask.shape
    lab = np.zeros((H, W), dtype=np.int32)
    n = 0
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        n += 1
        lab[y0, x0] = n
        q = deque([(y0, x0)])
        while q:
            y, x = q.popleft()
            for ny in (y - 1, y, y + 1):
                if ny < 0 or ny >= H:
                    continue
                for nx in (x - 1, x, x + 1):
                    if 0 <= nx < W and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        q.append((ny, nx))
    return lab, n


def split_straddling(ys, xs, cw, ch):
    """Divide um componente que emenda sprites vizinhos: corta na linha (ou coluna)
    com menos pixels perto de cada linha da grade que ele atravessa."""
    def cuts(vals, lo, hi, cell):
        out = []
        g = (int(lo // cell) + 1) * cell
        while g < hi - 1:
            a, b = int(max(lo + 1, g - CUT_WIN)), int(min(hi - 1, g + CUT_WIN))
            if b > a:
                sel = (vals >= a) & (vals < b)
                hist = np.bincount((vals[sel] - a).astype(int), minlength=b - a)
                out.append(a + int(np.argmin(hist)))
            g += cell
        return out

    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    cy = cuts(ys, y0, y1, ch) if (y1 - y0) > 1.25 * ch else []
    cx = cuts(xs, x0, x1, cw) if (x1 - x0) > 1.25 * cw else []
    by = np.searchsorted(np.array(cy), ys, side='right') if cy else np.zeros(len(ys), int)
    bx = np.searchsorted(np.array(cx), xs, side='right') if cx else np.zeros(len(xs), int)
    parts = []
    for key in set(zip(by.tolist(), bx.tolist())):
        sel = (by == key[0]) & (bx == key[1])
        if sel.sum() >= 20:
            parts.append((ys[sel], xs[sel]))
    return parts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('outdir')
    ap.add_argument('--cols', type=int, default=5)
    ap.add_argument('--rows', type=int, default=4)
    ap.add_argument('--dilate', type=int, default=1, help='dilatação (meia-res) pra colar partes soltas do mesmo sprite')
    ap.add_argument('--fx', default=None, help='x0,y0,x1,y1 do projétil no sheet -> special_fx.png (e apaga do sheet)')
    ap.add_argument('--debug', default=None, help='salva PNG com bboxes/âncoras e um contact sheet alinhado')
    args = ap.parse_args()

    os.makedirs(args.outdir, exist_ok=True)
    im = Image.open(args.src).convert('RGBA')
    W, H = im.size
    meta = {'sheet': 'sheet.png', 'width': W, 'height': H, 'cols': args.cols, 'rows': args.rows}

    if args.fx:
        fx0, fy0, fx1, fy1 = (int(v) for v in args.fx.split(','))
        arr = np.array(im)
        region = arr[fy0:fy1, fx0:fx1]
        ys, xs = np.nonzero(region[:, :, 3] > ALPHA_T)
        bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        fx_im = Image.fromarray(region[by0:by1, bx0:bx1].copy())
        fx_im.save(os.path.join(args.outdir, 'special_fx.png'))
        arr[fy0:fy1, fx0:fx1, :] = 0
        im = Image.fromarray(arr)
        meta['fx'] = {'file': 'special_fx.png', 'w': int(bx1 - bx0), 'h': int(by1 - by0)}
        print(f"special_fx.png <- sheet ({fx0 + bx0},{fy0 + by0}) {bx1 - bx0}x{by1 - by0}")

    alpha = np.array(im)[:, :, 3]
    solid = alpha > ALPHA_T

    # rotula em meia resolução (4x mais rápido), depois refina em resolução cheia
    He, We = H - H % 2, W - W % 2
    half = solid[:He, :We].reshape(He // 2, 2, We // 2, 2).any(axis=(1, 3))
    lab_half, n = label(dilate(half, args.dilate) if args.dilate > 0 else half)
    lab_full = np.zeros((H, W), dtype=np.int32)
    lab_full[:He, :We] = np.repeat(np.repeat(lab_half, 2, axis=0), 2, axis=1)

    cw, ch = W / args.cols, H / args.rows
    cells = {}  # (row, col) -> [x0, y0, x1, y1]

    def add(ys, xs):
        cy, cx = ys.mean(), xs.mean()
        key = (min(args.rows - 1, int(cy // ch)), min(args.cols - 1, int(cx // cw)))
        box = [xs.min(), ys.min(), xs.max() + 1, ys.max() + 1]
        if key in cells:
            b = cells[key]
            cells[key] = [min(b[0], box[0]), min(b[1], box[1]), max(b[2], box[2]), max(b[3], box[3])]
        else:
            cells[key] = box

    for i in range(1, n + 1):
        ys, xs = np.nonzero(solid & (lab_full == i))
        if len(xs) == 0:
            continue
        w, h = xs.max() + 1 - xs.min(), ys.max() + 1 - ys.min()
        if w > 1.25 * cw or h > 1.25 * ch:
            parts = split_straddling(ys, xs, cw, ch)
            print(f'AVISO: componente {i} ({w}x{h}) atravessa células; dividido em {len(parts)}', file=sys.stderr)
            for pys, pxs in parts:
                add(pys, pxs)
        else:
            add(ys, xs)

    frames = []
    for r in range(args.rows):
        for c in range(args.cols):
            if (r, c) not in cells:
                print(f'AVISO: célula r{r}c{c} vazia', file=sys.stderr)
                continue
            x0, y0, x1, y1 = (int(v) for v in cells[(r, c)])
            sub = solid[y0:y1, x0:x1]
            band = max(12, int((y1 - y0) * FEET_PCT))
            fys, fxs = np.nonzero(sub[-band:, :])
            ax = float(fxs.mean()) if len(fxs) else (x1 - x0) / 2
            cys, cxs = np.nonzero(sub)
            frames.append({
                'i': len(frames), 'cell': [r, c],
                'sx': x0, 'sy': y0, 'sw': x1 - x0, 'sh': y1 - y0,
                'ax': round(ax, 1), 'cx': round(float(cxs.mean()), 1), 'ay': y1 - y0,
            })

    im.save(os.path.join(args.outdir, 'sheet.png'))
    meta['frames'] = frames
    with open(os.path.join(args.outdir, 'frames.json'), 'w') as f:
        json.dump(meta, f, indent=1)

    for fr in frames:
        print(f"#{fr['i']:2d} r{fr['cell'][0]}c{fr['cell'][1]}  src=({fr['sx']},{fr['sy']}) {fr['sw']}x{fr['sh']}  ax={fr['ax']} cx={fr['cx']} ay={fr['ay']}")

    if args.debug:
        dbg = Image.new('RGBA', im.size, (24, 24, 32, 255))
        dbg.alpha_composite(im)
        d = ImageDraw.Draw(dbg)
        for r in range(1, args.rows):
            d.line([(0, r * ch), (W, r * ch)], fill=(80, 80, 110, 255))
        for c in range(1, args.cols):
            d.line([(c * cw, 0), (c * cw, H)], fill=(80, 80, 110, 255))
        for fr in frames:
            x0, y0 = fr['sx'], fr['sy']
            d.rectangle([x0, y0, x0 + fr['sw'] - 1, y0 + fr['sh'] - 1], outline=(0, 255, 120, 255))
            axx, ayy = x0 + fr['ax'], y0 + fr['ay']
            d.line([(axx, y0), (axx, ayy)], fill=(255, 60, 60, 255))
            d.line([(x0 + fr['cx'], y0), (x0 + fr['cx'], ayy)], fill=(60, 120, 255, 255))
            d.text((x0 + 2, y0 + 2), f"#{fr['i']}", fill=(255, 255, 0, 255))
        dbg.save(args.debug)
        # contact sheet: cada frame numa caixa uniforme, pés na base e eixo (ax) no centro
        B = 320
        sheet = Image.new('RGBA', (B * args.cols, B * args.rows), (24, 24, 32, 255))
        d2 = ImageDraw.Draw(sheet)
        for fr in frames:
            r, c = fr['cell']
            crop = im.crop((fr['sx'], fr['sy'], fr['sx'] + fr['sw'], fr['sy'] + fr['sh']))
            ox, oy = int(c * B + B / 2 - fr['ax']), int(r * B + B - 10 - fr['ay'])
            sheet.alpha_composite(crop, (max(0, ox), max(0, oy)))
            d2.line([(c * B, r * B + B - 10), (c * B + B, r * B + B - 10)], fill=(255, 60, 60, 120))
            d2.line([(c * B + B / 2, r * B), (c * B + B / 2, r * B + B)], fill=(60, 120, 255, 120))
            d2.text((c * B + 4, r * B + 4), f"#{fr['i']} r{r}c{c}", fill=(255, 255, 0, 255))
        cpath = args.debug.replace('.png', '-contact.png')
        sheet.save(cpath)
        print('debug ->', args.debug, '|', cpath)


if __name__ == '__main__':
    main()
