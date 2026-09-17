import type { StageAssets } from '../core/assets';
import { GROUND_Y, H, W } from './consts';

/** Fundo em 3 camadas com parallax leve baseado no ponto médio dos lutadores. */
export function drawStage(ctx: CanvasRenderingContext2D, st: StageAssets, midX: number) {
  const t = (midX - W / 2) / (W / 2); // -1..1
  ctx.drawImage(st.far, -12 - t * 10, 0, W + 24, GROUND_Y + 8);
  ctx.drawImage(st.mid, -28 - t * 26, 0, W + 56, H);
  ctx.drawImage(st.floor, -30 - t * 30, GROUND_Y, W + 60, H - GROUND_Y);
}
