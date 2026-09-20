// O lutador de verdade comemorando (animação de vitória tirada do atlas), desenhado num canvas de tela de menu.
import type { FighterAssets } from '../game/types';

export function drawWinPose(cv: HTMLCanvasElement, f: FighterAssets | null | undefined, clock: number, flip = false) {
  const g = cv.getContext('2d')!; g.clearRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
  if (!f) return;
  const a = f.def.anims.win, n = a.frames.length, idx = Math.floor(clock * (a.fps ?? 4) / 60);
  const i = a.loop ? idx % n : a.loopFrom !== undefined && idx >= n ? a.loopFrom + (idx - n) % (n - a.loopFrom) : idx % n;
  const fr = f.frames.frames[a.frames[i]], tall = Math.max(...a.frames.map((k) => f.frames.frames[k].ay));
  const k = Math.min(1.1 * cv.height / 230, (cv.height - 16) / tall, (cv.width - 6) / fr.sw) * Math.min(1.15, f.def.scale);
  g.save(); g.translate(cv.width / 2, cv.height - 6); if (flip) g.scale(-1, 1);
  g.drawImage(f.sheet, fr.sx, fr.sy, fr.sw, fr.sh, -(a.anchor === 'center' ? fr.cx : fr.ax) * k, -fr.ay * k, fr.sw * k, fr.sh * k); g.restore();
}
