import type { StageAssets } from '../core/assets';
import { audio } from '../core/audio';
import type { Controller } from '../core/input';

/** Qualquer fonte de controles: teclado/toque (Input) ou botões vindos da rede. */
export interface Ports { ports: Controller[] }
import { Ai } from './ai';
import { ARENA_MAX, ARENA_MIN, GRAVITY, GROUND_Y, H, ROUND_SECONDS, W } from './consts';
import { Fighter } from './fighter';
import { Fx } from './fx';
import { resolveHits, separate } from './hit';
import { Projectile } from './projectile';
import { Referee } from './referee';
import { drawStage } from './stage';
import type { Difficulty, FighterAssets } from './types';
import { Zone } from './zone';

export type MatchPhase = 'intro' | 'fight' | 'ko' | 'over';

export interface MatchOptions {
  cpu: Difficulty | null;   // null = 2 jogadores locais
  hueP2?: number;           // espelho: rotação de matiz do P2
  seed?: number;
  label?: string;           // "LUTA 1", "FINAL"...
  roundsToWin?: number;     // melhor de 3 = 2
  baseScore?: number;       // arcade: pontos acumulados das lutas anteriores (P1)
  /** Duplas (2x2): o companheiro de cada lado. Luta única; quem está em campo chama o outro com o botão TROCA e,
   *  se cair, o companheiro entra sozinho. A dupla perde quando os dois caem. */
  partners?: [FighterAssets | null, FighterAssets | null];
  owners?: [string[], string[]];   // nome de quem controla cada lutador (aparece no placar)
}

/** Metamorfose (Mundim -> A COISA, sempre no 2º round): quadro do atlas do monstro, até que frame da cena ele fica, altura na tela
 *  e quanto sobe do chão (ele é erguido pelo bicho). Os sons vêm da pasta `cena`: grito de dor, o bicho saindo da cabeça e o rugido final. */
export const MORPH: { frame: number; until: number; h: number; lift?: number }[] = [
  { frame: 35, until: 50, h: 240 }, { frame: 36, until: 110, h: 258 }, { frame: 37, until: 180, h: 415 }, { frame: 38, until: 245, h: 425, lift: 26 }, { frame: 39, until: 305, h: 425, lift: 14 },
  { frame: 40, until: 345, h: 437 }, { frame: 41, until: 385, h: 435 }, { frame: 42, until: 425, h: 432 }, { frame: 43, until: 465, h: 428 }, { frame: 44, until: 520, h: 432 },
];
const MORPH_SOUNDS: [number, string][] = [[12, 'morph-1'], [108, 'morph-2'], [462, 'morph-3']];

export const TAG = { COOL: 180, REGEN: 0.02, REGEN_CAP: 25, ENTER_Y: -300, KO_WAIT: 45 };

export interface MatchEvents {
  message(text: string, frames: number, kind?: 'big' | 'small'): void;
  end(winner: 0 | 1 | -1, perfect: boolean): void;
}

const START_X: [number, number] = [300, 660];

export class Match {
  fighters: [Fighter, Fighter];
  ai: Ai | null = null;
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  referee = new Referee();
  fx = new Fx();
  hitstop = 0;
  phase: MatchPhase = 'intro';
  phaseFrame = 0;
  timer = ROUND_SECONDS * 60;
  round = 1;
  wins: [number, number] = [0, 0];
  roundWinner: 0 | 1 | -1 = -1;
  winner: 0 | 1 | -1 = -1;
  training = false;
  slowmo = 0;         // >0: roda 1 passo a cada N
  private slowAcc = 0;
  private endSent = false;
  private koLanded = true;
  private prevLife: [number, number] = [100, 100];
  score: [number, number] = [0, 0];
  /** Bônus do fim do round (o HUD mostra a contagem). */
  tally: { who: 0 | 1; items: [string, number][]; total: number } | null = null;
  private roundsToWin: number;
  /** Duplas: os lutadores de cada lado (em campo ou no banco), quem está em campo e o tempo até poder trocar de novo. */
  teams: [Fighter[], Fighter[]];
  active: [number, number] = [0, 0];
  tagCool: [number, number] = [0, 0];
  /** Quem saiu de campo: pulando pra fora (troca) ou caído (nocaute), só desenho. */
  leaving: { f: Fighter; ko: boolean; t: number }[] = [];
  private koWait: [number, number] = [0, 0];
  /** Cena da metamorfose em andamento: de que lado e em que frame. */
  morphing: { side: 0 | 1; t: number } | null = null;
  private tagBuf: [number, number] = [0, 0];       // o pedido de troca fica guardado uns frames, esperando o lutador ficar livre
  private regenCap = new Map<Fighter, number>();

  constructor(public a: FighterAssets, public b: FighterAssets, public stage: StageAssets, public opts: MatchOptions, private ev: MatchEvents) {
    this.fighters = [new Fighter(a, START_X[0], 1, 0), new Fighter(b, START_X[1], -1, 1)];
    if (opts.hueP2) this.fighters[1].hue = opts.hueP2;
    this.teams = [[this.fighters[0]], [this.fighters[1]]];
    opts.partners?.forEach((p, i) => { if (p) this.teams[i].push(new Fighter(p, START_X[i], i === 0 ? 1 : -1, i)); });
    this.teams.forEach((t, i) => t.forEach((f, k) => { f.owner = opts.owners?.[i]?.[k] ?? ''; }));
    if (opts.cpu) this.ai = new Ai(this.fighters[1], this.fighters[0], opts.cpu, opts.seed);
    this.roundsToWin = opts.roundsToWin ?? (this.tagMode ? 1 : 2);
    if (this.tagMode) this.timer = ROUND_SECONDS * 60 * 1.65;
    this.score[0] = opts.baseScore ?? 0;
  }

  get tagMode() { return this.teams[0].length > 1 || this.teams[1].length > 1; }
  /** Companheiro do lado i que ainda pode entrar (null se não tem ou já caiu). */
  partnerOf(i: number): Fighter | null { const p = this.teams[i][1 - this.active[i]]; return p && p.life > 0 ? p : null; }
  private teamLife(i: number) { return this.teams[i].reduce((s, f) => s + Math.max(0, f.life), 0); }

  /** Troca quem está em campo no lado i: o de fora entra num pulo por trás; o de dentro pula pra fora (ou fica caído). */
  private swap(i: 0 | 1, ko: boolean) {
    const out = this.fighters[i], inc = this.partnerOf(i); if (!inc) return;
    this.active[i] = 1 - this.active[i]; this.tagCool[i] = TAG.COOL; this.koWait[i] = 0;
    inc.facing = out.facing; inc.x = Math.max(ARENA_MIN, Math.min(ARENA_MAX, out.x - out.facing * 230)); inc.y = TAG.ENTER_Y; inc.vx = out.facing * 5.5; inc.vy = 1;
    inc.knockdownAir = false; inc.flash = 10; inc.spawns.length = 0; inc.setState('jumping'); inc.comboTaken = 0;
    if (!ko) { out.setState('jumping'); out.vx = -out.facing * 9; out.vy = -11; out.y = Math.min(out.y, -0.01); this.regenCap.set(out, Math.min(100, out.life + TAG.REGEN_CAP)); }
    this.leaving.push({ f: out, ko, t: 0 });
    this.fighters[i] = inc; this.prevLife[i] = inc.life;
    for (const p of this.projectiles) if (p.owner.playerIndex !== i) p.target = inc;
    if (this.ai) this.ai = new Ai(this.fighters[1], this.fighters[0], this.opts.cpu!, (this.opts.seed ?? 1) + this.phaseFrame);
    this.ev.message(ko ? `${out.def.name} FORA! ENTRA ${inc.def.name}` : `ENTRA ${inc.def.name}!`, 60, 'small');
    audio.sfx('jump'); audio.voice(`ann-${inc.def.id}`, 'ann');
  }

  /** Banco e saídas de campo: quem espera recupera um pouco de vida; quem saiu termina o pulo e some. */
  private updateBench() {
    for (let i = 0; i < 2; i++) {
      if (this.tagCool[i] > 0) this.tagCool[i]--;
      const b = this.teams[i][1 - this.active[i]];
      if (b && b.life > 0 && b.life < (this.regenCap.get(b) ?? b.life)) b.life = Math.min(this.regenCap.get(b)!, b.life + TAG.REGEN);
    }
    for (const l of this.leaving) {
      l.t++; l.f.animTime++;
      if (!l.ko) { l.f.vy += GRAVITY; l.f.y += l.f.vy; l.f.x += l.f.vx; if (l.f.y >= 0) { l.f.y = 0; l.f.vy = 0; } }
    }
    this.leaving = this.leaving.filter((l) => l.t < (l.ko ? 150 : 46));
  }

  /** Pedidos de troca (botão TROCA, ou a CPU quando está apanhando) e entrada do companheiro de quem caiu. */
  private updateTags(ctrls: [Controller, Controller]) {
    for (const i of [0, 1] as const) {
      const f = this.fighters[i], other = this.fighters[1 - i];
      if (f.life <= 0) {                                   // caiu com companheiro de pé: espera encostar no chão e troca
        if (f.knockdownAir || other.victim === f) continue;
        if (this.koWait[i] === 0) { const own = `ko-${f.def.id}`; audio.voice(audio.hasVoice(own) ? own : f.def.gender === 'f' ? 'ko-f' : 'ko-m', f.voiceChannel); }
        if (++this.koWait[i] >= TAG.KO_WAIT) this.swap(i, true);
        continue;
      }
      const cpu = i === 1 && this.ai;
      if (!cpu && ctrls[i].pressed('tag')) this.tagBuf[i] = 18; else if (this.tagBuf[i] > 0) this.tagBuf[i]--;
      if (this.tagCool[i] > 0 || !this.partnerOf(i) || !f.actionable || !f.grounded) continue;
      const want = cpu ? f.life < 35 && this.partnerOf(i)!.life > f.life + 15 && Math.abs(f.x - other.x) > 220 && (this.phaseFrame + i) % 30 === 0 : this.tagBuf[i] > 0;
      if (want) { this.tagBuf[i] = 0; this.swap(i, false); }
    }
  }

  get midX() { return (this.fighters[0].x + this.fighters[1].x) / 2; }
  get seconds() { return Math.ceil(this.timer / 60); }

  /** Reposiciona tudo pro início de um round (a barra de especial fica). */
  startRound() {
    this.fighters.forEach((f, i) => {
      f.x = START_X[i]; f.y = 0; f.vx = 0; f.vy = 0; f.facing = i === 0 ? 1 : -1;
      f.life = 100; f.knockdownAir = false; f.flash = 0; f.spawns.length = 0; f.shield = null;
      f.setState('idle');
    });
    this.projectiles = []; this.zones = [];
    this.timer = ROUND_SECONDS * 60;
    this.prevLife = [100, 100]; this.tally = null; this.koLanded = true;
    this.phase = 'intro'; this.phaseFrame = 0; this.slowmo = 0; this.hitstop = 0; this.roundWinner = -1;
    if (this.round === 2 && !this.tagMode) { const i = this.fighters.findIndex((f) => f.assets.morph); if (i >= 0) this.morphing = { side: i as 0 | 1, t: 0 }; }
  }

  /** Um passo da cena da metamorfose; no fim, o lutador é trocado pelo monstro (vida cheia, a barra de especial continua). */
  private stepMorph() {
    const mo = this.morphing!, f = this.fighters[mo.side], next = f.assets.morph!, t = ++mo.t;
    for (const [at, snd] of MORPH_SOUNDS) if (t === at) audio.voice(snd, 'fx');
    if (t === 20) this.ev.message('ALGO ESTÁ ERRADO COM O MUNDIM…', 120, 'small');
    if (t === 190) this.ev.message('A EXPERIÊNCIA ERA NELE MESMO', 120, 'small');
    if (t === 350) this.ev.message('O BICHO USA ELE DE MARIONETE', 120, 'small');
    if (t > 100 && t % 9 === 0) { this.fx.shake = 8; this.fx.shakeMag = t > 300 ? 6 : 3; }
    if (t > 110 && t % 6 === 0) this.fx.blood(f.x, GROUND_Y - 200, t % 12 ? 1 : -1, 5);
    const step = MORPH.find((m) => t <= m.until);
    if (step) { f.override = { assets: next, frame: step.frame, height: step.h, lift: step.lift ?? 0 }; this.fighters[1 - mo.side].update(nullCtrl, f, false); this.fx.update(); return; }
    const nf = new Fighter(next, f.x, f.facing, mo.side); nf.owner = f.owner; nf.meter = f.meter; nf.hue = f.hue;
    this.fighters[mo.side] = nf; this.teams[mo.side][this.active[mo.side]] = nf; this.prevLife[mo.side] = 100;
    if (this.ai) this.ai = new Ai(this.fighters[1], this.fighters[0], this.opts.cpu!, (this.opts.seed ?? 1) + 77);
    const again = this.fighters.findIndex((x) => x.assets.morph);                     // espelho (Mundim x Mundim): o outro também vira
    this.morphing = again >= 0 ? { side: again as 0 | 1, t: 0 } : null; this.phaseFrame = 0; this.fx.shake = 20; this.fx.shakeMag = 9;
    this.ev.message(next.def.name, 90, 'big');
  }

  update(input: Ports, paused: boolean) {
    if (paused) return;
    if (this.slowmo > 0 && ++this.slowAcc < this.slowmo) { this.fx.update(); return; }
    this.slowAcc = 0;
    this.phaseFrame++;
    this.referee.update(this);
    const [p1, p2] = this.fighters;

    if (this.phase === 'intro') {
      if (this.morphing) { this.stepMorph(); return; }
      if (this.phaseFrame === 1) { this.ev.message(this.tagMode ? 'DUPLAS' : `ROUND ${this.round}`, 70, 'big'); audio.voice(`ann-round-${Math.min(3, this.round)}`, 'ann'); }
      if (this.phaseFrame === 75) { this.ev.message('FIGHT!', 45, 'big'); audio.voice('ann-fight', 'ann'); this.fighters.forEach((f) => (audio.hasVoice(`${f.def.id}-taunt`) ? audio.voice(`${f.def.id}-taunt`, f.voiceChannel) : audio.voiceRandom(`${f.def.id}-laugh`, f.voiceChannel))); }
      if (this.phaseFrame >= 100) { this.phase = 'fight'; this.phaseFrame = 0; }
      this.idleUpdate();
      return;
    }

    if (this.phase === 'fight') {
      const frozen = this.hitstop > 0;
      if (frozen) this.hitstop--;
      const c1: Controller = input.ports[0];
      let c2: Controller = input.ports[1];
      if (this.ai) { this.ai.update(this.projectiles, true); c2 = this.ai.ctrl; }
      p1.update(c1, p2, frozen);
      p2.update(c2, p1, frozen);
      separate(p1, p2);
      if (!frozen) {
        if (this.tagMode) { this.updateBench(); this.updateTags([c1, c2]); }
        this.drainSpawns();
        this.projectiles.forEach((p) => p.update());
        this.projectiles = this.projectiles.filter((p) => !p.dead);
        this.zones.forEach((z) => z.update());
        this.zones = this.zones.filter((z) => !z.dead);
        const r = resolveHits(this.fighters, this.projectiles, this.zones, this.fx);
        if (r.hitstop) this.hitstop = r.hitstop;
        if (!this.training) {
          this.timer = Math.max(0, this.timer - 1);
          if (this.timer % 60 === 0 && this.seconds <= 10 && this.timer > 0) audio.sfx('tick');
        } else { p1.life = Math.max(p1.life, 50); p1.meter = 100; p2.life = Math.max(p2.life, 50); }
      }
      this.fx.update();

      this.fighters.forEach((f, i) => { const d = this.prevLife[i] - f.life; if (d > 0) this.score[1 - i] += Math.round(d * 10); this.prevLife[i] = f.life; });   // 10 pontos por ponto de dano
      const dead = this.fighters.findIndex((f, i) => f.life <= 0 && !this.partnerOf(i));   // nas duplas, só acaba quando cai o último
      if (dead >= 0) {
        this.roundWinner = dead === 0 ? 1 : 0;
        this.phase = 'ko'; this.phaseFrame = 0; this.slowmo = 4; this.koLanded = false;   // último golpe em câmera lenta
        const ko = this.fighters[dead], own = `ko-${ko.def.id}`;                          // o grito é de quem levou o golpe final
        audio.voice(audio.hasVoice(own) ? own : ko.def.gender === 'f' ? 'ko-f' : 'ko-m', ko.voiceChannel);
      } else if (this.timer <= 0) {
        const l1 = this.teamLife(0), l2 = this.teamLife(1);
        this.roundWinner = l1 === l2 ? -1 : l1 > l2 ? 0 : 1;
        this.phase = 'ko'; this.phaseFrame = 0;
        this.ev.message('TIME OVER', 90, 'big');
        audio.voice('ann-time', 'ann');
        for (const f of this.fighters) if (f.state !== 'ko') { f.setState('idle'); f.y = 0; }
      }
      return;
    }

    if (this.phase === 'ko') {
      p1.update(nullCtrl, p2, false); p2.update(nullCtrl, p1, false);
      if (this.tagMode) this.updateBench();
      this.drainSpawns();
      this.projectiles.forEach((p) => p.update());
      this.projectiles = this.projectiles.filter((p) => !p.dead);
      this.zones.forEach((z) => z.update());
      this.zones = this.zones.filter((z) => !z.dead);
      this.fx.update();
      const loser = this.roundWinner >= 0 ? this.fighters[1 - (this.roundWinner as 0 | 1)] : null;
      if (!this.koLanded && (!loser || !loser.knockdownAir || this.phaseFrame > 90)) {   // bateu no chão: volta a velocidade normal
        this.koLanded = true; this.slowmo = 0; this.phaseFrame = Math.min(this.phaseFrame, 20);
        this.ev.message('K.O.', 100, 'big'); audio.sfx('ko'); audio.voice('ann-ko', 'ann'); this.fx.shake = 14; this.fx.shakeMag = 8;
      }
      if (this.phaseFrame > 70) {
        this.phase = 'over'; this.phaseFrame = 0;
        if (this.roundWinner >= 0) {
          const rw = this.roundWinner as 0 | 1;
          const w = this.fighters[rw];
          if (w.state !== 'ko') w.setState('win');
          this.wins[rw]++;
          const items: [string, number][] = [['VITÓRIA', 1000], ['VIDA', Math.round(w.life) * 30], ['TEMPO', this.training ? 0 : this.seconds * 50]];
          if (w.life >= 100) items.push(['PERFECT', 5000]);
          const total = items.reduce((s, [, v]) => s + v, 0);
          this.score[rw] += total; this.tally = { who: rw, items, total };
          if (audio.hasVoice(`${w.def.id}-win`)) audio.voice(`${w.def.id}-win`, w.voiceChannel); else audio.voiceRandom(`${w.def.id}-down`, w.voiceChannel);
        } else {
          this.wins[0]++; this.wins[1]++; // empate: os dois levam o round
        }
      }
      return;
    }

    // over: pose de vitória, depois próximo round ou fim da luta
    p1.update(nullCtrl, p2, false); p2.update(nullCtrl, p1, false);
    this.fx.update();
    const matchOver = this.wins[0] >= this.roundsToWin || this.wins[1] >= this.roundsToWin;
    if (matchOver && this.phaseFrame === 40 && this.roundWinner >= 0 && this.fighters[this.roundWinner as 0 | 1].life >= 100) {
      this.ev.message('PERFECT', 60, 'big'); audio.voice('ann-perfect', 'ann');
    }
    if (this.phaseFrame > 130) {
      if (matchOver) {
        if (this.endSent) return;
        this.endSent = true;
        this.winner = this.wins[0] >= this.roundsToWin && this.wins[1] >= this.roundsToWin ? -1 : this.wins[0] >= this.roundsToWin ? 0 : 1;
        const perfect = this.winner >= 0 && this.fighters[this.winner as 0 | 1].life >= 100;
        this.ev.end(this.winner, perfect);
      } else {
        this.round++;
        this.startRound();
      }
    }
  }

  /** Cria projéteis/zonas pedidos pelos lutadores neste frame. */
  private drainSpawns() {
    for (const f of this.fighters) {
      for (const sp of f.spawns) {
        if (sp.kind === 'projectile') { const pr = new Projectile(f, sp.move); pr.target = this.fighters[1 - f.playerIndex]; this.projectiles.push(pr); audio.sfx('projectile'); }
        else if (sp.kind === 'beam') audio.sfx('projectile');
        else if (sp.kind === 'fx') { this.fx.hit(sp.x, sp.y ?? GROUND_Y - 80, f.def.colors.primary, true); audio.sfx('hitBig'); continue; }
        else { this.zones.push(new Zone(f, sp.move, sp.x)); audio.sfx(sp.move.kind === 'dive' ? 'explosion' : 'portal'); }
        if (sp.move.name) this.ev.message(sp.move.name, 45, 'small');
      }
      f.spawns.length = 0;
    }
  }

  /** Lutadores parados respirando (intro / telas de menu). */
  idleUpdate() {
    const [p1, p2] = this.fighters;
    p1.update(nullCtrl, p2, false); p2.update(nullCtrl, p1, false);
    this.fx.update();
  }

  render(ctx: CanvasRenderingContext2D, debug: boolean) {
    const [ox, oy] = this.fx.offset;
    ctx.save();
    ctx.translate(ox, oy);
    drawStage(ctx, this.stage, this.midX);
    this.referee.draw(ctx);                       // atrás dos lutadores
    for (const l of this.leaving) { ctx.save(); ctx.globalAlpha = l.ko ? Math.max(0, Math.min(1, (150 - l.t) / 40)) : Math.max(0, 1 - l.t / 46); l.f.draw(ctx, false); ctx.restore(); }
    const [f0, f1] = this.fighters;
    const throwing = (f: Fighter) => f.state === 'attacking' && f.move?.kind === 'throw' && (f.sub === 'hold' || f.sub === 'lift' || f.sub === 'throw');
    // quem agarra fica na frente pra os braços envolverem a vítima; se o agarrador é bem maior (o monstro), a vítima é que
    // vai na frente, senão ela some atrás do corpo dele
    const big = (a: Fighter, b: Fighter) => a.scale > b.scale * 1.25;
    const order = throwing(f0) ? (big(f0, f1) ? [0, 1] : [1, 0]) : throwing(f1) ? (big(f1, f0) ? [1, 0] : [0, 1])
      : f0.state === 'hitstun' || f0.state === 'knockdown' || (f0.state === 'attacking' && f0.sub === 'dive') ? [1, 0] : [0, 1];
    for (const i of order) this.fighters[i].draw(ctx, debug);
    this.projectiles.forEach((p) => p.draw(ctx, debug));
    this.zones.forEach((z) => z.draw(ctx, debug));
    this.fx.draw(ctx);
    if (debug) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.moveTo(ARENA_MIN, GROUND_Y - 300); ctx.lineTo(ARENA_MIN, GROUND_Y);
      ctx.moveTo(ARENA_MAX, GROUND_Y - 300); ctx.lineTo(ARENA_MAX, GROUND_Y); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`round ${this.round} ${this.wins.join('-')}  fase ${this.phase}  hitstop ${this.hitstop}  IA: ${this.ai?.debug ?? '-'}  proj ${this.projectiles.length} zonas ${this.zones.length}`, 8, H - 8);
    }
    ctx.restore();
  }
}

const nullCtrl: Controller = { held: () => false, pressed: () => false };
