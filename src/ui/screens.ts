// Telas DOM sobre o canvas: título, dificuldade, seleção, versus, resultado, fim, pausa, loading.
import type { Button, Input } from '../core/input';
import type { Difficulty, FighterAssets } from '../game/types';
import { audio } from '../core/audio';
import { placeOf, valeMapSvg } from './valemap';
import { endingOf, type Line } from '../data/dialogue';
import { LOCKED } from '../data/roster';

export class Screens {
  root: HTMLElement;
  private menuIndex = 0;
  private menuItems: HTMLElement[] = [];
  private onConfirm: ((i: number) => void) | null = null;
  private onBack: (() => void) | null = null;
  private onMove: ((i: number) => void) | null = null;
  private blink = 0;
  private onTick: ((input: Input) => void) | null = null;
  private gridCols = 0;

  constructor(root: HTMLElement) { this.root = root; }

  hide() { this.root.onclick = null; this.root.innerHTML = ''; this.root.className = 'screens'; this.menuItems = []; this.onConfirm = null; this.onBack = null; this.onMove = null; this.onTick = null; }

  private set(cls: string, html: string) {
    this.root.className = `screens show ${cls}`;
    this.root.innerHTML = html;
    this.menuItems = Array.from(this.root.querySelectorAll<HTMLElement>('[data-item]'));
    this.menuIndex = 0;
    this.onMove = null; this.onTick = null; this.root.onclick = null; this.gridCols = 0;
    this.menuItems.forEach((el, i) => { el.onclick = () => { this.menuIndex = i; this.paintMenu(); this.onConfirm?.(i); }; });
    this.paintMenu();
  }
  private paintMenu() { this.menuItems.forEach((el, i) => el.classList.toggle('sel', i === this.menuIndex)); this.onMove?.(this.menuIndex); }

  /** Navegação de menus por input (chamado a cada passo fixo). */
  update(input: Input) {
    this.blink++;
    this.onTick?.(input);
    const p = input.ports[0];
    if (this.menuItems.length) {
      const horizontal = this.root.classList.contains('select');
      const prev = horizontal ? 'left' : 'up', next = horizontal ? 'right' : 'down';
      if (p.pressed(prev)) { this.menuIndex = (this.menuIndex + this.menuItems.length - 1) % this.menuItems.length; audio.sfx('menuMove'); this.paintMenu(); }
      if (p.pressed(next)) { this.menuIndex = (this.menuIndex + 1) % this.menuItems.length; audio.sfx('menuMove'); this.paintMenu(); }
      if (this.gridCols) {                                 // grade: ↑ ↓ pulam uma fileira
        const n = this.menuItems.length, c = this.gridCols, i = this.menuIndex;
        const to = p.pressed('up') ? i - c : p.pressed('down') ? (i + c < n ? i + c : Math.floor(i / c) < Math.floor((n - 1) / c) ? n - 1 : -1) : -1;
        if (to >= 0 && to !== i) { this.menuIndex = to; audio.sfx('menuMove'); this.paintMenu(); }
      }
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
        <div class="pix small">MUNDIM CORP · 2026</div>
        <div class="logo"><span class="l1">V4</span><span class="l2">FIGHTERS</span><span class="l3">TROUBLE WORK</span></div>
        <div class="pix small tag">O DEADLINE É HOJE. O NOCAUTE TAMBÉM.</div>
        <div class="pix press">PRESS START</div>
        <div class="pix tiny">${fighters} LUTADORES · CAMPANHA · UMA TORRE</div>
      </div>`);
    this.onConfirm = onStart;
  }

  mainMenu(onArcade: () => void, onOnline: () => void, onRanking: () => void, onBack: () => void) {
    this.set('menu', `
      <div class="center">
        <div class="title-sm">MODO DE JOGO</div>
        <div class="menu">
          <div class="item" data-item><b>ARCADE</b><i>campanha contra a CPU</i></div>
          <div class="item" data-item><b>ARENA ONLINE</b><i>jogue contra outra pessoa · campeonato · assista às lutas</i></div>
          <div class="item" data-item><b>RANKING</b><i>maiores pontuações do arcade · melhores da arena</i></div>
        </div>
        <div class="pix tiny">W S ESCOLHER · G / ENTER CONFIRMAR · V VOLTAR</div>
      </div>`);
    this.onConfirm = (i) => [onArcade, onOnline, onRanking][i]();
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

  /** Seleção. `secret` = lutadores ocultos: slot escuro até o código ser digitado aqui mesmo (↑ ↑ ↓ ↓ ← → ← → B J). */
  /** rival(i) = quem a CPU vai usar contra o lutador i (null = sem CPU, arena online). O adversário fica escondido num "?"
   *  até o jogador confirmar; aí a CPU gira a roleta pelos retratos, para no escolhido e a luta segue. */
  select(roster: FighterAssets[], secret: { isLocked(id: string): boolean; unlock(id: string): void }, onPick: (i: number) => void, onBack: () => void, focus = 0, rival: ((i: number) => number | null) | null = null) {
    const base = import.meta.env.BASE_URL;
    const img = (f: FighterAssets) => (f.portrait ? `<img src="${f.portrait.src}" alt="">` : '');
    const locked = (f: FighterAssets) => secret.isLocked(f.def.id);
    const slots = roster.map((f, i) => locked(f)
      ? (f.secretPortrait ? `<div class="sf2-slot secret hidden art" style="--c:${f.def.colors.primary}"><img src="${f.secretPortrait.src}" alt=""></div>` : `<div class="sf2-slot secret hidden" style="--c:${f.def.colors.primary}">${img(f)}<b>?</b></div>`)
      : `<div class="sf2-slot${f.def.secret ? ' secret' : ''}" data-item data-i="${i}" style="--c:${f.def.colors.primary}">${img(f)}<span>${f.def.name}</span></div>`).join('')
      + Array.from({ length: Math.max(0, 15 - roster.length) }, () => '<div class="sf2-slot locked">?</div>').join('');
    // cada lado como a ficha do manual: cenário escuro ao fundo, a arte de destaque, o lutador comemorando na frente e os níveis embaixo
    const side = (k: string, tag: string) => `<div class="sf2-side ${k === 'p1' ? 'left' : 'right'}"><div class="sf2-bg ${k}"></div>
        <div class="sf2-hero ${k} empty"><img class="sf2-art ${k}" alt="" hidden><b class="sf2-q">?</b></div>
        <div class="sf2-tag ${k}">${tag}</div><canvas class="sf2-anim ${k}" width="230" height="230"></canvas>
        <div class="sf2-info"><div class="sf2-name ${k}"></div><div class="sf2-region ${k}"></div><div class="sf2-stats ${k}"></div></div></div>`;
    this.set('select', `
      <div class="sf2">
        ${side('p1', '1P')}
        <div class="sf2-center"><div class="sf2-map">${valeMapSvg(roster.filter((f) => !locked(f)))}</div><div class="sf2-title">PLAYER SELECT</div><div class="sf2-grid">${slots}</div></div>
        ${side('cpu', rival ? 'CPU' : 'ARENA')}
      </div>`);
    this.gridCols = 5;
    const q = (sel: string) => this.root.querySelector<HTMLElement>(sel)!;
    const open = roster.filter((f) => !locked(f));
    const marks = Array.from(this.root.querySelectorAll<SVGGElement>('.mark'));
    const idxOf = (menu: number) => Number(this.menuItems[menu].dataset.i);
    const shown: Record<string, FighterAssets | null> = { p1: null, cpu: null };
    for (const f of roster) { const im = new Image(); im.src = `${base}versus/${f.def.id}.png`; }
    const fill = (sd: 'p1' | 'cpu', f: FighterAssets | null) => {
      shown[sd] = f;
      q(`.sf2-side.${sd === 'p1' ? 'left' : 'right'}`).style.setProperty('--c', f?.def.colors.primary ?? '#4ab3ff');
      q(`.sf2-bg.${sd}`).style.backgroundImage = f ? `url(${base}stages/${f.def.stage ?? 'office'}.png)` : 'none';
      const hero = q(`.sf2-hero.${sd}`), art = hero.querySelector('img') as HTMLImageElement;
      if (f) {
        const src = `${base}versus/${f.def.id}.png`;
        if (art.dataset.id !== f.def.id) {                                   // trocou de lutador: a arte entra deslizando
          art.dataset.id = f.def.id; art.onerror = () => { art.onerror = null; if (f.portrait) art.src = f.portrait.src; }; art.src = src;
          hero.classList.remove('pop'); void hero.offsetWidth; hero.classList.add('pop');
        }
        art.hidden = false; hero.classList.remove('empty');
      } else { art.hidden = true; art.removeAttribute('src'); delete art.dataset.id; hero.classList.add('empty'); }
      q(`.sf2-name.${sd}`).textContent = f ? f.def.name : '???';
      q(`.sf2-region.${sd}`).textContent = f ? `${f.def.role} · ${placeOf(f.def.id)}`.toUpperCase() : (rival ? 'A CPU AINDA NÃO ESCOLHEU' : 'QUEM ESTIVER NA SALA');
      const st = f?.def.stats;
      const bar = (label: string, v: number) => {
        const pct = Math.round(Math.max(0.05, Math.min(1, (v - 0.7) / 0.65)) * 100); // 0,70 = mínimo · 1,35 = cheio
        return `<div class="stat"><span>${label}</span><div><i style="width:${st ? pct : 0}%;background:${f?.def.colors.primary ?? '#fff'}"></i></div></div>`;
      };
      q(`.sf2-stats.${sd}`).innerHTML = bar('FORÇA', st?.power ?? 0) + bar('AGILIDADE', st?.speed ?? 0) + bar('PODER', st?.magic ?? 1);
    };
    // o lutador de verdade, comemorando (animação de vitória tirada do atlas)
    let clock = 0;
    const drawAnim = (sd: 'p1' | 'cpu') => {
      const cv = this.root.querySelector<HTMLCanvasElement>(`.sf2-anim.${sd}`); if (!cv) return;
      const g = cv.getContext('2d')!; g.clearRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
      const f = shown[sd]; if (!f) return;
      const a = f.def.anims.win, n = a.frames.length, idx = Math.floor(clock * (a.fps ?? 4) / 60);
      const i = a.loop ? idx % n : a.loopFrom !== undefined && idx >= n ? a.loopFrom + (idx - n) % (n - a.loopFrom) : idx % n;
      const fr = f.frames.frames[a.frames[i]], tall = Math.max(...a.frames.map((k) => f.frames.frames[k].ay)), k = Math.min(1.1, 214 / tall, 224 / fr.sw) * Math.min(1.15, f.def.scale);
      g.save(); g.translate(cv.width / 2, cv.height - 6); if (sd === 'cpu') g.scale(-1, 1);
      g.drawImage(f.sheet, fr.sx, fr.sy, fr.sw, fr.sh, -(a.anchor === 'center' ? fr.cx : fr.ax) * k, -fr.ay * k, fr.sw * k, fr.sh * k); g.restore();
    };
    let spinning = 0, spinTo = -1, spinPick = -1;
    this.onMove = (m) => {
      if (spinning) return;
      const i = idxOf(m); clock = 0;
      fill('p1', roster[i]); fill('cpu', null);
      marks.forEach((mk) => { const f = open[Number(mk.dataset.i)]; const k = roster.indexOf(f); mk.querySelector('.dot')!.setAttribute('class', `dot${k === i ? ' on' : ''}`); });
    };
    this.menuIndex = Math.max(0, this.menuItems.findIndex((el) => Number(el.dataset.i) === focus)); this.paintMenu();
    this.onConfirm = (m) => {
      if (spinning) return;
      const i = idxOf(m), r = rival ? rival(i) : null; audio.sfx('selectChar'); audio.voice(`ann-${roster[i].def.id}`, 'ann');
      if (r === null || r < 0) { onPick(i); return; }
      spinning = 1; spinTo = r; spinPick = i; q('.sf2')!.classList.add('spin');          // roleta da CPU
    };
    this.onBack = () => { if (!spinning) onBack(); };
    const cand = roster.map((_, k) => k).filter((k) => !locked(roster[k]));
    const spinTick = () => {
      if (!spinning) return;
      const t = spinning++, every = t < 50 ? 4 : t < 80 ? 7 : t < 104 ? 12 : 0;        // gira rápido, vai freando e para
      if (every && t % every === 0) {
        let k = cand[Math.floor(Math.random() * cand.length)]; if (k === spinPick && cand.length > 1) k = cand[(cand.indexOf(k) + 1) % cand.length];
        fill('cpu', roster[k]); audio.sfx('menuMove');
        this.menuItems.forEach((el) => el.classList.toggle('cpu', Number(el.dataset.i) === k));
      }
      if (t === 104) {
        fill('cpu', roster[spinTo]); clock = 0; audio.sfx('meter2'); audio.voice(`ann-${roster[spinTo].def.id}`, 'ann');
        this.menuItems.forEach((el) => el.classList.toggle('cpu', Number(el.dataset.i) === spinTo)); q('.sf2')!.classList.add('locked-in');
        marks.forEach((mk) => { const f = open[Number(mk.dataset.i)]; const k = roster.indexOf(f); if (k === spinTo) mk.querySelector('.dot')!.setAttribute('class', 'dot cpu'); });
      }
      if (t === 175) { spinning = 0; onPick(spinPick); }
    };
    // códigos secretos (LOCKED em roster.ts): os botões H, J e B não fazem nada nos menus, então dá pra digitar sem sair da tela
    const WATCH: Button[] = ['up', 'down', 'left', 'right', 'punch', 'kick', 'heavy', 'block', 'special'];
    const typed: Button[] = [];
    const codes = roster.filter(locked).map((f) => ({ f, code: (LOCKED[f.def.id]?.code ?? []) as Button[] })).filter((c) => c.code.length);
    const longest = Math.max(0, ...codes.map((c) => c.code.length));
    this.onTick = (input) => {
      clock++; drawAnim('p1'); drawAnim('cpu'); spinTick();
      if (!codes.length || spinning) return;
      for (const b of WATCH) if (input.ports[0].pressed(b)) typed.push(b);
      if (typed.length > longest) typed.splice(0, typed.length - longest);
      const hit = codes.find((c) => typed.length >= c.code.length && c.code.every((b, k) => typed[typed.length - c.code.length + k] === b));
      if (hit) {
        secret.unlock(hit.f.def.id);
        audio.sfx('explosion'); audio.sfx('meter2'); audio.voice('ann-secret', 'ann');
        this.select(roster, secret, onPick, onBack, roster.indexOf(hit.f), rival);
        this.root.querySelector(`.sf2-slot[data-i="${roster.indexOf(hit.f)}"]`)?.classList.add('reveal');
        this.root.querySelector('.sf2')?.classList.add('flash');
      }
    };
  }

  /** Enfrentamento: os dois frente a frente e, em seguida, a conversa em tela dividida na diagonal (quem fala ganha a tela). */
  versus(a: FighterAssets, b: FighterAssets, label: string, hueB: number, script: Line[], onGo: () => void) {
    const base = import.meta.env.BASE_URL;
    const panel = (f: FighterAssets, hue: number, side: string) => `<div class="vs-panel ${side}" style="--c:${f.def.colors.primary}"><div class="vs-bg"></div>
      <img class="vs-face" src="${base}versus/${f.def.id}.png" onerror="this.onerror=null;this.src='${f.portrait?.src ?? ''}';this.classList.add('thumbfall')" style="--hue:${hue}deg" alt=""></div>`;
    const plate = (f: FighterAssets, hue: number, side: string) => `<div class="vs-plate ${side}" style="--c:${f.def.colors.primary}"><div class="vs-name">${f.def.name}${hue ? ' 2.0' : ''}</div><div class="vs-role">${f.def.role} · ${placeOf(f.def.id)}</div></div>`;
    this.set('versus', `<div class="vs-stage" data-speaker="none" style="background-image:url(${base}versus/base.jpg)">
        ${panel(a, 0, 'l')}${panel(b, hueB, 'r')}<div class="vs-cut"></div><div class="vs-floor"></div>
        ${plate(a, 0, 'l')}${plate(b, hueB, 'r')}
        <div class="pix small vs-label">${label}</div>
        <img class="vs-logo" src="${base}versus/vs.png" alt="VS">
        <div class="vs-talk"><div class="vs-who"></div><div class="vs-text"></div><div class="vs-next">▼</div></div>
        <div class="pix tiny vs-hint">G / ENTER ADIANTA · V PULA</div></div>`);
    const stage = this.root.querySelector<HTMLElement>('.vs-stage')!, talk = stage.querySelector<HTMLElement>('.vs-talk')!;
    const whoEl = stage.querySelector<HTMLElement>('.vs-who')!, textEl = stage.querySelector<HTMLElement>('.vs-text')!;
    let idx = -1, shown = 0, full = '';
    const next = () => {
      if (idx >= 0 && shown < full.length) { shown = full.length; textEl.textContent = full; return; }   // completa a fala antes de avançar
      if (++idx >= script.length) { onGo(); return; }
      const ln = script[idx], f = ln.who === 0 ? a : b;
      stage.dataset.speaker = ln.who === 0 ? 'l' : 'r'; stage.classList.add('talking');
            talk.style.setProperty('--c', f.def.colors.primary);
      whoEl.textContent = f.def.name + (ln.who === 1 && hueB ? ' 2.0' : '');
      full = ln.text; shown = 0; textEl.textContent = '';
      // fonte grande e dinâmica: fala curta é gritada em letra enorme; fala em maiúsculas (robôs, monstro) treme
      const shout = full === full.toUpperCase() && /[A-ZÀ-Ú]{3}/.test(full);
      textEl.style.fontSize = `${full.length < 28 ? 46 : full.length < 55 ? 36 : full.length < 85 ? 29 : full.length < 120 ? 24 : 21}px`;
      textEl.className = `vs-text${shout ? ' shout' : ''}`; talk.classList.remove('pop'); void talk.offsetWidth; talk.classList.add('pop');
    };
    this.onConfirm = next;
    this.onBack = onGo;
    this.root.onclick = () => next();
    // ritmo de arcade: ninguém precisa apertar nada. Os dois aparecem (2,2 s), cada fala é digitada (2 letras por frame),
    // fica na tela o tempo de ler e passa sozinha. G/ENTER ou toque adianta, V pula tudo.
    let wait = 130;                                  // ~2,2 s só com os dois frente a frente
    this.onTick = () => {
      if (idx >= 0 && shown < full.length) {
        shown = Math.min(full.length, shown + 2); textEl.textContent = full.slice(0, shown);
        if (full[shown - 1] !== ' ') audio.sfx(script[idx].who === 0 ? 'talkA' : 'talkB');
        if (shown >= full.length) wait = Math.min(220, 85 + Math.round(full.length * 1.7));
        return;
      }
      if (--wait <= 0) next();
    };
  }

  /** Perdeu: contagem regressiva estilo fliperama. G/ENTER continua (escolhe lutador de novo e volta pra mesma luta); zerou ou V = fim. */
  private continueCount(onContinue: () => void, onQuit: () => void) {
    this.set('result', `<div class="center"><div class="title-big lose">GAME OVER</div>
        <div class="title-sm">CONTINUAR?</div><div class="cont-num">9</div>
        <div class="pix small">G / ENTER OU TOQUE: ESCOLHE O LUTADOR E VOLTA PRA MESMA LUTA</div><div class="pix tiny">V DESISTE</div></div>`);
    const num = this.root.querySelector<HTMLElement>('.cont-num')!; let n = 9, t = 0, done = false;
    const go = (f: () => void) => { if (!done) { done = true; f(); } };
    this.onConfirm = () => go(onContinue); this.onBack = () => go(onQuit); this.root.onclick = () => go(onContinue);
    this.onTick = () => {
      if (done || ++t < 60) return;
      t = 0; n--;
      if (n < 0) { go(onQuit); return; }
      num.textContent = String(n); num.classList.remove('pop'); void num.offsetWidth; num.classList.add('pop'); audio.sfx(n <= 3 ? 'tick' : 'menuMove');
    };
  }

  /** Cena final: o Mundim levanta da mesa e vem até a frente (10 quadros), legendas por cima, depois o destaque dele
   *  com um diálogo rápido e corta pra luta. Passa sozinha; G/ENTER adianta, V pula. */
  finalScene(player: FighterAssets, boss: FighterAssets, script: Line[], onGo: () => void) {
    const base = import.meta.env.BASE_URL, N = 10, HOLD = 40;          // 40 frames por quadro = ~6,7 s de caminhada
    const src = (i: number) => `${base}cutscene/mundim-${String(i + 1).padStart(2, '0')}.jpg`;
    for (let i = 0; i < N; i++) new Image().src = src(i);
    const CAPS: [number, string][] = [[0, '52º ANDAR · ÚLTIMO ANDAR'], [3, 'SALA DA DIRETORIA'], [6, 'MUNDIM · O CHEFÃO']];
    this.set('versus', `<div class="cut-stage" style="--c:${boss.def.colors.primary}">
        <img class="cut-img a" src="${src(0)}" alt=""><img class="cut-img b" src="${src(0)}" alt="">
        <div class="cut-bars"></div><div class="cut-cap"></div>
        <img class="cut-face" src="${base}versus/${boss.def.id}.png" alt="">
        <div class="vs-talk cut-talk"><div class="vs-who"></div><div class="vs-text"></div></div>
        <div class="pix tiny vs-hint">G / ENTER ADIANTA · V PULA</div></div>`);
    const stage = this.root.querySelector<HTMLElement>('.cut-stage')!, imgs = Array.from(stage.querySelectorAll<HTMLImageElement>('.cut-img'));
    const cap = stage.querySelector<HTMLElement>('.cut-cap')!, talk = stage.querySelector<HTMLElement>('.cut-talk')!;
    const whoEl = talk.querySelector<HTMLElement>('.vs-who')!, textEl = talk.querySelector<HTMLElement>('.vs-text')!;
    let t = 0, frame = 0, top = 0, idx = -1, shown = 0, full = '', wait = 0;
    const showFrame = (i: number) => { top = 1 - top; imgs[top].src = src(i); imgs[top].classList.add('on'); imgs[1 - top].classList.remove('on'); };
    imgs[0].classList.add('on');
    const say = () => {
      if (++idx >= script.length) { onGo(); return; }
      const ln = script[idx], f = ln.who === 0 ? player : boss;
      stage.classList.add('talking'); stage.dataset.speaker = ln.who === 0 ? 'l' : 'r';
      talk.style.setProperty('--c', f.def.colors.primary); whoEl.textContent = f.def.name;
      full = ln.text; shown = 0; textEl.textContent = '';
      textEl.style.fontSize = `${full.length < 28 ? 44 : full.length < 55 ? 34 : full.length < 85 ? 28 : 23}px`;
      talk.classList.remove('pop'); void talk.offsetWidth; talk.classList.add('pop');
    };
    const skipAhead = () => {
      if (idx < 0) { t = N * HOLD; return; }                                  // pula a caminhada
      if (shown < full.length) { shown = full.length; textEl.textContent = full; wait = 60; return; }
      say();
    };
    this.onConfirm = skipAhead; this.onBack = onGo; this.root.onclick = skipAhead;
    this.onTick = () => {
      if (idx < 0) {
        const f = Math.min(N - 1, Math.floor(++t / HOLD));
        if (f !== frame) { frame = f; showFrame(f); if (f >= 5) audio.sfx('land'); }
        const c = [...CAPS].reverse().find(([at]) => frame >= at)!;
        if (cap.textContent !== c[1]) { cap.textContent = c[1]; cap.classList.remove('pop'); void cap.offsetWidth; cap.classList.add('pop'); }
        if (t >= N * HOLD + 30) { stage.classList.add('face'); audio.voice(`ann-${boss.def.id}`, 'ann'); say(); }
        return;
      }
      if (shown < full.length) {
        shown = Math.min(full.length, shown + 2); textEl.textContent = full.slice(0, shown);
        if (full[shown - 1] !== ' ') audio.sfx(script[idx].who === 0 ? 'talkA' : 'talkB');
        if (shown >= full.length) wait = Math.min(210, 80 + Math.round(full.length * 1.6));
        return;
      }
      if (--wait <= 0) say();
    };
  }

  result(won: boolean, perfect: boolean, isLast: boolean, onNext: () => void, onQuit: () => void) {
    if (!won) { this.continueCount(onNext, onQuit); return; }
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

  ending(winner: FighterAssets, onDone: () => void, note = '') {
    this.set('ending', `
      <div class="center">
        <div class="thumb big">${winner.portrait ? `<img src="${winner.portrait.src}" alt="">` : ''}</div>
        <div class="title-big win">${winner.def.gender === 'f' ? 'CAMPEÃ' : 'CAMPEÃO'}</div>
        <div class="end-text">${endingOf(winner.def.id)}</div>${note ? `<div class="pix small" style="color:#ff5468">${note}</div>` : ''}
        <div class="pix tiny">G / ENTER PARA VOLTAR</div>
      </div>`);
    this.onConfirm = onDone;
  }

  /** Ranking: arcade (pontos) e arena online (vitórias). */
  ranking(arcade: { name: string; fighter: string; score: number }[], arena: { name: string; wins: number; losses: number; points: number }[], mine: number, onBack: () => void) {
    const row = (pos: number, name: string, val: string, hot = false) => `<div class="rk-row${hot ? ' hot' : ''}"><b>${pos}º</b><span>${name.replace(/[<>&]/g, '')}</span><i>${val}</i></div>`;
    this.set('rank', `<div class="rk">
      <div class="title-sm">RANKING</div>
      <div class="rk-cols">
        <div><h4>ARCADE · PONTOS</h4>${arcade.map((r, i) => row(i + 1, `${r.name} · ${r.fighter.toUpperCase()}`, String(r.score).padStart(6, '0'), r.score === mine)).join('') || '<div class="pix tiny">NINGUÉM PONTUOU AINDA. JOGUE O ARCADE.</div>'}</div>
        <div><h4>ARENA ONLINE</h4>${arena.map((r, i) => row(i + 1, r.name, `${r.points} PTS · ${r.wins}V ${r.losses}D`)).join('') || '<div class="pix tiny">SEM LUTAS ONLINE AINDA.</div>'}</div>
      </div>
      <div class="pix tiny">G / ENTER OU V PRA VOLTAR</div></div>`);
    this.onConfirm = onBack; this.onBack = onBack;
  }

  /** Pede um apelido (3 a 14 letras) pra gravar a pontuação. */
  askName(title: string, onOk: (name: string) => void) {
    this.set('lobby', `<div class="center"><div class="title-sm">${title}</div><div class="pix small">DIGITE SEU NOME PRO RANKING</div><input class="lb-input" maxlength="14" placeholder="SEU NOME" autofocus><div class="lb-btn" data-ok>GRAVAR</div></div>`);
    const inp = this.root.querySelector<HTMLInputElement>('.lb-input')!;
    let sent = false;
    const ok = () => { const v = inp.value.trim().toUpperCase(); if (!v || sent) return; sent = true; inp.disabled = true; this.root.querySelector<HTMLElement>('[data-ok]')!.textContent = 'GRAVANDO…'; onOk(v); };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') ok(); }); inp.addEventListener('keyup', (e) => e.stopPropagation());
    this.root.querySelector<HTMLElement>('[data-ok]')!.onclick = ok; setTimeout(() => inp.focus(), 50);
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
        <div class="pix tiny">START OU PAUSE ABREM ESTE MENU · F1 HITBOXES · F2 CÂMERA LENTA · F3 TREINO (F2 E F3 NÃO VALEM RANKING)</div>
      </div>`);
    this.onConfirm = (i) => (i === 0 ? onResume() : onQuit());
    this.onBack = onResume;
  }
}
