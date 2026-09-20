// Arena online: quem está conectado, desafios 1x1, JOGAR AGORA, lutas ao vivo pra assistir, campeonato e ranking.
// O protocolo de convite fica em invites.ts (sem DOM); aqui só a sala e a tela.
//
// Cliques: um único ouvinte por painel (delegação por data-act), então o botão funciona mesmo que a lista tenha sido
// redesenhada entre apertar e soltar. A tela só é redesenhada quando o conteúdo muda de fato, e as contagens
// regressivas atualizam só o texto.
import type { FighterAssets } from '../game/types';
import { audio } from '../core/audio';
import { joinRoom, ONLINE, type Msg, type Peer, type Room } from './transport';
import { Invites } from './invites';
import { Squad, duoConfig, soloConfig, type SquadState } from './squad';
import { drawWinPose } from '../ui/pose';
import { placeOf } from '../ui/valemap';
import * as store from './store';

export interface NetMatchCfg {
  matchId: string; f: [string, string]; names: [string, string]; ids?: [string, string]; local: 0 | 1 | -1;
  tourney?: { t: store.Tournament; m: store.TMatch };
  connectMs?: number;             // quanto esperar o outro entrar (convite: 15 s; campeonato: mais)
  stage?: string;                 // cenário escolhido (sem isso: o do lutador da direita)
  /** Duplas: `f` são os que começam em campo, `names` o nome de cada dupla e `local` o meu lado. */
  duo?: { f: [[string, string], [string, string]]; players: string[]; owner: [number[], number[]]; me: number };
}
export interface LobbyHooks {
  start(cfg: NetMatchCfg): void;                // entra numa luta (jogando ou assistindo)
  abort(matchId: string, why: string): void;    // a luta que eu aceitei não vai acontecer
  exit(): void;                                 // saiu da arena
  changeFighter(): void;
  locked(fighterId: string): boolean;           // lutador secreto ainda trancado neste aparelho
  stages(): string[];                           // cenários que dá pra escolher nas duplas
}
type View = 'hub' | 'duplas' | 'copa';
const BASE = import.meta.env.BASE_URL;

export const MAX_PEERS = 15;
export const CUP = { MAX: 10, COUNT_MS: 10000 };   // campeonato: 10 competem (os outros 5 da sala assistem); contagem antes de fechar as chaves   // teto da rede: 9 jogadores + plateia, dentro da cota gratuita do Supabase

export class Lobby {
  private room: Room | null = null;
  private peers: Peer[] = [];
  private peersSeen = false;
  private score = new Map<string, { w: number; l: number }>();
  private feed: string[] = [];
  private rank: store.RankRow[] = [];
  private tour: store.Tournament | null = null; private tEntries: store.Entry[] = []; private tMatches: store.TMatch[] = [];
  private unwatch: (() => void) | null = null; private refreshing = false;
  private copied = false;
  private view: View = 'hub';
  private tab: 'gente' | 'ranking' = 'gente';
  private squad: Squad | null = null;
  private pick = '';                // draft / sala do campeonato: lutador em destaque
  private chat: { n: string; f: string; x: string; me?: boolean }[] = [];
  private sideDyn: HTMLElement | null = null; private chatLog: HTMLElement | null = null;
  private liveTourney: store.TMatch | null = null;      // a luta do campeonato que estou jogando
  private tCount = 0; private tCountMine = false; private tCountBeat = 0;   // contagem pra fechar as chaves (quem apertou repete o aviso a cada segundo)
  private autoWatched = new Set<string>(); private creating = false; private rang = '';
  private clock = 0; private raf = 0;
  private invites: Invites;
  private timer: ReturnType<typeof setInterval>;
  me: Peer;

  constructor(private root: HTMLElement, private side: HTMLElement, private roster: FighterAssets[], private hooks: LobbyHooks) {
    let id = sessionStorage.getItem('v4f-id');
    if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('v4f-id', id); }
    this.me = { id, name: localStorage.getItem('v4f-name') ?? '', fighter: roster[0].def.id, status: 'livre' };
    this.invites = new Invites(() => this.room, () => this.me, () => this.me.status === 'lutando' || !!this.squad, {
      // desafio aceito: antes da luta, os dois vão JUNTOS pra tela de escolha (quem convidou abre a sala, o outro entra)
      start: (matchId, other, local) => { this.duelInvite = matchId; this.sit(local === 0 ? this.me.id : other.id, true); },
      abort: (matchId, why) => this.hooks.abort(matchId, why),
      note: (t) => this.note(t),
      ring: () => { audio.sfx('selectChar'); document.body.classList.add('room-open'); },
      change: () => this.paint(),
    });
    const delegate = (el: HTMLElement, active: () => boolean) => el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!btn || !el.contains(btn) || !active()) return;
      e.preventDefault(); audio.sfx('menuConfirm'); this.act(btn.dataset.act!, btn.dataset.arg ?? '');
    });
    delegate(root, () => root.classList.contains('lobby'));
    delegate(side, () => true);
    this.timer = setInterval(() => { this.tickCountdowns(); this.squad?.tick(); this.tickCup(); if (this.me.status === 'procurando') this.matchmake(); }, 250);
    // lutadores comemorando nas telas de escolha: todo <canvas data-anim="id"> é redesenhado a cada quadro
    const draw = () => {
      this.raf = requestAnimationFrame(draw); this.clock++;
      if (!root.classList.contains('lobby')) return;
      root.querySelectorAll<HTMLCanvasElement>('canvas[data-anim]').forEach((cv) => drawWinPose(cv, this.F(cv.dataset.anim!), this.clock, cv.dataset.flip === '1'));
    };
    if (typeof requestAnimationFrame === 'function') draw();
    root.addEventListener('pointerover', (e) => {                 // passar o mouse num rosto já mostra o lutador no centro
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-hover]'); if (!el || !root.classList.contains('lobby')) return;
      if (this.pick !== el.dataset.hover) { this.pick = el.dataset.hover!; this.clock = 0; this.squad?.hover(this.pick); this.paint(); }
    });
  }

  open(fighterId: string) {
    this.me.fighter = fighterId; this.me.status = this.squad ? 'dupla' : 'livre'; this.me.matchId = undefined; this.me.vs = undefined; this.me.mc = undefined;
    if (this.squad) { this.squad.resume(); this.view = 'duplas'; }
    this.pick ||= fighterId;
    this.root.className = 'screens show lobby';
    if (!this.me.name) { this.askName(); return; }
    if (!this.room) this.room = joinRoom('lobby', this.me, { onMsg: (m) => this.onMsg(m), onPeers: (p) => this.onPeers(p) });
    else this.room.setPresence(this.me);
    void store.upsertPlayer(this.me.id, this.me.name, this.me.fighter);
    this.unwatch ??= store.watch(() => void this.refresh());
    void this.refresh();
    this.paint(true);
  }
  dispose() { clearInterval(this.timer); cancelAnimationFrame(this.raf); this.invites.dispose(); }
  close() {
    this.invites.cancel(); this.squad?.leave(); this.squad = null; this.view = 'hub';
    this.room?.leave(); this.room = null; this.unwatch?.(); this.unwatch = null; this.peers = []; this.peersSeen = false;
    document.body.classList.remove('online'); document.getElementById('room-toggle')!.hidden = true; this.side.innerHTML = ''; this.sideDyn = null; this.chatLog = null;
    window.dispatchEvent(new Event('resize'));
  }

  /** Quem eu sou no campeonato: pelo NOME (igual ao ranking), pra inscrição e organização não se perderem quando a pessoa
   *  fecha a aba e volta (o id da visita muda a cada vez). */
  private get tid() { return store.rankKey(this.me.name, this.me.id); }
  private tidOf(p: Peer) { return store.rankKey(p.name, p.id); }
  private isOnline(playerId: string | null) { return !!playerId && this.peers.some((p) => this.tidOf(p) === playerId); }
  /** Quem toca o campeonato agora: o organizador; se ele não está na sala, o primeiro inscrito que estiver. */
  private get runnerId() {
    const t = this.tour; if (!t) return '';
    if (this.isOnline(t.owner)) return t.owner;
    return this.tEntries.map((e) => e.player_id).filter((id) => this.isOnline(id)).sort()[0] ?? t.owner;
  }
  private get runsTourney() { return !!this.tour && this.runnerId === this.tid; }

  /** Avisa o saguão do estado atual (lutando/assistindo) sem sair dele. */
  setStatus(status: Peer['status'], matchId?: string, vs?: string, mc?: string) {
    this.me.status = status; this.me.matchId = matchId; this.me.vs = vs; this.me.mc = mc; this.room?.setPresence(this.me);
    this.paint();
  }
  /** A luta conectou: quem aceitou para de reenviar o aceite. */
  connected(matchId: string) {
    this.invites.connected(matchId);
    const m = this.liveTourney;                            // campeonato: a luta só vira "lutando" (e a plateia entra) quando os dois conectaram
    if (m && m.id === matchId && m.p1 === this.tid) void store.patchMatch(m.id, { status: 'lutando' });
  }
  note(text: string) { this.feed.unshift(text); this.feed.length = Math.min(this.feed.length, 6); this.paint(); }

  report(cfg: NetMatchCfg, winner: 0 | 1) {
    const w = cfg.names[winner], l = cfg.names[1 - winner];
    this.room?.send({ t: 'result', winner: w, loser: l }); this.addResult(w, l);
    if (cfg.duo) return;                                             // duplas: só o placar da sala, sem ranking
    if (cfg.ids) void store.recordResult({ id: cfg.ids[winner], name: w }, { id: cfg.ids[1 - winner], name: l });
    if (cfg.tourney && cfg.ids) void store.finishMatch(cfg.tourney.t, cfg.tourney.m, cfg.ids[winner], w);
  }

  // ---------- sala
  private onPeers(peers: Peer[]) {
    const before = new Map(this.peers.map((p) => [p.id, p])), now = new Set(peers.map((p) => p.id));
    if (this.peersSeen) {
      for (const p of peers) if (p.id !== this.me.id && !before.has(p.id)) { this.note(`${p.name} entrou na sala`); audio.sfx('menuMove'); }
      for (const [id, p] of before) if (id !== this.me.id && !now.has(id)) this.note(`${p.name} saiu da sala`);
    }
    this.peersSeen = true;
    this.peers = peers;
    if (this.invites.out && !now.has(this.invites.out.to.id)) { this.note(`${this.invites.out.to.name} saiu antes de responder`); this.invites.cancel(); }
    if (this.invites.inc && !now.has(this.invites.inc.from.id)) this.invites.inc = null;
    this.matchmake();
    this.paint();
  }

  private onMsg(m: Msg) {
    if (m.t === 'result') { this.addResult(m.winner as string, m.loser as string); return; }
    if (m.t === 'tcount') { const left = Number(m.left); const was = this.tCount; this.tCount = left > 0 ? Date.now() + left : 0; if (left <= 0) this.tCountMine = false; if (!was !== !this.tCount) { if (this.tCount) audio.sfx('meter1'); this.paint(); } return; }
    if (m.t === 'chat') { this.pushChat({ n: String(m.n ?? '?').slice(0, 14), f: String(m.f ?? ''), x: String(m.x ?? '').slice(0, 140) }); if (!document.body.classList.contains('room-open')) this.bumpToggle(); return; }
    this.invites.onMsg(m);
  }

  /** JOGAR AGORA: quando duas pessoas estão procurando, a de menor id desafia e a outra aceita sozinha. */
  private matchmake() {
    if (this.me.status !== 'procurando' || this.invites.out || this.invites.inc) return;
    const other = this.peers.filter((p) => p.id !== this.me.id && p.status === 'procurando').sort((a, b) => a.id.localeCompare(b.id))[0];
    if (other && this.me.id < other.id) this.invites.challenge(other, true);
  }

  private liveMatches() {
    const live = new Map<string, Peer>();
    this.peers.forEach((p) => { if (p.status === 'lutando' && p.matchId && !live.has(p.matchId)) live.set(p.matchId, p); });
    return live;
  }
  private watch(matchId: string) {
    const p = this.liveMatches().get(matchId); if (!p || this.me.status === 'lutando') return;
    if (p.mc) { try { const c = JSON.parse(p.mc) as Pick<NetMatchCfg, 'f' | 'names' | 'stage'> & { duo: NonNullable<NetMatchCfg['duo']> }; this.hooks.start({ matchId, f: c.f, names: c.names, stage: c.stage, local: -1, duo: { ...c.duo, me: -1 } }); return; } catch { /* segue como 1x1 */ } }
    const [a, b] = (p.vs ?? ' x ').split(' x ');
    const fOf = (n: string) => this.peers.find((x) => x.name === n)?.fighter ?? this.roster[0].def.id;
    this.hooks.start({ matchId, f: [fOf(a), fOf(b)], names: [a, b], local: -1 });
  }

  private act(a: string, arg: string) {
    switch (a) {
      case 'challenge': { const p = this.peers.find((x) => x.id === arg); if (p && !this.invites.challenge(p)) this.note('Espere a resposta do desafio anterior'); break; }
      case 'cancel': this.invites.cancel(); break;
      case 'accept': this.invites.accept(); break;
      case 'decline': this.invites.decline(); break;
      case 'watch': this.watch(arg); break;
      case 'quick': this.invites.cancel(); this.setStatus(this.me.status === 'procurando' ? 'livre' : 'procurando'); this.matchmake(); break;
      case 'swap': this.invites.cancel(); this.setStatus('livre'); this.hooks.changeFighter(); break;
      case 'back': this.hooks.exit(); break;
      case 'invite': {
        const link = `${location.origin}${location.pathname}?arena`;
        const done = () => { this.copied = true; this.paint(); setTimeout(() => { this.copied = false; this.paint(); }, 1800); };
        if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => window.prompt('Copie o link:', link)); else window.prompt('Copie o link:', link);
        break;
      }
      case 'view': this.view = arg as View; this.pick = this.me.fighter; if (this.view === 'copa') this.ensureTournament(); this.paint(); break;
      case 'tab': this.tab = arg as 'gente' | 'ranking'; this.paint(); break;
      // ----- duplas
      case 'sq-new': this.sit(this.me.id); break;
      case 'sq-join': this.sit(arg); break;
      case 'sq-leave': this.squad?.leave(); this.squad = null; this.me.table = undefined; this.me.at = undefined; this.setStatus('livre'); break;
      case 'sq-team': this.squad?.setTeam(Number(arg) as 0 | 1); break;
      case 'sq-start': this.squad?.start(); break;
      case 'sq-ok': this.squad?.confirm(); this.paint(); break;
      case 'sq-pick': if (this.squad && !this.squad.taken(arg) && !this.hooks.locked(arg)) { this.pick = arg; this.clock = 0; this.squad.hover(arg); this.paint(); } break;
      case 'sq-lock': if (this.squad && this.pick && this.squad.lock(this.pick)) { audio.sfx('selectChar'); audio.voice(`ann-${this.pick}`, 'ann'); this.paint(); } break;
      case 'sq-stage': this.squad?.setStage(arg); break;
      // ----- campeonato: escolher na sala
      case 'tpick': if (!this.hooks.locked(arg)) { this.pick = arg; this.clock = 0; this.me.fighter = arg; this.room?.setPresence(this.me); this.paint(); } break;   // os outros veem quem estou olhando
      default: this.tourAct(a, arg);
    }
  }

  // ---------- duplas
  /** Senta numa mesa (a minha = crio uma). */
  private duelInvite = '';
  private sit(hostId: string, solo = false) {
    if (this.squad || this.me.status === 'lutando') return;
    this.invites.cancel();
    this.squad = new Squad(hostId, () => this.me, (n, h) => joinRoom(n, null, h), {
      change: () => this.squadChanged(),
      start: (st) => this.squadStart(st),
      closed: (why) => { this.squad = null; this.me.table = undefined; this.me.at = undefined; this.setStatus('livre'); this.note(why); },
    }, () => this.roster.filter((f) => !f.def.secret).map((f) => f.def.id).concat(this.roster.filter((f) => f.def.secret).map((f) => f.def.id)), () => this.hooks.stages(), solo);
    this.me.at = solo ? undefined : hostId; this.view = 'duplas'; this.pick = this.me.fighter;
    this.setStatus('dupla'); this.squadChanged();
  }
  private lastPhase = '';
  private squadChanged() {
    const sq = this.squad, st = sq?.state; if (!sq) return;
    if (sq.solo && st && st.members.length === 2 && this.duelInvite) { this.invites.connected(this.duelInvite); this.duelInvite = ''; }   // o outro chegou: para de reenviar o aceite
    if (sq.isHost && st && !sq.solo) { const t = { n: st.members.length, open: st.phase === 'mesa' && st.members.length < 4 }; if (t.n !== this.me.table?.n || t.open !== this.me.table?.open) { this.me.table = t; this.room?.setPresence(this.me); } }
    if (st && st.phase !== this.lastPhase) {                                  // mudou de fase: som e foco
      if (st.phase === 'confirma') { audio.sfx('meter2'); document.body.classList.add('room-open'); }
      if (st.phase === 'draft') { audio.sfx('selectChar'); this.pick = this.me.fighter; if (sq.taken(this.pick)) this.pick = ''; }
      this.lastPhase = st.phase;
    }
    this.paint();
  }
  private squadStart(st: SquadState) {
    if (this.squad?.solo) { const c = soloConfig(st, this.me.id); try { localStorage.setItem('v4f-fighter', c.f[c.local === 1 ? 1 : 0]); } catch { /* sem storage */ } this.me.fighter = c.f[c.local === 1 ? 1 : 0]; setTimeout(() => { if (this.squad) this.hooks.start(c); }, Math.max(0, this.squad.leftMs - 200)); return; }
    const cfg = duoConfig(st, this.me.id);
    const mc = JSON.stringify({ f: cfg.f, names: cfg.names, stage: cfg.stage, duo: { f: cfg.duo.f, players: cfg.duo.players, owner: cfg.duo.owner } });
    this.pendingMc = mc;
    setTimeout(() => { if (this.squad) this.hooks.start(cfg); }, Math.max(0, this.squad!.leftMs - 200));   // a contagem "3, 2, 1" termina e a luta abre
  }
  private pendingMc = '';
  /** Dados da luta de duplas que vão na presença (pra plateia montar a mesma luta). */
  takeMc() { const m = this.pendingMc; this.pendingMc = ''; return m || undefined; }

  // ---------- campeonato
  /** Relê ranking e campeonato; mantém minha inscrição com o lutador atual e chama a próxima luta da fila. */
  private async refresh() {
    if (!store.storeReady || this.refreshing) return;
    this.refreshing = true;
    try {
      this.rank = await store.ranking();
      this.tour = await store.currentTournament();
      if (this.tour) {
        [this.tEntries, this.tMatches] = await Promise.all([store.entries(this.tour.id), store.matches(this.tour.id)]);
        // uma luta por vez: quem toca o campeonato chama a próxima quando não há nenhuma em andamento
        if (this.tour.status === 'andamento' && this.runsTourney && !this.tMatches.some((m) => m.status === 'chamando' || m.status === 'lutando')) {
          const next = this.tMatches.find((m) => m.status === 'pendente' && m.p1 && m.p2);
          if (next) await store.patchMatch(next.id, { status: 'chamando' });
        }
        if (this.tour.status === 'inscricoes' && this.runsTourney && !this.tCount && this.tEntries.filter((e) => this.isOnline(e.player_id)).length >= CUP.MAX) this.cupCount(true);   // lotou: começa sozinho
        this.tourneyEvents();
      } else { this.tEntries = []; this.tMatches = []; }
    } catch (e) { console.warn('supabase', e); }
    this.refreshing = false;
    this.paint();
  }

  /** Minha luta foi chamada: toca o aviso e abre a tela do campeonato. Luta dos outros começou: quem está na tela do campeonato assiste. */
  private tourneyEvents() {
    if (!this.root.classList.contains('lobby') || this.squad || this.me.status !== 'livre') return;
    const mineCalled = this.tMatches.find((m) => m.status === 'chamando' && (m.p1 === this.tid || m.p2 === this.tid));
    if (mineCalled && this.rang !== mineCalled.id) { this.rang = mineCalled.id; this.view = 'copa'; audio.sfx('meter2'); audio.voice('ann-fight', 'ann'); }
    const live = this.tMatches.find((m) => m.status === 'lutando' && m.p1 !== this.tid && m.p2 !== this.tid);
    if (live && this.view === 'copa' && !this.autoWatched.has(live.id)) { this.autoWatched.add(live.id); this.tourAct('twatch', live.id); }
  }
  /** Confirmados que estão na sala, na ordem em que confirmaram; só os 10 primeiros competem. */
  private get cupReady() { return this.tEntries.filter((e) => this.isOnline(e.player_id)).slice(0, CUP.MAX); }
  /** Contagem pra fechar as chaves: começa sozinha com 10 confirmados, ou quando um confirmado aperta COMEÇAR. Dá tempo de alguém trocar de lutador. */
  private cupCount(on: boolean) {
    this.tCount = on ? Date.now() + CUP.COUNT_MS : 0; this.tCountMine = on; this.tCountBeat = 0;
    this.room?.send({ t: 'tcount', left: on ? CUP.COUNT_MS : -1 }); if (on) audio.sfx('meter1'); this.paint();
  }
  private tickCup() {
    const t = this.tour; if (!this.tCount) return;
    const now = Date.now();
    if (!t || t.status !== 'inscricoes' || this.cupReady.length < 2) { if (this.tCountMine) this.cupCount(false); else this.tCount = 0; this.paint(); return; }
    if (this.tCountMine && now - this.tCountBeat >= 1000) { this.tCountBeat = now; this.room?.send({ t: 'tcount', left: this.tCount - now }); }
    if (now >= this.tCount) {
      this.tCount = 0; this.tCountMine = false;
      if (this.runsTourney) void store.startTournament(t, this.cupReady).then(() => this.refresh()); else setTimeout(() => void this.refresh(), 1200);
      this.paint();
    }
  }
  /** Abrir o CAMPEONATO já cai na sala de escolha: se não tem nenhum aberto, quem entrou primeiro abre um. */
  private ensureTournament() {
    if (!store.storeReady || this.creating || (this.tour && this.tour.status !== 'fim')) return;
    if (this.tour?.status === 'fim' && !this.wantNew) return;          // acabou: fica o pódio até alguém pedir outro
    this.creating = true; this.wantNew = false;
    void store.createTournament(`COPA V4 ${new Date().toLocaleDateString('pt-BR')}`, this.tid).then(() => this.refresh()).finally(() => { this.creating = false; });
  }
  private wantNew = false;

  private tourAct(a: string, arg: string) {
    const t = this.tour;
    const fighterOf = (id: string | null) => this.tEntries.find((e) => e.player_id === id)?.fighter ?? this.roster[0].def.id;
    const cfgOf = (m: store.TMatch, local: 0 | 1 | -1): NetMatchCfg => ({ matchId: m.id, f: [fighterOf(m.p1), fighterOf(m.p2)], names: [m.p1_name ?? '?', m.p2_name ?? '?'], ids: [m.p1!, m.p2!], local, tourney: { t: t!, m }, connectMs: 90000 });
    const m = this.tMatches.find((x) => x.id === arg.split(':')[0]);
    if (a === 'tnew') { this.wantNew = true; this.ensureTournament(); }
    else if (a === 'tjoin' && t && arg) {                              // entra (ou troca) com o lutador em destaque; o banco recusa lutador repetido
      this.me.fighter = arg; this.room?.setPresence(this.me);
      audio.sfx('selectChar'); audio.voice(`ann-${arg}`, 'ann');
      void store.joinTournament(t.id, this.tid, this.me.name, arg).then(() => this.refresh());
    } else if (a === 'tkick' && t && this.runsTourney && !this.isOnline(arg)) void store.leaveTournament(t.id, arg).then(() => this.refresh());   // libera o lutador de quem saiu da sala
    else if (a === 'tleave' && t) void store.leaveTournament(t.id, this.tid).then(() => this.refresh()); else if (a === 'tcancel') this.cupCount(false);
    else if (a === 'tstart' && t && !this.tCount && this.cupReady.length >= 2) this.cupCount(true);
    else if (a === 'tstart-now' && t) void store.startTournament(t, this.cupReady).then(() => this.refresh());
    else if (a === 'tplay' && m) {
      this.liveTourney = m;
      this.invites.cancel();
      this.hooks.start(cfgOf(m, m.p1 === this.tid ? 0 : 1));
    } else if (a === 'twatch' && m) this.hooks.start(cfgOf(m, -1));
    else if (a === 'two' && m && t) {
      const who = arg.split(':')[1];
      void store.finishMatch(t, m, who === '1' ? m.p1! : m.p2!, (who === '1' ? m.p1_name : m.p2_name) ?? '').then(() => this.refresh());
    }
  }

  private addResult(winner: string, loser: string) {
    const s = (n: string) => this.score.get(n) ?? (this.score.set(n, { w: 0, l: 0 }), this.score.get(n)!);
    s(winner).w++; s(loser).l++;
    this.note(`${winner} venceu ${loser}`);
  }

  private askName() {
    this.root.innerHTML = `<div class="center"><div class="title-sm">ARENA ONLINE</div><div class="pix small">COMO VOCÊ QUER SER CHAMADO?</div>
      <input class="lb-input" maxlength="14" placeholder="SEU NOME" autofocus><div class="lb-btn" data-ok>ENTRAR</div><div class="lb-btn ghost" data-back>VOLTAR</div></div>`;
    const inp = this.root.querySelector<HTMLInputElement>('.lb-input')!;
    const ok = () => { const v = inp.value.trim().toUpperCase(); if (!v) return; this.me.name = v; localStorage.setItem('v4f-name', v); this.open(this.me.fighter); };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') ok(); });
    inp.addEventListener('keyup', (e) => e.stopPropagation());
    this.root.querySelector<HTMLElement>('[data-ok]')!.onclick = ok;
    this.root.querySelector<HTMLElement>('[data-back]')!.onclick = () => this.hooks.exit();
    setTimeout(() => inp.focus(), 50);
  }

  // ---------- desenho
  /** Só troca o HTML se mudou (assinatura no primeiro filho), pra não engolir cliques. */
  private put(el: HTMLElement, html: string, force = false) {
    let h = 0; for (let i = 0; i < html.length; i++) h = (Math.imul(h, 31) + html.charCodeAt(i)) | 0;
    const sig = String(h);
    if (!force && (el.firstElementChild as HTMLElement | null)?.dataset.sig === sig) return;
    el.innerHTML = html;
    (el.firstElementChild as HTMLElement | null)?.setAttribute('data-sig', sig);
  }
  /** Contagem regressiva dos convites: atualiza só o texto. */
  private tickCountdowns() {
    for (const el of document.querySelectorAll<HTMLElement>('[data-until]')) {
      const s = Math.max(0, Math.ceil((Number(el.dataset.until) - Date.now()) / 1000));
      const txt = el.dataset.fmt === 'n' ? String(s) : `${s}s`;
      if (el.textContent !== txt) el.textContent = txt;
    }
  }

  private img(fid: string) { const f = this.roster.find((r) => r.def.id === fid); return f?.portrait ? `<img src="${f.portrait.src}" alt="">` : ''; }

  /** Convite saindo / chegando: o mesmo bloco aparece no painel lateral e na tela da sala. */
  private inviteHtml(big: boolean) {
    const o = this.invites.out, i = this.invites.inc;
    if (i) return `<div class="${big ? 'lb-modal' : 'rm-alert'}">${big ? `<div class="lb-av big">${this.img(i.from.fighter)}</div>` : ''}
      <div class="pix">${esc(i.from.name)} TE DESAFIOU!</div><div class="pix tiny">${esc(this.fighterName(i.from.fighter))} · RESPONDA EM <b data-until="${i.at + i.ttl}"></b></div>
      <div class="inv-btns"><${big ? 'div' : 'button'} class="${big ? 'lb-btn' : 'rm-btn'}" data-act="accept">ACEITAR</${big ? 'div' : 'button'}><${big ? 'div' : 'button'} class="${big ? 'lb-btn ghost' : 'rm-btn ghost'}" data-act="decline">RECUSAR</${big ? 'div' : 'button'}></div></div>`;
    if (o && !o.auto) return `<div class="${big ? 'lb-sent' : 'rm-alert sent'}"><div class="pix ${big ? 'small' : ''}">DESAFIO ENVIADO PARA ${esc(o.to.name)}</div>
      <div class="pix tiny">ESPERANDO RESPOSTA · <b data-until="${o.at + o.ttl}"></b></div><${big ? 'div' : 'button'} class="${big ? 'lb-btn sm ghost' : 'rm-btn ghost'}" data-act="cancel">CANCELAR</${big ? 'div' : 'button'}></div>`;
    return '';
  }
  private fighterName(fid: string) { return this.roster.find((r) => r.def.id === fid)?.def.name ?? ''; }

  private F(fid: string) { return this.roster.find((r) => r.def.id === fid); }
  private face(fid: string, cls = '') { return `<span class="av ${cls}" style="--c:${this.F(fid)?.def.colors.primary ?? '#3d4a63'}">${fid && this.F(fid) ? `<img src="${BASE}fighters/${fid}/face.png" alt="">` : '<b>?</b>'}</span>`; }
  private stageOf(fid: string) { return this.F(fid)?.def.stage ?? 'office'; }
  /** Destaque do centro: cenário ao fundo, o lutador comemorando, nome, papel e níveis. */
  private showcase(fid: string, flip = false) {
    const f = this.F(fid); if (!f) return '<div class="hero empty"><b>?</b><small>ESCOLHA UM LUTADOR</small></div>';
    const st = f.def.stats, bar = (l: string, v: number) => `<div class="stat"><span>${l}</span><div><i style="width:${Math.round(Math.max(0.05, Math.min(1, (v - 0.7) / 0.65)) * 100)}%"></i></div></div>`;
    return `<div class="hero" style="--c:${f.def.colors.primary};background-image:url(${BASE}stages/${this.stageOf(fid)}.png)"><canvas data-anim="${fid}" data-flip="${flip ? 1 : 0}" width="300" height="250"></canvas>
      <div class="hero-info"><h2>${esc(f.def.name)}</h2><small>${esc(f.def.role.toUpperCase())} · ${esc(placeOf(fid).toUpperCase())}</small><div class="hero-stats">${bar('FORÇA', st.power ?? 1)}${bar('AGILIDADE', st.speed ?? 1)}${bar('PODER', st.magic ?? 1)}</div></div></div>`;
  }
  /** Grade de rostos. taken(id) devolve quem já ficou com o lutador ('' = livre). */
  private grid(act: string, taken: (id: string) => string, cols: number) {
    return `<div class="fgrid" style="--cols:${cols}">${this.roster.map((f) => {
      const id = f.def.id, who = taken(id), lock = this.hooks.locked(id);
      if (lock) return '<div class="fcell secret"><b>?</b></div>';
      return `<div class="fcell${this.pick === id ? ' on' : ''}${who ? ' taken' : ''}" style="--c:${f.def.colors.primary}" ${who ? '' : `data-act="${act}" data-arg="${id}" data-hover="${id}"`}><img src="${BASE}fighters/${id}/face.png" alt=""><span>${esc(f.def.name)}</span>${who ? `<em>🔒 ${esc(who)}</em>` : ''}</div>`;
    }).join('')}</div>`;
  }

  private paint(force = false) {
    this.paintSide();
    if (!this.root.classList.contains('lobby') || !this.me.name) return;
    const full = this.peers.length > MAX_PEERS && this.peers.slice(MAX_PEERS).some((p) => p.id === this.me.id);
    if (full) { this.put(this.root, `<div class="center"><div class="title-sm">ARENA LOTADA</div><div class="pix small">JÁ TEM ${MAX_PEERS} PESSOAS CONECTADAS. TENTE DAQUI A POUCO.</div><div class="lb-btn ghost" data-act="back">VOLTAR</div></div>`, force); return; }
    const body = this.squad ? this.duoHtml() : this.view === 'duplas' ? this.tablesHtml() : this.view === 'copa' ? this.copaHtml() : this.hubHtml();
    this.put(this.root, `<div class="ar v-${this.squad?.state?.phase ?? this.view}">${body}${this.inviteHtml(true)}</div>`, force);
    this.tickCountdowns();
  }

  private topBar(title: string, sub: string, back: string | null) {
    const mine = this.rank.find((r) => r.id === store.rankKey(this.me.name, this.me.id));
    return `<div class="ar-top">${back ? `<div class="ar-back" data-act="view" data-arg="${back}">‹ ARENA</div>` : `<div class="ar-me">${this.face(this.me.fighter, 'lg')}<div><b>${esc(this.me.name)}</b><small>${esc(this.F(this.me.fighter)?.def.name ?? '')}</small></div></div>`}
      <div class="ar-title"><h1>${title}</h1><small>${sub}</small></div>
      <div class="ar-right"><span class="pill gold">🏆 ${mine?.points ?? 0} PTS</span><span class="pill">${this.peers.length}/${MAX_PEERS} ONLINE</span>${back ? '' : `<span class="pill btn" data-act="invite">${this.copied ? '✔ COPIADO' : '🔗 CONVIDAR'}</span><span class="pill btn dark" data-act="back">SAIR</span>`}</div></div>`;
  }

  // ---------- tela principal: três modos em cartões + quem está na arena
  private hubHtml() {
    const others = this.peers.filter((p) => p.id !== this.me.id), out = this.invites.out, searching = this.me.status === 'procurando';
    const free = others.filter((p) => p.status === 'livre' || p.status === 'procurando').length;
    const tables = others.filter((p) => p.table?.open), t = this.tour;
    const copaBadge = !store.storeReady ? 'SEM BANCO' : !t || t.status === 'fim' ? (t?.champion ? `CAMPEÃO: ${esc(t.champion)}` : 'NENHUM ABERTO') : t.status === 'inscricoes' ? `SALA ABERTA · ${this.tEntries.length}/10` : 'EM ANDAMENTO';
    const myTurn = this.tMatches.some((m) => (m.status === 'chamando' || m.status === 'lutando') && (m.p1 === this.tid || m.p2 === this.tid));
    const art = (ids: string[]) => `<div class="mc-art">${ids.map((id, i) => `<img src="${BASE}fighters/${id}/face.png" style="--i:${i}" alt="">`).join('')}</div>`;
    const pool = this.roster.filter((f) => !f.def.secret).map((f) => f.def.id), k = pool.indexOf(this.me.fighter), rot = (n: number) => pool[(k + n + pool.length) % pool.length];
    const cards = `
      <div class="mcard duel"><div class="mc-badge">${free} LIVRE${free === 1 ? '' : 'S'} AGORA</div>${art([this.me.fighter, rot(3)])}<i class="mc-vs">VS</i>
        <h3>DUELO</h3><small>1 x 1 · MELHOR DE 3 · VALE RANKING</small>
        <div class="cta ${searching ? 'on' : ''}" data-act="quick">${searching ? 'PROCURANDO… <u>CANCELAR</u>' : '▶ JOGAR AGORA'}</div></div>
      <div class="mcard duo" data-act="view" data-arg="duplas"><div class="mc-badge ${tables.length ? 'hot' : ''}">${tables.length ? `${tables.length} MESA${tables.length > 1 ? 'S' : ''} ABERTA${tables.length > 1 ? 'S' : ''}` : 'CRIE UMA MESA'}</div>${art([this.me.fighter, rot(5), rot(8), rot(2)])}<i class="mc-vs">2x2</i>
        <h3>DUPLAS</h3><small>2 x 2 · CHAME O PARCEIRO NO MEIO DA LUTA</small><div class="cta">ENTRAR</div></div>
      <div class="mcard copa" data-act="view" data-arg="copa"><div class="mc-badge ${myTurn || t?.status === 'inscricoes' ? 'hot' : ''}">${myTurn ? 'É A SUA VEZ!' : copaBadge}</div><div class="mc-art cup"><span>🏆</span></div>
        <h3>CAMPEONATO</h3><small>MATA-MATA · UM LUTADOR POR PESSOA</small><div class="cta">ENTRAR</div></div>`;
    const label: Record<string, string> = { livre: 'LIVRE', procurando: 'QUER LUTAR', lutando: 'LUTANDO', assistindo: 'ASSISTINDO', dupla: 'NAS DUPLAS' };
    const rows = others.map((p) => `<div class="prow" style="--c:${this.F(p.fighter)?.def.colors.primary ?? '#3d4a63'}">${this.face(p.fighter)}<div class="pn"><b>${esc(p.name)}</b><small class="st-${p.status}">${label[p.status]}${p.status === 'lutando' && p.vs ? ' · ' + esc(p.vs) : ''}</small></div>
      ${p.status === 'livre' || p.status === 'procurando' ? (out?.to.id === p.id ? '<span class="mini wait">AGUARDANDO</span>' : `<span class="mini${out ? ' off' : ''}" data-act="challenge" data-arg="${p.id}">DESAFIAR</span>`) : p.status === 'lutando' && p.matchId ? `<span class="mini ghost" data-act="watch" data-arg="${p.matchId}">ASSISTIR</span>` : p.table?.open ? `<span class="mini ghost" data-act="sq-join" data-arg="${p.id}">SENTAR</span>` : ''}</div>`).join('')
      || '<div class="pempty"><b>VOCÊ É O PRIMEIRO AQUI</b>TOQUE EM CONVIDAR E MANDE O LINK PRO PESSOAL. QUEM ABRIR CAI DIRETO NA ARENA.</div>';
    const rankDb = this.rank.map((r, i) => `<div class="rrow ${i < 3 ? 'top' + (i + 1) : ''}"><b>${i + 1}</b><span>${esc(r.name)}</span><i>${r.points} PTS</i><em>${r.wins}V ${r.losses}D</em></div>`).join('');
    const rankSess = [...this.score.entries()].sort((a, b) => b[1].w - a[1].w || a[1].l - b[1].l).slice(0, 8).map(([n, sc], i) => `<div class="rrow"><b>${i + 1}</b><span>${esc(n)}</span><i>${sc.w}V</i><em>${sc.l}D</em></div>`).join('');
    const lives = [...this.liveMatches().values()].map((p) => `<span class="live" data-act="watch" data-arg="${p.matchId}"><i>● AO VIVO</i> ${esc(p.vs ?? '')} <u>ASSISTIR</u></span>`).join('');
    return `${this.topBar('ARENA', ONLINE ? 'V4 FIGHTERS ONLINE' : 'MODO LOCAL · SÓ ABAS DESTE NAVEGADOR', null)}
      <div class="ar-main"><div class="ar-cards">${cards}</div>
        <div class="ar-side"><div class="tabs"><span class="${this.tab === 'gente' ? 'on' : ''}" data-act="tab" data-arg="gente">NA ARENA · ${others.length}</span><span class="${this.tab === 'ranking' ? 'on' : ''}" data-act="tab" data-arg="ranking">RANKING</span></div>
          <div class="ar-list">${this.tab === 'gente' ? rows : rankDb || rankSess || '<div class="pempty">SEM LUTAS AINDA</div>'}</div></div></div>
      <div class="ar-foot">${lives}${this.feed.slice(0, 3).map((f) => `<span class="news">${esc(f)}</span>`).join('') || (lives ? '' : '<span class="news">AS ÚLTIMAS DA ARENA APARECEM AQUI</span>')}</div>`;
  }

  // ---------- duplas: mesas abertas
  private tablesHtml() {
    const tables = this.peers.filter((p) => p.id !== this.me.id && p.table);
    const list = tables.map((p) => `<div class="trow ${p.table!.open ? '' : 'busy'}">${this.face(p.fighter, 'lg')}<div class="pn"><b>MESA DE ${esc(p.name)}</b><small>${p.table!.n}/4 SENTADOS · ${p.table!.open ? 'ESPERANDO GENTE' : 'JÁ COMEÇOU'}</small></div>${p.table!.open ? `<span class="cta sm" data-act="sq-join" data-arg="${p.id}">SENTAR</span>` : p.matchId ? `<span class="cta sm ghost" data-act="watch" data-arg="${p.matchId}">ASSISTIR</span>` : ''}</div>`).join('')
      || '<div class="pempty"><b>NENHUMA MESA ABERTA</b>CRIE A SUA E CHAME O PESSOAL: ELA APARECE AQUI PRA TODO MUNDO DA ARENA.</div>';
    const step = (n: string, t: string, d: string) => `<div class="step"><b>${n}</b><div><h4>${t}</h4><small>${d}</small></div></div>`;
    return `${this.topBar('DUPLAS 2x2', 'DUAS DUPLAS · UMA LUTA SÓ · QUEM CAIR POR ÚLTIMO PERDE', 'hub')}
      <div class="ar-main"><div class="ar-tables"><h4>MESAS ABERTAS</h4>${list}<div class="cta big" data-act="sq-new">+ CRIAR MESA</div></div>
        <div class="ar-how"><h4>COMO FUNCIONA</h4>
          ${step('1', 'SENTE NA MESA', 'De 2 a 4 pessoas. Quem ficar sozinho num lado controla os dois lutadores da dupla.')}
          ${step('2', 'CONFIRME E ESCOLHA', 'Todo mundo escolhe ao mesmo tempo. Escolheu, travou: ninguém repete lutador. O anfitrião escolhe o cenário.')}
          ${step('3', 'TROQUE NA HORA CERTA', 'Botão TROCA (tecla T): seu parceiro entra num pulo por trás e você descansa, recuperando um pouco de vida.')}
          ${step('4', 'CAIU? ENTRA O PARCEIRO', 'A dupla só perde quando os dois forem nocauteados.')}</div></div>`;
  }

  // ---------- duplas: dentro da mesa (mesa · partida encontrada · escolha · contagem)
  private duoHtml() {
    const sq = this.squad!, st = sq.state;
    if (!st) return `<div class="center"><div class="title-sm">SENTANDO NA MESA…</div><div class="lb-btn ghost" data-act="sq-leave">CANCELAR</div></div>`;
    const host = st.members.find((m) => m.id === st.host), meId = this.me.id;
    const tag = (m: { id: string }) => `${m.id === st.host ? '<i class="crown">★ ANFITRIÃO</i>' : ''}${m.id === meId ? '<i class="you">VOCÊ</i>' : ''}`;
    if (sq.solo && (st.phase === 'mesa' || st.phase === 'luta')) return `<div class="center"><div class="title-sm">DUELO</div><div class="wait">${st.members.length < 2 && st.note ? 'O ADVERSÁRIO SAIU' : 'ABRINDO A TELA DE ESCOLHA COM O ADVERSÁRIO…'}</div><div class="lb-btn ghost" data-act="sq-leave">SAIR</div></div>`;
    if (st.phase === 'mesa' || st.phase === 'luta') {
      const side = (t: 0 | 1) => { const ms = st.members.filter((m) => m.team === t), mine = sq.mine?.team === t;
        return `<div class="team t${t}"><h3>${t === 0 ? 'DUPLA AZUL' : 'DUPLA VERMELHA'}</h3>${[0, 1].map((k) => ms[k]
          ? `<div class="seat">${this.face(ms[k].fighter, 'xl')}<div><b>${esc(ms[k].name)}</b>${tag(ms[k])}</div></div>`
          : `<div class="seat free" ${mine ? '' : `data-act="sq-team" data-arg="${t}"`}><span class="av xl"><b>+</b></span><div><b>${ms.length === 1 && k === 1 ? 'VAGA' : 'VAGA'}</b><small>${mine ? (ms.length === 1 ? 'SE NINGUÉM SENTAR, VOCÊ CONTROLA OS DOIS' : 'ESPERANDO ALGUÉM') : 'TOQUE PRA VIR PRA ESTE LADO'}</small></div></div>`).join('')}</div>`; };
      return `${this.topBar('MESA DE DUPLAS', `ANFITRIÃO: ${esc(host?.name ?? '')}`, null).replace('data-act="back"', 'data-act="sq-leave"').replace('>SAIR<', '>SAIR DA MESA<')}
        <div class="ar-mesa">${side(0)}<div class="mid"><div class="vsbig">VS</div>
          ${st.note ? `<div class="note">${esc(st.note)}</div>` : ''}
          ${st.phase === 'luta' ? '<div class="wait">A LUTA AINDA ESTÁ ROLANDO…</div>' : sq.isHost ? `<div class="cta big ${sq.canStart ? '' : 'off'}" data-act="sq-start">▶ INICIAR</div><small>${sq.canStart ? `${st.members.length} NA MESA · PODE COMEÇAR` : 'PRECISA DE ALGUÉM DO OUTRO LADO'}</small>` : `<div class="wait">ESPERANDO ${esc(host?.name ?? '')} INICIAR</div>`}
          </div>${side(1)}</div>`;
    }
    if (st.phase === 'confirma') {
      const col = (t: 0 | 1) => `<div class="fcol t${t}">${st.members.filter((m) => m.team === t).map((m) => `<div class="fm ${m.ok ? 'ok' : ''}">${this.face(m.fighter, 'xl')}<b>${esc(m.name)}</b><i>${m.ok ? '✔ PRONTO' : '…'}</i></div>`).join('')}</div>`;
      return `<div class="found">${col(0)}<div class="fmid"><div class="count" data-until="${sq.until}" data-fmt="n"></div><h2>PARTIDA ENCONTRADA</h2>
        ${sq.mine?.ok ? '<div class="wait">CONFIRMADO · ESPERANDO OS OUTROS</div>' : '<div class="cta big" data-act="sq-ok">CONFIRMAR</div>'}<small>QUEM NÃO CONFIRMAR A TEMPO VOLTA PRA MESA</small></div>${col(1)}</div>`;
    }
    // escolha (e contagem final, com tudo travado)
    const go = st.phase === 'vai', mySeat = sq.mySeat, nameOf = (id: string) => st.members.find((m) => m.id === id)?.name ?? '?';
    const seatCard = (i: number) => { const x = st.seats[i], fid = x.fighter ?? x.hover ?? '', f = this.F(fid);
      return `<div class="dseat ${x.locked ? 'locked' : ''} ${i === mySeat ? 'mine' : ''}" style="--c:${f?.def.colors.primary ?? '#3d4a63'}"><div class="dthumb">${f?.portrait ? `<img src="${f.portrait.src}" alt="">` : '<b>?</b>'}</div>
        <b>${esc(nameOf(x.owner))}${x.owner === meId ? ' (VOCÊ)' : ''}</b><small>${x.locked ? `🔒 ${esc(f?.def.name ?? '')}` : f ? `OLHANDO ${esc(f.def.name)}…` : 'ESCOLHENDO…'}</small></div>`; };
    const team = (t: 0 | 1) => `<div class="dteam t${t} ${sq.solo ? 'solo' : ''}"><h3>${sq.solo ? (t === 0 ? 'AZUL' : 'VERMELHO') : t === 0 ? 'DUPLA AZUL' : 'DUPLA VERMELHA'}</h3>${st.seats.map((x, i) => (x.team === t ? seatCard(i) : '')).join('')}</div>`;
    const taken = (id: string) => { const x = st.seats.find((q) => q.locked && q.fighter === id); return x ? nameOf(x.owner) : ''; };
    const stages = ['random', ...this.hooks.stages()];
    const stageStrip = `<div class="stages ${sq.isHost && !go ? 'host' : ''}">${stages.map((n) => `<span class="${st.stage === n ? 'on' : ''}" ${sq.isHost && !go ? `data-act="sq-stage" data-arg="${n}"` : ''} ${n === 'random' ? '' : `style="background-image:url(${BASE}stages/${n}.png)"`}>${n === 'random' ? '?' : ''}</span>`).join('')}</div>`;
    const show = mySeat >= 0 ? this.pick : (st.seats.find((x) => x.owner === meId)?.fighter ?? this.pick);
    const pickName = this.F(this.pick)?.def.name ?? '';
    return `<div class="draft">${team(0)}
      <div class="dmid"><div class="dhead">${go ? '' : `<span class="mini ghost" data-act="sq-leave">‹ SAIR</span>`}<h2>${go ? 'TUDO PRONTO!' : mySeat >= 0 ? (st.seats.filter((x) => x.owner === meId).length > 1 ? `ESCOLHA O ${st.seats.findIndex((x) => x.owner === meId) === mySeat ? '1º' : '2º'} LUTADOR` : 'ESCOLHA SEU LUTADOR') : 'ESPERANDO OS OUTROS'}</h2><div class="count sm" data-until="${sq.until}" data-fmt="n"></div></div>
        ${this.showcase(show, sq.mine?.team === 1)}
        ${this.grid('sq-pick', taken, 8)}
        <div class="dfoot"><div class="stagebox"><small>CENÁRIO${sq.isHost ? ' (VOCÊ ESCOLHE)' : ` · ${esc(host?.name ?? '')} ESCOLHE`}</small>${stageStrip}</div>
          ${go ? `<div class="wait">A LUTA COMEÇA EM <b data-until="${sq.until}" data-fmt="n"></b></div>` : mySeat >= 0 ? `<div class="cta big ${this.pick && !sq.taken(this.pick) ? '' : 'off'}" data-act="sq-lock">🔒 TRAVAR ${esc(pickName)}</div>` : '<div class="wait">TRAVADO ✔</div>'}</div></div>
      ${team(1)}</div>`;
  }

  // ---------- campeonato: sala de escolha (todo mundo escolhe junto), chave em organograma e campeão
  private copaHtml() {
    const t = this.tour, top = (sub: string) => this.topBar('CAMPEONATO', sub, 'hub');
    if (!store.storeReady) return `${top('PRECISA DO SUPABASE CONFIGURADO')}<div class="ar-main"><div class="pempty">SEM BANCO DE DADOS NESTE AMBIENTE.</div></div>`;
    if (!t || this.creating) return `${top('MATA-MATA · UM LUTADOR POR PESSOA')}<div class="champ"><div class="wait">ABRINDO A SALA DO CAMPEONATO…</div></div>`;
    const me = this.tid, mine = this.tEntries.find((e) => e.player_id === me), runs = this.runsTourney;
    if (t.status === 'inscricoes') {
      const takenBy = (id: string) => { const e = this.tEntries.find((x) => x.fighter === id); return e ? (e.player_id === me ? 'VOCÊ' : e.name) : ''; };
      const free = (id: string) => !this.tEntries.some((x) => x.fighter === id && x.player_id !== me);
      const pick = this.pick && free(this.pick) ? this.pick : '';
      const ready = this.cupReady, full = ready.length >= CUP.MAX && !mine, counting = this.tCount > 0;
      const enrolled = this.tEntries.map((e) => { const on = this.isOnline(e.player_id), inCup = ready.includes(e);
        return `<div class="prow in ${on && inCup ? 'glow' : 'off'}" style="--c:${this.F(e.fighter)?.def.colors.primary ?? '#3d4a63'}">${this.face(e.fighter)}<div class="pn"><b>${esc(e.name)}${e.player_id === me ? ' (VOCÊ)' : ''}</b><small>🔒 ${esc(this.F(e.fighter)?.def.name ?? e.fighter)}</small></div><span class="mini ${on && inCup ? 'ok' : 'ghost'}">${!on ? 'FORA DA SALA' : inCup ? '✔ CONFIRMADO' : 'SEM VAGA'}</span>${!on && runs ? `<span class="mini kick" data-act="tkick" data-arg="${esc(e.player_id)}" title="tirar da chave">✕</span>` : ''}</div>`; }).join('');
      const looking = this.peers.filter((p) => !this.tEntries.some((e) => e.player_id === this.tidOf(p))).map((p) => `<div class="prow look" style="--c:#3d4a63">${this.face(p.fighter)}<div class="pn"><b>${esc(p.name)}${p.id === this.me.id ? ' (VOCÊ)' : ''}</b><small>${ready.length >= CUP.MAX ? 'ASSISTINDO' : `ESCOLHENDO… ${esc(this.F(p.fighter)?.def.name ?? '')}`}</small></div><span class="mini ghost">NÃO CONFIRMOU</span></div>`).join('');
      const btn = full ? '<div class="wait">AS 10 VAGAS FECHARAM · VOCÊ ASSISTE ÀS LUTAS</div>' : !pick ? '<div class="cta big off">ESCOLHA UM LUTADOR LIVRE</div>' : !mine ? `<div class="cta big" data-act="tjoin" data-arg="${pick}">🔒 CONFIRMAR ${esc(this.F(pick)?.def.name ?? '')}</div>`
        : mine.fighter !== pick ? `<div class="cta big" data-act="tjoin" data-arg="${pick}">TROCAR PARA ${esc(this.F(pick)?.def.name ?? '')}</div>` : '<div class="wait">CONFIRMADO ✔</div>';
      const startBox = counting ? `<div class="cup-count"><small>AS CHAVES FECHAM EM</small><b data-until="${this.tCount}" data-fmt="n"></b><small>AINDA DÁ PRA TROCAR DE LUTADOR</small>${this.tCountMine || runs ? '<span class="mini ghost" data-act="tcancel">CANCELAR</span>' : ''}</div>`
        : mine ? `<div class="cta ${ready.length >= 2 ? '' : 'off'}" data-act="tstart">⚔ COMEÇAR AGORA · ${ready.length}/${CUP.MAX}</div><small class="hint">${ready.length >= 2 ? 'COM 10 CONFIRMADOS COMEÇA SOZINHO. QUEM NÃO CONFIRMAR, ASSISTE.' : 'PRECISA DE 2 CONFIRMADOS NA SALA'}</small>`
        : `<small class="hint">${ready.length}/${CUP.MAX} CONFIRMADOS · CONFIRME UM LUTADOR PRA COMPETIR, OU FIQUE PRA ASSISTIR</small>`;
      return `${top(`${esc(t.name)} · ESCOLHA E CONFIRME O SEU LUTADOR`)}
        <div class="copa-room"><div class="cr-left"><h4>LUTADORES</h4>${this.grid('tpick', takenBy, 3)}</div>
          <div class="cr-mid">${this.showcase(pick || mine?.fighter || '')}<div class="cr-act">${btn}${mine ? '<span class="mini ghost" data-act="tleave">DESCONFIRMAR</span>' : ''}</div></div>
          <div class="cr-right"><h4>NA SALA · ${ready.length}/${CUP.MAX} CONFIRMADOS</h4><div class="ar-list">${enrolled}${looking}</div>${startBox}</div></div>`;
    }
    // chave em organograma: cada coluna é uma fase; as linhas ligam cada luta à seguinte
    const rounds = Math.max(0, ...this.tMatches.map((m) => m.round)) + 1, fOf = (id: string | null) => this.tEntries.find((e) => e.player_id === id)?.fighter ?? '';
    const label = (r: number) => (r === rounds - 1 ? 'FINAL' : r === rounds - 2 ? 'SEMIFINAL' : r === rounds - 3 ? 'QUARTAS' : `FASE ${r + 1}`);
    const cols = Array.from({ length: rounds }, (_, r) => `<div class="bcol ${r === rounds - 1 ? 'last' : ''}"><h4>${label(r)}</h4><div class="bms">${this.tMatches.filter((m) => m.round === r).map((m) => {
      const live = m.status === 'chamando' || m.status === 'lutando', mineM = m.p1 === me || m.p2 === me, bye = r === 0 && (!m.p1 || !m.p2);
      const pl = (id: string | null, nm: string | null) => `<div class="bp ${m.winner && m.winner === id ? 'win' : m.winner ? 'lost' : ''}" style="--c:${this.F(fOf(id))?.def.colors.primary ?? '#3d4a63'}">${this.face(fOf(id))}<b>${esc(nm ?? (bye ? 'FOLGA' : 'A DEFINIR'))}</b>${m.winner && m.winner === id ? '<i>✔</i>' : ''}</div>`;
      return `<div class="bslot"><div class="bm ${live ? 'live' : ''} ${mineM ? 'mine' : ''} ${r === 0 && !m.p1 && !m.p2 ? 'void' : ''}">${pl(m.p1, m.p1_name)}<em class="bvs">${m.status === 'lutando' ? '● AO VIVO' : m.status === 'chamando' ? 'CHAMANDO…' : 'VS'}</em>${pl(m.p2, m.p2_name)}
        ${m.status === 'lutando' && !mineM ? `<span class="cta sm ghost" data-act="twatch" data-arg="${m.id}">ASSISTIR</span>` : ''}
        ${live && runs && !mineM ? `<span class="wo"><u data-act="two" data-arg="${m.id}:1">W.O. ${esc(m.p1_name ?? '')}</u><u data-act="two" data-arg="${m.id}:2">W.O. ${esc(m.p2_name ?? '')}</u></span>` : ''}</div></div>`;
    }).join('')}</div></div>`).join('');
    const champ = t.status === 'fim' ? this.tEntries.find((e) => e.name === t.champion) : null;
    const call = this.tMatches.find((m) => (m.status === 'chamando' || m.status === 'lutando') && (m.p1 === me || m.p2 === me));
    const callHtml = call ? `<div class="bcall"><small>${label(call.round)} · É A SUA VEZ</small><div class="bcall-vs">${this.face(fOf(call.p1), 'xl')}<b>${esc(call.p1_name ?? '')}</b><i>VS</i><b>${esc(call.p2_name ?? '')}</b>${this.face(fOf(call.p2), 'xl')}</div>
      <div class="cta big" data-act="tplay" data-arg="${call.id}">⚔ CONFIRMAR BATALHA</div><small>A LUTA COMEÇA QUANDO OS DOIS CONFIRMAREM. O RESTO DA SALA ASSISTE.</small></div>` : '';
    return `${top(`${esc(t.name)} · ${t.status === 'fim' ? 'ENCERRADO' : 'DOIS LUTAM, O RESTO ASSISTE'}`)}<div class="bracket">${cols}
      <div class="bcol cupcol"><h4>CAMPEÃO</h4><div class="bms"><div class="bchamp ${champ ? 'on' : ''}">${champ ? this.face(champ.fighter, 'xl') : '<div class="cup">🏆</div>'}<b>${esc(t.champion ?? '?')}</b>${t.status === 'fim' ? '<span class="cta sm" data-act="tnew">NOVO CAMPEONATO</span>' : ''}</div></div></div></div>${callHtml}`;
  }

  /** O painel lateral tem duas partes: a lista (redesenhada quando muda) e o chat, que fica fixo pra não perder o que está sendo digitado. */
  private sideBox() {
    if (this.sideDyn && this.side.contains(this.sideDyn)) return this.sideDyn;
    this.side.innerHTML = '<div class="rm-dyn"></div><div class="rm-chat"><div class="rm-sec">CHAT DA SALA</div><div class="rm-log"></div><form><input maxlength="120" placeholder="ESCREVA AQUI…" autocomplete="off"><button type="submit">▶</button></form></div>';
    this.sideDyn = this.side.querySelector<HTMLElement>('.rm-dyn')!; this.chatLog = this.side.querySelector<HTMLElement>('.rm-log')!;
    const form = this.side.querySelector('form')!, inp = form.querySelector('input')!;
    for (const ev of ['keydown', 'keyup', 'keypress'] as const) inp.addEventListener(ev, (e) => e.stopPropagation());     // digitar não pode mexer no jogo
    form.addEventListener('submit', (e) => {
      e.preventDefault(); const x = inp.value.trim().slice(0, 120); if (!x) return; inp.value = '';
      this.room?.send({ t: 'chat', n: this.me.name, f: this.me.fighter, x }); this.pushChat({ n: this.me.name, f: this.me.fighter, x, me: true });
    });
    this.paintChat();
    return this.sideDyn;
  }
  private pushChat(m: { n: string; f: string; x: string; me?: boolean }) { this.chat.push(m); if (this.chat.length > 40) this.chat.shift(); if (!m.me) audio.sfx('menuMove'); this.paintChat(); }
  private paintChat() {
    if (!this.chatLog) return;
    this.chatLog.innerHTML = this.chat.map((m) => `<div class="rm-msg ${m.me ? 'me' : ''}" style="--c:${this.F(m.f)?.def.colors.primary ?? '#8fa5c8'}"><b>${esc(m.n)}</b> ${esc(m.x)}</div>`).join('') || '<div class="rm-msg none">NINGUÉM FALOU NADA AINDA. PROVOQUE ALGUÉM.</div>';
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }
  private bumpToggle() { const tg = document.getElementById('room-toggle'); tg?.classList.remove('bump'); void tg?.offsetWidth; tg?.classList.add('bump'); }

  /** Painel "SALA" ao lado da tela: quem está online, o que cada um está fazendo, desafios e lutas pra assistir. */
  private paintSide() {
    const tg = document.getElementById('room-toggle')!;
    if (!this.room || !this.me.name) return;
    if (!document.body.classList.contains('online')) {
      document.body.classList.add('online'); tg.hidden = false;
      if (window.innerWidth >= 1000) document.body.classList.add('room-open');   // no computador já abre ao lado da tela
      window.dispatchEvent(new Event('resize'));
    }
    tg.querySelector('b')!.textContent = String(this.peers.length);
    const F = (fid: string) => this.F(fid);
    const busy = this.me.status === 'lutando', out = this.invites.out;
    const label: Record<string, string> = { livre: 'LIVRE', procurando: 'QUER LUTAR', lutando: 'LUTANDO', assistindo: 'ASSISTINDO', dupla: 'NAS DUPLAS' };
    const row = (p: Peer, me = false) => `<div class="rm-row ${me ? 'me' : ''}" style="--c:${F(p.fighter)?.def.colors.primary ?? '#3d4a63'}"><div class="rm-av">${this.img(p.fighter)}</div>
      <div class="rm-name">${esc(p.name)}${me ? ' (VOCÊ)' : ''}<small>${esc(F(p.fighter)?.def.name ?? '')}${p.status === 'lutando' && p.vs ? ' · ' + esc(p.vs) : ''}</small></div>
      ${!me && !busy && (p.status === 'livre' || p.status === 'procurando')
        ? (out?.to.id === p.id ? '<span class="rm-st procurando">AGUARDANDO</span>' : `<button class="rm-btn${out ? ' off' : ''}" data-act="challenge" data-arg="${p.id}">DESAFIAR</button>`)
        : !me && !busy && p.status === 'lutando' && p.matchId ? `<button class="rm-btn ghost" data-act="watch" data-arg="${p.matchId}">ASSISTIR</button>` : `<span class="rm-st ${p.status}">${label[p.status]}</span>`}</div>`;
    const others = this.peers.filter((p) => p.id !== this.me.id);
    const watchers = busy ? this.peers.filter((p) => p.status === 'assistindo' && p.matchId === this.me.matchId) : [];
    this.put(this.sideBox(), `<div class="rm-wrap"><div class="rm-head"><span>SALA ${this.peers.length}/${MAX_PEERS}</span><i class="${ONLINE ? '' : 'off'}">● ${ONLINE ? 'ONLINE' : 'LOCAL'}</i></div>
      ${this.inviteHtml(false)}
      ${row(this.me, true)}
      <div class="rm-sec">NA SALA</div>${others.map((p) => row(p)).join('') || '<div class="rm-empty">SÓ VOCÊ POR ENQUANTO.<br>MANDE O LINK DE CONVITE.</div>'}
      ${watchers.length ? `<div class="rm-sec">ASSISTINDO SUA LUTA</div><div class="rm-empty" style="border-style:solid">${watchers.map((p) => esc(p.name)).join(' · ')}</div>` : ''}
      ${this.feed.length ? `<div class="rm-sec">ÚLTIMAS</div>${this.feed.slice(0, 4).map((f) => `<div class="rm-note">${esc(f)}</div>`).join('')}` : ''}</div>`);
    this.tickCountdowns();
  }

}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
