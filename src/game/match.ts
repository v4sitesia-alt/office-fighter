import type { StageAssets } from '../core/assets';
import { audio } from '../core/audio';
import type { Controller } from '../core/input';

/** Qualquer fonte de controles: teclado/toque (Input) ou botões vindos da rede. */
export interface Ports { ports: Controller[] }
import { Ai } from './ai';
import { ARENA_MAX, ARENA_MIN, GROUND_Y, H, ROUND_SECONDS, W } from './consts';
import { Fighter } from './fighter';
import { Fx } from './fx';
import { resolveHits, separate } from './hit';
import { Projectile } from './projectile';
import { drawStage } from './stage';
import type { Difficulty, FighterAssets } from './types';
import { Zone } from './zone';

export type MatchPhase = 'intro' | 'fight' | 'ko' | 'over';

export interface MatchOptions {
  cpu: Difficulty | null;   // null = 2 jogadores locais
  hueP2?: number;           // espelho: rotação de matiz do P2
  seed?: number;
  label?: string;           // "LUTA 1", "FINAL"...
  roundsToWin?: number;     // melhor de 3 = 2
}

export interface MatchEvents {
  message(text: string, frames: number, kind?: 'big' | 'small'): void;
  end(winner: 0 | 1 | -1, perfect: boolean): void;
}

const START_X: [number, number] = [300, 660];

export class Match {
  fighters: [Fighter, Fighter];
  ai: Ai | null = null;
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  fx = new Fx();
  hitstop = 0;
  phase: MatchPhase = 'intro';
  phaseFrame = 0;
  timer = ROUND_SECONDS * 60;
  round = 1;
  wins: [number, number] = [0, 0];
  roundWinner: 0 | 1 | -1 = -1;
  winner: 0 | 1 | -1 = -1;
  training = false;
  slowmo = 0;         // >0: roda 1 passo a cada N
  private slowAcc = 0;
  private endSent = false;
  private roundsToWin: number;

  constructor(public a: FighterAssets, public b: FighterAssets, public stage: StageAssets, public opts: MatchOptions, private ev: MatchEvents) {
    this.fighters = [new Fighter(a, START_X[0], 1, 0), new Fighter(b, START_X[1], -1, 1)];
    if (opts.hueP2) this.fighters[1].hue = opts.hueP2;
    if (opts.cpu) this.ai = new Ai(this.fighters[1], this.fighters[0], opts.cpu, opts.seed);
    this.roundsToWin = opts.roundsToWin ?? 2;
  }

  get midX() { return (this.fighters[0].x + this.fighters[1].x) / 2; }
  get seconds() { return Math.ceil(this.timer / 60); }

  /** Reposiciona tudo pro início de um round (a barra de especial fica). */
  startRound() {
    this.fighters.forEach((f, i) => {
      f.x = START_X[i]; f.y = 0; f.vx = 0; f.vy = 0; f.facing = i === 0 ? 1 : -1;
      f.life = 100; f.knockdownAir = false; f.flash = 0; f.spawns.length = 0;
      f.setState('idle');
    });
    this.projectiles = []; this.zones = [];
    this.timer = ROUND_SECONDS * 60;
    this.phase = 'intro'; this.phaseFrame = 0; this.slowmo = 0; this.hitstop = 0; this.roundWinner = -1;
  }

  update(input: Ports, paused: boolean) {
    if (paused) return;
    if (this.slowmo > 0 && ++this.slowAcc < this.slowmo) { this.fx.update(); return; }
    this.slowAcc = 0;
    this.phaseFrame++;
    const [p1, p2] = this.fighters;

    if (this.phase === 'intro') {
      if (this.phaseFrame === 1) { this.ev.message(`ROUND ${this.round}`, 70, 'big'); audio.voice(`ann-round-${Math.min(3, this.round)}`, 'ann'); }
      if (this.phaseFrame === 75) { this.ev.message('FIGHT!', 45, 'big'); audio.voice('ann-fight', 'ann'); }
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
        this.drainSpawns();
        this.projectiles.forEach((p) => p.update());
        this.projectiles = this.projectiles.filter((p) => !p.dead);
        this.zones.forEach((z) => z.update());
        this.zones = this.zones.filter((z) => !z.dead);
        const r = resolveHits(this.fighters, this.projectiles, this.zones, this.fx);
        if (r.hitstop) this.hitstop = r.hitstop;
        if (!this.training) {
          this.timer = Math.max(0, this.timer - 1);
          if (this.timer % 60 === 0 && this.seconds <= 10 && this.timer > 0) audio.sfx('tick');
        } else { p1.life = Math.max(p1.life, 50); p1.meter = 100; p2.life = Math.max(p2.life, 50); }
      }
      this.fx.update();

      const dead = this.fighters.findIndex((f) => f.life <= 0);
      if (dead >= 0) {
        this.roundWinner = dead === 0 ? 1 : 0;
        this.phase = 'ko'; this.phaseFrame = 0; this.slowmo = 3;
        this.ev.message('K.O.', 110, 'big');
        audio.sfx('ko'); audio.voice('ann-ko', 'ann');
      } else if (this.timer <= 0) {
        this.roundWinner = p1.life === p2.life ? -1 : p1.life > p2.life ? 0 : 1;
        this.phase = 'ko'; this.phaseFrame = 0;
        this.ev.message('TIME OVER', 90, 'big');
        audio.voice('ann-time', 'ann');
        for (const f of this.fighters) if (f.state !== 'ko') { f.setState('idle'); f.y = 0; }
      }
      return;
    }

    if (this.phase === 'ko') {
      p1.update(nullCtrl, p2, false); p2.update(nullCtrl, p1, false);
      this.drainSpawns();
      this.projectiles.forEach((p) => p.update());
      this.projectiles = this.projectiles.filter((p) => !p.dead);
      this.zones.forEach((z) => z.update());
      this.zones = this.zones.filter((z) => !z.dead);
      this.fx.update();
      if (this.phaseFrame > 30) this.slowmo = 0;
      if (this.phaseFrame > 70) {
        this.phase = 'over'; this.phaseFrame = 0;
        if (this.roundWinner >= 0) {
          const rw = this.roundWinner as 0 | 1;
          const w = this.fighters[rw];
          if (w.state !== 'ko') w.setState('win');
          this.wins[rw]++;
        } else {
          this.wins[0]++; this.wins[1]++; // empate: os dois levam o round
        }
      }
      return;
    }

    // over: pose de vitória, depois próximo round ou fim da luta
    p1.update(nullCtrl, p2, false); p2.update(nullCtrl, p1, false);
    this.fx.update();
    const matchOver = this.wins[0] >= this.roundsToWin || this.wins[1] >= this.roundsToWin;
    if (matchOver && this.phaseFrame === 40 && this.roundWinner >= 0 && this.fighters[this.roundWinner as 0 | 1].life >= 100) {
      this.ev.message('PERFECT', 60, 'big'); audio.voice('ann-perfect', 'ann');
    }
    if (this.phaseFrame > 130) {
      if (matchOver) {
        if (this.endSent) return;
        this.endSent = true;
        this.winner = this.wins[0] >= this.roundsToWin && this.wins[1] >= this.roundsToWin ? -1 : this.wins[0] >= this.roundsToWin ? 0 : 1;
        const perfect = this.winner >= 0 && this.fighters[this.winner as 0 | 1].life >= 100;
        this.ev.end(this.winner, perfect);
      } else {
        this.round++;
        this.startRound();
      }
    }
  }

  /** Cria projéteis/zonas pedidos pelos lutadores neste frame. */
  private drainSpawns() {
    for (const f of this.fighters) {
      for (const sp of f.spawns) {
        if (sp.kind === 'projectile') { this.projectiles.push(new Projectile(f, sp.move)); audio.sfx('projectile'); }
        else if (sp.kind === 'fx') { this.fx.hit(sp.x, sp.y ?? GROUND_Y - 80, f.def.colors.primary, true); audio.sfx('hitBig'); continue; }
        else { this.zones.push(new Zone(f, sp.move, sp.x)); audio.sfx(sp.move.kind === 'dive' ? 'explosion' : 'portal'); }
        if (sp.move.name) this.ev.message(sp.move.name, 45, 'small');
      }
      f.spawns.length = 0;
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
    const [f0, f1] = this.fighters;
    const throwing = (f: Fighter) => f.state === 'attacking' && f.move?.kind === 'throw' && (f.sub === 'hold' || f.sub === 'lift' || f.sub === 'throw');
    const order = throwing(f0) ? [1, 0] : throwing(f1) ? [0, 1]
      : f0.state === 'hitstun' || f0.state === 'knockdown' || (f0.state === 'attacking' && f0.sub === 'dive') ? [1, 0] : [0, 1];
    for (const i of order) this.fighters[i].draw(ctx, debug);
    this.projectiles.forEach((p) => p.draw(ctx, debug));
    this.zones.forEach((z) => z.draw(ctx, debug));
    this.fx.draw(ctx);
    if (debug) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.moveTo(ARENA_MIN, GROUND_Y - 300); ctx.lineTo(ARENA_MIN, GROUND_Y);
      ctx.moveTo(ARENA_MAX, GROUND_Y - 300); ctx.lineTo(ARENA_MAX, GROUND_Y); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`round ${this.round} ${this.wins.join('-')}  fase ${this.phase}  hitstop ${this.hitstop}  IA: ${this.ai?.debug ?? '-'}  proj ${this.projectiles.length} zonas ${this.zones.length}`, 8, H - 8);
    }
    ctx.restore();
  }
}

const nullCtrl: Controller = { held: () => false, pressed: () => false };
