import './styles.css';
import { loadFighter, loadStage, type StageAssets } from './core/assets';
import { audio } from './core/audio';
import { Input } from './core/input';
import { startLoop } from './core/loop';
import { ROSTER, STAGE } from './data/roster';
import { H, W } from './game/consts';
import { Match } from './game/match';
import type { Difficulty, FighterAssets } from './game/types';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';
import { bindCabinet } from './ui/touch';

type Mode = 'loading' | 'title' | 'difficulty' | 'select' | 'versus' | 'fight' | 'result' | 'ending';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

const input = new Input();
const screens = new Screens(document.getElementById('screens')!);
const hud = new Hud(document.getElementById('hud')!);
bindCabinet(input, document.getElementById('panel')!);

// ---------- escala da tela 960x540 pro espaço disponível
function fit() {
  const wrap = document.getElementById('screen-wrap')!;
  const panel = document.getElementById('panel')!;
  const overlay = matchMedia('(max-height: 520px) and (orientation: landscape)').matches;
  const availW = overlay ? window.innerWidth - 24 : Math.min(window.innerWidth - 40, 1120);
  const availH = overlay ? window.innerHeight - 16 : window.innerHeight - panel.offsetHeight - 120;
  const s = Math.max(0.3, Math.min(availW / W, availH / H));
  wrap.style.width = `${W * s}px`; wrap.style.height = `${H * s}px`;
  (wrap.firstElementChild as HTMLElement).style.transform = `scale(${s})`;
}
window.addEventListener('resize', fit);
fit();

// ---------- estado do jogo
let mode: Mode = 'loading';
let roster: FighterAssets[] = [];
let stage: StageAssets;
let match: Match | null = null;
let demo: Match | null = null;
let paused = false;
let debug = false;
let difficulty: Difficulty = 'normal';
let playerIdx = 0;
let campaign: { idx: number; hue: number }[] = [];
let fightNo = 0;

const DIFF_RAMP: Difficulty[][] = [['easy', 'easy', 'normal', 'normal'], ['normal', 'normal', 'hard', 'hard'], ['hard', 'hard', 'hard', 'hard']];

const MUSIC: Record<Mode, 'title' | 'select' | 'fight' | null> = {
  loading: null, title: 'title', difficulty: 'select', select: 'select', versus: 'select', fight: 'fight', result: null, ending: null,
};
function setMode(m: Mode) { mode = m; document.body.dataset.mode = m; audio.music(MUSIC[m]); }

// áudio só pode nascer depois de um gesto do usuário
const unlock = () => audio.unlock();
window.addEventListener('keydown', unlock);
window.addEventListener('pointerdown', unlock);
const muteBtn = document.getElementById('mute') as HTMLButtonElement;
const paintMute = () => { muteBtn.textContent = audio.muted ? '🔇' : '🔊'; muteBtn.classList.toggle('off', audio.muted); };
muteBtn.addEventListener('click', () => { audio.unlock(); audio.toggleMute(); paintMute(); });
paintMute();

function buildCampaign() {
  const others = roster.map((_, i) => i).filter((i) => i !== playerIdx);
  campaign = [...others.map((idx) => ({ idx, hue: 0 })), { idx: playerIdx, hue: 150 }];
  fightNo = 0;
}

function startFight() {
  const opp = campaign[fightNo];
  const level = DIFF_RAMP[['easy', 'normal', 'hard'].indexOf(difficulty)][Math.min(fightNo, 3)];
  const isLast = fightNo === campaign.length - 1;
  match = new Match(roster[playerIdx], roster[opp.idx], stage, { cpu: level, hueP2: opp.hue, label: isLast ? 'LUTA FINAL' : `LUTA ${fightNo + 1}` }, {
    message: (t, f, k) => hud.message(t, f, k),
    end: (winner, perfect) => {
      setMode('result');
      const won = winner === 0;
      audio.sfx(won ? 'win' : 'lose'); audio.voice(won ? 'ann-you-win' : 'ann-you-lose', 'ann');
      screens.result(won, perfect, isLast, () => {
        if (won) { fightNo++; if (fightNo >= campaign.length) { setMode('ending'); screens.ending(roster[playerIdx], goTitle); } else showVersus(); }
        else showVersus();
      }, goTitle);
    },
  });
  hud.bind(match);
  paused = false;
  screens.hide();
  setMode('fight');
}

function showVersus() {
  const opp = campaign[fightNo];
  setMode('versus');
  screens.versus(roster[playerIdx], roster[opp.idx], fightNo === campaign.length - 1 ? 'LUTA FINAL' : `LUTA ${fightNo + 1} DE ${campaign.length}`, opp.hue, startFight);
}

function goTitle() {
  match = null;
  setMode('title');
  screens.title(() => { setMode('difficulty'); screens.difficulty((d) => { difficulty = d; showSelect(); }, goTitle); }, roster.length);
}

function showSelect() {
  setMode('select');
  screens.select(roster, (i) => { playerIdx = i; buildCampaign(); showVersus(); }, goTitle);
}

// ---------- teclas de debug
window.addEventListener('keydown', (e) => {
  if (e.code === 'F1') { debug = !debug; e.preventDefault(); }
  if (e.code === 'F2' && match) { match.slowmo = match.slowmo ? 0 : 4; e.preventDefault(); }
  if (e.code === 'F3' && match) { match.training = !match.training; e.preventDefault(); }
});

// acesso de debug no console: __of().match.fighters[0]
(window as unknown as { __of: () => unknown }).__of = () => ({ mode, match, debug, input, audio });

// ---------- loop
startLoop({
  update() {
    input.step();
    const p = input.ports[0];
    if (mode === 'fight' && match) {
      if (p.pressed('pause')) {
        paused = !paused;
        if (paused) screens.pause(() => { paused = false; screens.hide(); }, () => { paused = false; goTitle(); });
        else screens.hide();
      }
      if (paused) screens.update(input);
      match.update(input, paused);
      hud.update(match);
      return;
    }
    screens.update(input);
    if (match && (mode === 'result')) { match.update(input, false); hud.update(match); }
    else if (demo) demo.idleUpdate();
  },
  render() {
    ctx.clearRect(0, 0, W, H);
    if (mode === 'fight' || mode === 'result') { match?.render(ctx, debug); return; }
    if (demo) demo.render(ctx, false);
    if (mode !== 'loading') { ctx.fillStyle = 'rgba(6,10,30,0.72)'; ctx.fillRect(0, 0, W, H); }
  },
});

// ---------- boot
(async () => {
  const total = ROSTER.length * 5 + 3; let done = 0;
  const tick = () => { done++; screens.loading(done, total); };
  screens.loading(0, total);
  const [fighters, st] = await Promise.all([Promise.all(ROSTER.map((id) => loadFighter(id, tick))), loadStage(STAGE, tick)]);
  void audio.preloadVoices(import.meta.env.BASE_URL);
  roster = fighters; stage = st;
  demo = new Match(roster[0], roster[1 % roster.length], stage, { cpu: null }, { message() {}, end() {} });
  demo.phase = 'over';
  goTitle();
})().catch((err) => { console.error(err); screens.loading(0, 1); document.getElementById('screens')!.innerHTML += `<div class="err">${String(err)}</div>`; });
