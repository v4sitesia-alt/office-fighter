// Luta online por lockstep. A simulação é determinística (passo fixo), então os dois lados só trocam os botões de
// cada frame: o frame F só roda quando os botões dos DOIS jogadores pra F chegaram. Cada jogador agenda os próprios
// botões `delay` frames à frente, e esse atraso esconde a latência da rede.
//
// Robustez:
//  - todo frame recebe botão (sem buracos, mesmo quando um lado dá dois passos num tick pra alcançar o outro);
//  - cada mensagem leva TODOS os frames que o outro ainda não confirmou (`a` = maior frame contíguo recebido), então
//    mensagem perdida é reenviada sozinha;
//  - o atraso se ajusta à latência medida (ping) e às travadas;
//  - a cada 60 frames os dois comparam um resumo do estado (`sum`) pra detectar dessincronização.
//
// Plateia: fica numa sala separada (watch-<id>) e recebe do jogador 1 os botões já simulados em lotes de 0,5 s.
// Assim cada espectador custa ~2 mensagens por segundo, e não as ~30 da sala dos jogadores.
import { BUTTONS, type Button, type Controller } from '../core/input';
import type { Match } from '../game/match';
import type { Msg, Room } from './transport';

export const NET = {
  SEND_EVERY: 4,        // ticks entre mensagens (15/s)
  MIN_GAP: 2,           // botão mudou: manda antes, mas não mais que a cada 2 ticks
  HELLO_EVERY: 12,
  PING_EVERY: 45,
  DELAY0: 8, DELAY_MIN: 4, DELAY_MAX: 15,
  LOST_MS: 20000,       // sem notícia do outro por 20 s = caiu
  FEED_EVERY: 30,       // plateia: lote a cada 0,5 s
};
const NET_BUTTONS: Button[] = BUTTONS.filter((b) => b !== 'start' && b !== 'pause');

export function maskOf(c: Controller): number {
  let m = 0;
  NET_BUTTONS.forEach((b, i) => { if (c.held(b)) m |= 1 << i; });
  return m;
}

/** Codificação por repetição: [valor, vezes]. Botões mudam pouco de um frame pro outro. */
export type Runs = [number, number][];
export function rle(vals: number[]): Runs {
  const out: Runs = [];
  for (const v of vals) { const last = out[out.length - 1]; if (last && last[0] === v) last[1]++; else out.push([v, 1]); }
  return out;
}
function* unrle(runs: Runs) { for (const [v, n] of runs) for (let k = 0; k < n; k++) yield v; }

/** Resumo do estado da luta (pra comparar os dois lados). */
export function hashMatch(m: Match): number {
  let h = 2166136261;
  const mix = (n: number) => { h ^= n | 0; h = Math.imul(h, 16777619); };
  for (const f of m.fighters) { mix(Math.round(f.x * 100)); mix(Math.round(f.y * 100)); mix(Math.round(f.life * 100)); mix(Math.round(f.meter * 100)); mix(f.stateFrame); mix(f.facing); for (const c of f.state) mix(c.charCodeAt(0)); }
  mix(m.timer); mix(m.round); mix(m.wins[0]); mix(m.wins[1]); mix(m.projectiles.length); mix(m.phaseFrame);
  return h >>> 0;
}

class MaskCtrl implements Controller {
  cur = 0; prev = 0;
  set(m: number) { this.prev = this.cur; this.cur = m; }
  held(b: Button) { const i = NET_BUTTONS.indexOf(b); return i >= 0 && !!(this.cur & (1 << i)); }
  pressed(b: Button) { const i = NET_BUTTONS.indexOf(b); return i >= 0 && !!(this.cur & (1 << i)) && !(this.prev & (1 << i)); }
}

export class NetSession {
  frame = 0;
  delay = NET.DELAY0;
  connected = false; lost = false; desync = false;
  quitBy: 0 | 1 | null = null;
  stalled = 0;                      // ticks seguidos sem avançar
  rtt = 0;
  readonly born = Date.now();
  onConnect?: () => void;
  onDesync?: (frame: number) => void;

  private otherDelay = NET.DELAY0;
  private inputs: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  private ctrls: [MaskCtrl, MaskCtrl] = [new MaskCtrl(), new MaskCtrl()];
  private lastOwn = -1;             // último frame com botão próprio agendado
  private ownFloor = 0;             // botões próprios abaixo disso já foram confirmados e apagados
  private recvUpTo = -1;            // maior frame contíguo recebido do outro
  private remoteAck = -1;           // maior frame meu que o outro confirmou
  private ticks = 0; private lastSend = -99; private lastMask = -1;
  private lastHeard = Date.now();
  private stallWindow = 0; private stallTicks = 0;
  private mySums = new Map<number, number>(); private theirSums = new Map<number, number>();
  private log: number[] = [];       // (jogador 1) botões já simulados, pra plateia
  private fed = 0;

  /** local = 0 ou 1. watch = sala da plateia (só o jogador 0 alimenta). */
  constructor(public match: Match, public room: Room, public local: 0 | 1, private watch: Room | null = null) {}

  private get other() { return (1 - this.local) as 0 | 1; }

  onMsg(m: Msg) {
    if (m.p === this.local) return;
    this.lastHeard = Date.now();
    if (!this.connected && (m.t === 'hello' || m.t === 'in')) { this.connected = true; this.onConnect?.(); }
    switch (m.t) {
      case 'hello':
        if (typeof m.a === 'number') this.remoteAck = Math.max(this.remoteAck, m.a);
        break;
      case 'in': {
        const inp = this.inputs[this.other]; let f = m.f as number;
        for (const v of unrle(m.r as Runs)) { if (f > this.recvUpTo && !inp.has(f)) inp.set(f, v); f++; }
        while (inp.has(this.recvUpTo + 1)) this.recvUpTo++;
        if (typeof m.a === 'number') this.remoteAck = Math.max(this.remoteAck, m.a);
        if (typeof m.d === 'number') this.otherDelay = m.d;
        break;
      }
      case 'ping': this.room.send({ t: 'pong', p: this.local, ts: m.ts }); break;
      case 'pong': { const r = Date.now() - (m.ts as number); this.rtt = this.rtt ? this.rtt * 0.7 + r * 0.3 : r; break; }
      case 'sum': this.theirSums.set(m.f as number, m.h as number); this.checkSum(m.f as number); break;
      case 'quit': this.quitBy = m.p as 0 | 1; break;
    }
  }

  /** Mensagens da sala da plateia (o jogador 0 responde quem chega atrasado). */
  onWatchMsg(m: Msg) {
    if (m.t !== 'sync?' || this.local !== 0) return;
    const f = Math.max(0, Math.min(Number(m.f) || 0, this.log.length));      // o espectador pede a partir de onde parou
    this.watch?.send({ t: 'log', f, r: rle(this.log.slice(f)) });
  }

  /** Chamado a 60 Hz com os botões apertados agora. */
  tick(mask: number) {
    this.ticks++;
    // 1) agenda o botão próprio pra todos os frames até frame + delay (nunca deixa buraco)
    const own = this.inputs[this.local], target = this.frame + this.delay;
    for (let f = this.lastOwn + 1; f <= target; f++) own.set(f, mask);
    if (target > this.lastOwn) this.lastOwn = target;
    // 2) manda o que o outro ainda não confirmou
    const since = this.ticks - this.lastSend;
    if (since >= NET.SEND_EVERY || (mask !== this.lastMask && since >= NET.MIN_GAP)) this.sendInputs();
    this.lastMask = mask;
    if (!this.connected && this.ticks % NET.HELLO_EVERY === 1) this.room.send({ t: 'hello', p: this.local, a: this.recvUpTo, d: this.delay });
    if (this.connected && this.ticks % NET.PING_EVERY === 0) this.room.send({ t: 'ping', p: this.local, ts: Date.now() });
    // 3) simula o que já dá (até 2 passos se o outro estiver à frente)
    let steps = 0;
    if (this.connected) {
      while (steps < 2 && this.inputs[0].has(this.frame) && this.inputs[1].has(this.frame)) {
        this.step(); steps++;
        if (this.recvUpTo - this.frame <= this.otherDelay + 1) break;   // em dia: um passo por tick
      }
    }
    this.stalled = steps ? 0 : this.stalled + 1;
    if (this.connected && !steps) this.stallTicks++;
    if (++this.stallWindow >= 60) this.retune();
    // 4) libera o que o outro já confirmou; alimenta a plateia; vê se caiu
    const done = Math.min(this.remoteAck, this.frame - 1);
    while (this.ownFloor <= done) own.delete(this.ownFloor++);
    if (this.local === 0 && this.watch && this.ticks % NET.FEED_EVERY === 0) this.flushFeed();
    if (Date.now() - this.lastHeard > NET.LOST_MS) this.lost = true;
  }

  /** Manda pra plateia os frames simulados desde o último lote. */
  flushFeed() {
    if (!this.watch || this.log.length <= this.fed) return;
    this.watch.send({ t: 'feed', f: this.fed, r: rle(this.log.slice(this.fed)) });
    this.fed = this.log.length;
  }

  quit() { this.room.send({ t: 'quit', p: this.local }); }

  private step() {
    const a = this.inputs[0].get(this.frame)!, b = this.inputs[1].get(this.frame)!;
    this.ctrls[0].set(a); this.ctrls[1].set(b);
    this.match.update({ ports: this.ctrls }, false);
    if (this.local === 0 && this.watch) this.log.push(a * 512 + b);
    this.inputs[this.other].delete(this.frame);
    this.frame++;
    if (this.frame % 60 === 0) {
      const h = hashMatch(this.match); this.mySums.set(this.frame, h);
      this.room.send({ t: 'sum', p: this.local, f: this.frame, h });
      this.checkSum(this.frame);
    }
  }

  private sendInputs() {
    const from = Math.max(this.remoteAck + 1, this.ownFloor), to = Math.min(this.lastOwn, from + 300), vals: number[] = [];
    for (let f = from; f <= to; f++) vals.push(this.inputs[this.local].get(f) ?? 0);
    this.room.send({ t: 'in', p: this.local, f: from, r: rle(vals), a: this.recvUpTo, d: this.delay });
    this.lastSend = this.ticks;
  }

  /** Ajusta o atraso: mira na latência medida e sobe 1 frame se travou muito no último segundo. */
  private retune() {
    const want = this.rtt ? Math.ceil((this.rtt / 2 + (NET.SEND_EVERY - 1) * 16.7) / 16.7) + 2 : NET.DELAY0;
    if (this.stallTicks > 4) this.delay = Math.min(NET.DELAY_MAX, this.delay + 1);
    else if (this.stallTicks === 0 && this.delay > want) this.delay--;
    else if (this.delay < want) this.delay++;
    this.delay = Math.max(NET.DELAY_MIN, Math.min(NET.DELAY_MAX, this.delay));
    this.stallTicks = 0; this.stallWindow = 0;
  }

  private checkSum(f: number) {
    const a = this.mySums.get(f), b = this.theirSums.get(f);
    if (a === undefined || b === undefined) return;
    this.mySums.delete(f); this.theirSums.delete(f);
    if (a !== b && !this.desync) { this.desync = true; console.warn('[net] estados diferentes no frame', f); this.onDesync?.(f); }
  }
}

/** Plateia: toca a luta a partir dos lotes do jogador 1, uns 40 frames atrás pra ficar suave.
 *  Lote perdido: percebe o buraco (ou ficou parado) e pede de novo a partir do frame que falta. */
export class WatchSession {
  frame = 0; lost = false; synced = false; playing = false;
  private pairs = new Map<number, number>(); private known = -1; private maxSeen = -1;
  private ctrls: [MaskCtrl, MaskCtrl] = [new MaskCtrl(), new MaskCtrl()];
  private ticks = 0; private lastHeard = Date.now(); private idle = 0; private lastAsk = 0;

  constructor(public match: Match, public room: Room) { room.send({ t: 'sync?', f: 0 }); }

  onMsg(m: Msg) {
    if (m.t !== 'feed' && m.t !== 'log') return;
    this.lastHeard = Date.now();
    let f = m.f as number;
    for (const v of unrle(m.r as Runs)) { if (f >= this.frame && !this.pairs.has(f)) this.pairs.set(f, v); if (f > this.maxSeen) this.maxSeen = f; f++; }
    while (this.pairs.has(this.known + 1)) this.known++;
    if (m.t === 'log') this.synced = true;
  }

  tick() {
    this.ticks++;
    const buffered = this.known - this.frame + 1;
    const hole = this.maxSeen > this.known + 1;                                // chegou lote depois de um que se perdeu
    this.idle = buffered <= 0 ? this.idle + 1 : 0;
    if ((!this.synced || hole || this.idle > 90) && this.ticks - this.lastAsk > 120) { this.lastAsk = this.ticks; this.room.send({ t: 'sync?', f: this.known + 1 }); }
    if (!this.playing && buffered >= 40) this.playing = true;
    if (this.playing) {
      const steps = buffered > 300 ? 10 : buffered > 90 ? 2 : buffered > 0 ? 1 : 0;   // chegou atrasado: acelera até alcançar
      for (let i = 0; i < steps; i++) {
        const v = this.pairs.get(this.frame)!; this.pairs.delete(this.frame);
        this.ctrls[0].set(Math.floor(v / 512)); this.ctrls[1].set(v % 512);
        this.match.update({ ports: this.ctrls }, false);
        this.frame++;
      }
    }
    if (Date.now() - this.lastHeard > NET.LOST_MS) this.lost = true;
  }
}
