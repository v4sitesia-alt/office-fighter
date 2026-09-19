// Juiz: o robô das bandeiras. Acompanha a luta andando, fica sempre no meio dos dois e levanta a bandeira do lado de quem
// venceu o round (as duas no empate e no "FIGHT!"). É só enfeite: lê o estado da luta e nunca mexe nele, então não entra
// na sincronia da arena online.
import type { FramesFile } from './types';
import { GROUND_Y } from './consts';
import type { Match } from './match';

export interface RefereeAssets { sheet: HTMLImageElement; frames: FramesFile }

const SCALE = 0.6;          // o robô fica menor que os lutadores, como quem está mais ao fundo
const BACK = 22;            // px acima da linha do chão (profundidade)
const SPEED = 2.6, DEAD = 14;
const WALK = [1, 2, 3, 2], IDLE = [0, 0, 0, 4, 2];
// linha 2 do board = bandeira do lado ESQUERDO da tela, linha 3 = lado direito, linha 4 = as duas
const RAISE = { left: [6, 7, 8, 9], right: [11, 12, 13, 14], both: [16, 17, 18, 19] };

export class Referee {
  static assets: RefereeAssets | null = null;
  x = 480; private t = 0; private walking = false; private flag: keyof typeof RAISE | null = null; private flagT = 0;

  update(m: Match) {
    this.t++;
    const target = m.midX, dx = target - this.x;
    this.walking = Math.abs(dx) > (this.walking ? 3 : DEAD);
    if (this.walking) this.x += Math.sign(dx) * Math.min(SPEED, Math.abs(dx));
    let want: keyof typeof RAISE | null = null;
    if (m.phase === 'intro' && m.phaseFrame >= 70) want = 'both';                                   // "FIGHT!"
    else if (m.phase === 'over') want = m.roundWinner < 0 ? 'both' : m.fighters[m.roundWinner as 0 | 1].x < this.x ? 'left' : 'right';
    if (want !== this.flag) { this.flag = want; this.flagT = 0; } else this.flagT++;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const A = Referee.assets; if (!A) return;
    let i: number;
    if (this.flag) { const seq = RAISE[this.flag], k = Math.floor(this.flagT / 6); i = k < seq.length ? seq[k] : seq[2 + (Math.floor((this.flagT - seq.length * 6) / 9) % 2)]; }
    else if (this.walking) i = WALK[Math.floor(this.t / 7) % WALK.length];
    else i = IDLE[Math.floor(this.t / 40) % IDLE.length];
    const f = A.frames.frames[i], y = GROUND_Y - BACK;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(this.x, y + 3, 40, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(A.sheet, f.sx, f.sy, f.sw, f.sh, Math.round(this.x - f.ax * SCALE), Math.round(y - f.ay * SCALE), f.sw * SCALE, f.sh * SCALE);
  }
}
