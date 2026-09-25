#!/usr/bin/env python3
"""Golpes novos do Dener (pedido de 2026-09-25): a MAGIA é o braço que vira tentáculo e estica pela tela até agarrar
(Personagens/Mais-movimentos/dener-magia-leve.png, com transparência) e o ESPECIAL é a bocarra de verme que sai do braço e
atravessa a tela (dener-golpe-especial.png, FUNDO PRETO). Os dois são "raios" do jogo (move.beam): começo + trecho que se
repete + ponta, do tamanho da distância até o adversário. O FEEDBACK 360 (o especial antigo) vira o golpe longo.

  python3 tools/dener-golpes.py            # board regular 2x5 com as poses + as peças dos dois raios (public/fighters/dener)
  python3 tools/dener-golpes.py --aplica   # DEPOIS do sprites.py: origem do braço e da boca (relativa aos pés) no fighter.json
  python3 tools/dener-golpes.py --debug pasta   # + conferência (board sobre cinza, peças e os raios montados)

O board sai em Personagens/Mais-movimentos/dener-golpes-novos-board.png e entra no atlas pelo sprites.py como --extra
(frames 35-44; ver tools/sprites-all.sh). Linha 1 = magia (carrega, carrega, braço pronto, recolhe, guarda); linha 2 =
especial (guarda, prepara, a boca nasce na mão x2, braço esticado). Nas poses em que o raio sai, o braço/boca desenhado é
apagado da pose: o jogo desenha as peças por cima, do ombro (magia) ou da mão (especial) até o adversário.

Fundo preto: o terno do Dener também é preto (tem pixel 0,0,0 no terno e na calça), então não dá pra tirar o preto pela
cor. O contorno vermelho fecha o corpo: o que ele cerca é desenho, o que encosta na borda é fundo. Vãos de fundo cercados
pelo desenho (entre a cabeça e o tentáculo, por exemplo) não se distinguem da calça na sombra por número nenhum: vão marcados
à mão em DROPS, conferidos no zoom com o original clareado.
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sprites import label_runs   # noqa: E402

M = 'Personagens/Mais-movimentos'
MAGIA, ESPECIAL = f'{M}/dener-magia-leve.png', f'{M}/dener-golpe-especial.png'
BOARD = f'{M}/dener-golpes-novos-board.png'
OUT = 'public/fighters/dener'
# escala de cada board contra o board principal (dener.png), medida pela largura dos óculos (37 px no principal)
S_MAGIA, S_ESPECIAL = 1.0, 1.05
CELL_W, CELL_H, FLOOR = 340, 250, 16         # célula do board regular (px já na escala do atlas) e folga embaixo dos pés

# ---------- poses: (board, caixa x0,y0,x1,y1 em px do board original, polígonos a apagar, âncora do raio ou None)
# o tentáculo a partir do ombro (vira o raio): só a faixa dele, o topete (até x 180, y < 366) e o pé direito (até x 233) ficam
ARM_CUT = [(172, 376), (182, 366), (245, 356), (245, 424), (172, 424)]
ARM_STUB = [(172, 376), (182, 366), (245, 356), (340, 356), (340, 440), (245, 440), (245, 424), (172, 424)]   # o mesmo tentáculo, até onde a peça vai
# a bocarra depois da mão (vira o raio). Os tentáculos em arco sobre o braço e o fiapo embaixo da mão ficam: são as raízes da
# boca, e a peça do começo cobre o corte (ela nasce na mão e tem 274 px de altura)
MAW_CUT = [[(262, 375), (300, 375), (300, 566), (262, 566)]]
POSES = [
    ('magia', (5, 70, 245, 272), [], None),                     # 35 carrega (aura)
    ('magia', (252, 70, 480, 272), [], None),                   # 36 carrega
    ('magia', (10, 318, 245, 505), [ARM_CUT], (172, 402)),      # 37 braço pronto: o tentáculo sai do ombro (raio da magia)
    ('magia', (660, 535, 862, 736), [], None),                  # 38 recolhe o braço (x 660: faíscas da mão da pose vizinha ficam de fora)
    ('magia', (885, 535, 1115, 736), [], None),                 # 39 guarda
    ('esp', (5, 12, 160, 196), [], None),                       # 40 guarda
    ('esp', (168, 12, 332, 196), [], None),                     # 41 prepara
    ('esp', (335, 12, 515, 196), [], None),                     # 42 a boca nasce na mão
    ('esp', (515, 12, 708, 196), [], None),                     # 43 a boca cresce
    ('esp', (10, 375, 300, 566), MAW_CUT, (240, 478)),          # 44 braço esticado: a bocarra sai do braço e sobe (eixo dela no desenho: y 478)
]
# vãos de fundo cercados pelo desenho, marcados à mão (px do board do especial): o resto do preto cercado é terno/boca
DROPS = [(235, 449), (110, 433), (225, 895), (1182, 897)]

# ---------- peças dos raios: (arquivo, board, caixa, escala da peça, opções)
#   meio: trecho que se repete (as pontas viram uma emenda contínua); fadeR: some aos poucos na emenda com o trecho do meio
PIECES = [
    ('braco-inicio.png', 'magia', (172, 372, 332, 432), 1.0, {'mask': ARM_STUB, 'fadeR': 14}),  # o tentáculo saindo do ombro (da pose 37)
    ('braco-meio.png', 'magia', (300, 983, 700, 1093), 0.47, {'tile': 30}),   # as peças soltas vieram desenhadas ~2x maiores que a pose
    ('mao.png', 'magia', (88, 1125, 560, 1365), 0.5, {}),
    # a boca nas proporções da pose esticada (linha 3 do board): cabeça do começo ~ a altura do Dener, tubo ~ 3/4 dela, mandíbula maior
    ('boca-inicio.png', 'esp', (70, 848, 352, 1128), 0.65, {'fadeR': 16}),
    # tubo de dentes: o bloco + o espelho dele (emenda perfeita nas duas pontas; com emenda cruzada os dentes desencontravam)
    ('boca-meio.png', 'esp', (498, 928, 819, 1048), 1.1, {'mirror': True, 'solid': True}),
    ('boca-fim.png', 'esp', (1028, 850, 1372, 1126), 0.85, {}),        # topo em y 850: a borda da pose de cima fica de fora
]


def dilate(m, r):
    for _ in range(r):
        p = np.pad(m, 1); m = m | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    return m


def erode(m, r):
    for _ in range(r):
        p = np.pad(m, 1, constant_values=True); m = m & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    return m


def unblack(rgb, drops, t=40, r=3):
    """Fundo preto -> alfa. Desenho = contorno claro (V > t) fechado (r px) + tudo o que ele cerca; fora disso o brilho vira
    alfa pela luminosidade (e a cor é desmisturada do preto, senão a borda escurece). `drops`: vãos cercados que são fundo."""
    v = rgb.max(axis=2).astype(np.float32)
    closed = erode(dilate(v > t, r), r)
    lab, _ = label_runs(~closed)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]).tolist())) - {0}
    for x, y in drops:
        k = int(lab[y, x])
        if k == 0: print(f'   aviso: vão {x},{y} cai no contorno, não num vão', file=sys.stderr)
        else: edge.add(k)
    outside = np.isin(lab, list(edge))
    a = np.where(outside, np.clip((v - 4) / (t + 20 - 4), 0, 1), 1.0)
    col = rgb.astype(np.float32); k = np.where(a > 0, a, 1)[..., None]
    col = np.where(outside[..., None], np.clip(col / k, 0, 255), col)
    return np.dstack([col, a * 255]).round().astype(np.uint8)


def poly_mask(shape, polys):
    im = Image.new('L', (shape[1], shape[0]), 0); d = ImageDraw.Draw(im)
    for p in polys: d.polygon(p, fill=255)
    return np.array(im) > 0


def resize(arr, s):
    if abs(s - 1) < 1e-6: return arr
    im = Image.fromarray(arr).convert('RGBa')                       # alfa pré-multiplicado: a borda não escurece nem clareia
    return np.array(im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS).convert('RGBA'))


def boards():
    mag = np.array(Image.open(MAGIA).convert('RGBA'))
    esp = unblack(np.array(Image.open(ESPECIAL).convert('RGB')), DROPS)
    return {'magia': (mag, S_MAGIA), 'esp': (esp, S_ESPECIAL)}


def pose(src, box, cuts):
    x0, y0, x1, y1 = box
    a = src[y0:y1, x0:x1].copy()
    if cuts:
        m = poly_mask(src.shape, [[(x, y) for x, y in p] for p in cuts])[y0:y1, x0:x1]
        a[m] = 0
    return a


def feet_x(a):
    """Centro dos pés: meio do desenho sólido nas últimas linhas (a mesma ideia do sprites.py)."""
    solid = a[:, :, 3] > 150; rows = np.nonzero(solid.any(axis=1))[0]; y1 = rows.max()
    band = solid[max(0, y1 - 12):y1 + 1]; xs = np.nonzero(band.any(axis=0))[0]
    return (xs.min() + xs.max()) / 2, y1


def layout(B):
    """As 10 poses no board regular e onde cada raio nasce (px do board). O --aplica refaz a mesma conta (é determinística)."""
    board = np.zeros((CELL_H * 2, CELL_W * 5, 4), np.uint8); anchors = {}
    for i, (b, box, cuts, anchor) in enumerate(POSES):
        src, s = B[b]
        a = resize(pose(src, box, cuts), s)
        fx, fy = feet_x(a)
        r, c = divmod(i, 5)
        ox = int(round(c * CELL_W + CELL_W / 2 - fx)); oy = int(r * CELL_H + CELL_H - FLOOR - fy)
        ox = max(c * CELL_W + 2, min(ox, (c + 1) * CELL_W - a.shape[1] - 2)); oy = max(r * CELL_H + 2, min(oy, (r + 1) * CELL_H - a.shape[0] - 1))
        reg = board[oy:oy + a.shape[0], ox:ox + a.shape[1]]
        reg[...] = np.where(a[:, :, 3:4] > reg[:, :, 3:4], a, reg)
        if anchor:                                                   # onde o raio nasce, em px do board regular
            anchors[35 + i] = [round(ox + (anchor[0] - box[0]) * s, 1), round(oy + (anchor[1] - box[1]) * s, 1)]
    return board, anchors


def build(debug=None):
    B = boards()
    board, anchors = layout(B)
    Image.fromarray(board).save(BOARD, optimize=True)
    print(f'{BOARD}: 10 poses em 2 linhas de 5 (células de {CELL_W}x{CELL_H}) · âncoras dos raios: {anchors}')
    for name, b, box, s, opt in PIECES:
        src, _ = B[b]; x0, y0, x1, y1 = box
        a = src[y0:y1, x0:x1].copy()
        if opt.get('mask'): a[~poly_mask(src.shape, [opt['mask']])[y0:y1, x0:x1]] = 0
        if opt.get('solid'):                                         # miolo do tubo de dentes: a ponta da faixa é aberta e o fundo entrava na boca
            op = a[:, :, 3] > 200
            for x in range(a.shape[1]):
                ys = np.nonzero(op[:, x])[0]
                if len(ys) > 1: a[ys.min():ys.max() + 1, x, 3] = 255
        a = resize(a, s)
        if opt.get('mirror'): a = np.concatenate([a, a[:, ::-1]], axis=1)
        elif opt.get('tile'):                                         # emenda contínua: o fim funde no começo
            F = max(2, round(opt['tile'] * s)); w = a.shape[1] - F; out = a[:, F:].astype(np.float32)
            head = a[:, :F].astype(np.float32); t = np.linspace(0, 1, F + 2)[1:-1][None, :, None]
            out[:, w - F:] = out[:, w - F:] * (1 - t) + head * t
            a = out.round().astype(np.uint8)
        if not opt.get('mirror') and not opt.get('tile'):             # peça solta: apara as colunas vazias (a altura fica: centro = eixo do raio)
            cols = np.nonzero((a[:, :, 3] > 24).any(axis=0))[0]; a = a[:, cols.min():cols.max() + 1]
        if opt.get('fadeR'):
            n = min(a.shape[1], round(opt['fadeR'] * s)); a = a.copy(); a[:, -n:, 3] = (a[:, -n:, 3] * np.linspace(1, 0, n + 2)[1:-1][None, :]).astype(np.uint8)
        Image.fromarray(a).save(os.path.join(OUT, name), optimize=True)
        print(f'   {name:18s} {a.shape[1]}x{a.shape[0]}')
    if debug: preview(debug, board)


def preview(d, board):
    os.makedirs(d, exist_ok=True)
    bg = Image.new('RGBA', (board.shape[1], board.shape[0]), (90, 110, 90, 255)); bg.alpha_composite(Image.fromarray(board))
    dr = ImageDraw.Draw(bg)
    for k in range(1, 5): dr.line([k * CELL_W, 0, k * CELL_W, board.shape[0]], fill=(255, 255, 0, 120))
    dr.line([0, CELL_H, board.shape[1], CELL_H], fill=(255, 255, 0, 120))
    bg.convert('RGB').save(os.path.join(d, 'dener-golpes-board.png'))
    # os raios montados como o jogo monta (drawBeam, peças sem escala extra), em 3 comprimentos
    P = {n: Image.open(os.path.join(OUT, n)).convert('RGBA') for n, *_ in PIECES}
    for kind, (st, mid, end, at) in {'braco': ('braco-inicio.png', 'braco-meio.png', 'mao.png', 0.72), 'boca': ('boca-inicio.png', 'boca-meio.png', 'boca-fim.png', 0.5)}.items():
        H = max(P[st].height, P[mid].height, P[end].height) + 20; lens = (250, 550, 900)
        out = Image.new('RGBA', (1100, H * len(lens)), (90, 110, 90, 255))
        for r, L in enumerate(lens):
            cy = r * H + H // 2; x0 = 20; xe = x0 + L
            x = x0 + max(0, P[st].width - 12)
            while x < xe:
                w = min(P[mid].width, xe - x); out.alpha_composite(P[mid].crop((0, 0, w, P[mid].height)), (x, cy - P[mid].height // 2)); x += P[mid].width
            sw = min(P[st].width, L); out.alpha_composite(P[st].crop((0, 0, sw, P[st].height)), (x0, cy - P[st].height // 2))
            ex = int(xe - at * P[end].width); cut = max(0, x0 - ex)
            out.alpha_composite(P[end].crop((cut, 0, P[end].width, P[end].height)), (ex + cut, cy - P[end].height // 2))
        out.convert('RGB').save(os.path.join(d, f'raio-{kind}.png'))
    print(f'   conferência em {d}/')


def shoes_x(sheet, fr):
    """Meio dos dois sapatos (o brilho branco do couro nas últimas linhas). Nos quadros antigos bate com o eixo do sprites.py
    (0,1 px); nos novos o eixo dele escorrega até 13 px (a capa e o braço encostam no chão), e o Dener pularia de lado."""
    a = sheet[fr['sy']:fr['sy'] + fr['sh'], fr['sx']:fr['sx'] + fr['sw']].astype(int); band = a[-25:]
    glint = (band[..., 3] > 150) & (band[..., :3].max(axis=2) > 170) & (band[..., :3].min(axis=2) > 120)
    xs = np.nonzero(glint.any(axis=0))[0]
    if len(xs) < 2: return None
    k = int(np.argmax(np.diff(xs))); left, right = xs[:k + 1], xs[k + 1:]
    return round(float(left.mean() + right.mean()) / 2, 1)


def aplica():
    """Depois do sprites.py: eixo dos quadros novos pelos sapatos, e a âncora de cada raio vira beam.x/y relativo aos pés."""
    meta = json.load(open(os.path.join(OUT, 'frames.json'))); F = meta['frames']
    sheet = np.array(Image.open(os.path.join(OUT, 'sheet.png')).convert('RGBA'))
    for i in range(35, 35 + len(POSES)):
        x = shoes_x(sheet, F[i])
        if x is not None: F[i]['ax'] = x
    json.dump(meta, open(os.path.join(OUT, 'frames.json'), 'w'), indent=1)
    _, A = layout(boards())
    d = json.load(open(os.path.join(OUT, 'fighter.json')))
    for move, i in (('special', 37), ('super', 44)):
        fr = F[i]; sx, sy = fr['src']; ax, ay = A[i]
        bx, by = round(ax - (sx + fr['ax']), 1), round(ay - (sy + fr['ay']), 1)
        d['moves'][move]['beam'].update({'x': bx, 'y': by})
        print(f'{move}: frame {i} · raio sai de x {bx}, y {by} (unidades do sprite, a partir dos pés)')
    open(os.path.join(OUT, 'fighter.json'), 'w').write(json.dumps(d, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--aplica', action='store_true'); ap.add_argument('--debug', default=None)
    a = ap.parse_args()
    aplica() if a.aplica else build(a.debug)
