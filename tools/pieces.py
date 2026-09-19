#!/usr/bin/env python3
"""
Peças avulsas de efeito (raio em trechos, estouro) tiradas de uma folha com FUNDO BRANCO, na escala do lutador.

  python3 tools/pieces.py <folha.png> <outdir> --scale 0.55 --fx-hue 0-62 --fx-hue 340-360
        [--wall x,y0,y1] [--keep ...] [--drop ...] [--core x0,y0,x1,y1]
        --piece "nome.png:x0,y0,x1,y1[:fadeL=10][:fadeR=12][:tile]" [--debug mapa.png]

Coordenadas em px da folha original. O recorte é o do tools/whiteboard.py, com dois cuidados próprios de raio:
  --wall x,y0,y1   o raio vem cortado reto nas pontas e o miolo BRANCO encosta direto no fundo: sem isso a inundação
                   entra pelo corte e leva o miolo embora. A "parede" fecha a coluna x (de y0 a y1) só durante o recorte.
  fadeL / fadeR    a ponta da peça some aos poucos (alpha em rampa, em px JÁ NA ESCALA FINAL). O jogo sobrepõe as peças
                   nessa faixa, então a emenda vira uma transição suave em vez de um degrau reto.
  :tile            peça que se repete (trecho do meio): as pontas saem 100% opacas, sem a costura que a reamostragem deixaria.
Cada peça sai centrada na vertical do retângulo pedido (não é aparada em y): peça de raio tem que manter o miolo no meio
pra alinhar com as outras. Em x ela é aparada ao desenho.
"""
import argparse, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from whiteboard import unwhite, parse_geom, parse_hue, check_image   # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('outdir'); ap.add_argument('--scale', type=float, default=1.0)
    for k in ('fx-hue', 'wall', 'keep', 'drop', 'fx-keep', 'fx-drop', 'core', 'piece'): ap.add_argument(f'--{k}', action='append', default=[])
    ap.add_argument('--debug', default=None)
    a = ap.parse_args()
    os.makedirs(a.outdir, exist_ok=True)
    rgb = np.array(Image.open(a.src).convert('RGB')); walled = rgb.copy(); walls = []
    for w in a.wall:
        x, y0, y1 = (int(t) for t in w.split(',')); walled[y0:y1, x] = (255, 0, 0); walls.append((x, y0, y1))
    hues = [parse_hue(r) for r in a.fx_hue]; g = lambda L: [parse_geom(t) for t in L]; rep = []
    rgba, check = unwhite(walled, hues, g(a.keep), g(a.drop), rep, 0, g(a.fx_keep), g(a.fx_drop), g(a.core))
    print('\n'.join(rep))
    for x, y0, y1 in walls: rgba[y0:y1, x] = 0                                     # a parede não é desenho
    if a.debug: check_image(rgb, check).save(a.debug)
    for p in a.piece:
        name, geom, *opt = p.split(':'); x0, y0, x1, y1 = (int(t) for t in geom.split(','))
        tile = 'tile' in opt; opt = [o for o in opt if o != 'tile']
        src = rgba[y0:y1, x0:x1].copy(); PAD = 8
        if tile: src = np.concatenate([np.repeat(src[:, :1], PAD, axis=1), src, np.repeat(src[:, -1:], PAD, axis=1)], axis=1)   # a reamostragem não "vaza" transparência na ponta
        piece = Image.fromarray(src)
        if abs(a.scale - 1) > 1e-6:
            piece = piece.convert('RGBa').resize((max(1, round(piece.width * a.scale)), max(1, round(piece.height * a.scale))), Image.LANCZOS).convert('RGBA')
        arr = np.array(piece)
        if tile: k = int(np.ceil(PAD * a.scale)); arr = arr[:, k:arr.shape[1] - k]
        else: cols = np.nonzero((arr[:, :, 3] > 24).any(axis=0))[0]; arr = arr[:, cols.min():cols.max() + 1]   # apara só em x
        for o in opt:
            k, v = o.split('='); n = int(v); ramp = np.linspace(0, 1, n + 2)[1:-1]
            if k == 'fadeL': arr[:, :n, 3] = (arr[:, :n, 3] * ramp[None, :]).astype(np.uint8)
            if k == 'fadeR': arr[:, -n:, 3] = (arr[:, -n:, 3] * ramp[::-1][None, :]).astype(np.uint8)
        Image.fromarray(arr).save(os.path.join(a.outdir, name)); print(f'   {name}: {arr.shape[1]}x{arr.shape[0]}')


if __name__ == '__main__':
    main()
