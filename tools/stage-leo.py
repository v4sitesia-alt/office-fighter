#!/usr/bin/env python3
"""Cenário do Leo (elevador): plataforma com o fundo branco recortado na frente + fundo que desce em loop.
Saída em public/stages/: leo-front.png (960x540, transparente), leo-scroll.jpg (960x1080: o padrão + ele espelhado,
pra emendar sem costura) e leo.png (composição parada, usada no manual e como reserva)."""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from whiteboard import unwhite
SRC, OUT, W, H, DROP = 'Personagens/Mais-movimentos/cenario-leo', 'public/stages', 960, 540, 131   # DROP: desce a plataforma pra os pés (y=470) caírem no deck
rgb = np.array(Image.open(f'{SRC}/plataforma.png').convert('RGB'))
rgba, _ = unwhite(rgb, (), (), [(0, 0, rgb.shape[1], rgb.shape[0])])          # todo branco sai, inclusive os vãos da tela da cerca
plat = Image.fromarray(rgba).convert('RGBa').resize((W, H), Image.LANCZOS).convert('RGBA')
front = Image.new('RGBA', (W, H), (0, 0, 0, 0))
front.alpha_composite(plat.crop((0, 0, W, H - DROP)), (0, DROP))
front.alpha_composite(plat.crop((0, 0, W, DROP)), (0, 0))                     # correntes e colunas continuam até o teto
front.save(f'{OUT}/leo-front.png', optimize=True)
pat = Image.open(f'{SRC}/fundo-pattern.png').convert('RGB').resize((W, H), Image.LANCZOS)
scroll = Image.new('RGB', (W, H * 2)); scroll.paste(pat, (0, 0)); scroll.paste(pat.transpose(Image.FLIP_TOP_BOTTOM), (0, H))
scroll.save(f'{OUT}/leo-scroll.jpg', quality=86)
still = pat.convert('RGBA'); still.alpha_composite(front); still.convert('RGB').save(f'{OUT}/leo.png', optimize=True)
print('leo-front.png, leo-scroll.jpg, leo.png')
