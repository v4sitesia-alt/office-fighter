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
import * as store from './store';

export interface NetMatchCfg {
  matchId: string; f: [string, string]; names: [string, string]; ids?: [string, string]; local: 0 | 1 | -1;
  tourney?: { t: store.Tournament; m: store.TMatch };
  connectMs?: number;             // quanto esperar o outro entrar (convite: 15 s; campeonato: mais)
}
export interface LobbyHooks {
  start(cfg: NetMatchCfg): void;                // entra numa luta (jogando ou assistindo)
  abort(matchId: string, why: string): void;    // a luta que eu aceitei não vai acontecer
  exit(): void;                                 // saiu da arena
  changeFighter(): void;
}

export const MAX_PEERS = 15;   // teto da rede: 9 jogadores + plateia, dentro da cota gratuita do Supabase

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
  private invites: Invites;
  private timer: ReturnType<typeof setInterval>;
  me: Peer;

  constructor(private root: HTMLElement, private side: HTMLElement, private roster: FighterAssets[], private hooks: LobbyHooks) {
    let id = sessionStorage.getItem('v4f-id');
    if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('v4f-id', id); }
    this.me = { id, name: localStorage.getItem('v4f-name') ?? '', fighter: roster[0].def.id, status: 'livre' };
    this.invites = new Invites(() => this.room, () => this.me, () => this.me.status === 'lutando', {
      start: (matchId, other, local) => this.hooks.start({
        matchId, local, connectMs: 15000,
        f: local === 0 ? [this.me.fighter, other.fighter] : [other.fighter, this.me.fighter],
        names: local === 0 ? [this.me.name, other.name] : [other.name, this.me.name],
        ids: local === 0 ? [this.me.id, other.id] : [other.id, this.me.id],
      }),
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
    this.timer = setInterval(() => { this.tickCountdowns(); if (this.me.status === 'procurando') this.matchmake(); }, 250);
  }

  open(fighterId: string) {
    this.me.fighter = fighterId; this.me.status = 'livre'; this.me.matchId = undefined; this.me.vs = undefined;
    this.root.className = 'screens show lobby';
    if (!this.me.name) { this.askName(); return; }
    if (!this.room) this.room = joinRoom('lobby', this.me, { onMsg: (m) => this.onMsg(m), onPeers: (p) => this.onPeers(p) });
    else this.room.setPresence(this.me);
    void store.upsertPlayer(this.me.id, this.me.name, this.me.fighter);
    this.unwatch ??= store.watch(() => void this.refresh());
    void this.refresh();
    this.paint(true);
  }
  dispose() { clearInterval(this.timer); this.invites.dispose(); }
  close() {
    this.invites.cancel();
    this.room?.leave(); this.room = null; this.unwatch?.(); this.unwatch = null; this.peers = []; this.peersSeen = false;
    document.body.classList.remove('online'); document.getElementById('room-toggle')!.hidden = true; this.side.innerHTML = '';
    window.dispatchEvent(new Event('resize'));
  }

  /** Avisa o saguão do estado atual (lutando/assistindo) sem sair dele. */
  setStatus(status: Peer['status'], matchId?: string, vs?: string) {
    this.me.status = status; this.me.matchId = matchId; this.me.vs = vs; this.room?.setPresence(this.me);
    this.paint();
  }
  /** A luta conectou: quem aceitou para de reenviar o aceite. */
  connected(matchId: string) { this.invites.connected(matchId); }
  note(text: string) { this.feed.unshift(text); this.feed.length = Math.min(this.feed.length, 6); this.paint(); }

  report(cfg: NetMatchCfg, winner: 0 | 1) {
    const w = cfg.names[winner], l = cfg.names[1 - winner];
    this.room?.send({ t: 'result', winner: w, loser: l }); this.addResult(w, l);
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
      default: this.tourAct(a, arg);
    }
  }

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

  private tourAct(a: string, arg: string) {
    const t = this.tour;
    const fighterOf = (id: string | null) => this.tEntries.find((e) => e.player_id === id)?.fighter ?? this.roster[0].def.id;
    const cfgOf = (m: store.TMatch, local: 0 | 1 | -1): NetMatchCfg => ({ matchId: m.id, f: [fighterOf(m.p1), fighterOf(m.p2)], names: [m.p1_name ?? '?', m.p2_name ?? '?'], ids: [m.p1!, m.p2!], local, tourney: { t: t!, m }, connectMs: 90000 });
    const m = this.tMatches.find((x) => x.id === arg.split(':')[0]);
    if (a === 'tnew') void store.createTournament(`COPA V4 ${new Date().toLocaleDateString('pt-BR')}`, this.me.id).then(() => this.refresh());
    else if (a === 'tjoin' && t) {
      const inIt = this.tEntries.some((e) => e.player_id === this.me.id);
      void (inIt ? store.leaveTournament(t.id, this.me.id) : store.joinTournament(t.id, this.me.id, this.me.name, this.me.fighter)).then(() => this.refresh());
    } else if (a === 'tstart' && t) void store.startTournament(t, this.tEntries).then(() => this.refresh());
    else if (a === 'tplay' && m) {
      if (m.p1 === this.me.id) void store.patchMatch(m.id, { status: 'lutando' });
      this.invites.cancel();
      this.hooks.start(cfgOf(m, m.p1 === this.me.id ? 0 : 1));
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
      if (el.textContent !== `${s}s`) el.textContent = `${s}s`;
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

  private paint(force = false) {
    this.paintSide();
    if (!this.root.classList.contains('lobby') || !this.me.name) return;
    const others = this.peers.filter((p) => p.id !== this.me.id);
    const full = this.peers.length > MAX_PEERS && this.peers.slice(MAX_PEERS).some((p) => p.id === this.me.id);
    if (full) { this.put(this.root, `<div class="center"><div class="title-sm">ARENA LOTADA</div><div class="pix small">JÁ TEM ${MAX_PEERS} PESSOAS CONECTADAS. TENTE DAQUI A POUCO.</div><div class="lb-btn ghost" data-act="back">VOLTAR</div></div>`, force); return; }
    const out = this.invites.out;
    const rows = others.map((p) => `<div class="lb-row"><div class="lb-av">${this.img(p.fighter)}</div><div class="lb-name">${esc(p.name)}<small>${p.status === 'livre' ? 'LIVRE' : p.status === 'procurando' ? 'PROCURANDO LUTA' : p.status === 'lutando' ? `LUTANDO · ${esc(p.vs ?? '')}` : 'ASSISTINDO'}</small></div>
      ${p.status === 'livre' || p.status === 'procurando' ? (out?.to.id === p.id ? '<div class="lb-btn sm ghost">AGUARDANDO…</div>' : `<div class="lb-btn sm${out ? ' off' : ''}" data-act="challenge" data-arg="${p.id}">DESAFIAR</div>`) : ''}</div>`).join('')
      || '<div class="lb-empty"><div class="pix small">VOCÊ É O PRIMEIRO AQUI</div><div class="pix tiny">CLIQUE EM CONVIDAR E MANDE O LINK PRO PESSOAL.<br>ASSIM QUE ALGUÉM ENTRAR, APARECE NESTA LISTA.</div></div>';
    const lives = [...this.liveMatches().values()].map((p) => `<div class="lb-row"><div class="lb-name">${esc(p.vs ?? '')}<small>AO VIVO</small></div><div class="lb-btn sm" data-act="watch" data-arg="${p.matchId}">ASSISTIR</div></div>`).join('') || '<div class="pix tiny">NENHUMA LUTA AGORA</div>';
    const rankDb = this.rank.map((r, i) => `<div class="lb-rank"><b>${i + 1}º</b><span>${esc(r.name)}</span><i>${r.points} PTS · ${r.wins}V ${r.losses}D</i></div>`).join('');
    const rankSess = [...this.score.entries()].sort((a, b) => b[1].w - a[1].w || a[1].l - b[1].l).slice(0, 6)
      .map(([n, s], i) => `<div class="lb-rank"><b>${i + 1}º</b><span>${esc(n)}</span><i>${s.w}V ${s.l}D</i></div>`).join('');
    const rank = rankDb || rankSess || '<div class="pix tiny">SEM LUTAS AINDA</div>';
    const searching = this.me.status === 'procurando';
    const feed = this.feed.length ? `<h4>ÚLTIMAS</h4>${this.feed.map((f) => `<div class="pix tiny">${esc(f)}</div>`).join('')}` : '';
    const cols = document.body.classList.contains('room-docked')
      ? `<div class="lb-col"><h4>CAMPEONATO</h4>${this.tourHtml()}<h4>LUTAS AO VIVO</h4>${lives}</div><div class="lb-col"><h4>RANKING</h4>${rank}${feed}</div>`
      : `<div class="lb-col"><h4>QUEM ESTÁ AQUI</h4>${rows}</div><div class="lb-col"><h4>LUTAS AO VIVO</h4>${lives}<h4>CAMPEONATO</h4>${this.tourHtml()}<h4>RANKING</h4>${rank}${feed}</div>`;
    this.put(this.root, `<div class="lb">
      <div class="lb-head"><div class="title-sm">ARENA ONLINE</div><div class="pix tiny">${ONLINE ? 'CONECTADO' : 'MODO LOCAL (SÓ ABAS DESTE NAVEGADOR)'} · ${this.peers.length}/${MAX_PEERS} ONLINE</div></div>
      <div class="lb-me"><div class="lb-av big">${this.img(this.me.fighter)}</div><div class="lb-name">${esc(this.me.name)}<small>${esc(this.fighterName(this.me.fighter))}</small><div class="lb-btn sm ghost" data-act="swap">TROCAR LUTADOR</div></div>
        <div class="lb-cta"><div class="lb-btn big ${searching ? 'on' : ''}" data-act="quick">${searching ? 'PROCURANDO ADVERSÁRIO… (CANCELAR)' : '▶ JOGAR AGORA'}</div><small>${searching ? 'A luta começa sozinha quando outra pessoa apertar JOGAR AGORA.' : 'Acha um adversário sozinho. Ou desafie alguém da lista.'}</small></div>
        <div class="lb-cta"><div class="lb-btn big ghost" data-act="invite">${this.copied ? '✔ LINK COPIADO' : '🔗 CONVIDAR'}</div><small>Copia o link. Quem abrir cai direto aqui.</small></div></div>
      ${this.inviteHtml(true)}
      ${cols}
      <div class="lb-foot"><div class="lb-btn ghost sm" data-act="back">SAIR DA ARENA</div></div></div>`, force);
    this.tickCountdowns();
  }

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
    const F = (fid: string) => this.roster.find((r) => r.def.id === fid);
    const busy = this.me.status === 'lutando', out = this.invites.out;
    const label: Record<string, string> = { livre: 'LIVRE', procurando: 'QUER LUTAR', lutando: 'LUTANDO', assistindo: 'ASSISTINDO' };
    const row = (p: Peer, me = false) => `<div class="rm-row ${me ? 'me' : ''}" style="--c:${F(p.fighter)?.def.colors.primary ?? '#3d4a63'}"><div class="rm-av">${this.img(p.fighter)}</div>
      <div class="rm-name">${esc(p.name)}${me ? ' (VOCÊ)' : ''}<small>${esc(F(p.fighter)?.def.name ?? '')}${p.status === 'lutando' && p.vs ? ' · ' + esc(p.vs) : ''}</small></div>
      ${!me && !busy && (p.status === 'livre' || p.status === 'procurando')
        ? (out?.to.id === p.id ? '<span class="rm-st procurando">AGUARDANDO</span>' : `<button class="rm-btn${out ? ' off' : ''}" data-act="challenge" data-arg="${p.id}">DESAFIAR</button>`)
        : !me && !busy && p.status === 'lutando' && p.matchId ? `<button class="rm-btn ghost" data-act="watch" data-arg="${p.matchId}">ASSISTIR</button>` : `<span class="rm-st ${p.status}">${label[p.status]}</span>`}</div>`;
    const others = this.peers.filter((p) => p.id !== this.me.id);
    const watchers = busy ? this.peers.filter((p) => p.status === 'assistindo' && p.matchId === this.me.matchId) : [];
    this.put(this.side, `<div class="rm-wrap"><div class="rm-head"><span>SALA ${this.peers.length}/${MAX_PEERS}</span><i class="${ONLINE ? '' : 'off'}">● ${ONLINE ? 'ONLINE' : 'LOCAL'}</i></div>
      ${this.inviteHtml(false)}
      ${row(this.me, true)}
      <div class="rm-sec">NA SALA</div>${others.map((p) => row(p)).join('') || '<div class="rm-empty">SÓ VOCÊ POR ENQUANTO.<br>MANDE O LINK DE CONVITE.</div>'}
      ${watchers.length ? `<div class="rm-sec">ASSISTINDO SUA LUTA</div><div class="rm-empty" style="border-style:solid">${watchers.map((p) => esc(p.name)).join(' · ')}</div>` : ''}
      ${this.feed.length ? `<div class="rm-sec">ÚLTIMAS</div>${this.feed.slice(0, 4).map((f) => `<div class="rm-note">${esc(f)}</div>`).join('')}` : ''}</div>`);
    this.tickCountdowns();
  }

  private tourHtml(): string {
    if (!store.storeReady) return '<div class="pix tiny">PRECISA DO SUPABASE CONFIGURADO</div>';
    const t = this.tour;
    if (!t || t.status === 'fim') return `${t?.champion ? `<div class="pix tiny">ÚLTIMO CAMPEÃO: ${esc(t.champion)}</div>` : ''}<div class="lb-btn sm" data-act="tnew">CRIAR CAMPEONATO</div>`;
    const inIt = this.tEntries.some((e) => e.player_id === this.me.id), owner = t.owner === this.me.id;
    const takenBy = this.tEntries.find((e) => e.player_id !== this.me.id && e.fighter === this.me.fighter);
    if (t.status === 'inscricoes') {
      return `<div class="pix tiny">${esc(t.name)} · INSCRIÇÕES ABERTAS · ${this.tEntries.length} INSCRITOS</div>
        <div class="pix tiny">${this.tEntries.map((e) => `${esc(e.name)} (${esc(e.fighter.toUpperCase())})`).join(' · ')}</div>
        ${!inIt && takenBy ? `<div class="pix tiny" style="color:#ff8a8a">${esc(takenBy.name)} JÁ ESCOLHEU ESTE LUTADOR. VOLTE E ESCOLHA OUTRO.</div>` : ''}
        <div class="lb-row">${!inIt && takenBy ? '' : `<div class="lb-btn sm" data-act="tjoin">${inIt ? 'SAIR DA CHAVE' : 'ENTRAR COM ESTE LUTADOR'}</div>`}${owner && this.tEntries.length >= 2 ? '<div class="lb-btn sm" data-act="tstart">SORTEAR E INICIAR</div>' : ''}</div>`;
    }
    const rounds = Math.max(...this.tMatches.map((m) => m.round)) + 1;
    const label = (r: number) => (r === rounds - 1 ? 'FINAL' : r === rounds - 2 ? 'SEMI' : `FASE ${r + 1}`);
    return `<div class="pix tiny">${esc(t.name)} · EM ANDAMENTO</div>` + this.tMatches.filter((m) => m.p1 || m.p2).map((m) => {
      const live = m.status === 'chamando' || m.status === 'lutando', mineM = m.p1 === this.me.id || m.p2 === this.me.id;
      const n = (id: string | null, nm: string | null) => `<span class="${m.winner && m.winner === id ? 'win' : ''}">${esc(nm ?? '—')}</span>`;
      return `<div class="lb-row t ${live ? 'live' : ''}"><div class="lb-name">${n(m.p1, m.p1_name)} x ${n(m.p2, m.p2_name)}<small>${label(m.round)} · ${m.status.toUpperCase()}</small></div>
        ${live && mineM ? `<div class="lb-btn sm" data-act="tplay" data-arg="${m.id}">É SUA VEZ · LUTAR</div>` : m.status === 'lutando' ? `<div class="lb-btn sm" data-act="twatch" data-arg="${m.id}">ASSISTIR</div>` : ''}
        ${live && owner && !mineM ? `<div class="lb-btn sm ghost" data-act="two" data-arg="${m.id}:1">W.O. ${esc(m.p1_name ?? '')}</div><div class="lb-btn sm ghost" data-act="two" data-arg="${m.id}:2">W.O. ${esc(m.p2_name ?? '')}</div>` : ''}</div>`;
    }).join('');
  }
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
