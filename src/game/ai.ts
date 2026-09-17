// CPU: perfis por dificuldade = pesos + distância preferida + tempo de reação.
import { VirtualController, type Button } from '../core/input';
import type { Difficulty } from './types';
import type { Fighter } from './fighter';
import type { Projectile } from './projectile';
import { Rng } from '../core/rng';

interface Profile {
  reaction: number;      // frames entre decisões
  attackChance: number;  // por decisão, quando em alcance
  blockChance: number;   // ao ver o oponente em startup
  jumpChance: number;
  specialChance: number;
  retreatChance: number;
  punishBlock: boolean;  // ataca quando o oponente está em recovery
}

export const PROFILES: Record<Difficulty, Profile> = {
  easy:   { reaction: 18, attackChance: 0.35, blockChance: 0.2, jumpChance: 0.05, specialChance: 0.3, retreatChance: 0.15, punishBlock: false },
  normal: { reaction: 10, attackChance: 0.55, blockChance: 0.5, jumpChance: 0.08, specialChance: 0.6, retreatChance: 0.12, punishBlock: true },
  hard:   { reaction: 5,  attackChance: 0.75, blockChance: 0.8, jumpChance: 0.1,  specialChance: 0.9, retreatChance: 0.08, punishBlock: true },
};

type Plan = { buttons: Button[]; frames: number };

export class Ai {
  ctrl = new VirtualController();
  private plan: Plan | null = null;
  private cooldown = 0;
  private rng: Rng;
  debug = '';

  constructor(public me: Fighter, public other: Fighter, public difficulty: Difficulty, seed?: number) {
    this.rng = new Rng(seed);
  }

  update(projectiles: Projectile[], enabled = true) {
    this.ctrl.begin();
    if (!enabled) return;
    const p = PROFILES[this.difficulty];
    if (this.plan && this.plan.frames-- > 0) { this.plan.buttons.forEach((b) => this.ctrl.press(b)); return; }
    this.plan = null;
    if (this.cooldown-- > 0) return;
    this.cooldown = p.reaction;

    const me = this.me, ot = this.other;
    const dx = Math.abs(ot.x - me.x);
    const fwd: Button = ot.x > me.x ? 'right' : 'left';
    const back: Button = fwd === 'right' ? 'left' : 'right';
    const reach = 150 * me.def.scale;
    const incoming = projectiles.find((pr) => pr.owner === ot && Math.sign(pr.vx) === Math.sign(me.x - pr.x) && Math.abs(pr.x - me.x) < 260);

    if (!me.actionable) return;

    // projétil vindo: pula ou defende
    if (incoming) {
      this.debug = 'projétil';
      this.set(this.rng.chance(0.5) ? ['up', fwd] : ['block'], 20); return;
    }
    // oponente em startup perto: defende
    if (ot.state === 'attacking' && ot.phase !== 'recovery' && dx < reach + 60 && this.rng.chance(p.blockChance)) {
      this.debug = 'defende';
      this.set(['block'], 16 + this.rng.range(0, 10)); return;
    }
    // punição: oponente em recovery ao alcance
    if (p.punishBlock && ot.state === 'attacking' && ot.phase === 'recovery' && dx < reach) {
      this.debug = 'pune';
      this.set([this.rng.chance(0.5) ? 'heavy' : 'kick'], 2); return;
    }
    if (dx < reach) {
      if (me.meter >= 100 && this.rng.chance(p.specialChance)) { this.debug = 'especial'; this.set(['special'], 2); return; }
      if (this.rng.chance(p.attackChance)) {
        const r = this.rng.next();
        const b: Button = r < 0.5 ? 'punch' : r < 0.8 ? 'kick' : 'heavy';
        this.debug = b; this.set([b], 2); return;
      }
      if (this.rng.chance(p.retreatChance)) { this.debug = 'recua'; this.set([back], 14); return; }
      this.debug = 'espera'; this.set([], 6); return;
    }
    // longe
    if (me.meter >= 100 && dx > 320 && this.rng.chance(p.specialChance * 0.5)) { this.debug = 'especial longe'; this.set(['special'], 2); return; }
    if (this.rng.chance(p.jumpChance)) { this.debug = 'pula'; this.set(['up', fwd], 6); return; }
    this.debug = 'aproxima';
    this.set([fwd], 8 + this.rng.range(0, 8));
  }

  private set(buttons: Button[], frames: number) {
    this.plan = { buttons, frames: Math.round(frames) };
    buttons.forEach((b) => this.ctrl.press(b));
  }
}
