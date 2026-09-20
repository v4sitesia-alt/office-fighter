#!/usr/bin/env python3
"""Rosto de cada lutador (public/fighters/<id>/face.png, 128x128), recortado do retrato com moldura.
Usado nas telas da arena (grade compacta do draft, chips de jogador, chave do campeonato).
Caixa = (x0, y0, lado) em fração do retrato. Lutador novo: acrescente a linha e rode `python3 tools/faces.py [contato.png]`."""
import sys
from PIL import Image

BOX = {
    'edgard': (0.25, 0.04, 0.46), 'laura': (0.25, 0.10, 0.50), 'landim': (0.31, 0.08, 0.42), 'eneias': (0.29, 0.01, 0.42),
    'santana': (0.19, 0.03, 0.50), 'michael': (0.17, 0.04, 0.46), 'dede': (0.27, 0.02, 0.50), 'van': (0.19, 0.10, 0.46),
    'kevin': (0.25, 0.04, 0.46), 'crm': (0.23, 0.08, 0.46), 'leo': (0.21, 0.12, 0.54), 'dias': (0.25, 0.02, 0.46),
    'xablau': (0.25, 0.06, 0.50), 'mundim': (0.27, 0.06, 0.42), 'dener': (0.21, 0.15, 0.54),
}
out = []
for fid, (x, y, s) in BOX.items():
    im = Image.open(f'public/fighters/{fid}/portrait.png').convert('RGBA'); w, h = im.size; side = s * min(w, h)
    face = im.crop((int(x * w), int(y * h), int(x * w + side), int(y * h + side))).resize((128, 128), Image.LANCZOS)
    face.save(f'public/fighters/{fid}/face.png', optimize=True); out.append(face)
if len(sys.argv) > 1:
    sheet = Image.new('RGB', (128 * 5, 128 * 3), (20, 20, 30))
    for k, f in enumerate(out): sheet.paste(f, ((k % 5) * 128, (k // 5) * 128), f)
    sheet.save(sys.argv[1])
