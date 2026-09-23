# V4 Fighters – The Tournament

Jogo de luta 2D estilo arcade anos 90, no navegador (antes "Office Fighter"). Vite + TypeScript + Canvas 2D, sem engine.
Spec completa em `HANDOFF-office-fighter_1.md`.

## Rodar

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # gera dist/ (estático, serve em qualquer host)
```

## Controles

| Ação | Teclado | Gabinete (toque/mouse) |
|------|---------|------------------------|
| Andar / pular / agachar | A D W S (ou setas) | joystick |
| Defender | V (ou Z) | botão V |
| Soco / Chute / Golpe forte | G / H / J | botões G H J |
| Especial (barra cheia) | B | botão B |
| Confirmar / Start | Enter, Espaço ou G | START |
| Pausa | Esc ou P | PAUSE |

Debug (só teclado): **F1** hitboxes/hurtboxes/estado · **F2** câmera lenta · **F3** treino (barra e vida infinitas).
No console, `__of().fight('edgard', 'landim')` abre uma luta avulsa (cenário do segundo; terceiro argumento `null` = sem CPU). Não conta pro ranking.

## Assets

Cada lutador vive em `public/fighters/<id>/`:

- `sheet.png` + `frames.json` — atlas gerado por `tools/sprites.py` a partir do board de poses (`npm run sprites` regera todos;
  a lista de boards e opções fica em `tools/sprites-all.sh`). Cada pose é isolada pixel a pixel e copiada pra um atlas novo com folga,
  então nenhum frame carrega pedaço da pose vizinha. Pose que ocupa duas células do board (braço ou língua esticados) é declarada com
  `--wide linha,coluna` e sai inteira; a célula seguinte vira frame vazio. Sempre confira o contact sheet (`--debug`).
- `fighter.json` — nome, cores, escala, stats, animações (índices dos 20 frames) e frame data dos golpes.
  Balanceamento é aqui, nunca no código. Hitboxes em unidades do sprite, origem nos pés, X pra frente, Y negativo pra cima.
- `portrait.png` — thumb da seleção.
- `special_fx.png` — projétil, recortado do frame de disparo pelo `--fx` do script (o do Edgard veio do board antigo).

Board de cada lutador: 5 colunas × 7 linhas (35 poses), fundo transparente, todos olhando pra direita.
Índice do frame = linha × 5 + coluna.

| Linha | Conteúdo (esq → dir) | Usado em |
|-------|----------------------|----------|
| 1 | guarda ×2, caminhada ×3 | idle, walk |
| 2 | salto ×2, agachar, defesa em pé, defesa agachada (ordem pode variar por lutador; ver `anims`) | jump, crouch, block |
| 3 | soco, soco forte, chute, chute alto, golpe forte | punch, kick, heavy |
| 4 | especial (carga, disparo), dano, queda, nocaute | special (projétil), hit, fall, down |
| 5 | golpes no ar: neutro, soco aéreo, neutro 2, voadora, forte aéreo | airPunch, airKick, airHeavy |
| 6 | golpes rasteiros: soco baixo, guarda baixa, rasteira ×2, forte baixo | lowPunch, lowKick, lowHeavy |
| 7 | super: 2 frames do lutador, 2 frames de efeito (portal / explosão), recuperação | super (zona com hitbox própria) |
| 8 | golpe longo: preparo → efeito no alcance máximo → volta (frames 35–39) | long |
| 9 | pose de vitória em 5 quadros (frames 40–44) | win |

As linhas 8 e 9 vêm num board à parte, `<id>-golpelongo-vitoria.png` (2 linhas × 5 poses), que o `sprites.py` anexa ao mesmo atlas
com `--extra`. Esse board chega com **fundo branco** e em outra escala, então:

- `tools/whiteboard.py` tira o fundo sem comer o branco do desenho (dentes, mecha prateada, núcleo do brilho, vapor): cada bolsão
  branco preso no desenho é julgado pelo que tem em volta, o efeito de magia (`--white-fx matiz`) vira translúcido e o que a regra
  errar se corrige por ponto/retângulo (`--white-keep`, `--white-drop`, `--white-fx-keep`, `--white-fx-drop`, `--white-erase`).
  Rode sozinho com `--debug mapa.png --list 25` pra ver o que saiu (magenta) e o que ficou (verde).
- `--extra-scale` iguala o tamanho ao board principal. Meça pela cabeça (casamento de padrão em várias escalas), não pela altura
  da pose: Edgard 0,71 · Santana 0,92 · Laura 0,75.
- No extra, o eixo e a linha dos pés são medidos no **corpo** (o feixe lá na frente não puxa o lutador pra trás; o portal debaixo
  dele conta como chão). Sempre confira `<debug>-extra-contact.png`.

Comandos: no chão A/S/D dão soco/chute/forte; segurando ↓ viram os rasteiros (só defende agachado);
no ar viram os aéreos (só defende em pé). B com meia barra (50) = especial com projétil; B com barra cheia = super.
Frente + forte = **golpe longo** (`moves.long`, só pra quem tem): sai devagar, alcança o dobro, empurra e é punível no vazio.
Ele usa `hitboxes` (uma caixa por frame ativo, acompanhando o desenho). A vitória (`anims.win`) aceita `loopFrom`: toca a
sequência uma vez e repete do índice dado (a Laura senta, medita e fica nos dois últimos quadros).

Lutadores cujo board principal chega com **fundo branco** (CRM War Machine, Leo) usam o mesmo `sprites.py`: ele percebe a falta
de transparência e recorta com o `whiteboard.py`. `--crop nome.png:x0,y0,x1,y1[:erase][:rot=graus]` tira um pedaço do board como
projétil (míssil, drone), `--white-erase` apaga o que não vira frame (por retângulo ou pelo desenho ligado a um ponto) e
`--axis-ignore-smoke` mede o eixo no corpo, ignorando a poeira (o tanque levanta poeira só de um lado).

**Raio contínuo** (`moves.<golpe>.beam`, o olho biônico do Leo): sai do lutador, cresce até o alcance ou até encostar no
adversário e termina num estouro. É montado com três peças que o `tools/pieces.py` tira da folha `extensao-raio-leo.png`:
início (cortado onde o cone tem a altura do trecho do meio, sumindo aos poucos na emenda), trecho do meio que se repete
(`:tile`, pontas 100% opacas) e estouro final. As pontas cortadas retas da arte precisam de `--wall`, senão o miolo branco
do raio vai embora com o fundo.

**Juiz**: `public/referee/` (robô das bandeiras, `juiz-sprite.png`, 4×5 poses). `src/game/referee.ts` só lê o estado da luta:
anda pra ficar no meio dos dois, levanta as duas bandeiras no "FIGHT!" e a do lado de quem venceu no fim do round.

## Balanceamento (ficha de RPG)

`tools/balance.py` é a fonte da verdade: atributos (FORÇA, AGILIDADE, PODER, PESO), ritmo dos golpes comuns por perfil
(rápido, normal, firme, lento, máquina), dano das magias, alcance corrigido e o combo encadeado do Dias. `npm run balance:apply`
grava nos `fighter.json`. `npm run balance` roda um torneio de CPU contra CPU, todos contra todos (5 s), e mostra a taxa de
vitória de cada um, os piores confrontos e, com `--dano`, de onde vem o dano. `python3 tools/balance.py --tune` é o calibrador:
repete o torneio e corrige o dano dos golpes comuns de cada lutador (`tools/balance-tune.json`, de 0,75 a 1,30) até todos
ficarem perto do alvo. As barras que o jogador vê não mudam; o ajuste compensa alcance e tamanho do sprite, que funcionam
como atributo escondido. Regras do motor que entram na conta: o PESO amortece dano (1,5 leva ~13% menos), acertos seguidos
num combo valem menos a partir do 3º (piso de 60%) e o HUD conta os hits.

## História e diálogos

`src/data/story.json` é a bíblia narrativa, em volta do torneio da Mundim Corp: as facções, os atos do enredo (usados no manual), o texto da abertura,
as falas genéricas e o final de cada lutador, e os roteiros par a par (`pairs`, chave com os dois ids em ordem alfabética).
Par sem roteiro próprio usa as falas genéricas; luta espelho usa `mirror`. A cidade real de cada um fica em `origin` no `fighter.json` (lon/lat no mapa do Brasil).

## Celular como aplicativo

`public/manifest.webmanifest` + `public/sw.js` + `src/core/mobile.ts`: instalável na tela de início (abre sem barra do navegador), tela cheia automática
no primeiro toque no Android, botões INSTALAR APP e TELA CHEIA no letreiro, dica de instalação no iPhone, tela sempre acesa e sem rolagem elástica nem zoom.

## Lutador secreto

Dener (`SECRET` em `src/data/roster.ts`) é carregado sempre, mas só aparece como slot escuro na seleção. Destrava de dois jeitos: digitando
↑ ↑ ↓ ↓ ← → ← → B J na tela de seleção, ou vencendo a luta secreta do 53º andar (aparece pra quem zera o arcade sem perder nenhuma luta).
O desbloqueio fica salvo no navegador (`v4f-unlocked`). Ele usa `meterRegen` (barra que se recarrega sozinha) e um agarrão com `air`/`ticks` (combo aéreo).

## Manual

`public/manual.html` (link MANUAL no gabinete) é gerado por `npm run manual` a partir dos `fighter.json`. Rode de novo ao mudar lutadores, atributos ou golpes.

## Arena online

`src/net/`: saguão com presença, desafios 1×1, lutas ao vivo pra assistir e placar da sessão, sobre Supabase Realtime
(broadcast + presença). Sem `VITE_SUPABASE_ANON_KEY` (veja `.env.example`) cai no modo local, que só liga abas do mesmo navegador.

- `transport.ts`: salas `v4f:<nome>` (lobby, `match-<id>`, `watch-<id>`); mensagens enviadas antes da inscrição esperam numa fila.
- `invites.ts`: protocolo de desafio sem DOM (challenge/accept/decline/cancel/gone). Prazo de 30 s nos dois lados, aceite
  reenviado até a luta conectar, aceite atrasado ainda vale se quem convidou está livre, desafio cruzado vira uma luta só.
- `netplay.ts`: lockstep. Só os botões de cada frame trafegam (em trechos RLE, com confirmação e reenvio do que se perdeu);
  o atraso de entrada se ajusta pelo ping (4 a 15 frames) e a cada segundo os dois comparam um hash da luta. O jogador 1
  manda a transmissão numa sala separada, e o espectador pede de novo o trecho que faltar.
- `lobby.ts`: a tela da sala; os botões usam `data-act`/`data-arg` com um clique delegado só (re-render não perde clique).
- Com a aba escondida no meio de uma luta online, um Worker segue o relógio (`core/loop.ts`) pra não travar o outro lado.

Ranking e campeonato usam as tabelas de `supabase/schema.sql` (rode no SQL Editor). O ranking da arena é por nome
(sem acento, maiúsculo, sem símbolos: "Graúda" e "GRAUDA" somam juntos), porque o id de quem entra muda a cada visita;
linhas antigas da mesma pessoa são somadas na leitura (`store.ts`, `rankKey`/`mergeRanking`). O campeonato é eliminatória simples com uma
luta por vez: o cliente do organizador chama a próxima luta da fila, os dois jogadores recebem "É SUA VEZ" e o resto assiste.

Testes da arena (rodam o jogo no Node):

```
npm run nettest -- invites   # protocolo de convite: aceitar, recusar, expirar, cruzado, aceite perdido…
npm run nettest -- ranking   # ranking por nome e pontuação repetida do arcade (sem banco)
npm run nettest -- sim       # rede falsa boa / ruim / 30% de perda: os dois lados e o espectador têm que bater frame a frame
npm run nettest -- real      # dois robôs lutando pelo Supabase de verdade
npm run nettest -- bot --name ROBO --challenge EDGARD   # robô que desafia (ou aceita) quem está no navegador
```

## Áudio

- Música e efeitos são sintetizados no navegador (Web Audio): `src/core/audio.ts` tem o sequenciador chiptune e os efeitos;
  as músicas (título, seleção, luta) estão em `src/data/songs.ts` como padrões de semicolcheias.
- Golpes têm som sintetizado estilo SF2 ("thwack" curto, baque grave nos fortes, "clang" na defesa). Os lutadores não falam.
- `public/audio/voice/` tem o locutor (Round 1/2/3, Fight!, K.O., Perfect, nomes), gerado por `python3 tools/voices.py` com a
  síntese de fala do macOS, e o som do especial de cada lutador, copiado de `Personagens/Mais-movimentos/especial-<id>.(mp3|wav)`
  pelo mesmo script (toca no especial e no super). O `manifest.json` lista os arquivos.
- Botão 🔊 no gabinete silencia tudo (fica salvo no navegador). O som só começa depois do primeiro toque/tecla.

Luta é melhor de 3 (dois rounds). A tela de seleção mostra o mapa do Brasil com a origem de cada lutador (`origin` no `fighter.json`).

Cenários: uma imagem 16:9 por lutador em `public/stages/<nome>.png` (960×540, chão em ~87% da altura), apontada pelo campo
`stage` do `fighter.json`. A luta acontece no cenário do oponente; a luta espelho, no seu. `alley` (Edgard), `factory` (Santana);
Kevin ainda usa o `office` placeholder (gerado por `tools/stage.py`).

Pra adicionar um lutador: rode o script no board novo, crie `fighter.json` (copie de um existente), coloque `portrait.png`, o cenário e o som do especial, e inclua o id em `src/data/roster.ts`.
Lutadores: Edgard (Curitiba), Santana (Rio de Janeiro), Kevin (Colombo, o atirador mercenário: meia barra = 1 tiro, barra cheia = rajada de 3)
e Laura (a lutadora: meia barra = onda verde, barra cheia = agarrão indefensável que avança, segura, levanta e arremessa; só escapa pulando).

Tipos de super (campo `kind` do golpe): `portal` (zona sob o alvo), `dive` (salto + explosão), `throw` (agarrão com fases dash/grab/hold/lift/throw)
e projétil comum (com `count`/`every` para rajadas e `sprite` para escolher a imagem).
A campanha é "todos os outros lutadores + luta espelho final".
