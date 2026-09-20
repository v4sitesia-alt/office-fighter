#!/usr/bin/env python3
"""Conferência: frames de um lutador lado a lado, alinhados pelos pés.  python3 tools/strip.py <id> <saida.png> <zoom> <r,g,b> <frames...>"""
import sys, json
from PIL import Image, ImageDraw
fid, out, zoom, bg = sys.argv[1], sys.argv[2], int(sys.argv[3]), tuple(int(t) for t in sys.argv[4].split(','))
d = f'public/fighters/{fid}'; meta = json.load(open(d + '/frames.json')); sheet = Image.open(d + '/sheet.png').convert('RGBA')
frs = [meta['frames'][int(i)] for i in sys.argv[5:]]; frs = [f for f in frs if not f.get('empty')]
H = max(fr['ay'] for fr in frs) + 30; W = sum(fr['sw'] + 24 for fr in frs)
im = Image.new('RGBA', (W, H), bg + (255,)); dr = ImageDraw.Draw(im); x = 12
for fr in frs:
    im.alpha_composite(sheet.crop((fr['sx'], fr['sy'], fr['sx'] + fr['sw'], fr['sy'] + fr['sh'])), (x, H - 14 - fr['ay'])); dr.text((x, 2), '#%d' % fr['i'], fill=(255, 255, 0, 255)); x += fr['sw'] + 24
dr.line([(0, H - 14), (W, H - 14)], fill=(255, 60, 60, 160))
im.convert('RGB').resize((W * zoom, H * zoom), Image.NEAREST).save(out); print(out, (W * zoom, H * zoom))
