import type { StageAssets } from '../core/assets';
import type { Controller, Input } from '../core/input';
import { Ai } from './ai';
import { ARENA_MAX, ARENA_MIN, GROUND_Y, H, ROUND_SECONDS, W } from './consts';
import { Fighter } from './fighter';
import { Fx } from './fx';
import { resolveHits, separate } from './hit';
import { Projectile } from './projectile';
import { drawStage } from './stage';
import type { Difficulty, FighterAssets } from './types';

export type MatchPhase = 'intro' | 'fight' | 'ko' | 'over';

export interface MatchOptions {
  cpu: Difficulty | null;   // null = 2 jogadores locais
  hueP2?: number;           // espelho: rotação de matiz do P2
  seed?: number;
  label?: string;           // "LUTA 1", "FINAL"...
}

export interface MatchEvents {
  message(text: string, frames: number, kind?: 'big' | 'small'): void;
  end(winner: 0 | 1 | -1, perfect: boolean): void;
}

export class Match {
  fighters: [Fighter, Fighter];
  ai: Ai | null = null;
  projectiles: Projectile[] = [];
  fx = new Fx();
  hitstop = 0;
  phase: MatchPhase = 'intro';
  phaseFrame = 0;
  timer = ROUND_SECONDS * 60;
  winner: 0 | 1 | -1 = -1;
  training = false;
  slowmo = 0;         // >0: roda 1 passo a cada N
  private slowAcc = 0;
  private endSent = false;

  constructor(public a: FighterAssets, public b: FighterAssets, public stage: StageAssets, public opts: MatchOptions, private ev: MatchEvents) {
    this.fighters = [new Fighter(a, 300, 1, 0), new Fighter(b, 660, -1, 1)];
    if (opts.hueP2) this.fighters[1].hue = opts.hueP2;
    if (opts.cpu) this.ai = new Ai(this.fighters[1], this.fighters[0], opts.cpu, opts.seed);
  }

  get midX() { return (this.fighters[0].x + this.fighters[1].x) / 2; }
  get seconds() { return Math.ceil(this.timer / 60); }

  update(input: Input, paused: boolean) {
    if (paused) return;
    if (this.slowmo > 0 && ++this.slowAcc < this.slowmo) { this.fx.update(); return; }
    this.slowAcc = 0;
    this.phaseFrame++;
    const [p1, p2] = this.fighters;

    if (this.phase === 'intro') {
      if (this.phaseFrame === 1) this.ev.message(this.opts.label ?? 'ROUND 1', 70, 'big');
      if (this.phaseFrame === 75) this.ev.message('LUTE!', 45, 'big');
      if (this.phaseFrame >= 100) { this.phase = 'fight'; this.phaseFrame = 0; }
      this.idleUpdate();
      return;
    }

    if (this.phase === 'fight') {
      const frozen = this.hitstop > 0;
      if (frozen) this.hitstop--;
      const c1: Controller = input.ports[0];
      let c2: Controller = input.ports[1];
      if (this.ai) { this.ai.update(this.projectiles, true); c2 = this.ai.ctrl; }
      p1.update(c1, p2, frozen);
      p2.update(c2, p1, frozen);
      separate(p1, p2);
      if (!frozen) {
        for (const f of this.fighters) {
          if (f.state === 'attacking' && f.move?.projectile && f.stateFrame === f.move.startup + 1) {
            this.projectiles.push(new Projectile(f, f.move, f.assets.fx));
            this.ev.message(f.move.name ?? 'ESPECIAL', 40, 'small');
          }
        }
        this.projectiles.forEach((p) => p.update());
        this.projectiles = this.projectiles.filter((p) => !p.dead);
        const r = resolveHits(this.fighters, this.projectiles, this.fx);
        if (r.hitstop) this.hitstop = r.hitstop;
        if (!this.training) this.timer = Math.max(0, this.timer - 1);
        else { p1.life = Math.max(p1.life, 50); p1.meter = 100; p2.life = Math.max(p2.life, 50); }
      }
      this.fx.update();

      const dead = this.fighters.findIndex((f) => f.life <= 0);
      if (dead >= 0) {
        this.winner = dead === 0 ? 1 : 0;
        this.phase = 'ko'; this.phaseFrame = 0; this.slowmo = 3;
        this.ev.message('K.O.', 110, 'big');
      } else if (this.timer <= 0) {
        this.winner = p1.life === p2.life ? -1 : p1.life > p2.life ? 0 : 1;
        this.phase = 'ko'; this.phaseFrame = 0;
        this.ev.message('TEMPO', 90, 'big');
        for (const f of this.fighters) if (f.state !== 'ko') f.setState('idle');
      }
      return;
    }

    if (this.phase === 'ko') {
      // deixa o nocauteado cair e os outros terminarem o golpe
      const frozen = false;
      p1.update(nullCtrl, p2, frozen); p2.update(nullCtrl, p1, frozen);
      this.projectiles.forEach((p) => p.update());
      this.projectiles = this.projectiles.filter((p) => !p.dead);
      this.fx.update();
      if (this.phaseFrame > 30) this.slowmo = 0;
      if (this.phaseFrame > 70) {
        this.phase = 'over'; this.phaseFrame = 0;
        if (this.winner >= 0) { const w = this.fighters[this.winner as 0 | 1]; if (w.state !== 'ko') w.setState('win'); }
      }
      return;
    }

    // over
    p1.update(nullCtrl, p2, false); p2.update(nullCtrl, p1, false);
    this.fx.update();
    if (this.phaseFrame > 130 && !this.endSent) {
      this.endSent = true;
      const perfect = this.winner >= 0 && this.fighters[this.winner as 0 | 1].life >= 100;
      this.ev.end(this.winner, perfect);
    }
  }

  /** Lutadores parados respirando (intro / telas de menu). */
  idleUpdate() {
    const [p1, p2] = this.fighters;
    p1.update(nullCtrl, p2, false); p2.update(nullCtrl, p1, false);
    this.fx.update();
  }

  render(ctx: CanvasRenderingContext2D, debug: boolean) {
    const [ox, oy] = this.fx.offset;
    ctx.save();
    ctx.translate(ox, oy);
    drawStage(ctx, this.stage, this.midX);
    // quem está apanhando fica por cima
    const order = this.fighters[0].state === 'hitstun' || this.fighters[0].state === 'knockdown' ? [1, 0] : [0, 1];
    for (const i of order) this.fighters[i].draw(ctx, debug);
    this.projectiles.forEach((p) => p.draw(ctx, debug));
    this.fx.draw(ctx);
    if (debug) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.moveTo(ARENA_MIN, GROUND_Y - 300); ctx.lineTo(ARENA_MIN, GROUND_Y);
      ctx.moveTo(ARENA_MAX, GROUND_Y - 300); ctx.lineTo(ARENA_MAX, GROUND_Y); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`fase ${this.phase}  hitstop ${this.hitstop}  IA: ${this.ai?.debug ?? '-'}  proj ${this.projectiles.length}`, 8, H - 8);
    }
    ctx.restore();
  }
}

const nullCtrl: Controller = { held: () => false, pressed: () => false };
