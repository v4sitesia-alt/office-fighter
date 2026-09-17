#!/usr/bin/env python3
"""Gera o cenário placeholder 'office' em pixel art (desenha em 1/4 e amplia 4x).
Saída: public/stages/office-far.png (parede+janelas), office-mid.png (móveis, transparente),
office-floor.png (piso). Substitua pelos arquivos finais quando a arte sair."""
import os, random
from PIL import Image, ImageDraw
random.seed(7)
W, H = 240, 135          # 960x540 / 4
GROUND = 118             # 470 / 4
out = 'public/stages'; os.makedirs(out, exist_ok=True)

# ---------- fundo: parede, teto, janelas com cidade à noite
far = Image.new('RGBA', (W, H), (0, 0, 0, 255)); d = ImageDraw.Draw(far)
for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=(int(28 + 20 * t), int(30 + 22 * t), int(48 + 30 * t), 255))
# teto com luminárias
d.rectangle([0, 0, W, 14], fill=(22, 24, 36, 255))
for x in range(8, W, 48):
    d.rectangle([x, 4, x + 30, 7], fill=(230, 240, 255, 255))
    d.rectangle([x - 2, 8, x + 32, 9], fill=(120, 140, 200, 255))
# janelas
for wx in (14, 92, 170):
    d.rectangle([wx, 22, wx + 56, 84], fill=(10, 12, 30, 255))
    # céu noturno
    for y in range(23, 84):
        t = (y - 23) / 61
        d.line([(wx + 1, y), (wx + 55, y)], fill=(int(14 + 30 * t), int(10 + 14 * t), int(50 + 40 * t), 255))
    # prédios
    bx = wx + 1
    while bx < wx + 55:
        bw = random.randint(5, 11); bh = random.randint(14, 44)
        d.rectangle([bx, 84 - bh, min(bx + bw, wx + 55), 84], fill=(18, 16, 34, 255))
        for yy in range(86 - bh, 83, 3):
            for xx in range(bx + 1, min(bx + bw, wx + 55), 2):
                if random.random() < 0.35:
                    d.point((xx, yy), fill=random.choice([(255, 220, 120, 255), (255, 200, 90, 255), (180, 220, 255, 255)]))
        bx += bw + 1
    # lua
    if wx == 92:
        d.ellipse([wx + 38, 28, wx + 48, 38], fill=(250, 240, 200, 255))
    # caixilho
    d.rectangle([wx - 2, 20, wx + 58, 86], outline=(150, 160, 180, 255), width=2)
    d.line([(wx + 28, 22), (wx + 28, 84)], fill=(150, 160, 180, 255))
    d.line([(wx, 53), (wx + 56, 53)], fill=(150, 160, 180, 255))
# rodapé + quadro
d.rectangle([0, GROUND - 6, W, GROUND], fill=(60, 62, 82, 255))
d.rectangle([76, 24, 86, 30], fill=(200, 60, 60, 255))  # extintor/placa
far.resize((W * 4, H * 4), Image.NEAREST).save(f'{out}/office-far.png')

# ---------- meio: mesas, monitores, planta, bebedouro (transparente)
mid = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(mid)
def desk(x, w):
    d.rectangle([x, GROUND - 22, x + w, GROUND - 18], fill=(150, 120, 90, 255))
    d.rectangle([x + 2, GROUND - 18, x + 5, GROUND], fill=(90, 70, 55, 255))
    d.rectangle([x + w - 5, GROUND - 18, x + w - 2, GROUND], fill=(90, 70, 55, 255))
    for mx in range(x + 6, x + w - 14, 22):
        d.rectangle([mx, GROUND - 38, mx + 14, GROUND - 26], fill=(30, 32, 40, 255))
        d.rectangle([mx + 1, GROUND - 37, mx + 13, GROUND - 27], fill=random.choice([(60, 140, 220, 255), (90, 200, 160, 255), (220, 120, 60, 255)]))
        d.rectangle([mx + 6, GROUND - 26, mx + 8, GROUND - 22], fill=(60, 60, 70, 255))
desk(6, 60); desk(174, 60)
# bebedouro
d.rectangle([132, GROUND - 30, 142, GROUND], fill=(210, 215, 225, 255))
d.rectangle([133, GROUND - 40, 141, GROUND - 30], fill=(120, 200, 240, 255))
# planta
d.rectangle([100, GROUND - 10, 110, GROUND], fill=(160, 80, 60, 255))
for (px, py, r) in [(105, GROUND - 16, 6), (99, GROUND - 20, 5), (111, GROUND - 22, 5), (105, GROUND - 26, 5)]:
    d.ellipse([px - r, py - r, px + r, py + r], fill=(50, 140, 70, 255))
mid.resize((W * 4, H * 4), Image.NEAREST).save(f'{out}/office-mid.png')

# ---------- piso
fl = Image.new('RGBA', (W, H - GROUND), (0, 0, 0, 0)); d = ImageDraw.Draw(fl)
for y in range(H - GROUND):
    t = y / (H - GROUND)
    d.line([(0, y), (W, y)], fill=(int(70 - 25 * t), int(72 - 25 * t), int(90 - 30 * t), 255))
for y in (0, 6, 13):
    d.line([(0, y), (W, y)], fill=(95, 98, 120, 255))
for x in range(-20, W + 20, 24):
    d.line([(x, 0), (x - 10, H - GROUND)], fill=(95, 98, 120, 255))
fl.resize((W * 4, (H - GROUND) * 4), Image.NEAREST).save(f'{out}/office-floor.png')
print('stage ok')
