import type { Match } from '../game/match';
import type { Fighter } from '../game/fighter';
import { audio } from '../core/audio';

/** Barras de vida/especial, timer, rounds e mensagens centrais. DOM sobre o canvas. */
export class Hud {
  el: HTMLElement;
  private life: HTMLElement[]; private lifeGhost: HTMLElement[]; private gauges: HTMLElement[]; private names: HTMLElement[];
  private level = [0, 0];
  private shownTally: unknown = null; private shownScore = [0, 0];
  /** Quem joga neste aparelho (0, 1) ou -1 pra espectador: só ele ouve o aviso e vê a dica do botão. */
  localIndex = 0;
  private rounds: HTMLElement[];
  private timer: HTMLElement; private msg: HTMLElement; private msgFrames = 0;
  private ghost = [100, 100];
  private portraits: HTMLElement[];
  private mates: HTMLElement[] = []; private bound: (Fighter | null)[] = [null, null]; private mateOf: (Fighter | null)[] = [null, null];
  private combos: HTMLElement[]; private comboShown = [0, 0]; private comboHold = [0, 0];

  constructor(root: HTMLElement) {
    this.el = root;
    const mate = '<div class="mate"><div class="mini"></div><div class="mbar"><small></small><div class="mlife"><i></i></div></div><kbd>T</kbd><em>TROCA</em></div>';
    root.innerHTML = `
      <div class="hud-top">
        <div class="side p1"><div class="portrait"></div><div class="bars"><div class="name-row"><div class="name"></div><div class="score">0</div></div><div class="life"><div class="ghost"></div><div class="fill"></div></div><div class="rounds"><i></i><i></i></div>__MATE__</div></div>
        <div class="timer">60</div>
        <div class="side p2"><div class="bars"><div class="name-row"><div class="name"></div><div class="score">0</div></div><div class="life"><div class="ghost"></div><div class="fill"></div></div><div class="rounds"><i></i><i></i></div>__MATE__</div><div class="portrait"></div></div>
      </div>
      <div class="hud-bottom">${['p1', 'p2'].map((p) => `
        <div class="gauge ${p}"><div class="hint"><kbd>B</kbd> <em></em></div>
          <div class="g1"><div class="fill"></div><span>MAGIA <b>OK</b></span></div>
          <div class="g2"><div class="fill"></div><span>SUPER</span></div></div>`).join('')}
      </div>
      <div class="hud-combo p1"><b>2</b><span>HITS</span></div><div class="hud-combo p2"><b>2</b><span>HITS</span></div>
      <div class="hud-tally"></div>
      <div class="hud-msg"></div>`.replaceAll('__MATE__', mate);
    const q = (s: string) => root.querySelectorAll<HTMLElement>(s);
    this.life = Array.from(q('.life .fill'));
    this.lifeGhost = Array.from(q('.life .ghost'));
    this.gauges = Array.from(q('.gauge'));
    this.names = Array.from(q('.name'));
    this.rounds = Array.from(q('.rounds'));
    this.portraits = Array.from(q('.portrait'));
    this.combos = Array.from(q('.hud-combo'));
    this.mates = Array.from(q('.mate'));
    this.timer = root.querySelector('.timer')!;
    this.msg = root.querySelector('.hud-msg')!;
  }

  /** Nome e retrato de quem está em campo no lado i (nas duplas muda no meio da luta). */
  private bindSide(m: Match, i: number) {
    const f = m.fighters[i]; this.bound[i] = f;
    this.names[i].textContent = f.owner ? `${f.owner} · ${f.def.name}` : f.def.name;
    const p = this.portraits[i];
    p.innerHTML = '';
    if (f.assets.portrait) { const img = f.assets.portrait.cloneNode() as HTMLImageElement; if (f.hue) img.style.filter = `hue-rotate(${f.hue}deg)`; p.appendChild(img); }
    this.ghost[i] = f.life; this.level[i] = -1;
  }

  bind(m: Match) {
    this.el.classList.toggle('tag', m.tagMode);
    this.mateOf = [null, null];
    m.fighters.forEach((_, i) => this.bindSide(m, i));
    this.shownScore = [m.score[0], m.score[1]];
    this.gauges.forEach((g, i) => g.classList.toggle('local', i === this.localIndex));
    this.comboShown = [0, 0]; this.comboHold = [0, 0]; this.combos.forEach((c) => (c.className = c.className.replace(' show', '')));
    this.msg.textContent = '';
  }

  message(text: string, frames: number, kind: 'big' | 'small' = 'big') {
    this.msg.textContent = text; this.msg.className = `hud-msg show ${kind}`; this.msgFrames = frames;
  }

  update(m: Match) {
    m.fighters.forEach((f, i) => {
      if (f !== this.bound[i]) this.bindSide(m, i);
      if (m.tagMode) {                                  // companheiro no banco: retrato, vida e se já dá pra trocar
        const mt = m.teams[i][1 - m.active[i]] ?? null, el = this.mates[i];
        if (mt !== this.mateOf[i]) {
          this.mateOf[i] = mt; el.style.visibility = mt ? 'visible' : 'hidden';
          const mini = el.querySelector('.mini')!; mini.innerHTML = '';
          if (mt?.assets.portrait) mini.appendChild(mt.assets.portrait.cloneNode());
          el.querySelector('small')!.textContent = mt ? (mt.owner ? `${mt.owner} · ${mt.def.name}` : mt.def.name) : '';
        }
        if (mt) {
          (el.querySelector('.mlife i') as HTMLElement).style.width = `${Math.max(0, mt.life)}%`;
          el.classList.toggle('out', mt.life <= 0); el.classList.toggle('ready', mt.life > 0 && m.tagCool[i] === 0 && i === this.localIndex);
        }
      }
      this.life[i].style.width = `${f.life}%`;
      this.ghost[i] += (f.life - this.ghost[i]) * 0.08;
      this.lifeGhost[i].style.width = `${Math.max(f.life, this.ghost[i])}%`;
      const g = this.gauges[i], lv = f.meter >= 100 ? 2 : f.meter >= 50 ? 1 : 0;
      (g.querySelector('.g1 .fill') as HTMLElement).style.width = `${Math.min(50, f.meter) * 2}%`;
      (g.querySelector('.g2 .fill') as HTMLElement).style.width = `${Math.max(0, f.meter - 50) * 2}%`;
      if (lv !== this.level[i]) {
        g.classList.toggle('lv1', lv === 1); g.classList.toggle('lv2', lv === 2);
        g.querySelector('.g1')!.classList.toggle('ready', lv >= 1); g.querySelector('.g2')!.classList.toggle('ready', lv === 2);
        g.querySelector('.g2 span')!.textContent = lv === 2 ? 'MAXIMUM' : 'SUPER';
        g.querySelector('.hint em')!.textContent = lv === 2 ? 'SOLTA O SUPER' : 'SOLTA A MAGIA';
        if (lv > this.level[i] && this.level[i] >= 0) {                      // encheu um nível: pisca a barra e toca o aviso pra quem joga aqui
          g.classList.remove('pop'); void g.offsetWidth; g.classList.add('pop');
          if (i === this.localIndex) audio.sfx(lv === 2 ? 'meter2' : 'meter1');
        }
        this.level[i] = lv;
      }
      Array.from(this.rounds[i].children).forEach((dot, k) => dot.classList.toggle('won', k < m.wins[i]));
      // contagem de hits: acertos seguidos que o OUTRO está levando sem voltar ao neutro. Aparece do 2º em diante, do lado de quem bate
      const hits = m.fighters[1 - i].comboTaken, c = this.combos[i];
      if (hits >= 2 && hits !== this.comboShown[i]) {
        c.querySelector('b')!.textContent = String(hits);
        c.classList.remove('pop'); void c.offsetWidth; c.classList.add('show', 'pop'); c.classList.toggle('big', hits >= 4);
        this.comboHold[i] = 70;
      }
      this.comboShown[i] = hits;
      if (this.comboHold[i] > 0 && --this.comboHold[i] === 0) c.classList.remove('show');
    });
    const sc = this.el.querySelectorAll<HTMLElement>('.score');
    m.score.forEach((v, i) => { this.shownScore[i] += Math.ceil((v - this.shownScore[i]) * 0.2); if (this.shownScore[i] > v) this.shownScore[i] = v; sc[i].textContent = String(this.shownScore[i]).padStart(6, '0'); });
    if (m.tally !== this.shownTally) {
      this.shownTally = m.tally; const el = this.el.querySelector<HTMLElement>('.hud-tally')!;
      if (!m.tally) el.className = 'hud-tally';
      else { el.className = `hud-tally show ${m.tally.who === 0 ? 'l' : 'r'}`; el.innerHTML = m.tally.items.map(([k, v], i) => `<div style="animation-delay:${i * 0.22}s"><span>${k}</span><b>${v}</b></div>`).join('') + `<div class="tot" style="animation-delay:${m.tally.items.length * 0.22}s"><span>BÔNUS</span><b>${m.tally.total}</b></div>`; audio.sfx('menuConfirm'); }
    }
    this.timer.textContent = m.training ? '∞' : String(m.seconds).padStart(2, '0');
    this.timer.classList.toggle('low', m.seconds <= 10 && !m.training);
    if (this.msgFrames > 0 && --this.msgFrames === 0) this.msg.className = 'hud-msg';
  }
}
