import type { Box, MoveDef } from './types';
import { GROUND_Y, W } from './consts';
import type { Fighter } from './fighter';

export class Projectile {
  x: number; y: number; vx: number; life: number; dead = false; age = 0;
  hitbox: Box;
  img: HTMLImageElement | undefined;
  constructor(public owner: Fighter, public move: MoveDef) {
    const p = move.projectile!;
    this.img = owner.assets.fx[p.sprite ?? 'special_fx.png'];
    const s = owner.scale;
    this.x = owner.x + owner.facing * p.x * s;
    this.y = GROUND_Y + owner.y + p.y * s;
    this.vx = p.speed * owner.facing;
    this.life = p.lifetime;
    this.hitbox = { x: p.hitbox.x * s, y: p.hitbox.y * s, w: p.hitbox.w * s, h: p.hitbox.h * s };
  }
  update() {
    this.x += this.vx; this.age++;
    if (--this.life <= 0 || this.x < -100 || this.x > W + 100) this.dead = true;
  }
  get worldBox(): Box { return { x: this.x + this.hitbox.x, y: this.y + this.hitbox.y, w: this.hitbox.w, h: this.hitbox.h }; }
  draw(ctx: CanvasRenderingContext2D, debug = false) {
    const s = this.owner.scale * (this.move.projectile?.scale ?? 1);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.owner.facing, 1);
    const pulse = 1 + 0.08 * Math.sin(this.age * 0.6);
    ctx.scale(pulse, pulse);
    if (this.owner.hue) ctx.filter = `hue-rotate(${this.owner.hue}deg)`;
    if (this.img) {
      const w = this.img.width * s, h = this.img.height * s;
      ctx.drawImage(this.img, -w / 2, -h / 2, w, h);
    } else {
      ctx.fillStyle = this.owner.def.colors.primary; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (debug) { const b = this.worldBox; ctx.strokeStyle = 'rgb(255,60,60)'; ctx.strokeRect(b.x, b.y, b.w, b.h); }
  }
}
