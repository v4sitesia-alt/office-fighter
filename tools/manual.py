#!/usr/bin/env python3
"""Gera public/manual.html a partir dos fighter.json (nomes, atributos, golpes e danos ficam sempre em dia).
Uso: python3 tools/manual.py"""
import json, html, re
ROSTER = re.findall(r"'([a-z]+)'", open('src/data/roster.ts').read().split('ROSTER')[1].split(']')[0])
STORY = json.load(open('src/data/story.json'))
F = {i: json.load(open(f'public/fighters/{i}/fighter.json')) for i in ROSTER}
SUPER = {
 'edgard': 'Bate a mão no chão e abre um portal de morcegos sob o adversário, onde quer que ele esteja. Dois acertos; o segundo derruba.',
 'santana': 'Salta sobre o adversário, desce com o punho e a explosão atinge uma área larga ao redor do impacto.',
 'kevin': 'Saca a pistola e dispara três tiros rápidos em sequência, de qualquer distância.',
 'laura': 'Arranca, agarra, levanta e arremessa. Ignora a defesa: só escapa quem estiver no ar.',
 'dede': 'Gira as boleadeiras e arremessa. Projétil largo que derruba.',
 'dias': 'Barrigada em corrida que atravessa meia tela e lança o adversário longe.',
 'michael': 'Direto em avanço que termina em gancho. O super mais rápido de sair.',
 'eneias': 'Corre, mergulha de barriga e explode no chão. O maior dano bruto do jogo.',
 'van': 'Aponta o bebê e solta a nuvem tóxica. Área grande à frente, derruba.',
 'landim': 'Feixe da câmera que dispara a lente como projétil.',
 'xablau': 'Língua com punho que alcança quase a tela inteira.',
 'mundim': 'Abre o paletó e arremessa as garrafas da diretoria.'}
MAGIC_KIND = {'ball': 'bola de energia', 'slash': 'risco cortante', 'cloud': 'nuvem', 'coin': 'moeda giratória', 'heart': 'coração', 'wave': 'onda rasteira', 'bat': 'morcego'}
SIDES = [(k, STORY['factions'][k][0], STORY['factions'][k][1]) for k in ('vilao', 'heroi', 'neutro')]
e = html.escape
def bar(label, v, color):
    pct = round(max(0, min(1, (v - 0.7) / 0.65)) * 100)
    return f'<div class="stat"><span>{label}</span><div><i style="width:{pct}%;background:{color}"></i></div><b>{v:.2f}</b></div>'
def card(i):
    d = F[i]; st = d['stats']; M = d['moves']; c = d['colors']['primary']; mg = st.get('magic', 1)
    sp, su = M['special'], M['super']
    kind = MAGIC_KIND.get(sp.get('projectile', {}).get('style', ''), 'projétil próprio do lutador')
    sdmg = su.get('throw', {}).get('release', {}).get('damage') or (sum(h['damage'] for h in su['zone']['hits']) + su.get('damage', 0) if 'zone' in su else su['damage'] * su.get('projectile', {}).get('count', 1))
    city = d.get('origin', {}).get('city', 'Origem desconhecida')
    return f'''<article class="fighter" style="--c:{c}" id="{i}">
  <div class="art"><img src="versus/{i}.png" alt="{e(d['name'])}" loading="lazy"></div>
  <div class="info">
    <div class="head"><img class="av" src="fighters/{i}/portrait.png" alt=""><div><h3>{e(d['name'])}</h3><p class="role">{e(d['role'])} · {e(city)}</p></div></div>
    <p class="tag">“{e(d.get('tagline', ''))}”</p>
    <p class="bio">{e(d.get('bio', ''))}</p>
    <div class="stats">{bar('FORÇA', st['power'], c)}{bar('AGILIDADE', st['speed'], c)}{bar('PODER', mg, c)}{bar('PESO', st['weight'], c)}</div>
    <div class="moves">
      <div><h4>MAGIA · meia barra</h4><b>{e(sp.get('name', 'Magia'))}</b><p>Lança {kind}. Dano {sp['damage'] * mg:.0f}.</p></div>
      <div><h4>SUPER · barra cheia</h4><b>{e(su.get('name', 'Super'))}</b><p>{SUPER.get(i, '')} Dano {sdmg * mg:.0f}.</p></div>
    </div>
    <div class="stage"><img src="stages/{d.get('stage', 'office')}.png" alt="" loading="lazy"><span>CENÁRIO</span></div>
  </div></article>'''
sections = ''.join(f'<h2 class="side">{t}</h2><p class="lead">{s}</p>' + ''.join(card(i) for i in ROSTER if F[i].get('side', 'heroi') == k) for k, t, s in SIDES)
rows = ''.join(f"<tr><td><a href='#{i}'>{e(F[i]['name'])}</a></td><td>{F[i]['stats']['power']:.2f}</td><td>{F[i]['stats']['speed']:.2f}</td><td>{F[i]['stats'].get('magic',1):.2f}</td><td>{F[i]['stats']['weight']:.2f}</td><td>{e(F[i]['role'])}</td></tr>" for i in ROSTER)
acts = ''.join(f'<div><h4>{t}</h4><p>{x}</p></div>' for t, x in STORY['acts'])
page = f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>V4 Fighters – Trouble Work · Manual</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Anton&family=Press+Start+2P&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{{--bg:#0a0d1c;--panel:#131a33;--line:#2a3763;--y:#ffd23f;--txt:#dfe6f5;--mut:#93a3c7}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--txt);font:16px/1.65 Inter,system-ui,sans-serif}}
.wrap{{max-width:1080px;margin:0 auto;padding:0 20px 80px}}
header.cover{{min-height:78vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:linear-gradient(rgba(6,8,22,.55),var(--bg)),url(stages/intro.png) center/cover;padding:60px 20px}}
.pix{{font-family:'Press Start 2P',monospace;font-size:11px;letter-spacing:2px;color:#cfe0ff}}
h1{{font-family:Anton,Impact,sans-serif;font-style:italic;font-weight:400;line-height:.9;margin:18px 0;font-size:clamp(64px,13vw,150px);background:linear-gradient(#fff3a0,#ffd23f 45%,#ff8a00);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(5px 6px 0 #6b1c00)}}
h1 small{{display:block;font-size:.42em;color:#fff;-webkit-text-fill-color:#fff;letter-spacing:6px}}
.cta{{display:inline-block;margin-top:26px;padding:14px 26px;background:var(--y);color:#222;font-family:'Press Start 2P';font-size:12px;text-decoration:none;box-shadow:0 5px 0 #a86b00}}
nav{{position:sticky;top:0;z-index:5;background:rgba(10,13,28,.94);border-bottom:2px solid var(--line);display:flex;gap:18px;justify-content:center;flex-wrap:wrap;padding:12px}}
nav a{{color:var(--mut);text-decoration:none;font-family:'Press Start 2P';font-size:9px}}nav a:hover{{color:var(--y)}}
h2{{font-family:Anton,Impact,sans-serif;font-weight:400;font-size:44px;letter-spacing:2px;color:var(--y);margin:70px 0 10px;text-shadow:3px 3px 0 #000}}
h2.side{{font-size:34px;margin-top:50px;border-left:8px solid var(--y);padding-left:14px}}
.lead{{color:var(--mut);margin-top:0}}
.story{{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}}
.story div,.box{{background:var(--panel);border:2px solid var(--line);padding:18px}}
.story h4,.box h4{{margin:0 0 8px;font-family:'Press Start 2P';font-size:10px;color:var(--y);line-height:1.6}}
.story p,.box p{{margin:0;font-size:15px}} .story b{{color:#fff}} .story i{{color:#ff6b81;font-style:normal}}
.grid2{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}}
table{{width:100%;border-collapse:collapse;font-size:14px}}th,td{{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left}}th{{font-family:'Press Start 2P';font-size:8px;color:var(--y)}}td a{{color:#fff}}
kbd{{display:inline-block;min-width:26px;text-align:center;padding:2px 7px;border:2px solid #fff;border-bottom-width:4px;border-radius:5px;font:600 13px Inter;margin:0 2px;background:#1b2447}}
.fighter{{display:grid;grid-template-columns:300px 1fr;gap:22px;background:var(--panel);border:2px solid var(--line);border-left:8px solid var(--c);margin:18px 0;padding:18px;scroll-margin-top:60px}}
.art{{display:flex;align-items:flex-end;justify-content:center;background:radial-gradient(circle at 50% 60%,color-mix(in srgb,var(--c) 35%,transparent),transparent 70%)}}.art img{{max-width:100%;max-height:340px}}
.head{{display:flex;gap:12px;align-items:center}}.av{{width:64px;height:64px;object-fit:cover}}
h3{{margin:0;font-family:Anton,Impact,sans-serif;font-weight:400;font-style:italic;font-size:40px;line-height:1;color:var(--c);text-shadow:2px 2px 0 #000}}
.role{{margin:4px 0 0;font-family:'Press Start 2P';font-size:9px;color:var(--mut)}}.tag{{margin:12px 0 4px;color:#fff;font-style:italic}}.bio{{margin:0 0 12px;color:var(--mut)}}
.stat{{display:grid;grid-template-columns:96px 1fr 40px;gap:10px;align-items:center;margin:5px 0}}.stat span{{font-family:'Press Start 2P';font-size:8px}}.stat div{{height:10px;background:#070a18;border:2px solid #fff}}.stat i{{display:block;height:100%}}.stat b{{font-size:12px;color:var(--mut);font-weight:400}}
.moves{{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}}.moves>div{{background:#0c1128;border:1px solid var(--line);padding:12px}}
.moves h4{{margin:0 0 6px;font-family:'Press Start 2P';font-size:8px;color:var(--mut)}}.moves b{{color:var(--c);font-family:Anton;font-weight:400;font-size:20px;letter-spacing:1px}}.moves p{{margin:4px 0 0;font-size:14px}}
.stage{{position:relative;margin-top:12px;height:90px;overflow:hidden;border:1px solid var(--line)}}.stage img{{width:100%;height:100%;object-fit:cover}}.stage span{{position:absolute;left:8px;bottom:6px;font-family:'Press Start 2P';font-size:8px;text-shadow:2px 2px 0 #000}}
footer{{text-align:center;color:var(--mut);font-size:13px;margin-top:70px}}
@media(max-width:760px){{.fighter{{grid-template-columns:1fr}}.moves{{grid-template-columns:1fr}}.art img{{max-height:240px}}h2{{font-size:34px}}}}
@media print{{nav,.cta{{display:none}}body{{background:#fff;color:#111}}.fighter,.box,.story div{{break-inside:avoid}}}}
</style></head><body>
<header class="cover"><div class="pix">MANUAL DO JOGADOR · 199X</div><h1>V4 FIGHTERS<small>TROUBLE WORK</small></h1>
<p class="pix">{len(ROSTER)} LUTADORES · CAMPANHA · ARENA ONLINE · CAMPEONATO</p><a class="cta" href="./">JOGAR AGORA</a></header>
<nav><a href="#enredo">ENREDO</a><a href="#controles">CONTROLES</a><a href="#sistema">SISTEMA</a><a href="#lutadores">LUTADORES</a><a href="#tabela">ATRIBUTOS</a><a href="#modos">MODOS</a></nav>
<div class="wrap">
<h2 id="enredo">O ENREDO</h2><p class="lead">O deadline é hoje. O nocaute também.</p>
<div class="story">{acts}</div>

<h2 id="controles">CONTROLES</h2>
<div class="grid2"><div class="box"><h4>MOVIMENTO</h4><p><kbd>A</kbd><kbd>D</kbd> andar · <kbd>W</kbd> pular (de novo no ar = pulo duplo) · <kbd>S</kbd> agachar. As setas também funcionam.</p></div>
<div class="box"><h4>GOLPES</h4><p><kbd>G</kbd> soco · <kbd>H</kbd> chute · <kbd>J</kbd> golpe forte · <kbd>V</kbd> defesa · <kbd>B</kbd> especial</p></div>
<div class="box"><h4>VARIAÇÕES</h4><p>Segurando <kbd>S</kbd>, os três golpes viram rasteiros. No ar, viram aéreos. Um golpe aéreo por pulo.</p></div>
<div class="box"><h4>MENUS E CELULAR</h4><p><kbd>Enter</kbd> ou <kbd>G</kbd> confirma · <kbd>V</kbd> volta · <kbd>Esc</kbd> pausa. No celular, o joystick e os botões do gabinete funcionam no toque.</p></div></div>

<h2 id="sistema">SISTEMA DE LUTA</h2>
<div class="grid2">
<div class="box"><h4>BARRA DE ESPECIAL EM 2 NÍVEIS</h4><p>Enche soltando golpes (pouco), acertando (bastante) e apanhando. Na metade, <kbd>B</kbd> solta a <b>MAGIA</b>. Cheia, <kbd>B</kbd> solta o <b>SUPER</b> exclusivo do lutador. A barra não zera entre rounds.</p></div>
<div class="box"><h4>DEFESA ALTA E BAIXA</h4><p>Defesa em pé não segura golpe rasteiro. Defesa agachada não segura golpe aéreo. Golpe defendido causa 25% do dano. Agarrão ignora defesa.</p></div>
<div class="box"><h4>ATRIBUTOS</h4><p><b>Força</b> multiplica golpes comuns. <b>Poder</b> multiplica tudo que gasta barra. <b>Agilidade</b> é a velocidade de andar. <b>Peso</b> reduz o quanto você é empurrado.</p></div>
<div class="box"><h4>ROUNDS</h4><p>Melhor de 3, 60 segundos por round. No tempo esgotado vence quem tiver mais vida. Vencer sem levar dano no round final rende PERFECT.</p></div></div>

<h2 id="lutadores">OS LUTADORES</h2>{sections}

<h2 id="tabela">TABELA DE ATRIBUTOS</h2><p class="lead">1,00 é a média. A régua do jogo vai de 0,70 a 1,35.</p>
<div class="box" style="overflow:auto"><table><tr><th>LUTADOR</th><th>FORÇA</th><th>AGILIDADE</th><th>PODER</th><th>PESO</th><th>PAPEL</th></tr>{rows}</table></div>

<h2 id="modos">MODOS DE JOGO</h2>
<div class="grid2">
<div class="box"><h4>ARCADE</h4><p>Sete lutas: quatro rivais do elenco, depois <b>Xablau</b> (o capanga), <b>Dias</b> (o subchefe) e <b>Mundim</b> (o chefão). Antes de cada luta os dois conversam em tela dividida (36 encontros têm diálogo próprio). Cada luta acontece no cenário e com a música do adversário. A CPU fica mais esperta a cada luta.</p></div>
<div class="box"><h4>ARENA ONLINE</h4><p><b>1.</b> Abra o link de convite (ou START, Arena Online). <b>2.</b> Escolha o lutador e digite um apelido. <b>3.</b> Aperte <b>JOGAR AGORA</b>: quando outra pessoa apertar também, a luta começa sozinha. Dá pra desafiar alguém da lista, assistir às lutas ao vivo e trocar de lutador sem sair. Até 15 pessoas. Vitória vale 3 pontos no ranking, derrota vale 1.</p></div>
<div class="box"><h4>CAMPEONATO</h4><p>Alguém cria e vira organizador. Cada pessoa se inscreve com um lutador, e <b>cada lutador só pode ter um dono</b>. O sorteio monta a chave eliminatória. Uma luta por vez: quando chegar a sua, aparece “É SUA VEZ”. O resto assiste.</p></div>
<div class="box"><h4>DICAS PRO EVENTO</h4><p>O organizador precisa manter o saguão aberto, porque é ele quem chama a próxima luta. Se alguém sumir, ele pode dar W.O. Projete a tela de um espectador no telão.</p></div></div>
<footer>V4 Fighters – Trouble Work · manual gerado a partir dos dados do jogo · <a href="./" style="color:var(--y)">jogar</a></footer>
</div></body></html>'''
open('public/manual.html', 'w').write(page); print('manual.html', len(page) // 1024, 'KB,', len(ROSTER), 'lutadores')
