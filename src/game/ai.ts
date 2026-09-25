// CPU: perfis por dificuldade = pesos + distância preferida + tempo de reação.
import { VirtualController, type Button } from '../core/input';
import type { Difficulty } from './types';
import type { Fighter } from './fighter';
import type { Projectile } from './projectile';
import { Rng } from '../core/rng';
import { ARENA_MAX, ARENA_MIN } from './consts';

interface Profile {
  reaction: number;      // frames entre decisões
  attackChance: number;  // por decisão, quando em alcance
  blockChance: number;   // ao ver o oponente em startup (também anti-aéreo)
  jumpChance: number;    // pulo pra dentro quando longe
  specialChance: number;
  retreatChance: number;
  punishBlock: boolean;  // ataca quando o oponente está em recovery
  mixup: number;         // chance de usar rasteira/aéreo contra a defesa errada
  chain: number;         // chance de seguir o combo quando o golpe encadeável encosta
}

export const PROFILES: Record<Difficulty, Profile> = {
  easy:   { reaction: 18, attackChance: 0.35, blockChance: 0.2, jumpChance: 0.06, specialChance: 0.3, retreatChance: 0.15, punishBlock: false, mixup: 0.2, chain: 0.3 },
  // 2026-09-24: arcade um pouco mais difícil. O normal subiu (era 10 · 0,55 · 0,5 · 0,6 · 0,5 · 0,65) e o 'boss' é novo, mais esperto
  // que o difícil, só nos andares de cima do arcade. O difícil fica como está: é a régua do torneio de equilíbrio (npm run balance).
  normal: { reaction: 8,  attackChance: 0.62, blockChance: 0.6,  jumpChance: 0.1,  specialChance: 0.7,  retreatChance: 0.11, punishBlock: true,  mixup: 0.6,  chain: 0.75 },
  hard:   { reaction: 5,  attackChance: 0.75, blockChance: 0.8, jumpChance: 0.14, specialChance: 0.9, retreatChance: 0.08, punishBlock: true,  mixup: 0.8, chain: 0.9 },
  boss:   { reaction: 4,  attackChance: 0.8,  blockChance: 0.85, jumpChance: 0.14, specialChance: 0.95, retreatChance: 0.08, punishBlock: true,  mixup: 0.85, chain: 0.95 },
};

type Plan = { buttons: Button[]; frames: number };

export class Ai {
  ctrl = new VirtualController();
  private queue: Plan[] = [];
  private cooldown = 0;
  private superCd = 0;
  private rng: Rng;
  private chainSeen: unknown = null;   // golpe encadeável que já decidiu (uma rolagem por golpe, não por frame)
  debug = '';

  constructor(public me: Fighter, public other: Fighter, public difficulty: Difficulty, seed?: number) {
    this.rng = new Rng(seed);
  }

  update(projectiles: Projectile[], enabled = true) {
    this.ctrl.begin();
    if (this.superCd > 0) this.superCd--;
    if (!enabled) return;
    const range = this.me.def.range, base = PROFILES[this.difficulty];
    // de perto: pressiona (ataca mais, recua menos, pula pra dentro mais). As outras distâncias usam o perfil como está
    let p = range === 'perto' ? { ...base, attackChance: Math.min(0.95, base.attackChance * 1.2), retreatChance: base.retreatChance * 0.4, jumpChance: base.jumpChance * 1.4 } : base;
    if ((this.me.def.stats.air ?? 1) < 0.9) p = { ...p, jumpChance: p.jumpChance * 0.3 };   // pulo em câmera lenta (Xablau): quase não pula, apanharia no ar
    if (this.queue.length) {
      const pl = this.queue[0];
      pl.buttons.forEach((b) => this.ctrl.press(b));
      if (--pl.frames <= 0) this.queue.shift();
      return;
    }
    // combo de porrada: o golpe encostou e dá pra encadear -> decide na hora, sem esperar o tempo de reação
    const mv = this.me.move;
    if (this.me.state === 'attacking' && mv?.chain && this.me.hasHit && this.chainSeen !== mv) {
      this.chainSeen = mv;
      if (this.rng.chance(p.chain)) { this.debug = 'encadeia'; this.set([mv.chain[Math.floor(this.rng.next() * mv.chain.length)] as Button], 3); return; }
    }
    if (this.me.state !== 'attacking') this.chainSeen = null;
    if (this.cooldown-- > 0) return;
    this.cooldown = p.reaction;

    const me = this.me, ot = this.other, M = me.def.moves;
    const dx = Math.abs(ot.x - me.x);
    const fwd: Button = ot.x > me.x ? 'right' : 'left';
    const back: Button = fwd === 'right' ? 'left' : 'right';
    const reach = this.reach();
    const incoming = projectiles.find((pr) => pr.owner === ot && Math.sign(pr.vx) === Math.sign(me.x - pr.x) && Math.abs(pr.x - me.x) < 260);

    // no ar: golpe aéreo quando estiver perto e descendo
    if (me.state === 'jumping' && !me.airAttackUsed && dx < 230 && me.vy > -4) {
      this.debug = 'aéreo';
      this.set([this.rng.chance(0.6) ? 'kick' : 'punch'], 2); return;
    }
    if (!me.actionable) return;

    if (ot.state === 'attacking' && ot.move?.beam && ot.phase !== 'recovery' && Math.sign(me.x - ot.x) === ot.facing && this.rng.chance(p.blockChance)) {
      this.debug = 'defende raio'; this.set(['block'], 14 + this.rng.range(0, 8)); return;
    }
    if (incoming) {
      this.debug = 'projétil';
      this.set(this.rng.chance(0.5) ? ['up', fwd] : ['block'], 20); return;
    }
    // oponente pulando em cima: anti-aéreo
    if (ot.airborne && dx < 210 && this.rng.chance(p.blockChance)) {
      // anti-aéreo com o golpe forte só pra quem tem forte rápido; máquina lenta apanharia no meio do preparo: defende em pé
      if ((M.heavy?.startup ?? 10) <= 12) { this.debug = 'anti-aéreo'; this.set(['heavy'], 2); }
      else { this.debug = 'defende o pulo'; this.set(['block'], 18); }
      return;
    }
    // oponente carregando energia: não adianta bater (intocável) e a aura machuca -> sai de perto e se prepara pra defender o raio
    if (ot.charging) { this.debug = 'foge da aura'; this.set(dx < 170 ? [back] : ['block'], 12); return; }
    // oponente em startup perto: defende (agachado se o golpe for baixo)
    if (ot.state === 'attacking' && ot.phase !== 'recovery' && dx < Math.max(reach + 80, this.threat()) && this.rng.chance(p.blockChance)) {
      const low = !!ot.move?.low, over = !!ot.move?.overhead;
      this.debug = low ? 'defende baixo' : 'defende';
      this.set(low ? ['block', 'down'] : over ? ['block'] : (this.rng.chance(0.5) ? ['block', 'down'] : ['block']), 16 + this.rng.range(0, 10)); return;
    }
    // punição: oponente em recovery ao alcance
    if (p.punishBlock && ot.state === 'attacking' && ot.phase === 'recovery' && dx < reach) {
      this.debug = 'pune';
      this.set([this.rng.chance(0.5) ? 'heavy' : 'kick'], 2); return;
    }
    // escudo de moedas ativo e o adversário longe: lança as moedas
    if (me.shield && M.release && dx > 240 && this.rng.chance(p.specialChance * 0.25)) { this.debug = 'lança moedas'; this.set(['special'], 2); return; }
    // super com barra cheia
    if (me.meter >= 100 && M.super && this.superCd <= 0) {
      const kind = M.super.kind ?? (M.super.shield ? 'portal' : M.super.projectile || M.super.beam ? 'shot' : 'ground');
      if ((kind === 'portal' && this.rng.chance(p.specialChance * 0.6)) || (kind === 'dive' && dx < 430 && this.rng.chance(p.specialChance))
        || (kind === 'shot' && dx > (M.super.projectile?.pierce ? 110 : 220) && this.rng.chance(p.specialChance * 0.7))     // o que atravessa a tela (cavalo, tsunami) serve de perto também
        || (kind === 'ground' && dx < 260 && this.rng.chance(p.specialChance))
        || (kind === 'throw' && dx < 200 && ot.grounded && this.rng.chance(p.specialChance))) {
        this.debug = 'super'; this.superCd = 260; this.set(['special'], 2); return;
      }
    }
    // quem luta de longe (def.range 'longe') decide aqui; se devolver false, segue a lógica de todo mundo
    if (range === 'longe' && this.zoner(p, dx, fwd, back, reach, projectiles)) return;
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
    // sem golpe longo mas com um forte que vai bem além do soco (a língua do Xablau): o forte é o golpe de meia distância dele
    if (!M.long && M.heavy && ot.grounded) {
      const far = (M.heavy.hitbox.x + M.heavy.hitbox.w) * me.scale;
      if (far > reach * 1.8 && dx < far - 10 && this.rng.chance(p.attackChance * 0.3)) { this.debug = 'forte de longe'; this.set(['heavy'], 2); return; }
    }
    // meia distância: golpe longo (frente + forte), pra quem tem. Só vale a pena com o alvo no chão e dentro do alcance
    if (M.long && ot.grounded && dx < this.longReach() && this.rng.chance(p.attackChance * (range === 'medio' ? 0.5 : 0.35))) {   // meia distância vive do golpe longo
      this.debug = 'golpe longo'; this.set([fwd, 'heavy'], 2); return;
    }
    // longe
    const magicNear = M.special && (M.special.kind === 'throw' || (!M.special.projectile && !M.special.beam));   // magia que é agarrão ou investida: de perto
    if (me.meter >= 50 && me.meter < 100 && magicNear && !me.shield && dx < (M.special!.kind === 'throw' ? 190 : 300) && ot.grounded && this.rng.chance(p.specialChance * 0.5)) {
      this.debug = 'magia de perto'; this.set(['special'], 2); return;
    }
    if (me.meter >= 50 && me.meter < 100 && dx > 300 && M.special && !magicNear && !me.shield && this.rng.chance(p.specialChance * (range === 'perto' ? 0.25 : 0.45))) {   // quem luta de perto prefere chegar
      this.debug = 'especial'; this.set(['special'], 2); return;
    }
    if (dx < 330 && this.rng.chance(p.jumpChance)) {
      this.debug = 'pulo pra dentro';
      this.queue.push({ buttons: ['up', fwd], frames: 5 }, { buttons: [fwd], frames: 14 }, { buttons: ['kick'], frames: 2 }); return;
    }
    this.debug = 'aproxima';
    this.set([fwd], 8 + this.rng.range(0, 8));
  }

  /** Joga de longe (Edgard, Kevin, Landim, CRM). Com a magia pronta: solta de 200 px pra fora (uma por vez no ar; de barra cheia, com ↓ + B) e, se o outro
   *  está colado, abre espaço pulando ou andando pra trás. Sem barra: não vai atrás de ninguém, espera o outro vir e, de perto,
   *  briga como todo mundo (defende, pune, bate), que é como a barra enche. Devolve false quando a decisão fica com a lógica geral. */
  private zoner(p: Profile, dx: number, fwd: Button, back: Button, _reach: number, projectiles: Projectile[]): boolean {
    const me = this.me, M = me.def.moves;
    const cornered = fwd === 'right' ? me.x < ARENA_MIN + 70 : me.x > ARENA_MAX - 70;
    const mine = projectiles.some((pr) => pr.owner === me);
    const ready = !!M.special && me.meter >= (M.special.meterCost ?? 50) && !me.shield;
    // barra cheia: o super teve a vez lá em cima; se não saiu, atira a magia assim mesmo com ↓ + B (quem luta de longe vive de tiro)
    if (ready && dx > 200 && !mine && this.rng.chance(p.specialChance)) { this.debug = 'magia de longe'; this.set(me.meter >= 100 ? ['down', 'special'] : ['special'], 2); return true; }
    // golpe longo que é tiro (o míssil da CRM): arma de longe também
    if (M.long?.projectile && (!M.long.meterCost || me.meter >= M.long.meterCost) && this.other.grounded && dx > 200 && dx < this.longReach() && this.rng.chance(p.attackChance * 0.35)) {
      this.debug = 'tiro longo'; this.set([fwd, 'heavy'], 2); return true;
    }
    if (ready && dx <= 200 && !cornered && this.rng.chance(0.5)) {                       // magia pronta e o outro colado: abre espaço pra soltar
      if (this.rng.chance(0.5)) { this.debug = 'pulo pra trás'; this.queue.push({ buttons: ['up', back], frames: 5 }, { buttons: [back], frames: 14 }); }
      else { this.debug = 'abre espaço'; this.set([back], 14); }
      return true;
    }
    if (dx > 340 && this.rng.chance(0.6)) { this.debug = 'espera de longe'; this.set(this.rng.chance(0.25) ? [back] : [], 6 + this.rng.range(0, 6)); return true; }
    return false;
  }

  /** Alcance real dos golpes comuns (o mais comprido entre soco e chute), em px de tela, mais meia largura do alvo. */
  private reach() {
    const M = this.me.def.moves, far = Math.max(...[M.punch, M.kick].map((m) => (m ? m.hitbox.x + m.hitbox.w : 0)));
    return far * this.me.scale + 18;
  }

  /** Até onde o golpe que o adversário está soltando AGORA alcança (px de tela, com folga): golpe longo também se defende. */
  private threat() {
    const m = this.other.move; if (!m) return 0;
    if (m.projectile) {                                                   // golpe longo que é tiro: a escopeta pega até onde o estouro chega; o míssil teleguiado, de qualquer lugar
      if (m.projectile.homing) return 560;
      return (m.projectile.x + m.projectile.hitbox.x + m.projectile.hitbox.w + m.projectile.speed * m.projectile.lifetime * 0.5) * this.me.scale;
    }
    const far = Math.max(...(m.hitboxes ?? [m.hitbox]).map((b) => b.x + b.w));
    return far > 0 ? far * this.other.scale + 45 : 0;
  }

  /** Até onde o golpe longo alcança, em px de tela a partir dos meus pés (com folga: a caixa tem que entrar no alvo). */
  private longReach() {
    const m = this.me.def.moves.long!;
    if (m.projectile) {                                                   // golpe longo que é tiro: a escopeta pega até onde o estouro chega; o míssil teleguiado, de qualquer lugar
      if (m.projectile.homing) return 560;
      return (m.projectile.x + m.projectile.hitbox.x + m.projectile.hitbox.w + m.projectile.speed * m.projectile.lifetime * 0.5) * this.me.scale;
    }
    const far = Math.max(...(m.hitboxes ?? [m.hitbox]).map((b) => b.x + b.w));
    if (m.kind === 'throw' && m.throw) return far * this.me.scale + m.throw.speed * m.throw.dash;   // agarrão que avança (o FEEDBACK 360 do Dener)
    return far * this.me.scale + (m.dash ?? 0) * (m.startup + m.active * 0.5) + 15;      // golpe com avanço (direto, barrigada) alcança mais longe
  }

  private set(buttons: Button[], frames: number) {
    this.queue = [{ buttons, frames: Math.max(1, Math.round(frames)) }];
    buttons.forEach((b) => this.ctrl.press(b));
    this.queue[0].frames--;
    if (this.queue[0].frames <= 0) this.queue.shift();
  }
}
