import type { Box, FrameDef, MoveDef, ZoneDef } from './types';
import { GROUND_Y } from './consts';
import type { Fighter } from './fighter';

/** Efeito no chão com hitbox própria e vários acertos (portal do Edgard, explosão do Santana). */
export class Zone {
  age = 0; dead = false;
  applied = new Set<number>();
  def: ZoneDef;
  constructor(public owner: Fighter, public move: MoveDef, public x: number) {
    this.def = move.zone!;
  }
  update() { if (++this.age >= this.def.lifetime) this.dead = true; }
  get frame(): FrameDef {
    const i = Math.min(this.def.frames.length - 1, Math.floor(this.age * this.def.fps / 60));
    return this.owner.assets.frames.frames[this.def.frames[i]];
  }
  get worldBox(): Box {
    const s = this.owner.scale, b = this.def.hitbox;
    return { x: this.x + b.x * s, y: GROUND_Y + b.y * s, w: b.w * s, h: b.h * s };
  }
  /** índice do acerto que cai neste frame (ou -1) */
  get hitIndex() { return this.def.hits.findIndex((h) => h.at === this.age); }
  draw(ctx: CanvasRenderingContext2D, debug = false) {
    const f = this.frame, s = this.owner.scale;
    ctx.save();
    ctx.translate(this.x, GROUND_Y);
    ctx.scale(this.owner.facing, 1);
    if (this.owner.hue) ctx.filter = `hue-rotate(${this.owner.hue}deg)`;
    ctx.drawImage(this.owner.assets.sheet, f.sx, f.sy, f.sw, f.sh, -f.ax * s, -f.ay * s, f.sw * s, f.sh * s);
    ctx.restore();
    if (debug) { const b = this.worldBox; ctx.strokeStyle = 'rgb(255,120,40)'; ctx.strokeRect(b.x, b.y, b.w, b.h); }
  }
}
