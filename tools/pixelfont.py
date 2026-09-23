#!/usr/bin/env python3
"""Fonte pixel do jogo (V4 Pixel): a Press Start 2P com as maiúsculas acentuadas redesenhadas.

A Press Start 2P original encolhe a letra pra caber o acento na célula de 8 pixels (É, Í, Ó, Ú, Ê, Ô, Ã...
ficam com 5 pixels de altura, com cara de minúscula ao lado das outras maiúsculas, que têm 7). Aqui cada uma
volta a ser a letra inteira (a mesma da maiúscula sem acento), com uma linha de respiro e o acento por cima,
fora da célula. As medidas de linha (ascent/descent) não mudam: nenhuma tela muda de tamanho.

Licença: SIL Open Font License 1.1. O nome "Press Start 2P" é reservado, então a versão modificada se chama
V4 Pixel; o copyright original fica no arquivo.

  python3 tools/pixelfont.py      # tools/fonts/PressStart2P-Regular.ttf -> src/fonts/v4-pixel.woff
"""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.pointInsidePen import PointInsidePen
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools/fonts/PressStart2P-Regular.ttf')
OUT = os.path.join(ROOT, 'src/fonts/v4-pixel.woff')      # dentro do src: o Vite empacota com hash e acerta o caminho
PX = 125                       # 1 pixel da fonte = 125 unidades (célula de 8 x 8 em 1000)
TOP = 1000                     # topo da maiúscula (linha 0)
GAP = 1                        # linhas de respiro entre a letra e o acento
FIX = 'ÀÁÂÃÄÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÑ'
BASE = dict(zip(FIX, 'AAAAAEEEEIIIIOOOOOUUUUN'))


def pixels(gs, name):
    """Grade 9 x 8 do glifo (linha 0 = topo da maiúscula), amostrando o centro de cada pixel."""
    rows = []
    for r in range(9):
        y = TOP - PX / 2 - PX * r
        row = []
        for c in range(8):
            pen = PointInsidePen(gs, (PX / 2 + PX * c, y)); gs[name].draw(pen); row.append(pen.getResult())
        rows.append(row)
    return rows


def main():
    f = TTFont(SRC)
    gs, cmap, glyf, hmtx = f.getGlyphSet(), f.getBestCmap(), f['glyf'], f['hmtx']
    top = TOP
    for ch in FIX:
        name, base = cmap[ord(ch)], cmap[ord(BASE[ch])]
        grid = pixels(gs, name)
        accent = [grid[0], grid[1]]                                    # na original, o acento ocupa as 2 linhas de cima
        assert any(accent[0]) or any(accent[1]), ch
        pen = TTGlyphPen(gs)
        gs[base].draw(pen)                                             # a maiúscula inteira, igual à sem acento
        for r, row in enumerate(accent):                               # o acento sobe pra cima da célula, com respiro
            y1 = TOP + PX * (GAP + 2) - PX * r; y0 = y1 - PX
            c = 0
            while c < 8:
                if not row[c]: c += 1; continue
                c0 = c
                while c < 8 and row[c]: c += 1
                x0, x1 = PX * c0, PX * c
                pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()
                top = max(top, y1)
        g = pen.glyph(); g.recalcBounds(glyf)
        glyf[name] = g
        hmtx[name] = (hmtx[name][0], g.xMin)
    f['head'].yMax = max(f['head'].yMax, top)
    # nome novo (o original é nome reservado pela licença) e a licença junto do arquivo
    name = f['name']
    for rec in list(name.names):
        if rec.nameID in (16, 17, 21, 22): name.removeNames(nameID=rec.nameID)
    for pid, eid, lid in {(r.platformID, r.platEncID, r.langID) for r in name.names}:
        for nid, text in ((1, 'V4 Pixel'), (2, 'Regular'), (3, '3.000;V4F;V4Pixel-Regular'), (4, 'V4 Pixel Regular'), (6, 'V4Pixel-Regular'),
                          (10, 'Press Start 2P modified for V4 Fighters: accented capitals redrawn at full cap height.'),
                          (13, 'This Font Software is licensed under the SIL Open Font License, Version 1.1. This license is available with a FAQ at: https://openfontlicense.org'),
                          (14, 'https://openfontlicense.org')):
            name.setName(text, nid, pid, eid, lid)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    f.flavor = 'woff'
    f.save(OUT)
    print(f'{os.path.relpath(OUT, ROOT)}: {os.path.getsize(OUT) // 1024} KB · {len(FIX)} maiúsculas acentuadas redesenhadas ({FIX})')


if __name__ == '__main__':
    main()
