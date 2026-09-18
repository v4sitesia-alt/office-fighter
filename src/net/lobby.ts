// Arena online: quem está conectado, desafios 1x1, lutas ao vivo pra assistir e placar da sessão.
import type { FighterAssets } from '../game/types';
import { audio } from '../core/audio';
import { joinRoom, ONLINE, type Msg, type Peer, type Room } from './transport';
import * as store from './store';

export interface NetMatchCfg { matchId: string; f: [string, string]; names: [string, string]; ids?: [string, string]; local: 0 | 1 | -1; tourney?: { t: store.Tournament; m: store.TMatch } }

export const MAX_PEERS = 15;   // teto da rede: 9 jogadores + plateia, dentro da cota gratuita do Supabase

export class Lobby {
  private room: Room | null = null;
  private peers: Peer[] = [];
  private score = new Map<string, { w: number; l: number }>();
  private feed: string[] = [];
  private incoming: { from: Peer; matchId: string } | null = null;
  private waiting: string | null = null;   // id de quem eu desafiei
  private rank: store.RankRow[] = [];
  private tour: store.Tournament | null = null; private tEntries: store.Entry[] = []; private tMatches: store.TMatch[] = [];
  private unwatch: (() => void) | null = null; private refreshing = false;
  me: Peer;

  constructor(private root: HTMLElement, private roster: FighterAssets[], private onMatch: (cfg: NetMatchCfg) => void, private onExit: () => void) {
    let id = sessionStorage.getItem('v4f-id');
    if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('v4f-id', id); }
    this.me = { id, name: localStorage.getItem('v4f-name') ?? '', fighter: roster[0].def.id, status: 'livre' };
  }

  open(fighterId: string) {
    this.me.fighter = fighterId; this.me.status = 'livre'; this.me.matchId = undefined; this.me.vs = undefined;
    this.root.className = 'screens show lobby';
    if (!this.me.name) { this.askName(); return; }
    if (!this.room) this.room = joinRoom('lobby', this.me, { onMsg: (m) => this.onMsg(m), onPeers: (p) => { this.peers = p; this.paint(); } });
    else this.room.setPresence(this.me);
    void store.upsertPlayer(this.me.id, this.me.name, this.me.fighter);
    this.unwatch ??= store.watch(() => void this.refresh());
    void this.refresh();
    this.paint();
  }
  close() { this.room?.leave(); this.room = null; this.unwatch?.(); this.unwatch = null; }

  /** Relê ranking e campeonato; mantém minha inscrição com o lutador atual e chama a próxima luta da fila. */
  private async refresh() {
    if (!store.storeReady || this.refreshing) return;
    this.refreshing = true;
    try {
      this.rank = await store.ranking();
      this.tour = await store.currentTournament();
      if (this.tour) {
        [this.tEntries, this.tMatches] = await Promise.all([store.entries(this.tour.id), store.matches(this.tour.id)]);
        const mine = this.tEntries.find((e) => e.player_id === this.me.id);
        const myLive = this.tMatches.some((m) => (m.p1 === this.me.id || m.p2 === this.me.id) && m.status === 'lutando');
        const taken = this.tEntries.some((e) => e.player_id !== this.me.id && e.fighter === this.me.fighter);
        if (mine && mine.fighter !== this.me.fighter && !myLive && !taken) await store.joinTournament(this.tour.id, this.me.id, this.me.name, this.me.fighter); // trocou de lutador
        // uma luta por vez: o organizador chama a próxima quando não há nenhuma em andamento
        if (this.tour.status === 'andamento' && this.tour.owner === this.me.id && !this.tMatches.some((m) => m.status === 'chamando' || m.status === 'lutando')) {
          const next = this.tMatches.find((m) => m.status === 'pendente' && m.p1 && m.p2);
          if (next) await store.patchMatch(next.id, { status: 'chamando' });
        }
      } else { this.tEntries = []; this.tMatches = []; }
    } catch (e) { console.warn('supabase', e); }
    this.refreshing = false;
    this.paint();
  }

  /** Avisa o saguão do estado atual (lutando/assistindo) sem sair dele. */
  setStatus(status: Peer['status'], matchId?: string, vs?: string) {
    this.me.status = status; this.me.matchId = matchId; this.me.vs = vs; this.room?.setPresence(this.me);
  }
  report(cfg: NetMatchCfg, winner: 0 | 1) {
    const w = cfg.names[winner], l = cfg.names[1 - winner];
    this.room?.send({ t: 'result', winner: w, loser: l }); this.addResult(w, l);
    if (cfg.ids) void store.recordResult({ id: cfg.ids[winner], name: w }, { id: cfg.ids[1 - winner], name: l });
    if (cfg.tourney && cfg.ids) void store.finishMatch(cfg.tourney.t, cfg.tourney.m, cfg.ids[winner], w);
  }

  private addResult(winner: string, loser: string) {
    const s = (n: string) => this.score.get(n) ?? (this.score.set(n, { w: 0, l: 0 }), this.score.get(n)!);
    s(winner).w++; s(loser).l++;
    this.feed.unshift(`${winner} venceu ${loser}`); this.feed.length = Math.min(this.feed.length, 6);
    this.paint();
  }

  private onMsg(m: Msg) {
    if (m.t === 'result') { this.addResult(m.winner as string, m.loser as string); return; }
    if (m.to !== this.me.id) return;
    if (m.t === 'challenge' && this.me.status === 'livre' && !this.incoming) { this.incoming = { from: m.from as Peer, matchId: m.matchId as string }; audio.sfx('selectChar'); this.paint(); }
    else if (m.t === 'challenge') this.room?.send({ t: 'decline', to: (m.from as Peer).id });
    else if (m.t === 'decline' && this.waiting) { this.waiting = null; this.feed.unshift('Desafio recusado'); this.paint(); }
    else if (m.t === 'accept' && this.waiting) {
      const other = m.from as Peer; this.waiting = null;
      this.onMatch({ matchId: m.matchId as string, f: [this.me.fighter, other.fighter], names: [this.me.name, other.name], ids: [this.me.id, other.id], local: 0 });
    }
  }

  private askName() {
    this.root.innerHTML = `<div class="center"><div class="title-sm">ARENA ONLINE</div><div class="pix small">COMO VOCÊ QUER SER CHAMADO?</div>
      <input class="lb-input" maxlength="14" placeholder="SEU NOME" autofocus><div class="lb-btn" data-ok>ENTRAR</div><div class="lb-btn ghost" data-back>VOLTAR</div></div>`;
    const inp = this.root.querySelector<HTMLInputElement>('.lb-input')!;
    const ok = () => { const v = inp.value.trim().toUpperCase(); if (!v) return; this.me.name = v; localStorage.setItem('v4f-name', v); this.open(this.me.fighter); };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') ok(); });
    inp.addEventListener('keyup', (e) => e.stopPropagation());
    this.root.querySelector<HTMLElement>('[data-ok]')!.onclick = ok;
    this.root.querySelector<HTMLElement>('[data-back]')!.onclick = () => this.onExit();
  }

  private paint() {
    if (!this.root.classList.contains('lobby') || !this.me.name) return;
    const img = (fid: string) => { const f = this.roster.find((r) => r.def.id === fid); return f?.portrait ? `<img src="${f.portrait.src}" alt="">` : ''; };
    const others = this.peers.filter((p) => p.id !== this.me.id);
    const full = this.peers.length > MAX_PEERS && this.peers.slice(MAX_PEERS).some((p) => p.id === this.me.id);
    if (full) { this.root.innerHTML = `<div class="center"><div class="title-sm">ARENA LOTADA</div><div class="pix small">JÁ TEM ${MAX_PEERS} PESSOAS CONECTADAS. TENTE DAQUI A POUCO.</div><div class="lb-btn ghost" data-back>VOLTAR</div></div>`; this.root.querySelector<HTMLElement>('[data-back]')!.onclick = () => this.onExit(); return; }
    const rows = others.map((p) => `<div class="lb-row"><div class="lb-av">${img(p.fighter)}</div><div class="lb-name">${esc(p.name)}<small>${p.status === 'livre' ? 'LIVRE' : p.status === 'lutando' ? `LUTANDO · ${esc(p.vs ?? '')}` : 'ASSISTINDO'}</small></div>
      ${p.status === 'livre' ? `<div class="lb-btn sm" data-ch="${p.id}">${this.waiting === p.id ? 'AGUARDANDO…' : 'DESAFIAR'}</div>` : ''}</div>`).join('') || '<div class="pix tiny">NINGUÉM MAIS ONLINE. MANDE O LINK PRA GALERA.</div>';
    const live = new Map<string, Peer>(); this.peers.forEach((p) => { if (p.status === 'lutando' && p.matchId && !live.has(p.matchId)) live.set(p.matchId, p); });
    const lives = [...live.values()].map((p) => `<div class="lb-row"><div class="lb-name">${esc(p.vs ?? '')}<small>AO VIVO</small></div><div class="lb-btn sm" data-watch="${p.matchId}">ASSISTIR</div></div>`).join('') || '<div class="pix tiny">NENHUMA LUTA AGORA</div>';
    const rankDb = this.rank.map((r, i) => `<div class="lb-rank"><b>${i + 1}º</b><span>${esc(r.name)}</span><i>${r.points} PTS · ${r.wins}V ${r.losses}D</i></div>`).join('');
    const rankSess = [...this.score.entries()].sort((a, b) => b[1].w - a[1].w || a[1].l - b[1].l).slice(0, 6)
      .map(([n, s], i) => `<div class="lb-rank"><b>${i + 1}º</b><span>${esc(n)}</span><i>${s.w}V ${s.l}D</i></div>`).join('');
    const rank = rankDb || rankSess || '<div class="pix tiny">SEM LUTAS AINDA</div>';
    this.root.innerHTML = `<div class="lb">
      <div class="lb-head"><div class="title-sm">ARENA ONLINE</div><div class="pix tiny">${ONLINE ? 'CONECTADO' : 'MODO LOCAL (SÓ ABAS DESTE NAVEGADOR)'} · VOCÊ: ${esc(this.me.name)} · ${this.peers.length}/${MAX_PEERS} ONLINE</div></div>
      <div class="lb-col"><h4>JOGADORES</h4>${rows}</div>
      <div class="lb-col"><h4>LUTAS AO VIVO</h4>${lives}<h4>CAMPEONATO</h4>${this.tourHtml()}<h4>RANKING</h4>${rank}<h4>ÚLTIMAS</h4>${this.feed.map((f) => `<div class="pix tiny">${esc(f)}</div>`).join('')}</div>
      <div class="lb-foot"><div class="lb-btn ghost" data-back>SAIR</div></div>
      ${this.incoming ? `<div class="lb-modal"><div class="lb-av big">${img(this.incoming.from.fighter)}</div><div class="pix">${esc(this.incoming.from.name)} TE DESAFIOU!</div><div class="lb-btn" data-acc>ACEITAR</div><div class="lb-btn ghost" data-dec>RECUSAR</div></div>` : ''}</div>`;
    const on = (sel: string, fn: (el: HTMLElement) => void) => this.root.querySelectorAll<HTMLElement>(sel).forEach((el) => { el.onclick = () => { audio.sfx('menuConfirm'); fn(el); }; });
    on('[data-ch]', (el) => {
      if (this.waiting) return;
      const to = el.dataset.ch!; this.waiting = to;
      this.room?.send({ t: 'challenge', to, from: this.me, matchId: `${this.me.id}-${Date.now().toString(36)}` }); this.paint();
      setTimeout(() => { if (this.waiting === to) { this.waiting = null; this.paint(); } }, 15000);
    });
    on('[data-watch]', (el) => {
      const p = [...live.values()].find((x) => x.matchId === el.dataset.watch); if (!p) return;
      const [a, b] = (p.vs ?? ' x ').split(' x ');
      const fa = this.peers.find((x) => x.name === a)?.fighter ?? this.roster[0].def.id, fb = this.peers.find((x) => x.name === b)?.fighter ?? this.roster[0].def.id;
      this.onMatch({ matchId: p.matchId!, f: [fa, fb], names: [a, b], local: -1 });
    });
    on('[data-acc]', () => {
      const inc = this.incoming!; this.incoming = null;
      this.room?.send({ t: 'accept', to: inc.from.id, from: this.me, matchId: inc.matchId });
      this.onMatch({ matchId: inc.matchId, f: [inc.from.fighter, this.me.fighter], names: [inc.from.name, this.me.name], ids: [inc.from.id, this.me.id], local: 1 });
    });
    on('[data-dec]', () => { this.room?.send({ t: 'decline', to: this.incoming!.from.id }); this.incoming = null; this.paint(); });
    on('[data-back]', () => this.onExit());
    this.bindTour(on);
  }

  // ---------- campeonato: uma luta por vez, cada um espera a sua
  private tourHtml(): string {
    if (!store.storeReady) return '<div class="pix tiny">PRECISA DO SUPABASE CONFIGURADO</div>';
    const t = this.tour;
    if (!t || t.status === 'fim') return `${t?.champion ? `<div class="pix tiny">ÚLTIMO CAMPEÃO: ${esc(t.champion)}</div>` : ''}<div class="lb-btn sm" data-tnew>CRIAR CAMPEONATO</div>`;
    const inIt = this.tEntries.some((e) => e.player_id === this.me.id), owner = t.owner === this.me.id;
    const takenBy = this.tEntries.find((e) => e.player_id !== this.me.id && e.fighter === this.me.fighter);
    if (t.status === 'inscricoes') {
      return `<div class="pix tiny">${esc(t.name)} · INSCRIÇÕES ABERTAS · ${this.tEntries.length} INSCRITOS</div>
        <div class="pix tiny">${this.tEntries.map((e) => `${esc(e.name)} (${esc(e.fighter.toUpperCase())})`).join(' · ')}</div>
        ${!inIt && takenBy ? `<div class="pix tiny" style="color:#ff8a8a">${esc(takenBy.name)} JÁ ESCOLHEU ESTE LUTADOR. VOLTE E ESCOLHA OUTRO.</div>` : ''}
        <div class="lb-row">${!inIt && takenBy ? '' : `<div class="lb-btn sm" data-tjoin>${inIt ? 'SAIR DA CHAVE' : 'ENTRAR COM ESTE LUTADOR'}</div>`}${owner && this.tEntries.length >= 2 ? '<div class="lb-btn sm" data-tstart>SORTEAR E INICIAR</div>' : ''}</div>`;
    }
    const rounds = Math.max(...this.tMatches.map((m) => m.round)) + 1;
    const label = (r: number) => (r === rounds - 1 ? 'FINAL' : r === rounds - 2 ? 'SEMI' : `FASE ${r + 1}`);
    return `<div class="pix tiny">${esc(t.name)} · EM ANDAMENTO</div>` + this.tMatches.filter((m) => m.p1 || m.p2).map((m) => {
      const live = m.status === 'chamando' || m.status === 'lutando', mineM = m.p1 === this.me.id || m.p2 === this.me.id;
      const n = (id: string | null, nm: string | null) => `<span class="${m.winner && m.winner === id ? 'win' : ''}">${esc(nm ?? '—')}</span>`;
      return `<div class="lb-row t ${live ? 'live' : ''}"><div class="lb-name">${n(m.p1, m.p1_name)} x ${n(m.p2, m.p2_name)}<small>${label(m.round)} · ${m.status.toUpperCase()}</small></div>
        ${live && mineM ? `<div class="lb-btn sm" data-tplay="${m.id}">É SUA VEZ · LUTAR</div>` : m.status === 'lutando' ? `<div class="lb-btn sm" data-twatch="${m.id}">ASSISTIR</div>` : ''}
        ${live && owner && !mineM ? `<div class="lb-btn sm ghost" data-two="${m.id}:1">W.O. ${esc(m.p1_name ?? '')}</div><div class="lb-btn sm ghost" data-two="${m.id}:2">W.O. ${esc(m.p2_name ?? '')}</div>` : ''}</div>`;
    }).join('');
  }

  private bindTour(on: (sel: string, fn: (el: HTMLElement) => void) => void) {
    const t = this.tour;
    const fighterOf = (id: string | null) => this.tEntries.find((e) => e.player_id === id)?.fighter ?? this.roster[0].def.id;
    const cfgOf = (m: store.TMatch, local: 0 | 1 | -1): NetMatchCfg => ({ matchId: m.id, f: [fighterOf(m.p1), fighterOf(m.p2)], names: [m.p1_name ?? '?', m.p2_name ?? '?'], ids: [m.p1!, m.p2!], local, tourney: { t: t!, m } });
    on('[data-tnew]', () => void store.createTournament(`COPA V4 ${new Date().toLocaleDateString('pt-BR')}`, this.me.id).then(() => this.refresh()));
    on('[data-tjoin]', () => {
      if (!t) return;
      const inIt = this.tEntries.some((e) => e.player_id === this.me.id);
      void (inIt ? store.leaveTournament(t.id, this.me.id) : store.joinTournament(t.id, this.me.id, this.me.name, this.me.fighter)).then(() => this.refresh());
    });
    on('[data-tstart]', () => { if (t) void store.startTournament(t, this.tEntries).then(() => this.refresh()); });
    on('[data-tplay]', (el) => {
      const m = this.tMatches.find((x) => x.id === el.dataset.tplay); if (!m) return;
      if (m.p1 === this.me.id) void store.patchMatch(m.id, { status: 'lutando' });
      this.onMatch(cfgOf(m, m.p1 === this.me.id ? 0 : 1));
    });
    on('[data-twatch]', (el) => { const m = this.tMatches.find((x) => x.id === el.dataset.twatch); if (m) this.onMatch(cfgOf(m, -1)); });
    on('[data-two]', (el) => {
      const [id, who] = el.dataset.two!.split(':'); const m = this.tMatches.find((x) => x.id === id); if (!m || !t) return;
      void store.finishMatch(t, m, who === '1' ? m.p1! : m.p2!, (who === '1' ? m.p1_name : m.p2_name) ?? '').then(() => this.refresh());
    });
  }
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
