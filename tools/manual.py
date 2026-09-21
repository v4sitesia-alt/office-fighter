#!/usr/bin/env python3
"""Gera o MANUAL DO JOGADOR (public/manual.html), com cara de manual de cartucho/fliperama, e os recortes de sprite e
miniaturas que ele usa (public/manual/). Tudo vem dos dados do jogo, então nomes, golpes, danos e enredo ficam sempre em dia:
  src/data/roster.ts      ROSTER, SECRET e LOCKED. O lutador secreto NUNCA aparece no manual (nem nome, nem imagem, nem
                          pista com nome). Dos travados, o manual só diz quem começa travado e quem sai zerando o arcade:
                          os códigos de LOCKED nunca são escritos (a trava de segurança do build() confere)
  public/fighters/<id>/   fighter.json (nome, papel, frase, bio, atributos, golpes) + frames.json/sheet.png (recortes)
  src/data/story.json     o enredo, contado uma vez só: acts + timeline (a linha do tempo dividida nos atos), factions,
                          glossary, fighters[id].links (a teia) e sequel (a contracapa). Chave que faltar some do manual:
                          nenhum enredo é escrito aqui
  src/data/places.json    lugares do Vale Quatro
  src/game/*.ts, src/main.ts, src/net/*.ts, src/ui/*.ts   números das regras (tempo, troca, vagas, bônus, CPU...)
Uso: python3 tools/manual.py   (ou npm run manual)"""
import html
import json
import math
import os
import re

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
OUT = os.path.join(PUB, 'manual')
YEAR = '2026'


def rd(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()


def jl(p):
    return json.loads(rd(p))


def rd_opt(p):
    try:
        return rd(p)
    except OSError:
        return ''


def grab(text, pattern, cast=int, default=None):
    """Um número tirado do código do jogo (regra que muda lá, muda aqui). Sem achar, fica o padrão."""
    m = re.search(pattern, text)
    try:
        return cast(m.group(1)) if m else default
    except (TypeError, ValueError):
        return default


def ts_list(text, name):
    m = re.search(r'export const ' + name + r'\s*=\s*\[(.*?)\]', text, re.S)
    return re.findall(r"'([\w-]+)'", m.group(1)) if m else []


# ---------------------------------------------------------------- dados do jogo
_ROSTER_TS = rd('src/data/roster.ts')
SECRET = ts_list(_ROSTER_TS, 'SECRET')
ROSTER = [i for i in ts_list(_ROSTER_TS, 'ROSTER') if i not in SECRET]
STORY = jl('src/data/story.json')
_PL = jl('src/data/places.json')
STATE, PLACES = _PL.get('state', 'VALE QUATRO'), _PL.get('places', {})
F = {i: jl(f'public/fighters/{i}/fighter.json') for i in ROSTER}
MORPH = {i: F[i]['morph'] for i in ROSTER if F[i].get('morph')}          # mundim -> monstro (2º round)
for _m in MORPH.values():
    F[_m] = jl(f'public/fighters/{_m}/fighter.json')
MORPH_OF = {v: k for k, v in MORPH.items()}
S_FIGHTERS = STORY.get('fighters', {}) or {}


def _locked():
    """Quem começa travado (LOCKED em roster.ts) e se sai zerando o arcade. Só o id e o byArcade: os códigos ficam lá."""
    m = re.search(r'export const LOCKED[^=]*=\s*\{(.*?)\n\};', _ROSTER_TS, re.S)
    return {i: a == 'true' for i, a in re.findall(r'(\w+):\s*\{[^{}]*?byArcade:\s*(true|false)', m.group(1) if m else '')}


_LOCKED_ALL = _locked()
LOCKED = [i for i in ROSTER if i in _LOCKED_ALL]                          # o secreto não entra: ele não existe no manual
BY_ARCADE = [i for i in LOCKED if _LOCKED_ALL[i]]

MATCH_TS, MAIN_TS, CONSTS_TS = rd_opt('src/game/match.ts'), rd_opt('src/main.ts'), rd_opt('src/game/consts.ts')
LOBBY_TS, SQUAD_TS, AI_TS = rd_opt('src/net/lobby.ts'), rd_opt('src/net/squad.ts'), rd_opt('src/game/ai.ts')
INVITES_TS, SCHEMA = rd_opt('src/net/invites.ts'), rd_opt('supabase/schema.sql')

ROUND_S = grab(CONSTS_TS, r'ROUND_SECONDS\s*=\s*(\d+)', int, 60)
BLOCK_PCT = round(100 * grab(CONSTS_TS, r'BLOCK_DAMAGE\s*=\s*([\d.]+)', float, .25))
TAG_COOL = round(grab(MATCH_TS, r'COOL:\s*(\d+)', int, 180) / 60)
TAG_CAP = grab(MATCH_TS, r'REGEN_CAP:\s*(\d+)', int, 25)
TAG_TIME = round(ROUND_S * grab(MATCH_TS, r'ROUND_SECONDS \* 60 \* ([\d.]+)', float, 1.65))
BONUS = {'VITÓRIA': grab(MATCH_TS, r"\['VITÓRIA', (\d+)\]", int, 1000), 'VIDA': grab(MATCH_TS, r"\['VIDA', Math\.round\(w\.life\) \* (\d+)\]", int, 30),
         'TEMPO': grab(MATCH_TS, r"this\.seconds \* (\d+)\]", int, 50), 'PERFECT': grab(MATCH_TS, r"\['PERFECT', (\d+)\]", int, 5000)}
PER_DMG = grab(MATCH_TS, r'Math\.round\(d \* (\d+)\)', int, 10)
MAX_PEERS = grab(LOBBY_TS, r'MAX_PEERS\s*=\s*(\d+)', int, 15)
CUP_MAX = grab(LOBBY_TS, r'CUP = \{ MAX:\s*(\d+)', int, 10)
CUP_COUNT = round(grab(LOBBY_TS, r'COUNT_MS:\s*(\d+)', int, 10000) / 1000)
CONFIRM_S = round(grab(SQUAD_TS, r'CONFIRM_MS:\s*(\d+)', int, 12000) / 1000)
DRAFT_S = round(grab(SQUAD_TS, r'DRAFT_MS:\s*(\d+)', int, 45000) / 1000)
INVITE_S = round(grab(INVITES_TS, r'INVITE_TTL\s*=\s*(\d+)', int, 30000) / 1000)
_pts = [int(x) for x in re.findall(r'points = players\.points \+ (\d+)', SCHEMA)]
WIN_PTS, LOSS_PTS = (_pts + [3, 1])[:2] if len(_pts) >= 2 else (3, 1)
RIVALS = grab(MAIN_TS, r'\.slice\(0, (\d+)\)', int, 4)
_b = re.search(r"const bosses = \[([^\]]+)\]", MAIN_TS)
BOSSES = [i for i in (re.findall(r"'(\w+)'", _b.group(1)) if _b else ['dias', 'leo', 'xablau', 'mundim']) if i in F and i in ROSTER]
# a CPU do arcade: a rampa é fixa (a tela de dificuldade não está no fluxo), então o manual descreve o que ela faz, sem rótulo
_dr = re.search(r'DIFF_RAMP[^=]*=\s*\[(.*?)\];', MAIN_TS, re.S)
_ramps = [re.findall(r"'(\w+)'", x) for x in re.findall(r'\[([^\[\]]+)\]', _dr.group(1))] if _dr else []
_cur = grab(MAIN_TS, r"let difficulty: Difficulty = '(\w+)'", str, 'normal')
RAMP = _ramps[['easy', 'normal', 'hard'].index(_cur)] if len(_ramps) == 3 and _cur in ('easy', 'normal', 'hard') else ['normal', 'normal', 'hard', 'hard']


def _ai(level):
    m = re.search(level + r':\s*\{([^}]*)\}', AI_TS)
    return dict(re.findall(r'(\w+):\s*([\d.]+|true|false)', m.group(1))) if m else {}


AI = {lv: _ai(lv) for lv in ('easy', 'normal', 'hard')}
_mf = MATCH_TS.split('export const MORPH')[1].split('];')[0] if 'export const MORPH' in MATCH_TS else ''
MORPH_FRAMES = [int(x) for x in re.findall(r'frame:\s*(\d+)', _mf)]
MORPH_MSGS = re.findall(r"t === \d+\) this\.ev\.message\('([^']+)'", MATCH_TS)
try:
    TRACKS = set(jl('public/audio/music/tracks.json'))
except (OSError, ValueError):
    TRACKS = set()


def has_music(fid):
    """A mesma conta do trackOf (main.ts): a faixa do lutador ou a de quem divide o cenário com ele."""
    return f'fighter-{fid}' in TRACKS or any(F[o].get('stage') == F[fid].get('stage') and f'fighter-{o}' in TRACKS for o in ROSTER)


def _starter():
    """Pra primeira vez: quem tem os atributos mais perto de 1,00 (fora os travados e os chefes)."""
    pool = [i for i in ROSTER if i not in LOCKED and i not in BOSSES] or ROSTER
    return min(pool, key=lambda i: (sum(abs(F[i]['stats'].get(k, 1) - 1) for k in ('power', 'speed', 'magic', 'weight')), ROSTER.index(i)))


STARTER = _starter()


def _card_order():
    """Fichas e grade na mesma ordem: a gente comum primeiro (o lutador pra começar na frente), os chefes por último."""
    rank = {b: k for k, b in enumerate(BOSSES)}
    out = []
    for key in ('heroi', 'neutro', 'vilao'):
        ids = [i for i in ROSTER if F[i].get('side', 'heroi') == key]
        out += sorted(ids, key=lambda i: (i != STARTER, i in rank, rank.get(i, -1), ROSTER.index(i)))
    return out + [i for i in ROSTER if i not in out]


ORDER = _card_order()

# ---------------------------------------------------------------- filtros de texto
# 1) o lutador secreto não existe no manual  2) o ano é 2026
_words = set()
for _s in SECRET:
    _words.add(_s)
    try:
        _words.add(jl(f'public/fighters/{_s}/fighter.json')['name'])
    except (OSError, KeyError, ValueError):
        pass
    if (S_FIGHTERS.get(_s) or {}).get('nick'):
        _words.add(S_FIGHTERS[_s]['nick'])
SECRET_RE = re.compile(r'(?<!\w)(' + '|'.join(sorted(map(re.escape, _words), key=len, reverse=True)) + r')(?!\w)', re.I) if _words else None
OLD_YEAR = re.compile(r'\b19\d[xX]\b')
SENT = re.compile(r'(?<=[.!?…])\s+')
TAGS = ('b', 'i', 'em', 'strong')


def scrub(t):
    t = OLD_YEAR.sub(YEAR, str(t or ''))
    keep = []
    for s in SENT.split(t):
        if SECRET_RE and SECRET_RE.search(re.sub(r'<[^>]*>', '', s)):
            continue
        keep.append(s)
    return ' '.join(keep).strip()


def rich(t):
    """Texto do story.json com <b>/<i>: só essas marcações passam; frase que cair no filtro some inteira."""
    s = html.escape(scrub(t), quote=False)
    for g in TAGS:
        s = s.replace(f'&lt;{g}&gt;', f'<{g}>').replace(f'&lt;/{g}&gt;', f'</{g}>')
    s = re.sub(r'&lt;br\s*/?&gt;', '<br>', s)
    for g in TAGS:
        if s.count(f'<{g}>') != s.count(f'</{g}>'):
            s = s.replace(f'<{g}>', '').replace(f'</{g}>', '')
    return s


def plain(t):
    return html.escape(scrub(t), quote=False)


def attr(t):
    return html.escape(re.sub(r'<[^>]*>', '', scrub(t)), quote=True)


def num(v):
    return f'{v:.2f}'.replace('.', ',')


# ---------------------------------------------------------------- imagens (recortes e miniaturas em public/manual/)
os.makedirs(OUT, exist_ok=True)
MADE = {}
_SHEETS = {}
LANCZOS = Image.Resampling.LANCZOS


def _save(im, fn, fmt='PNG8', q=80):
    path = os.path.join(OUT, fn)
    if fmt == 'PNG8':      # arte em pixel: 256 cores sem pontilhado fica igual ao original e pesa 1/4
        im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(path, optimize=True)
    elif fmt == 'JPEG':
        im.convert('RGB').save(path, 'JPEG', quality=q, optimize=True, progressive=True)
    else:
        im.save(path, 'WEBP', quality=q, method=4)
    MADE[fn] = im.size


def _out(fn):
    w, h = MADE[fn]
    return 'manual/' + fn, w, h


def sprite(fid, frame, tag, maxd=300):
    """Recorta um quadro do atlas (frames.json) e salva só ele: a página nunca carrega o sheet.png inteiro."""
    fn = f'{fid}-{tag}.png'
    if fn not in MADE:
        if fid not in _SHEETS:
            _SHEETS[fid] = (Image.open(os.path.join(PUB, 'fighters', fid, 'sheet.png')).convert('RGBA'), jl(f'public/fighters/{fid}/frames.json')['frames'])
        sh, frames = _SHEETS[fid]
        f = frames[frame]
        im = sh.crop((f['sx'], f['sy'], f['sx'] + f['sw'], f['sy'] + f['sh']))
        bb = im.getchannel('A').point(lambda a: 255 if a > 10 else 0).getbbox()
        if bb:
            im = im.crop(bb)
        k = min(1.0, maxd / max(im.size))
        if k < 1:
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), LANCZOS)
        _save(im, fn)
    return _out(fn)


def art(fid, h=440):
    p = os.path.join(PUB, 'versus', f'{fid}.png')
    if not os.path.exists(p):
        return None
    fn = f'{fid}-art.webp'
    if fn not in MADE:
        im = Image.open(p).convert('RGBA')
        if im.height > h:
            im = im.resize((round(im.width * h / im.height), h), LANCZOS)
        _save(im, fn, 'WEBP', 82)
    return _out(fn)


def face(fid):
    fn = f'{fid}-face.png'
    if fn not in MADE:
        im = Image.open(os.path.join(PUB, 'fighters', fid, 'face.png')).convert('RGBA')
        if im.width > 128:
            im = im.resize((128, round(im.height * 128 / im.width)), LANCZOS)
        _save(im, fn)
    return _out(fn)


def stage(name, w=640, q=72):
    fn = f'stage-{name}.jpg' if w == 640 else f'stage-{name}-{w}.jpg'
    if fn not in MADE:
        p = os.path.join(PUB, 'stages', f'{name}.png')
        if not os.path.exists(p):
            return stage('office', w, q) if name != 'office' else ('', 1, 1)
        im = Image.open(p).convert('RGB')
        im = im.resize((w, round(im.height * w / im.width)), LANCZOS)
        _save(im, fn, 'JPEG', q)
    return _out(fn)


def has_stage(name):
    return bool(name) and os.path.exists(os.path.join(PUB, 'stages', f'{name}.png'))


def picture(rel, fn, w, q=76):
    if fn not in MADE:
        im = Image.open(os.path.join(PUB, rel)).convert('RGB')
        if im.width > w:
            im = im.resize((w, round(im.height * w / im.width)), LANCZOS)
        _save(im, fn, 'JPEG', q)
    return _out(fn)


def img(src, alt='', cls='px', lazy=True, style=''):
    if not src:
        return ''
    u, w, h = src
    extra = ' loading="lazy"' if lazy else ''
    st = f' style="{style}"' if style else ''
    return f'<img class="{cls}" src="{u}" width="{w}" height="{h}" alt="{attr(alt)}"{extra} decoding="async"{st}>'


# qual quadro de cada golpe vai pro cartão (fase, posição); o que não estiver aqui usa o 1º quadro da fase ativa
PICK = {
    'edgard': {'special': ('startup', -1)},
    'laura': {'special': ('throw', 0)},
    'landim': {'super': ('startup', 0)},
    'eneias': {'long': ('active', -1)},
    'santana': {'long': ('active', -1)},
    'michael': {'super': ('active', -1), 'long': ('active', -1)},
    'dede': {'special': ('startup', -1), 'long': ('active', -1)},
    'van': {'special': ('startup', 0)},
    'kevin': {'long': ('active', -1)},
    'crm': {'long': ('startup', -1)},
    'leo': {'super': ('startup', -1)},
    'dias': {'long': ('active', -1)},
    'mundim': {'special': ('startup', -1), 'super': ('startup', -1)},
    'monstro': {'super': ('hold', 0)},
}


def pose(fid, key):
    """Quadro de uma animação (idle, walk, jump...) ou de um golpe, recortado."""
    A, M = F[fid]['anims'], F[fid]['moves']

    def at(lst, i):
        return lst[i] if -len(lst) <= i < len(lst) else lst[0]
    if key == 'jump2':
        fr = at(A['jump']['frames'], 1)
    elif key == 'walk':
        fr = at(A['walk']['frames'], 1)
    elif key == 'win':
        fr = at(A['win']['frames'], 2)
    elif key in A:
        fr = A[key]['frames'][0]
    elif key in M:
        ph, ix = PICK.get(fid, {}).get(key, ('active', 0))
        P = M[key]['phases']
        fr = at(P.get(ph) or P['active'], ix)
    else:
        return None
    return sprite(fid, fr, key)


# ---------------------------------------------------------------- ícones (SVG inline: um <symbol> por ícone, reusado com <use>)
BTN = {'G': ('#e5383b', '#ff8e8f', '#8a1416', 'SOCO', 'vermelho'), 'H': ('#f2b705', '#ffe27a', '#946c00', 'CHUTE', 'amarelo'),
       'J': ('#2bb673', '#86efbd', '#12663c', 'FORTE', 'verde'), 'V': ('#3f7ae0', '#9cc0ff', '#1b3f85', 'DEFESA', 'azul'),
       'B': ('#9257e6', '#cfb0ff', '#4d2590', 'ESPECIAL', 'roxo'), 'T': ('#e9eef7', '#ffffff', '#7b8597', 'TROCA', 'branco')}
DIRS = {'n': (None, 'manche solto, no meio'), 'r': (0, 'manche pra frente, na direção do adversário'), 'dr': (45, 'manche na diagonal pra baixo e pra frente'),
        'd': (90, 'manche pra baixo'), 'dl': (135, 'manche na diagonal pra baixo e pra trás'), 'l': (180, 'manche pra trás, pra longe do adversário'),
        'ul': (225, 'manche na diagonal pra cima e pra trás'), 'u': (270, 'manche pra cima'), 'ur': (315, 'manche na diagonal pra cima e pra frente')}
SYMS = {}
PIXF = "font-family=\"'Press Start 2P',monospace\""


def _sym(sid, build):
    if sid not in SYMS:
        SYMS[sid] = build()
    return sid


def _sym_btn(L):
    c, hi, lo = BTN[L][:3]
    txt = ' fill="#1a2233"' if L == 'T' else ' fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke"'
    return (f'<symbol id="b{L}" viewBox="0 0 64 64"><ellipse cx="32" cy="37" rx="30" ry="25.5" fill="#000"/>'
            f'<ellipse cx="32" cy="35.5" rx="27.5" ry="23" fill="{lo}"/>'
            f'<ellipse cx="32" cy="29" rx="27.5" ry="23" fill="url(#g{L})" stroke="#000" stroke-width="2.5"/>'
            f'<ellipse cx="23" cy="19.5" rx="10" ry="5" fill="#fff" opacity=".55"/>'
            f'<text x="32" y="39.5" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="27"{txt}>{L}</text></symbol>')


def _sym_stick(d):
    """Manche: a bola sai 10 unidades do centro e a seta tem cabeça grande, pra diagonal não parecer reta no tamanho pequeno."""
    a = DIRS[d][0]
    bx = by = 40.0
    arrow = ''
    if a is not None:
        r = math.radians(a)
        bx, by = 40 + 10 * math.cos(r), 40 + 10 * math.sin(r)
        arrow = (f'<path transform="rotate({a} 40 40)" d="M81 40 L64 25 L64 33 L56 33 L56 47 L64 47 L64 55 Z" '
                 'fill="#ffd23f" stroke="#000" stroke-width="2.8" stroke-linejoin="round"/>')
    return (f'<symbol id="s{d}" viewBox="0 0 80 80"><circle cx="40" cy="40" r="23" fill="#2a3242" stroke="#000" stroke-width="3"/>'
            '<circle cx="40" cy="40" r="17" fill="#0b0e15"/>'
            f'<line x1="40" y1="40" x2="{bx:.1f}" y2="{by:.1f}" stroke="#9aa3b3" stroke-width="7" stroke-linecap="round"/>'
            f'<circle cx="{bx:.1f}" cy="{by:.1f}" r="13" fill="url(#gBall)" stroke="#000" stroke-width="2.5"/>'
            f'<ellipse cx="{bx - 4:.1f}" cy="{by - 5:.1f}" rx="5" ry="3" fill="#fff" opacity=".65"/>{arrow}</symbol>')


ARROW_D = 'M26 11 L37 24 L30.5 24 L30.5 34 L21.5 34 L21.5 24 L15 24 Z'


def _sym_key(sid, label, wide, dot):
    w = 104 if wide else 52
    body = (f'<symbol id="{sid}" viewBox="0 0 {w} 52"><rect x="3" y="8" width="{w - 6}" height="41" rx="8" fill="#8c93a3" stroke="#000" stroke-width="2.5"/>'
            f'<rect x="3" y="3" width="{w - 6}" height="39" rx="8" fill="url(#gKey)" stroke="#000" stroke-width="2.5"/>'
            f'<rect x="9" y="7" width="{w - 18}" height="28" rx="5" fill="none" stroke="#fff" stroke-width="1.6" opacity=".9"/>')
    rot = {'↑': 0, '→': 90, '↓': 180, '←': 270}
    if label in rot:
        body += f'<path transform="rotate({rot[label]} 26 23)" d="{ARROW_D}" fill="#16141f"/>'
    else:
        font = PIXF if len(label) == 1 else 'font-family="Silkscreen,monospace"'
        body += f'<text x="{w / 2:.0f}" y="{29.5 if len(label) == 1 else 30}" text-anchor="middle" {font} font-size="{16 if len(label) == 1 else 19}" fill="#16141f">{html.escape(label)}</text>'
    if dot:
        body += f'<circle cx="{w - 13}" cy="12" r="4.5" fill="{dot}" stroke="#000" stroke-width="1.5"/>'
    return body + '</symbol>'


def _sym_pill():
    """START e PAUSE são dois botões redondos e cinza, iguais; o nome fica fora, embaixo (como no gabinete do jogo)."""
    return ('<symbol id="pill" viewBox="0 0 48 48"><circle cx="24" cy="27" r="19" fill="#2a303c" stroke="#000" stroke-width="2.5"/>'
            '<circle cx="24" cy="23" r="19" fill="url(#gPill)" stroke="#000" stroke-width="2.5"/>'
            '<ellipse cx="18" cy="15.5" rx="7" ry="4" fill="#fff" opacity=".7"/></symbol>')


def _sym_meter(lv):
    """As duas barrinhas do canto de baixo, como na tela: a azul (MAGIA) em cima, a amarela (SUPER) embaixo. Sem texto dentro."""
    fill = {'q': .25, 'h': .5, 'f': 1.0}[lv]
    top, bot = min(fill, .5) * 2, max(0.0, fill - .5) * 2
    s = f'<symbol id="m{lv}" viewBox="0 0 110 46"><rect x="3" y="3" width="104" height="16" fill="#0b1d46" stroke="#000" stroke-width="3"/>'
    if top:
        s += f'<rect x="4.5" y="4.5" width="{101 * top:.1f}" height="13" fill="url(#gM1)"/>'
    if top >= 1:
        s += '<rect x="3" y="3" width="104" height="16" fill="none" stroke="#fff" stroke-width="2"/>'
    s += '<rect x="3" y="22" width="104" height="21" fill="#3b3000" stroke="#000" stroke-width="3"/>'
    if bot:
        s += '<rect x="4.5" y="23.5" width="101" height="18" fill="#ffd400"/>'
    return s + '</symbol>'


def _sym_air():
    return ('<symbol id="air" viewBox="0 0 64 64"><rect x="3" y="3" width="58" height="58" rx="10" fill="#bfe6ff" stroke="#000" stroke-width="3"/>'
            '<path d="M8 54 H56" stroke="#000" stroke-width="3"/><path d="M13 53 Q32 6 51 53" fill="none" stroke="#1b3f85" stroke-width="2.6" stroke-dasharray="4 4"/>'
            '<circle cx="32" cy="12" r="4.6" fill="#000"/><path d="M32 17 V27 M25 20 L39 21 M32 27 L26 34 M32 27 L38 33" stroke="#000" stroke-width="3.2" stroke-linecap="round" fill="none"/></symbol>')


def _sym_burst():
    pts = []
    n = 18
    for k in range(n * 2):
        r = 58 if k % 2 == 0 else (42 if k % 4 == 1 else 46)
        a = math.pi * k / n - math.pi / 2
        pts.append(f'{60 + r * math.cos(a):.1f},{60 + r * math.sin(a):.1f}')
    return f'<symbol id="burst" viewBox="0 0 120 120"><polygon points="{" ".join(pts)}" fill="currentColor" stroke="#000" stroke-width="4" stroke-linejoin="round"/></symbol>'


def _sym_misc(sid):
    return {
        'ok': '<symbol id="ok" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#2bb673" stroke="#000" stroke-width="3"/><path d="M11 21 L18 28 L30 13" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></symbol>',
        'no': '<symbol id="no" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#e5383b" stroke="#000" stroke-width="3"/><path d="M13 13 L27 27 M27 13 L13 27" stroke="#fff" stroke-width="5" stroke-linecap="round"/></symbol>',
        'cup': '<symbol id="cup" viewBox="0 0 64 64"><path d="M18 8 H46 V22 C46 34 39 40 32 40 C25 40 18 34 18 22 Z" fill="#ffd23f" stroke="#000" stroke-width="3"/><path d="M18 13 H8 C8 24 13 28 19 28 M46 13 H56 C56 24 51 28 45 28" fill="none" stroke="#000" stroke-width="3.5"/><path d="M28 40 H36 V48 H28 Z M20 48 H44 V56 H20 Z" fill="#c98a00" stroke="#000" stroke-width="3"/><path d="M25 13 V24" stroke="#fff" stroke-width="3" opacity=".7"/></symbol>',
        'phone': '<symbol id="phone" viewBox="0 0 64 64"><rect x="17" y="4" width="30" height="56" rx="6" fill="#1a2233" stroke="#000" stroke-width="3"/><rect x="21" y="11" width="22" height="40" fill="#3f7ae0"/><circle cx="32" cy="55.5" r="2" fill="#9aa3b3"/></symbol>',
        'bio': '<symbol id="bio" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="#ffd23f" stroke="#000" stroke-width="3"/><g fill="none" stroke="#000" stroke-width="4"><circle cx="32" cy="22" r="9"/><circle cx="23.5" cy="37" r="9"/><circle cx="40.5" cy="37" r="9"/></g><circle cx="32" cy="32" r="4" fill="#000"/></symbol>',
        'lock': '<symbol id="lock" viewBox="0 0 40 40"><path d="M12 18 V13 A8 8 0 0 1 28 13 V18" fill="none" stroke="#000" stroke-width="7"/><path d="M12 18 V13 A8 8 0 0 1 28 13 V18" fill="none" stroke="#cfd6e2" stroke-width="3.5"/><rect x="7" y="17" width="26" height="20" rx="3" fill="#ffd23f" stroke="#000" stroke-width="3"/><rect x="18" y="23" width="4" height="8" rx="2" fill="#000"/></symbol>',
        'clock': '<symbol id="clock" viewBox="0 0 40 40"><circle cx="20" cy="21" r="16" fill="#fff" stroke="#000" stroke-width="3.5"/><path d="M20 21 V11 M20 21 L27 25" stroke="#000" stroke-width="3.5" stroke-linecap="round"/><path d="M15 3 H25" stroke="#000" stroke-width="4" stroke-linecap="round"/></symbol>',
        'scale': '<symbol id="scale" viewBox="0 0 40 40"><path d="M20 6 V34 M10 34 H30 M6 12 H34" stroke="#000" stroke-width="3.5" stroke-linecap="round"/><path d="M6 12 L2 24 H12 Z M34 12 L30 24 H40 Z" fill="#ffd23f" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/></symbol>',
        'plus': '<symbol id="plus" viewBox="0 0 40 40"><path d="M15 4 H25 V15 H36 V25 H25 V36 H15 V25 H4 V15 H15 Z" fill="#ffd23f" stroke="#000" stroke-width="3" stroke-linejoin="round"/></symbol>',
        'then': '<symbol id="then" viewBox="0 0 40 40"><path d="M9 5 L32 20 L9 35 L9 25.5 L17.5 20 L9 14.5 Z" fill="#ff7a1a" stroke="#000" stroke-width="3" stroke-linejoin="round"/></symbol>',
    }[sid]


def _svg(sid, vb, label, wh=None):
    w, h = wh or vb.split()[2:]
    return f'<svg viewBox="{vb}" role="img" aria-label="{attr(label)}"><use href="#{sid}" width="{w}" height="{h}"/></svg>'


def _ico(cls, sid, vb, label, cap='', wh=None):
    c = f'<small>{cap}</small>' if cap else ''
    return f'<span class="k {cls}">{_svg(sid, vb, label, wh)}{c}</span>'


def BT(L, cap=''):
    return _ico('kb', _sym(f'b{L}', lambda: _sym_btn(L)), '0 0 64 64', f'botão {L} ({BTN[L][3].lower()}, {BTN[L][4]})', cap)


STICK_N = '12 12 56 56'      # manche solto não tem seta: recorta a margem pra ele não parecer pequeno


def ST(d, cap=''):
    return _ico('ks', _sym(f's{d}', lambda: _sym_stick(d)), STICK_N if d == 'n' else '0 0 80 80', DIRS[d][1], cap, (80, 80))


KEY_DOT = {'G': '#e5383b', 'H': '#f2b705', 'J': '#2bb673', 'V': '#3f7ae0', 'Z': '#3f7ae0', 'B': '#9257e6', 'T': '#1a2233'}
KEY_ID = {'↑': 'up', '↓': 'down', '←': 'left', '→': 'right', 'ENTER': 'enter', 'ESC': 'esc', 'ESPAÇO': 'space'}


def KY(label, cap=''):
    wide = len(label) > 1 and label not in ('↑', '↓', '←', '→')
    sid = 'k' + KEY_ID.get(label, label)
    _sym(sid, lambda: _sym_key(sid, label, wide, KEY_DOT.get(label)))
    return _ico('kw' if wide else 'kk', sid, f'0 0 {104 if wide else 52} 52', f'tecla {label}', cap)


def PL(name, cap=None):
    return _ico('kp', _sym('pill', _sym_pill), '0 0 48 48', f'botão {name}', name if cap is None else cap)


METER_CAP = {'q': '1/4 DA BARRA', 'h': 'MAGIA OK', 'f': 'MAXIMUM'}
METER_ALT = {'q': 'um quarto da barra de especial', 'h': 'MAGIA OK: a barra azul cheia', 'f': 'MAXIMUM: as duas barras cheias'}


def MT(lv, cap=None):
    return _ico(f'km m-{lv}', _sym(f'm{lv}', lambda: _sym_meter(lv)), '0 0 110 46', METER_ALT[lv], METER_CAP[lv] if cap is None else cap)


def AIR(cap='NO AR'):
    return _ico('ka', _sym('air', _sym_air), '0 0 64 64', 'no ar, durante o pulo', cap)


def ICON(sid, label, cls='ka', cap=''):
    _sym(sid, lambda: _sym_misc(sid))
    vb = '0 0 64 64' if sid in ('cup', 'phone', 'bio') else '0 0 40 40'
    return _ico(cls, sid, vb, label, cap)


def BURST(text, color='#ffd23f', cls=''):
    _sym('burst', _sym_burst)
    longest = max(len(re.sub(r'<[^>]+>', '', x)) for x in re.split(r'<br\s*/?>', text))
    k = min(.19, 1.12 / (longest + .6))
    return f'<span class="burst {cls}" style="color:{color};--fk:{k:.3f}"><svg viewBox="0 0 120 120" aria-hidden="true"><use href="#burst" width="120" height="120"/></svg><b>{text}</b></span>'


_sym('plus', lambda: _sym_misc('plus'))
_sym('then', lambda: _sym_misc('then'))
PLUS = '<span class="plus" role="img" aria-label="mais: segure e aperte junto"><svg viewBox="0 0 40 40" aria-hidden="true"><use href="#plus" width="40" height="40"/></svg></span>'
THEN = '<span class="then" role="img" aria-label="depois"><svg viewBox="0 0 40 40" aria-hidden="true"><use href="#then" width="40" height="40"/></svg></span>'
OR = '<b class="or">ou</b>'


def COND(badge, word='COM'):
    """Condição (não se aperta): 'COM [MAGIA OK]:' ou '[NO AR]:'. O + fica só pra 'aperte junto'."""
    w = f'<b class="cw">{word}</b>' if word else ''
    return f'<span class="cond">{w}{badge}<b class="colon">:</b></span>'


def cmd(*parts):
    return '<span class="cmd">' + ''.join(parts) + '</span>'


def kb(*keys):
    """Teclas escritas, com FRENTE/TRÁS em vez de letra fixa (a frente troca de lado)."""
    return ' + '.join(f'<kbd>{k}</kbd>' for k in keys)


def svg_sprite():
    defs = ''.join(f'<radialGradient id="g{L}" cx=".42" cy=".34" r=".72"><stop offset="0" stop-color="{v[1]}"/><stop offset=".55" stop-color="{v[0]}"/><stop offset="1" stop-color="{v[2]}"/></radialGradient>' for L, v in BTN.items())
    defs += ('<radialGradient id="gBall" cx=".36" cy=".3" r=".75"><stop offset="0" stop-color="#ffb3b3"/><stop offset=".32" stop-color="#e5252a"/><stop offset=".78" stop-color="#8c0d12"/><stop offset="1" stop-color="#4a0508"/></radialGradient>'
             '<linearGradient id="gKey" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d3d8e2"/></linearGradient>'
             '<radialGradient id="gPill" cx=".4" cy=".32" r=".75"><stop offset="0" stop-color="#f6f8fb"/><stop offset=".6" stop-color="#aab4c4"/><stop offset="1" stop-color="#5b6576"/></radialGradient>'
             '<linearGradient id="gM1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fc1ff"/><stop offset="1" stop-color="#1f6dff"/></linearGradient>')
    return f'<svg class="sprite" aria-hidden="true" focusable="false"><defs>{defs}</defs>{"".join(SYMS.values())}</svg>'


# ---------------------------------------------------------------- textos dos golpes (os que o fighter.json não descreve)
SUPER = {
    'edgard': 'Carrega as mãos com chamas roxas, bate no chão e invoca o portal sob o adversário, onde quer que ele esteja: um pilar de luz roxa sobe até o topo da tela, com morcegos e criaturas subindo por dentro. O último acerto derruba.',
    'santana': 'Salta sobre o adversário, desce com o punho e a explosão atinge uma área larga ao redor do impacto.',
    'kevin': 'Arsenal completo: puxa o canhão de dezesseis canos e dispara o raio duplo que cruza a tela.',
    'laura': 'Tsunami de tubarões: levanta uma onda enorme, cheia de tubarões, que corre até o fim da tela.',
    'dede': 'Invoca o cavalo mágico: o redemoinho de fogo sobe do chão, vira um cavalo e ele atravessa a tela a galope, derrubando o que estiver na frente.',
    'dias': 'Escudo de moedas: quatro moedas giram em volta dele. Cada uma que encosta no adversário bate e cai; cada projétil (bola, tiro, onda, míssil) que chega é engolido por uma moeda. Raio, portal e bomba passam. Apertando ESPECIAL de novo, ele lança as que sobraram.',
    'michael': 'Carrega a aura vermelha e avança com um direto que vira um touro em investida.',
    'eneias': 'Vira a caneca de chopp, explode em energia e soca o chão: uma onda sísmica de pedras corre rente ao chão, nasce pequena e vai crescendo até o fim da tela.',
    'van': 'Carrega energia por quase 2 segundos: nesse tempo nenhum golpe nem magia a atinge (só agarrão) e a aura machuca quem chegar perto. Depois solta um raio contínuo de corações que cruza a tela.',
    'landim': 'Arremessa a claquete, que vai e volta como bumerangue.',
    'xablau': 'Língua com punho que alcança meia tela.',
    'mundim': 'O hóspede: ele se curva de dor e o parasita rasga as costas do paletó, estica o pescoço, gruda no adversário lá na frente e morde três vezes antes de soltar. Um aviso do que vem no 2º round.',
    'crm': 'O canhão aponta pro alto, o foguete some no céu e volta em três bombas que caem em fila em cima do adversário, fechando a fuga.',
    'leo': 'Chama os drones dourados e manda os três em fila contra o adversário.',
    'monstro': 'Agarra com as garras, ergue a vítima até a boca, morde três vezes e arremessa longe.'}
MAGIC = {
    'mundim': 'Brinde da diretoria: abre o paletó e arremessa as garrafas.',
    'dede': 'Gira e arremessa as três bolas das boleadeiras. Projétil largo.',
    'kevin': 'Três tiros rápidos de pistola, de qualquer distância.',
    'dias': 'Juros compostos: vira uma bola e rola por cima do adversário.',
    'laura': 'Arranca, agarra e arremessa.',
    'edgard': 'Junta a energia roxa no peito e empurra uma bola com um morcego dentro, que cruza a tela com a revoada atrás.',
    'leo': 'Raio contínuo do olho biônico: cruza a tela na hora e para onde encostar.',
    'landim': 'O flash da câmera vira uma bola de luz que cruza a tela.',
    'eneias': 'Soca o chão e manda uma onda de choque rasteira pra frente.',
    'santana': 'Carrega o braço mecânico e dispara uma rajada de energia azul.',
    'michael': 'Um jab tão rápido que a energia do soco sai voando pela tela.',
    'van': 'Lança um coração de energia cor-de-rosa.',
    'crm': 'O João dispara o canhão do tanque: tiro rápido e reto.',
    'xablau': 'Cospe uma nuvem de gosma ácida.',
    'monstro': 'Cospe ácido lá do alto do pescoço.'}
LONG = {
    'crm': 'O míssil teleguiado do João: sobe, faz a curva no céu e desce em cima do adversário. Demora pra sair e deixa o tanque aberto.',
    'leo': 'Tiro de escopeta: mira e dispara. O estouro pega a uma boa distância do cano.',
    'edgard': 'Junta as mãos e solta uma revoada de morcegos à frente. Demora pra sair, mas alcança o dobro do golpe forte.',
    'santana': 'O braço mecânico se estica em três estágios e acerta de longe, de punho fechado.',
    'kevin': 'Acerta de longe com o bastão de choque, num estalo de eletricidade azul.',
    'dias': 'A velha barrigada em corrida: entra de longe e empurra.',
    'landim': 'O feixe da câmera com a lente na ponta: acerta de muito longe.',
    'van': 'Aponta a bebê e solta a nuvem tóxica: área grande à frente.',
    'eneias': 'O peixinho: corre e mergulha de barriga. Entra de longe.',
    'dede': 'Gira o laço e estala as boleadeiras lá na frente.',
    'michael': 'Direto em avanço que termina em gancho: entra de longe e empurra.',
    'laura': 'Empurra o ar e um tubarão de água avança mordendo, lá na frente.',
    'monstro': 'O pescoço de verme dá o bote de longe.'}
MAGIC_KIND = {'ball': 'uma bola de energia', 'slash': 'um risco cortante', 'cloud': 'uma nuvem', 'coin': 'uma moeda giratória',
              'heart': 'um coração', 'wave': 'uma onda rasteira', 'bat': 'um morcego'}
GROUND_Y = grab(CONSTS_TS, r'GROUND_Y\s*=\s*(\d+)', int, 470)


def hits_seq(fid, name):
    """Os acertos do golpe na ordem, como o jogo aplica (fighter.ts takeHit/lift, hit.ts): lista de (quadro, dano, 'combo'|'bite').
    Mordida do agarrão tira direto da vida (sem peso nem desconto de combo); o resto passa pelo desconto de combo."""
    m = F[fid]['moves'][name]
    stun = m.get('hitstun', 20)
    if 'throw' in m:
        T = m['throw']
        n, every = T.get('ticks', 0), max(1, T.get('lift', 1) // max(1, T.get('ticks', 1)))
        seq = [((k + 1) * every, T.get('tickDamage', 2), 'bite') for k in range(n)]
        return seq + [((n + 1) * every, T['release']['damage'], 'combo')], 30
    if 'shield' in m:
        sh = m['shield']
        return [(k * sh.get('every', 30), sh['damage'], 'combo') for k in range(sh['coins'])], sh.get('hitstun', 18)
    if 'zone' in m:
        z = m['zone']
        seq = [(0, m['damage'], 'combo')] if m.get('damage') else []
        return seq + [(h['at'], h['damage'], 'combo') for h in z['hits']], z.get('hitstun', stun)
    b = m.get('beam') or {}
    if b.get('every'):
        return [(k * b['every'], m['damage'], 'combo') for k in range(math.ceil(m['active'] / b['every']))], stun
    p = m.get('projectile') or {}
    seq = []
    for c in range(p.get('count', 1)):
        for h in range(p.get('hits', 1)):
            seq.append((c * p.get('every', 0) + h * p.get('rehit', 10), m['damage'], 'combo'))
    return sorted(seq), stun


def hits_of(fid, name):
    return len(hits_seq(fid, name)[0])


def dmg_of(fid, name, weight=1.0):
    """Dano total do golpe inteiro contra quem fica parado, sem defesa, de peso 1,00 (a vida de todo mundo vale 100).
    Mesma conta do jogo: PODER pra magia/super/o que voa (FORÇA no resto); do 3º acerto seguido em diante cada um vale 10%
    menos, com piso de 60%; o combo zera se o outro se recupera entre dois acertos; a mordida do agarrão não desconta nada."""
    st, m = F[fid]['stats'], F[fid]['moves'][name]
    mult = st.get('magic', 1) if (name in ('special', 'super') or m.get('projectile') or m.get('meterCost') or m.get('throw') or m.get('zone') or m.get('shield')) else st['power']
    tough = 1 + 0.3 * (weight - 1)
    seq, stun = hits_seq(fid, name)
    total, taken, last = 0.0, 0, None
    for fr, d, kind in seq:
        if last is not None and kind != 'bite' and fr - last > stun:
            taken = 0                                    # o outro se recuperou: o combo recomeça
        if kind == 'bite':
            total += d * mult
        else:
            total += d * mult * max(0.6, 1 - 0.1 * max(0, taken - 1)) / tough
        taken += 1
        last = fr
    return round(total)


def passes_over(fid, name):
    """Projétil que sai tão alto que passa por cima de quem está em pé (compara a caixa dele com a de cada lutador)."""
    m = F[fid]['moves'].get(name) or {}
    p = m.get('projectile')
    if not p or p.get('homing') or p.get('ground'):
        return []
    s, k = F[fid].get('scale', 1), 1 + p.get('grow', 0)
    bottom = GROUND_Y + p['y'] * s + (p['hitbox']['y'] + p['hitbox']['h']) * s * k
    base = MORPH_OF.get(fid, fid)
    return [i for i in ORDER if i != base and GROUND_Y + F[i]['hurtbox']['y'] * F[i].get('scale', 1) >= bottom]


def chips_of(fid, name):
    m = F[fid]['moves'][name]
    c = []
    if m.get('kind') == 'throw':
        c.append('AGARRÃO: IGNORA A DEFESA')
    if m.get('kind') == 'dive':
        c.append('CAI DE CIMA: DEFENDA EM PÉ')
    z = m.get('zone')
    if z:
        c.append('SURGE ONDE O ADVERSÁRIO ESTÁ' if z.get('at') == 'target' else 'EXPLOSÃO EM ÁREA')
    p = m.get('projectile')
    if p:
        c.append('TELEGUIADO' if p.get('homing') else 'VAI E VOLTA' if p.get('boomerang') else 'CORRE PELO CHÃO' if p.get('ground') else 'PROJÉTIL')
        if p.get('pierce'):
            c.append('ATRAVESSA')
        if passes_over(fid, name):
            c.append('PASSA POR CIMA DOS MAIS BAIXOS')
    if m.get('beam'):
        c.append('RAIO')
    if m.get('aura'):
        c.append('INVENCÍVEL NA CARGA')
    if m.get('shield'):
        c.append('ESCUDO')
    if m.get('dash'):
        c.append('AVANÇA')
    if m.get('knockdown') or m.get('throw') or any(h.get('knockdown') for h in (z or {}).get('hits', [])):
        c.append('DERRUBA')
    n = hits_of(fid, name)
    if n > 1:
        c.append(f'ATÉ {n} ACERTOS' if (m.get('shield') or (p or {}).get('boomerang')) else f'{n} ACERTOS')
    if m.get('meterCost') == 25:
        c.append('GASTA 1/4 DA BARRA')
    return c


# o que cada selo quer dizer e o que fazer contra (a legenda da FASE dos lutadores mostra só os selos que aparecem nas fichas)
SELOS = [
    ('PROJÉTIL', 'Algo que voa pela tela.', lambda: f'Defenda {BT("V")} ou pule por cima.'),
    ('TELEGUIADO', 'O projétil persegue você por um tempo.', lambda: f'Defenda {BT("V")}. Depois de um tempo ele desiste de perseguir.'),
    ('VAI E VOLTA', 'Acerta na ida e de novo na volta.', lambda: f'Continue com {BT("V")} até ele voltar pra mão.'),
    ('CORRE PELO CHÃO', 'Vem rente ao chão.', lambda: f'Defenda {BT("V")}, em pé ou agachado, ou pule.'),
    ('ATRAVESSA', 'Não some quando acerta: segue até o fim da tela.', lambda: 'Dá pra defender normalmente.'),
    ('PASSA POR CIMA DOS MAIS BAIXOS', 'Sai lá do alto: quem é baixo e está em pé não leva.', lambda: 'Quem é alto, ou está no ar, leva.'),
    ('RAIO', 'Um feixe que cruza a tela na hora.', lambda: f'Defenda {BT("V")}.'),
    ('SURGE ONDE O ADVERSÁRIO ESTÁ', 'Aparece embaixo de você, onde você estiver.', lambda: f'Fugir não adianta: defenda {BT("V")}.'),
    ('EXPLOSÃO EM ÁREA', 'Estoura em volta de quem soltou.', lambda: f'Fique longe ou defenda {BT("V")}.'),
    ('AVANÇA', 'O lutador vem junto com o golpe.', lambda: f'Ele chega rápido: defenda {BT("V")}.'),
    ('INVENCÍVEL NA CARGA', 'Enquanto junta energia, nenhum golpe nem magia pega nela. Só agarrão.', lambda: f'Espere e defenda {BT("V")} o que vem depois.'),
    ('ESCUDO', 'Moedas giram em volta dele: encostar machuca, e projétil que chega some numa moeda.', lambda: 'Espere: as moedas acabam ou somem sozinhas.'),
    ('AGARRÃO: IGNORA A DEFESA', 'Agarra, e a defesa não segura.', lambda: f'Pule {ST("u")}: ninguém agarra quem está no ar.'),
    ('CAI DE CIMA: DEFENDA EM PÉ', 'Pula e cai em cima de você.', lambda: f'Defenda em pé {BT("V")}.'),
    ('DERRUBA', 'Quem leva cai no chão.', lambda: 'Caído, ninguém te acerta: espere levantar.'),
    ('ACERTOS', 'O golpe bate várias vezes seguidas.', lambda: f'Segure {BT("V")}: a defesa segura todas.'),
    ('GASTA 1/4 DA BARRA', 'Esse golpe longo custa 1/4 da barra de especial: sem isso, ele não sai.', None),
]


def move_desc(fid, name):
    m = F[fid]['moves'][name]
    if name == 'super':
        return SUPER.get(fid, 'O golpe mais forte do lutador.')
    if name == 'special':
        kind = MAGIC_KIND.get((m.get('projectile') or {}).get('style', ''), '')
        d = MAGIC.get(fid) or (f'Lança {kind}.' if kind else 'A magia do lutador.')
    elif name == 'long':
        d = LONG.get(fid, 'Lento, mas acerta de longe e empurra.')
    else:
        return ''
    over = passes_over(fid, name)
    if over:
        d += f' Passa por cima de quem é mais baixo e está em pé ({lista(tname(i) for i in over)}): pega quem é alto ou está no ar.'
    return d


def lista(xs):
    xs = list(xs)
    return ' e '.join(xs) if len(xs) < 3 else ', '.join(xs[:-1]) + ' e ' + xs[-1]


# ---------------------------------------------------------------- enredo: só o que vem do story.json (sem chave, a parte some)
def _as_list(v):
    return v if isinstance(v, list) else []


TIMELINE = [t for t in _as_list(STORY.get('timeline')) if isinstance(t, dict) and scrub(t.get('event', ''))]
GLOSSARY = [g for g in _as_list(STORY.get('glossary')) if isinstance(g, dict) and scrub(g.get('term', '')) and scrub(g.get('def', ''))]
_seq = STORY.get('sequel')
SEQUEL = (' '.join(_seq) if isinstance(_seq, list) else str(_seq)) if _seq else ''
SEQUEL = re.sub(r'\s*V4 FIGHTERS 2\s*[·:-]?\s*EM BREVE\.?\s*$', '', SEQUEL, flags=re.I)     # o logo e o EM BREVE já estão na contracapa
ACTS = [(a[0], a[1]) for a in _as_list(STORY.get('acts')) if isinstance(a, (list, tuple)) and len(a) >= 2 and scrub(a[0])]
FACTION_LABEL = {'vilao': 'A TORRE', 'heroi': 'GENTE COMUM', 'neutro': 'OS NEUTROS'}      # rótulo dos grupos quando o story.json não tem facções
FACTIONS = {k: v for k, v in (STORY.get('factions') or {}).items() if isinstance(v, (list, tuple)) and v}
SIDE_COLOR = {'vilao': '#e5383b', 'heroi': '#2bb673', 'neutro': '#9257e6'}


def faction_title(key):
    v = FACTIONS.get(key)
    return plain(v[0]) if v else FACTION_LABEL.get(key, key.upper())


def faction_text(key):
    v = FACTIONS.get(key)
    return rich(v[1]) if v and len(v) > 1 else ''


LINKS = []   # (de, para, texto): cada ligação uma vez, contada por quem a escreveu
for _a in ROSTER:
    for _l in _as_list((S_FIGHTERS.get(_a) or {}).get('links')):
        if isinstance(_l, dict):
            _w, _t = _l.get('with') or _l.get('to') or _l.get('id') or '', _l.get('relation') or _l.get('text') or ''
        elif isinstance(_l, (list, tuple)) and len(_l) >= 2:
            _w, _t = _l[0], _l[1]
        else:
            continue
        _w, _t = MORPH_OF.get(_w, _w), plain(_t)
        if _w in ROSTER and _w != _a and _t:
            LINKS.append((_a, _w, _t))

ALIAS = {}
for _i in list(ROSTER) + list(MORPH.values()):
    _n = F[_i]['name']
    ALIAS[_n] = _i
    ALIAS[_n.title()] = _i
    if (S_FIGHTERS.get(_i) or {}).get('nick'):
        ALIAS[S_FIGHTERS[_i]['nick']] = _i
# nomes de gente que aparecem no enredo (André é o Dedê; Thiago e João, o CRM...): valem só se a bio do lutador confirma
_REAL = {'Felipe': 'santana', 'André': 'dede', 'Vanessa': 'van', 'Thiago': 'crm', 'João': 'crm', 'A Coisa': 'monstro'}
for _k, _v in _REAL.items():
    if _v in F and (_k == 'A Coisa' or _k in (F[_v].get('bio') or '') or _k.upper() == F[_v]['name']):
        ALIAS[_k] = _v
_ALIAS_RE = re.compile(r'(?<![\w\'])(' + '|'.join(sorted(map(re.escape, ALIAS), key=len, reverse=True)) + r')(?![\w])')
# na ficha, o nome de gente embaixo do nome de luta (o enredo chama pelo nome)
AKA = {}
for _k, _v in _REAL.items():
    if _v in ROSTER and ALIAS.get(_k) == _v and _k.upper() != F[_v]['name']:
        AKA[_v] = (AKA[_v] + ' E ' + _k.upper()) if _v in AKA else _k.upper()
_nick = {i: (S_FIGHTERS.get(i) or {}).get('nick') for i in ROSTER}
for _i, _n in _nick.items():
    if _n and _n.upper() != F[_i]['name'] and _i not in AKA:
        AKA[_i] = _n.upper()


def who_in(text, limit=3):
    seen = []
    for m in _ALIAS_RE.finditer(re.sub(r'<[^>]*>', '', text)):
        i = ALIAS[m.group(1)]
        if i not in seen:
            seen.append(i)
    return seen[:limit]


def place(fid):
    return (PLACES.get(fid) or {}).get('name', STATE.title())


def fname(fid):
    return F[fid]['name']


def tname(fid):
    n = F[fid]['name']
    return n if not re.search(r'[AEIOUÁÉÍÓÚÂÊÔÃÕ]', n) else n.title()     # sigla (CRM) fica em maiúsculas


def color(fid):
    return F[fid]['colors']['primary']


def grabbers():
    """Quem agarra e com qual golpe: [(id, 'special'|'super')]."""
    out = []
    for i in ORDER + list(MORPH.values()):
        for k in ('special', 'super'):
            if (F[i]['moves'].get(k) or {}).get('kind') == 'throw':
                out.append((i, k))
    return out


def group_timeline():
    """A linha do tempo dividida nos atos: cada data vai pro ato com que mais combina (palavras e nomes em negrito),
    sempre pra frente, sem pular ato. Sem atos, fica um grupo só."""
    ev, acts = TIMELINE, ACTS
    if not ev:
        return []
    if len(acts) < 2 or len(ev) < len(acts):
        return [(acts[0] if acts else None, ev)]
    stop = set('para pela pelo pelos pelas como mais quem onde está isso essa esse este esta seus suas dele dela deles delas numa '
               'nos nas dos das com sem que uma umas até tudo todo toda todos todas ainda quando depois antes sobre entre também '
               'muito muita mesmo mesma cada outro outra outros outras foram fica ficou'.split())

    def words(t):
        return set(re.findall(r"[a-zà-ú0-9']{4,}", re.sub(r'<[^>]*>', ' ', t).lower())) - stop

    def bold(t):
        return set(x.lower() for x in re.findall(r'<b>(.*?)</b>', t))
    sc = [[len(words(e.get('when', '') + ' ' + e['event']) & words(a[0] + ' ' + a[1])) + 3 * len(bold(e['event']) & bold(a[1])) for a in acts] for e in ev]
    n, A, NEG = len(ev), len(acts), -1e9
    best = [[NEG] * A for _ in range(n)]
    prev = [[-1] * A for _ in range(n)]
    best[0][0] = sc[0][0]
    for i in range(1, n):
        for a in range(A):
            for p in (a, a - 1):
                if p >= 0 and best[i - 1][p] > NEG and best[i - 1][p] + sc[i][a] > best[i][a]:
                    best[i][a], prev[i][a] = best[i - 1][p] + sc[i][a], p
    a, asg = A - 1, [0] * n
    for i in range(n - 1, -1, -1):
        asg[i] = a
        if i:
            a = prev[i][a]
    return [(acts[k], [e for e, g in zip(ev, asg) if g == k]) for k in range(A)]


# ================================================================ SEÇÕES
# A trilha do novato (1 a 8) vem primeiro, na ordem em que ele precisa; depois, a parte de consulta (9 a 13).
TOC = [('luta', 'LUTA', 'O QUE É UM <em>JOGO DE LUTA</em>', 'O básico em 4 quadrinhos'),
       ('controle', 'CONTROLE', 'SEU <em>CONTROLE</em>', 'Manche, botões, teclado e toque'),
       ('passos', 'PASSOS', 'PRIMEIROS <em>PASSOS</em>', 'Do INSERT COIN ao primeiro especial'),
       ('tela', 'TELA', 'A TELA <em>DA LUTA</em>', 'Vida, tempo, rounds e barra'),
       ('barra', 'BARRA', 'A BARRA DE <em>ESPECIAL</em>', 'Magia e super, sem mistério'),
       ('regras', 'REGRAS', 'AS <em>REGRAS</em>', 'Rounds, defesa, agarrão, K.O.'),
       ('dicas', 'DICAS', 'DICAS DO <em>MESTRE</em>', 'Pra ganhar a primeira luta'),
       ('arcade', 'ARCADE', 'MODO <em>ARCADE</em>', 'A subida até o 52º andar'),
       ('comandos', 'COMANDOS', 'TODOS OS <em>COMANDOS</em>', 'Ícone + ícone = golpe'),
       ('lutadores', 'LUTADORES', 'OS <em>LUTADORES</em>', f'{len(ROSTER)} fichas completas'),
       ('online', 'ONLINE', 'ARENA <em>ONLINE</em>', 'Duelo, duplas e campeonato'),
       ('celular', 'CELULAR', 'NO <em>CELULAR</em>', 'App, tela cheia e som'),
       ('enredo', 'ENREDO', 'O <em>ENREDO</em>', 'O que deu errado na Mundim Corp')]
TRACK = 8
NUM = {t[0]: k for k, t in enumerate(TOC, 1)}
SEC_COLOR = dict(zip([t[0] for t in TOC], ['#e5383b', '#ffd23f', '#2bb673', '#3f7ae0', '#29a3ff', '#ff7a1a', '#2bb673', '#ffd23f',
                                           '#9257e6', '#e5383b', '#3f7ae0', '#ff4fa0', '#9be22a']))


def fase(sid, label=None):
    """Link pra outra FASE, com o número de hoje (a ordem pode mudar)."""
    return f'<a href="#{sid}">{label or "FASE " + str(NUM[sid])}</a>'


def section(sid, body, sub, cis=(2400, 3600)):
    n, title = NUM[sid], TOC[NUM[sid] - 1][2]
    return (f'<section id="{sid}" class="sec cv" style="--c:{SEC_COLOR[sid]};--cis:{cis[0]}px;--cism:{cis[1]}px">'
            f'<header class="band"><div><span class="fase">FASE {n:02d}</span><h2>{title}</h2><p>{sub}</p></div></header>{body}'
            f'<footer class="folio"><a href="#indice">▲ ÍNDICE</a><span>V4 FIGHTERS · MANUAL DO JOGADOR</span><b>{n:02d}</b></footer></section>')


def sub_h(text, kicker=''):
    k = f'<span>{kicker}</span>' if kicker else ''
    return f'<h3 class="subh">{k}{text}</h3>'


def tip(text, label='DICA!', col='#ffd23f', who=None):
    f = f'<span class="tip-face">{img(face(who), fname(who), "px up")}</span>' if who else ''
    return f'<aside class="tip">{BURST(label, col)}<p>{text}</p>{f}</aside>'


DEMO, RIVAL = ('laura' if 'laura' in F else ROSTER[0]), ('edgard' if 'edgard' in F else ROSTER[1])


def spr(fid, key, alt, cls='px spr', style=''):
    s = pose(fid, key)
    return img(s, f'{fname(fid)}: {alt}', cls, True, style) if s else ''


def lifebar(pct, lost=0, cls=''):
    """Barra de vida de mentira (amarela, com o pedaço vermelho do que acabou de sair)."""
    lost_html = f'<s style="left:{pct}%;width:{lost}%"></s>' if lost else ''
    return f'<span class="lbar {cls}"><i style="width:{pct}%"></i>{lost_html}</span>'


def gauge(level, hint=True, cls=''):
    """As duas barrinhas do canto de baixo, como na tela: nível 0 (vazia), 1 (MAGIA OK) ou 2 (MAXIMUM)."""
    g1 = f'<span class="gz1{" on" if level >= 1 else ""}"><i style="width:{100 if level >= 1 else 0}%"></i><em>MAGIA{" <b>OK</b>" if level >= 1 else ""}</em></span>'
    g2 = f'<span class="gz2{" on" if level >= 2 else ""}"><i style="width:{100 if level >= 2 else 0}%"></i><em>{"MAXIMUM" if level >= 2 else "SUPER"}</em></span>'
    h = f'<span class="gz-hint"><kbd>B</kbd> {"SOLTA O SUPER" if level >= 2 else "SOLTA A MAGIA"}</span>' if hint and level else '<span class="gz-hint off">&nbsp;</span>'
    return f'<span class="gz {cls}">{h}{g1}{g2}</span>'


# ---------------------------------------------------------------- capa + índice
def toc_icon(sid):
    if sid == 'luta':
        return f'<span class="ti-vs">{img(face(DEMO), fname(DEMO))}<b>VS</b>{img(face(RIVAL), fname(RIVAL))}</span>'
    if sid == 'controle':
        return cmd(ST('n'), BT('G'))
    if sid == 'passos':
        return spr(DEMO, 'walk', 'andando', 'px ti-spr')
    if sid == 'tela':
        return f'<span class="ti-bar">{lifebar(62)}</span>'
    if sid == 'barra':
        return MT('f', '')
    if sid == 'regras':
        return '<b class="ti-ko">K.O.</b>'
    if sid == 'dicas':
        return BURST('DICA!', '#ffd23f', 'sm')
    if sid == 'arcade':
        return '<b class="ti-floor">52</b>'
    if sid == 'comandos':
        return cmd(ST('d'), PLUS, BT('H'))
    if sid == 'lutadores':
        return '<span class="ti-faces">' + ''.join(img(face(i), fname(i)) for i in ORDER[:3]) + '</span>'
    if sid == 'online':
        return ICON('cup', 'troféu')
    if sid == 'celular':
        return ICON('phone', 'celular')
    return ICON('bio', 'perigo biológico')


def toc_mini(sid):
    """Ícone de uma peça só, pra lista de consulta do índice."""
    if sid == 'comandos':
        return BT('H')
    if sid == 'lutadores':
        return img(face(STARTER), fname(STARTER))
    return toc_icon(sid)


def cover():
    bg, bgm = stage('intro', 960, 68), stage('intro')
    logo = picture('intro/logo.jpg', 'logo.jpg', 200, 80)
    line = [i for i in ('kevin', 'edgard', 'mundim', 'laura', 'michael') if i in F]
    if len(line) < 5:
        line = ORDER[:5]
    arts = ''
    for k, i in enumerate(line):
        a = art(i)
        if not a:
            continue
        mid = k == len(line) // 2
        pri = ' fetchpriority="high"' if mid else ' loading="lazy"' if k in (0, len(line) - 1) else ''      # as das pontas somem no celular: lazy nem baixa
        arts += f'<img class="la la{k}" src="{a[0]}" width="{a[1]}" height="{a[2]}" alt="{attr(fname(i))}"{pri} decoding="async">'
    feats = ''.join(f'<li><b>{a}</b><span>{b}</span></li>' for a, b in ((f'{len(ROSTER)}', 'LUTADORES'), ('1P', 'ARCADE'), (f'ATÉ {MAX_PEERS}', 'ONLINE'),
                                                                       ('2x2', 'DUPLAS'), (f'ATÉ {CUP_MAX}', 'CAMPEONATO'), ('PC', 'E CELULAR')))
    seal = (f'<svg class="seal" viewBox="0 0 120 120" role="img" aria-label="Selo: manual oficial, Mundim Corp, {YEAR}"><defs><path id="sealp" d="M60 60 m-43 0 a43 43 0 1 1 86 0 a43 43 0 1 1 -86 0"/></defs>'
            '<circle cx="60" cy="60" r="57" fill="#e5383b" stroke="#000" stroke-width="4"/><circle cx="60" cy="60" r="31" fill="#ffd23f" stroke="#000" stroke-width="3"/>'
            f'<text class="seal-t"><textPath href="#sealp" startOffset="0">MANUAL OFICIAL · MUNDIM CORP · {YEAR} ·</textPath></text>'
            '<text x="60" y="71" text-anchor="middle" class="seal-v">V4</text></svg>')
    return f'''<header class="cover" id="capa" style="--bg:url({bg[0]});--bgm:url({bgm[0]})">
<div class="topband"><span>MANUAL DE INSTRUÇÕES</span><span>EDIÇÃO {YEAR}</span></div>
<div class="cv-in">
  <img class="cv-logo" src="{logo[0]}" width="{logo[1]}" height="{logo[2]}" alt="V4" decoding="async">
  <p class="cv-tag">MANUAL DO JOGADOR · {YEAR}</p>
  <h1 class="logo">V4 FIGHTERS<span>TROUBLE WORK</span></h1>
  <p class="cv-sub">O deadline é hoje. O nocaute também.</p>
  <div class="cv-burst">{BURST('PARA<br>QUEM<br>NUNCA<br>JOGOU!', '#ffd23f')}</div>
  <div class="cv-seal">{seal}</div>
  <div class="lineup">{arts}</div>
  <div class="cv-cta"><a class="cta" href="./">▶ JOGAR AGORA</a><a class="cta ghost" href="#indice">LER O MANUAL ▼</a></div>
  <ul class="feats">{feats}</ul>
</div></header>'''


def toc_nav():
    items = ''.join(f'<a href="#{sid}" data-s="{sid}"><b>{n}</b>{short}</a>' for n, (sid, short, _, _) in enumerate(TOC, 1))
    return f'<nav class="toc" aria-label="Índice do manual"><a href="#capa" class="home" aria-label="Capa">V4</a>{items}</nav>'


def index():
    tiles = ''.join(f'<li><a href="#{sid}" style="--c:{SEC_COLOR[sid]}"><span class="n">FASE {n:02d}</span><b>{re.sub("<[^>]+>", "", title)}</b><small>{sub}</small><span class="ti">{toc_icon(sid)}</span></a></li>'
                    for n, (sid, _, title, sub) in enumerate(TOC[:TRACK], 1))
    rows = ''.join(f'<li><a href="#{sid}" style="--c:{SEC_COLOR[sid]}"><span class="ti">{toc_mini(sid)}</span><b>{re.sub("<[^>]+>", "", title)}</b><i></i><span class="pg">{n:02d}</span><small>{sub}</small></a></li>'
                   for n, (sid, _, title, sub) in enumerate(TOC[TRACK:], TRACK + 1))
    rows += '<li><a href="#continua" style="--c:#ff4d4d"><span class="ti"><b class="ti-q">?</b></span><b>CONTINUA…</b><i></i><span class="pg">FIM</span><small>A contracapa: V4 FIGHTERS 2</small></a></li>'
    howto = (f'<div class="howto paper">{BURST("COMO<br>LER!", "#ff7a1a", "sm")}<p><b>Nunca jogou?</b> Leia as fases 1 a {TRACK - 1}, na ordem: uns 10 minutos, com o desenho de cada botão. '
             f'Depois, vá pro {fase("arcade", "MODO ARCADE")} (fase {TRACK}) e jogue. <b>Já sabe jogar?</b> Vá direto pra {fase("comandos", "TODOS OS COMANDOS")} e pras {fase("lutadores", "fichas dos lutadores")}.</p></div>')
    return f'''<main class="wrap">
<section id="indice" class="indice">
  <h2 class="idx-h">ÍNDICE <span>ESCOLHA A FASE</span></h2>
  {howto}
  <h3 class="idx-g"><span>FASES 1 A {TRACK}</span>A TRILHA DO NOVATO</h3>
  <ol class="idx">{tiles}</ol>
  <h3 class="idx-g"><span>FASES {TRACK + 1} A {len(TOC)}</span>PRA CONSULTAR</h3>
  <ol class="idx2 paper">{rows}</ol>
  {resumao()}
  {aviso()}
</section>'''


def resumao():
    pad = ''.join(f'<li>{BT(L)}<b>{BTN[L][3]}</b><small>{x}</small></li>' for L, x in (('G', 'rápido'), ('H', 'médio'), ('J', 'lento e forte'), ('V', 'segure'), ('B', 'com barra'), ('T', 'só nas duplas')))
    rules = [(cmd(BT('V', 'SEGURE')), 'SEGURE PRA DEFENDER', 'Andar pra trás não defende: a defesa é um botão.'),
             (cmd(ST('d'), PLUS, BT('H')), 'AGACHADO, VIRA GOLPE BAIXO', f'E golpe baixo só se defende agachado: {cmd(ST("d"), PLUS, BT("V"))}.'),
             (cmd(COND(MT('h')), BT('B')), 'B SÓ COM A BARRA', 'Aperte quando piscar <kbd>B</kbd> SOLTA A MAGIA. Antes disso, o B não faz nada.')]
    rr = ''.join(f'<li><span class="rs-n">{k}</span><div><b>{t}</b><div class="rs-c">{c}</div><p>{d}</p></div></li>' for k, (c, t, d) in enumerate(rules, 1))
    return (f'<div class="resumo paper"><h3>RESUMÃO <span>A COLA DE UMA TELA</span></h3>'
            f'<div class="rs-top"><div class="rs-stick">{ST("n", "MANCHE")}<p><b>ANDA, PULA E AGACHA</b>No teclado: W A S D ou as setas.</p></div><ul class="rs-pad">{pad}</ul></div>'
            f'<h4>3 REGRAS DE OURO</h4><ol class="rs-rules">{rr}</ol></div>')


def aviso():
    return ('<aside class="aviso"><div class="hazard" aria-hidden="true"></div><div class="av-in"><h3>AVISO <span>LEIA ANTES DE JOGAR</span></h3>'
            '<p>O jogo tem luzes que piscam e a tela treme nos golpes fortes. Se sentir tontura, vista cansada ou qualquer mal-estar, pare e descanse. '
            'Jogue num lugar iluminado, com a tela a uma boa distância, e faça uma pausa a cada hora.</p></div><div class="hazard" aria-hidden="true"></div></aside>')


# ---------------------------------------------------------------- FASE 1
ARCADE_WORDS = [('INSERT COIN', 'Nos fliperamas, o jogo pedia moeda. Aqui é de graça: é só o jeito de dizer COMECE.'),
                ('PRESS START', 'Aperte o botão START.'),
                ('1P e CPU', '1P é você, o jogador 1. CPU é o computador, jogando do outro lado.'),
                ('ROUND', 'Cada rodada da luta. Quem ganha 2 leva a luta.'),
                ('FIGHT!', 'Valendo! A luta começou.'),
                ('K.O.', 'Nocaute: a vida de alguém zerou.'),
                ('TIME OVER', 'O tempo do round acabou: vence quem tem mais vida.'),
                ('PERFECT', 'Ganhou o round sem perder nem um pedacinho de vida.'),
                ('HITS · COMBO', 'Combo são golpes seguidos que o outro não consegue defender, porque ainda está tonto do anterior. O contador de HITS mostra quantos.'),
                ('MAXIMUM', 'A barra de especial está cheia: dá pra soltar o SUPER.')]


def s_luta():
    bg = stage(F[DEMO].get('stage', 'office'))[0]
    bg2 = stage(F[RIVAL].get('stage', 'office'))[0]
    words = ''.join(f'<div><dt>{t}</dt><dd>{d}</dd></div>' for t, d in ARCADE_WORDS)
    return section('luta', f'''
<div class="hq">
 <article class="pnl"><span class="num">1</span><div class="scene" style="background-image:url({bg})">{spr(DEMO, 'idle', 'em guarda', 'px spr l')}<span class="you">VOCÊ · 1P</span>{BURST('VS', '#e5383b', 'sc-vs')}{spr(RIVAL, 'idle', 'em guarda', 'px spr r flip')}<span class="cpu">CPU</span></div>
  <div class="txt"><h3>DOIS LUTADORES</h3><p>Você é o da <b>ESQUERDA</b>: o seu nome fica em cima, à esquerda, e na escolha o seu lado mostra <b>1P</b>. Do outro lado, a <b>CPU</b> (o computador) ou alguém pela internet. Na arena online dá pra começar do lado direito: o seu nome e o aviso do B ficam sempre do seu lado.</p></div></article>
 <article class="pnl"><span class="num">2</span><div class="scene" style="background-image:url({bg})"><span class="mini-life">{lifebar(55, 18)}</span>{spr(DEMO, 'kick', 'chutando', 'px spr l hit-l')}{BURST('POW!', '#ffd23f', 'sc-pow')}{spr(RIVAL, 'hit', 'apanhando', 'px spr r flip')}</div>
  <div class="txt"><h3>ACERTE PRA TIRAR VIDA</h3><p>Cada golpe que acerta tira um pedaço da <b>barra de vida</b> do outro: a barra amarela grande, lá em cima. Todo mundo começa com <b>100</b>.</p></div></article>
 <article class="pnl"><span class="num">3</span><div class="scene rounds"><b class="r-t">ROUND 2</b><span class="r-d"><i class="on"></i><i></i></span><b class="r-c">{ROUND_S}</b></div>
  <div class="txt"><h3>VENÇA 2 ROUNDS</h3><p>A luta é dividida em <b>rounds</b> de {ROUND_S} segundos. Quem vencer <b>2 rounds</b> primeiro leva a luta.</p></div></article>
 <article class="pnl"><span class="num">4</span><div class="scene" style="background-image:url({bg2})">{spr(DEMO, 'win', 'comemorando', 'px spr l')}<b class="ko-t">K.O.!</b>{spr(RIVAL, 'down', 'nocauteado', 'px spr r flip down')}</div>
  <div class="txt"><h3>K.O.!</h3><p>Zerou a vida do outro? É <b>nocaute</b>. Se o tempo acabar antes, vence quem tiver <b>mais vida</b>.</p></div></article>
</div>
{tip(f'Neste jogo <b>defender é um botão</b>: segure {BT("V")} (no teclado, <kbd>V</kbd> ou <kbd>Z</kbd>). Só andar pra trás <b>não</b> defende.', 'ATENÇÃO!', '#ff7a1a', DEMO)}
{sub_h('AS PALAVRAS QUE APARECEM NA TELA', 'FLIPERAMÊS')}
<dl class="words paper">{words}</dl>
<p class="more">Qual é o lado da frente? Veja o quadro FRENTE na {fase('controle')}.</p>''', 'Em 30 segundos, o básico. Sem pressa.', (1450, 3100))


# ---------------------------------------------------------------- FASE 2
def controls():
    return [
        (ST('n'), 'MANCHE', 'A alavanca (no jogo, embaixo dela está escrito <b>MOVER</b>). Anda, pula e agacha: a bola vermelha vai pra onde você empurrar.', ['W', 'A', 'S', 'D', '↑', '←', '↓', '→'], 'W A S D ou as setas', 'Arraste a bola vermelha com o polegar esquerdo.'),
        (BT('G'), 'G · SOCO', 'O golpe mais rápido. Tira pouco.', ['G'], '', 'Botão vermelho.'),
        (BT('H'), 'H · CHUTE', 'Médio em tudo.', ['H'], '', 'Botão amarelo.'),
        (BT('J'), 'J · FORTE', f'Lento e forte. Com o manche pra FRENTE segurado, vira o GOLPE LONGO ({cmd(ST("r", "FRENTE"), PLUS, BT("J"))}).', ['J'], '', 'Botão verde.'),
        (BT('V'), 'V · DEFESA', 'Segure pra se defender. Andar pra trás não defende.', ['V', 'Z'], '', 'Botão azul.'),
        (BT('B'), 'B · ESPECIAL', f'Só funciona com a barra azul cheia (aparece {MT("h", "")} MAGIA OK). No começo da luta ela está vazia: bata primeiro. No ar, o B não faz nada.', ['B'], '', 'Botão roxo.'),
        (BT('T'), 'T · TROCA', 'Só nas duplas: chama o parceiro.', ['T'], '', 'Botão branco: só aparece nas duplas.'),
        (PL('START'), 'START', 'Começa, confirma e pausa a luta.', ['ENTER', 'ESPAÇO'], '', 'Botão redondo e cinza. Em pé, fica em cima do manche; deitado, no canto de cima.'),
        (PL('PAUSE'), 'PAUSE', 'Pausa a luta. Nos menus, volta.', ['ESC', 'P'], '', 'O outro botão redondo, do lado do START.'),
    ]


def cabinet():
    scr = stage(F[DEMO].get('stage', 'office'))[0]
    pad = ''.join(f'<div class="cd-b cd-{L}">{BT(L)}<small>{BTN[L][3]}</small></div>' for L in 'GHJVB')
    pad += f'<div class="cd-b cd-T duo">{BT("T")}<small>TROCA</small><em>SÓ NAS DUPLAS</em></div>'
    return f'''<figure class="cab" aria-label="O gabinete do jogo, como aparece em volta da tela">
 <div class="cab-mq"><span class="cab-logo">V4 FIGHTERS<small>TROUBLE WORK</small></span><span class="cab-chips"><i>INSTALAR APP</i><i>TELA CHEIA</i><i>SALA</i><i>MANUAL</i><i class="snd">🔊</i></span><span class="co c1">1</span></div>
 <div class="cab-scr" style="background-image:url({scr})">{spr(DEMO, 'idle', 'em guarda', 'px s1')}{spr(RIVAL, 'idle', 'em guarda', 'px s2 flip')}<span class="co c2">2</span></div>
 <div class="cab-deck">
  <div class="cd-stick"><span class="k ks big">{_svg(_sym('sn', lambda: _sym_stick('n')), STICK_N, 'manche', (80, 80))}</span><b>MOVER</b><span class="co c3">3</span></div>
  <div class="cd-pills">{PL('START')}<span class="coin" title="só enfeite: o jogo é de graça">25¢</span>{PL('PAUSE')}<span class="co c4">4</span></div>
  <div class="cd-pad">{pad}<span class="co c5">5</span></div>
 </div>
 <figcaption>O gabinete que aparece em volta da tela do jogo. <b>1</b> botões do topo (o 🔊 liga e desliga o som) · <b>2</b> a tela · <b>3</b> o manche (lá está escrito MOVER) · <b>4</b> dois botões pequenos, START e PAUSE (a moedinha de 25¢ é enfeite: o jogo é de graça) · <b>5</b> os botões de golpe. O T tracejado só aparece nas duplas.</figcaption>
</figure>'''


def rose():
    lab = {'ul': 'PULA PRA TRÁS', 'u': 'PULA', 'ur': 'PULA PRA FRENTE', 'l': 'ANDA PRA TRÁS', 'n': 'SOLTO: FICA PARADO', 'r': 'ANDA PRA FRENTE',
           'dl': 'AGACHA', 'd': 'AGACHA', 'dr': 'AGACHA'}
    cells = ''.join(f'<div class="rz{" mid" if d == "n" else ""}">{ST(d)}<b>{lab[d]}</b></div>' for d in ('ul', 'u', 'ur', 'l', 'n', 'r', 'dl', 'd', 'dr'))
    return f'<div class="rose">{cells}</div>'


ARROW_SVG = {k: f'<svg viewBox="0 0 52 46" aria-hidden="true"><path transform="rotate({r} 26 23)" d="{ARROW_D}"/></svg>' for k, r in (('↑', 0), ('→', 90), ('↓', 180), ('←', 270))}


def keyboard():
    fun = {'W': ('mv', '↑'), 'A': ('mv', '←'), 'S': ('mv', '↓'), 'D': ('mv', '→'), 'G': ('G', 'SOCO'), 'H': ('H', 'CHUTE'), 'J': ('J', 'FORTE'),
           'V': ('V', 'DEFESA'), 'Z': ('V', 'DEFESA'), 'B': ('B', 'ESPECIAL'), 'T': ('T', 'TROCA'), 'P': ('ps', 'PAUSE')}
    rows = ''
    for r, keys in enumerate(('QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM')):
        cells = ''
        for k, ch in enumerate(keys):
            col = 2 * k + r + 1
            if ch in fun:
                cls, lab = fun[ch]
                inner = ARROW_SVG[lab] if lab in ARROW_SVG else lab
                cells += f'<span class="key on k{cls}" style="grid-column:{col}/span 2">{ch}<em>{inner}</em></span>'
            else:
                cells += f'<span class="key" style="grid-column:{col}/span 2">{ch}</span>'
        rows += f'<div class="kb-row">{cells}</div>'
    arrows = ''.join(f'<span class="key on kmv a-{c}">{ARROW_SVG[a]}</span>' for a, c in (('↑', 'u'), ('←', 'l'), ('↓', 'd'), ('→', 'r')))
    extra = ('<div class="kb-extra"><span class="key on kps wide">ESC<em>PAUSE</em></span><span class="key on kst wider">ESPAÇO<em>START</em></span>'
             f'<span class="key on kst wide">ENTER<em>START</em></span><span class="arrows">{arrows}</span></div>')
    legend = ''.join(f'<li><i class="sw {c}"></i>{t}</li>' for c, t in (('kmv', 'W A S D ou setas = MANCHE'), ('kG', 'G = SOCO'), ('kH', 'H = CHUTE'), ('kJ', 'J = FORTE'),
                                                                         ('kV', 'V ou Z = DEFESA'), ('kB', 'B = ESPECIAL'), ('kT', 'T = TROCA'), ('kst', 'ENTER ou ESPAÇO = START'), ('kps', 'ESC ou P = PAUSE')))
    return (f'<details class="kb-det" open><summary>VER O TECLADO</summary><figure class="keyb" aria-label="Teclado: as teclas que o jogo usa">{rows}{extra}<ul class="kb-leg">{legend}</ul></figure></details>')


def frente_box():
    return f'''<div class="paper note-frente"><h4>FRENTE É PRO LADO DO ADVERSÁRIO</h4>
 <p>Neste manual, o manche desenhado com a seta pra direita {ST('r', 'FRENTE')} quer dizer <b>FRENTE</b>: na direção de quem você está enfrentando. Os lutadores trocam de lado no meio da luta, e aí a frente troca junto.</p>
 <div class="flipdemo"><div class="fd">{spr(DEMO, 'idle', 'olhando pra direita', 'px')}<p><b>OLHANDO PRA DIREITA</b>FRENTE = seta → ou <kbd>D</kbd><br>golpe longo: <kbd>D</kbd> + <kbd>J</kbd></p></div>
 <div class="fd r"><p><b>OLHANDO PRA ESQUERDA</b>FRENTE = seta ← ou <kbd>A</kbd><br>golpe longo: <kbd>A</kbd> + <kbd>J</kbd></p>{spr(DEMO, 'idle', 'olhando pra esquerda', 'px flip')}</div></div>
 <p class="tnote">O mesmo vale pro pulo: <kbd>W</kbd> + FRENTE pula pra frente; <kbd>W</kbd> + TRÁS, pra trás.</p></div>'''


def celular_box():
    cores = ' · '.join(f'{BT(L)} {BTN[L][4]} {BTN[L][3].lower()}' for L in 'GHJVB')
    return f'''<div class="paper phone-box"><h4>{ICON('phone', 'celular', 'ka ph-i')} NO CELULAR, O ESSENCIAL</h4><ol>
 <li><b>Deite o celular.</b> A luta ocupa a tela toda e os controles ficam nos cantos.</li>
 <li><b>Decore pela cor.</b> <span class="cores">{cores}</span>. Deitado, os botões mostram só a letra.</li>
 <li><b>Em PRESS START, toque no botão START</b> {PL('START', '')}. Ali, tocar no meio da tela não faz nada.</li>
 <li><b>Nos menus, toque direto na opção.</b> Na escolha de lutador, um toque no rosto já escolhe.</li></ol>
 <p class="tnote">App, tela cheia e som: {fase('celular')}.</p></div>'''


def s_controle():
    rows = ''
    for ic, name, what, keys, extra, phone in controls():
        kk = ''.join(KY(k) for k in keys)
        rows += (f'<div class="ctl"><div class="ctl-ic">{ic}</div><div class="ctl-t"><b>{name}</b><p>{what}</p></div>'
                 f'<div class="ctl-kb"><small>TECLADO</small><span class="cmd">{kk}</span>{f"<em>{extra}</em>" if extra else ""}</div>'
                 f'<div class="ctl-ph"><small>CELULAR</small><p>{phone}</p></div></div>')
    return section('controle', f'''
{cabinet()}
{celular_box()}
{sub_h('O QUE CADA UM FAZ', 'TABELA')}
<div class="ctls paper">{rows}</div>
{sub_h('O MANCHE EM 8 DIREÇÕES', 'ROSA DOS VENTOS')}
<div class="two">
 {rose()}
 {frente_box()}
</div>
{sub_h('NO TECLADO', 'COMPUTADOR')}
{keyboard()}
{tip(f'Nos menus: {ST("u")}{ST("d")} escolhem (na tela de lutadores, {ST("l")}{ST("r")} também), {BT("G")} ou <kbd>Enter</kbd> confirmam e {BT("V")} volta. No celular, toque direto na opção.', 'NOS<br>MENUS', '#3f7ae0')}''',
                   'Um manche, os botões de golpe e dois botões pequenos, START e PAUSE. No computador, cada botão tem a tecla com a mesma letra.', (3600, 4700))


# ---------------------------------------------------------------- FASE 3
def s_passos():
    n_long = sum(1 for i in ROSTER if 'long' in F[i]['moves'])
    flow = [('INSERT COIN', cmd(PL('START'), OR, BT('G')), 'É o jeito de fliperama de dizer COMECE: o jogo é de graça. Toque na tela ou aperte START (ou G). É aqui que o som liga.'),
            ('ABERTURA', cmd(PL('START'), OR, BT('G')), 'Um filme curto conta a história. START ou G pula (tocar na tela, aqui, não pula).'),
            ('PRESS START', cmd(PL('START')), 'Aperte START (no teclado, <kbd>Enter</kbd>). No celular, toque no botão START: aqui, tocar no meio da tela não faz nada.'),
            ('MODO DE JOGO', cmd(ST('u'), ST('d'), THEN, BT('G')), 'Escolha <b>ARCADE</b> (contra a CPU), <b>ARENA ONLINE</b> ou <b>RANKING</b>. No celular, toque na opção.'),
            ('ESCOLHA O LUTADOR', cmd(ST('l'), ST('r'), THEN, BT('G')), f'<b>Primeira vez? Escolha o {fname(STARTER)}</b>, que tem tudo na média. Um toque no rosto já escolhe. A CPU gira a roleta e para no seu primeiro rival (cada lutador tem os seus).'),
            ('CONVERSA ▸ FIGHT!', cmd(BT('G'), OR, BT('V')), f'Os dois trocam três falas: {BT("G")} (ou um toque) mostra a próxima, {BT("V")} pula a conversa, ou só espere. Aí: ROUND 1... FIGHT!')]
    fl = ''.join(f'<li><span class="sn">{k}</span><b>{t}</b>{c}<p>{d}</p></li>' for k, (t, c, d) in enumerate(flow, 1))
    steps = [('ANDAR', cmd(ST('l', 'TRÁS'), OR, ST('r', 'FRENTE')), 'walk', 'Empurre o manche pra frente ou pra trás. Pra trás você anda mais devagar.', kb('A') + ' · ' + kb('D')),
             ('PULAR', cmd(ST('u')), 'jump', f'Pule pra passar por cima de magias e golpes baixos. Na diagonal ({ST("ur")} ou {ST("ul")}) o pulo vai pra frente ou pra trás.', kb('W') + ' · ' + kb('W', 'FRENTE')),
             ('PULO DUPLO', cmd(ST('u'), THEN, COND(AIR(), ''), ST('u')), 'jump2', f'Ainda no ar, empurre {ST("u")} de novo: um segundo impulso, até pra outra direção. Um por pulo.', kb('W') + ' ▸ ' + kb('W')),
             ('AGACHAR', cmd(ST('d', 'SEGURE')), 'crouch', 'Segure o manche pra baixo. Agachado, os seus golpes viram golpes baixos.', kb('S')),
             ('DEFENDER EM PÉ', cmd(BT('V', 'SEGURE')), 'block', f'Segure {BT("V")} quando o outro atacar: o golpe tira só {BLOCK_PCT}% do dano. Não segura golpe baixo!', kb('V') + ' ou ' + kb('Z')),
             ('DEFENDER AGACHADO', cmd(ST('d'), PLUS, BT('V')), 'crouchBlock', 'Segure os dois juntos: segura os golpes baixos. Não segura quem cai de cima, no pulo!', kb('S', 'V')),
             ('SOCO', cmd(BT('G')), 'punch', 'O golpe mais rápido. Tira pouco, mas sai na hora.', kb('G')),
             ('CHUTE', cmd(BT('H')), 'kick', 'Médio em tudo: alcance, força e velocidade.', kb('H')),
             ('FORTE', cmd(BT('J')), 'heavy', f'Demora pra sair, mas tira bastante e empurra. Solte o manche antes: com {ST("r")} segurado, o {BT("J")} vira o GOLPE LONGO (lição 10).', kb('J')),
             ('GOLPE LONGO', cmd(ST('r', 'FRENTE'), PLUS, BT('J')), 'long', f'Segure o manche pra FRENTE e aperte {BT("J")}: um golpe lento que acerta de longe. Não gasta barra. {n_long} dos {len(ROSTER)} lutadores têm.', kb('FRENTE', 'J') + ': ' + kb('D', 'J') + ' olhando pra direita, ' + kb('A', 'J') + ' pra esquerda'),
             ('ESPECIAL', cmd(COND(MT('h')), BT('B')), 'special', 'Quando a barra azul enche, aparece MAGIA OK e pisca <kbd>B</kbd> SOLTA A MAGIA: aperte B. No começo da luta ela está vazia: bata primeiro. No ar, o B não faz nada.', kb('B'))]
    st = ''.join(f'<article class="step"><span class="sn">{k}</span><div class="st-art">{spr(DEMO, key, t.lower())}</div><div class="st-t"><h4>{t}</h4>{c}<p>{d}</p><p class="kh">TECLADO: {kbd}</p></div></article>'
                 for k, (t, c, key, d, kbd) in enumerate(steps, 1))
    drill = [f'Vá no <b>ARCADE</b> e treine na <b>LUTA 1</b>: é quando a CPU está mais calma.',
             f'Ande até perto do adversário ({ST("r")}).',
             f'Aperte {BT("G")}, {BT("H")} e {BT("J")} e compare a velocidade de cada golpe.',
             f'Quando ele atacar, segure {BT("V")}. Viu a vida cair bem menos?',
             f'Agache e dê uma rasteira: {cmd(ST("d"), PLUS, BT("H"))}.',
             f'Encheu a barra azul? {BT("B")}!']
    fkeys = ('<p class="fkeys"><b>NO COMPUTADOR</b>, numa luta do arcade: <kbd>F3</kbd> liga o TREINO: o relógio para, a sua barra fica sempre cheia e a vida de ninguém desce da metade. '
             '<kbd>F3</kbd> de novo desliga. <b>Treino não vale ranking:</b> usou F3 ou a câmera lenta (F2), aquela partida do arcade não grava pontos. Na arena online, F2 e F3 não funcionam. <kbd>F1</kbd> mostra as caixas de acerto (a pausa chama de HITBOXES): <b class="red">vermelho</b> = onde o golpe pega; '
             '<b class="grn">verde</b> = onde dá pra apanhar. <kbd>F2</kbd> deixa tudo em câmera lenta. No celular não tem modo treino.</p>')
    return section('passos', f'''
{sub_h('DA TELA INICIAL ATÉ A LUTA', 'CAMINHO')}
<ol class="flow">{fl}</ol>
<p class="more">Os quadros escuros com <b>?</b> na escolha estão travados: veja o {fase('arcade', 'MODO ARCADE')}.</p>
{sub_h(f'AGORA, MEXA O LUTADOR · COM A {fname(DEMO)}', f'{len(steps)} LIÇÕES')}
<div class="steps">{st}</div>
<div class="paper drill">{BURST('ONDE<br>TREINAR?', '#2bb673', 'sm')}<div><ol>{"".join(f"<li>{x}</li>" for x in drill)}</ol>{fkeys}</div></div>''',
                   'Do botão de ligar até o primeiro especial, um passo de cada vez.', (2400, 5500))


# ---------------------------------------------------------------- FASE 4
def s_tela():
    bg = stage(F[RIVAL].get('stage', 'office'))[0]
    L, R = DEMO, RIVAL
    mock = f'''<figure class="hm-wrap"><div class="hm" style="background-image:url({bg})" role="img" aria-label="Tela da luta com as partes numeradas">
 <div class="hm-side l">{img(face(L), '', 'px hm-pt')}<div class="hm-bars"><div class="hm-nr"><b>{fname(L)}</b><span>012340</span></div><div class="hm-life"><i class="gh" style="width:76%"></i><i class="fi" style="width:68%"></i></div><div class="hm-rd"><i class="on"></i><i></i></div></div></div>
 <div class="hm-timer">47</div>
 <div class="hm-side r"><div class="hm-bars"><div class="hm-nr"><span>004120</span><b>{fname(R)}</b></div><div class="hm-life"><i class="gh" style="width:48%"></i><i class="fi" style="width:34%"></i></div><div class="hm-rd"><i></i><i></i></div></div>{img(face(R), '', 'px hm-pt')}</div>
 {spr(L, 'kick', 'chutando', 'px hm-f1')}{spr(R, 'hit', 'apanhando', 'px hm-f2 flip')}
 <div class="hm-combo"><b>3</b><span>HITS</span></div>
 <div class="hm-g l"><div class="hm-hint"><kbd>B</kbd> SOLTA O SUPER</div><div class="g1 on"><i style="width:100%"></i><span>MAGIA <b>OK</b></span></div><div class="g2 on"><i style="width:100%"></i><span>MAXIMUM</span></div></div>
 <div class="hm-g r"><div class="g1"><i style="width:62%"></i><span>MAGIA</span></div><div class="g2"><i style="width:0"></i><span>SUPER</span></div></div>
 <span class="co" style="left:1%;top:15%">1</span><span class="co" style="left:25%;top:13.5%">2</span><span class="co" style="left:50%;top:16%;translate:-50% 0">3</span>
 <span class="co" style="left:12%;top:19%">4</span><span class="co" style="left:31%;top:.8%">5</span><span class="co" style="left:33%;top:83%">6</span>
 <span class="co" style="left:33%;top:91%">7</span><span class="co" style="left:17%;top:28%">8</span>
</div></figure>'''
    items = [('RETRATO E NOME', f'<span class="mi mi-pt">{img(face(L), "", "px")}<b>{fname(L)}</b></span>', 'Quem está lutando. Você é o da esquerda. Na arena online aparece também o apelido de quem joga.'),
             ('BARRA DE VIDA', f'<span class="mi">{lifebar(68, 8)}</span>', 'A parte amarela é a vida que resta. O pedaço vermelho mostra o que você acabou de perder.'),
             ('TEMPO', '<span class="mi mi-timer">47</span>', f'{ROUND_S} segundos por round. Nos 10 finais ele fica vermelho, pisca e apita.'),
             ('ROUNDS', '<span class="mi mi-rd"><i class="on"></i><i></i></span>', 'Cada losango aceso é um round ganho. Acendeu os 2, venceu a luta.'),
             ('PONTOS', '<span class="mi mi-score">012340</span>', f'{PER_DMG} pontos por ponto de dano, mais o bônus do fim do round.'),
             ('BARRA DE ESPECIAL', f'<span class="mi">{gauge(1)}</span>', 'Duas barrinhas no canto de baixo, do seu lado: a azul (MAGIA) em cima, a amarela (SUPER) embaixo. Quando a azul enche, aparece MAGIA OK e pisca <kbd>B</kbd> SOLTA A MAGIA: aperte B. ' + fase('barra', 'Mais na FASE ' + str(NUM['barra'])) + '.'),
             ('MAXIMUM', f'<span class="mi">{gauge(2)}</span>', 'A amarela encheu: ela pisca MAXIMUM e o aviso vira <kbd>B</kbd> SOLTA O SUPER.'),
             ('HITS', '<span class="mi mi-hits"><b>3</b>HITS</span>', 'Um COMBO: golpes seguidos que o outro não consegue defender, porque ainda está tonto do anterior. O número aparece do 2º acerto em diante, do lado de quem bate.')]
    leg = ''.join(f'<li><span class="co">{k}</span><div><b>{t}</b>{m}<p>{d}</p></div></li>' for k, (t, m, d) in enumerate(items, 1))
    return section('tela', f'''
{mock}
<ol class="legend paper">{leg}</ol>
<div class="two">
{tip(f'Olhe o <b>pé</b> dos lutadores: um brilho <b style="color:#1f6dff">azul</b> no chão <span class="foot b"></span> quer dizer magia pronta; <b style="color:#b78a00">dourado</b> <span class="foot g"></span>, SUPER pronto. Serve pra você e pra desconfiar do adversário.', 'DICA!', '#ffd23f', 'van' if 'van' in F else None)}
{tip(f'Nas <b>duplas</b> os losangos somem e aparece o parceiro no banco: retrato, vida e o aviso {BT("T")} TROCA quando dá pra chamar.', 'DUPLAS', '#e9eef7', 'dias' if 'dias' in F else None)}
</div>''', 'Tudo o que aparece em volta dos lutadores, numerado.', (1800, 2250))


# ---------------------------------------------------------------- FASE 5
def s_barra():
    heavy = F[DEMO]['moves']['heavy']['damage']
    states = [('COMEÇO DA LUTA', gauge(0, False), f'As duas vazias. O {BT("B")} ainda não faz nada: bata primeiro.'),
              ('1 · A AZUL ENCHEU', gauge(1), f'Aparece MAGIA OK e pisca o aviso. Aperte {BT("B")}: sai a <b>MAGIA</b>. Gasta a azul.'),
              ('2 · AS DUAS ENCHERAM', gauge(2), f'Pisca MAXIMUM. Aperte {BT("B")}: sai o <b>SUPER</b>. Gasta tudo. Quer só a magia? {cmd(ST("d"), PLUS, BT("B"))}')]
    big = '<ol class="levels">' + ''.join(f'<li><h4>{t}</h4><div class="lv-g">{g}</div><p>{d}</p></li>' for t, g, d in states) + '</ol>'
    fills = [('ACERTAR', cmd(BT('G'), BT('H'), BT('J')), 'O que mais enche. Todo golpe de contato que acerta vale <b>1,5×</b> o dano dele em barra, até magia e super de perto e os raios.', f'Um golpe forte que acerta: <b>+{round(heavy * 1.5)}</b>. Dois = quase meia barra.'),
             ('APANHAR', spr(DEMO, 'hit', 'apanhando', 'px mini'), 'Levou um golpe? A sua barra sobe também: <b>1,1×</b> o dano que você levou.', 'Quem apanha junta raiva.'),
             ('DEFENDER', cmd(BT('V')), 'Golpe na defesa: os dois ganham um pouco, quem bateu e quem defendeu.', 'Defender não é perder tempo.'),
             ('SOLTAR GOLPE', cmd(BT('G')), 'Soco, chute ou forte, até no vazio, enche um pouquinho: <b>+3</b>. Soltar magia ou super não dá esses +3, e o que voa (projétil, portal, bomba) e o agarrão não enchem a barra de quem soltou.', 'Ficar parado não enche nada.')]
    fl = ''.join(f'<div class="fill"><h4>{t}</h4><div class="f-ic">{c}</div><p>{d}</p><small>{x}</small></div>' for t, c, d, x in fills)
    ok, no = ICON('ok', 'sim', 'kc'), ICON('no', 'não', 'kc')
    table = (f'<table class="btab"><thead><tr><th>A SUA BARRA</th><th>{BT("B")}<br>faz</th><th>{cmd(ST("d"), PLUS, BT("B"))}<br>faz</th></tr></thead><tbody>'
             f'<tr><td>{MT("q", "AINDA ENCHENDO")}</td><td>{no} nada</td><td>{no} nada</td></tr>'
             f'<tr><td>{MT("h")}</td><td>{ok} <b>MAGIA</b><small>gasta a azul</small></td><td>{ok} <b>MAGIA</b><small>gasta a azul</small></td></tr>'
             f'<tr><td>{MT("f")}</td><td>{ok} <b>SUPER</b><small>gasta tudo</small></td><td>{ok} <b>MAGIA</b><small>gasta só a amarela</small></td></tr>'
             f'<tr><td>{AIR()}</td><td>{no} nada</td><td>{no} nada</td></tr></tbody></table>')
    extra = []
    if 'crm' in F and F['crm']['moves'].get('long', {}).get('meterCost'):
        extra.append(f'<li>{img(face("crm"), "CRM", "px")}<span>O golpe longo do <b>CRM</b> (o míssil teleguiado) gasta <b>1/4 da barra</b>. Sem isso, {cmd(ST("r"), PLUS, BT("J"))} dele não solta nada: solte o manche pra dar o golpe forte.</span></li>')
    if 'dias' in F and 'release' in F['dias']['moves']:
        extra.append(f'<li>{img(face("dias"), "DIAS", "px")}<span>O <b>Dias</b> com o escudo de moedas ativo: o {BT("B")} lança as moedas e <b>não gasta</b> nada.</span></li>')
    for i in MORPH:
        extra.append(f'<li>{img(face(i), fname(i), "px")}<span>Quando o <b>{tname(i)}</b> vira <b>{fname(MORPH[i])}</b> no 2º round, a barra dele passa inteira pro bicho.</span></li>')
    return section('barra', f'''
{sub_h('OS DOIS NÍVEIS, IGUAL NA TELA', 'INFOGRÁFICO')}
{big}
{sub_h('COMO ELA ENCHE', 'QUATRO JEITOS')}
<div class="fills">{fl}</div>
{sub_h('O QUE O BOTÃO B SOLTA', 'TABELA')}
<div class="paper tabwrap">{table}</div>
<div class="two">
{tip('<b>A barra não zera entre os rounds.</b> Guardou uma barra cheia no fim do round 1? Ela está lá no começo do round 2. Nas duplas, cada lutador tem a sua.', 'NÃO<br>ESQUEÇA!', '#29a3ff', 'edgard' if 'edgard' in F else None)}
<div class="paper exc"><h4>CASOS ESPECIAIS</h4><ul>{"".join(extra)}</ul></div>
</div>''', 'As duas barrinhas no canto de baixo, do seu lado (a vida é a barra grande lá em cima). Enchem na porrada e liberam os golpes mais fortes.', (1900, 3150))


# ---------------------------------------------------------------- FASE 6
def s_regras():
    gr = grabbers()
    grab_faces = ''.join(img(sprite(i, MORPH_FRAMES[-1] if MORPH_FRAMES else 0, 'morph4') if i in MORPH_OF else face(i), fname(i), 'px' + (' ri-mo' if i in MORPH_OF else '')) for i, _ in gr)
    grab_txt = lista(f'{"a magia" if k == "special" else "o super"} {"d" + ("a" if F[i].get("gender") == "f" else "o")} {tname(i) if i not in MORPH_OF else fname(i)}' for i, k in gr) or 'alguns especiais'
    grab_txt = grab_txt.replace('do A COISA', "d'A COISA")
    heavy_i = max(ROSTER, key=lambda i: F[i]['stats']['weight'])
    light_i = min(ROSTER, key=lambda i: F[i]['stats']['weight'])
    rules = [('MELHOR DE 3', '<span class="ri ri-rd"><i class="on"></i><i class="on"></i></span>', f'Quem ganhar 2 rounds leva a luta. Nas duplas é uma luta só, de {TAG_TIME} segundos.'),
             (f'{ROUND_S} SEGUNDOS', f'<span class="ri ri-timer">{ROUND_S}</span>', 'Cada round tem um relógio. Nos 10 finais ele fica vermelho e apita.'),
             ('TIME OVER', f'<span class="ri ri-to"><span class="ri-timer red">00</span>{lifebar(70)}{lifebar(35)}</span>', 'Acabou o tempo sem nocaute? Vence quem tiver mais vida. Round empatado: os dois levam. Se a luta inteira empatar, no arcade conta como derrota: aparece a tela CONTINUAR. Nas duplas vale a vida somada da dupla.'),
             ('K.O.', f'<span class="ri">{lifebar(0, 0, "ko")}<b class="ri-ko">K.O.</b></span>', 'Vida zerada é nocaute. O último golpe passa em câmera lenta.'),
             ('PERFECT', f'<span class="ri">{lifebar(100)}<b class="ri-pf">PERFECT</b></span>', f'Venceu o round sem perder nenhum pedacinho de vida: +{BONUS["PERFECT"]} pontos.'),
             (f'DEFESA = {BLOCK_PCT}%', f'<span class="ri">{BT("V", "SEGURE")}{lifebar(85, 4)}</span>', f'Na defesa, o golpe tira só {BLOCK_PCT}% do dano e empurra a metade.'),
             ('AGARRÃO', f'<span class="ri ri-faces">{grab_faces}{ST("u", "PULE")}</span>', f'Não existe botão de agarrão: ele é {grab_txt}. Agarrão ignora a defesa. Ninguém agarra quem está no ar ou caído: pule.'),
             ('CAIU? RESPIRA', f'<span class="ri">{spr(RIVAL, "down", "caído", "px ri-spr")}</span>', 'Alguns golpes derrubam. Enquanto você está no chão, ninguém te acerta. Espere levantar.'),
             ('COMBO', '<span class="ri ri-hits"><b>3</b>HITS</span>', 'Golpes seguidos que o outro não consegue defender. A partir do 3º golpe seguido, cada um vale 10% menos, e nunca menos que 60% do normal.'),
             ('PESO', f'<span class="ri ri-faces">{img(face(heavy_i), fname(heavy_i), "px")}{ICON("scale", "balança", "kc")}{img(face(light_i), fname(light_i), "px")}</span>', f'Lutador pesado é menos empurrado e leva um pouco menos de dano. O leve voa longe. O mais pesado é {"o" if F[heavy_i].get("gender") != "f" else "a"} {tname(heavy_i)}; {"a" if F[light_i].get("gender") == "f" else "o"} mais leve, {"a" if F[light_i].get("gender") == "f" else "o"} {tname(light_i)}.')]
    rr = ''.join(f'<article class="rule"><span class="rn">{k}</span><div class="r-ic">{ic}</div><h4>{t}</h4><p>{d}</p></article>' for k, (t, ic, d) in enumerate(rules, 1))
    ok, no = ICON('ok', 'segura', 'kc'), ICON('no', 'não segura', 'kc')
    ghj = BT('G') + BT('H') + BT('J')
    matrix = [('GOLPE EM PÉ', cmd(ghj), ok, ok), ('GOLPE BAIXO', cmd(ST('d'), PLUS, ghj), no, ok), ('GOLPE NO AR', cmd(ST('u'), THEN, ghj), ok, no),
              ('MAGIA E PROJÉTIL', '<small>bolas, tiros, ondas, raios</small>', ok, ok), ('AGARRÃO', f'<small>{lista(tname(i) if i not in MORPH_OF else fname(i) for i, _ in gr)}</small>', no, no)]
    mx = ''.join(f'<tr><th>{t}<span class="dt-c">{s}</span></th><td>{a}</td><td>{b}</td></tr>' for t, s, a, b in matrix)
    bs, cb = pose(DEMO, 'block'), pose(DEMO, 'crouchBlock')
    hb = 96
    hc = round(hb * cb[2] / bs[2]) if bs and cb else hb
    exc = ''
    for i in MORPH.values():
        M = F[i]['moves']
        air_ok = [k for k in ('airPunch', 'airKick', 'airHeavy') if k in M and not M[k].get('overhead')]
        low_ok = [k for k in ('lowPunch', 'lowKick', 'lowHeavy') if k in M and not M[k].get('low')]
        names = {'airPunch': 'o soco no ar', 'airKick': 'a voadora', 'airHeavy': 'o forte no ar', 'lowPunch': 'o soco baixo', 'lowKick': 'a rasteira', 'lowHeavy': 'o forte baixo'}
        bits = []
        if air_ok:
            bits.append(f'{lista(names[k] for k in air_ok)} {"dela também se defendem" if len(air_ok) > 1 else "dela também se defende"} agachado')
        if low_ok:
            bits.append(f'{lista(names[k] for k in low_ok)} {"dela se defendem" if len(low_ok) > 1 else "dela se defende"} até em pé')
        if bits:
            exc += f'<p class="tnote"><b>Exceção: {fname(i)}.</b> Contra ela, {"; e ".join(bits)}.</p>'
    return section('regras', f'''
<div class="rules">{rr}</div>
{sub_h('ALTO, BAIXO OU NO AR: QUAL DEFESA SEGURA O QUÊ', 'TABELA DA DEFESA')}
<div class="paper tabwrap"><table class="dtab"><thead><tr><th>O GOLPE QUE VEM</th><th>{spr(DEMO, 'block', 'defesa em pé', 'px', f'height:{hb}px')}<span>EM PÉ {BT('V')}</span></th><th>{spr(DEMO, 'crouchBlock', 'defesa agachada', 'px', f'height:{hc}px')}<span>AGACHADO {cmd(ST('d'), PLUS, BT('V'))}</span></th></tr></thead><tbody>{mx}</tbody></table>
<p class="tnote">Rasteira é o chute baixo ({cmd(ST('d'), PLUS, BT('H'))}); os três golpes baixos seguem a mesma regra.</p>{exc}</div>''', 'O que decide quem ganha. Dez regras e uma tabela.', (1750, 3300))


# ---------------------------------------------------------------- FASE 7: dicas
def s_dicas():
    tips = [('DEFENDA PRIMEIRO', cmd(BT('V', 'SEGURE')), f'Segure {BT("V")} quando o outro atacar: você leva só {BLOCK_PCT}% do dano. Quem começa costuma esquecer que a defesa existe.', DEMO),
            ('ALTO OU BAIXO?', cmd(ST('d'), PLUS, BT('V')), f'Ele agachou pra dar rasteira? Defenda agachado ({cmd(ST("d"), PLUS, BT("V"))}). Ele pulou em você? Defenda em pé ({BT("V")}).', 'edgard'),
            ('NÃO PULE À TOA', cmd(ST('u')), f'No ar não dá pra defender, e quem pula demais vira alvo. Pule ({ST("u")}) pra fugir de magia e de golpe baixo.', 'michael'),
            (f'COMECE PELO {fname(STARTER)}', '<span class="d-avg">1,00</span>', f'{"Ele" if F[STARTER].get("gender") != "f" else "Ela"} tem tudo na média (1,00): nem lento, nem frágil. Bom pra aprender o jogo.', STARTER),
            ('OLHE O PÉ', '<span class="d-feet"><span class="foot b"></span><span class="foot g"></span></span>', 'Brilho azul no chão: ele tem magia. Dourado: tem SUPER. Prepare a defesa.', 'van'),
            ('MAGIA SEM GASTAR TUDO', cmd(COND(MT('f')), ST('d'), PLUS, BT('B')), f'Com a barra cheia, {cmd(ST("d"), PLUS, BT("B"))} solta só a magia e gasta só a amarela: a azul continua cheia e dá outra magia. Pro SUPER, encha a amarela de novo.', 'kevin'),
            ('DISTÂNCIA É ARMA', cmd(ST('r', 'FRENTE'), PLUS, BT('J')), 'O golpe longo acerta de longe e não gasta barra (menos o do CRM, que gasta 1/4). Ótimo contra quem só vem batendo.', 'landim'),
            ('AGARRÃO? PULE!', cmd(ST('u')), f'Viu alguém vindo pra agarrar? Agarrão atravessa a defesa: a saída é pular ({ST("u")}).', 'laura'),
            ('APANHAR ENCHE A BARRA', cmd(MT('h', '')), 'Tomou uma surra? A sua barra encheu. Devolva com a magia ou o super.', 'eneias'),
            ('OLHE O TEMPO', '<span class="ri-timer d-ic">09</span>', 'Relógio acabando e você com mais vida? Defenda até o fim: no TIME OVER ganha quem tem mais vida.', 'leo'),
            ('GUARDE ENERGIA PRO 2º ROUND', cmd(MT('f', '')), f'Contra o Mundim, chegue ao 2º round com barra: é quando ele vira {fname(MORPH.get("mundim", "mundim"))}, com o dobro do tamanho.', 'mundim')]
    cards = []
    for k, (t, ic, d, who) in enumerate(tips, 1):
        who = who if who in F else DEMO
        cards.append(f'<article class="dica{" top" if k <= 5 else ""}" style="--c:{color(who)}"><span class="dn">{k}</span>'
                     f'{img(face(who), fname(who), "px dface")}<div><h4>{t}</h4><div class="d-cmd">{ic}</div><p>{d}</p></div></article>')
    body = (f'<h3 class="dicas-h">AS 5 QUE MAIS IMPORTAM</h3><div class="dicas top">{"".join(cards[:5])}</div>'
            f'<h3 class="dicas-h">MAIS DICAS</h3><div class="dicas">{"".join(cards[5:])}</div>')
    return section('dicas', body, f'{len(tips)} atalhos pra ganhar a primeira luta. Os 5 primeiros são os que mais importam.', (1300, 2600))


# ---------------------------------------------------------------- FASE 8: arcade
def cpu_words(lv):
    a = AI.get(lv) or {}
    try:
        rf, bc = int(a.get('reaction', 10)), float(a.get('blockChance', .5))
    except ValueError:
        rf, bc = 10, .5
    react = 'quase na hora, em menos de 1/10 de segundo' if rf / 60 < .1 else f'em cerca de 1/{round(60 / rf)} de segundo'
    block = 'quase todos os golpes' if bc >= .75 else 'mais ou menos metade dos golpes' if bc >= .4 else 'poucos golpes'
    pun = ' e revida quando você erra' if a.get('punishBlock') == 'true' else ''
    return f'Defende {block}{pun}. Reage {react}.'


def locked_box():
    if not LOCKED:
        return ''
    faces = ''.join(f'<span class="lk-f">{img(face(i), fname(i), "px")}<i>?</i></span>' for i in LOCKED)
    names = lista(tname(i) for i in LOCKED)
    arc = lista(tname(i) for i in BY_ARCADE)
    boss = tname(BOSSES[-1]) if BOSSES else 'o chefe'
    how = (f'Zere o arcade (vença o {boss} no último andar) e {"os dois ficam liberados" if len(BY_ARCADE) == 2 else "eles ficam liberados" if len(BY_ARCADE) > 2 else arc + " fica liberado"} '
           f'neste aparelho, no arcade e na arena. A tela do final avisa: <b>{" E ".join(fname(i) for i in BY_ARCADE)} {"DESBLOQUEADOS" if len(BY_ARCADE) > 1 else "DESBLOQUEADO"}</b>.') if BY_ARCADE else ''
    return (f'<div class="paper locked">{ICON("lock", "cadeado", "ka lk-i")}<div class="lk-t"><h4>TRAVADOS: {names.upper()}</h4><div class="lk-faces">{faces}</div>'
            f'<p>{names} {"começam" if len(LOCKED) > 1 else "começa"} com o quadro escuro e o <b>?</b> na escolha de lutador e na arena: aparecem como adversários, mas ainda não dá pra jogar com {"eles" if len(LOCKED) > 1 else "ele"}. {how}</p>'
            '<p class="lk-rumor">E tem gente que jura que existem códigos, digitados na tela de escolha, que acendem os quadros escuros...</p></div></div>')


def s_arcade():
    tw = picture('intro/tower.jpg', 'tower.jpg', 480, 74) if os.path.exists(os.path.join(PUB, 'intro', 'tower.jpg')) else None
    total = RIVALS + len(BOSSES)
    spans = []                                   # [primeira luta, última luta, nível da CPU]
    for k in range(1, total + 1):
        lv = RAMP[min(k - 1, len(RAMP) - 1)]
        if spans and spans[-1][2] == lv:
            spans[-1][1] = k
        else:
            spans.append([k, k, lv])

    def span_txt(a, b):
        return f'LUTA {a}' if a == b else f'LUTAS {a} E {b}' if b == a + 1 else f'LUTAS {a} A {b}'
    ramp_html = ''.join(f'<li><b>{span_txt(a, b)}</b><span>{cpu_words(lv)}</span></li>' for a, b, lv in spans)
    music = all(has_music(i) for i in ROSTER if i not in BOSSES)
    stops = (f'<li class="fl"><span class="fl-n">1-{RIVALS}</span><div class="fl-faces">' + ''.join('<i>?</i>' for _ in range(RIVALS)) +
             f'</div><div class="fl-t"><h4>{RIVALS} RIVAIS DO ELENCO</h4><p>{RIVALS} lutadores diferentes, cada um no seu cenário{" e com a sua música" if music else ""}. Quem são depende do lutador que você escolher.</p></div></li>')
    boss_txt = {'dias': 'No cassino. Rápido, emenda combos (soco, soco, chute, forte) e se protege com o escudo de moedas.',
                'leo': 'Dentro do elevador, subindo a torre.',
                'xablau': 'Antes do topo, o elevador desce ao subsolo, onde o Xablau nasceu. Lento, enorme e bate muito. Não fala: só grunhe.',
                'mundim': f'O último andar. Na primeira vez, em vez da tela VS, uma cena: ele levanta da mesa e vem até você. No 2º round, vira {fname(MORPH.get("mundim", "mundim"))}.'}
    for k, b in enumerate(BOSSES, RIVALS + 1):
        extra = ''
        if b in MORPH:
            extra = f'<span class="fl-morph">2º ROUND: {html.escape(fname(MORPH[b]))} {img(sprite(MORPH[b], MORPH_FRAMES[-1] if MORPH_FRAMES else 0, "morph4"), fname(MORPH[b]))}</span>'
        lk = f'<span class="lk-tag">{ICON("lock", "travado", "kc")} TRAVADO NO COMEÇO</span>' if b in LOCKED else ''
        last = ' last' if b == BOSSES[-1] else ''
        stops += (f'<li class="fl boss{last}" style="--c:{color(b)}"><span class="fl-n">{k}</span><div class="fl-faces">{img(face(b), fname(b))}</div>'
                  f'<div class="fl-t"><small>{html.escape(place(b)).upper()}</small><h4>{html.escape(fname(b))}</h4><p>{boss_txt.get(b, plain(F[b].get("role", "")))}</p>{extra}{lk}</div></li>')
    stops += '<li class="fl secret"><span class="fl-n">?</span><div class="fl-faces"><i>?</i></div><div class="fl-t"><h4>???</h4><p>Dizem que o elevador ainda sobe mais um andar... só pra quem chega ao topo <b>sem perder nenhuma luta</b>. E que, mesmo depois de zerar, o último quadro escuro da escolha continua escuro.</p></div></li>'
    score = ''.join(f'<li><b>{k}</b><span>{v}</span></li>' for k, v in (('GOLPE', f'{PER_DMG} pontos por ponto de dano'), ('VITÓRIA', f'+{BONUS["VITÓRIA"]}'), ('VIDA', f'+{BONUS["VIDA"]} por ponto de vida que sobrou'),
                                                                         ('TEMPO', f'+{BONUS["TEMPO"]} por segundo que sobrou'), ('PERFECT', f'+{BONUS["PERFECT"]}')))
    unl = f' e libera {lista(tname(i) for i in BY_ARCADE)}' if BY_ARCADE else ''
    cards = [('ANTES DE CADA LUTA', f'Os dois trocam três falas rápidas em tela dividida. {BT("G")} mostra a próxima fala, {BT("V")} pula a conversa, ou só espere.'),
             ('CENÁRIO E MÚSICA', 'Cada luta acontece no cenário do adversário, com a música dele' + ('.' if music else ', quando ele tem uma.')),
             ('PERDEU? CONTINUAR?', f'Contagem de 9 a 0. {BT("G")}, <kbd>Enter</kbd> ou um toque: você escolhe o lutador de novo e volta pra <b>mesma luta</b>, com os pontos. {BT("V")} desiste. Luta empatada também conta como derrota.'),
             ('ESCOLHEU UM CHEFE?', 'Se o seu lutador é um dos chefes, no lugar dele você enfrenta a sua própria cópia: a <b>VERSÃO 2.0</b>.'),
             ('ZEROU?', f'Cada lutador tem o seu final{unl} (no arcade e na arena, neste aparelho). Depois a pontuação vai pro RANKING: na primeira vez, o jogo pede o seu nome.')]
    cc = ''.join(f'<div class="acard"><h4>{t}</h4><p>{d}</p></div>' for t, d in cards)
    return section('arcade', f'''
<div class="tower">
 <div class="tw-img">{img(tw, 'A torre da Mundim Corp', 'tw', True) if tw else ''}<span class="tw-lab">MUNDIM CORP · 52 ANDARES</span></div>
 <ol class="route">{stops}</ol>
</div>
{locked_box()}
<div class="two">
 <div class="paper ramp"><h4>A CPU FICA MAIS ESPERTA</h4><ol>{ramp_html}</ol><p class="tnote">Não dá pra escolher a dificuldade: ela sobe sozinha, luta a luta.</p></div>
 <div class="paper score"><h4>PONTUAÇÃO</h4><ul>{score}</ul><p class="tnote">No fim do round os bônus aparecem somados. A pontuação do arcade vai pro RANKING, que vale por temporada: quando começa uma temporada nova, todo mundo volta pro zero.</p></div>
</div>
<div class="acards">{cc}</div>''', f'A campanha contra a CPU: {total} lutas, um andar por luta, até o topo da torre da Mundim Corp.', (2250, 3950))


# ---------------------------------------------------------------- FASE 9: comandos (consulta)
def s_comandos():
    n_long = sum(1 for i in ROSTER if 'long' in F[i]['moves'])
    no_long = [tname(i) for i in ROSTER if 'long' not in F[i]['moves']]
    crm_cost = 'crm' in F and F['crm']['moves'].get('long', {}).get('meterCost')
    dias = 'dias' if 'dias' in F else None
    basics = [(cmd(ST('l', 'TRÁS'), OR, ST('r', 'FRENTE')), 'ANDAR', 'Pra trás é mais devagar.', kb('A') + ' · ' + kb('D')),
              (cmd(ST('u')), 'PULAR', 'Pulo reto.', kb('W')),
              (cmd(ST('ur'), OR, ST('ul')), 'PULAR PRA FRENTE OU PRA TRÁS', 'Diagonal na hora do pulo.', kb('W', 'FRENTE') + ' · ' + kb('W', 'TRÁS')),
              (cmd(COND(AIR(), ''), ST('u')), 'PULO DUPLO', 'Um segundo pulo, no ar.', 'no ar: ' + kb('W')),
              (cmd(ST('d', 'SEGURE')), 'AGACHAR', 'Enquanto segurar.', kb('S')),
              (cmd(BT('V', 'SEGURE')), 'DEFESA EM PÉ', f'Segura golpe em pé, o de quem pula em você e as magias. Tira só {BLOCK_PCT}%. Você, no ar, não defende.', kb('V') + ' ou ' + kb('Z')),
              (cmd(ST('d'), PLUS, BT('V')), 'DEFESA AGACHADA', 'Segura golpe baixo, golpe em pé e magia. Não segura quem cai de cima.', kb('S', 'V')),
              (cmd(BT('G')), 'SOCO', 'Rápido e fraco.', kb('G')),
              (cmd(BT('H')), 'CHUTE', 'Médio.', kb('H')),
              (cmd(BT('J')), 'GOLPE FORTE', 'Lento, tira muito e empurra.', kb('J'))]
    bas = ''.join(f'<div class="brow"><div class="c-cmd">{c}</div><b class="c-eq">=</b><div class="c-res"><h4>{t}</h4><p>{d}</p><p class="kh">TECLADO: {k}</p></div></div>' for c, t, d, k in basics)
    groups = [
        ('GOLPES BAIXOS', '#ff7a1a', 'agachado', [
            (cmd(ST('d'), PLUS, BT('G')), 'SOCO BAIXO', 'Só se defende agachado.', kb('S', 'G'), 'lowPunch'),
            (cmd(ST('d'), PLUS, BT('H')), 'RASTEIRA', 'O chute baixo. Só se defende agachado.', kb('S', 'H'), 'lowKick'),
            (cmd(ST('d'), PLUS, BT('J')), 'FORTE BAIXO', 'O golpe baixo que mais tira. Só se defende agachado.', kb('S', 'J'), 'lowHeavy')]),
        ('GOLPES NO AR', '#29a3ff', 'um por pulo', [
            (cmd(COND(AIR(), ''), BT('G')), 'SOCO AÉREO', 'Só se defende em pé.', 'no ar: ' + kb('G'), 'airPunch'),
            (cmd(COND(AIR(), ''), BT('H')), 'VOADORA', 'O chute no ar. Só se defende em pé.', 'no ar: ' + kb('H'), 'airKick'),
            (cmd(COND(AIR(), ''), BT('J')), 'FORTE AÉREO', 'O aéreo que mais tira. Só se defende em pé.', 'no ar: ' + kb('J'), 'airHeavy')]),
        ('GOLPE LONGO · DE GRAÇA', '#2bb673', 'sem barra', [
            (cmd(ST('r', 'FRENTE'), PLUS, BT('J')), 'GOLPE LONGO', f'Lento, mas acerta de longe e empurra. Não gasta barra' + (' (menos o do CRM, que gasta 1/4 da barra; sem ela, o dele não sai)' if crm_cost else '') + f'. {n_long} dos {len(ROSTER)} lutadores têm' + (f' (não têm: {lista(no_long)}; neles, frente + J é só o forte)' if no_long else '') + '.',
             kb('FRENTE', 'J') + ': ' + kb('D', 'J') + ' olhando pra direita, ' + kb('A', 'J') + ' pra esquerda', 'long')]),
        ('ESPECIAIS DO BOTÃO B · GASTAM BARRA', '#9257e6', 'só no chão', [
            (cmd(COND(MT('h')), BT('B')), 'MAGIA', 'Com a azul cheia, o B solta a magia. Gasta a azul.', kb('B'), 'special'),
            (cmd(COND(MT('f')), BT('B')), 'SUPER', 'Com as duas cheias, o B solta o golpe mais forte do lutador. Gasta tudo.', kb('B'), 'super'),
            (cmd(COND(MT('f')), ST('d'), PLUS, BT('B')), 'MAGIA SEM GASTAR TUDO', 'Com as duas cheias, abaixado: solta só a magia e gasta só a amarela. A azul continua cheia (dá outra magia); pro SUPER, encha a amarela de novo.', kb('S', 'B'), None)]),
        ('SÓ NAS DUPLAS', '#e9eef7', '', [
            (cmd(BT('T')), 'TROCA', f'Aperte com o seu lutador livre, no chão, e o parceiro de pé. No ar, apanhando ou no meio de um golpe, não troca. O parceiro entra num pulo e você vai pro banco recuperar até {TAG_CAP} de vida. Depois espere {TAG_COOL} s pra trocar de novo.', kb('T'), None)]),
    ]
    if dias:
        groups.append(('SÓ DO DIAS', color(dias), '', [
            (cmd(BT('G'), THEN, BT('G'), THEN, BT('H'), THEN, BT('J')), 'COMBO DE PORRADA', 'Golpe que encosta emenda no próximo: soco, soco, chute, forte. Aperte o próximo logo depois do acerto.', kb('G') + ' ▸ ' + kb('G') + ' ▸ ' + kb('H') + ' ▸ ' + kb('J'), ('dias', 'kick')),
            (cmd(COND(MT('f')), BT('B'), THEN, BT('B')), 'ESCUDO + MOEDAS AO ALTO', 'O super põe quatro moedas girando em volta dele. Com o escudo ativo, B de novo lança as que sobraram (não gasta barra).', kb('B') + ' ▸ ' + kb('B'), ('dias', 'release'))]))
    groups.append(('MENUS E PAUSA', '#9aa4b5', '', [
        (cmd(PL('START')), 'START', 'Confirma nos menus e pausa a luta.', kb('Enter') + ' · ' + kb('Espaço'), None),
        (cmd(PL('PAUSE')), 'PAUSE', 'Pausa a luta. Nos menus, volta.', kb('Esc') + ' · ' + kb('P'), None),
        (cmd(BT('G'), OR, BT('V')), 'CONFIRMAR · VOLTAR', 'Nos menus, G confirma e V volta. No celular, toque na opção.', kb('G') + ' · ' + kb('V'), None)]))
    out = ''
    for title, col, tag, rows in groups:
        rr = ''
        for c, t, d, k, sp in rows:
            who, key = (sp if isinstance(sp, tuple) else (DEMO, sp)) if sp else (None, None)
            pic = spr(who, key, t.lower(), 'px c-spr') if who else ''
            rr += f'<div class="crow"><div class="c-cmd">{c}</div><b class="c-eq">=</b><div class="c-res"><h4>{t}</h4><p>{d}</p><p class="kh">TECLADO: {k}</p></div><div class="c-pic">{pic}</div></div>'
        out += f'<div class="cgroup" style="--gc:{col}"><h3>{title}{f"<small>{tag}</small>" if tag else ""}</h3>{rr}</div>'
    legend = (f'<div class="howread paper"><h4>COMO LER OS COMANDOS</h4><ul>'
              f'<li>{ST("r", "FRENTE")}<span><b>manche</b> (ou tecla de direção) pra onde a seta aponta. A seta pra direita é sempre <b>FRENTE</b>, na direção do adversário</span></li>'
              f'<li>{BT("G")}<span><b>aperte</b> o botão</span></li>'
              f'<li>{PLUS}<span><b>junto</b>: segure o primeiro e aperte o segundo</span></li>'
              f'<li>{THEN}<span><b>depois</b>: um em seguida do outro</span></li>'
              f'<li>{ST("d", "SEGURE")}<span><b>SEGURE</b>: mantenha apertado</span></li>'
              f'<li>{COND(MT("h"))}<span><b>condição</b>, não é botão: só funciona com a barra assim (aqui, a azul cheia, MAGIA OK)</span></li>'
              f'<li>{COND(AIR(), "")}<span><b>condição</b>: com o lutador no ar, no meio do pulo</span></li></ul>'
              f'<p>Frente troca de lado com o lutador: olhando pra direita, frente é {kb("D")}; olhando pra esquerda, {kb("A")}. No teclado este manual escreve FRENTE e TRÁS em vez da letra.</p></div>')
    return section('comandos', f'''{legend}
{sub_h('O BÁSICO', f'JÁ VISTO NA FASE {NUM["passos"]}')}
<div class="basics paper">{bas}</div>
{sub_h('O RESTO', 'COM DESENHO')}
<div class="cgroups">{out}</div>''', 'Quase todo lutador faz tudo isto; as exceções estão marcadas. Os especiais de cada um estão nas fichas.', (3250, 6150))


# ---------------------------------------------------------------- FASE 10: lutadores (consulta)
GRUNTS = {k: [g for g in v if isinstance(g, str)] for k, v in (STORY.get('grunts') or {}).items() if isinstance(v, list)}


def bar(label, v, col):
    pct = round(max(.04, min(1, (v - .7) / .65)) * 100)          # a mesma barrinha da tela de escolha: 0,70 vazia, 1,35 cheia
    return f'<div class="st"><span>{label}</span><div class="sb"><i style="width:{pct}%;background:{col}"></i></div><b>{num(v)}</b></div>'


def stats_html(fid):
    st, c = F[fid]['stats'], color(fid)
    return f'<div class="stats">{bar("FORÇA", st["power"], c)}{bar("AGILIDADE", st["speed"], c)}{bar("PODER", st.get("magic", 1), c)}{bar("PESO", st["weight"], c)}</div>'


def move_html(fid, name, label, combo):
    m = F[fid]['moves'].get(name)
    if not m:
        return ''
    ch = ''.join(f'<i>{c}</i>' for c in chips_of(fid, name))
    d = move_desc(fid, name)
    if name == 'long' and m.get('meterCost'):
        d += f' Sem {"1/4" if m["meterCost"] == 25 else str(m["meterCost"]) + "%"} da barra, não sai nada: solte o manche pra dar o golpe forte.'
    return (f'<div class="mv"><div class="mv-top"><span class="mv-lab">{label}</span>{combo}</div>'
            f'<div class="mv-main"><div class="mv-pic">{spr(fid, name, plain(m.get("name", label)).lower())}</div>'
            f'<div class="mv-t"><h5>{plain(m.get("name", label))}</h5><p>{d}</p><p class="mv-chips">{ch}</p></div>'
            f'<b class="dmg"><small>DANO</small>{dmg_of(fid, name)}</b></div></div>')


def moves_html(fid):
    M = F[fid]['moves']
    out = ''
    if 'long' in M:
        lc = cmd(COND(MT('q')), ST('r', 'FRENTE'), PLUS, BT('J')) if M['long'].get('meterCost') else cmd(ST('r', 'FRENTE'), PLUS, BT('J'))
        out += move_html(fid, 'long', 'GOLPE LONGO', lc)
    out += move_html(fid, 'special', 'MAGIA', cmd(COND(MT('h')), BT('B')))
    out += move_html(fid, 'super', 'SUPER', cmd(COND(MT('f')), BT('B')))
    return out


def links_html(fid):
    out = [(b, t) for a, b, t in LINKS if a == fid]
    if not out:
        return ''

    def li(o, t):
        return f'<li>{img(face(o), fname(o), "px")}<span><b>{tname(o)}:</b> {t}</span></li>'
    first, rest = ''.join(li(o, t) for o, t in out[:3]), ''.join(li(o, t) for o, t in out[3:])
    more = f'<details><summary>+ {len(out) - 3} {"LIGAÇÕES" if len(out) - 3 > 1 else "LIGAÇÃO"}</summary><ul>{rest}</ul></details>' if rest else ''
    return f'<div class="links"><h5>LIGAÇÕES</h5><ul>{first}</ul>{more}</div>'


def extras_html(fid):
    x = ''
    M = F[fid]['moves']
    if any(m.get('chain') for m in M.values()):
        seq = cmd(BT('G'), THEN, BT('G'), THEN, BT('H'), THEN, BT('J'))
        x += (f'<div class="xbox"><h5>SÓ ELE: COMBO DE PORRADA</h5>{seq}<p>Golpe que encosta (acertando ou na defesa) emenda no próximo. '
              f'Aperte o botão seguinte logo depois do acerto.</p></div>')
    if 'release' in M:
        x += (f'<div class="xbox"><h5>ESCUDO ATIVO: {plain(M["release"].get("name", ""))}</h5>{cmd(BT("B"))}<div class="xrow">{spr(fid, "release", "lançando moedas", "px")}'
              f'<p>Com as moedas girando, aperte B de novo: ele lança as que sobraram, uma atrás da outra. Não gasta barra.</p></div></div>')
    if F[fid]['stats'].get('inertia'):
        x += '<div class="xbox"><h5>MÁQUINA PESADA</h5><p>O tanque demora a pegar velocidade quando começa a andar e pula mais baixo. Em compensação, é o que mais aguenta.</p></div>'
    if 'long' not in M:
        x += f'<div class="xbox dim"><h5>SEM GOLPE LONGO</h5><p>Aqui, {cmd(ST("r", "FRENTE"), PLUS, BT("J"))} é só o golpe forte.</p></div>'
    return x


def coisa_html(fid):
    mid = MORPH.get(fid)
    if not mid:
        return ''
    fr = MORPH_FRAMES
    pick = [fr[k] for k in (0, 1, 2, 4, len(fr) - 1)] if len(fr) >= 5 else fr
    msgs = MORPH_MSGS + [''] * 5
    caps = [plain(msgs[0]), '', plain(msgs[1]), plain(msgs[2]), fname(mid)]
    strip = ''.join(f'<li>{img(sprite(mid, f, "morph" + str(k)), fname(mid))}{f"<span>{caps[k]}</span>" if caps[k] else ""}</li>' for k, f in enumerate(pick))
    m = F[mid]['moves']
    mv = ''
    if 'long' in m:
        mv += move_html(mid, 'long', 'GOLPE LONGO', cmd(ST('r', 'FRENTE'), PLUS, BT('J')))
    mv += move_html(mid, 'special', 'MAGIA', cmd(COND(MT('h')), BT('B'))) + move_html(mid, 'super', 'SUPER', cmd(COND(MT('f')), BT('B')))
    lk = ' (depois de destravar)' if fid in LOCKED else ''
    return f'''<div class="coisa">
 <div class="co-head">{BURST('2º<br>ROUND!', '#ff3b2f', 'sm')}<div><h4>{fname(mid)}</h4><p class="co-role">{plain(F[mid].get('role', ''))}</p>
 <p>No <b>2º round</b>, sempre, o bicho sai pela cabeça do {tname(fid)}, ergue o corpo dele como marionete e assume a luta: tem <b>o dobro do tamanho</b> de qualquer lutador,
 é rápido, pesado e bate muito mais forte. Acontece até quando é você jogando de {tname(fid)}{lk}, menos nas duplas.</p></div></div>
 <ol class="morph">{strip}</ol>
 {stats_html(mid)}
 <div class="moves">{mv}</div>
</div>'''


def card(fid):
    d = F[fid]
    a = art(fid)
    bg = stage(d.get('stage', 'office'))[0]
    badges = ''
    if fid == STARTER:
        badges += '<span class="fc-badge st">★ BOM PRA COMEÇAR</span>'
    if fid in LOCKED:
        how = f'vença o {tname(BOSSES[-1])} no arcade pra liberar' if fid in BY_ARCADE and BOSSES else 'ainda não dá pra jogar com ele'
        badges += f'<span class="fc-badge lk">{ICON("lock", "travado", "kc")} TRAVADO · {how}</span>'
    aka = f'<span class="fc-aka">{html.escape(AKA[fid])}</span>' if fid in AKA else ''
    tag = plain(d.get('tagline', ''))
    if fid in GRUNTS and GRUNTS[fid]:
        quote = f'<p class="fc-tag nar">{tag}</p><p class="fc-grunt">“{html.escape(GRUNTS[fid][0])}” <small>ele não fala: só grunhe</small></p>'
    else:
        quote = f'<p class="fc-tag">“{tag}”</p>' if tag else ''
    M = d['moves']
    cis = (2200, 2900) if fid in MORPH else (1100 + 330 * (('release' in M) + any(m.get('chain') for m in M.values())) // 2, 1450 + 430 * (('release' in M) + any(m.get('chain') for m in M.values())) // 2)
    return f'''<article class="fc cv" id="lutador-{fid}" style="--c:{color(fid)};--c2:{d["colors"].get("secondary", "#fff")};--cis:{cis[0]}px;--cism:{cis[1]}px">
 <div class="fc-art" style="background-image:url({bg})">{img(a, fname(fid), 'fc-img', True) if a else spr(fid, 'idle', 'em guarda', 'px fc-img')}
  <div class="fc-name"><span class="fc-role">{plain(d.get('role', ''))} · {html.escape(place(fid))}</span><h3>{html.escape(fname(fid))}</h3>{aka}</div>
  <span class="fc-face">{img(face(fid), fname(fid), 'px up')}</span><span class="fc-guard">{spr(fid, 'idle', 'em guarda', 'px')}</span></div>
 <div class="fc-body">
  {f'<div class="fc-badges">{badges}</div>' if badges else ''}
  {quote}
  <p class="fc-bio">{plain(d.get('bio', ''))}</p>
  {links_html(fid)}
  {stats_html(fid)}
  <p class="swipe mv-swipe">↔ ARRASTE PRO LADO: LONGO · MAGIA · SUPER</p>
  <div class="moves">{moves_html(fid)}</div>
  {extras_html(fid)}
  {coisa_html(fid)}
 </div></article>'''


def selos_html():
    used = []
    for i in ORDER + list(MORPH.values()):
        for k in ('long', 'special', 'super'):
            if k in F[i]['moves']:
                used += chips_of(i, k)
    out = ''
    for key, what, ans in SELOS:
        hit = [c for c in used if (c.endswith(key) if key == 'ACERTOS' else c == key)]
        if not hit:
            continue
        chip = 'N ACERTOS' if key == 'ACERTOS' else key
        out += f'<li><i class="chip">{chip}</i><span>{what}{" <b>Contra:</b> " + ans() if ans else ""}</span></li>'
    return f'<div class="paper selos"><h4>OS SELOS DOS GOLPES</h4><ul>{out}</ul></div>' if out else ''


def s_lutadores():
    grid = ''
    for i in ORDER:
        tags = (f'<em class="g-lk">{ICON("lock", "travado", "kc")}TRAVADO</em>' if i in LOCKED else '') + ('<em class="g-st">★ PRA COMEÇAR</em>' if i == STARTER else '')
        grid += f'<a href="#lutador-{i}" style="--c:{color(i)}"{" class=lk" if i in LOCKED else ""}>{img(face(i), fname(i), "px up")}<span>{html.escape(fname(i))}</span>{tags}</a>'
    shooters = [tname(i) for i in ORDER if (F[i]['moves'].get('long') or {}).get('projectile')]
    howto = f'''<div class="howread paper fhow"><h4>COMO LER A FICHA</h4><ul>
 <li><b class="tagb">1,00</b><span>é o normal. <b>1,10</b> = 10% acima do normal; <b>0,90</b> = 10% abaixo.</span></li>
 <li><b class="tagb">FORÇA</b><span>quanto batem os golpes normais: soco, chute, forte e o golpe longo de contato.</span></li>
 <li><b class="tagb">AGILIDADE</b><span>a velocidade de andar.</span></li>
 <li><b class="tagb">PODER</b><span>quanto batem a magia, o super e tudo o que voa{f" (inclusive o golpe longo de quem atira: {lista(shooters)})" if shooters else ""}.</span></li>
 <li><b class="tagb">PESO</b><span>quanto mais pesado, menos é empurrado e menos dano leva.</span></li>
 <li><b class="tagb">BARRINHA</b><span>a mesma da tela de escolha: enche em 1,35 e fica vazia em 0,70. Acima ou abaixo disso ela não muda; o número ao lado é o de verdade.</span></li>
 <li><b class="tagb">DANO</b><span>quanto o golpe inteiro tira da vida (100) de quem fica parado, sem defender, com peso 1,00. Nos golpes de vários acertos já conta o desconto do combo.</span></li></ul></div>'''
    groups = ''
    for key in ('heroi', 'neutro', 'vilao'):
        ids = [i for i in ORDER if F[i].get('side', 'heroi') == key]
        if ids:
            groups += f'<div class="fgroup"><h3 class="fac-h {key}">{faction_title(key)}<small>{faction_text(key)}</small></h3>{"".join(card(i) for i in ids)}</div>'
    rows = ''
    for i in ORDER + list(MORPH.values()):
        st, M = F[i]['stats'], F[i]['moves']
        nm = f'<a href="#lutador-{MORPH_OF.get(i, i)}">{html.escape(fname(i))}</a>' + ('<small>2º round</small>' if i in MORPH_OF else '')
        rows += (f'<tr><th>{nm}</th><td>{num(st["power"])}</td><td>{num(st["speed"])}</td><td>{num(st.get("magic", 1))}</td><td>{num(st["weight"])}</td>'
                 f'<td>{dmg_of(i, "long") if "long" in M else "—"}</td><td>{dmg_of(i, "special")}</td><td>{dmg_of(i, "super")}</td></tr>')
    return section('lutadores', f'''
<nav class="sel" aria-label="Escolha o lutador">{grid}</nav>
{howto}
{selos_html()}
{groups}
{sub_h('FICHA TÉCNICA', 'TODOS OS NÚMEROS')}
<p class="swipe">↔ ARRASTE A TABELA PRO LADO</p><div class="paper tabwrap"><table class="ftab"><thead><tr><th rowspan="2">LUTADOR</th><th colspan="4">ATRIBUTOS (×)</th><th colspan="3">DANO (DE 100 DE VIDA)</th></tr>
<tr><th>FORÇA</th><th>AGILID.</th><th>PODER</th><th>PESO</th><th>LONGO</th><th>MAGIA</th><th>SUPER</th></tr></thead><tbody>{rows}</tbody></table>
<p class="tnote">Atributos: 1,00 é o normal. Dano: o golpe inteiro, contra quem fica parado e sem defender, com peso 1,00.</p></div>''',
                   f'{len(ROSTER)} lutadores em três lados, na ordem da gente comum até os chefes. Toque num rosto pra ir direto à ficha.', (20100, 26900))


# ---------------------------------------------------------------- FASE 11: online
def bracket():
    y = [16, 52, 96, 132, 176, 212, 256, 292]
    s = '<svg class="brk" viewBox="0 0 330 340" role="img" aria-label="Exemplo de chave com 7 lutadores: quartas, semifinal, final e campeão">'
    for k, yy in enumerate(y):
        s += f'<rect x="4" y="{yy - 12}" width="74" height="24" rx="4" class="slot{" bye" if k == 7 else ""}"/><text x="41" y="{yy + 5}" class="st">{"FOLGA" if k == 7 else "?"}</text>'
    semis = [(y[0] + y[1]) / 2, (y[2] + y[3]) / 2, (y[4] + y[5]) / 2, (y[6] + y[7]) / 2]
    for k, sy in enumerate(semis):
        a, b = y[2 * k], y[2 * k + 1]
        s += f'<path d="M78 {a} H96 V{b} H78 M96 {sy} H112" class="ln"/><rect x="112" y="{sy - 12}" width="64" height="24" rx="4" class="slot"/>'
    finals = [(semis[0] + semis[1]) / 2, (semis[2] + semis[3]) / 2]
    for k, fy in enumerate(finals):
        a, b = semis[2 * k], semis[2 * k + 1]
        s += f'<path d="M176 {a} H192 V{b} H176 M192 {fy} H206" class="ln"/><rect x="206" y="{fy - 12}" width="56" height="24" rx="4" class="slot"/>'
    cy = sum(finals) / 2
    s += f'<path d="M262 {finals[0]} H276 V{finals[1]} H262 M276 {cy} H286" class="ln"/><use href="#cup" x="284" y="{cy - 22}" width="44" height="44"/>'
    s += '<text x="41" y="330" class="lb">QUARTAS</text><text x="144" y="330" class="lb">SEMI</text><text x="234" y="330" class="lb">FINAL</text></svg>'
    return s


def s_online():
    pick = [i for i in ('edgard', 'laura', 'kevin', 'dede', 'michael', 'van') if i in F] or ORDER[:6]
    fa = lambda ids: ''.join(img(face(i), fname(i), 'px up') for i in ids)  # noqa: E731
    lk = f' Lutador travado neste aparelho ({lista(tname(i) for i in LOCKED)}, até zerar o arcade) aparece como <b>?</b> e não pode ser escolhido.' if LOCKED else ''
    steps = [('ENTRE', 'No menu, escolha <b>ARENA ONLINE</b>. Ou abra um link de convite: ele cai direto na arena.'),
             ('APELIDO', 'Digite como quer ser chamado. Ele aparece no placar e no ranking.'),
             ('MODO', 'Escolha <b>DUELO</b>, <b>DUPLAS</b> ou <b>CAMPEONATO</b>.'),
             ('LUTADOR', f'Na arena, o lutador é escolhido <b>depois</b> do modo, junto com quem vai lutar.{lk}')]
    st = ''.join(f'<li><span class="sn">{k}</span><b>{t}</b><p>{d}</p></li>' for k, (t, d) in enumerate(steps, 1))
    duel = f'''<article class="mode duel"><div class="md-art">{fa(pick[:1])}<b>VS</b>{fa(pick[1:2])}</div><h3>DUELO</h3><p class="md-sub">1 x 1 · melhor de 3 · vale ranking</p><ol>
 <li><b>▶ JOGAR AGORA</b> procura alguém que também apertou. A luta começa sozinha.</li>
 <li>Ou toque em <b>DESAFIAR</b> ao lado de alguém da lista. Ele tem {INVITE_S} s pra aceitar.</li>
 <li>Os dois escolhem o lutador juntos e lutam. Você pode começar do lado direito: aí a FRENTE é pra esquerda.</li>
 <li>Acabou? Os dois voltam pra escolha: <b>revanche</b>. SAIR pra sair.</li></ol>
 <p class="md-pts"><b>RANKING:</b> vitória +{WIN_PTS} pontos · derrota +{LOSS_PTS} ponto</p></article>'''
    duo = f'''<article class="mode duo"><div class="md-art">{fa(pick[:2])}<b>2x2</b>{fa(pick[2:4])}</div><h3>DUPLAS</h3><p class="md-sub">2 x 2 · uma luta só · quem cair por último perde</p><ol>
 <li><b>CRIE UMA MESA</b> ou sente numa aberta. De 2 a 4 pessoas: quem ficar sozinho num lado controla os dois lutadores da dupla.</li>
 <li>O anfitrião (quem criou a mesa) aperta <b>INICIAR</b>; todo mundo confirma em <b>PARTIDA ENCONTRADA</b> ({CONFIRM_S} s).</li>
 <li>Todos escolhem ao mesmo tempo ({DRAFT_S} s). Lutador confirmado não se repete. Se o tempo acabar, fica o que você estava olhando (ou um sorteado). O anfitrião escolhe o cenário.</li>
 <li>Na luta, {BT('T')} <b>TROCA</b>: aperte com o seu lutador livre, no chão (no ar ou apanhando, não troca). O parceiro entra num pulo e você recupera até {TAG_CAP} de vida no banco. Caiu? O parceiro entra sozinho.</li></ol>
 <p class="md-pts">Uma luta só, de {TAG_TIME} s: no TIME OVER vale a vida somada da dupla. <b>Não conta pro ranking.</b></p></article>'''
    cup = f'''<article class="mode cup"><div class="md-art">{ICON('cup', 'troféu')}</div><h3>CAMPEONATO</h3><p class="md-sub">mata-mata · até {CUP_MAX} lutadores · um lutador por pessoa</p>
 <dl class="md-gl"><div><dt>MATA-MATA</dt><dd>perdeu, saiu.</dd></div><div><dt>CHAVE</dt><dd>o desenho de quem enfrenta quem.</dd></div><div><dt>FOLGA</dt><dd>passa direto pra próxima fase.</dd></div><div><dt>W.O.</dt><dd>vitória de quem ficou quando o outro some.</dd></div></dl><ol>
 <li>Entrou, já está na sala: todo mundo escolhe ao mesmo tempo. Confirmou, o rosto fica preso: <b>cada lutador só tem um dono</b>.</li>
 <li>Com {CUP_MAX} confirmados, a chave fecha sozinha. Com 2 ou mais, dá pra apertar <b>COMEÇAR AGORA</b> (contagem de {CUP_COUNT} s, ainda dá pra trocar).</li>
 <li>A chave aparece desenhada. Uma luta por vez: chegou a sua, aperte <b>CONFIRMAR BATALHA</b>. O resto da sala assiste.</li>
 <li>Quem sumir pode levar W.O. de quem organiza.</li></ol>
 <p class="md-pts">Cada luta vale ranking, como no duelo.</p><figure class="brk-f">{bracket()}<figcaption>EXEMPLO COM 7 LUTADORES: UM PASSA DE FOLGA</figcaption></figure></article>'''
    extras = [('CONVIDAR', 'O botão 🔗 CONVIDAR copia um link. Quem abrir cai direto na arena.'), ('ASSISTIR', 'Lutas ao vivo aparecem na lista com ● AO VIVO. Toque em ASSISTIR.'),
              ('CHAT DA SALA', 'Do lado da arena tem o chat. No celular, abra pelo botão SALA no topo.'), ('LOTAÇÃO', f'Até {MAX_PEERS} pessoas na arena ao mesmo tempo.'),
              ('SEM PAUSA', 'Luta online não pausa: START abre VOLTAR ou DESISTIR E SAIR (conta como derrota).'),
              ('RANKING', 'No menu principal, RANKING mostra os melhores do arcade e da arena. Ele vale por temporada: quando começa uma nova, todo mundo volta pro zero. Na arena, os pontos vão pro seu apelido: use sempre o mesmo.')]
    ex = ''.join(f'<div class="exo"><h4>{t}</h4><p>{d}</p></div>' for t, d in extras)
    return section('online', f'''
{sub_h('COMO ENTRAR', 'QUATRO PASSOS')}
<ol class="flow on">{st}</ol>
{sub_h('OS TRÊS MODOS', 'ESCOLHA')}
<div class="modes">{duel}{duo}{cup}</div>
{sub_h('O QUE MAIS TEM NA ARENA', 'EXTRAS')}
<div class="exos">{ex}</div>''', 'Lute contra gente de verdade. Três modos, uma sala.', (2300, 4150))


# ---------------------------------------------------------------- FASE 12: celular
def phones():
    scr = stage(F[DEMO].get('stage', 'office'))[0]
    ST('n'), PL('START')               # registra os símbolos que os desenhos usam com <use>
    for L in 'GHJVB':
        BT(L)
    pad = ''
    for k, L in enumerate('GHJVB'):
        x, yy = (112 + (k % 3) * 26, 292 + (k // 3) * 30 + (8 if k % 3 == 1 else 0))
        pad += f'<use href="#b{L}" x="{x}" y="{yy}" width="28" height="28"/>'
    portrait = f'''<svg viewBox="0 0 200 400" class="ph" role="img" aria-label="Celular em pé: tela em cima, controles embaixo">
 <rect x="4" y="4" width="192" height="392" rx="28" fill="#1a1f2b" stroke="#000" stroke-width="5"/><rect x="13" y="16" width="174" height="368" rx="18" fill="#161c28"/>
 <rect x="13" y="22" width="174" height="22" fill="#0b0e15"/><text x="22" y="37" class="t1">V4 FIGHTERS</text><rect x="120" y="27" width="58" height="12" rx="4" fill="#1a2233" stroke="#3d4a63"/><text x="149" y="36" class="t2">🔊</text>
 <image href="{scr}" x="18" y="52" width="164" height="92" preserveAspectRatio="xMidYMid slice"/><rect x="18" y="52" width="164" height="92" fill="none" stroke="#000" stroke-width="3"/>
 <use href="#pill" x="40" y="180" width="24" height="24"/><text x="68" y="197" class="t3">START</text><use href="#pill" x="108" y="180" width="24" height="24"/><text x="136" y="197" class="t3">PAUSE</text>
 <use href="#sn" x="20" y="270" width="84" height="84"/>{pad}
 <g class="cn"><circle cx="186" cy="98" r="11"/><text x="186" y="102">1</text><circle cx="30" cy="190" r="11"/><text x="30" y="194">2</text><circle cx="24" cy="262" r="11"/><text x="24" y="266">3</text><circle cx="186" cy="276" r="11"/><text x="186" y="280">4</text></g></svg>'''
    pad2 = ''
    for k, L in enumerate('GHJVB'):
        x, yy = (318 + (k % 3) * 22, 130 + (k // 3) * 24 + (6 if k % 3 == 1 else 0))
        pad2 += f'<use href="#b{L}" x="{x}" y="{yy}" width="24" height="24" opacity=".8"/>'
    land = f'''<svg viewBox="0 0 400 200" class="ph" role="img" aria-label="Celular deitado: a luta ocupa a tela toda e os controles ficam nos cantos">
 <rect x="4" y="4" width="392" height="192" rx="28" fill="#1a1f2b" stroke="#000" stroke-width="5"/>
 <image href="{scr}" x="30" y="14" width="340" height="172" preserveAspectRatio="xMidYMid slice"/><rect x="30" y="14" width="340" height="172" fill="none" stroke="#000" stroke-width="3"/>
 <use href="#sn" x="34" y="116" width="66" height="66" opacity=".85"/>{pad2}
 <use href="#pill" x="36" y="19" width="16" height="16" opacity=".9"/><text x="55" y="31" class="t4">START</text><use href="#pill" x="86" y="19" width="16" height="16" opacity=".9"/><text x="105" y="31" class="t4">PAUSE</text>
 <rect x="330" y="20" width="32" height="14" rx="4" fill="#1a2233" stroke="#3d4a63" opacity=".85"/><text x="346" y="31" class="t2">🔊</text>
 <g class="cn"><circle cx="30" cy="112" r="11"/><text x="30" y="116">1</text><circle cx="372" cy="126" r="11"/><text x="372" y="130">2</text><circle cx="150" cy="30" r="11"/><text x="150" y="34">3</text><circle cx="316" cy="28" r="11"/><text x="316" y="32">4</text></g></svg>'''
    return portrait, land


def s_celular():
    p, l = phones()
    steps = [('DEITE O CELULAR', 'Em pé, a tela fica em cima e os controles embaixo. Deitado, a luta ocupa a tela inteira e os controles ficam transparentes nos cantos. Durante a luta, em pé, aparece o aviso ↻ DEITE O CELULAR.'),
             ('TELA CHEIA', 'No Android e no computador, o botão TELA CHEIA lá em cima esconde a barra do navegador (no celular o jogo já tenta isso no primeiro toque). No iPhone não existe tela cheia no navegador: instale o app.'),
             ('INSTALE COMO APP', 'Android e computador: toque em INSTALAR APP no topo, quando ele aparecer. iPhone e iPad: toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>. Abre como um jogo, sem barra de endereço.'),
             ('O SOM', 'O navegador só libera o som depois do primeiro toque. O botão 🔊 no topo liga e desliga.'),
             ('TELA SEMPRE ACESA', 'Enquanto o jogo está aberto, a tela não apaga sozinha.')]
    st = ''.join(f'<li><span class="sn">{k}</span><div><b>{t}</b><p>{d}</p></div></li>' for k, (t, d) in enumerate(steps, 1))
    return section('celular', f'''
<div class="phones">
 <figure class="phf">{p}<figcaption><b>EM PÉ</b><ol><li>A tela da luta; em cima, o 🔊 e os botões do topo</li><li>START e PAUSE, os dois botões redondos</li><li>O manche: arraste a bola com o polegar esquerdo</li><li>Os botões de golpe, pro polegar direito</li></ol></figcaption></figure>
 <figure class="phf wide">{l}<figcaption><b>DEITADO</b> (melhor!)<ol><li>Manche no canto de baixo, à esquerda</li><li>Botões no canto de baixo, à direita, só com a letra</li><li>START e PAUSE no canto de cima, à esquerda</li><li>No canto de cima, à direita: fora da luta, INSTALAR APP, TELA CHEIA, MANUAL e 🔊; durante a luta, só o 🔊 (e a SALA, no online)</li></ol></figcaption></figure>
</div>
<ol class="csteps paper">{st}</ol>
{tip(f'Dá pra apertar <b>dois botões ao mesmo tempo</b> na tela: segure o manche com um polegar e aperte o golpe com o outro. É assim que sai a rasteira, {cmd(ST("d"), PLUS, BT("H"))}.', 'DICA!', '#ff4fa0', 'landim' if 'landim' in F else None)}''',
                   'O jogo roda no navegador do celular, com os botões na tela. O essencial está na ' + fase('controle') + '; aqui, o resto.', (1700, 2450))


# ---------------------------------------------------------------- FASE 13: enredo (só o story.json)
TL_STRONG = [(r'laborat|tanque|espécime|genétic|criar(am)? vida|criam vida|subsolo', 'xablau')]
TL_WEAK = [(r'torneio|arena', 'intro'), (r'elevador', 'elevator')]


def tl_stage(text, ids):
    """Fundo de cada data: o laboratório quando o texto fala dele; senão o cenário de quem aparece; senão o lugar citado."""
    bare = re.sub(r'<[^>]*>', '', text).lower()
    for pat, name in TL_STRONG:
        if re.search(pat, bare) and has_stage(name):
            return stage(name)[0]
    for i in ids:
        if has_stage(F[i].get('stage')):
            return stage(F[i]['stage'])[0]
    for pat, name in TL_WEAK:
        if re.search(pat, bare) and has_stage(name):
            return stage(name)[0]
    return ''


ACT_ART = [(r'subsolo|tanque|laborat', 'xablau'), (r'modo automático|hóspede', 'mundim'), (r'andares|torneio|elevador', 'elevator')]


def act_art(k, title, text):
    bare = (title + ' ' + re.sub(r'<[^>]*>', '', text)).lower()
    if k == 0 and os.path.exists(os.path.join(PUB, 'intro', 'tower.jpg')):
        return picture('intro/tower.jpg', 'tower.jpg', 480, 74)[0]
    for pat, name in ACT_ART:
        if re.search(pat, bare) and has_stage(name):
            return stage(name)[0]
    return stage('intro')[0]


def _in_sequel(t):
    """A data que só repete o começo da contracapa (sequel): quase todas as palavras dela estão lá."""
    w = set(re.findall(r'[a-zà-ú]{4,}', re.sub(r'<[^>]*>', ' ', scrub(t.get('event', ''))).lower()))
    sq = set(re.findall(r'[a-zà-ú]{4,}', re.sub(r'<[^>]*>', ' ', scrub(SEQUEL)).lower()))
    return bool(w) and bool(sq) and len(w & sq) / len(w) >= .7


def tl_item(n, t):
    if _in_sequel(t):
        return (f'<li><span class="tl-n">{n:02d}</span><a class="tl-card tl-next" href="#continua"><span class="tl-when"><b>{plain(str(t.get("when", "")).split("·")[0].strip()) or "???"}</b></span>'
                '<p>O fim desta história está na contracapa. ▼</p></a></li>')
    ev = rich(t.get('event', ''))
    ids = who_in(ev)
    faces = ''.join(f'<span class="tl-f">{img(face(i), fname(i), "px up")}<small>{html.escape(fname(i))}</small></span>' for i in ids)
    bg = tl_stage(ev, ids)
    stl = f' style="--bg:url({bg})"' if bg else ''
    when = [plain(x.strip()) for x in str(t.get('when', '')).split('·')]
    wh = f'<span class="tl-when"><b>{when[0]}</b>{"".join(f"<i>{w}</i>" for w in when[1:])}</span>' if when[0] else ''
    return f'<li><span class="tl-n">{n:02d}</span><div class="tl-card"{stl}>{wh}<p>{ev}</p>{f"<div class=tl-faces>{faces}</div>" if faces else ""}</div></li>'


def story_html():
    """A história contada uma vez: a linha do tempo, dividida nos atos (cada ato é um capítulo com o título e a arte dele).
    Sem linha do tempo, os atos entram com o texto deles; sem os dois, a parte some."""
    groups = group_timeline()
    if groups:
        out, n = '', 0
        for k, (act, evs) in enumerate(groups):
            ban = ''
            if act:
                ban = f'<header class="act-ban" style="--bg:url({act_art(k, act[0], act[1])})"><span class="num">ATO {k + 1}</span><h4>{plain(act[0])}</h4></header>'
            items = ''
            for t in evs:
                n += 1
                items += tl_item(n, t)
            out += f'<div class="act-block">{ban}<ol class="tl">{items}</ol></div>'
        return sub_h(f'A HISTÓRIA EM {len(groups)} ATOS' if groups[0][0] else 'A HISTÓRIA', 'LINHA DO TEMPO') + f'<div class="story">{out}</div>'
    if ACTS:
        acts = ''
        for k, (t, x) in enumerate(ACTS):
            faces = ''.join(img(face(i), fname(i), 'px') for i in who_in(rich(x), 6))
            acts += (f'<article class="act"><div class="act-img" style="background-image:url({act_art(k, t, x)})"><span class="num">ATO {k + 1}</span><h4>{plain(t)}</h4></div>'
                     f'<div class="act-t"><p>{rich(x)}</p>{f"<div class=act-faces>{faces}</div>" if faces else ""}</div></article>')
        return sub_h(f'A HISTÓRIA EM {len(ACTS)} ATOS', 'QUADRINHOS') + f'<div class="acts">{acts}</div>'
    return ''


def web():
    """A teia de ligações: todo mundo numa roda, agrupado pelos lados; cada linha liga dois lutadores com história juntos.
    As frases de cada ligação ficam nas fichas (cada uma uma vez, na ficha de quem a conta)."""
    pairs = {}
    for a, b, _ in LINKS:
        pairs.setdefault(tuple(sorted((a, b), key=ORDER.index)), set()).add(a)
    if not pairs:
        return ''
    side = lambda i: F[i].get('side', 'heroi')  # noqa: E731
    order = [i for key in ('vilao', 'neutro', 'heroi') for i in ORDER if side(i) == key and any(i in p for p in pairs)]
    slots, cur, prev = [], 0.0, None
    for i in order:
        if prev is not None and side(i) != side(prev):
            cur += .7                                   # um respiro entre os lados
        slots.append(cur)
        cur += 1
        prev = i
    total = cur + .7
    vil = [s for s, i in zip(slots, order) if side(i) == 'vilao']
    start = -math.pi / 2 - (2 * math.pi * ((vil[0] + vil[-1]) / 2) / total if vil else 0)     # a torre fica em cima
    C, R = 300, 232
    pos = {i: (C + R * math.cos(start + 2 * math.pi * s / total), C + R * math.sin(start + 2 * math.pi * s / total)) for s, i in zip(slots, order)}
    lines = ''
    for (a, b), who in pairs.items():
        (x1, y1), (x2, y2) = pos[a], pos[b]
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        qx, qy = C + (mx - C) * .25, C + (my - C) * .25
        lines += f'<path d="M{x1:.0f} {y1:.0f} Q{qx:.0f} {qy:.0f} {x2:.0f} {y2:.0f}" class="{"mu" if len(who) > 1 else "one"}"/>'
    nodes = ''.join(f'<a class="wn" href="#lutador-{i}" style="left:{pos[i][0] / 6:.2f}%;top:{pos[i][1] / 6:.2f}%;--c:{SIDE_COLOR[side(i)]}">{img(face(i), fname(i), "px up")}<span>{html.escape(fname(i))}</span></a>' for i in order)
    leg = ''.join(f'<li><i style="background:{SIDE_COLOR[k]}"></i>{faction_title(k)}</li>' for k in ('vilao', 'neutro', 'heroi') if any(side(i) == k for i in order))
    return (f'<figure class="web"><div class="web-in"><svg viewBox="0 0 600 600" aria-hidden="true">{lines}</svg>{nodes}</div>'
            f'<figcaption><ul class="web-leg">{leg}<li><b class="mu-s"></b>os dois contam a história</li></ul>'
            f'<p>Cada linha liga dois lutadores que têm história juntos. Toque num rosto: as ligações dele, uma por uma, estão na ficha ({fase("lutadores")}).</p></figcaption></figure>')


def s_enredo():
    fac = ''
    for key, cls in (('vilao', 'vil'), ('heroi', 'her'), ('neutro', 'neu')):
        if faction_text(key):
            ids = [i for i in ORDER if F[i].get('side', 'heroi') == key]
            fac += f'<div class="fac {cls}"><h4>{faction_title(key)}</h4><p>{faction_text(key)}</p><div class="fac-faces">{"".join(img(face(i), fname(i), "px") for i in ids)}</div></div>'
    gl = ''.join(f'<div class="gl"><b>{plain(g.get("term", ""))}</b><p>{rich(g.get("def", ""))}</p></div>' for g in GLOSSARY)
    body = f'''
<div class="dossier"><div class="hazard" aria-hidden="true"></div><div class="dos-in">{ICON('bio', 'perigo biológico')}<div><span class="stamp">CONFIDENCIAL</span>
<h3>ARQUIVO DA MUNDIM CORP · {YEAR}</h3><p>O que você vai ler foi tirado dos arquivos do laboratório. Quem aparece aqui tem ficha na {fase('lutadores')}; as palavras estranhas estão no glossário, no fim desta fase.</p></div></div><div class="hazard" aria-hidden="true"></div></div>
{story_html()}
{sub_h('OS TRÊS LADOS', 'FACÇÕES') if fac else ''}
<div class="facs">{fac}</div>
{sub_h('QUEM É QUEM', 'A TEIA') if LINKS else ''}
{web()}
{sub_h('GLOSSÁRIO', 'ARQUIVOS') if gl else ''}
<div class="gloss">{gl}</div>
<a class="cliff" href="#continua"><span>E DEPOIS?</span>Vá até a contracapa... ▼</a>'''
    return section('enredo', body, 'O que deu errado na Mundim Corp, em ordem. Arquivo confidencial.', (4950, 7600))


# ---------------------------------------------------------------- contracapa
def back():
    feats = [('1 JOGADOR', 'contra a CPU no modo arcade'), (f'ATÉ {MAX_PEERS}', 'pessoas na arena online'), (f'{len(ROSTER)}', 'lutadores + 1 transformação'),
             ('2x2', 'duplas com troca'), ('CAMPEONATO', f'mata-mata com até {CUP_MAX}'), ('CELULAR E PC', 'no navegador, sem instalar nada')]
    ff = ''.join(f'<li><b>{a}</b><span>{b}</span></li>' for a, b in feats)
    seq = f'<p class="bk-seq">{rich(SEQUEL)}</p>' if SEQUEL else ''
    return f'''</main>
<footer class="back" id="continua"><div class="bk-in">
 <p class="bk-tag">CONTINUA…</p>
 <div class="bk-q" aria-hidden="true">?</div>
 {seq}
 <h2 class="logo bk-logo">V4 FIGHTERS<span>2</span></h2>
 <p class="bk-soon">EM BREVE</p>
 <ul class="bk-feats">{ff}</ul>
 <a class="cta" href="./">▶ JOGAR AGORA</a>
 <p class="bk-small">V4 Fighters – Trouble Work · {YEAR} · manual gerado a partir dos dados do jogo, sempre em dia com os golpes e o elenco.</p>
</div></footer>'''


# ================================================================ CSS
# Fontes: Press Start 2P (--pix8) só em número e sigla sem acento (FASE 01, 52, K.O.); a Silkscreen (--pix) nos rótulos,
# porque tem maiúscula acentuada de altura cheia (ÍNDICE, LIÇÕES); frase inteira em Barlow Condensed (--cond), nunca em pixel.
CSS = r'''
:root{--ink:#16141f;--paper:#fff4d6;--paper2:#ffe7a6;--night:#0a1220;--y:#ffd23f;--o:#ff7a1a;--r:#e5383b;--g:#2bb673;--b:#3f7ae0;--p:#9257e6;--tox:#9be22a;--mute:#57536a;
--pix8:'Press Start 2P',ui-monospace,monospace;--pix:Silkscreen,'Press Start 2P',ui-monospace,monospace;--logo:Anton,Impact,'Arial Narrow',sans-serif;--txt:Barlow,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;--cond:'Barlow Condensed','Arial Narrow',Barlow,sans-serif;--u:44px;color-scheme:dark;
--dots:radial-gradient(rgba(22,20,31,.07) 1px,transparent 1.5px) 0 0/5px 5px;--grain:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.28 0 0 0 0 0.15 0 0 0 .09 0'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E")}
*{box-sizing:border-box}
html{scroll-padding-top:64px;-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--night);background-image:radial-gradient(rgba(255,255,255,.05) 1px,transparent 1.6px);background-size:7px 7px;color:#eef2ff;font:500 17px/1.55 var(--txt);overflow-x:clip}
img{max-width:100%;height:auto}
.px{image-rendering:auto}
@media (min-resolution:2dppx){.px.up{image-rendering:pixelated}}
.flip{transform:scaleX(-1)}
a{color:inherit}
h1,h2,h3,h4,h5{text-wrap:balance}
p,li,dd{text-wrap:pretty}
.wrap{max-width:1140px;margin:0 auto;padding:0 16px}
.sprite{position:absolute;width:0;height:0;overflow:hidden}
.cv{content-visibility:auto;contain-intrinsic-size:auto none auto var(--cis,1600px)}
@media (max-width:860px){.cv{contain-intrinsic-size:auto none auto var(--cism,var(--cis,2400px))}}
kbd{display:inline-block;min-width:1.9em;padding:2px 6px 1px;font:700 13px/1.3 var(--txt);text-align:center;color:var(--ink);background:linear-gradient(#fff,#d9dde6);border:2px solid #000;border-radius:5px;box-shadow:0 3px 0 #6b7280;margin:0 1px 3px;vertical-align:middle;white-space:nowrap}
/* ícones */
.k{display:inline-flex;flex-direction:column;align-items:center;gap:3px;vertical-align:middle;line-height:1;flex:none}
.k svg{display:block;overflow:visible}
.kb svg,.ka svg{width:var(--u);height:var(--u)}
.ks svg{width:calc(var(--u)*1.12);height:calc(var(--u)*1.12)}
.kk svg{width:calc(var(--u)*.86);height:calc(var(--u)*.86)}
.kw svg{width:calc(var(--u)*1.72);height:calc(var(--u)*.86)}
.kp svg{width:calc(var(--u)*.8);height:calc(var(--u)*.8)}
.km svg{width:calc(var(--u)*1.9);height:calc(var(--u)*.8)}
.kc svg{width:26px;height:26px}
.k small{font:700 12px/1.1 var(--cond);letter-spacing:.4px;white-space:nowrap;text-transform:uppercase}
.kp small{font:700 13px/1 var(--cond);letter-spacing:.8px}
.m-h small{color:#1f6dff}.m-f small{color:#b78a00}
.cmd{display:inline-flex;align-items:center;flex-wrap:wrap;gap:4px 3px}
.plus,.then{display:inline-grid;place-items:center;flex:none;vertical-align:middle}
.plus svg{width:calc(var(--u)*.62);height:calc(var(--u)*.62);display:block}
.then svg{width:calc(var(--u)*.52);height:calc(var(--u)*.52);display:block}
.or{font:800 italic 14px/1 var(--cond);letter-spacing:.5px;padding:0 4px;opacity:.8;text-transform:uppercase}
.cond{display:inline-flex;align-items:center;gap:4px;margin-right:2px}
.cw{font:800 14px/1 var(--cond);letter-spacing:.6px}
.colon{font:900 calc(var(--u)*.5)/1 var(--txt);margin-left:-1px}
.burst{position:relative;display:inline-grid;place-items:center;width:var(--bs,112px);aspect-ratio:1;flex:none}
.burst svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.burst b{position:relative;font:400 italic calc(var(--bs,112px)*var(--fk,.17))/.95 var(--logo);color:#000;text-align:center;transform:rotate(-9deg);letter-spacing:.5px}
.burst.sm{--bs:84px}
/* peças da tela, em miniatura */
.lbar{position:relative;display:inline-block;width:120px;height:14px;background:#2a0a0a;border:3px solid #000;vertical-align:middle;overflow:hidden}
.lbar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(#ffe66d,#f6b400 55%,#d98a00)}
.lbar s{position:absolute;top:0;bottom:0;background:#e63946;text-decoration:none}
.gz{display:inline-flex;flex-direction:column;gap:2px;width:230px;max-width:100%;font-family:'Arial Black',Impact,var(--logo),sans-serif;font-style:italic;vertical-align:middle}
.gz-hint{align-self:flex-start;margin-bottom:3px;font:12px/1 var(--pix);font-style:normal;color:#fff;background:#16141f;padding:3px 6px 3px 3px;border-radius:3px;white-space:nowrap}
.gz-hint.off{visibility:hidden}
.gz-hint kbd{font:inherit;min-width:0;padding:2px 5px;margin:0;background:#9257e6;color:#fff;border:0;box-shadow:0 2px 0 #4d2590}
.gz1,.gz2{position:relative;display:block;border:2px solid #05070c;overflow:hidden}
.gz1{height:18px;background:#0b1d46}.gz2{height:24px;background:#3b3000;border-width:3px 2px}
.gz i{position:absolute;left:0;top:0;bottom:0}
.gz1 i{background:linear-gradient(180deg,#5fc1ff,#1f6dff)}.gz2 i{background:#ffd400}
.gz em{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:5px;font-size:12px;font-style:italic;letter-spacing:1px;white-space:nowrap}
.gz1 em{color:#cfe6ff;text-shadow:1px 1px 0 #03102e}.gz1 em b{background:#fff;color:#1456e0;padding:0 5px;font-size:11px;text-shadow:none}
.gz2 em{color:rgba(0,0,0,.55);font-size:14px}
.gz1.on{border-color:#fff;box-shadow:0 0 10px #38a0ff}.gz1.on i{background:repeating-linear-gradient(115deg,#2f86ff 0 12px,#1b5fe6 12px 24px)}.gz1.on em{color:#fff}
.gz2.on{border-color:#000;box-shadow:0 0 14px #ffd400}.gz2.on em{color:#000;font-size:15px;letter-spacing:2px}
.foot{display:inline-block;width:46px;height:12px;border-radius:50%;vertical-align:middle;margin:0 2px}
.foot.b{background:radial-gradient(closest-side,rgba(56,160,255,.95),rgba(40,110,255,.45) 55%,transparent)}
.foot.g{background:radial-gradient(closest-side,rgba(255,212,0,.98),rgba(255,160,0,.5) 55%,transparent)}
/* capa */
.cover{position:relative;isolation:isolate;overflow:hidden;min-height:min(100svh,1000px);display:flex;align-items:center;justify-content:center;text-align:center;padding:66px 16px 34px;background:#05070d}
.cover::before{content:'';position:absolute;inset:0;z-index:-2;background:linear-gradient(180deg,rgba(5,7,13,.2),rgba(5,7,13,.5) 50%,var(--night) 97%),var(--bg) center/cover}
@media (max-width:700px){.cover::before{background:linear-gradient(180deg,rgba(5,7,13,.2),rgba(5,7,13,.5) 50%,var(--night) 97%),var(--bgm) center/cover}}
.cover::after{content:'';position:absolute;inset:-25%;z-index:-1;background:repeating-conic-gradient(from 0deg at 50% 45%,rgba(255,210,63,.13) 0 2.6deg,transparent 2.6deg 10deg);-webkit-mask:radial-gradient(circle at 50% 45%,#000 8%,transparent 58%);mask:radial-gradient(circle at 50% 45%,#000 8%,transparent 58%)}
.topband{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;gap:10px;padding:10px 16px;background:#000;border-bottom:4px solid var(--r);font:13px/1.2 var(--pix);color:#fff;letter-spacing:1px}
.cv-in{position:relative;width:100%;max-width:1040px}
.cv-logo{width:78px;height:78px;border:4px solid #000;box-shadow:5px 5px 0 #000;transform:rotate(-6deg);display:block;margin:0 auto 6px}
.cv-tag{display:inline-block;margin:8px 0 0;font:15px/1.2 var(--pix);background:var(--y);color:#000;padding:8px 12px;border:3px solid #000;box-shadow:4px 4px 0 #000;transform:rotate(-1.5deg)}
.logo{margin:14px 0 0;font:400 italic clamp(56px,14.2vw,168px)/.86 var(--logo);letter-spacing:1px;background:linear-gradient(#fff7b8 8%,#ffd23f 40%,#ff8a00 70%,#e5383b 94%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:3px #000;filter:drop-shadow(6px 7px 0 #000)}
.logo span{display:block;font-size:.38em;letter-spacing:.16em;margin-top:.14em;-webkit-text-fill-color:#fff;color:#fff;-webkit-text-stroke:2px #000}
.cv-sub{font:800 italic clamp(19px,3.4vw,27px)/1.2 var(--cond);letter-spacing:.5px;margin:14px 0 0;color:#fff;text-shadow:2px 2px 0 #000,0 0 18px #000}
.cv-burst{position:absolute;right:max(-10px,calc(50% - 540px));top:40px;transform:rotate(12deg);--bs:138px}
.cv-seal{position:absolute;left:max(-6px,calc(50% - 530px));top:54px;width:124px;transform:rotate(-12deg);filter:drop-shadow(4px 4px 0 #000)}
.seal{display:block;width:100%;height:auto}
.seal-t{font:12.5px var(--pix);fill:#fff;letter-spacing:.6px}
.seal-v{font:400 italic 30px var(--logo);fill:#000}
.lineup{display:flex;justify-content:center;align-items:flex-end;margin:10px auto 0;height:clamp(170px,36vw,360px)}
.lineup img{height:84%;width:auto;margin:0 -4.2%;filter:drop-shadow(4px 0 0 #000) drop-shadow(-3px 0 0 #000) drop-shadow(0 4px 0 #000)}
.lineup .la1,.lineup .la3{height:92%;z-index:1}
.lineup .la2{height:100%;z-index:2}
.cv-cta{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin-top:18px}
.cta{display:inline-flex;align-items:center;gap:10px;padding:14px 24px;background:var(--r);color:#fff;font:17px/1 var(--pix);text-decoration:none;border:4px solid #000;border-radius:999px;box-shadow:0 7px 0 #7a0f12,0 7px 0 4px #000;text-shadow:2px 2px 0 #000;transition:transform .08s,box-shadow .08s}
.cta:hover{filter:brightness(1.1)}
.cta:active{transform:translateY(5px);box-shadow:0 2px 0 #7a0f12,0 2px 0 4px #000}
.cta.ghost{background:#1a2233;box-shadow:0 7px 0 #0b0e15,0 7px 0 4px #000}
.feats{list-style:none;padding:0;margin:26px 0 0;display:flex;flex-wrap:wrap;justify-content:center;gap:8px}
.feats li{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:92px;padding:7px 10px 8px;background:#000;border:3px solid #fff;border-radius:6px;color:#fff;box-shadow:3px 3px 0 var(--r)}
.feats b{font:14px/1 var(--pix);color:var(--y)}.feats span{font:700 12px/1 var(--cond);letter-spacing:1px}
/* índice fixo */
.toc{position:sticky;top:0;z-index:30;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:6px 28px 6px 10px;background:#05070d;border-bottom:3px solid #000;box-shadow:0 3px 0 var(--y);-webkit-mask:linear-gradient(90deg,#000 calc(100% - 40px),transparent);mask:linear-gradient(90deg,#000 calc(100% - 40px),transparent)}
@media (min-width:1500px){.toc{justify-content:center;-webkit-mask:none;mask:none}}
.toc::-webkit-scrollbar{display:none}
.toc a{flex:none;display:flex;align-items:center;font:13px/1 var(--pix);color:#cfd8ee;text-decoration:none;padding:12px 10px;border:2px solid #2b3550;border-radius:4px;background:#0e1628}
.toc a b{font:11px/1 var(--pix8);color:var(--y);margin-right:7px}
.toc a:hover,.toc a:focus-visible{border-color:var(--y);color:#fff;outline:none}
.toc a.on{background:var(--y);color:#000;border-color:#000}.toc a.on b{color:#000}
.toc .home{background:var(--r);color:#fff;border-color:#000;font-family:var(--logo);font-size:17px;font-style:italic;padding:8px 10px}
/* índice ilustrado */
.indice{padding-top:44px}
.idx-h{margin:0 0 18px;font:400 italic clamp(40px,7vw,64px)/1 var(--logo);color:#fff;-webkit-text-stroke:2px #000;paint-order:stroke fill;text-shadow:4px 4px 0 var(--r)}
.idx-h span{display:inline-block;margin-left:12px;font:14px var(--pix);font-style:normal;color:var(--y);-webkit-text-stroke:0;text-shadow:none;vertical-align:middle}
.idx-g{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:30px 0 14px;font:400 italic 30px/1 var(--logo);color:#fff;text-shadow:3px 3px 0 #000}
.idx-g span{font:13px/1 var(--pix);font-style:normal;background:var(--y);color:#000;padding:6px 8px;border:2px solid #000;text-shadow:none}
.idx{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
@media (min-width:720px){.idx{grid-template-columns:repeat(4,1fr)}}
.idx a{position:relative;display:flex;flex-direction:column;gap:6px;height:100%;min-height:156px;padding:10px 12px 12px;background:var(--paper);background-image:var(--dots);color:var(--ink);border:3px solid #000;box-shadow:5px 5px 0 #000;text-decoration:none;transition:transform .1s,box-shadow .1s;overflow:hidden}
.idx a:hover,.idx a:focus-visible{transform:translate(-2px,-2px);box-shadow:7px 7px 0 var(--c)}
.idx .n{align-self:flex-start;font:10px/1 var(--pix8);background:var(--c);color:#000;border:2px solid #000;padding:5px 6px}
.idx a>b{font:400 italic 22px/1 var(--logo);letter-spacing:.3px;padding-right:4px}
.idx small{font:600 14px/1.3 var(--txt);color:var(--mute)}
.idx .ti{margin-top:auto;--u:30px;display:flex;align-items:flex-end;min-height:40px}
.ti img{width:30px;height:30px;border:2px solid #000}
.ti-vs{display:flex;align-items:center;gap:4px}.ti-vs b{font:400 italic 18px var(--logo);color:var(--r);padding:0}
.ti-bar{display:block;width:100%}.ti-bar .lbar{width:100%}
.ti .ti-spr{width:auto;height:46px;border:0}
.ti-ko{font:400 italic 30px/1 var(--logo);color:var(--r);-webkit-text-stroke:1.5px #000}
.ti-faces{display:flex}.ti-faces img{margin-right:-6px}
.ti-floor{font:12px/1 var(--pix8);background:#1a2233;color:var(--y);border:3px solid #000;padding:8px;border-radius:50%}
.ti-q{font:400 italic 28px/1 var(--logo);color:#ff4d4d;-webkit-text-stroke:1px #000}
.idx2{list-style:none;margin:0;padding:6px 16px;display:grid;gap:0 30px}
@media (min-width:860px){.idx2{grid-template-columns:1fr 1fr}}
.idx2 a{display:grid;grid-template-columns:44px auto 1fr auto;grid-template-rows:auto auto;align-items:end;column-gap:10px;padding:10px 0;border-bottom:2px dashed #cdbd8c;text-decoration:none;color:var(--ink)}
.idx2 .ti{grid-row:span 2;align-self:center;display:flex;justify-content:center;--u:26px}.idx2 .ti img{width:24px;height:24px}
.idx2 a>b{font:400 italic 22px/1.1 var(--logo);letter-spacing:.3px}
.idx2 a>i{align-self:end;height:4px;margin-bottom:6px;background:radial-gradient(circle,var(--ink) 1.3px,transparent 1.6px) 0 50%/8px 4px repeat-x}
.idx2 .pg{font:13px/1 var(--pix8);color:#000;background:var(--c);border:2px solid #000;padding:5px 6px}
.idx2 small{grid-column:2/-1;font:600 14px/1.3 var(--txt);color:var(--mute)}
.idx2 a:hover b,.idx2 a:focus-visible b{color:#b3161a}
.howto{display:flex;align-items:center;gap:14px;margin-top:4px}
.howto p{margin:0}
.resumo{margin-top:30px;--u:40px}
.resumo h3{margin:0 0 12px;font:400 italic clamp(30px,5vw,44px)/1 var(--logo);letter-spacing:.5px}
.resumo h3 span{font:13px var(--pix);font-style:normal;background:#16141f;color:var(--y);padding:6px 8px;vertical-align:middle;margin-left:6px}
.rs-top{display:grid;gap:16px;grid-template-columns:auto 1fr;align-items:center;padding-bottom:14px;border-bottom:3px solid #000}
.rs-stick{display:flex;align-items:center;gap:10px}.rs-stick p{margin:0;font-size:15px;line-height:1.35}.rs-stick b{display:block;font:400 italic 20px/1.1 var(--logo)}
.rs-pad{list-style:none;margin:0;padding:0;display:grid;gap:8px 10px;grid-template-columns:repeat(3,1fr)}
.rs-pad li{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:8px;align-items:center}
.rs-pad .k{grid-row:span 2}.rs-pad b{font:400 italic 19px/1 var(--logo);align-self:end}.rs-pad small{font:700 13px/1.2 var(--cond);color:var(--mute);text-transform:uppercase;align-self:start}
.resumo h4{margin:16px 0 8px;font:14px var(--pix);letter-spacing:1px}
.rs-rules{list-style:none;margin:0;padding:0;display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));--u:34px}
.rs-rules li{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start;padding:10px;background:#fff;border:3px solid #000;box-shadow:4px 4px 0 #000}
.rs-c{margin:6px 0 2px}
.rs-n{font:14px/1 var(--pix8);background:var(--r);color:#fff;border:2px solid #000;padding:6px 7px}
.rs-rules b{display:block;font:400 italic 19px/1.05 var(--logo)}.rs-rules p{margin:3px 0 0;font-size:15px;line-height:1.35}
.aviso{margin-top:30px;background:#16141f;border:4px solid #000;box-shadow:7px 7px 0 #000}
.av-in{padding:14px 18px}.av-in h3{margin:0 0 6px;font:400 italic 30px/1 var(--logo);color:var(--y)}.av-in h3 span{font:13px var(--pix);font-style:normal;color:#fff;margin-left:8px;vertical-align:middle}
.av-in p{margin:0;font-size:16px;color:#e7e9f2}
/* seções */
.sec{padding-bottom:10px}
.band{position:relative;margin:86px -16px 36px;padding:24px 16px 28px;background:var(--c);color:#000;border-block:5px solid #000;transform:skewY(-2deg);box-shadow:0 8px 0 rgba(0,0,0,.45);overflow:hidden}
.band::after{content:'';position:absolute;inset:0;background:radial-gradient(rgba(0,0,0,.2) 1.3px,transparent 1.9px) 0 0/8px 8px;-webkit-mask:linear-gradient(90deg,transparent 35%,#000);mask:linear-gradient(90deg,transparent 35%,#000);pointer-events:none}
.band>div{position:relative;z-index:1;transform:skewY(2deg);max-width:1108px;margin:0 auto}
.fase{display:inline-block;font:11px/1 var(--pix8);background:#000;color:var(--c);padding:8px 10px;transform:rotate(-2deg);letter-spacing:1px}
.band h2{margin:12px 0 6px;font:400 italic clamp(40px,8.4vw,86px)/.95 var(--logo);color:#fff;-webkit-text-stroke:3px #000;paint-order:stroke fill;text-shadow:5px 5px 0 #000;letter-spacing:.5px}
.band h2 em{font-style:inherit;color:var(--y)}
.band p{margin:0;max-width:760px;font:700 italic clamp(16px,2.2vw,20px)/1.3 var(--txt)}
.band p a{color:#000}
.sec[style*="#ffd23f"] .band h2 em{color:#fff}
.folio{display:flex;align-items:center;gap:12px;margin:40px 0 0;padding-top:8px;border-top:3px solid #3a4560;font:12px/1 var(--pix);color:#8fa0c6}
.folio a{display:inline-block;padding:12px 0;font:13px var(--pix);color:#cfd8ee;text-decoration:none}.folio a:hover{color:var(--y)}
.folio span{flex:1;text-align:right;letter-spacing:1px}
.folio b{font:12px/1 var(--pix8);color:#000;background:var(--c);border:2px solid #000;padding:6px 7px}
.subh{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:46px 0 16px;font:400 italic clamp(26px,4.4vw,38px)/1.05 var(--logo);letter-spacing:.4px;color:#fff;text-shadow:3px 3px 0 #000}
.subh span{font:13px/1 var(--pix);font-style:normal;background:var(--c);color:#000;padding:6px 8px;border:2px solid #000;text-shadow:none;letter-spacing:.5px}
.paper{position:relative;background:var(--paper);background-image:var(--grain),var(--dots);color:var(--ink);border:4px solid #000;box-shadow:7px 7px 0 #000;border-radius:3px;padding:18px}
.paper a{color:#b3161a;font-weight:700}
.two{display:grid;gap:22px;margin-top:26px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));align-items:start}
.more{margin:22px 0 0;font-weight:600}.more a{color:var(--y)}
.tip{position:relative;display:flex;align-items:center;gap:14px;margin-top:26px;padding:16px 18px;background:#fffbe9;background-image:var(--grain);color:var(--ink);border:4px solid #000;box-shadow:7px 7px 0 #000;border-radius:3px;--u:34px}
.tip p{margin:0;flex:1}
.tip .burst{--bs:100px;margin:-26px 0 -26px -30px;transform:rotate(-8deg)}
.tip-face img{width:64px;height:64px;border:3px solid #000;box-shadow:3px 3px 0 #000;display:block}
.tnote{margin:12px 0 0;font-size:14px;color:var(--mute);--u:24px}
/* FASE 1 */
.hq{display:grid;gap:20px;grid-template-columns:1fr}
@media (min-width:560px){.hq{grid-template-columns:1fr 1fr}}
@media (min-width:1000px){.hq{grid-template-columns:repeat(4,1fr)}}
.pnl{position:relative;background:#fff;color:var(--ink);border:4px solid #000;box-shadow:6px 6px 0 #000;display:flex;flex-direction:column;overflow:hidden}
.pnl:nth-child(odd){transform:rotate(-.6deg)}.pnl:nth-child(even){transform:rotate(.5deg)}
.scene{position:relative;aspect-ratio:16/10;background:#1a2233 center/cover;border-bottom:4px solid #000;overflow:hidden}
.scene .spr{position:absolute;bottom:5%;height:68%;width:auto}
.scene .l{left:10%}.scene .r{right:10%}
.scene .hit-l{left:22%}
.scene .down{height:32%;bottom:4%;right:8%}
.you,.cpu{position:absolute;bottom:4%;font:12px/1 var(--pix);background:var(--y);color:#000;padding:4px 6px;border:2px solid #000;z-index:2}
.you{left:6%}.cpu{right:6%;background:#fff}
.num{position:absolute;left:8px;top:8px;z-index:3;min-width:34px;height:34px;padding:0 8px;display:grid;place-items:center;border-radius:17px;background:var(--y);color:#000;border:3px solid #000;font:12px/1 var(--pix8);box-shadow:2px 2px 0 #000}
.pnl .txt{padding:12px 14px 16px}
.pnl h3{margin:0 0 4px;font:400 italic 27px/1 var(--logo);letter-spacing:.3px}
.pnl p{margin:0;font-size:16px}
.sc-vs{position:absolute;left:50%;top:44%;translate:-50% -50%;--bs:74px;transform:rotate(-8deg)}
.sc-pow{position:absolute;left:52%;top:30%;translate:-50% -50%;--bs:80px;transform:rotate(12deg)}
.mini-life{position:absolute;right:4%;top:6%;width:44%;filter:drop-shadow(2px 2px 0 #000)}.mini-life .lbar{width:100%}
.scene.rounds{display:grid;place-items:center;align-content:center;gap:8px;background:radial-gradient(circle,#26336b,#0b1022 70%)}
.r-t{font:400 italic clamp(40px,6vw,58px)/1 var(--logo);color:var(--y);-webkit-text-stroke:2px #7a2a00;paint-order:stroke fill;text-shadow:4px 4px 0 #000}
.r-d{display:flex;gap:10px}.r-d i{width:18px;height:18px;border:3px solid #fff;background:#222;transform:rotate(45deg);box-shadow:0 2px 0 #000}.r-d i.on{background:var(--y)}
.r-c{position:absolute;top:8px;right:12px;font:18px var(--pix8);color:#fff;text-shadow:2px 2px 0 #000}
.ko-t{position:absolute;left:50%;top:24%;translate:-50% -50%;font:400 italic clamp(44px,7vw,64px)/1 var(--logo);color:var(--y);-webkit-text-stroke:2px #7a2a00;paint-order:stroke fill;text-shadow:5px 5px 0 #000;transform:rotate(-6deg)}
.words{margin:0;display:grid;gap:10px 22px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.words div{display:grid;grid-template-columns:130px 1fr;gap:10px;align-items:baseline;padding-bottom:8px;border-bottom:2px dashed #cdbd8c}
.words dt{font:14px/1.2 var(--pix);color:#b3161a}.words dd{margin:0;font-size:15px;line-height:1.4}
/* FASE 2: gabinete */
.cab{margin:0 auto;max-width:860px;padding:14px;background:linear-gradient(#3b4759,#2a3443);border:4px solid #000;border-radius:18px;box-shadow:8px 8px 0 #000}
.cab figcaption{margin-top:12px;font:600 15px/1.45 var(--txt);color:#cfd8ee}
.cab-mq{position:relative;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;background:linear-gradient(#141a26,#0b0f18);border:3px solid #000;border-radius:10px}
.cab-logo{font:400 italic 24px/1 var(--logo);letter-spacing:2px;color:#fff3b0;text-shadow:0 0 10px rgba(255,190,60,.9),2px 2px 0 #7a2a00}
.cab-logo small{margin-left:8px;font:11px var(--pix);font-style:normal;color:#ff9db0;letter-spacing:2px}
.cab-chips{display:flex;flex-wrap:wrap;gap:5px}.cab-chips i{font:11px/1 var(--pix);font-style:normal;padding:6px 7px;border:2px solid #3d4a63;border-radius:6px;background:#1a2233;color:#dfe7f3}
.cab-chips .snd{font:14px/1 var(--txt);padding:3px 7px}
.cab-scr{position:relative;margin:10px 0;aspect-ratio:16/6;background:center/cover;border:6px solid #0b0e15;border-radius:10px;box-shadow:inset 0 0 0 3px #000;overflow:hidden}
.cab-scr img{position:absolute;bottom:4%;height:74%;width:auto}.cab-scr .s1{left:24%}.cab-scr .s2{right:24%}
.cab-deck{position:relative;display:grid;grid-template-columns:1fr auto 1.4fr;align-items:center;gap:14px;padding:18px 16px 22px;background:linear-gradient(180deg,#55637b 0,#2c3647 8%,#202838 60%,#161c28);border:3px solid #000;border-radius:10px 10px 16px 16px;--u:58px}
.cd-stick,.cd-pills,.cd-pad{position:relative}
.cd-stick{display:flex;flex-direction:column;align-items:center;gap:4px}
.cd-stick .big svg{width:118px;height:118px}
.cd-stick>b{font:12px var(--pix);color:#8e9bb3;letter-spacing:2px}
.cd-b small{font:12px var(--pix);color:#dfe7f3;margin-top:3px}
.cd-pills{display:flex;flex-direction:column;align-items:center;gap:10px;--u:52px}
.cd-pills .kp small{color:#dfe7f3}
.coin{font:12px var(--pix);color:#ffb36b;padding:8px 10px;border-radius:6px;background:#0e1219;box-shadow:inset 0 0 0 2px #303a4c}
.cd-pad{display:grid;grid-template-columns:repeat(3,auto);gap:16px 14px;justify-content:center}
.cd-b{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px}
.cd-G{transform:translateY(8px)}.cd-J{transform:translateY(4px)}.cd-V{transform:translateX(16%)}.cd-B{transform:translate(16%,-3px)}
.cd-T{transform:translate(30%,8px);padding:4px 6px 6px;border:3px dashed #9aa4b5;border-radius:12px}
.cd-T em{font:11px/1.1 var(--pix);font-style:normal;color:var(--y);text-align:center;margin-top:2px}
.co{position:absolute;z-index:4;display:grid;place-items:center;width:max(20px,3.4cqw);height:max(20px,3.4cqw);border-radius:50%;background:var(--y);color:#000;border:max(2px,.3cqw) solid #000;font:max(10px,1.2cqw)/1 var(--pix8);box-shadow:2px 2px 0 #000}
.cab .co{width:28px;height:28px;font-size:11px}
.c1{right:-8px;top:-10px}.c2{left:8px;top:8px}.c3{left:0;top:-8px}.c4{right:-14px;top:-6px}.c5{right:-6px;top:-14px}
.phone-box{margin-top:26px;--u:30px}
.phone-box h4{display:flex;align-items:center;gap:8px;margin:0 0 8px;font:400 italic 26px/1 var(--logo)}.phone-box .ph-i svg{width:34px;height:34px}
.phone-box ol{margin:0;padding-left:22px;display:grid;gap:8px}.phone-box li{font-size:16px;line-height:1.45}
.cores{display:inline-flex;flex-wrap:wrap;align-items:center;gap:2px 8px;font-weight:600}
.ctls{padding:6px 14px;--u:40px}
.ctl{display:grid;grid-template-columns:96px 1.3fr 1fr 1fr;gap:10px 16px;align-items:center;padding:12px 0;border-bottom:2px dashed #cdbd8c}
.ctl:last-child{border-bottom:0}
.ctl-ic{display:flex;justify-content:center}
.ctl-t>b{font:400 italic 22px/1 var(--logo);letter-spacing:.4px}
.ctl-t p,.ctl-ph p{margin:3px 0 0;font-size:15px;line-height:1.4}
.ctl-t .cmd{--u:26px;vertical-align:middle}.ctl-t .km svg{width:46px;height:19px}
.ctl small{display:block;font:12px var(--pix);color:var(--mute);margin-bottom:4px}
.ctl-kb{--u:36px}.ctl-kb em{display:block;font:600 13px var(--txt);color:var(--mute)}
@media (pointer:coarse){.ctl{grid-template-columns:96px 1.3fr 1fr}.ctl-kb{display:none}}
.rose{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px;background:#0e1628;border:4px solid #000;box-shadow:7px 7px 0 #000;border-radius:6px;--u:60px}
.rz{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 4px;background:#16213d;border:2px solid #2b3550;border-radius:6px;text-align:center}
.rz b{font:12px/1.25 var(--pix);color:#fff}
.rz.mid{background:#1f2b4d}.rz.mid b{color:var(--y)}
.note-frente{--u:34px}
.note-frente h4{margin:0 0 6px;font:400 italic 24px/1.1 var(--logo)}
.note-frente p{margin:0 0 8px}
.flipdemo{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0 4px;padding:10px;background:#d9f1ff;border:3px solid #000}
.flipdemo .fd{display:flex;align-items:center;gap:8px}.flipdemo .fd.r{justify-content:flex-end;text-align:right}
.flipdemo img{height:84px;width:auto}
.flipdemo p{margin:0;font-size:14px;line-height:1.5}.flipdemo p b{display:block;font:12px/1.2 var(--pix);margin-bottom:4px}
.kb-det summary{cursor:pointer;display:inline-block;margin-bottom:10px;font:14px var(--pix);color:var(--y);padding:10px 12px;border:2px solid #2b3550;border-radius:4px;background:#0e1628}
.kb-det[open] summary{display:none}
.keyb{margin:0 auto;max-width:860px;padding:16px;background:#1a2233;border:4px solid #000;border-radius:10px;box-shadow:7px 7px 0 #000;container-type:inline-size}
.kb-row{display:grid;grid-template-columns:repeat(21,1fr);gap:5px;margin-bottom:5px}
.key{display:grid;place-items:center;align-content:center;aspect-ratio:1;border:2px solid #000;border-radius:7px;background:linear-gradient(#f1f3f7,#c9ced9);color:#16141f;font:max(10px,2.2cqw)/1 var(--pix8);box-shadow:0 4px 0 #5b6475;opacity:.33}
.key em{display:block;margin-top:4px;font:max(9px,1.25cqw)/1 var(--pix);font-style:normal;letter-spacing:0}
.key em svg{width:max(12px,2.2cqw);height:auto;fill:currentColor;display:block;margin:0 auto}
.key>svg{width:62%;height:auto;fill:#16141f}
.key.on{opacity:1}
@container (max-width:560px){.kb-row .key em{display:none}}
.kmv{background:linear-gradient(#fff,#d9dde6)}.kG{background:linear-gradient(#ff8e8f,#e5383b);color:#fff}.kH{background:linear-gradient(#ffe27a,#f2b705)}.kJ{background:linear-gradient(#86efbd,#2bb673)}
.kV{background:linear-gradient(#9cc0ff,#3f7ae0);color:#fff}.kB{background:linear-gradient(#cfb0ff,#9257e6);color:#fff}.kT{background:linear-gradient(#fff,#e9eef7)}
.kst{background:linear-gradient(#f6f8fb,#9aa4b5)}.kps{background:linear-gradient(#ffd0a6,#ff7a1a)}
.kb-extra{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px;margin-top:10px}
.kb-extra .key{aspect-ratio:auto;height:max(38px,6.8cqw);padding:0 12px;font:max(11px,1.8cqw)/1 var(--pix)}
.kb-extra .wide{min-width:18%}.kb-extra .wider{min-width:30%}
.arrows{display:grid;grid-template-columns:repeat(3,max(36px,6.6cqw));grid-template-rows:repeat(2,max(36px,6.6cqw));gap:4px;margin-left:auto}
.arrows .key{aspect-ratio:1;height:auto;padding:0}
.a-u{grid-column:2;grid-row:1}.a-l{grid-column:1;grid-row:2}.a-d{grid-column:2;grid-row:2}.a-r{grid-column:3;grid-row:2}
.kb-leg{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px 14px;font:600 14px/1.3 var(--txt);color:#dfe7f3}
.kb-leg li{display:flex;align-items:center;gap:6px}.sw{display:inline-block;width:14px;height:14px;border:2px solid #000;border-radius:3px}
/* FASE 3 */
.flow{list-style:none;margin:0;padding:0;display:grid;gap:14px 18px;grid-template-columns:1fr;--u:34px}
@media (min-width:560px){.flow{grid-template-columns:repeat(3,1fr)}}
@media (min-width:1000px){.flow{grid-template-columns:repeat(6,1fr)}}
.flow li{position:relative;display:flex;flex-direction:column;gap:6px;padding:14px 12px 12px;background:#101a31;border:3px solid #000;box-shadow:5px 5px 0 #000;border-top:6px solid var(--c)}
.flow li:not(:last-child)::after{content:'▼';position:absolute;left:50%;bottom:-17px;translate:-50% 0;z-index:2;font-size:15px;color:var(--c);text-shadow:1px 1px 0 #000}
@media (min-width:560px){.flow li:not(:last-child)::after{content:'▶';left:auto;right:-14px;top:44%;bottom:auto;translate:none}.flow li:nth-child(3n)::after{display:none}}
@media (min-width:1000px){.flow li:nth-child(3n)::after{display:block}}
.flow li>b{font:400 italic 20px/1.05 var(--logo);letter-spacing:.3px}
.flow p{margin:0;font-size:15px;line-height:1.45;color:#d7def0}.flow p .k{--u:22px}
.sn{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--c);color:#000;border:3px solid #000;font:11px/1 var(--pix8);flex:none}
.steps{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))}
.step{position:relative;display:grid;grid-template-columns:96px 1fr;gap:12px;align-items:center;padding:14px;background:var(--paper);background-image:var(--grain),var(--dots);color:var(--ink);border:4px solid #000;box-shadow:6px 6px 0 #000;--u:36px}
.step .sn{position:absolute;left:-10px;top:-12px}
.st-art{display:flex;align-items:flex-end;justify-content:center;height:120px;background:linear-gradient(#bfe6ff,#e8f6ff 70%,#b89a6a 70%,#9c7f52);border:3px solid #000}
.st-art img{max-height:112px;width:auto}
.st-t h4{margin:0 0 6px;font:400 italic 23px/1 var(--logo);letter-spacing:.3px}
.st-t p{margin:6px 0 0;font-size:15px;line-height:1.45}
.st-t p .k,.c-res p .k,.dica p .k,.tip p .k,.fill p .k,.levels p .k,.rule p .k,.acard p .k,.xbox p .k,.mode li .k,.selos .k,.csteps p .k,.exc .k,.lk-t .k{--u:26px}
.kh{font:600 13px/1.6 var(--txt)!important;color:#6b6480}.kh kbd{font-size:12px}
.drill{display:flex;align-items:flex-start;gap:14px;margin-top:26px;--u:28px}
.drill ol{margin:0;padding-left:22px;display:grid;gap:6px}
.fkeys{margin:12px 0 0;padding-top:10px;border-top:2px dashed #cdbd8c;font-size:15px;line-height:1.5}
.fkeys .red{color:#c4122f}.fkeys .grn{color:#12863c}
/* FASE 4: HUD de mentira */
.hm-wrap{margin:0;container-type:inline-size}
.hm{position:relative;container-type:inline-size;aspect-ratio:16/9;background:#123 center/cover;border:5px solid #000;border-radius:8px;box-shadow:0 0 0 3px #2b3550,9px 9px 0 3px #000;overflow:hidden;font-family:var(--pix8);color:#fff}
.hm::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.12) 0 1px,transparent 1px 3px);pointer-events:none}
.hm-side{position:absolute;top:2.6%;display:flex;gap:1cqw;width:41.7cqw;align-items:flex-start}
.hm-side.l{left:1.9cqw}.hm-side.r{right:1.9cqw}
.hm-pt{width:6cqw;height:6cqw;border:max(2px,.31cqw) solid #fff;box-shadow:0 .3cqw 0 #000;background:#123;flex:none}
.hm-bars{flex:1}
.hm-nr{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.6cqw}
.hm-nr b{font-size:1.15cqw;color:var(--y);text-shadow:.2cqw .2cqw 0 #000;font-weight:400}.hm-nr span{font-size:1.05cqw;text-shadow:.2cqw .2cqw 0 #000}
.hm-life{position:relative;height:2.3cqw;background:#2a0a0a;border:max(2px,.31cqw) solid #fff;box-shadow:0 .3cqw 0 #000;overflow:hidden}
.hm-life i{position:absolute;top:0;bottom:0;left:0}.hm-side.r .hm-life i{left:auto;right:0}
.hm-life .gh{background:#e63946}.hm-life .fi{background:linear-gradient(180deg,#ffe66d,#f6b400 55%,#d98a00)}
.hm-rd{display:flex;gap:.7cqw;margin-top:.7cqw}.hm-side.r .hm-rd{justify-content:flex-end}
.hm-rd i{width:1.25cqw;height:1.25cqw;border:max(1px,.2cqw) solid #fff;background:#222;transform:rotate(45deg)}.hm-rd i.on{background:var(--y)}
.hm-timer{position:absolute;left:50%;top:2.6%;translate:-50% 0;width:9.4cqw;padding-top:1.25cqw;text-align:center;font-size:3.1cqw;text-shadow:.3cqw .3cqw 0 #000}
.hm-f1,.hm-f2{position:absolute;bottom:12%;height:44%;width:auto}.hm-f1{left:30%}.hm-f2{left:51%}
.hm-combo{position:absolute;left:4.8cqw;top:30%;display:flex;align-items:baseline;gap:.8cqw;font-family:var(--logo);font-style:italic;color:var(--y);-webkit-text-stroke:.2cqw #7a2a00;text-shadow:.4cqw .4cqw 0 #000}
.hm-combo b{font-size:6.7cqw;line-height:1;font-weight:400}.hm-combo span{font-size:3.1cqw;color:#fff;-webkit-text-stroke:.2cqw #1b2a6b;letter-spacing:.2cqw}
.hm-g{position:absolute;bottom:1.25cqw;width:30cqw;font-family:'Arial Black',Impact,var(--logo),sans-serif;font-style:italic}
.hm-g.l{left:1.9cqw}.hm-g.r{right:1.9cqw}
.hm-g .g1,.hm-g .g2{position:relative;overflow:hidden;border:max(1px,.2cqw) solid #05070c}
.hm-g i{position:absolute;top:0;bottom:0;left:0}.hm-g.r i{left:auto;right:0}
.hm-g .g1{height:1.8cqw;background:#0b1d46;margin-bottom:.2cqw}.hm-g .g2{height:2.4cqw;background:#3b3000}
.hm-g .g1 i{background:linear-gradient(180deg,#5fc1ff,#1f6dff)}.hm-g .g2 i{background:#ffd400}
.hm-g span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:.6cqw;font-size:1.15cqw;letter-spacing:.1cqw;white-space:nowrap;color:#cfe6ff}
.hm-g .g2 span{font-size:1.5cqw;color:rgba(0,0,0,.55)}.hm-g .g2.on span{color:#000;font-size:1.75cqw}
.hm-g .g1.on{border-color:#fff;box-shadow:0 0 1.2cqw #38a0ff}.hm-g .g2.on{border-color:#000;box-shadow:0 0 1.8cqw #ffd400}
.hm-g span b{background:#fff;color:#1456e0;padding:0 .5cqw;font-size:1.15cqw}
.hm-hint{position:absolute;bottom:100%;left:0;margin-bottom:.5cqw;font:max(6px,.85cqw)/1 var(--pix8);font-style:normal;color:#fff;text-shadow:.2cqw .2cqw 0 #000;white-space:nowrap}
.hm-hint kbd{font:inherit;padding:.2cqw .5cqw;min-width:0;background:#9257e6;color:#fff;border:0;border-radius:.3cqw;box-shadow:0 .2cqw 0 #4d2590;margin:0}
@container (max-width:600px){.hm .co{display:none}}
.legend{list-style:none;margin:22px 0 0;padding:14px 18px;display:grid;gap:12px 22px;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));--u:26px}
.legend li{display:flex;gap:10px;align-items:flex-start}
.legend .co{position:static;flex:none;width:30px;height:30px;font-size:12px}
.legend li>div>b{display:block;font:400 italic 21px/1.1 var(--logo);letter-spacing:.3px}
.legend p{margin:4px 0 0;font-size:15px;line-height:1.45}
.mi{display:flex;align-items:center;gap:6px;margin-top:6px}
.mi-pt img{width:34px;height:34px;border:2px solid #000}.mi-pt b{font:12px var(--pix8);color:#000;background:var(--y);padding:4px 5px;border:2px solid #000}
.mi-timer{font:18px/1 var(--pix8);color:#fff;background:#16141f;padding:6px 8px;border:2px solid #000;width:max-content}
.mi-rd{gap:10px;padding:6px 8px;background:#16141f;width:max-content}.mi-rd i{width:13px;height:13px;border:2px solid #fff;background:#333;transform:rotate(45deg)}.mi-rd i.on{background:var(--y)}
.mi-score{font:13px/1 var(--pix8);color:#fff;background:#16141f;padding:6px 8px;width:max-content}
.mi-hits{align-items:baseline;gap:4px;font:400 italic 20px/1 var(--logo);color:#fff;background:#16141f;padding:4px 10px 6px;width:max-content}.mi-hits b{font-size:34px;color:var(--y);font-weight:400;-webkit-text-stroke:1px #7a2a00}
/* FASE 5: barra */
.levels{list-style:none;margin:0;padding:0;display:grid;gap:26px;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));counter-reset:lv}
.levels li{position:relative;padding:14px;background:#0e1628;border:4px solid #000;box-shadow:7px 7px 0 #000;--u:28px}
.levels li:not(:last-child)::after{content:'▶';position:absolute;right:-22px;top:50%;translate:0 -50%;font-size:18px;color:var(--y);text-shadow:1px 1px 0 #000}
@media (max-width:659px){.levels li:not(:last-child)::after{content:'▼';right:auto;left:50%;top:auto;bottom:-24px;translate:-50% 0}}
.levels h4{margin:0 0 10px;font:13px/1.3 var(--pix);color:var(--y)}
.lv-g{padding:8px 10px 10px;background:#1b2440;border:2px solid #2b3550}
.levels p{margin:10px 0 0;font-size:15px;line-height:1.45;color:#dfe7f3}
.fills{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));--u:32px}
.fill{display:flex;flex-direction:column;gap:8px;padding:14px;background:var(--paper);background-image:var(--grain),var(--dots);color:var(--ink);border:4px solid #000;box-shadow:6px 6px 0 #000}
.fill h4{margin:0;font:400 italic 25px/1 var(--logo);color:var(--r)}
.fill p{margin:0;font-size:15px;line-height:1.45}.fill small{font:700 13px/1.3 var(--txt);color:#6b6480}
.f-ic{min-height:48px;display:flex;align-items:center}.f-ic .mini{height:60px;width:auto}
.tabwrap{overflow-x:auto;padding:12px}
table{width:100%;border-collapse:collapse}
.btab{--u:40px}.btab th,.btab td{padding:10px;border-bottom:2px solid #cdbd8c;text-align:left;vertical-align:middle}
.btab th{font:12px/1.5 var(--pix);vertical-align:bottom}
.btab td{font-weight:600}.btab td small{display:block;font:600 13px var(--txt);color:#6b6480}
.btab .kc{margin-right:6px;vertical-align:middle}
.exc h4{margin:0 0 8px;font:400 italic 24px/1 var(--logo)}
.exc ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.exc li{display:flex;gap:10px;align-items:center;font-size:15px;line-height:1.4}
.exc img{width:44px;height:44px;border:3px solid #000;flex:none}
/* FASE 6: regras */
.rules{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))}
@media (min-width:1100px){.rules{grid-template-columns:repeat(5,1fr)}}
.rule{position:relative;padding:16px 14px 14px;background:var(--paper);background-image:var(--grain),var(--dots);color:var(--ink);border:4px solid #000;box-shadow:6px 6px 0 #000}
.rn{position:absolute;right:10px;top:-14px;font:11px/1 var(--pix8);background:var(--o);border:3px solid #000;padding:6px 8px}
.r-ic{display:flex;align-items:center;min-height:62px;margin-bottom:8px;--u:30px}
.ri{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ri .lbar{width:110px}
.ri-rd{gap:12px;padding:8px 12px;background:#16141f;border:2px solid #000}.ri-rd i{width:16px;height:16px;border:3px solid #fff;background:#333;transform:rotate(45deg)}.ri-rd i.on{background:var(--y)}
.ri-timer{display:inline-block;font:20px/1 var(--pix8);color:#fff;background:#16141f;padding:8px 10px;border:2px solid #000}.ri-timer.red{color:#ff4d4d}
.ri-to{display:grid;grid-template-columns:auto 1fr;gap:4px 8px}.ri-to .ri-timer{grid-row:span 2}.ri-to .lbar{width:90px;height:12px}
.ri-ko{font:400 italic 28px/1 var(--logo);color:var(--r);-webkit-text-stroke:1px #000}
.ri-pf{font:400 italic 24px/1 var(--logo);color:#1f6dff;-webkit-text-stroke:1px #000}
.lbar.ko{background:#2a0a0a}
.ri-faces img{width:38px;height:38px;border:2px solid #000}.ri-faces .ri-mo{object-fit:cover;object-position:50% 10%;background:#2a0e0a}
.ri-spr{height:52px;width:auto}
.ri-hits{align-items:baseline;gap:4px;font:400 italic 22px/1 var(--logo);background:#16141f;color:#fff;padding:4px 12px 6px}.ri-hits b{font-size:38px;color:var(--y);font-weight:400}
.rule h4{margin:0 0 6px;font:400 italic 26px/1 var(--logo);letter-spacing:.3px}
.rule p{margin:0;font-size:15px;line-height:1.45}
.dtab{--u:30px;min-width:520px}
.dtab th,.dtab td{padding:10px;border-bottom:2px solid #cdbd8c;text-align:center}
.dtab thead th{vertical-align:bottom;font:12px/1.5 var(--pix)}
.dtab thead img{display:block;margin:0 auto 6px;width:auto}
.dtab thead span{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap}
.dtab tbody th{text-align:left;font:400 italic 20px/1.1 var(--logo)}
.dt-c{display:flex;margin-top:4px;--u:24px}.dt-c small{font:600 13px var(--txt);font-style:normal;color:#6b6480}
.dtab .kc svg{width:34px;height:34px}
.swipe{display:none;margin:0 0 8px;font:12px var(--pix);color:var(--y)}
/* FASE 7: dicas */
.dicas-h{margin:0 0 14px;font:14px var(--pix);color:var(--y);letter-spacing:1px}
.dicas{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr));margin-bottom:30px}
.dica{position:relative;display:flex;gap:12px;align-items:flex-start;padding:14px;background:var(--paper);background-image:var(--grain),var(--dots);color:var(--ink);border:4px solid #000;box-shadow:6px 6px 0 #000;--u:28px}
.dica.top{border-color:#000;box-shadow:6px 6px 0 var(--c),6px 6px 0 3px #000}
.dn{position:absolute;right:10px;top:-14px;font:11px var(--pix8);background:var(--y);border:3px solid #000;padding:5px 7px}
.dface{width:64px;height:64px;border:3px solid #000;box-shadow:3px 3px 0 var(--c);flex:none}
.dica h4{margin:0 0 4px;font:400 italic 23px/1.05 var(--logo);letter-spacing:.3px}
.d-cmd{margin:4px 0 6px}
.d-avg{display:inline-block;font:16px/1 var(--pix8);background:#16141f;color:var(--y);padding:7px 9px;border:2px solid #000}
.d-feet{display:inline-flex;gap:8px;padding:8px 10px;background:#16141f}
.dica p{margin:0;font-size:15px;line-height:1.45}
/* FASE 8: arcade */
.tower{display:grid;grid-template-columns:minmax(200px,300px) 1fr;gap:22px;align-items:stretch}
.tw-img{position:relative;border:4px solid #000;box-shadow:7px 7px 0 #000;overflow:hidden;background:#0a0f24}
.tw-img img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 20%}
.tw-lab{position:absolute;left:0;right:0;bottom:0;padding:8px;background:rgba(0,0,0,.8);font:12px/1.4 var(--pix);text-align:center;color:var(--y)}
.route{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px}
.fl{position:relative;display:grid;grid-template-columns:52px auto 1fr;gap:12px;align-items:center;padding:12px;background:var(--paper);background-image:var(--grain),var(--dots);color:var(--ink);border:4px solid #000;box-shadow:5px 5px 0 #000;border-left:10px solid var(--c,#9aa4b5)}
.fl:not(:last-child)::after{content:'▼ PRÓXIMA';position:absolute;left:50%;bottom:-17px;z-index:1;translate:-50% 0;font:11px/1 var(--pix);background:#000;color:var(--y);padding:4px 7px}
.fl-n{display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff7c2,#ffd23f 60%,#c98a00);border:4px solid #000;font:12px/1 var(--pix8);box-shadow:inset 0 -3px 0 rgba(0,0,0,.25)}
.fl-faces{display:flex;gap:4px}.fl-faces img{width:58px;height:58px;border:3px solid #000}
.fl-faces i{display:grid;place-items:center;width:34px;height:34px;background:#16141f;color:#fff;border:3px solid #000;font:12px var(--pix8);font-style:normal}
.fl-t small{font:12px/1.4 var(--pix);color:var(--mute)}
.fl-t h4{margin:2px 0 2px;font:400 italic 25px/1 var(--logo);letter-spacing:.4px}
.fl-t p{margin:0;font-size:15px;line-height:1.45}
.fl-morph{display:flex;align-items:center;gap:8px;margin-top:6px;font:12px/1.3 var(--pix);color:#b3161a}.fl-morph img{height:70px;width:auto}
.lk-tag{display:inline-flex;align-items:center;gap:4px;margin-top:6px;font:700 13px/1 var(--cond);letter-spacing:.6px;background:#16141f;color:var(--y);padding:4px 8px 4px 4px}
.lk-tag .kc svg{width:18px;height:18px}
.fl.last{border-left-color:#c4122f;background-color:#fff0e6}
.fl.secret{background:#0b0e15;color:#ffd0d0;border-left-color:#ff4d4d;border-style:dashed}.fl.secret .fl-n{background:#1a0508;color:#ff4d4d}.fl.secret h4{color:#ff4d4d}
.locked{display:flex;gap:14px;align-items:flex-start;margin-top:30px;--u:28px}
.lk-i svg{width:54px;height:54px}
.lk-t h4{margin:0 0 8px;font:400 italic 26px/1.05 var(--logo)}
.lk-t p{margin:8px 0 0;font-size:16px;line-height:1.5}
.lk-faces{display:flex;gap:8px}
.lk-f{position:relative;display:block;width:60px;height:60px;border:3px solid #000;background:#000}.lk-f img{width:100%;height:100%;filter:brightness(.18) grayscale(1)}
.lk-f i{position:absolute;inset:0;display:grid;place-items:center;font:22px var(--pix8);font-style:normal;color:#fff}
.lk-rumor{font:700 italic 17px/1.4 var(--cond)!important;color:#b3161a}
.ramp h4,.score h4{margin:0 0 10px;font:400 italic 25px/1 var(--logo)}
.ramp ol{margin:0;padding:0;list-style:none;display:grid;gap:10px}
.ramp li{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;align-items:center}
.ramp li b{font:12px/1.3 var(--pix);background:#16141f;color:var(--y);padding:6px 8px;text-align:center}
.ramp li span{font-size:15px;line-height:1.4}
.score ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.score li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 10px;background:#16141f;color:#fff}
.score li b{font:12px/1.6 var(--pix);color:var(--y)}.score li span{font-weight:600;font-size:15px;text-align:right}
.acards{display:grid;gap:14px;margin-top:22px;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))}
.acard{padding:12px 14px;background:#101a31;border:3px solid #000;box-shadow:5px 5px 0 #000;border-top:6px solid var(--y);--u:24px}
.acard h4{margin:0 0 6px;font:400 italic 21px/1.05 var(--logo);color:var(--y);letter-spacing:.3px}
.acard p{margin:0;font-size:15px;line-height:1.45;color:#d7def0}
/* FASE 9: comandos */
.howread{--u:32px}
.howread h4{margin:0 0 10px;font:400 italic 26px/1 var(--logo)}
.howread ul{list-style:none;margin:0;padding:0;display:grid;gap:10px 22px;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr))}
.howread li{display:flex;align-items:center;gap:12px;font-size:15px;line-height:1.4}
.howread li>.k,.howread li>.cond,.howread li>.plus,.howread li>.then,.howread li>b:first-child{min-width:64px;justify-content:center}
.howread>p{margin:14px 0 0;padding-top:10px;border-top:2px dashed #cdbd8c}
.basics{display:grid;gap:0 26px;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));padding:6px 16px;--u:30px}
.brow{display:grid;grid-template-columns:minmax(120px,auto) 16px 1fr;gap:6px 10px;align-items:center;padding:8px 0;border-bottom:2px dashed #cdbd8c}
.brow .c-eq{font-size:24px}
.brow h4{margin:0;font:400 italic 18px/1.05 var(--logo)}.brow p{margin:2px 0 0;font-size:14px;line-height:1.35}
.cgroups{display:grid;gap:22px;margin-top:6px;grid-template-columns:repeat(auto-fit,minmax(min(100%,500px),1fr))}
.cgroup{background:var(--paper);background-image:var(--grain),var(--dots);color:var(--ink);border:4px solid #000;box-shadow:7px 7px 0 #000;--u:36px}
.cgroup h3{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0;padding:10px 14px;background:var(--gc);color:#000;border-bottom:4px solid #000;font:400 italic 24px/1 var(--logo);letter-spacing:.5px}
.cgroup h3 small{font:12px var(--pix);font-style:normal;background:#000;color:#fff;padding:4px 6px}
.crow{display:grid;grid-template-columns:minmax(150px,auto) 20px 1fr 70px;gap:8px 10px;align-items:center;padding:10px 14px;border-bottom:2px dashed #cdbd8c}
.crow:last-child{border-bottom:0}
.c-eq{font:900 34px/1 var(--txt);color:var(--o);-webkit-text-stroke:1.5px #000;paint-order:stroke fill;text-align:center}
.c-res h4{margin:0;font:400 italic 20px/1.05 var(--logo);letter-spacing:.3px}
.c-res p{margin:3px 0 0;font-size:15px;line-height:1.4}
.c-pic{display:flex;justify-content:center;align-items:flex-end}
.c-spr{max-height:84px;width:auto}
/* FASE 10: lutadores */
.sel{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;padding:12px;background:#1a1f8a;border:4px solid #000;box-shadow:7px 7px 0 #000}
.sel a{position:relative;display:block;border:3px solid var(--c);background:#000;text-decoration:none;box-shadow:0 0 0 2px #000;transition:transform .1s}
.sel a:hover,.sel a:focus-visible{transform:scale(1.06);z-index:1;outline:3px solid var(--y)}
.sel img{display:block;width:100%;height:auto;aspect-ratio:1}
.sel span{position:absolute;left:0;right:0;bottom:0;padding:4px 2px;background:rgba(0,0,0,.78);font:11px/1.1 var(--pix);text-align:center;color:#fff}
.sel em{position:absolute;left:3px;top:3px;display:flex;align-items:center;gap:2px;font:700 11px/1 var(--cond);font-style:normal;letter-spacing:.5px;padding:3px 5px 3px 3px;border:2px solid #000}
.g-lk{background:#16141f;color:var(--y)}.g-lk .kc svg{width:14px;height:14px}
.g-st{background:var(--y);color:#000}
.sel a.lk img{filter:brightness(.55) saturate(.6)}
.fhow{margin-top:24px}
.selos h4{margin:0 0 10px;font:400 italic 26px/1 var(--logo)}
.selos{margin-top:22px}
.selos ul{list-style:none;margin:0;padding:0;display:grid;gap:8px 26px;grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr))}
.selos li{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start;font-size:15px;line-height:1.4;padding-bottom:6px;border-bottom:2px dashed #cdbd8c}
.chip{display:inline-block;font:700 13px/1.15 var(--cond);font-style:normal;letter-spacing:.4px;padding:4px 7px;background:#16141f;color:#fff;border-radius:3px;max-width:150px}
.fgroup{margin-top:36px}
.fac-h{margin:0 0 18px;padding:12px 16px;border:4px solid #000;box-shadow:6px 6px 0 #000;font:400 italic clamp(30px,5vw,44px)/1 var(--logo);letter-spacing:.5px;background:#101a31}
.fac-h small{display:block;margin-top:6px;font:600 16px/1.4 var(--txt);font-style:normal;color:#cfd8ee;letter-spacing:0}
.fac-h.vilao{border-left:14px solid #e5383b}.fac-h.heroi{border-left:14px solid #2bb673}.fac-h.neutro{border-left:14px solid #9257e6}
.fc{display:grid;grid-template-columns:minmax(260px,38%) 1fr;margin:0 0 30px;background:var(--paper);background-image:var(--grain);color:var(--ink);border:4px solid #000;box-shadow:8px 8px 0 #000;scroll-margin-top:64px}
.fc-art{position:sticky;top:62px;align-self:start;height:min(600px,calc(100svh - 84px));min-height:420px;background:#123 center/cover;border-right:4px solid #000;overflow:hidden;display:flex;align-items:flex-end;justify-content:center}
.fc-art::before{content:'';position:absolute;inset:0;background:linear-gradient(0deg,var(--c) 0%,color-mix(in srgb,var(--c) 55%,transparent) 30%,transparent 70%),radial-gradient(rgba(0,0,0,.28) 1.3px,transparent 1.9px) 0 0/7px 7px}
.fc-img{position:relative;height:auto;max-height:420px;width:auto;max-width:108%;margin-bottom:74px;filter:drop-shadow(5px 5px 0 #000)}
.fc-name{position:absolute;left:0;right:0;bottom:0;padding:10px 14px;background:#000;border-top:4px solid #000}
.fc-name h3{display:inline;margin:0;font:400 italic clamp(38px,6vw,54px)/.95 var(--logo);color:var(--c);-webkit-text-stroke:1px #000;letter-spacing:.5px;overflow-wrap:anywhere}
.fc-aka{display:inline-block;margin-left:10px;vertical-align:.4em;font:13px/1 var(--pix);color:#000;background:#fff;padding:4px 6px}
.fc-role{display:block;margin-bottom:4px;font:700 14px/1.3 var(--cond);letter-spacing:.8px;text-transform:uppercase;color:#fff}
.fc-face{position:absolute;left:10px;top:10px}.fc-face img{width:64px;height:64px;border:3px solid #fff;box-shadow:3px 3px 0 #000}
.fc-guard{position:absolute;right:8px;top:8px;padding:4px;background:rgba(0,0,0,.35);border:2px solid rgba(255,255,255,.6)}.fc-guard img{display:block;height:80px;width:auto}
.fc-body{padding:18px 20px 20px;min-width:0}
.fc-badges{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
.fc-badge{display:inline-flex;align-items:center;gap:4px;font:700 14px/1.2 var(--cond);letter-spacing:.5px;text-transform:uppercase;padding:5px 9px;border:3px solid #000;box-shadow:3px 3px 0 #000}
.fc-badge.st{background:var(--y);color:#000;white-space:nowrap}.fc-badge.lk{background:#16141f;color:var(--y);padding-left:4px}.fc-badge .kc svg{width:20px;height:20px}
.fc-tag{margin:0;font:800 italic 21px/1.2 var(--cond);color:var(--ink)}
.fc-tag.nar{font:700 16px/1.3 var(--cond);letter-spacing:.8px;text-transform:uppercase;color:var(--mute)}
.fc-grunt{margin:4px 0 0;font:400 italic 26px/1.1 var(--logo);color:#3a7d0c;letter-spacing:1px}.fc-grunt small{font:700 13px var(--cond);color:var(--mute);letter-spacing:.4px;margin-left:6px}
.fc-bio{margin:8px 0 0;font-size:16px;line-height:1.55;color:#3d3950}
.links{margin-top:14px;padding:10px 12px;background:#fff;border:3px solid #000}
.links h5,.xbox h5{margin:0 0 6px;font:12px var(--pix);color:var(--mute);letter-spacing:.5px}
.links ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.links li{display:flex;align-items:flex-start;gap:8px;font-size:14px;line-height:1.4}
.links img{width:32px;height:32px;border:2px solid #000;flex:none}
.links details{margin-top:8px}.links summary{cursor:pointer;font:12px var(--pix);color:#b3161a;padding:6px 0}.links details ul{margin-top:6px}
.stats{display:grid;gap:5px;margin:16px 0 4px}
.st{display:grid;grid-template-columns:100px 1fr 44px;gap:10px;align-items:center}
.st span{font:12px var(--pix)}.st b{font:700 14px var(--txt);text-align:right;color:var(--mute)}
.sb{position:relative;height:16px;background:#1b1b24;border:3px solid #000}
.sb i{display:block;height:100%}
.sb::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 calc(10% - 2px),#000 calc(10% - 2px) 10%)}
.moves{display:grid;gap:12px;margin-top:14px;--u:30px}
.mv{border:3px solid #000;background:#fff;box-shadow:4px 4px 0 #000}
.mv-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 10px;padding:6px 10px;background:var(--c);border-bottom:3px solid #000}
.mv-lab{font:12px/1 var(--pix);color:#000;background:#fff;border:2px solid #000;padding:5px 7px}
.mv-main{display:grid;grid-template-columns:110px 1fr auto;gap:12px;align-items:center;padding:10px}
.mv-pic{display:flex;align-items:center;justify-content:center;min-height:90px;background:radial-gradient(circle,color-mix(in srgb,var(--c) 30%,#fff),#fff 70%)}
.mv-pic img{max-height:110px;width:auto}
.mv-t h5{margin:0;font:400 italic 22px/1.05 var(--logo);letter-spacing:.4px}
.mv-t p{margin:4px 0 0;font-size:15px;line-height:1.45}
.mv-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px!important}
.mv-chips i{font:700 13px/1.15 var(--cond);font-style:normal;letter-spacing:.4px;padding:4px 7px;background:#16141f;color:#fff;border-radius:3px}
.dmg{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:62px;padding:8px 6px;background:#16141f;color:var(--y);border:3px solid #000;font:400 30px/1 var(--logo)}
.dmg small{font:700 12px/1 var(--cond);letter-spacing:1px;color:#fff;margin-bottom:4px}
.xbox{margin-top:12px;padding:10px 12px;background:#fffbe9;border:3px dashed #000;--u:30px}
.xbox p{margin:6px 0 0;font-size:15px;line-height:1.45}
.xbox.dim{opacity:.85}
.xrow{display:flex;gap:10px;align-items:center;margin-top:6px}.xrow img{max-height:90px;width:auto}
.coisa{margin-top:18px;padding:14px;background:#1b0806;color:#ffe3dc;border:4px solid #000;box-shadow:6px 6px 0 #000;--c:#ff3b2f}
.co-head{display:flex;gap:12px;align-items:flex-start}
.co-head h4{margin:0;font:400 italic 40px/1 var(--logo);color:#ff3b2f;-webkit-text-stroke:1px #000;letter-spacing:1px}
.co-role{margin:2px 0 8px!important;font:700 14px/1.2 var(--cond);letter-spacing:.8px;text-transform:uppercase;color:#ffb0a0}
.co-head p{margin:0;font-size:15px;line-height:1.5}
.morph{list-style:none;margin:14px 0 6px;padding:0;display:grid;grid-template-columns:repeat(5,1fr);gap:6px;align-items:end}
.morph li{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;min-height:150px;padding:6px 4px;background:#2a0e0a;border:2px solid #000;text-align:center}
.morph img{max-height:180px;width:auto}
.morph span{font:700 12px/1.2 var(--cond);letter-spacing:.4px;text-transform:uppercase;color:#ffb0a0}
.coisa .st span,.coisa .st b{color:#ffe3dc}.coisa .mv{color:var(--ink)}
.ftab{min-width:660px;font-size:15px}
.ftab th,.ftab td{padding:8px 10px;border-bottom:2px solid #cdbd8c;text-align:center}
.ftab thead th{font:12px/1.4 var(--pix)}
.ftab thead tr:first-child th[colspan]{background:#16141f;color:var(--y);border-bottom:0}
.ftab tbody th{text-align:left;font:400 italic 19px var(--logo);letter-spacing:.3px}.ftab tbody th small{display:block;font:600 12px var(--txt);font-style:normal;color:#6b6480}
.ftab tbody th,.ftab thead th:first-child{position:sticky;left:0;z-index:1;background:var(--paper);box-shadow:3px 0 0 #cdbd8c}
.ftab a{color:var(--ink);text-decoration:none}
.ftab td:nth-child(n+6){font:400 20px var(--logo);color:#b3161a}
/* FASE 11: online */
.flow.on{grid-template-columns:1fr}
@media (min-width:760px){.flow.on{grid-template-columns:repeat(4,1fr)}.flow.on li:nth-child(3n)::after{display:block}}
@media (min-width:560px) and (max-width:759px){.flow.on li:not(:last-child)::after{content:'▼';left:50%;right:auto;top:auto;bottom:-17px;translate:-50% 0}}
.modes{display:grid;gap:22px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));align-items:start}
.mode{display:flex;flex-direction:column;background:var(--paper);background-image:var(--grain),var(--dots);color:var(--ink);border:4px solid #000;box-shadow:7px 7px 0 #000;--u:30px}
.md-art{display:flex;align-items:center;justify-content:center;gap:8px;padding:16px;min-height:110px;border-bottom:4px solid #000;background:radial-gradient(circle,#2b4fae,#101a4a 70%)}
.mode.duo .md-art{background:radial-gradient(circle,#2b8a5a,#0d2a1d 70%)}.mode.cup .md-art{background:radial-gradient(circle,#b58500,#3b2600 70%);--u:72px}
.md-art img{width:60px;height:60px;border:3px solid #fff;box-shadow:3px 3px 0 #000}
.md-art b{font:400 italic 34px/1 var(--logo);color:var(--y);-webkit-text-stroke:1.5px #000;text-shadow:3px 3px 0 #000}
.mode h3{margin:12px 14px 0;font:400 italic 34px/1 var(--logo);letter-spacing:.5px}
.md-sub{margin:4px 14px 0;font:700 14px/1.3 var(--cond);letter-spacing:.8px;text-transform:uppercase;color:var(--mute)}
.md-gl{margin:10px 14px 0;padding:8px 10px;background:#fff;border:2px solid #000;display:grid;gap:4px}
.md-gl div{display:flex;gap:8px;font-size:14px;line-height:1.35}.md-gl dt{font:12px/1.4 var(--pix);color:#b3161a;flex:none;min-width:84px}.md-gl dd{margin:0}
.mode ol{margin:10px 0 0;padding:0 14px 0 34px;display:grid;gap:7px;font-size:15px;line-height:1.45}
.md-pts{margin:12px 14px 14px;padding:8px 10px;background:#16141f;color:#fff;font-size:14px}
.brk-f{margin:0 14px 14px}
.brk-f figcaption{font:12px/1.3 var(--pix);text-align:center;color:var(--mute)}
.brk{display:block;width:100%;max-width:300px;margin:0 auto 6px;height:auto}
.brk .slot{fill:#fff;stroke:#000;stroke-width:3}.brk .slot.bye{fill:#e9e2c6;stroke-dasharray:5 3}
.brk .st{font:13px var(--pix);text-anchor:middle;fill:#57536a}.brk .ln{fill:none;stroke:#000;stroke-width:3}.brk .lb{font:13px var(--pix);text-anchor:middle;fill:#16141f}
.exos{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))}
.exo{padding:12px 14px;background:#101a31;border:3px solid #000;box-shadow:5px 5px 0 #000;border-left:6px solid var(--b)}
.exo h4{margin:0 0 4px;font:400 italic 21px/1 var(--logo);color:#9cc0ff}
.exo p{margin:0;font-size:15px;line-height:1.45;color:#d7def0}
/* FASE 12: celular */
.phones{display:grid;gap:26px;grid-template-columns:minmax(0,.8fr) minmax(0,1.4fr);align-items:start}
.phf{margin:0;display:flex;flex-direction:column;gap:12px}
.ph{display:block;width:100%;height:auto;max-height:520px;filter:drop-shadow(7px 7px 0 #000)}
.ph .t1{font:10px var(--pix);fill:#fff3b0}.ph .t2{font:9px var(--txt);text-anchor:middle}.ph .t3{font:11px var(--pix);fill:#dfe7f3}.ph .t4{font:9px var(--pix);fill:#fff}
.ph .cn circle{fill:var(--y);stroke:#000;stroke-width:3}.ph .cn text{font:10px var(--pix8);text-anchor:middle;fill:#000}
.phf figcaption{padding:12px 14px;background:var(--paper);background-image:var(--grain);color:var(--ink);border:4px solid #000;box-shadow:6px 6px 0 #000;font-size:15px}
.phf figcaption>b{font:400 italic 24px/1 var(--logo);letter-spacing:.4px}
.phf ol{margin:6px 0 0;padding-left:22px;display:grid;gap:4px}
.csteps{list-style:none;margin:26px 0 0;display:grid;gap:12px}
.csteps li{display:flex;gap:12px;align-items:flex-start}
.csteps li>div>b{font:400 italic 22px/1 var(--logo);letter-spacing:.3px}.csteps p{margin:3px 0 0;font-size:15px;line-height:1.5}
/* FASE 13: enredo */
.dossier{background:#10170c;border:4px solid #000;box-shadow:8px 8px 0 #000;color:#e8f5d8}
.hazard{height:18px;background:repeating-linear-gradient(-45deg,#ffd23f 0 16px,#000 16px 32px)}
.dos-in{position:relative;display:flex;gap:18px;align-items:flex-start;padding:22px 20px;background:radial-gradient(circle at 90% 20%,rgba(155,226,42,.16),transparent 55%),repeating-linear-gradient(0deg,rgba(155,226,42,.05) 0 1px,transparent 1px 4px);--u:64px}
.dos-in h3{margin:8px 0 8px;font:400 italic clamp(24px,4vw,34px)/1.05 var(--logo);color:var(--tox);letter-spacing:.5px}
.dos-in p{margin:0;font-size:17px}.dos-in a{color:var(--y)}
.stamp{display:inline-block;font:15px/1 var(--pix);color:#ff4d4d;border:5px double #ff4d4d;padding:6px 10px;transform:rotate(-8deg);letter-spacing:2px;opacity:.9;text-shadow:1px 0 0 rgba(255,77,77,.5),-1px 1px 0 rgba(255,77,77,.35)}
.story{display:grid;gap:26px}
.act-block{display:grid;gap:14px}
.act-ban{position:relative;min-height:130px;display:flex;align-items:flex-end;padding:12px;background:#000 var(--bg) center 35%/cover;border:4px solid #000;box-shadow:7px 7px 0 #000;overflow:hidden}
.act-ban::before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.65),rgba(0,0,0,.1) 70%)}
.act-ban .num{position:absolute;left:10px;top:10px;min-width:0;height:auto;padding:6px 8px;border-radius:0;font-size:12px}
.act-ban h4{position:relative;margin:0;padding:6px 10px;background:var(--y);color:#000;border:3px solid #000;box-shadow:3px 3px 0 #000;font:400 italic clamp(22px,3.4vw,30px)/1.05 var(--logo);letter-spacing:.3px}
.tl{list-style:none;margin:0;padding:0 0 0 8px;position:relative}
.tl::before{content:'';position:absolute;left:28px;top:10px;bottom:10px;width:6px;background:repeating-linear-gradient(180deg,var(--tox) 0 14px,#000 14px 20px);border:2px solid #000}
.tl li{position:relative;display:grid;grid-template-columns:48px 1fr;gap:14px;margin-bottom:14px}
.tl-n{position:relative;z-index:1;display:grid;place-items:center;width:48px;height:48px;border-radius:50%;background:var(--tox);color:#000;border:4px solid #000;font:12px/1 var(--pix8);box-shadow:3px 3px 0 #000}
.tl-card{position:relative;isolation:isolate;padding:12px 14px;background:#101a12;border:3px solid #000;box-shadow:5px 5px 0 #000;border-left:6px solid var(--tox);display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:center;overflow:hidden}
.tl-card::before{content:'';position:absolute;inset:0;z-index:-1;background:var(--bg,none) center/cover;opacity:.34;-webkit-mask:linear-gradient(90deg,transparent 25%,#000 85%);mask:linear-gradient(90deg,transparent 25%,#000 85%)}
.tl-when{grid-column:1/-1;justify-self:start;display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.tl-when b{font:13px/1 var(--pix);background:#000;color:var(--tox);padding:6px 8px;letter-spacing:1px}
.tl-when i{font:13px/1 var(--pix);font-style:normal;background:var(--tox);color:#000;padding:6px 8px;border:2px solid #000}
.tl-card p{margin:0;font-size:16px;line-height:1.5;color:#e2eed6}.tl-card b{color:#fff}.tl-card i{color:#ff6b6b;font-style:normal;font-weight:700}
.tl-next{text-decoration:none;border-left-color:#ff4d4d;background:#1a0508}.tl-next p{color:#ffd0d0;font-weight:700}
.tl-faces{display:flex;gap:6px}
.tl-f{display:flex;flex-direction:column;align-items:center;gap:3px}.tl-f img{width:46px;height:46px;border:3px solid #000}
.tl-f small{font:700 12px/1 var(--cond);letter-spacing:.5px;color:#fff;background:#000;padding:2px 4px}
.acts{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))}
.act{background:#fff;color:var(--ink);border:4px solid #000;box-shadow:7px 7px 0 #000;display:flex;flex-direction:column}
.act-img{position:relative;aspect-ratio:16/7;background:center 30%/cover;border-bottom:4px solid #000}
.act-img h4{position:absolute;left:10px;bottom:10px;margin:0;padding:6px 10px;background:var(--y);border:3px solid #000;font:400 italic 22px/1.05 var(--logo)}
.act-t{padding:14px 16px 16px}.act-t p{margin:0;font-size:16px}
.act-faces{display:flex;flex-wrap:wrap;gap:4px;margin-top:10px}.act-faces img{width:38px;height:38px;border:2px solid #000}
.facs{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}
.fac{padding:14px;border:4px solid #000;box-shadow:6px 6px 0 #000;background:#101a31}
.fac h4{margin:0 0 6px;font:400 italic 26px/1 var(--logo);letter-spacing:.5px}
.fac p{margin:0 0 10px;font-size:15px;line-height:1.45;color:#d7def0}
.fac.vil{border-top:8px solid #e5383b}.fac.vil h4{color:#ff6b6b}.fac.her{border-top:8px solid #2bb673}.fac.her h4{color:#7ee2aa}.fac.neu{border-top:8px solid #9257e6}.fac.neu h4{color:#c9a8ff}
.fac-faces{display:flex;flex-wrap:wrap;gap:4px}.fac-faces img{width:40px;height:40px;border:2px solid #000}
.web{margin:0 auto;max-width:640px}
.web-in{position:relative;aspect-ratio:1;container-type:inline-size}
.web svg{position:absolute;inset:0;width:100%;height:100%}
.web path{fill:none;stroke-linecap:round}
.web .one{stroke:rgba(255,244,214,.38);stroke-width:2}.web .mu{stroke:var(--y);stroke-width:3.4;opacity:.8}
.wn{position:absolute;translate:-50% -50%;display:flex;flex-direction:column;align-items:center;gap:3px;width:15%;text-decoration:none;z-index:1}
.wn img{display:block;width:78%;height:auto;aspect-ratio:1;border:3px solid #000;border-radius:50%;background:var(--c);box-shadow:0 0 0 3px var(--c),3px 3px 0 3px #000;transition:transform .1s}
.wn span{font:max(10px,1.9cqw)/1 var(--pix);color:#fff;background:#000;padding:2px 4px;white-space:nowrap}
.wn:hover img,.wn:focus-visible img{transform:scale(1.12)}
.web figcaption{margin-top:12px;text-align:center}
.web-leg{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;justify-content:center;gap:6px 16px;font:700 14px/1.2 var(--cond);letter-spacing:.6px;text-transform:uppercase}
.web-leg li{display:flex;align-items:center;gap:6px}.web-leg i{width:14px;height:14px;border-radius:50%;border:2px solid #000}
.mu-s{display:inline-block;width:26px;height:4px;background:var(--y);vertical-align:middle}
.web figcaption p{margin:8px auto 0;max-width:520px;font-size:15px;color:#cfd8ee}.web figcaption a{color:var(--y)}
.gloss{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))}
.gl{padding:12px 14px;background:var(--paper);background-image:var(--grain);color:var(--ink);border:3px solid #000;box-shadow:5px 5px 0 #000;border-top:10px solid #b3161a}
.gl>b{display:block;font:14px/1.3 var(--pix);letter-spacing:.5px;margin-bottom:6px}
.gl p{margin:0;font-size:15px;line-height:1.45}
.cliff{display:block;margin-top:30px;padding:18px;text-align:center;text-decoration:none;background:#1a0508;border:4px solid #000;box-shadow:7px 7px 0 #000;font:700 italic 19px/1.3 var(--txt);color:#ffd0d0}
.cliff span{display:block;font:15px var(--pix);color:#ff4d4d;margin-bottom:8px;letter-spacing:2px}
/* contracapa */
.back{position:relative;margin-top:90px;padding:70px 16px 60px;text-align:center;background:radial-gradient(circle at 50% 30%,#3a0a10,#0a0205 65%);border-top:6px solid #000;box-shadow:0 -4px 0 #ff4d4d;overflow:hidden}
.back::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.28) 0 2px,transparent 2px 4px);pointer-events:none}
.bk-in{position:relative;z-index:1;max-width:760px;margin:0 auto}
.bk-tag{margin:0;font:18px var(--pix);color:#ff4d4d;letter-spacing:4px}
.bk-q{margin:14px auto 0;font:400 clamp(120px,24vw,220px)/.9 var(--logo);color:transparent;-webkit-text-stroke:3px #ff4d4d;text-shadow:0 0 30px rgba(255,60,60,.6)}
.bk-seq{margin:18px auto 0;max-width:640px;font:600 18px/1.6 var(--txt);color:#ffd9d9}
.bk-logo{font-size:clamp(50px,11vw,110px);margin-top:30px}
.bk-logo span{display:inline;font-size:1em;letter-spacing:0;margin-left:.15em;-webkit-text-fill-color:#ff3b3b}
.bk-soon{display:inline-block;margin:14px 0 0;font:16px var(--pix);background:#ff3b3b;color:#fff;padding:8px 12px;border:3px solid #000;box-shadow:4px 4px 0 #000;letter-spacing:2px}
.bk-feats{list-style:none;margin:34px 0 30px;padding:0;display:grid;gap:10px;grid-template-columns:repeat(3,1fr)}
.bk-feats li{padding:10px;border:3px solid #fff;background:rgba(0,0,0,.55);display:flex;flex-direction:column;gap:4px}
.bk-feats b{font:15px/1.2 var(--pix);color:var(--y)}.bk-feats span{font:600 13px/1.3 var(--txt);color:#e7e7f0}
.bk-small{margin:30px 0 0;font-size:13px;color:#b99}
/* telas estreitas */
@media (max-width:860px){
 .fc{grid-template-columns:1fr}
 .fc-art{position:relative;top:auto;border-right:0;border-bottom:4px solid #000;min-height:0;height:300px}
 .fc-img{max-height:220px;margin-bottom:70px}
}
@media (max-width:560px){
 .fc-art{height:260px}.fc-img{max-height:190px}
 .tower{grid-template-columns:1fr}
 .tw-img{height:200px}
 .phones{grid-template-columns:1fr}
 .ph{max-height:440px}
 .phf:first-child .ph{max-width:260px;margin:0 auto}
 .ctl{grid-template-columns:70px 1fr;gap:6px 12px}
 .ctl-ic{grid-row:span 3}
 .cab-deck{grid-template-columns:auto 1fr;grid-template-areas:"s p" "d d";--u:50px}
 .cd-stick{grid-area:s}.cd-pills{grid-area:p;justify-content:center;flex-direction:row;flex-wrap:wrap}.cd-pad{grid-area:d}
 .moves{grid-auto-flow:column;grid-auto-columns:88%;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:10px;overscroll-behavior-x:contain}
 .moves>.mv{scroll-snap-align:start}
 .mv-swipe{display:block;margin:14px 0 -6px;color:#b3161a}
 .rs-top{grid-template-columns:1fr}
}
@media (max-width:560px){
 body{font-size:16px}
 .band{margin-top:64px}
 .cv-burst{position:static;transform:rotate(6deg);margin:10px auto 0;display:inline-block;--bs:110px}
 .cv-seal{left:auto;right:4px;top:52px;width:78px;transform:rotate(10deg)}
 .lineup .la0,.lineup .la4{display:none}
 .lineup img{margin:0 -9%}
 .crow{grid-template-columns:1fr 64px;gap:8px}
 .c-cmd{grid-column:1/-1}.crow .c-eq{display:none}
 .brow{grid-template-columns:1fr}.brow .c-eq{display:none}
 .mv-main{grid-template-columns:84px 1fr;gap:10px}
 .mv-pic img{max-height:90px}
 .dmg{grid-column:2;justify-self:start;flex-direction:row;gap:8px;min-width:0;padding:5px 10px;font-size:24px}.dmg small{margin:0}
 .flipdemo{grid-template-columns:1fr}.flipdemo .fd.r{justify-content:flex-start;text-align:left;flex-direction:row-reverse}.flipdemo img{height:64px}
 .step{grid-template-columns:78px 1fr}
 .st-art{height:104px}.st-art img{max-height:96px}
 .tl::before{left:21px}.tl li{grid-template-columns:36px 1fr;gap:10px}.tl-n{width:36px;height:36px;font-size:10px;border-width:3px}
 .tl-card{grid-template-columns:1fr}.tl-f img{width:40px;height:40px}
 .dos-in{flex-direction:column}
 .fl{grid-template-columns:44px 1fr;gap:10px}.fl-n{width:44px;height:44px;font-size:10px}.fl-faces{grid-column:2}.fl-t{grid-column:1/-1}
 .fl-faces img{width:48px;height:48px}
 .morph{grid-template-columns:repeat(3,1fr)}.morph li{min-height:120px}.morph img{max-height:130px}
 .tip{flex-wrap:wrap;padding-top:22px}.tip .burst{margin:-40px 0 0 -18px;--bs:84px}.tip-face{display:none}
 .howto{flex-direction:column;align-items:flex-start}
 .keyb{padding:10px}
 .cd-pad{gap:14px 10px}.cd-b{transform:none!important}.coin{display:none}.cd-stick .big svg{width:96px;height:96px}
 .ctl-ic{align-self:start;padding-top:6px}
 .st{grid-template-columns:84px 1fr 40px;gap:8px}
 .co-head{flex-direction:column}
 .fc-name h3{font-size:40px}
 .dtab{min-width:0;--u:22px}.dtab th,.dtab td{padding:8px 4px}.dtab tbody th{font-size:17px}.dtab thead span{flex-direction:column;gap:2px}.dtab .kc svg{width:28px;height:28px}
 .btab{--u:30px}.btab th,.btab td{padding:8px 4px}
 .swipe{display:block}
 .bk-feats{grid-template-columns:1fr 1fr}
 .words div{grid-template-columns:1fr;gap:2px}
 .rs-pad{grid-template-columns:repeat(2,1fr)}
 .locked{flex-direction:column}
 .idx2 a{grid-template-columns:36px 1fr auto;grid-template-rows:auto auto}.idx2 a>i{display:none}
 .wn span{font-size:9px;padding:1px 3px}
}
@media (max-width:380px){.idx{gap:10px}.idx a>b{font-size:19px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
@media print{.toc,.cta,.folio a,.cv-cta{display:none}body{background:#fff}.fc,.pnl,.paper,.cgroup,.rule,.mode,.dica{break-inside:avoid}.cv{content-visibility:visible}.kb-det{display:block}}
'''

# o índice fixo acende a fase em que você está; no celular (toque), o teclado desenhado começa fechado
JS = r'''(()=>{const toc=document.querySelector('.toc'),links=[...document.querySelectorAll('.toc a[data-s]')];
if(toc&&'IntersectionObserver' in window){const io=new IntersectionObserver((es)=>{for(const e of es){if(!e.isIntersecting)continue;
links.forEach((a)=>{const on=a.dataset.s===e.target.id;a.classList.toggle('on',on);if(on)toc.scrollTo({left:a.offsetLeft-toc.clientWidth/2+a.offsetWidth/2})})}},{rootMargin:'-45% 0px -50% 0px'});
document.querySelectorAll('section.sec').forEach((s)=>io.observe(s))}
try{if(matchMedia('(pointer:coarse)').matches)document.querySelectorAll('.kb-det').forEach((d)=>{d.open=false})}catch(e){}})();'''


# ================================================================ trava de segurança
_CODE_TOK = {'up': ('↑', 'W', 'su'), 'down': ('↓', 'S', 'sd'), 'left': ('←', 'A', 'sl'), 'right': ('→', 'D', 'sr'),
             'punch': ('G', 'G', 'bG'), 'kick': ('H', 'H', 'bH'), 'heavy': ('J', 'J', 'bJ'), 'block': ('V', 'V', 'bV'), 'special': ('B', 'B', 'bB')}


def _codes():
    """As sequências de LOCKED (inclusive a do secreto), só pra conferir que nenhuma saiu no manual."""
    m = re.search(r'export const LOCKED[^=]*=\s*\{(.*?)\n\};', _ROSTER_TS, re.S)
    return [re.findall(r"'(\w+)'", c) for c in re.findall(r'code:\s*\[([^\]]*)\]', m.group(1) if m else '')]


def _cmd_spans(page):
    """O miolo de cada <span class="cmd"> (acompanha os <span> de dentro até fechar o de fora)."""
    out = []
    for m in re.finditer(r'<span class="cmd">', page):
        depth, pos = 1, m.end()
        for t in re.finditer(r'<(/?)span\b', page[pos:]):
            depth += -1 if t.group(1) else 1
            if depth == 0:
                out.append(page[pos:pos + t.start()])
                break
    return out


def check(page):
    """Nada vai pro disco se o manual citar o lutador secreto, o ano antigo ou um código de destravar."""
    if SECRET_RE and SECRET_RE.search(page):
        raise SystemExit('manual.py: o lutador secreto apareceu no manual (' + SECRET_RE.search(page).group(0) + '); nada foi gravado')
    for s in SECRET:
        if re.search(re.escape(s), page, re.I):
            raise SystemExit('manual.py: o id do lutador secreto apareceu no manual; nada foi gravado')
    if OLD_YEAR.search(page):
        raise SystemExit('manual.py: sobrou um ano antigo no manual; nada foi gravado')
    text = re.sub(r'\s+', '', html.unescape(re.sub(r'<[^>]+>', '', page.split('<body>', 1)[-1])))
    cmds = [re.findall(r'href="#(\w+)"', c) for c in _cmd_spans(page)]
    for code in _codes():
        toks = [_CODE_TOK.get(c) for c in code]
        if not code or None in toks:
            continue
        for k in (0, 1):
            if ''.join(t[k] for t in toks) in text:
                raise SystemExit('manual.py: um código de destravar apareceu escrito no manual; nada foi gravado')
        seq = [t[2] for t in toks]
        for c in cmds:
            icons = [u for u in c if re.fullmatch(r's(u|d|l|r)|b[GHJVB]', u)]
            if any(icons[k:k + len(seq)] == seq for k in range(len(icons) - len(seq) + 1)):
                raise SystemExit('manual.py: um código de destravar apareceu em ícones no manual; nada foi gravado')


# ================================================================ montagem
def build():
    body = (cover() + toc_nav() + index() + s_luta() + s_controle() + s_passos() + s_tela() + s_barra() + s_regras() + s_dicas() + s_arcade()
            + s_comandos() + s_lutadores() + s_online() + s_celular() + s_enredo() + back())
    desc = f'Manual do jogador de V4 Fighters – Trouble Work ({YEAR}): controles, golpes, regras, enredo e as fichas dos {len(ROSTER)} lutadores.'
    page = f'''<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Manual do Jogador · V4 Fighters</title>
<meta name="description" content="{attr(desc)}"><meta name="theme-color" content="#0a1220">
<link rel="icon" href="icons/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:ital,wght@0,700;0,800;1,800&family=Barlow:ital,wght@0,500;0,600;0,700;1,700&family=Press+Start+2P&family=Silkscreen&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body>
{svg_sprite()}
{body}
<script>{JS}</script>
</body></html>'''
    page = re.sub(r'\n\s+', '\n', page)
    check(page)
    with open(os.path.join(PUB, 'manual.html'), 'w', encoding='utf-8') as f:
        f.write(page)
    # recortes que não são mais usados saem da pasta
    for fn in os.listdir(OUT):
        if fn not in MADE and not fn.startswith('.'):
            os.remove(os.path.join(OUT, fn))
    size = sum(os.path.getsize(os.path.join(OUT, fn)) for fn in MADE)
    crops = sum(1 for fn in MADE if fn.endswith('.png') and not fn.endswith('-face.png'))
    print(f'manual.html {len(page.encode("utf-8")) // 1024} KB · {len(ROSTER)} lutadores · {len(MADE)} imagens em public/manual/ '
          f'({crops} recortes de sprite, {size // 1024} KB) · {len(SYMS)} ícones SVG')


if __name__ == '__main__':
    build()
