#!/usr/bin/env python3
"""Zoom com grade numerada num pedaço de um board (pra escolher retângulos de --white-erase / --piece).  python3 tools/gridzoom.py board.png x0,y0,x1,y1 zoom saida.png [passo]"""
import sys
from PIL import Image, ImageDraw
src, box, z, out = sys.argv[1], tuple(int(t) for t in sys.argv[2].split(',')), float(sys.argv[3]), sys.argv[4]; step = int(sys.argv[5]) if len(sys.argv) > 5 else 20
im = Image.open(src).convert('RGB'); r = im.crop(box).resize((int((box[2] - box[0]) * z), int((box[3] - box[1]) * z)), Image.NEAREST); d = ImageDraw.Draw(r)
for x in range(box[0] // step * step, box[2], step):
    if x >= box[0]: d.line([((x - box[0]) * z, 0), ((x - box[0]) * z, r.height)], fill=(0, 200, 0) if x % 100 else (255, 0, 0)); d.text(((x - box[0]) * z + 2, 2), str(x), fill=(0, 100, 0))
for y in range(box[1] // step * step, box[3], step):
    if y >= box[1]: d.line([(0, (y - box[1]) * z), (r.width, (y - box[1]) * z)], fill=(0, 200, 0) if y % 100 else (255, 0, 0)); d.text((2, (y - box[1]) * z + 2), str(y), fill=(0, 100, 0))
r.save(out)
