#!/usr/bin/env python3
"""Prepara as ilustrações de enfrentamento (Personagens/enfrentamento/*.png) pra tela VS:
remove fundo branco ligado às bordas, tira o halo claro do contorno (erosão + suavização do alpha),
recorta justo e salva em public/versus/<id>.png com 760 px de altura."""
import glob, os, numpy as np
from PIL import Image, ImageDraw, ImageFilter
SRC, OUT, HEIGHT = 'Personagens/enfrentamento', 'public/versus', 760
for src in sorted(glob.glob(f'{SRC}/*.png')):
    name = os.path.basename(src)[:-4].rstrip('1')
    if name == 'tela-base':
        Image.open(src).convert('RGB').resize((960, 540), Image.LANCZOS).save(f'{OUT}/base.jpg', quality=88); continue
    im = Image.open(src).convert('RGBA'); a = np.array(im)
    if (a[:, :, 3] < 40).mean() < 0.02:
        rgb = im.convert('RGB'); W, H = rgb.size
        seeds = [(x, y) for x in range(0, W, W // 12) for y in (0, H - 1)] + [(x, y) for x in (0, W - 1) for y in range(0, H, H // 12)]
        for sd in seeds:
            if min(rgb.getpixel(sd)) > 232: ImageDraw.floodfill(rgb, sd, (255, 0, 255), thresh=34)
        m = np.array(rgb); a[(m[:, :, 0] == 255) & (m[:, :, 1] == 0) & (m[:, :, 2] == 255), 3] = 0
        im = Image.fromarray(a)
    if name != 'vs':
        alpha = im.getchannel('A').filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(0.8))   # come 2 px de halo e suaviza
        im.putalpha(alpha)
    al = np.array(im)[:, :, 3] > 30; ys, xs = np.nonzero(al)
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    k = HEIGHT / im.height; im = im.resize((round(im.width * k), HEIGHT), Image.LANCZOS)
    im.quantize(256, method=Image.FASTOCTREE, dither=Image.NONE).save(f'{OUT}/{name}.png', optimize=True)   # paleta: 4x menor; print(name, im.size)
