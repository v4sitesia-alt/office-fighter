import type { StageAssets } from '../core/assets';
import { H, W } from './consts';

/** Fundo com parallax leve: a imagem é um pouco maior que a tela e desliza com o ponto médio dos lutadores. */
export function drawStage(ctx: CanvasRenderingContext2D, st: StageAssets, midX: number) {
  const t = (midX - W / 2) / (W / 2); // -1..1
  const over = 40;
  ctx.drawImage(st.img, -over / 2 - t * (over / 2), -over * H / W / 2, W + over, H + over * H / W);
}
