// Luta online por lockstep: a simulação é determinística (passo fixo), então os dois lados só trocam os botões
// de cada frame. O frame F só roda quando os botões dos DOIS jogadores pra F chegaram; o atraso de entrada
// (DELAY) esconde a latência. Espectadores recebem os mesmos botões e simulam a mesma luta.
import { BUTTONS, type Button, type Controller } from '../core/input';
import type { Match } from '../game/match';
import type { Msg, Room } from './transport';

export const DELAY = 10;           // frames entre apertar e o golpe sair (~166 ms)
const SEND_EVERY = 2, REDUNDANCY = 14, TIMEOUT_MS = 12000;
const NET_BUTTONS: Button[] = BUTTONS.filter((b) => b !== 'start' && b !== 'pause');

export function maskOf(c: Controller): number {
  let m = 0;
  NET_BUTTONS.forEach((b, i) => { if (c.held(b)) m |= 1 << i; });
  return m;
}

class MaskCtrl implements Controller {
  cur = 0; prev = 0;
  set(m: number) { this.prev = this.cur; this.cur = m; }
  held(b: Button) { const i = NET_BUTTONS.indexOf(b); return i >= 0 && !!(this.cur & (1 << i)); }
  pressed(b: Button) { const i = NET_BUTTONS.indexOf(b); return i >= 0 && !!(this.cur & (1 << i)) && !(this.prev & (1 << i)); }
}

export class NetSession {
  frame = 0;
  private inputs: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  private ctrls: [MaskCtrl, MaskCtrl] = [new MaskCtrl(), new MaskCtrl()];
  private ticks = 0; private lastHeard = Date.now();
  private started = false; private synced: boolean;
  stalled = false; lost = false;

  /** local = 0/1 pra quem joga, -1 pra espectador */
  constructor(public match: Match, public room: Room, public local: 0 | 1 | -1) {
    for (let f = 0; f < DELAY; f++) { this.inputs[0].set(f, 0); this.inputs[1].set(f, 0); }
    this.synced = local >= 0;
    if (local < 0) room.send({ t: 'sync?' });
  }

  onMsg(m: Msg) {
    this.lastHeard = Date.now();
    if (m.t === 'hello') { this.started = true; return; }
    if (m.t === 'in') {
      const p = m.p as 0 | 1, f0 = m.f as number, b = m.b as number[];
      b.forEach((mask, i) => { if (!this.inputs[p].has(f0 + i)) this.inputs[p].set(f0 + i, mask); });
      this.started = true; return;
    }
    if (m.t === 'sync?' && this.local === 0) {   // espectador chegou: manda tudo que já foi jogado
      const log: number[][] = [];
      for (let f = 0; f < this.frame; f++) log.push([this.inputs[0].get(f) ?? 0, this.inputs[1].get(f) ?? 0]);
      this.room.send({ t: 'sync', log }); return;
    }
    if (m.t === 'sync' && this.local < 0 && !this.synced) {
      (m.log as number[][]).forEach(([a, b], f) => { this.inputs[0].set(f, a); this.inputs[1].set(f, b); });
      this.synced = true;
    }
  }

  /** Chamado a 60 Hz. localMask = botões apertados agora (ignorado pra espectador). */
  tick(localMask: number) {
    this.ticks++;
    if (this.local >= 0) {
      if (!this.started) { if (this.ticks % 20 === 1) this.room.send({ t: 'hello' }); }
      const target = this.frame + DELAY;
      const mine = this.inputs[this.local as 0 | 1];
      if (!mine.has(target) && target - this.frame <= DELAY) mine.set(target, localMask);
      if (this.ticks % SEND_EVERY === 0) {
        const last = Math.max(...mine.keys()), f0 = Math.max(0, last - REDUNDANCY + 1), b: number[] = [];
        for (let f = f0; f <= last; f++) b.push(mine.get(f) ?? 0);
        this.room.send({ t: 'in', p: this.local, f: f0, b });
      }
    }
    if (!this.synced) { this.stalled = true; return; }
    // espectador (ou quem ficou pra trás) acelera pra alcançar
    let steps = 0; const max = this.local < 0 ? 40 : 3;
    while (steps < max && this.inputs[0].has(this.frame) && this.inputs[1].has(this.frame)) {
      if (this.local >= 0 && !this.started) break;
      this.ctrls[0].set(this.inputs[0].get(this.frame)!); this.ctrls[1].set(this.inputs[1].get(this.frame)!);
      this.match.update({ ports: this.ctrls }, false);
      this.frame++; steps++;
      const behind = Math.max(...this.inputs[this.local < 0 ? 0 : 1 - this.local].keys()) - this.frame;
      if (behind < DELAY + 2) break;    // em dia: um passo por tick
    }
    this.stalled = steps === 0;
    if (!this.stalled) this.lastHeard = Date.now();
    if (Date.now() - this.lastHeard > TIMEOUT_MS) this.lost = true;
  }
}
