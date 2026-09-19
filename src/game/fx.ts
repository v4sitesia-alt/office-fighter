// Partículas, faísca de impacto e screenshake. Tudo desenhado com primitivas (é efeito, não sprite).
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface Spark { x: number; y: number; life: number; big: boolean; color: string }

import { GROUND_Y } from './consts';
interface Drop { x: number; y: number; vx: number; vy: number; size: number; color: string }
interface Stain { x: number; w: number; life: number }

export class Fx {
  drops: Drop[] = []; stains: Stain[] = [];
  /** Gotas espirrando na direção do golpe; caem no chão e viram manchinhas que somem. */
  blood(x: number, y: number, dir: number, amount: number) {
    for (let i = 0; i < amount; i++) {
      const sp = 2 + Math.random() * 6;
      this.drops.push({ x, y, vx: dir * sp * (0.4 + Math.random()) + (Math.random() - 0.5) * 2, vy: -2 - Math.random() * 6, size: 2 + Math.random() * 3, color: Math.random() < 0.6 ? '#c1121f' : '#7a0a12' });
    }
  }
  particles: Particle[] = [];
  sparks: Spark[] = [];
  shake = 0; shakeMag = 0;

  hit(x: number, y: number, color: string, big: boolean) {
    this.sparks.push({ x, y, life: big ? 14 : 9, big, color });
    const n = big ? 18 : 9;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (big ? 6 : 4) * (0.4 + Math.random());
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: 0, max: 18 + Math.random() * 14, color: i % 3 ? color : '#fff', size: big ? 5 : 3 });
    }
    this.shake = big ? 12 : 5; this.shakeMag = big ? 7 : 3;
  }
  update() {
    for (const p of this.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.vx *= 0.92; p.life++; }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const d of this.drops) { d.x += d.vx; d.y += d.vy; d.vy += 0.5; d.vx *= 0.97; }
    for (const d of this.drops) if (d.y >= GROUND_Y + 4 && this.stains.length < 60) this.stains.push({ x: d.x, w: d.size * 1.8, life: 200 });
    this.drops = this.drops.filter((d) => d.y < GROUND_Y + 4);
    for (const st of this.stains) st.life--;
    this.stains = this.stains.filter((st) => st.life > 0);
    for (const s of this.sparks) s.life--;
    this.sparks = this.sparks.filter((s) => s.life > 0);
    if (this.shake > 0) this.shake--;
  }
  get offset(): [number, number] {
    if (this.shake <= 0) return [0, 0];
    const m = this.shakeMag * (this.shake / 12);
    return [(Math.random() - 0.5) * 2 * m, (Math.random() - 0.5) * 2 * m];
  }
  draw(ctx: CanvasRenderingContext2D) {
    for (const st of this.stains) { ctx.globalAlpha = Math.min(0.75, st.life / 60); ctx.fillStyle = '#7a0a12'; ctx.beginPath(); ctx.ellipse(st.x, GROUND_Y + 6, st.w, st.w * 0.3, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const d of this.drops) { ctx.fillStyle = d.color; ctx.fillRect(d.x - d.size / 2, d.y - d.size / 2, d.size, d.size * 1.4); }
    for (const s of this.sparks) {
      const r = (s.big ? 46 : 26) * (1 - s.life / (s.big ? 14 : 9) * 0.5);
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.life * 0.3);
      ctx.fillStyle = s.life % 2 ? '#fff' : s.color;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, rr = i % 2 ? r : r * 0.4;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
}
