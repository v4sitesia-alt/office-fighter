#!/usr/bin/env python3
"""Prepara as ilustrações de enfrentamento (Personagens/enfrentamento/*.png) pra tela VS:
remove fundo branco ligado às bordas, tira o halo claro do contorno (erosão + suavização do alpha),
recorta justo e salva em public/versus/<id>.png com 760 px de altura."""
import glob, os, sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter
SRC, OUT, HEIGHT = 'Personagens/enfrentamento', 'public/versus', 760
NEAR, DARK_RING = 70, 0.5          # distância máx. (px) até o fundo de fora · fração mínima de traço escuro em volta
sys.path.insert(0, os.path.dirname(__file__))
from sprites import label_runs     # noqa: E402
DEBUG = sys.argv[1] if len(sys.argv) > 1 else None   # pasta pra salvar a conferência (vazados em magenta)

def dilate(m):
    p = np.pad(m, 1)
    return m | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]

for src in sorted(glob.glob(f'{SRC}/*.png')):
    name = os.path.basename(src)[:-4].rstrip('1')
    if name == 'tela-base':
        Image.open(src).convert('RGB').resize((960, 540), Image.LANCZOS).save(f'{OUT}/base.jpg', quality=88); continue
    im = Image.open(src).convert('RGBA'); a = np.array(im); dbg = a[:, :, :3].copy() if DEBUG else None
    if (a[:, :, 3] < 40).mean() < 0.02:
        rgb = im.convert('RGB'); W, H = rgb.size
        seeds = [(x, y) for x in range(0, W, W // 12) for y in (0, H - 1)] + [(x, y) for x in (0, W - 1) for y in range(0, H, H // 12)]
        for sd in seeds:
            if min(rgb.getpixel(sd)) > 232: ImageDraw.floodfill(rgb, sd, (255, 0, 255), thresh=34)
        m = np.array(rgb); outer = (m[:, :, 0] == 255) & (m[:, :, 1] == 0) & (m[:, :, 2] == 255)
        a[outer, 3] = 0
        # vazados: bolsões de fundo branco presos entre mechas de cabelo, debaixo do braço, entre os dedos.
        # É fundo (e não brilho da arte) quando o branco está cercado por traço escuro E fica perto do fundo de fora.
        src_rgb = a[:, :, :3].astype(int); white = (src_rgb.min(axis=2) >= 243) & ~outer
        lab, st = label_runs(white); lum = src_rgb.mean(axis=2)
        near = outer.copy()
        for _ in range(NEAR): near = dilate(near)
        removed = 0
        for i in range(1, (st['n'] if st else 0) + 1):
            if st['area'][i] < 12: continue
            x0, y0, x1, y1 = max(0, st['x0'][i] - 5), max(0, st['y0'][i] - 5), st['x1'][i] + 5, st['y1'][i] + 5
            comp = lab[y0:y1, x0:x1] == i
            if not (comp & near[y0:y1, x0:x1]).any(): continue
            ring = comp.copy()
            for _ in range(4): ring = dilate(ring)
            ring &= ~comp
            if (lum[y0:y1, x0:x1][ring] < 95).mean() >= DARK_RING:
                grown = dilate(comp) & (src_rgb[y0:y1, x0:x1].min(axis=2) >= 225)      # leva junto a franja clara do antialias
                a[y0:y1, x0:x1][grown | comp, 3] = 0; removed += 1
                if dbg is not None: dbg[y0:y1, x0:x1][grown | comp] = (255, 0, 255)
        print(f'   {name}: {removed} vazados removidos')
        im = Image.fromarray(a)
    if name != 'vs':
        alpha = im.getchannel('A').filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(0.8))   # come 2 px de halo e suaviza
        im.putalpha(alpha)
    if DEBUG and name != 'vs': Image.fromarray(dbg).resize((627, 627)).save(f'{DEBUG}/{name}-vazados.jpg', quality=85)
    al = np.array(im)[:, :, 3] > 30; ys, xs = np.nonzero(al)
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    k = HEIGHT / im.height; im = im.resize((round(im.width * k), HEIGHT), Image.LANCZOS)
    im.quantize(256, method=Image.FASTOCTREE, dither=Image.NONE).save(f'{OUT}/{name}.png', optimize=True)   # paleta: 4x menor; print(name, im.size)
