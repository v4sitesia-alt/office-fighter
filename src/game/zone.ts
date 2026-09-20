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
  /** Portal: o círculo abre no chão, o feixe sobe com a ponta na frente até sair da tela e o enxame sobe por dentro. */
  private drawPillar(ctx: CanvasRenderingContext2D) {
    const p = this.def.pillar!, fx = this.owner.assets.fx, s = this.owner.scale, t = this.age, life = this.def.lifetime;
    const base = fx[p.base], tile = fx[p.tile], top = fx[p.top], swarm = fx[p.swarm];
    const fade = Math.min(1, (life - t) / 14), open = Math.min(1, t / 8);
    const h = Math.max(0, t - p.delay) * p.rise;                       // altura do feixe agora (px de tela)
    if (tile && h > 0) {
      const tw = tile.width * s, th = tile.height * s, pulse = 1 + 0.05 * Math.sin(t * 0.9);
      ctx.save(); ctx.globalAlpha = fade * (0.74 + 0.1 * Math.sin(t * 1.7));   // translúcido: dá pra ver quem está apanhando lá dentro
      ctx.beginPath(); ctx.rect(this.x - tw, GROUND_Y - h, tw * 2, h); ctx.clip();
      for (let k = 0, y = GROUND_Y; y > GROUND_Y - h - th; k++, y -= th) {   // trecho que se repete; um sim, um não de ponta-cabeça: a emenda casa sempre
        ctx.save(); ctx.translate(this.x, y - th / 2); ctx.scale(pulse, k % 2 ? -1 : 1);
        ctx.drawImage(tile, -tw / 2, -th / 2 - 0.5, tw, th + 1); ctx.restore();
      }
      if (swarm) {                                                     // criaturas subindo por dentro do feixe, balançando de um lado pro outro
        const sw = swarm.width * s, sh = swarm.height * s, gap = sh * 1.05, off = (t * p.rise * 0.55) % gap;
        for (let k = -1, y = GROUND_Y + off; y > GROUND_Y - h - sh; k++, y -= gap) {
          const sway = Math.sin(t * 0.13 + k * 1.9) * tw * 0.16, flip = k % 2 ? -1 : 1;
          ctx.save(); ctx.translate(this.x + sway, y - sh / 2); ctx.scale(flip * (0.92 + 0.08 * Math.sin(t * 0.3 + k)), 1);
          ctx.drawImage(swarm, -sw / 2, -sh / 2, sw, sh); ctx.restore();
        }
      }
      ctx.restore();
      if (top && GROUND_Y - h > -top.height * s) { ctx.globalAlpha = fade; ctx.drawImage(top, this.x - top.width * s / 2, GROUND_Y - h - top.height * s * 0.55, top.width * s, top.height * s); }
    }
    if (base) {
      const bw = base.width * s * (0.35 + 0.65 * open) * (1 + 0.04 * Math.sin(t * 0.8)), bh = base.height * s * (0.35 + 0.65 * open);
      ctx.globalAlpha = fade; ctx.drawImage(base, this.x - bw / 2, GROUND_Y + 14 * s - bh, bw, bh);
    }
  }

  /** Bombas caindo em fila; cada uma estoura no chão no frame do seu acerto. */
  private drawRain(ctx: CanvasRenderingContext2D) {
    const r = this.def.rain!, fx = this.owner.assets.fx, s = this.owner.scale, bomb = fx[r.bomb], boom = fx[r.boom], n = this.def.hits.length;
    const up = fx[r.up ?? ''];
    if (up && this.age < 30) {                                         // o foguete sai do canhão e some no céu
      const o = this.owner, ux = o.x + o.facing * (r.upX ?? 0) * s + o.facing * this.age * 3, uy = GROUND_Y + (r.upY ?? -200) * s - this.age * (5 + this.age * 0.6);
      ctx.save(); ctx.translate(ux, uy); ctx.scale(o.facing, 1); ctx.drawImage(up, -up.width * s / 2, -up.height * s / 2, up.width * s, up.height * s);
      ctx.fillStyle = 'rgba(255,190,60,.85)'; ctx.beginPath(); ctx.ellipse(-6 * s, up.height * s * 0.62, 5 * s, (10 + 6 * Math.sin(this.age)) * s, 0.25, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    this.def.hits.forEach((hit, k) => {
      const x = this.x + (k - (n - 1) / 2) * r.spread * s * this.owner.facing, left = hit.at - this.age;
      if (left > 0 && left <= r.fall && bomb) {                        // caindo: acelera até o chão, com risquinhos de velocidade
        const q = 1 - left / r.fall, y = GROUND_Y - 30 * s - (1 - q * q) * (GROUND_Y + 80), bw = bomb.width * s, bh = bomb.height * s;
        ctx.save(); ctx.translate(x, y); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
        for (const dx of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(dx, -bh / 2 - 6); ctx.lineTo(dx, -bh / 2 - 26 - 10 * q); ctx.stroke(); }
        ctx.drawImage(bomb, -bw / 2, -bh / 2, bw, bh); ctx.restore();
      } else if (left <= 0 && left > -22 && boom) {                    // estouro: cresce rápido e some
        const q = -left / 22, k2 = 0.8 + 0.75 * Math.min(1, q * 3), bw = boom.width * s * k2, bh = boom.height * s * k2;
        ctx.save(); ctx.globalAlpha = 1 - q * q; ctx.drawImage(boom, x - bw / 2, GROUND_Y + 8 * s - bh, bw, bh); ctx.restore();
      }
    });
  }
  /** Caixa de acerto da bomba k (cada uma cai num ponto). */
  boxOfHit(k: number): Box {
    const b = this.worldBox; if (!this.def.rain) return b;
    const n = this.def.hits.length; return { ...b, x: b.x + (k - (n - 1) / 2) * this.def.rain.spread * this.owner.scale * this.owner.facing };
  }

  /** índice do acerto que cai neste frame (ou -1) */
  get hitIndex() { return this.def.hits.findIndex((h) => h.at === this.age); }
  draw(ctx: CanvasRenderingContext2D, debug = false) {
    if (this.def.pillar || this.def.rain) {
      ctx.save(); if (this.owner.hue) ctx.filter = `hue-rotate(${this.owner.hue}deg)`;
      if (this.def.pillar) this.drawPillar(ctx); else this.drawRain(ctx);
      ctx.restore();
      if (debug) { const b = this.worldBox; ctx.strokeStyle = 'rgb(255,120,40)'; ctx.strokeRect(b.x, b.y, b.w, b.h); }
      return;
    }
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
