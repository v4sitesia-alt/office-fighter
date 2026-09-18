import type { Box } from './types';
import type { Fighter } from './fighter';
import type { Projectile } from './projectile';
import type { Zone } from './zone';
import type { Fx } from './fx';
import { audio } from '../core/audio';

export function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Defesa em pé não segura golpe baixo; defesa agachada não segura golpe de cima. */
function isBlocked(def: Fighter, low?: boolean, overhead?: boolean) {
  if (!def.blocking) return false;
  if (low && !def.crouchBlock) return false;
  if (overhead && def.crouchBlock) return false;
  return true;
}

export interface HitResult { hitstop: number }

/** Resolve golpes, projéteis e zonas dos dois lados no mesmo frame (trade possível). */
export function resolveHits(fighters: [Fighter, Fighter], projectiles: Projectile[], zones: Zone[], fx: Fx): HitResult {
  let hitstop = 0;
  const pending: Array<() => void> = [];
  const other = (f: Fighter) => (f === fighters[0] ? fighters[1] : fighters[0]);

  // agarrões: ignoram defesa; só pegam quem está no chão e de pé
  for (let i = 0; i < 2; i++) {
    const atk = fighters[i], def = fighters[1 - i];
    if (atk.state !== 'attacking' || atk.move?.kind !== 'throw' || atk.sub !== 'grab' || atk.hasHit) continue;
    const hb = atk.hitbox;
    const grabbable = def.grounded && !['knockdown', 'ko', 'grabbed', 'jumping', 'win'].includes(def.state);
    if (hb && grabbable && overlaps(hb, def.hurtbox ?? def.pushbox)) { atk.grab(def); hitstop = Math.max(hitstop, 6); }
  }

  for (let i = 0; i < 2; i++) {
    const atk = fighters[i], def = fighters[1 - i];
    if (atk.move?.kind === 'throw') continue;
    const hb = atk.hitbox, hurt = def.hurtbox;
    if (hb && hurt && overlaps(hb, hurt)) {
      const m = atk.move!;
      atk.hasHit = true;
      const blocked = isBlocked(def, m.low, m.overhead);
      const px = (Math.max(hb.x, hurt.x) + Math.min(hb.x + hb.w, hurt.x + hurt.w)) / 2;
      const py = (Math.max(hb.y, hurt.y) + Math.min(hb.y + hb.h, hurt.y + hurt.h)) / 2;
      pending.push(() => {
        def.takeHit(m, atk, blocked, atk.x);
        atk.meter = Math.min(100, atk.meter + (m.meterGain ?? m.damage) * (blocked ? 0.7 : 1.5));
        if (!blocked) { atk.comboHits++; def.lastHitBy = atk.moveName; }
        fx.hit(px, py, blocked ? '#9ec5ff' : atk.def.colors.primary, !blocked && m.damage >= 12);
        audio.sfx(blocked ? 'block' : m.damage >= 12 ? 'hitBig' : 'hit');
      });
      hitstop = Math.max(hitstop, blocked ? 3 : (m.hitstop ?? 5));
    }
  }
  for (const p of projectiles) {
    if (p.dead) continue;
    const def = other(p.owner);
    const hurt = def.hurtbox;
    if (hurt && overlaps(p.worldBox, hurt)) {
      p.dead = true;
      const blocked = isBlocked(def);
      const owner = p.owner;
      pending.push(() => {
        def.takeHit(p.move, owner, blocked, owner.x);
        fx.hit(p.x + p.vx * 2, p.y, blocked ? '#9ec5ff' : owner.def.colors.primary, !blocked);
        audio.sfx(blocked ? 'block' : 'hitBig');
      });
      hitstop = Math.max(hitstop, blocked ? 4 : (p.move.hitstop ?? 8));
    }
  }
  for (const z of zones) {
    if (z.dead) continue;
    const idx = z.hitIndex;
    if (idx < 0 || z.applied.has(idx)) continue;
    z.applied.add(idx);
    const def = other(z.owner);
    const hurt = def.hurtbox;
    if (hurt && overlaps(z.worldBox, hurt)) {
      const h = z.def.hits[idx];
      const blocked = isBlocked(def, z.def.low, z.def.overhead);
      const owner = z.owner;
      pending.push(() => {
        def.takeHit({ damage: h.damage, hitstun: z.def.hitstun, blockstun: z.def.blockstun, knockback: z.def.knockback, knockdown: h.knockdown, launch: h.launch }, owner, blocked, z.x - owner.facing);
        fx.hit(def.x, hurt.y + hurt.h * 0.45, blocked ? '#9ec5ff' : owner.def.colors.primary, !blocked);
        audio.sfx(blocked ? 'block' : 'hitBig');
      });
      hitstop = Math.max(hitstop, blocked ? 4 : (z.def.hitstop ?? 8));
    }
  }
  pending.forEach((f) => f());
  return { hitstop };
}

/** Separa os pushboxes pra os lutadores não se atravessarem. */
export function separate(a: Fighter, b: Fighter) {
  if (a.state === 'ko' || b.state === 'ko' || a.state === 'grabbed' || b.state === 'grabbed') return;
  const pa = a.pushbox, pb = b.pushbox;
  if (!overlaps(pa, pb)) return;
  const left = pa.x < pb.x ? a : b, right = left === a ? b : a;
  const pl = left.pushbox, pr = right.pushbox;
  const pen = pl.x + pl.w - pr.x;
  if (pen <= 0) return;
  const wa = left.def.stats.weight, wb = right.def.stats.weight;
  left.x -= pen * (wb / (wa + wb));
  right.x += pen * (wa / (wa + wb));
}
