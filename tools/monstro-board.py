#!/usr/bin/env python3
"""Monta o board 7x5 do monstro do Mundim (A COISA) a partir das tiras de Personagens/Mais-movimentos/metamorfose/ (uma tira de 5 poses por linha).
As tiras vêm em tamanhos e escalas diferentes: cada uma tem o seu fator pra criatura ficar coerente (em pé no andar, curvada nos golpes).
Saída: Personagens/Mais-movimentos/monstro-board.png (fundo branco), que o tools/sprites-all.sh processa como board principal."""
import numpy as np
from PIL import Image
D = 'Personagens/Mais-movimentos/metamorfose/'
ROWS = [('andar.png', 0.48), ('salto-defesa.png', 0.60), ('soco, chute e golpe forte.png', 0.60), ('especial, dano, queda e nocaute..png', 0.45),
        ('golpes no ar, soco no ar, voadora.png', 0.45), ('golpes rasteiros, soco baixo, rasteira chute -linha.png', 0.60), ('golpe-especial.png', 0.60)]
CELL = 400
board = Image.new('RGB', (CELL * 5, CELL * 7), (255, 255, 255))
for r, (fn, k) in enumerate(ROWS):
    im = Image.open(D + fn).convert('RGB'); im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    a = np.array(im); ink = a.min(2) < 235; W = a.shape[1]; cw = W / 5
    prof = np.convolve(ink.sum(0).astype(float), np.ones(5) / 5, mode='same'); cuts = [0]
    for c in range(1, 5):                                          # divisória = coluna mais vazia perto da linha teórica
        lo, hi = int(c * cw - 0.3 * cw), int(c * cw + 0.3 * cw); seg = prof[lo:hi]; low = np.nonzero(seg <= seg.min() + 0.5)[0]
        cuts.append(lo + int(low[np.argmin(np.abs(low + lo - c * cw))]))
    cuts.append(W)
    for c in range(5):
        m = ink[:, cuts[c]:cuts[c + 1]]; ys = np.nonzero(m.sum(1) > 0)[0]; xs = np.nonzero(m.sum(0) > 0)[0]
        pose = im.crop((cuts[c] + xs.min(), ys.min(), cuts[c] + xs.max() + 1, ys.max() + 1))
        assert pose.width <= CELL - 8 and pose.height <= CELL - 8, (fn, c, pose.size)
        board.paste(pose, (c * CELL + (CELL - pose.width) // 2, r * CELL + CELL - 12 - pose.height))
board.save('Personagens/Mais-movimentos/monstro-board.png'); print('monstro-board.png', board.size)
