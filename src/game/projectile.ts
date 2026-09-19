import type { Box, MoveDef } from './types';
import { GROUND_Y, W } from './consts';
import type { Fighter } from './fighter';

export class Projectile {
  x: number; y: number; vx: number; life: number; dead = false; age = 0;
  vy = 0; target: Fighter | null = null;
  hitsLeft: number; cool = 0; private returning = false; private dir: 1 | -1;
  hitbox: Box;
  img: HTMLImageElement | undefined;
  constructor(public owner: Fighter, public move: MoveDef) {
    const p = move.projectile!;
    this.img = owner.assets.fx[p.sprite ?? 'special_fx.png'];
    const s = owner.scale;
    this.x = owner.x + owner.facing * p.x * s;
    this.y = GROUND_Y + owner.y + p.y * s;
    this.vx = p.speed * owner.facing;
    this.life = p.lifetime; this.hitsLeft = p.hits ?? 1; this.dir = owner.facing;
    this.hitbox = { x: p.hitbox.x * s, y: p.hitbox.y * s, w: p.hitbox.w * s, h: p.hitbox.h * s };
  }
  update() {
    const p = this.move.projectile!;
    if (this.cool > 0) this.cool--;
    if (p.homing) {                                           // míssil: 1) sobe em arco  2) vira aos poucos na direção do alvo  3) mergulha
      const sp = p.speed;
      if (this.age < 16) { this.vx = this.dir * sp * 0.55; this.vy = -sp * (1 - this.age / 22); }
      else if (this.target) {
        const ty = GROUND_Y + this.target.y - 90 * this.target.scale, dx = this.target.x - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1;
        const k = this.age < 70 ? 0.09 : 0.03;                // depois de um tempo para de perseguir: dá pra desviar
        this.vx += (dx / d * sp - this.vx) * k; this.vy += (dy / d * sp - this.vy) * k;
      }
      this.y += this.vy;
      if (this.y > GROUND_Y - 6) this.dead = true;
    }
    if (p.boomerang) {                                        // freia até parar, inverte e acelera de volta pra mão
      const half = p.lifetime / 2;
      if (!this.returning && (this.age >= half || this.x < 20 || this.x > W - 20)) { this.returning = true; if (this.hitsLeft > 0) this.cool = 0; }
      const t = this.returning ? Math.min(1, (this.age - half) / half + 0.25) : 1 - this.age / half * 0.85;
      this.vx = p.speed * (this.returning ? -this.dir : this.dir) * Math.max(0.15, t);
      if (this.returning && (this.x - this.owner.x) * this.dir <= 30) this.dead = true;
    }
    this.x += this.vx; this.age++;
    if (--this.life <= 0 || this.x < -100 || this.x > W + 100) this.dead = true;
  }
  get worldBox(): Box { return { x: this.x + this.hitbox.x, y: this.y + this.hitbox.y, w: this.hitbox.w, h: this.hitbox.h }; }
  draw(ctx: CanvasRenderingContext2D, debug = false) {
    const s = this.owner.scale * (this.move.projectile?.scale ?? 1);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.dir, 1);
    if (this.move.projectile?.homing) ctx.rotate(Math.atan2(this.vy, Math.abs(this.vx) + 0.001) * (this.vx * this.dir < 0 ? -1 : 1) + (this.vx * this.dir < 0 ? Math.PI : 0));
    if (this.move.projectile?.spin) ctx.rotate(this.age * this.move.projectile.spin);
    const pulse = 1 + 0.08 * Math.sin(this.age * 0.6);
    ctx.scale(pulse, pulse);
    if (this.owner.hue) ctx.filter = `hue-rotate(${this.owner.hue}deg)`;
    const st = this.move.projectile?.style;
    if (st) {
      drawMagic(ctx, st, this.move.projectile?.color ?? this.owner.def.colors.primary, (this.move.projectile?.size ?? 34) * this.owner.def.scale, this.age);
    } else if (this.img) {
      const w = this.img.width * s, h = this.img.height * s;
      ctx.drawImage(this.img, -w / 2, -h / 2, w, h);
    } else {
      ctx.fillStyle = this.owner.def.colors.primary; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (debug) { const b = this.worldBox; ctx.strokeStyle = 'rgb(255,60,60)'; ctx.strokeRect(b.x, b.y, b.w, b.h); }
  }
}

/** Magias de meia barra sem sprite: bola, risco, nuvem, morcego, moeda, coração, onda. Desenhadas viradas pra direita. */
export function drawMagic(ctx: CanvasRenderingContext2D, style: string, color: string, r: number, age: number) {
  const glow = (rad: number, c: string) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
    g.addColorStop(0, '#fff'); g.addColorStop(0.35, c); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
  };
  // rastro
  ctx.globalAlpha = 0.35; ctx.fillStyle = color;
  for (let i = 1; i <= 4; i++) { const q = r * (0.5 - i * 0.08); ctx.fillRect(-r * 0.6 - i * r * 0.45, -q / 2, r * 0.35, q); }
  ctx.globalAlpha = 1;
  switch (style) {
    case 'ball':
      glow(r * 1.5, color);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, r * (0.7 + i * 0.18), age * 0.4 + i * 2, age * 0.4 + i * 2 + 1.6); ctx.stroke(); }
      break;
    case 'slash':
      ctx.strokeStyle = color; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) { ctx.lineWidth = 9 - i * 3; ctx.globalAlpha = 1 - i * 0.25; ctx.beginPath(); ctx.arc(-r * 1.2 - i * 9, 0, r * 1.6, -0.75, 0.75); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-r * 1.2, 0, r * 1.6, -0.6, 0.6); ctx.stroke();
      break;
    case 'wave':
      for (let i = 0; i < 3; i++) { ctx.fillStyle = i ? color : '#fff'; ctx.globalAlpha = 1 - i * 0.3; ctx.beginPath(); ctx.ellipse(-i * r * 0.5, r * 0.5, r * (0.9 - i * 0.15), r * (1.1 - i * 0.2), 0, Math.PI, 0); ctx.fill(); }
      ctx.globalAlpha = 1; break;
    case 'cloud':
      ctx.fillStyle = color;
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + age * 0.08; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.4, r * (0.55 + 0.1 * Math.sin(age * 0.3 + i)), 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1; break;
    case 'bat': {
      const flap = Math.sin(age * 0.7) * 0.6;
      glow(r * 1.3, color);
      ctx.fillStyle = '#1a0b2e';
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.35, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      for (const sgn of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(0, -r * 0.1);
        ctx.quadraticCurveTo(sgn * r * 0.6, -r * (0.9 + flap), sgn * r * 1.2, -r * (0.2 + flap));
        ctx.lineTo(sgn * r * 0.9, r * 0.1); ctx.lineTo(sgn * r * 0.6, -r * 0.05); ctx.lineTo(sgn * r * 0.3, r * 0.2); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#ff3c5a'; ctx.fillRect(r * 0.08, -r * 0.1, 3, 3); ctx.fillRect(r * 0.2, -r * 0.1, 3, 3);
      break;
    }
    case 'coin': {
      glow(r * 1.3, color);
      const w = Math.abs(Math.cos(age * 0.35)) * r * 0.75 + r * 0.12;
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.ellipse(0, 0, w, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#a86b00'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#a86b00'; ctx.font = `bold ${Math.round(r)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (w > r * 0.45) ctx.fillText('$', 0, 1);
      break;
    }
    case 'heart': {
      glow(r * 1.4, color);
      const k = r * 0.055 * (1 + 0.12 * Math.sin(age * 0.5));
      ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 6 * k);
      ctx.bezierCurveTo(-16 * k, -6 * k, -8 * k, -18 * k, 0, -8 * k);
      ctx.bezierCurveTo(8 * k, -18 * k, 16 * k, -6 * k, 0, 6 * k + 6 * k); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
  }
}
