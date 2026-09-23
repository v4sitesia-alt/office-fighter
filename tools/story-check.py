#!/usr/bin/env python3
"""Confere as regras do enredo e das falas do V4 Fighters (pedidos do dono). Sai com erro se alguma regra quebrar.

  python3 tools/story-check.py          # tudo
Regras: ano 2026 (nada de 199X); abertura curta (teaser de até 6 linhas com texto); falas de par com 3 linhas dos dois lutadores do par; tamanho das falas;
o Xablau só grunhe; o Michael sem casamento; a Van fala da FILHA; o Kevin e o churrasco (com o sarro do Edgard);
o Dener fora do manual; o laboratório do Xablau no 51º andar, logo abaixo do Mundim (nada de subsolo);
bios e frases de efeito no tamanho que cabe nas telas."""
import itertools, json, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = json.load(open(os.path.join(ROOT, 'src/data/story.json')))
IDS = ['edgard', 'laura', 'landim', 'eneias', 'santana', 'michael', 'dede', 'van', 'kevin', 'crm', 'leo', 'dias', 'xablau', 'mundim', 'dener']
errs, warns = [], []
err = errs.append; warn = warns.append
GRUNT = re.compile(r"^[GRHNAUKOEIYM\s!\.\-…,?]+$")          # só onomatopeia, nada de palavra

# ---------- ano
for path in ['src/data/story.json', 'src/ui/screens.ts', 'src/ui/intro.ts', 'tools/manual.py', 'public/manual.html']:
    p = os.path.join(ROOT, path)
    if os.path.exists(p) and re.search(r'199X|199x', open(p, encoding='utf-8').read()): err(f'{path}: ainda tem 199X (o ano é 2026)')
if S['crawl'] and S['crawl'][0].strip() != '2026.': err(f"crawl: a primeira linha deveria ser '2026.' (está '{S['crawl'][0]}')")
for i, ln in enumerate(S['crawl']):
    if len(ln) > 28: err(f'crawl linha {i + 1}: {len(ln)} caracteres (máx 28): {ln}')
# a abertura dura uns 12 s de texto rolando sobre a música: é só um teaser (pedido do dono, 2026-09-23)
crawl_txt = [ln for ln in S['crawl'] if ln.strip()]
if len(crawl_txt) > 6: err(f'crawl: {len(crawl_txt)} linhas com texto (máx 6): a abertura é um teaser breve, não dá tempo de ler muito texto')
if len(S['acts']) != 4: warn(f"acts: {len(S['acts'])} atos (o manual espera 4)")

# ---------- falas de cada lutador
for fid in IDS:
    v = S['fighters'].get(fid)
    if not v: err(f'fighters.{fid}: faltando'); continue
    for k in ('open', 'reply', 'close'):
        for t in v.get(k, []):
            if len(t) > 120: err(f'fighters.{fid}.{k}: fala com {len(t)} caracteres (máx 120): {t[:60]}…')
            if fid == 'xablau' and not GRUNT.match(t): err(f'fighters.xablau.{k}: o Xablau só grunhe, mas tem palavra: {t}')
    if len(v.get('ending', '')) > 360: err(f'fighters.{fid}.ending: {len(v["ending"])} caracteres (máx 360)')
if S.get('grunts', {}).get('xablau'):
    for g in S['grunts']['xablau']:
        if not GRUNT.match(g): err(f'grunts.xablau: tem palavra: {g}')
else: warn('grunts.xablau: faltando (o jogo usa a lista padrão do dialogue.ts)')

# ---------- pares: todos os confrontos, 3 falas dos dois lutadores
pairs = S['pairs']
for a, b in itertools.combinations(sorted(IDS), 2):
    key = f'{a}|{b}'
    if key not in pairs: warn(f'pairs.{key}: sem roteiro próprio (usa o banco genérico)'); continue
for key, lines in pairs.items():
    a, b = key.split('|')
    if [a, b] != sorted([a, b]): err(f'pairs.{key}: chave fora de ordem alfabética (o jogo procura "{"|".join(sorted([a, b]))}")')
    if len(lines) < 3: err(f'pairs.{key}: {len(lines)} falas (o jogo mostra 3)')
    who = [w for w, _ in lines[:3]]
    if not set(who) <= {a, b}: err(f'pairs.{key}: fala de alguém de fora do par: {who}')
    if set(who) != {a, b}: err(f'pairs.{key}: os dois lutadores precisam falar nas 3 primeiras falas: {who}')
    for w, t in lines:
        if len(t) > 120: err(f'pairs.{key}: fala com {len(t)} caracteres (máx 120): {t[:60]}…')
        if w == 'xablau' and not GRUNT.match(t): err(f'pairs.{key}: o Xablau só grunhe, mas tem palavra: {t}')

# ---------- pedidos específicos
txt = lambda fid: ' '.join([*S['fighters'][fid].get('open', []), *S['fighters'][fid].get('reply', []), *S['fighters'][fid].get('close', []), S['fighters'][fid].get('ending', '')]
    + [t for k, ls in pairs.items() if fid in k.split('|') for _, t in ls])
if re.search(r'casament|casar\b|casou|noiva|aliança|valsa|convite do casamento', txt('michael'), re.I): err('michael: ainda fala de casamento')
if re.search(r'\bfilho\b', txt('van'), re.I): err('van: fala "filho" (é FILHA)')
if not re.search(r'churras', txt('kevin'), re.I): err('kevin: o churrasco não aparece nas falas dele')
ek = ' '.join(t for _, t in pairs.get('edgard|kevin', []))
if not re.search(r'churras|assa|grelha|carne', ek, re.I): err('edgard|kevin: o Edgard não tira sarro do churrasco do Kevin')
if re.search(r'\baltura\b|baixinho|tampinha|nanico', txt('dener'), re.I): err('dener: piada de altura (proibido)')
alltext = json.dumps(S, ensure_ascii=False)
if re.search(r'cacete', alltext, re.I): err('"cacete" voltou (duplo sentido): a Laura fala "uma pisa" (o dono aprovou)')
for w in ('Fable Ultracode', 'Astra 6'):
    if w not in alltext: warn(f'"{w}" não aparece no enredo')
for sect in ('acts', 'factions'):
    if re.search(r'dener', json.dumps(S[sect], ensure_ascii=False), re.I): err(f'{sect}: cita o Dener (vai pro manual; é proibido)')
man = os.path.join(ROOT, 'public/manual.html')
if os.path.exists(man) and re.search(r'dener', open(man, encoding='utf-8').read(), re.I): err('public/manual.html: cita o Dener (proibido no manual)')
# o laboratório do Xablau fica em cima, no 51º andar, logo abaixo do Mundim: no arcade o elevador do Leo sobe e para no caos
for path in ['src/data/story.json', 'src/data/places.json', 'tools/manual.py', 'public/manual.html', *[f'public/fighters/{i}/fighter.json' for i in IDS]]:
    p = os.path.join(ROOT, path)
    if os.path.exists(p) and re.search(r'subsolo|porão', open(p, encoding='utf-8').read(), re.I): err(f'{path}: fala em subsolo (o laboratório do Xablau é no 51º andar, logo abaixo do Mundim)')
PL = json.load(open(os.path.join(ROOT, 'src/data/places.json')))['places']
if '51' not in PL['xablau']['name']: err(f"places.json: o lugar do Xablau deveria ser o 51º andar (está '{PL['xablau']['name']}')")
if not PL['leo']['y'] > PL['xablau']['y'] > PL['mundim']['y']: err('places.json: no mapa, o Xablau fica na torre entre o elevador (Leo) e o Mundim')

# ---------- bios e frases de efeito (fighter.json)
for fid in IDS:
    d = json.load(open(os.path.join(ROOT, f'public/fighters/{fid}/fighter.json')))
    if len(d.get('tagline', '')) > 48: err(f'{fid}/fighter.json: tagline com {len(d["tagline"])} caracteres (máx 48)')
    if len(d.get('bio', '')) > 340: err(f'{fid}/fighter.json: bio com {len(d["bio"])} caracteres (máx 340)')
    if fid == 'michael' and re.search(r'casar|casamento|noiva', d.get('bio', ''), re.I): err('michael/fighter.json: bio fala de casamento')

for w in warns: print('aviso:', w)
for e in errs: print('ERRO:', e)
print(f'{len(errs)} erro(s), {len(warns)} aviso(s)')
sys.exit(1 if errs else 0)
