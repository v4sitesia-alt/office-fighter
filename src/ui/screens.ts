// Telas DOM sobre o canvas: título, dificuldade, seleção, versus, resultado, fim, pausa, loading.
import type { Input } from '../core/input';
import type { Difficulty, FighterAssets } from '../game/types';
import { audio } from '../core/audio';
import { brazilMapSvg } from './brazil';

export class Screens {
  root: HTMLElement;
  private menuIndex = 0;
  private menuItems: HTMLElement[] = [];
  private onConfirm: ((i: number) => void) | null = null;
  private onBack: (() => void) | null = null;
  private onMove: ((i: number) => void) | null = null;
  private blink = 0;

  constructor(root: HTMLElement) { this.root = root; }

  hide() { this.root.innerHTML = ''; this.root.className = 'screens'; this.menuItems = []; this.onConfirm = null; this.onBack = null; this.onMove = null; }

  private set(cls: string, html: string) {
    this.root.className = `screens show ${cls}`;
    this.root.innerHTML = html;
    this.menuItems = Array.from(this.root.querySelectorAll<HTMLElement>('[data-item]'));
    this.menuIndex = 0;
    this.onMove = null;
    this.menuItems.forEach((el, i) => { el.onclick = () => { this.menuIndex = i; this.paintMenu(); this.onConfirm?.(i); }; });
    this.paintMenu();
  }
  private paintMenu() { this.menuItems.forEach((el, i) => el.classList.toggle('sel', i === this.menuIndex)); this.onMove?.(this.menuIndex); }

  /** Navegação de menus por input (chamado a cada passo fixo). */
  update(input: Input) {
    this.blink++;
    const p = input.ports[0];
    if (this.menuItems.length) {
      const horizontal = this.root.classList.contains('select');
      const prev = horizontal ? 'left' : 'up', next = horizontal ? 'right' : 'down';
      if (p.pressed(prev)) { this.menuIndex = (this.menuIndex + this.menuItems.length - 1) % this.menuItems.length; audio.sfx('menuMove'); this.paintMenu(); }
      if (p.pressed(next)) { this.menuIndex = (this.menuIndex + 1) % this.menuItems.length; audio.sfx('menuMove'); this.paintMenu(); }
      if (p.pressed('start') || p.pressed('punch')) { audio.sfx('menuConfirm'); this.onConfirm?.(this.menuIndex); }
    } else if (input.anyPressed) {
      audio.sfx('menuConfirm'); this.onConfirm?.(0);
    }
    if (p.pressed('block') || p.pressed('pause')) { if (this.onBack) audio.sfx('menuBack'); this.onBack?.(); }
  }

  loading(progress: number, total: number) {
    this.set('loading', `<div class="center"><div class="pix">CARREGANDO</div><div class="bar"><div style="width:${(progress / Math.max(1, total)) * 100}%"></div></div></div>`);
  }

  title(onStart: () => void, fighters: number) {
    this.set('title', `
      <div class="center">
        <div class="pix small">ESCRITÓRIO · 199X</div>
        <div class="logo"><span class="l1">V4</span><span class="l2">FIGHTERS</span><span class="l3">TROUBLE WORK</span></div>
        <div class="pix small tag">O DEADLINE É HOJE. O NOCAUTE TAMBÉM.</div>
        <div class="pix press">PRESS START</div>
        <div class="pix tiny">${fighters} LUTADORES · CAMPANHA · UM ESCRITÓRIO</div>
      </div>`);
    this.onConfirm = onStart;
  }

  difficulty(onPick: (d: Difficulty) => void, onBack: () => void) {
    this.set('menu', `
      <div class="center">
        <div class="title-sm">DIFICULDADE</div>
        <div class="menu">
          <div class="item" data-item><b>ESTAGIÁRIO</b><i>fácil · reação lenta</i></div>
          <div class="item" data-item><b>PLENO</b><i>normal · defende e pune</i></div>
          <div class="item" data-item><b>DIRETORIA</b><i>difícil · reage em 5 frames</i></div>
        </div>
        <div class="pix tiny">W S ESCOLHER · G / ENTER CONFIRMAR · V VOLTAR</div>
      </div>`);
    this.onConfirm = (i) => onPick((['easy', 'normal', 'hard'] as Difficulty[])[i]);
    this.onBack = onBack;
  }

  select(roster: FighterAssets[], onPick: (i: number) => void, onBack: () => void) {
    const img = (f: FighterAssets) => (f.portrait ? `<img src="${f.portrait.src}" alt="">` : '');
    const slots = roster.map((f, i) => `<div class="sf2-slot" data-item data-i="${i}">${img(f)}</div>`).join('')
      + Array.from({ length: Math.max(0, 6 - roster.length) }, () => '<div class="sf2-slot locked">?</div>').join('');
    this.set('select', `
      <div class="sf2">
        <div class="sf2-side left"><div class="sf2-portrait p1"></div><div class="sf2-name p1"></div><div class="sf2-tag">1P</div><div class="sf2-region p1"></div></div>
        <div class="sf2-center"><div class="sf2-map">${brazilMapSvg(roster)}</div><div class="sf2-title">PLAYER SELECT</div></div>
        <div class="sf2-side right"><div class="sf2-portrait cpu"></div><div class="sf2-name cpu"></div><div class="sf2-tag cpu">CPU</div><div class="sf2-region cpu"></div></div>
        <div class="sf2-grid">${slots}</div>
        <div class="pix tiny sf2-hint">A D ESCOLHER · G / ENTER CONFIRMAR · V VOLTAR</div>
      </div>`);
    const q = (sel: string) => this.root.querySelector<HTMLElement>(sel)!;
    const marks = Array.from(this.root.querySelectorAll<SVGGElement>('.mark'));
    const fill = (side: 'p1' | 'cpu', f: FighterAssets) => {
      q(`.sf2-portrait.${side}`).innerHTML = img(f);
      q(`.sf2-name.${side}`).textContent = f.def.name;
      q(`.sf2-region.${side}`).textContent = f.def.origin?.region ?? f.def.role;
    };
    this.onMove = (i) => {
      const cpu = roster.length > 1 ? (i === 0 ? 1 : 0) : i; // primeiro oponente da campanha (ordem da lista)
      fill('p1', roster[i]); fill('cpu', roster[cpu]);
      marks.forEach((m) => { const k = Number(m.dataset.i); m.querySelector('.dot')!.setAttribute('class', `dot${k === i ? ' on' : k === cpu ? ' cpu' : ''}`); });
      this.menuItems.forEach((el, k) => el.classList.toggle('cpu', k === cpu && k !== i));
    };
    this.onMove(0);
    this.onConfirm = (i) => { audio.sfx('selectChar'); audio.voice(`ann-${roster[i].def.id}`, 'ann'); onPick(i); };
    this.onBack = onBack;
  }

  versus(a: FighterAssets, b: FighterAssets, label: string, hueB: number, onGo: () => void) {
    const img = (f: FighterAssets, hue: number) => f.portrait ? `<img src="${f.portrait.src}" style="filter:hue-rotate(${hue}deg)" alt="">` : '';
    this.set('versus', `
      <div class="center vs">
        <div class="pix small">${label}</div>
        <div class="vsrow">
          <div class="vscard"><div class="thumb">${img(a, 0)}</div><div class="cname">${a.def.name}</div><div class="crole">${a.def.role}</div></div>
          <div class="vsx">VS</div>
          <div class="vscard"><div class="thumb">${img(b, hueB)}</div><div class="cname">${b.def.name}${hueB ? ' 2.0' : ''}</div><div class="crole">${hueB ? 'Versão Corporativa' : b.def.role}</div></div>
        </div>
        <div class="pix tiny">G / ENTER PARA LUTAR</div>
      </div>`);
    this.onConfirm = onGo;
  }

  result(won: boolean, perfect: boolean, isLast: boolean, onNext: () => void, onQuit: () => void) {
    this.set('result', `
      <div class="center">
        <div class="title-big ${won ? 'win' : 'lose'}">${won ? (perfect ? 'PERFECT!' : 'VITÓRIA') : 'GAME OVER'}</div>
        <div class="pix small">${won ? (isLast ? 'Você limpou o escritório.' : 'Próxima reunião marcada.') : 'O prazo venceu você. Continuar?'}</div>
        <div class="menu">
          <div class="item" data-item><b>${won ? (isLast ? 'VER O FINAL' : 'PRÓXIMA LUTA') : 'TENTAR DE NOVO'}</b></div>
          <div class="item" data-item><b>VOLTAR AO TÍTULO</b></div>
        </div>
      </div>`);
    this.onConfirm = (i) => (i === 0 ? onNext() : onQuit());
  }

  ending(winner: FighterAssets, onDone: () => void) {
    this.set('ending', `
      <div class="center">
        <div class="thumb big">${winner.portrait ? `<img src="${winner.portrait.src}" alt="">` : ''}</div>
        <div class="title-big win">CAMPEÃO</div>
        <div class="pix small">${winner.def.name} venceu a campanha.<br>O escritório está em paz. Até a próxima sprint.</div>
        <div class="pix tiny">G / ENTER PARA VOLTAR</div>
      </div>`);
    this.onConfirm = onDone;
  }

  pause(onResume: () => void, onQuit: () => void) {
    this.set('pause', `
      <div class="center">
        <div class="title-sm">PAUSA</div>
        <div class="menu">
          <div class="item" data-item><b>CONTINUAR</b></div>
          <div class="item" data-item><b>SAIR DA LUTA</b></div>
        </div>
        <div class="pix tiny">F1 HITBOXES · F2 CÂMERA LENTA · F3 TREINO</div>
      </div>`);
    this.onConfirm = (i) => (i === 0 ? onResume() : onQuit());
    this.onBack = onResume;
  }
}
