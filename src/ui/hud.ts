import type { Match } from '../game/match';

/** Barras de vida/especial, timer, rounds e mensagens centrais. DOM sobre o canvas. */
export class Hud {
  el: HTMLElement;
  private life: HTMLElement[]; private lifeGhost: HTMLElement[]; private meter: HTMLElement[]; private names: HTMLElement[];
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
      <div class="hud-bottom">
        <div class="meter p1"><div class="fill"></div><em></em><span>ESPECIAL</span></div>
        <div class="meter p2"><div class="fill"></div><em></em><span>ESPECIAL</span></div>
      </div>
      <div class="hud-msg"></div>`;
    const q = (s: string) => root.querySelectorAll<HTMLElement>(s);
    this.life = Array.from(q('.life .fill'));
    this.lifeGhost = Array.from(q('.life .ghost'));
    this.meter = Array.from(q('.meter .fill'));
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
      this.meter[i].style.background = f.def.colors.primary;
    });
    this.ghost = [100, 100];
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
      this.meter[i].style.width = `${f.meter}%`;
      const bar = this.meter[i].parentElement!;
      bar.classList.toggle('full', f.meter >= 100);
      bar.classList.toggle('half', f.meter >= 50 && f.meter < 100);
      bar.querySelector('span')!.textContent = f.meter >= 100 ? 'SUPER!' : f.meter >= 50 ? 'MAGIA' : 'ESPECIAL';
      Array.from(this.rounds[i].children).forEach((dot, k) => dot.classList.toggle('won', k < m.wins[i]));
    });
    this.timer.textContent = m.training ? '∞' : String(m.seconds).padStart(2, '0');
    this.timer.classList.toggle('low', m.seconds <= 10 && !m.training);
    if (this.msgFrames > 0 && --this.msgFrames === 0) this.msg.className = 'hud-msg';
  }
}
