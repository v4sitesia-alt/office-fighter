#!/usr/bin/env python3
"""Cena final (escritório do Mundim, antes da última luta): 10 quadros do Mundim levantando da mesa e vindo até a frente,
com os guardas dourados (guardas.png, fundo branco recortado) parados dos dois lados. Saída: public/cutscene/mundim-01..10.jpg"""
import glob, os, re, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from whiteboard import unwhite
from sprites import label_runs
SRC, OUT = 'Personagens/intro/cena final mundim', 'public/cutscene'
ORDER = [1, 2, 6, 8, 10, 4, 7, 9, 5, 3]      # os arquivos vieram fora de ordem: sentado, levanta, contorna a mesa, vem andando, para na frente, guarda
os.makedirs(OUT, exist_ok=True)
files = {int(re.search(r'\((\d+)\)', f).group(1)): f for f in glob.glob(f'{SRC}/*(*).png')}
g = np.array(Image.open(f'{SRC}/guardas.png').convert('RGB'))
rgba, _ = unwhite(g, (), (), [(0, 0, g.shape[1], g.shape[0])])
lab, st = label_runs(rgba[:, :, 3] > 40); ids = sorted(np.argsort(-st['area'][1:])[:4] + 1, key=lambda k: st['x0'][k])
guards = []
for k in ids:
    x0, y0, x1, y1 = st['x0'][k], st['y0'][k], st['x1'][k], st['y1'][k]; c = rgba[y0:y1, x0:x1].copy(); c[lab[y0:y1, x0:x1] != k] = 0
    guards.append(Image.fromarray(c))
# (guarda, x do centro, y dos pés, altura, espelhado) em px do quadro 1672x941: dois de cada lado do tapete, os de trás menores
SPOTS = [(0, 190, 890, 450, False), (1, 420, 800, 370, False), (2, 1482, 890, 450, True), (3, 1252, 800, 370, True)]
for n, idx in enumerate(ORDER, 1):
    fr = Image.open(files[idx]).convert('RGBA')
    for gi, cx, fy, h, flip in sorted(SPOTS, key=lambda s: s[2]):
        im = guards[gi]; w = round(im.width * h / im.height); im = im.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')
        if flip: im = im.transpose(Image.FLIP_LEFT_RIGHT)
        a = np.array(im).astype(np.float32); a[:, :, :3] *= 0.78; im = Image.fromarray(a.astype(np.uint8))      # luz baixa da sala
        sh = Image.new('RGBA', fr.size, (0, 0, 0, 0)); ell = Image.new('L', (w, 22), 0)
        from PIL import ImageDraw; ImageDraw.Draw(ell).ellipse([0, 0, w - 1, 21], fill=110)
        sh.paste((0, 0, 0, 255), (cx - w // 2, fy - 12), ell); fr.alpha_composite(sh)
        fr.alpha_composite(im, (cx - w // 2, fy - h))
    fr.convert('RGB').resize((960, 540), Image.LANCZOS).save(f'{OUT}/mundim-{n:02d}.jpg', quality=84)
print(len(ORDER), 'quadros em', OUT)
