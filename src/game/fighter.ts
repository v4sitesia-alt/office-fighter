import type { Box, FighterAssets, FrameDef, HitDef, MoveDef, MoveName, ThrowDef } from './types';
import type { Button, Controller } from '../core/input';
import { audio } from '../core/audio';
import {
  ARENA_MAX, ARENA_MIN, BACK_SPEED, GRAVITY, GROUND_Y, INPUT_BUFFER, JUMP_VX, JUMP_VY,
  SPRITE_SCALE, WALK_SPEED,
} from './consts';

export type State =
  | 'idle' | 'walking' | 'jumping' | 'crouching' | 'blocking'
  | 'attacking' | 'hitstun' | 'blockstun' | 'knockdown' | 'grabbed' | 'ko' | 'win';

export type Phase = 'startup' | 'active' | 'impact' | 'recovery';
type AttackBtn = 'punch' | 'kick' | 'heavy' | 'special';
type DiveSub = 'rise' | 'dive' | 'impact' | 'recover';
type ThrowSub = 'dash' | 'grab' | 'hold' | 'lift' | 'throw' | 'whiff';

const ATTACK_BUTTONS: AttackBtn[] = ['special', 'heavy', 'kick', 'punch']; // prioridade quando 2 apertados juntos
const DIVE_VY = -15.5;
const DIVE_FALL = 13;
const DIVE_FRAMES = 34;      // frames estimados até pousar (pra mirar o alvo)

/** Coisas que o lutador pede pro match criar (projétil, zona). */
export interface SpawnRequest { kind: 'projectile' | 'zone' | 'fx'; move: MoveDef; x: number; y?: number }

export class Fighter {
  x: number; y = 0;            // pés; y é deslocamento acima do chão (negativo = no ar)
  vx = 0; vy = 0;
  facing: 1 | -1;
  state: State = 'idle';
  stateFrame = 0;
  animTime = 0;
  life = 100; meter = 0;
  scale: number;

  move: MoveDef | null = null;
  moveName: MoveName | null = null;
  hasHit = false;
  air = false;                 // golpe aéreo em andamento
  lowAttack = false;           // golpe agachado (usa hurtbox baixa)
  sub: DiveSub | ThrowSub | null = null;  // sub-fase do mergulho / agarrão
  victim: Fighter | null = null;          // quem está sendo agarrado
  grabbedBy: Fighter | null = null;
  airAttackUsed = false;
  lag = 0;                     // frames travado ao pousar de um golpe aéreo
  stun = 0;
  knockdownAir = false;
  flash = 0;
  hue = 0;
  crouchBlock = false;
  spawns: SpawnRequest[] = [];
  lastHitBy: MoveName | null = null;
  comboHits = 0;
  private buffered: { btn: AttackBtn; frame: number } | null = null;
  private frameCounter = 0;
  private flashCanvas: HTMLCanvasElement | null = null;

  constructor(public assets: FighterAssets, x: number, facing: 1 | -1, public playerIndex: number) {
    this.x = x; this.facing = facing;
    this.scale = assets.def.scale * SPRITE_SCALE;
  }

  get def() { return this.assets.def; }
  get grounded() { return this.y >= 0; }
  get actionable() { return this.state === 'idle' || this.state === 'walking' || this.state === 'crouching' || this.state === 'blocking'; }
  get airborne() { return this.y < 0; }
  get phase(): Phase | null {
    const m = this.move;
    if (!m) return null;
    if (m.kind === 'dive') return this.sub === 'rise' ? 'startup' : this.sub === 'dive' ? 'active' : this.sub === 'impact' ? 'impact' : 'recovery';
    if (m.kind === 'throw') return this.sub === 'dash' ? 'startup' : this.sub === 'grab' ? 'active' : this.sub === 'whiff' ? 'recovery' : 'impact';
    const f = this.stateFrame;
    if (f < m.startup) return 'startup';
    if (f < m.startup + m.active) return 'active';
    return 'recovery';
  }
  get blocking() { return this.state === 'blocking' || this.state === 'blockstun'; }
  get crouched() {
    return this.state === 'crouching' || (this.blocking && this.crouchBlock) || (this.state === 'attacking' && this.lowAttack);
  }

  setState(s: State) {
    if (this.state === s) return;
    this.state = s; this.stateFrame = 0;
    if (s !== 'attacking') { this.move = null; this.moveName = null; this.hasHit = false; this.air = false; this.lowAttack = false; this.sub = null; this.victim = null; }
    if (s !== 'grabbed') this.grabbedBy = null;
  }

  faceTowards(other: Fighter) {
    if (this.actionable) this.facing = other.x >= this.x ? 1 : -1;
  }

  // ---------- update
  update(ctrl: Controller, other: Fighter, frozen: boolean) {
    this.frameCounter++;
    if (this.flash > 0) this.flash--;
    if (frozen) return;
    this.stateFrame++;
    this.animTime++;
    this.readBuffer(ctrl);

    switch (this.state) {
      case 'idle': case 'walking': case 'crouching': case 'blocking':
        this.faceTowards(other);
        this.handleNeutral(ctrl, other);
        break;
      case 'jumping':
        this.physicsAir();
        if (this.grounded) { this.land(); break; }
        if (this.buffered && !this.airAttackUsed) {
          const name = this.airMove(this.buffered.btn);
          if (name && this.startMove(name, other)) { this.buffered = null; this.airAttackUsed = true; }
        }
        break;
      case 'attacking':
        this.updateAttack(other);
        break;
      case 'hitstun': case 'blockstun':
        this.x += this.vx; this.vx *= 0.85;
        if (this.airborne || this.vy !== 0) { this.physicsAir(); if (this.grounded) { this.y = 0; this.vy = 0; } }
        if (--this.stun <= 0 && this.grounded) this.setState(this.state === 'blockstun' && ctrl.held('block') ? 'blocking' : 'idle');
        break;
      case 'knockdown':
        if (this.knockdownAir) {
          this.x += this.vx; this.physicsAir();
          if (this.grounded) { this.y = 0; this.vy = 0; this.vx = 0; this.knockdownAir = false; this.stateFrame = 0; }
        } else if (this.stateFrame > 40) {
          this.setState('idle');
        }
        break;
      case 'grabbed':
        break; // posição vem de quem agarrou
      case 'ko':
        if (this.knockdownAir) {
          this.x += this.vx; this.physicsAir();
          if (this.grounded) { this.y = 0; this.vy = 0; this.vx = 0; this.knockdownAir = false; }
        }
        break;
      case 'win':
        break;
    }
    this.x = Math.max(ARENA_MIN, Math.min(ARENA_MAX, this.x));
  }

  private physicsAir() {
    this.vy += GRAVITY;
    this.y += this.vy;
    this.x += this.vx;
  }

  private land() {
    this.y = 0; this.vy = 0; this.vx = 0; this.airAttackUsed = false;
    this.setState('idle');
    audio.sfx('land');
  }

  get voiceChannel() { return this.playerIndex === 0 ? 'p1' as const : 'p2' as const; }

  private updateAttack(other: Fighter) {
    const m = this.move!;
    const total = m.startup + m.active + m.recovery;

    if (m.kind === 'dive') {
      if (this.sub === 'rise' || this.sub === 'dive') {
        this.physicsAir();
        if (this.sub === 'rise' && this.vy >= 0) { this.sub = 'dive'; this.vy = DIVE_FALL; }
        if (this.grounded) {
          this.y = 0; this.vy = 0; this.vx = 0; this.sub = 'impact'; this.stateFrame = 0; this.hasHit = true;
          this.spawns.push({ kind: 'zone', move: m, x: this.x });
        }
      } else if (this.sub === 'impact') {
        if (this.stateFrame >= (m.impact ?? 10)) { this.sub = 'recover'; this.stateFrame = 0; }
      } else if (this.stateFrame >= m.recovery) {
        this.setState('idle');
      }
      return;
    }

    if (m.kind === 'throw') {
      const T = m.throw!;
      switch (this.sub) {
        case 'dash': this.x += T.speed * this.facing; if (this.stateFrame >= T.dash) { this.sub = 'grab'; this.stateFrame = 0; } break;
        case 'grab': this.x += T.speed * 0.4 * this.facing; if (this.stateFrame >= T.grab) { this.sub = 'whiff'; this.stateFrame = 0; } break;
        case 'hold': this.placeVictim(T.holdOffset); if (this.stateFrame >= T.hold) { this.sub = 'lift'; this.stateFrame = 0; } break;
        case 'lift': this.placeVictim(T.liftOffset); if (this.stateFrame >= T.lift) { this.sub = 'throw'; this.stateFrame = 0; this.release(T); } break;
        case 'throw': if (this.stateFrame >= T.throw) this.setState('idle'); break;
        default: if (this.stateFrame >= T.whiff) this.setState('idle');
      }
      return;
    }

    if (this.air) {
      this.physicsAir();
      if (this.grounded) { this.lag = m.landingLag ?? 4; this.land(); return; }
      if (this.stateFrame >= total) this.setState('jumping'); // acabou no ar: continua caindo
      return;
    }

    // chão
    this.vx *= 0.8; this.x += this.vx;
    if (m.dash && this.phase !== 'recovery') this.x += m.dash * this.facing;
    if (m.kind === 'portal' && this.stateFrame === m.startup) this.spawns.push({ kind: 'zone', move: m, x: other.x });
    if (m.projectile) {
      const count = m.projectile.count ?? 1, every = m.projectile.every ?? 0;
      for (let k = 0; k < count; k++) if (this.stateFrame === m.startup + 1 + k * every) this.spawns.push({ kind: 'projectile', move: m, x: this.x });
    }
    if (this.stateFrame >= total) this.setState('idle');
  }

  /** Agarrou: a vítima fica presa até o arremesso. */
  grab(v: Fighter) {
    this.sub = 'hold'; this.stateFrame = 0; this.hasHit = true; this.victim = v;
    v.setState('grabbed'); v.grabbedBy = this; v.vx = 0; v.vy = 0; v.y = 0;
    audio.sfx('hit');
  }
  private placeVictim(off: { x: number; y: number }) {
    const v = this.victim; if (!v) return;
    v.x = Math.max(ARENA_MIN, Math.min(ARENA_MAX, this.x + this.facing * off.x * this.scale));
    v.y = off.y * this.scale; v.facing = this.facing === 1 ? -1 : 1;
  }
  private release(T: ThrowDef) {
    const v = this.victim; if (!v) return;
    v.setState('idle'); v.grabbedBy = null; this.victim = null;
    v.takeHit({ damage: T.release.damage, hitstun: 30, blockstun: 0, knockback: T.release.knockback, launch: T.release.launch, knockdown: true, hitstop: T.release.hitstop }, this, false, this.x);
    this.spawns.push({ kind: 'fx', move: this.move!, x: v.x, y: GROUND_Y + v.y - 60 * this.scale });
  }

  private readBuffer(ctrl: Controller) {
    for (const b of ATTACK_BUTTONS) {
      if (ctrl.pressed(b as Button)) { this.buffered = { btn: b, frame: this.frameCounter }; break; }
    }
    if (this.buffered && this.frameCounter - this.buffered.frame > INPUT_BUFFER) this.buffered = null;
  }

  /** Golpe que o botão vira no chão (ou agachado). */
  private groundMove(btn: AttackBtn, crouched: boolean): MoveName | null {
    const M = this.def.moves;
    if (btn === 'special') {
      if (M.super && this.meter >= (M.super.meterCost ?? 100)) return 'super';
      if (M.special && this.meter >= (M.special.meterCost ?? 50)) return 'special';
      return null;
    }
    if (crouched) {
      const low: Record<string, MoveName> = { punch: 'lowPunch', kick: 'lowKick', heavy: 'lowHeavy' };
      return M[low[btn]] ? low[btn] : btn;
    }
    return btn;
  }
  private airMove(btn: AttackBtn): MoveName | null {
    const air: Record<string, MoveName> = { punch: 'airPunch', kick: 'airKick', heavy: 'airHeavy' };
    const n = air[btn];
    return n && this.def.moves[n] ? n : null;
  }

  private handleNeutral(ctrl: Controller, other: Fighter) {
    if (this.lag > 0) { this.lag--; this.setState('idle'); return; }
    const down = ctrl.held('down');
    if (this.buffered) {
      const name = this.groundMove(this.buffered.btn, down);
      if (name && this.startMove(name, other)) { this.buffered = null; return; }
      if (this.buffered.btn === 'special') this.buffered = null; // sem barra: descarta
    }
    const fwd: Button = this.facing === 1 ? 'right' : 'left';
    const back: Button = this.facing === 1 ? 'left' : 'right';
    if (ctrl.held('block')) {
      this.crouchBlock = down;
      this.setState('blocking'); this.vx = 0; return;
    }
    if (down) { this.setState('crouching'); this.vx = 0; return; }
    if (ctrl.held('up')) {
      this.vy = JUMP_VY;
      this.vx = ctrl.held(fwd) ? JUMP_VX * this.facing : ctrl.held(back) ? -JUMP_VX * this.facing : 0;
      this.y = -0.01; this.airAttackUsed = false;
      this.setState('jumping'); audio.sfx('jump'); return;
    }
    const sp = this.def.stats.speed;
    if (ctrl.held(fwd)) { this.x += WALK_SPEED * sp * this.facing; this.setState('walking'); this.vx = 1; }
    else if (ctrl.held(back)) { this.x -= BACK_SPEED * sp * this.facing; this.setState('walking'); this.vx = -1; }
    else { this.setState('idle'); this.vx = 0; }
  }

  startMove(name: MoveName, other: Fighter): boolean {
    const m = this.def.moves[name];
    if (!m) return false;
    if (m.meterCost && this.meter < m.meterCost) return false;
    if (m.meterCost) this.meter -= m.meterCost;
    const wasAir = this.state === 'jumping';
    const crouched = this.state === 'crouching' || (this.state === 'blocking' && this.crouchBlock);
    this.setState('attacking');
    this.move = m; this.moveName = name; this.hasHit = false;
    this.air = wasAir || m.kind === 'air';
    this.lowAttack = m.kind === 'low' || (crouched && !wasAir);
    if (!wasAir) this.vx = 0;
    if (m.kind === 'throw') { this.sub = 'dash'; this.vx = 0; }
    if (m.kind === 'dive') {
      this.sub = 'rise';
      this.vy = DIVE_VY; this.y = -0.01;
      const dx = other.x - this.x;
      this.vx = Math.max(-14, Math.min(14, dx / DIVE_FRAMES));
      this.facing = dx >= 0 ? 1 : -1;
    }
    // som do golpe: especial/super tocam o áudio enviado pro lutador; o resto só o whoosh
    if (name === 'super' || name === 'special') audio.voice(`${this.def.id}-special`, this.voiceChannel);
    else audio.sfx('swing');
    return true;
  }

  // ---------- dano
  takeHit(h: HitDef, attacker: Fighter, blocked: boolean, fromX: number) {
    const dir: 1 | -1 = fromX < this.x ? 1 : -1;  // empurrado pra longe de quem bateu
    const power = attacker.def.stats.power;
    const dmg = blocked ? h.damage * power * 0.25 : h.damage * power;
    this.life = Math.max(0, this.life - dmg);
    const kb = (blocked ? h.knockback * 0.5 : h.knockback) / this.def.stats.weight;
    this.vx = kb * dir;
    if (!blocked) this.facing = dir === 1 ? -1 : 1;
    this.meter = Math.min(100, this.meter + (blocked ? dmg * 0.4 : dmg * 0.7));
    this.buffered = null;
    if (this.life <= 0) {
      this.setState('ko'); this.knockdownAir = true; this.vy = -8; this.vx = 4 * dir; this.y = Math.min(this.y, -0.01);
      this.flash = 8; return;
    }
    if (blocked) {
      this.setState('blockstun'); this.stun = h.blockstun; return;
    }
    this.flash = 6;
    if (h.knockdown || this.airborne) {
      this.setState('knockdown'); this.knockdownAir = true; this.vy = h.launch ?? -7; this.y = Math.min(this.y, -0.01);
      this.vx = (kb * 0.4) * dir;
      return;
    }
    this.setState('hitstun'); this.stun = h.hitstun;
    if (h.launch) { this.vy = h.launch; this.y = -0.01; }
  }

  // ---------- boxes (em px de tela)
  private toWorld(b: Box): Box {
    const s = this.scale;
    const w = b.w * s, h = b.h * s;
    const wx = this.facing === 1 ? this.x + b.x * s : this.x - (b.x + b.w) * s;
    return { x: wx, y: GROUND_Y + this.y + b.y * s, w, h };
  }
  get hurtbox(): Box | null {
    if (this.state === 'ko' || this.state === 'knockdown' || this.state === 'grabbed') return null;
    return this.toWorld(this.crouched ? this.def.crouchHurtbox : this.def.hurtbox);
  }
  get hitbox(): Box | null {
    if (this.state !== 'attacking' || !this.move || this.phase !== 'active' || this.hasHit) return null;
    if (this.move.hitbox.w === 0) return null;
    return this.toWorld(this.move.hitbox);
  }
  get pushbox(): Box {
    const s = this.scale;
    return { x: this.x + this.def.pushbox.x * s, y: GROUND_Y + this.y - 100, w: this.def.pushbox.w * s, h: 100 };
  }

  // ---------- animação
  currentFrame(): { frame: FrameDef; anchor: 'feet' | 'center' } {
    const A = this.def.anims;
    const F = this.assets.frames.frames;
    const byFps = (name: string) => {
      const a = A[name]; const fps = a.fps ?? 8;
      const idx = Math.floor(this.animTime * fps / 60);
      const i = a.loop ? idx % a.frames.length : Math.min(idx, a.frames.length - 1);
      return { frame: F[a.frames[i]], anchor: a.anchor ?? 'feet' as const };
    };
    switch (this.state) {
      case 'idle': return byFps('idle');
      case 'walking': {
        const a = A.walk; const fps = a.fps ?? 8;
        const back = (this.vx < 0);
        const idx = Math.floor(this.animTime * fps / 60) % a.frames.length;
        return { frame: F[a.frames[back ? a.frames.length - 1 - idx : idx]], anchor: 'feet' };
      }
      case 'jumping': { const a = A.jump; return { frame: F[a.frames[this.vy < -3 ? 0 : 1]], anchor: a.anchor ?? 'center' }; }
      case 'crouching': return { frame: F[A.crouch.frames[0]], anchor: 'feet' };
      case 'blocking': case 'blockstun':
        return { frame: F[(this.crouchBlock ? A.crouchBlock : A.block).frames[0]], anchor: 'feet' };
      case 'hitstun': case 'grabbed': return { frame: F[A.hit.frames[0]], anchor: 'feet' };
      case 'knockdown': case 'ko': {
        if (this.knockdownAir) return { frame: F[A.fall.frames[0]], anchor: 'center' };
        if (this.state === 'knockdown' && this.stateFrame > 28) return { frame: F[A.getup.frames[0]], anchor: 'feet' };
        return { frame: F[A.down.frames[0]], anchor: 'center' };
      }
      case 'win': return byFps('win');
      case 'attacking': {
        const m = this.move!; const ph = this.phase!;
        const anchor = m.anchor ?? (this.air ? 'center' : 'feet');
        if (m.kind === 'throw') {
          const P = m.phases;
          const list = this.sub === 'dash' ? P.startup : this.sub === 'grab' ? P.active : this.sub === 'hold' ? (P.hold ?? P.active)
            : this.sub === 'lift' ? (P.lift ?? P.active) : this.sub === 'throw' ? (P.throw ?? P.recovery) : P.recovery;
          return { frame: F[list[0]], anchor: 'feet' };
        }
        if (m.kind === 'dive') {
          if (ph === 'startup') return { frame: F[m.phases.startup[0]], anchor: 'center' };
          if (ph === 'active') return { frame: F[m.phases.active[0]], anchor: 'center' };
          if (ph === 'impact') return { frame: F[(m.phases.impact ?? m.phases.recovery)[0]], anchor: 'feet' };
          const list = m.phases.recovery;
          return { frame: F[list[Math.min(list.length - 1, Math.floor(this.stateFrame / Math.max(1, m.recovery) * list.length))]], anchor: 'feet' };
        }
        const list = m.phases[ph as 'startup' | 'active' | 'recovery'];
        const start = ph === 'startup' ? 0 : ph === 'active' ? m.startup : m.startup + m.active;
        const len = ph === 'startup' ? m.startup : ph === 'active' ? m.active : m.recovery;
        const t = (this.stateFrame - start) / Math.max(1, len);
        return { frame: F[list[Math.min(list.length - 1, Math.floor(t * list.length))]], anchor };
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, debug = false) {
    const { frame, anchor } = this.currentFrame();
    const s = this.scale;
    const ax = anchor === 'center' ? frame.cx : frame.ax;
    const dw = frame.sw * s, dh = frame.sh * s;
    const fy = GROUND_Y + this.y;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(this.x, GROUND_Y + 4, 34 * this.def.scale, 7, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(this.x, fy);
    ctx.scale(this.facing, 1);
    if (this.hue) ctx.filter = `hue-rotate(${this.hue}deg)`;
    const src: [HTMLImageElement | HTMLCanvasElement, number, number] = this.flash > 0 ? [this.flashed(frame), 0, 0] : [this.assets.sheet, frame.sx, frame.sy];
    ctx.drawImage(src[0], src[1], src[2], frame.sw, frame.sh, -ax * s, -frame.ay * s, dw, dh);
    ctx.restore();

    if (debug) this.drawDebug(ctx, frame);
  }

  private flashed(frame: FrameDef) {
    if (!this.flashCanvas) this.flashCanvas = document.createElement('canvas');
    const c = this.flashCanvas; c.width = frame.sw; c.height = frame.sh;
    const g = c.getContext('2d')!;
    g.drawImage(this.assets.sheet, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, frame.sw, frame.sh);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  private drawDebug(ctx: CanvasRenderingContext2D, frame: FrameDef) {
    const box = (b: Box | null, color: string) => {
      if (!b) return;
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w, b.h);
      ctx.fillStyle = color.replace(')', ',0.15)').replace('rgb', 'rgba'); ctx.fillRect(b.x, b.y, b.w, b.h);
    };
    box(this.pushbox, 'rgb(80,140,255)');
    box(this.hurtbox, 'rgb(60,230,90)');
    box(this.hitbox, 'rgb(255,60,60)');
    ctx.strokeStyle = '#fff'; ctx.beginPath();
    ctx.moveTo(this.x - 8, GROUND_Y + this.y); ctx.lineTo(this.x + 8, GROUND_Y + this.y);
    ctx.moveTo(this.x, GROUND_Y + this.y - 8); ctx.lineTo(this.x, GROUND_Y + this.y + 8); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
    const ph = this.phase ? ` ${this.moveName} ${this.phase}` : '';
    ctx.fillText(`${this.state}${ph} f${this.stateFrame} #${frame.i}`, this.x, GROUND_Y + this.y + 22);
  }
}
