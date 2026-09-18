// Telas DOM sobre o canvas: título, dificuldade, seleção, versus, resultado, fim, pausa, loading.
import type { Input } from '../core/input';
import type { Difficulty, FighterAssets } from '../game/types';
import { audio } from '../core/audio';
import { stateMapSvg } from './map';
import { endingOf, type Line } from '../data/dialogue';

export class Screens {
  root: HTMLElement;
  private menuIndex = 0;
  private menuItems: HTMLElement[] = [];
  private onConfirm: ((i: number) => void) | null = null;
  private onBack: (() => void) | null = null;
  private onMove: ((i: number) => void) | null = null;
  private blink = 0;
  private onTick: (() => void) | null = null;

  constructor(root: HTMLElement) { this.root = root; }

  hide() { this.root.onclick = null; this.root.innerHTML = ''; this.root.className = 'screens'; this.menuItems = []; this.onConfirm = null; this.onBack = null; this.onMove = null; this.onTick = null; }

  private set(cls: string, html: string) {
    this.root.className = `screens show ${cls}`;
    this.root.innerHTML = html;
    this.menuItems = Array.from(this.root.querySelectorAll<HTMLElement>('[data-item]'));
    this.menuIndex = 0;
    this.onMove = null; this.onTick = null; this.root.onclick = null;
    this.menuItems.forEach((el, i) => { el.onclick = () => { this.menuIndex = i; this.paintMenu(); this.onConfirm?.(i); }; });
    this.paintMenu();
  }
  private paintMenu() { this.menuItems.forEach((el, i) => el.classList.toggle('sel', i === this.menuIndex)); this.onMove?.(this.menuIndex); }

  /** Navegação de menus por input (chamado a cada passo fixo). */
  update(input: Input) {
    this.blink++;
    this.onTick?.();
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

  boot(onStart: () => void, invited = false) {
    this.set('boot', `<div class="center">${invited ? '<div class="title-sm">VOCÊ FOI CONVIDADO</div><div class="pix small">ESCOLHA SEU LUTADOR E ENTRE NA ARENA</div>' : ''}<div class="pix press">${invited ? 'ENTRAR' : 'INSERT COIN'}</div><div class="pix tiny">TOQUE OU APERTE QUALQUER BOTÃO</div></div>`);
    this.onConfirm = onStart;
    this.root.onclick = () => { this.root.onclick = null; onStart(); };
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

  mainMenu(onArcade: () => void, onOnline: () => void, onBack: () => void) {
    this.set('menu', `
      <div class="center">
        <div class="title-sm">MODO DE JOGO</div>
        <div class="menu">
          <div class="item" data-item><b>ARCADE</b><i>campanha contra a CPU</i></div>
          <div class="item" data-item><b>ARENA ONLINE</b><i>jogue contra outra pessoa · campeonato · assista às lutas</i></div>
        </div>
        <div class="pix tiny">W S ESCOLHER · G / ENTER CONFIRMAR · V VOLTAR</div>
      </div>`);
    this.onConfirm = (i) => (i === 0 ? onArcade() : onOnline());
    this.onBack = onBack;
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
      + Array.from({ length: Math.max(0, 10 - roster.length) }, () => '<div class="sf2-slot locked">?</div>').join('');
    this.set('select', `
      <div class="sf2">
        <div class="sf2-side left"><div class="sf2-portrait p1"></div><div class="sf2-name p1"></div><div class="sf2-tag">1P</div><div class="sf2-region p1"></div><div class="sf2-stats p1"></div></div>
        <div class="sf2-center"><div class="sf2-map">${stateMapSvg(roster)}</div><div class="sf2-title">PLAYER SELECT</div></div>
        <div class="sf2-side right"><div class="sf2-portrait cpu"></div><div class="sf2-name cpu"></div><div class="sf2-tag cpu">CPU</div><div class="sf2-region cpu"></div><div class="sf2-stats cpu"></div></div>
        <div class="sf2-grid">${slots}</div>
        <div class="pix tiny sf2-hint">A D ESCOLHER · G / ENTER CONFIRMAR · V VOLTAR</div>
      </div>`);
    const q = (sel: string) => this.root.querySelector<HTMLElement>(sel)!;
    const marks = Array.from(this.root.querySelectorAll<SVGGElement>('.mark'));
    const fill = (side: 'p1' | 'cpu', f: FighterAssets) => {
      q(`.sf2-portrait.${side}`).innerHTML = img(f);
      q(`.sf2-name.${side}`).textContent = f.def.name;
      q(`.sf2-region.${side}`).textContent = `${f.def.role} · ${f.def.origin?.city ?? '?'}`.toUpperCase();
      const st = f.def.stats;
      const bar = (label: string, v: number) => {
        const pct = Math.round(Math.max(0, Math.min(1, (v - 0.7) / 0.65)) * 100); // 0,70 = vazio · 1,35 = cheio
        return `<div class="stat"><span>${label}</span><div><i style="width:${pct}%;background:${f.def.colors.primary}"></i></div></div>`;
      };
      q(`.sf2-stats.${side}`).innerHTML = bar('FORÇA', st.power) + bar('AGILIDADE', st.speed) + bar('PODER', st.magic ?? 1);
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

  /** História em páginas; qualquer botão avança. */
  story(pages: { title: string; text: string }[], onDone: () => void) {
    let i = 0;
    const show = () => {
      this.set('story', `<div class="center"><div class="st-title">${pages[i].title}</div><div class="st-text">${pages[i].text}</div><div class="pix tiny">${i + 1}/${pages.length} · G / ENTER CONTINUA · V PULA</div></div>`);
      this.onConfirm = () => { if (++i >= pages.length) onDone(); else show(); };
      this.onBack = onDone;
      this.root.onclick = () => this.onConfirm?.(0);
    };
    show();
  }

  /** Enfrentamento: os dois frente a frente e, em seguida, a conversa em tela dividida na diagonal (quem fala ganha a tela). */
  versus(a: FighterAssets, b: FighterAssets, label: string, hueB: number, script: Line[], onGo: () => void) {
    const base = import.meta.env.BASE_URL;
    const panel = (f: FighterAssets, hue: number, side: string) => `<div class="vs-panel ${side}" style="--c:${f.def.colors.primary}"><div class="vs-bg"></div>
      <img class="vs-face" src="${base}versus/${f.def.id}.png" onerror="this.onerror=null;this.src='${f.portrait?.src ?? ''}';this.classList.add('thumbfall')" style="--hue:${hue}deg" alt=""></div>`;
    const plate = (f: FighterAssets, hue: number, side: string) => `<div class="vs-plate ${side}" style="--c:${f.def.colors.primary}"><div class="vs-name">${f.def.name}${hue ? ' 2.0' : ''}</div><div class="vs-role">${f.def.role}${f.def.origin ? ' · ' + f.def.origin.city : ''}</div></div>`;
    this.set('versus', `<div class="vs-stage" data-speaker="none" style="background-image:url(${base}versus/base.jpg)">
        ${panel(a, 0, 'l')}${panel(b, hueB, 'r')}<div class="vs-cut"></div><div class="vs-floor"></div>
        ${plate(a, 0, 'l')}${plate(b, hueB, 'r')}
        <div class="pix small vs-label">${label}</div>
        <img class="vs-logo" src="${base}versus/vs.png" alt="VS">
        <div class="vs-talk"><div class="vs-who"></div><div class="vs-text"></div><div class="vs-next">▼</div></div>
        <div class="pix tiny vs-hint">G / ENTER CONTINUA</div></div>`);
    const stage = this.root.querySelector<HTMLElement>('.vs-stage')!, talk = stage.querySelector<HTMLElement>('.vs-talk')!;
    const whoEl = stage.querySelector<HTMLElement>('.vs-who')!, textEl = stage.querySelector<HTMLElement>('.vs-text')!;
    let idx = -1, shown = 0, full = '';
    const next = () => {
      if (idx >= 0 && shown < full.length) { shown = full.length; textEl.textContent = full; return; }   // completa a fala antes de avançar
      if (++idx >= script.length) { onGo(); return; }
      const ln = script[idx], f = ln.who === 0 ? a : b;
      stage.dataset.speaker = ln.who === 0 ? 'l' : 'r'; stage.classList.add('talking');
      stage.querySelector('.vs-hint')!.textContent = 'G / ENTER AVANÇA · V PULA';
      talk.style.setProperty('--c', f.def.colors.primary);
      whoEl.textContent = f.def.name + (ln.who === 1 && hueB ? ' 2.0' : '');
      full = ln.text; shown = 0; textEl.textContent = '';
      // fonte grande e dinâmica: fala curta é gritada em letra enorme; fala em maiúsculas (robôs, monstro) treme
      const shout = full === full.toUpperCase() && /[A-ZÀ-Ú]{3}/.test(full);
      textEl.style.fontSize = `${full.length < 28 ? 46 : full.length < 55 ? 36 : full.length < 90 ? 29 : 24}px`;
      textEl.className = `vs-text${shout ? ' shout' : ''}`; talk.classList.remove('pop'); void talk.offsetWidth; talk.classList.add('pop');
    };
    this.onConfirm = next;
    this.onBack = onGo;
    this.root.onclick = () => next();
    this.onTick = () => {
      if (idx < 0 || shown >= full.length) return;
      shown++; textEl.textContent = full.slice(0, shown);
      if (shown % 3 === 0 && full[shown - 1] !== ' ') audio.sfx(script[idx].who === 0 ? 'talkA' : 'talkB');
    };
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
        <div class="end-text">${endingOf(winner.def.id)}</div>
        <div class="pix tiny">G / ENTER PARA VOLTAR</div>
      </div>`);
    this.onConfirm = onDone;
  }

  /** Menu da luta online: o jogo não para (o outro lado continua), só dá pra voltar ou sair. */
  netMenu(spectator: boolean, onResume: () => void, onQuit: () => void) {
    this.set('pause', `
      <div class="center">
        <div class="title-sm">${spectator ? 'ASSISTINDO' : 'LUTA ONLINE'}</div>
        <div class="menu">
          <div class="item" data-item><b>VOLTAR</b>${spectator ? '' : '<i>a luta não pausa: o adversário continua</i>'}</div>
          <div class="item" data-item><b>${spectator ? 'SAIR' : 'DESISTIR E SAIR'}</b>${spectator ? '' : '<i>conta como derrota</i>'}</div>
        </div>
      </div>`);
    this.onConfirm = (i) => (i === 0 ? onResume() : onQuit());
    this.onBack = onResume;
  }

  pause(onResume: () => void, onQuit: () => void) {
    this.set('pause', `
      <div class="center">
        <div class="title-sm">PAUSA</div>
        <div class="menu">
          <div class="item" data-item><b>CONTINUAR</b></div>
          <div class="item" data-item><b>SAIR DA LUTA</b></div>
        </div>
        <div class="pix tiny">START OU PAUSE ABREM ESTE MENU · F1 HITBOXES · F2 CÂMERA LENTA · F3 TREINO</div>
      </div>`);
    this.onConfirm = (i) => (i === 0 ? onResume() : onQuit());
    this.onBack = onResume;
  }
}
