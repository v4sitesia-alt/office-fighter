// Convites da arena (sem DOM, pra dar pra testar fora do navegador).
//
//   quem convida                         quem é convidado
//   challenge ─────────────────────────▶ aparece o aviso com contagem (30 s)
//             ◀───────────────────────── accept  (repetido a cada 0,7 s até a luta conectar)
//   entra na luta (local 0)              já entrou na luta (local 1)
//
// Os dois lados expiram o convite no mesmo prazo. Aceite atrasado ainda vale se quem convidou estiver livre;
// se não estiver, ele responde `gone` e quem aceitou volta pra sala com o aviso, em vez de ficar numa tela parada.
import type { Msg, Peer, Room } from './transport';

export const INVITE_TTL = 30000;       // convite manual
export const AUTO_TTL = 6000;          // JOGAR AGORA
const ACCEPT_RETRY_MS = 700, ACCEPT_GIVEUP_MS = 15000, LATE_ACCEPT_MS = 60000;

export interface Outgoing { to: Peer; matchId: string; at: number; ttl: number; auto: boolean }
export interface Incoming { from: Peer; matchId: string; at: number; ttl: number }
export interface InviteHooks {
  start(matchId: string, other: Peer, local: 0 | 1): void;   // entra na luta
  abort(matchId: string, why: string): void;                  // a luta que eu aceitei não vai acontecer
  note(text: string): void;                                   // aviso na sala
  ring(): void;                                               // chegou um desafio
  change(): void;                                             // redesenha
}

export class Invites {
  out: Outgoing | null = null;
  inc: Incoming | null = null;
  private acceptRetry: { to: string; matchId: string; since: number; last: number } | null = null;
  private started = new Set<string>();
  private expired = new Map<string, number>();
  private timer: ReturnType<typeof setInterval>;

  constructor(private room: () => Room | null, private me: () => Peer, private busy: () => boolean, private h: InviteHooks, private ttls = { invite: INVITE_TTL, auto: AUTO_TTL }) {
    this.timer = setInterval(() => this.tick(), 250);
  }
  dispose() { clearInterval(this.timer); }
  private send(m: Msg) { this.room()?.send(m); }
  static left(x: { at: number; ttl: number }) { return Math.max(0, Math.ceil((x.at + x.ttl - Date.now()) / 1000)); }

  /** Desafia alguém. auto = pareamento do JOGAR AGORA (avisos silenciosos, prazo curto). */
  challenge(to: Peer, auto = false): boolean {
    if (this.out || this.busy()) return false;
    const ttl = auto ? this.ttls.auto : this.ttls.invite, matchId = `${this.me().id}-${Date.now().toString(36)}`;
    this.out = { to, matchId, at: Date.now(), ttl, auto };
    this.send({ t: 'challenge', to: to.id, from: this.me(), matchId, auto, ttl });
    this.h.change();
    return true;
  }
  /** Quem convidou desistiu (botão CANCELAR). */
  cancel() {
    const o = this.out; if (!o) return;
    this.out = null;
    this.send({ t: 'cancel', to: o.to.id, matchId: o.matchId });
    this.h.change();
  }
  accept() {
    const inc = this.inc; if (!inc) return;
    this.inc = null;
    if (this.out) this.cancel();                           // tinha convidado outra pessoa: desiste desse
    this.started.add(inc.matchId);
    const now = Date.now();
    this.acceptRetry = { to: inc.from.id, matchId: inc.matchId, since: now, last: now };
    this.send({ t: 'accept', to: inc.from.id, from: this.me(), matchId: inc.matchId });
    this.h.change();
    this.h.start(inc.matchId, inc.from, 1);
  }
  decline() {
    const inc = this.inc; if (!inc) return;
    this.inc = null;
    this.send({ t: 'decline', to: inc.from.id, matchId: inc.matchId, why: 'recusou' });
    this.h.change();
  }
  /** A luta conectou (ouvi o outro na sala da luta): para de reenviar o aceite. */
  connected(matchId: string) { if (this.acceptRetry?.matchId === matchId) this.acceptRetry = null; }

  private tick() {
    const now = Date.now();
    if (this.out && now - this.out.at > this.out.ttl) {
      const o = this.out; this.out = null; this.expired.set(o.matchId, now);
      this.send({ t: 'cancel', to: o.to.id, matchId: o.matchId, why: 'expirou' });
      if (!o.auto) this.h.note(`${o.to.name} não respondeu ao desafio`);
      this.h.change();
    }
    if (this.inc && now - this.inc.at > this.inc.ttl) { this.inc = null; this.h.change(); }
    const r = this.acceptRetry;
    if (r) {
      if (now - r.since > ACCEPT_GIVEUP_MS) this.acceptRetry = null;
      else if (now - r.last >= ACCEPT_RETRY_MS) { r.last = now; this.send({ t: 'accept', to: r.to, from: this.me(), matchId: r.matchId }); }
    }
    for (const [id, at] of this.expired) if (now - at > LATE_ACCEPT_MS) this.expired.delete(id);
  }

  /** Trata mensagens de convite. Devolve false se a mensagem não era pra este módulo. */
  onMsg(m: Msg): boolean {
    if (m.to !== this.me().id) return false;
    const from = m.from as Peer | undefined, id = m.matchId as string;
    switch (m.t) {
      case 'challenge': {
        if (!from || this.started.has(id)) return true;
        // os dois se desafiaram ao mesmo tempo: o de id maior aceita o do outro, o de id menor espera o aceite
        if (this.out && this.out.to.id === from.id) {
          if (this.me().id > from.id) { this.out = null; this.inc = { from, matchId: id, at: Date.now(), ttl: this.ttls.invite }; this.accept(); }
          return true;
        }
        if (this.busy() || this.inc || this.out) { this.send({ t: 'decline', to: from.id, matchId: id, why: 'ocupado' }); return true; }
        this.inc = { from, matchId: id, at: Date.now(), ttl: Number(m.ttl) || this.ttls.invite };
        if (this.me().status === 'procurando') { this.accept(); return true; }   // apertou JOGAR AGORA: topa qualquer um
        this.h.ring(); this.h.change();
        return true;
      }
      case 'cancel': {
        if (this.inc?.matchId === id) {
          this.h.note(`${this.inc.from.name} ${m.why === 'expirou' ? 'desistiu de esperar' : 'cancelou o desafio'}`);
          this.inc = null; this.h.change();
        }
        return true;
      }
      case 'decline': {
        if (this.out?.matchId === id) {
          const o = this.out; this.out = null;
          if (!o.auto) this.h.note(m.why === 'ocupado' ? `${o.to.name} está ocupado agora` : `${o.to.name} recusou o desafio`);
          this.h.change();
        }
        return true;
      }
      case 'accept': {
        if (!from || this.started.has(id)) return true;                   // aceite repetido
        const mine = this.out?.matchId === id || this.expired.has(id);
        if (!mine || this.busy()) { this.send({ t: 'gone', to: from.id, matchId: id }); return true; }
        this.out = null; this.expired.delete(id); this.started.add(id);
        this.h.change();
        this.h.start(id, from, 0);
        return true;
      }
      case 'gone': {
        if (this.acceptRetry?.matchId === id) this.acceptRetry = null;
        this.h.abort(id, 'Esse desafio já tinha expirado.');
        return true;
      }
    }
    return false;
  }
}
