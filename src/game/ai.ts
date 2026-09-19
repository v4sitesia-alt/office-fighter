// CPU: perfis por dificuldade = pesos + distância preferida + tempo de reação.
import { VirtualController, type Button } from '../core/input';
import type { Difficulty } from './types';
import type { Fighter } from './fighter';
import type { Projectile } from './projectile';
import { Rng } from '../core/rng';

interface Profile {
  reaction: number;      // frames entre decisões
  attackChance: number;  // por decisão, quando em alcance
  blockChance: number;   // ao ver o oponente em startup (também anti-aéreo)
  jumpChance: number;    // pulo pra dentro quando longe
  specialChance: number;
  retreatChance: number;
  punishBlock: boolean;  // ataca quando o oponente está em recovery
  mixup: number;         // chance de usar rasteira/aéreo contra a defesa errada
}

export const PROFILES: Record<Difficulty, Profile> = {
  easy:   { reaction: 18, attackChance: 0.35, blockChance: 0.2, jumpChance: 0.06, specialChance: 0.3, retreatChance: 0.15, punishBlock: false, mixup: 0.2 },
  normal: { reaction: 10, attackChance: 0.55, blockChance: 0.5, jumpChance: 0.1,  specialChance: 0.6, retreatChance: 0.12, punishBlock: true,  mixup: 0.5 },
  hard:   { reaction: 5,  attackChance: 0.75, blockChance: 0.8, jumpChance: 0.14, specialChance: 0.9, retreatChance: 0.08, punishBlock: true,  mixup: 0.8 },
};

type Plan = { buttons: Button[]; frames: number };

export class Ai {
  ctrl = new VirtualController();
  private queue: Plan[] = [];
  private cooldown = 0;
  private superCd = 0;
  private rng: Rng;
  debug = '';

  constructor(public me: Fighter, public other: Fighter, public difficulty: Difficulty, seed?: number) {
    this.rng = new Rng(seed);
  }

  update(projectiles: Projectile[], enabled = true) {
    this.ctrl.begin();
    if (this.superCd > 0) this.superCd--;
    if (!enabled) return;
    const p = PROFILES[this.difficulty];
    if (this.queue.length) {
      const pl = this.queue[0];
      pl.buttons.forEach((b) => this.ctrl.press(b));
      if (--pl.frames <= 0) this.queue.shift();
      return;
    }
    if (this.cooldown-- > 0) return;
    this.cooldown = p.reaction;

    const me = this.me, ot = this.other, M = me.def.moves;
    const dx = Math.abs(ot.x - me.x);
    const fwd: Button = ot.x > me.x ? 'right' : 'left';
    const back: Button = fwd === 'right' ? 'left' : 'right';
    const reach = 140 * me.def.scale;
    const incoming = projectiles.find((pr) => pr.owner === ot && Math.sign(pr.vx) === Math.sign(me.x - pr.x) && Math.abs(pr.x - me.x) < 260);

    // no ar: golpe aéreo quando estiver perto e descendo
    if (me.state === 'jumping' && !me.airAttackUsed && dx < 230 && me.vy > -4) {
      this.debug = 'aéreo';
      this.set([this.rng.chance(0.6) ? 'kick' : 'punch'], 2); return;
    }
    if (!me.actionable) return;

    if (incoming) {
      this.debug = 'projétil';
      this.set(this.rng.chance(0.5) ? ['up', fwd] : ['block'], 20); return;
    }
    // oponente pulando em cima: anti-aéreo
    if (ot.airborne && dx < 210 && this.rng.chance(p.blockChance)) {
      this.debug = 'anti-aéreo';
      this.set(['heavy'], 2); return;
    }
    // oponente em startup perto: defende (agachado se o golpe for baixo)
    if (ot.state === 'attacking' && ot.phase !== 'recovery' && dx < reach + 80 && this.rng.chance(p.blockChance)) {
      const low = !!ot.move?.low, over = !!ot.move?.overhead;
      this.debug = low ? 'defende baixo' : 'defende';
      this.set(low ? ['block', 'down'] : over ? ['block'] : (this.rng.chance(0.5) ? ['block', 'down'] : ['block']), 16 + this.rng.range(0, 10)); return;
    }
    // punição: oponente em recovery ao alcance
    if (p.punishBlock && ot.state === 'attacking' && ot.phase === 'recovery' && dx < reach) {
      this.debug = 'pune';
      this.set([this.rng.chance(0.5) ? 'heavy' : 'kick'], 2); return;
    }
    // super com barra cheia
    if (me.meter >= 100 && M.super && this.superCd <= 0) {
      const kind = M.super.kind ?? (M.super.projectile ? 'shot' : 'ground');
      if ((kind === 'portal' && this.rng.chance(p.specialChance * 0.6)) || (kind === 'dive' && dx < 430 && this.rng.chance(p.specialChance))
        || (kind === 'shot' && dx > 220 && this.rng.chance(p.specialChance * 0.7))
        || (kind === 'ground' && dx < 260 && this.rng.chance(p.specialChance))
        || (kind === 'throw' && dx < 200 && ot.grounded && this.rng.chance(p.specialChance))) {
        this.debug = 'super'; this.superCd = 260; this.set(['special'], 2); return;
      }
    }
    if (dx < reach) {
      if (this.rng.chance(p.attackChance)) {
        // defesa errada do oponente: rasteira contra defesa em pé, pulo+chute contra agachado
        if (ot.blocking && this.rng.chance(p.mixup)) {
          if (!ot.crouchBlock) { this.debug = 'rasteira'; this.set(['down', 'kick'], 3); return; }
          this.debug = 'por cima';
          this.queue.push({ buttons: ['up'], frames: 4 }, { buttons: [], frames: 8 }, { buttons: ['kick'], frames: 2 }); return;
        }
        const r = this.rng.next();
        if (r < 0.35) { this.debug = 'soco'; this.set(['punch'], 2); }
        else if (r < 0.6) { this.debug = 'chute'; this.set(['kick'], 2); }
        else if (r < 0.78) { this.debug = 'forte'; this.set(['heavy'], 2); }
        else if (r < 0.9) { this.debug = 'soco baixo'; this.set(['down', 'punch'], 3); }
        else { this.debug = 'rasteira'; this.set(['down', 'kick'], 3); }
        return;
      }
      if (this.rng.chance(p.retreatChance)) { this.debug = 'recua'; this.set([back], 14); return; }
      this.debug = 'espera'; this.set([], 6); return;
    }
    // meia distância: golpe longo (frente + forte), pra quem tem. Só vale a pena com o alvo no chão e dentro do alcance
    if (M.long && ot.grounded && dx < this.longReach() && this.rng.chance(p.attackChance * 0.5)) {
      this.debug = 'golpe longo'; this.set([fwd, 'heavy'], 2); return;
    }
    // longe
    if (me.meter >= 50 && me.meter < 100 && dx > 300 && M.special && this.rng.chance(p.specialChance * 0.45)) {
      this.debug = 'especial'; this.set(['special'], 2); return;
    }
    if (dx < 330 && this.rng.chance(p.jumpChance)) {
      this.debug = 'pulo pra dentro';
      this.queue.push({ buttons: ['up', fwd], frames: 5 }, { buttons: [fwd], frames: 14 }, { buttons: ['kick'], frames: 2 }); return;
    }
    this.debug = 'aproxima';
    this.set([fwd], 8 + this.rng.range(0, 8));
  }

  /** Até onde o golpe longo alcança, em px de tela a partir dos meus pés (com folga: a caixa tem que entrar no alvo). */
  private longReach() {
    const m = this.me.def.moves.long!;
    const far = Math.max(...(m.hitboxes ?? [m.hitbox]).map((b) => b.x + b.w));
    return far * this.me.scale + 15;
  }

  private set(buttons: Button[], frames: number) {
    this.queue = [{ buttons, frames: Math.max(1, Math.round(frames)) }];
    buttons.forEach((b) => this.ctrl.press(b));
    this.queue[0].frames--;
    if (this.queue[0].frames <= 0) this.queue.shift();
  }
}
