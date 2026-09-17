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

- `sheet.png` + `frames.json` — gerados por `tools/sprites.py` a partir do board 5×4 em `Personagens/`
  (`npm run sprites` regenera os dois). O script acha cada sprite pelo alpha, então a grade não precisa ser exata.
- `fighter.json` — nome, cores, escala, stats, animações (índices dos 20 frames) e frame data dos golpes.
  Balanceamento é aqui, nunca no código. Hitboxes em unidades do sprite, origem nos pés, X pra frente, Y negativo pra cima.
- `portrait.png` — thumb da seleção.
- `special_fx.png` — projétil, recortado do frame de especial pelo `--fx` do script.

Ordem dos 20 frames (linha a linha): guarda ×2, andar ×3 · agachar, pulo ×2, defesa em pé, defesa agachada ·
soco, guarda, chute, preparação do forte, forte · especial carga, especial disparo, dano, queda, nocaute.

Cenário: `public/stages/office-{far,mid,floor}.png` (placeholder gerado por `tools/stage.py`, substitua pela arte final).

Pra adicionar um lutador: rode o script no board novo, crie `fighter.json` (copie de um existente) e inclua o id em `src/data/roster.ts`.
A campanha é "todos os outros lutadores + luta espelho final".
