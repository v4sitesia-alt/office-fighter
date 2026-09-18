import type { Match } from '../game/match';
import { audio } from '../core/audio';

/** Barras de vida/especial, timer, rounds e mensagens centrais. DOM sobre o canvas. */
export class Hud {
  el: HTMLElement;
  private life: HTMLElement[]; private lifeGhost: HTMLElement[]; private gauges: HTMLElement[]; private names: HTMLElement[];
  private level = [0, 0];
  /** Quem joga neste aparelho (0, 1) ou -1 pra espectador: só ele ouve o aviso e vê a dica do botão. */
  localIndex = 0;
  private rounds: HTMLElement[];
  private timer: HTMLElement; private msg: HTMLElement; private msgFrames = 0;
  private ghost = [100, 100];
  private portraits: HTMLElement[];

  constructor(root: HTMLElement) {
    this.el = root;
    root.innerHTML = `
      <div class="hud-top">
        <div class="side p1"><div class="portrait"></div><div class="bars"><div class="name"></div><div class="life"><div class="ghost"></div><div class="fill"></div></div><div class="rounds"><i></i><i></i></div></div></div>
        <div class="timer">60</div>
        <div class="side p2"><div class="bars"><div class="name"></div><div class="life"><div class="ghost"></div><div class="fill"></div></div><div class="rounds"><i></i><i></i></div></div><div class="portrait"></div></div>
      </div>
      <div class="hud-bottom">${['p1', 'p2'].map((p) => `
        <div class="gauge ${p}"><div class="hint"><kbd>B</kbd> <em></em></div>
          <div class="g1"><div class="fill"></div><span>MAGIA <b>OK</b></span></div>
          <div class="g2"><div class="fill"></div><span>SUPER</span></div></div>`).join('')}
      </div>
      <div class="hud-msg"></div>`;
    const q = (s: string) => root.querySelectorAll<HTMLElement>(s);
    this.life = Array.from(q('.life .fill'));
    this.lifeGhost = Array.from(q('.life .ghost'));
    this.gauges = Array.from(q('.gauge'));
    this.names = Array.from(q('.name'));
    this.rounds = Array.from(q('.rounds'));
    this.portraits = Array.from(q('.portrait'));
    this.timer = root.querySelector('.timer')!;
    this.msg = root.querySelector('.hud-msg')!;
  }

  bind(m: Match) {
    m.fighters.forEach((f, i) => {
      this.names[i].textContent = f.def.name;
      const p = this.portraits[i];
      p.innerHTML = '';
      if (f.assets.portrait) { const img = f.assets.portrait.cloneNode() as HTMLImageElement; if (f.hue) img.style.filter = `hue-rotate(${f.hue}deg)`; p.appendChild(img); }
    });
    this.ghost = [100, 100]; this.level = [0, 0];
    this.gauges.forEach((g, i) => g.classList.toggle('local', i === this.localIndex));
    this.msg.textContent = '';
  }

  message(text: string, frames: number, kind: 'big' | 'small' = 'big') {
    this.msg.textContent = text; this.msg.className = `hud-msg show ${kind}`; this.msgFrames = frames;
  }

  update(m: Match) {
    m.fighters.forEach((f, i) => {
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
        if (lv > this.level[i]) {                      // encheu um nível: pisca a barra e toca o aviso pra quem joga aqui
          g.classList.remove('pop'); void g.offsetWidth; g.classList.add('pop');
          if (i === this.localIndex) audio.sfx(lv === 2 ? 'meter2' : 'meter1');
        }
        this.level[i] = lv;
      }
      Array.from(this.rounds[i].children).forEach((dot, k) => dot.classList.toggle('won', k < m.wins[i]));
    });
    this.timer.textContent = m.training ? '∞' : String(m.seconds).padStart(2, '0');
    this.timer.classList.toggle('low', m.seconds <= 10 && !m.training);
    if (this.msgFrames > 0 && --this.msgFrames === 0) this.msg.className = 'hud-msg';
  }
}
