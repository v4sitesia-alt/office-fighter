import type { Box } from './types';
import type { Fighter } from './fighter';
import type { Projectile } from './projectile';
import type { Fx } from './fx';

export function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export interface HitResult { hitstop: number }

/** Resolve golpes e projéteis dos dois lados no mesmo frame (trade possível). */
export function resolveHits(fighters: [Fighter, Fighter], projectiles: Projectile[], fx: Fx): HitResult {
  let hitstop = 0;
  const pending: Array<() => void> = [];

  for (let i = 0; i < 2; i++) {
    const atk = fighters[i], def = fighters[1 - i];
    const hb = atk.hitbox, hurt = def.hurtbox;
    if (hb && hurt && overlaps(hb, hurt)) {
      const m = atk.move!;
      atk.hasHit = true;
      const blocked = def.blocking && def.state !== 'ko';
      const px = Math.min(hb.x + hb.w, hurt.x + hurt.w) / 2 + Math.max(hb.x, hurt.x) / 2;
      const py = Math.max(hb.y, hurt.y) / 2 + Math.min(hb.y + hb.h, hurt.y + hurt.h) / 2;
      pending.push(() => {
        def.takeHit(m, atk, blocked, atk.x);
        atk.meter = Math.min(100, atk.meter + (m.meterGain ?? 0) * (blocked ? 0.5 : 1));
        if (!blocked) { atk.comboHits++; def.lastHitBy = atk.moveName; }
        fx.hit(px, py, blocked ? '#9ec5ff' : atk.def.colors.primary, !blocked && m.damage >= 12);
      });
      hitstop = Math.max(hitstop, blocked ? 3 : (m.hitstop ?? 5));
    }
  }
  for (const p of projectiles) {
    if (p.dead) continue;
    const def = p.owner === fighters[0] ? fighters[1] : fighters[0];
    const hurt = def.hurtbox;
    if (hurt && overlaps(p.worldBox, hurt)) {
      p.dead = true;
      const blocked = def.blocking;
      const owner = p.owner;
      pending.push(() => {
        def.takeHit(p.move, owner, blocked, owner.x);
        fx.hit(p.x + p.vx * 2, p.y, blocked ? '#9ec5ff' : owner.def.colors.primary, !blocked);
      });
      hitstop = Math.max(hitstop, blocked ? 4 : (p.move.hitstop ?? 8));
    }
  }
  pending.forEach((f) => f());
  return { hitstop };
}

/** Separa os pushboxes pra os lutadores não se atravessarem. */
export function separate(a: Fighter, b: Fighter) {
  if (a.state === 'ko' || b.state === 'ko') return;
  const pa = a.pushbox, pb = b.pushbox;
  if (!overlaps(pa, pb)) return;
  // não empurra quem está no ar por cima
  const left = pa.x < pb.x ? a : b, right = left === a ? b : a;
  const pl = left.pushbox, pr = right.pushbox;
  const pen = pl.x + pl.w - pr.x;
  if (pen <= 0) return;
  const wa = left.def.stats.weight, wb = right.def.stats.weight;
  left.x -= pen * (wb / (wa + wb));
  right.x += pen * (wa / (wa + wb));
}
