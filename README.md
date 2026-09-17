# Office Fighter

Jogo de luta 2D estilo arcade anos 90, no navegador. Vite + TypeScript + Canvas 2D, sem engine.
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

- `sheet.png` + `frames.json` — gerados por `tools/sprites.py` a partir do board 5×7 em `Personagens/Mais-movimentos/`
  (`npm run sprites` regenera os dois). O script acha cada sprite pelo alpha, então a grade não precisa ser exata.
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

## Áudio

- Música e efeitos são sintetizados no navegador (Web Audio): `src/core/audio.ts` tem o sequenciador chiptune e os efeitos;
  as músicas (título, seleção, luta) estão em `src/data/songs.ts` como padrões de semicolcheias.
- Vozes ficam em `public/audio/voice/*.wav`, geradas por `python3 tools/voices.py` com a síntese de fala do macOS:
  locutor (Round 1/2/3, Fight!, K.O., Perfect, nomes), Edgard (voz média, risadas malignas) e Santana (gritos graves com raiva).
  Pra trocar por gravações reais, basta substituir os arquivos mantendo os ids do `manifest.json`.
- Botão 🔊 no gabinete silencia tudo (fica salvo no navegador). O som só começa depois do primeiro toque/tecla.

Luta é melhor de 3 (dois rounds). A tela de seleção mostra o mapa do Brasil com a origem de cada lutador (`origin` no `fighter.json`).

Cenário: `public/stages/office-{far,mid,floor}.png` (placeholder gerado por `tools/stage.py`, substitua pela arte final).

Pra adicionar um lutador: rode o script no board novo, crie `fighter.json` (copie de um existente) e inclua o id em `src/data/roster.ts`.
A campanha é "todos os outros lutadores + luta espelho final".
