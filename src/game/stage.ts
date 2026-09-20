import type { StageAssets } from '../core/assets';
import { H, W } from './consts';

const RISE = 2.4;   // px por frame que o fundo desce (o elevador "sobe")

/** Fundo com parallax leve: a imagem é um pouco maior que a tela e desliza com o ponto médio dos lutadores.
 *  Cenário em camadas (elevador do Leo): o fundo desce em loop e a plataforma fica na frente, tremendo de leve. */
export function drawStage(ctx: CanvasRenderingContext2D, st: StageAssets, midX: number) {
  const t = (midX - W / 2) / (W / 2); // -1..1
  const over = 40, x = -over / 2 - t * (over / 2), w = W + over, h = H + over * H / W;
  if (st.scroll && st.front) {
    const now = performance.now() / (1000 / 60);
    const tile = w * st.scroll.height / st.scroll.width, off = (now * RISE) % tile;
    for (let y = off - tile; y < H; y += tile) ctx.drawImage(st.scroll, x * 0.5 - over / 4, Math.round(y), w, tile);
    const shake = Math.sin(now * 0.9) * 0.8;
    ctx.drawImage(st.front, x, -over * H / W / 2 + shake, w, h);
    return;
  }
  ctx.drawImage(st.img, x, -over * H / W / 2, w, h);
}
