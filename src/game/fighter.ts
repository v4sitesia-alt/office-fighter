import type { Box, FighterAssets, FrameDef, MoveDef, MoveName } from './types';
import type { Button, Controller } from '../core/input';
import {
  ARENA_MAX, ARENA_MIN, BACK_SPEED, GRAVITY, GROUND_Y, INPUT_BUFFER, JUMP_VX, JUMP_VY,
  SPRITE_SCALE, WALK_SPEED,
} from './consts';

export type State =
  | 'idle' | 'walking' | 'jumping' | 'crouching' | 'blocking'
  | 'attacking' | 'hitstun' | 'blockstun' | 'knockdown' | 'ko' | 'win';

export type Phase = 'startup' | 'active' | 'recovery';

const ATTACK_BUTTONS: MoveName[] = ['special', 'heavy', 'kick', 'punch']; // prioridade quando 2 apertados juntos

export class Fighter {
  x: number; y = 0;            // pés; y é deslocamento acima do chão (negativo = no ar)
  vx = 0; vy = 0;
  facing: 1 | -1;
  state: State = 'idle';
  stateFrame = 0;              // frames dentro do estado atual
  animTime = 0;                // pra animações por fps (idle/walk/win)
  life = 100; meter = 0;
  scale: number;

  move: MoveDef | null = null;
  moveName: MoveName | null = null;
  hasHit = false;
  stun = 0;                    // frames restantes de hitstun/blockstun
  knockdownAir = false;
  flash = 0;                   // frames de flash branco (levou hit)
  hue = 0;                     // rotação de matiz (espelho da campanha)
  crouchBlock = false;
  private buffered: { btn: MoveName; frame: number } | null = null;
  private frameCounter = 0;
  lastHitBy: MoveName | null = null;
  comboHits = 0;
  private flashCanvas: HTMLCanvasElement | null = null;

  constructor(public assets: FighterAssets, x: number, facing: 1 | -1, public playerIndex: number) {
    this.x = x; this.facing = facing;
    this.scale = assets.def.scale * SPRITE_SCALE;
  }

  get def() { return this.assets.def; }
  get grounded() { return this.y >= 0; }
  get actionable() { return this.state === 'idle' || this.state === 'walking' || this.state === 'crouching' || this.state === 'blocking'; }
  get airborne() { return this.state === 'jumping' || (this.state === 'knockdown' && this.knockdownAir); }
  get phase(): Phase | null {
    if (!this.move) return null;
    const f = this.stateFrame;
    if (f < this.move.startup) return 'startup';
    if (f < this.move.startup + this.move.active) return 'active';
    return 'recovery';
  }

  setState(s: State) {
    if (this.state === s) return;
    this.state = s; this.stateFrame = 0;
    if (s !== 'attacking') { this.move = null; this.moveName = null; this.hasHit = false; }
  }

  faceTowards(other: Fighter) {
    if (this.actionable || this.state === 'jumping' && false) this.facing = other.x >= this.x ? 1 : -1;
  }

  // ---------- update
  update(ctrl: Controller, other: Fighter, frozen: boolean) {
    this.frameCounter++;
    if (this.flash > 0) this.flash--;
    if (frozen) return;                  // hitstop: nada se move
    this.stateFrame++;
    this.animTime++;
    this.readBuffer(ctrl);

    switch (this.state) {
      case 'idle': case 'walking': case 'crouching': case 'blocking':
        this.faceTowards(other);
        this.handleNeutral(ctrl);
        break;
      case 'jumping':
        this.physicsAir();
        if (this.grounded) { this.y = 0; this.vy = 0; this.vx = 0; this.setState('idle'); }
        break;
      case 'attacking':
        this.vx *= 0.8;
        this.x += this.vx;
        if (this.move && this.stateFrame >= this.move.startup + this.move.active + this.move.recovery) this.setState('idle');
        break;
      case 'hitstun': case 'blockstun':
        this.x += this.vx; this.vx *= 0.85;
        if (!this.grounded || this.vy !== 0) { this.physicsAir(); if (this.grounded) { this.y = 0; this.vy = 0; } }
        if (--this.stun <= 0) this.setState(this.state === 'blockstun' && ctrl.held('block') ? 'blocking' : 'idle');
        break;
      case 'knockdown':
        if (this.knockdownAir) {
          this.x += this.vx; this.physicsAir();
          if (this.grounded) { this.y = 0; this.vy = 0; this.vx = 0; this.knockdownAir = false; this.stateFrame = 0; }
        } else if (this.stateFrame > 40) {
          this.setState('idle');
        }
        break;
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

  private readBuffer(ctrl: Controller) {
    for (const m of ATTACK_BUTTONS) {
      if (ctrl.pressed(m as Button)) { this.buffered = { btn: m, frame: this.frameCounter }; break; }
    }
    if (this.buffered && this.frameCounter - this.buffered.frame > INPUT_BUFFER) this.buffered = null;
  }

  private handleNeutral(ctrl: Controller) {
    // ataque bufferizado tem prioridade
    if (this.buffered) {
      const m = this.buffered.btn;
      if (this.startMove(m)) { this.buffered = null; return; }
      if (m === 'special') this.buffered = null; // sem barra: descarta
    }
    const fwd: Button = this.facing === 1 ? 'right' : 'left';
    const back: Button = this.facing === 1 ? 'left' : 'right';
    if (ctrl.held('block')) {
      this.crouchBlock = ctrl.held('down');
      this.setState('blocking'); this.vx = 0; return;
    }
    if (ctrl.held('down')) { this.setState('crouching'); this.vx = 0; return; }
    if (ctrl.pressed('up') || (ctrl.held('up') && this.state !== 'jumping')) {
      this.vy = JUMP_VY;
      this.vx = ctrl.held(fwd) ? JUMP_VX * this.facing : ctrl.held(back) ? -JUMP_VX * this.facing : 0;
      this.y = -0.01;
      this.setState('jumping'); return;
    }
    const sp = this.def.stats.speed;
    if (ctrl.held(fwd)) { this.x += WALK_SPEED * sp * this.facing; this.setState('walking'); this.vx = 1; }
    else if (ctrl.held(back)) { this.x -= BACK_SPEED * sp * this.facing; this.setState('walking'); this.vx = -1; }
    else { this.setState('idle'); this.vx = 0; }
  }

  startMove(name: MoveName): boolean {
    const m = this.def.moves[name];
    if (!m) return false;
    if (m.meterCost && this.meter < m.meterCost) return false;
    if (m.meterCost) this.meter -= m.meterCost;
    this.setState('attacking');
    this.move = m; this.moveName = name; this.hasHit = false; this.vx = 0;
    return true;
  }

  // ---------- dano
  takeHit(m: MoveDef, attacker: Fighter, blocked: boolean, fromX: number) {
    const dir: 1 | -1 = fromX < this.x ? 1 : -1;  // empurrado pra longe de quem bateu
    const power = attacker.def.stats.power;
    const dmg = blocked ? m.damage * power * 0.25 : m.damage * power;
    this.life = Math.max(0, this.life - dmg);
    const kb = (blocked ? m.knockback * 0.5 : m.knockback) / this.def.stats.weight;
    this.vx = kb * dir;
    if (!blocked) this.facing = dir === 1 ? -1 : 1;
    this.meter = Math.min(100, this.meter + (blocked ? dmg * 0.4 : dmg * 0.7));
    this.buffered = null;
    if (this.life <= 0) {
      this.setState('ko'); this.knockdownAir = true; this.vy = -8; this.vx = 4 * dir; this.y = -0.01;
      this.flash = 8; return;
    }
    if (blocked) {
      this.setState('blockstun'); this.stun = m.blockstun; return;
    }
    this.flash = 6;
    if (m.knockdown || (!this.grounded)) {
      this.setState('knockdown'); this.knockdownAir = true; this.vy = m.launch ?? -7; this.y = Math.min(this.y, -0.01);
      this.vx = (kb * 0.4) * dir;
      return;
    }
    this.setState('hitstun'); this.stun = m.hitstun;
    if (m.launch) { this.vy = m.launch; this.y = -0.01; }
  }

  // ---------- boxes (em px de tela)
  private toWorld(b: Box): Box {
    const s = this.scale;
    const w = b.w * s, h = b.h * s;
    const wx = this.facing === 1 ? this.x + b.x * s : this.x - (b.x + b.w) * s;
    return { x: wx, y: GROUND_Y + this.y + b.y * s, w, h };
  }
  get hurtbox(): Box | null {
    if (this.state === 'ko' || this.state === 'knockdown') return null;
    const crouched = this.state === 'crouching' || (this.state === 'blocking' && this.crouchBlock);
    return this.toWorld(crouched ? this.def.crouchHurtbox : this.def.hurtbox);
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
  get blocking() { return this.state === 'blocking' || this.state === 'blockstun'; }

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
      case 'blocking': return { frame: F[(this.crouchBlock ? A.crouchBlock : A.block).frames[0]], anchor: 'feet' };
      case 'blockstun': return { frame: F[(this.crouchBlock ? A.crouchBlock : A.block).frames[0]], anchor: 'feet' };
      case 'hitstun': return { frame: F[A.hit.frames[0]], anchor: 'feet' };
      case 'knockdown': case 'ko': {
        if (this.knockdownAir) return { frame: F[A.fall.frames[0]], anchor: 'center' };
        if (this.state === 'knockdown' && this.stateFrame > 28) return { frame: F[A.getup.frames[0]], anchor: 'feet' };
        return { frame: F[A.down.frames[0]], anchor: 'center' };
      }
      case 'win': return byFps('win');
      case 'attacking': {
        const m = this.move!; const ph = this.phase!;
        const list = m.phases[ph];
        const start = ph === 'startup' ? 0 : ph === 'active' ? m.startup : m.startup + m.active;
        const len = ph === 'startup' ? m.startup : ph === 'active' ? m.active : m.recovery;
        const t = (this.stateFrame - start) / Math.max(1, len);
        return { frame: F[list[Math.min(list.length - 1, Math.floor(t * list.length))]], anchor: 'feet' };
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, debug = false) {
    const { frame, anchor } = this.currentFrame();
    const s = this.scale;
    const ax = anchor === 'center' ? frame.cx : frame.ax;
    const dw = frame.sw * s, dh = frame.sh * s;
    const fy = GROUND_Y + this.y;
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(this.x, GROUND_Y + 4, 38 * this.def.scale, 8, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(this.x, fy);
    ctx.scale(this.facing, 1);
    if (this.hue) ctx.filter = `hue-rotate(${this.hue}deg)`;
    const src: [HTMLImageElement | HTMLCanvasElement, number, number] = this.flash > 0 ? [this.flashed(frame), 0, 0] : [this.assets.sheet, frame.sx, frame.sy];
    ctx.drawImage(src[0], src[1], src[2], frame.sw, frame.sh, -ax * s, -frame.ay * s, dw, dh);
    ctx.restore();

    if (debug) this.drawDebug(ctx, frame);
  }

  /** Versão branca do frame atual (flash de impacto). */
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
