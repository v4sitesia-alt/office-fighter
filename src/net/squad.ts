// Mesa de duplas (2x2): quem senta, confirmação ("partida encontrada"), escolha simultânea de lutadores e de cenário.
// Sem DOM (testável no Node). O ANFITRIÃO manda: os outros pedem (sentar, trocar de lado, confirmar, travar um lutador)
// e ele responde com o estado inteiro da mesa. A rede pode perder mensagem, então:
//  - o anfitrião repete o estado a cada segundo;
//  - cada pessoa guarda o que QUER (lado, confirmação, lutador travado) e repete o pedido até o estado refletir;
//  - quem fica 7 s sem dar sinal sai da mesa; se for o anfitrião, a mesa fecha.
// Um lado com uma pessoa só: ela escolhe e controla os dois lutadores da dupla.
import type { Msg, Room, RoomHandlers } from './transport';

export type SquadPhase = 'mesa' | 'confirma' | 'draft' | 'vai' | 'luta';
export interface SquadMember { id: string; name: string; fighter: string; team: 0 | 1; ok: boolean }
export interface SquadSeat { owner: string; team: 0 | 1; fighter: string | null; hover: string | null; locked: boolean }
export interface SquadState {
  host: string; rev: number; phase: SquadPhase; members: SquadMember[]; seats: SquadSeat[];
  stage: string;                  // 'random' até o anfitrião escolher; em 'vai' já vem o cenário sorteado
  left: number;                   // ms até o fim da fase (relógios diferentes: cada um conta a partir de quando recebeu)
  matchId: string; note: string;
}
export interface SquadHooks {
  change(): void;
  /** Todos travaram: começa a luta. */
  start(s: SquadState): void;
  closed(why: string): void;
}
export const SQUAD = { CONFIRM_MS: 12000, DRAFT_MS: 45000, GO_MS: 3200, SILENT_MS: 7000, BEAT_MS: 1000, RETRY_MS: 500 };

type Me = { id: string; name: string; fighter: string };

export class Squad {
  state: SquadState | null = null;
  until = 0;                                   // relógio local do fim da fase
  private room: Room;
  private want: { team?: 0 | 1; ok?: boolean; lock: Map<number, string> } = { lock: new Map() };
  private seen = new Map<string, number>();    // anfitrião: último sinal de cada pessoa
  private lastState = Date.now(); private lastBeat = 0; private lastTry = 0; private started = '';
  private closedFlag = false;
  readonly born = Date.now();

  constructor(public hostId: string, private me: () => Me, join: (name: string, h: RoomHandlers) => Room, private hooks: SquadHooks,
    private fighters: () => string[], private stages: () => string[]) {
    this.room = join(`duo-${hostId}`, { onMsg: (m) => this.onMsg(m) });
    if (this.isHost) {
      const m = me();
      this.state = { host: hostId, rev: 1, phase: 'mesa', members: [{ id: m.id, name: m.name, fighter: m.fighter, team: 0, ok: false }], seats: [], stage: 'random', left: 0, matchId: '', note: '' };
    } else this.want.team = undefined;
  }

  get isHost() { return this.hostId === this.me().id; }
  get mine() { return this.state?.members.find((m) => m.id === this.me().id) ?? null; }
  /** Minha vez no draft: o primeiro lugar meu ainda sem lutador travado (-1 = já travei tudo). */
  get mySeat() { return this.state ? this.state.seats.findIndex((s) => s.owner === this.me().id && !s.locked) : -1; }
  get leftMs() { return Math.max(0, this.until - Date.now()); }
  taken(f: string) { return !!this.state?.seats.some((s) => s.locked && s.fighter === f); }

  // ---------- ações de quem está na mesa
  setTeam(t: 0 | 1) { if (this.isHost) this.apply({ t: 'sq-team', id: this.me().id, team: t }); else { this.want.team = t; this.retry(true); } }
  confirm() { if (this.isHost) this.apply({ t: 'sq-ok', id: this.me().id }); else { this.want.ok = true; this.retry(true); } }
  hover(f: string) {
    const seat = this.mySeat; if (seat < 0 || this.state?.phase !== 'draft' || this.taken(f)) return;
    if (this.isHost) this.apply({ t: 'sq-hover', id: this.me().id, seat, f });
    else { this.state!.seats[seat].hover = f; this.room.send({ t: 'sq-hover', id: this.me().id, seat, f }); this.hooks.change(); }
  }
  lock(f: string) {
    const seat = this.mySeat; if (seat < 0 || this.state?.phase !== 'draft' || this.taken(f)) return false;
    if (this.isHost) this.apply({ t: 'sq-lock', id: this.me().id, seat, f }); else { this.want.lock.set(seat, f); this.retry(true); }
    return true;
  }
  // ---------- ações do anfitrião
  start() {
    const s = this.state; if (!this.isHost || !s || s.phase !== 'mesa' || !this.canStart) return;
    s.members.forEach((m) => { m.ok = m.id === s.host; });
    this.phase('confirma', SQUAD.CONFIRM_MS);
  }
  get canStart() { const s = this.state; return !!s && [0, 1].every((t) => s.members.some((m) => m.team === t)); }
  setStage(name: string) { const s = this.state; if (this.isHost && s && s.phase === 'draft') { s.stage = name; this.push(); } }
  /** Voltou da luta: o anfitrião reabre a mesa. */
  resume() {
    const now = Date.now(); this.lastState = now; for (const k of this.seen.keys()) this.seen.set(k, now);
    this.want = { lock: new Map(), team: this.want.team };
    if (this.isHost && this.state && (this.state.phase === 'luta' || this.state.phase === 'vai')) { this.state.note = ''; this.phase('mesa', 0); }
  }
  leave() { if (this.closedFlag) return; this.closedFlag = true; this.room.send({ t: this.isHost ? 'sq-close' : 'sq-leave', id: this.me().id }); setTimeout(() => this.room.leave(), 150); }

  /** Chamado a cada ~250 ms. */
  tick() {
    if (this.closedFlag) return;
    const now = Date.now(), s = this.state;
    if (this.isHost && s) {
      if (s.phase !== 'luta' && s.phase !== 'vai') {
        const gone = s.members.filter((m) => m.id !== s.host && now - (this.seen.get(m.id) ?? now) > SQUAD.SILENT_MS);
        if (gone.length) { s.members = s.members.filter((m) => !gone.includes(m)); s.note = `${gone.map((m) => m.name).join(', ')} SAIU DA MESA`; if (s.phase !== 'mesa') this.phase('mesa', 0); else this.push(); }
      }
      if (s.phase === 'confirma' && s.members.every((m) => m.ok)) this.openDraft();
      else if (s.phase === 'confirma' && now >= this.until) { s.note = `${s.members.filter((m) => !m.ok).map((m) => m.name).join(', ')} NÃO CONFIRMOU`; this.phase('mesa', 0); }
      else if (s.phase === 'draft' && (s.seats.every((x) => x.locked) || now >= this.until)) this.go();
      else if (s.phase === 'vai' && now >= this.until) this.phase('luta', 0);
      if (now - this.lastBeat >= SQUAD.BEAT_MS && s.phase !== 'luta') this.push(false);
    } else {
      this.retry(false);
      if (s && !this.mine && now - this.born > 5000) { this.close('A MESA ESTÁ CHEIA OU JÁ COMEÇOU'); return; }
      if (s?.phase !== 'luta' && s?.phase !== 'vai' && now - this.lastState > SQUAD.SILENT_MS) this.close(s ? 'O ANFITRIÃO SAIU: A MESA FECHOU' : 'A MESA NÃO RESPONDEU');
    }
  }

  // ---------- rede
  private onMsg(m: Msg) {
    if (this.closedFlag) return;
    if (m.t === 'sq-state') {
      if (this.isHost) return;
      const s = m.s as SquadState; if (this.state && s.rev < this.state.rev) return;
      const fresh = !this.state || s.rev !== this.state.rev;
      this.lastState = Date.now();
      if (!fresh) return;
      const before = this.state; this.state = s; this.until = Date.now() + s.left;
      if (!s.members.some((x) => x.id === this.me().id) && before?.members.some((x) => x.id === this.me().id)) { this.close('VOCÊ SAIU DA MESA'); return; }
      if (s.phase !== 'confirma') this.want.ok = false;
      if (s.phase !== 'draft') this.want.lock.clear();
      for (const [seat, f] of this.want.lock) { const x = s.seats[seat]; if (!x || x.locked || this.taken(f)) this.want.lock.delete(seat); }   // travou (eu ou outro na frente)
      this.hooks.change(); this.maybeStart();
      return;
    }
    if (m.t === 'sq-close') { if (!this.isHost) this.close('O ANFITRIÃO FECHOU A MESA'); return; }
    if (this.isHost) this.apply(m);
  }

  /** Repete os pedidos que o estado ainda não refletiu (e serve de sinal de vida). */
  private retry(now: boolean) {
    if (this.isHost) return;
    const t = Date.now(); if (!now && t - this.lastTry < SQUAD.RETRY_MS) return; this.lastTry = t;
    const me = this.me(), mine = this.mine;
    if (!mine) { this.room.send({ t: 'sq-join', id: me.id, name: me.name, fighter: me.fighter, team: this.want.team }); return; }
    if (this.want.team !== undefined && this.want.team !== mine.team && this.state!.phase === 'mesa') this.room.send({ t: 'sq-team', id: me.id, team: this.want.team });
    else if (this.want.ok && !mine.ok && this.state!.phase === 'confirma') this.room.send({ t: 'sq-ok', id: me.id });
    else if (this.want.lock.size && this.state!.phase === 'draft') { for (const [seat, f] of this.want.lock) this.room.send({ t: 'sq-lock', id: me.id, seat, f }); }
    else this.room.send({ t: 'sq-here', id: me.id });
  }

  /** Anfitrião: aplica um pedido. */
  private apply(m: Msg) {
    const s = this.state; if (!s) return;
    const id = m.id as string, mem = s.members.find((x) => x.id === id);
    this.seen.set(id, Date.now());
    switch (m.t) {
      case 'sq-join': {
        if (mem) { this.push(false); return; }
        if (s.phase !== 'mesa' || s.members.length >= 4) { this.push(false); return; }
        const count = (t: number) => s.members.filter((x) => x.team === t).length;
        const want = m.team === 0 || m.team === 1 ? (m.team as 0 | 1) : count(1) <= count(0) - 1 ? 1 : count(0) <= count(1) ? 0 : 1;
        const team = count(want) < 2 ? want : ((1 - want) as 0 | 1);
        s.members.push({ id, name: String(m.name ?? '?').slice(0, 14), fighter: String(m.fighter ?? ''), team, ok: false }); s.note = ''; this.push(); return;
      }
      case 'sq-leave': if (mem) { s.members = s.members.filter((x) => x !== mem); s.note = `${mem.name} SAIU DA MESA`; if (s.phase !== 'mesa' && s.phase !== 'luta') this.phase('mesa', 0); else this.push(); } return;
      case 'sq-team': if (mem && s.phase === 'mesa' && (m.team === 0 || m.team === 1) && mem.team !== m.team && s.members.filter((x) => x.team === m.team).length < 2) { mem.team = m.team; this.push(); } return;
      case 'sq-ok': if (mem && s.phase === 'confirma' && !mem.ok) { mem.ok = true; this.push(); } return;
      case 'sq-hover': { const x = s.seats[m.seat as number]; if (s.phase === 'draft' && x && x.owner === id && !x.locked && x.hover !== m.f) { x.hover = m.f as string; this.push(); } return; }
      case 'sq-lock': {
        const x = s.seats[m.seat as number], f = m.f as string;
        if (s.phase !== 'draft' || !x || x.owner !== id || x.locked || this.taken(f) || !this.fighters().includes(f)) { this.push(false); return; }
        x.fighter = f; x.hover = f; x.locked = true; this.push(); return;
      }
    }
  }

  private phase(p: SquadPhase, ms: number) { const s = this.state!; s.phase = p; this.until = Date.now() + ms; if (p === 'mesa') { s.seats = []; s.members.forEach((m) => { m.ok = false; }); } this.push(); }
  private openDraft() {
    const s = this.state!; s.seats = []; s.stage = 'random'; s.note = '';
    for (const t of [0, 1] as const) { const ms = s.members.filter((m) => m.team === t); for (let k = 0; k < 2; k++) s.seats.push({ owner: (ms[k] ?? ms[0]).id, team: t, fighter: null, hover: null, locked: false }); }
    this.phase('draft', SQUAD.DRAFT_MS);
  }
  private go() {
    const s = this.state!, all = this.fighters();
    for (const x of s.seats) if (!x.locked) {                              // tempo esgotado: fica o que estava olhando, ou um livre qualquer
      const free = all.filter((f) => !this.taken(f)); const f = x.hover && free.includes(x.hover) ? x.hover : free[Math.floor(Math.random() * free.length)];
      x.fighter = f; x.locked = true;
    }
    if (s.stage === 'random') { const st = this.stages(); s.stage = st[Math.floor(Math.random() * st.length)]; }
    s.matchId = Math.random().toString(36).slice(2, 10);
    this.phase('vai', SQUAD.GO_MS);
  }
  /** Anfitrião: publica o estado (rev novo quando mudou). */
  private push(changed = true) {
    const s = this.state!; if (changed) s.rev++;
    s.left = Math.max(0, this.until - Date.now()); this.lastBeat = Date.now();
    this.room.send({ t: 'sq-state', s });
    if (changed) { this.hooks.change(); this.maybeStart(); }
  }
  private maybeStart() { const s = this.state!; if (s.phase === 'vai' && s.matchId && this.started !== s.matchId && s.members.some((m) => m.id === this.me().id)) { this.started = s.matchId; this.hooks.start(JSON.parse(JSON.stringify(s)) as SquadState); } }
  private close(why: string) { if (this.closedFlag) return; this.closedFlag = true; this.room.leave(); this.hooks.closed(why); }
}

/** Configuração da luta a partir da mesa travada: jogadores na ordem da mesa, dono de cada lutador e lado de cada um. */
export function duoConfig(s: SquadState, myId: string) {
  const players = s.members.map((m) => m.name), idx = (id: string) => s.members.findIndex((m) => m.id === id);
  const team = (t: number) => s.seats.filter((x) => x.team === t);
  const f: [[string, string], [string, string]] = [[team(0)[0].fighter!, team(0)[1].fighter!], [team(1)[0].fighter!, team(1)[1].fighter!]];
  const owner: [number[], number[]] = [team(0).map((x) => idx(x.owner)), team(1).map((x) => idx(x.owner))];
  const label = (t: number) => [...new Set(team(t).map((x) => players[idx(x.owner)]))].join(' + ');
  const me = idx(myId), local = me < 0 ? -1 : owner[0].includes(me) ? 0 : 1;
  return { matchId: s.matchId, f: [f[0][0], f[1][0]] as [string, string], names: [label(0), label(1)] as [string, string], local: local as 0 | 1 | -1, stage: s.stage, connectMs: 20000, duo: { f, players, owner, me } };
}
