# V4 Fighters – Trouble Work

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

Comandos: no chão A/S/D dão soco/chute/forte; segurando ↓ viram os rasteiros (só defende agachado);
no ar viram os aéreos (só defende em pé). B com meia barra (50) = especial com projétil; B com barra cheia = super.

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
(broadcast + presença; ainda sem tabelas). A luta usa lockstep: só os botões de cada frame trafegam, com 10 frames de atraso
de entrada, e espectadores simulam a mesma luta. Sem `VITE_SUPABASE_ANON_KEY` (veja `.env.example`) cai no modo local, que só
liga abas do mesmo navegador.
Ranking e campeonato usam as tabelas de `supabase/schema.sql` (rode no SQL Editor). O campeonato é eliminatória simples com uma
luta por vez: o cliente do organizador chama a próxima luta da fila, os dois jogadores recebem "É SUA VEZ" e o resto assiste. Autoteste do sincronismo no console: `__of().netSelfTest()` (tem que devolver `equal: true`).

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
