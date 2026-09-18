// Arena online: quem está conectado, desafios 1x1, lutas ao vivo pra assistir e placar da sessão.
import type { FighterAssets } from '../game/types';
import { audio } from '../core/audio';
import { joinRoom, ONLINE, type Msg, type Peer, type Room } from './transport';

export interface NetMatchCfg { matchId: string; f: [string, string]; names: [string, string]; local: 0 | 1 | -1 }

export class Lobby {
  private room: Room | null = null;
  private peers: Peer[] = [];
  private score = new Map<string, { w: number; l: number }>();
  private feed: string[] = [];
  private incoming: { from: Peer; matchId: string } | null = null;
  private waiting: string | null = null;   // id de quem eu desafiei
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
    this.paint();
  }
  close() { this.room?.leave(); this.room = null; }

  /** Avisa o saguão do estado atual (lutando/assistindo) sem sair dele. */
  setStatus(status: Peer['status'], matchId?: string, vs?: string) {
    this.me.status = status; this.me.matchId = matchId; this.me.vs = vs; this.room?.setPresence(this.me);
  }
  report(winner: string, loser: string) { this.room?.send({ t: 'result', winner, loser }); this.addResult(winner, loser); }

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
      this.onMatch({ matchId: m.matchId as string, f: [this.me.fighter, other.fighter], names: [this.me.name, other.name], local: 0 });
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
    const rows = others.map((p) => `<div class="lb-row"><div class="lb-av">${img(p.fighter)}</div><div class="lb-name">${esc(p.name)}<small>${p.status === 'livre' ? 'LIVRE' : p.status === 'lutando' ? `LUTANDO · ${esc(p.vs ?? '')}` : 'ASSISTINDO'}</small></div>
      ${p.status === 'livre' ? `<div class="lb-btn sm" data-ch="${p.id}">${this.waiting === p.id ? 'AGUARDANDO…' : 'DESAFIAR'}</div>` : ''}</div>`).join('') || '<div class="pix tiny">NINGUÉM MAIS ONLINE. MANDE O LINK PRA GALERA.</div>';
    const live = new Map<string, Peer>(); this.peers.forEach((p) => { if (p.status === 'lutando' && p.matchId && !live.has(p.matchId)) live.set(p.matchId, p); });
    const lives = [...live.values()].map((p) => `<div class="lb-row"><div class="lb-name">${esc(p.vs ?? '')}<small>AO VIVO</small></div><div class="lb-btn sm" data-watch="${p.matchId}">ASSISTIR</div></div>`).join('') || '<div class="pix tiny">NENHUMA LUTA AGORA</div>';
    const rank = [...this.score.entries()].sort((a, b) => b[1].w - a[1].w || a[1].l - b[1].l).slice(0, 6)
      .map(([n, s], i) => `<div class="lb-rank"><b>${i + 1}º</b><span>${esc(n)}</span><i>${s.w}V ${s.l}D</i></div>`).join('') || '<div class="pix tiny">SEM LUTAS AINDA</div>';
    this.root.innerHTML = `<div class="lb">
      <div class="lb-head"><div class="title-sm">ARENA ONLINE</div><div class="pix tiny">${ONLINE ? 'CONECTADO' : 'MODO LOCAL (SÓ ABAS DESTE NAVEGADOR)'} · VOCÊ: ${esc(this.me.name)} · ${this.peers.length} ONLINE</div></div>
      <div class="lb-col"><h4>JOGADORES</h4>${rows}</div>
      <div class="lb-col"><h4>LUTAS AO VIVO</h4>${lives}<h4>PLACAR DA SESSÃO</h4>${rank}<h4>ÚLTIMAS</h4>${this.feed.map((f) => `<div class="pix tiny">${esc(f)}</div>`).join('')}</div>
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
      this.onMatch({ matchId: inc.matchId, f: [inc.from.fighter, this.me.fighter], names: [inc.from.name, this.me.name], local: 1 });
    });
    on('[data-dec]', () => { this.room?.send({ t: 'decline', to: this.incoming!.from.id }); this.incoming = null; this.paint(); });
    on('[data-back]', () => this.onExit());
  }
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
