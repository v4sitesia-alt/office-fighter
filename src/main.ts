import './styles.css';
import { loadFighter, loadStage, type StageAssets } from './core/assets';
import { audio, hasTrack } from './core/audio';
import { Input } from './core/input';
import { startLoop } from './core/loop';
import { DEFAULT_STAGE, ROSTER, SECRET } from './data/roster';
import { scriptFor } from './data/dialogue';
import { setupMobile } from './core/mobile';
import { H, W } from './game/consts';
import { Match } from './game/match';
import type { Difficulty, FighterAssets } from './game/types';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';
import { Intro, INTRO_END } from './ui/intro';
import { bindCabinet } from './ui/touch';
import { Lobby, type NetMatchCfg } from './net/lobby';
import { maskOf, NetSession } from './net/netplay';
import { joinRoom, type Room } from './net/transport';

type Mode = 'loading' | 'boot' | 'intro' | 'lobby' | 'netfight' | 'title' | 'difficulty' | 'select' | 'versus' | 'fight' | 'result' | 'ending';

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
  const wrap = document.getElementById('screen-wrap')!, cab = document.querySelector<HTMLElement>('.cabinet')!;
  const vw = window.innerWidth, vh = window.innerHeight;
  const phoneL = matchMedia('(max-height: 520px) and (orientation: landscape)').matches;
  const phoneP = matchMedia('(max-width: 720px) and (orientation: portrait)').matches;
  const docked = !phoneL && !phoneP && vw >= 1000 && document.body.classList.contains('online') && document.body.classList.contains('room-open');
  document.body.classList.toggle('room-docked', docked);
  let aw: number, ah: number;
  if (phoneL) { aw = vw; ah = vh; }
  else if (phoneP) { aw = vw - 22; ah = vh * 0.46; }
  else { const chrome = cab.offsetHeight - wrap.offsetHeight; aw = Math.min(vw - 110 - (docked ? 302 : 0), 1240); ah = vh - chrome - 30; }
  const s = Math.max(0.28, Math.min(aw / W, ah / H));
  wrap.style.width = `${Math.floor(W * s)}px`; wrap.style.height = `${Math.floor(H * s)}px`;
  (wrap.firstElementChild as HTMLElement).style.transform = `scale(${s})`;
}
document.getElementById('room-toggle')!.addEventListener('click', () => { document.body.classList.toggle('room-open'); fit(); });
window.addEventListener('resize', fit);
fit();

// ---------- estado do jogo
let mode: Mode = 'loading';
let roster: FighterAssets[] = [];
let stages = new Map<string, StageAssets>();
const stageOf = (f: FighterAssets) => stages.get(f.def.stage ?? DEFAULT_STAGE) ?? stages.get(DEFAULT_STAGE)!;
let match: Match | null = null;
let demo: Match | null = null;
let paused = false;
let debug = false;
let difficulty: Difficulty = 'normal';
let playerIdx = 0;
let campaign: { idx: number; hue: number }[] = [];
let fightNo = 0;

const DIFF_RAMP: Difficulty[][] = [['easy', 'easy', 'normal', 'normal'], ['normal', 'normal', 'hard', 'hard'], ['hard', 'hard', 'hard', 'hard']];

const MUSIC: Record<Mode, 'intro' | 'select' | 'fight' | null> = {
  loading: null, boot: null, intro: 'intro', lobby: 'select', netfight: 'fight', title: 'intro', difficulty: 'intro', select: 'select', versus: 'select', fight: 'fight', result: null, ending: null,
};
const cinematic = new Intro();
let introClock = 0;
audio.base = import.meta.env.BASE_URL;
setupMobile();
function setMode(m: Mode) { mode = m; document.body.dataset.mode = m; document.body.classList.toggle('in-fight', m === 'fight' || m === 'netfight'); audio.music(MUSIC[m]); }

// áudio só pode nascer depois de um gesto do usuário
const unlock = () => audio.unlock();
window.addEventListener('keydown', unlock);
window.addEventListener('pointerdown', unlock);
const muteBtn = document.getElementById('mute') as HTMLButtonElement;
const paintMute = () => { muteBtn.textContent = audio.muted ? '🔇' : '🔊'; muteBtn.classList.toggle('off', audio.muted); };
muteBtn.addEventListener('click', () => { audio.unlock(); audio.toggleMute(); paintMute(); });
paintMute();

// ---------- lutador secreto: destrava com o código na seleção ou vencendo a luta secreta do arcade
const unlockedIds = new Set<string>((() => { try { return JSON.parse(localStorage.getItem('v4f-unlocked') ?? '[]') as string[]; } catch { return []; } })());
const secret = {
  isLocked: (id: string) => !unlockedIds.has(id),
  unlock: (id: string) => { unlockedIds.add(id); try { localStorage.setItem('v4f-unlocked', JSON.stringify([...unlockedIds])); } catch { /* sem storage */ } },
};
let continues = 0, secretFight = false, tries = 0;

function buildCampaign() {
  continues = 0; secretFight = false; tries = 0;
  // 4 rivais do elenco (a partir da posição do jogador), depois o capanga, o subchefe e o chefão
  const bosses = ['xablau', 'dias', 'mundim'].map((id) => roster.findIndex((f) => f.def.id === id)).filter((i) => i >= 0);
  const pool = roster.map((_, i) => i).filter((i) => i !== playerIdx && !bosses.includes(i) && !roster[i].def.secret);
  const rivals = pool.map((_, k) => pool[(k + playerIdx) % pool.length]).slice(0, 4);
  campaign = [...rivals, ...bosses].map((idx) => (idx === playerIdx ? { idx, hue: 150 } : { idx, hue: 0 }));  // se você é um dos chefes, enfrenta o seu clone
  fightNo = 0;
}

function startFight() {
  const opp = campaign[fightNo];
  const level = secretFight ? 'hard' : DIFF_RAMP[['easy', 'normal', 'hard'].indexOf(difficulty)][Math.min(fightNo, 3)];
  const isLast = fightNo === campaign.length - 1;
  const owner = opp.hue ? roster[playerIdx] : roster[opp.idx]; // luta no cenário (e com a música) do oponente
  const stage = stageOf(owner);
  match = new Match(roster[playerIdx], roster[opp.idx], stage, { cpu: level, hueP2: opp.hue, label: secretFight ? '53º ANDAR' : isLast ? 'LUTA FINAL' : `LUTA ${fightNo + 1}` }, {
    message: (t, f, k) => hud.message(t, f, k),
    end: (winner, perfect) => {
      setMode('result');
      const won = winner === 0;
      audio.sfx(won ? 'win' : 'lose'); audio.voice(won ? 'ann-you-win' : 'ann-you-lose', 'ann');
      screens.result(won, perfect, isLast, () => {
        if (!won) { continues++; tries++; showVersus(); return; }
        fightNo++; tries = 0;
        if (fightNo < campaign.length) { showVersus(); return; }
        // zerou sem perder nenhuma luta: o elevador sobe mais um andar
        const boss = roster.findIndex((f) => f.def.secret);
        if (!secretFight && continues === 0 && boss >= 0 && boss !== playerIdx) {
          secretFight = true; campaign.push({ idx: boss, hue: 0 });
          audio.voice('ann-secret', 'ann'); showVersus(); return;
        }
        let note = '';
        if (secretFight && secret.isLocked(roster[boss].def.id)) { secret.unlock(roster[boss].def.id); note = `${roster[boss].def.name} DESBLOQUEADO`; }
        setMode('ending'); screens.ending(roster[playerIdx], goTitle, note);
      }, goTitle);
    },
  });
  hud.localIndex = 0; hud.bind(match);
  paused = false;
  screens.hide();
  setMode('fight');
  if (hasTrack(`fighter-${owner.def.id}`)) audio.music(`fighter-${owner.def.id}`); // música do dono do cenário
}

function showVersus() {
  const opp = campaign[fightNo];
  setMode('versus');
  audio.preload(`fighter-${(opp.hue ? roster[playerIdx] : roster[opp.idx]).def.id}`);
  screens.versus(roster[playerIdx], roster[opp.idx], secretFight ? 'LUTA SECRETA · 53º ANDAR' : fightNo === campaign.length - 1 ? 'LUTA FINAL' : `LUTA ${fightNo + 1} DE ${campaign.length}`, opp.hue, scriptFor(roster[playerIdx].def.id, roster[opp.idx].def.id, !!opp.hue, tries), startFight);
}

function goTitle() {
  match = null;
  setMode('title');
  if (audio.musicTime() < INTRO_END - 1) audio.seekMusic(INTRO_END); // título no trecho dos 19 s; se a música da intro já vinha tocando (voltou do menu), segue sem pular
  const menu = () => { setMode('difficulty'); screens.mainMenu(() => { online = false; showSelect(); }, () => { online = true; showSelect(); }, goTitle); };
  screens.title(menu, ROSTER.length);
}

function showSelect() {
  setMode('select');
  screens.select(roster, secret, (i) => { playerIdx = i; if (online) openLobby(); else { buildCampaign(); showVersus(); } }, goTitle);
}

// ---------- arena online
let online = false;
let lobby: Lobby | null = null;
let session: NetSession | null = null;
let netRoom: Room | null = null;
let netCfg: NetMatchCfg | null = null;
let netMenuOpen = false, netOver = false;

function openLobby() {
  screens.hide();
  lobby ??= new Lobby(document.getElementById('screens')!, document.getElementById('room')!, roster, startNetMatch, () => { lobby?.close(); lobby = null; goTitle(); }, () => showSelect());
  setMode('lobby');
  lobby.open(roster[playerIdx].def.id);
}

function startNetMatch(cfg: NetMatchCfg) {
  const fa = roster.find((r) => r.def.id === cfg.f[0]) ?? roster[0], fb = roster.find((r) => r.def.id === cfg.f[1]) ?? roster[0];
  const vs = `${cfg.names[0]} x ${cfg.names[1]}`;
  let over = false;
  netCfg = cfg; netMenuOpen = false; netOver = false;
  const m = new Match(fa, fb, stageOf(fb), { cpu: null }, {
    message: (t, f, k) => hud.message(t, f, k),
    end: (winner) => {
      if (over || netOver) return; over = true; netOver = true;
      if (cfg.local === 0 && winner >= 0) lobby?.report(cfg, winner as 0 | 1);
      hud.message(winner >= 0 ? `${cfg.names[winner as 0 | 1]} VENCEU` : 'EMPATE', 200, 'small');
      setTimeout(leaveNetMatch, 3500);
    },
  });
  match = m; hud.localIndex = cfg.local; hud.bind(m);
  m.fighters.forEach((f, i) => { (document.querySelectorAll('#hud .name')[i] as HTMLElement).textContent = `${cfg.names[i]} · ${f.def.name}`; });
  netRoom = joinRoom(`match-${cfg.matchId}`, null, { onMsg: (msg) => session?.onMsg(msg) });
  session = new NetSession(m, netRoom, cfg.local);
  lobby?.setStatus(cfg.local < 0 ? 'assistindo' : 'lutando', cfg.matchId, vs);
  screens.hide();
  setMode('netfight');
  if (hasTrack(`fighter-${fb.def.id}`)) audio.music(`fighter-${fb.def.id}`);
}

function leaveNetMatch() {
  netRoom?.leave(); netRoom = null; session = null; match = null;
  if (mode === 'netfight') openLobby();
}

/** Autoteste do lockstep (console: await __of().netSelfTest()): duas simulações ligadas por uma "rede" com latência
 *  e botões aleatórios têm que terminar exatamente no mesmo estado, e um espectador tardio também. */
function netSelfTest(frames = 1500, latency = 5) {
  const queue: { at: number; to: NetSession[]; m: Parameters<NetSession['onMsg']>[0] }[] = [];
  let now = 0;
  const sessions: NetSession[] = [];
  const mk = (local: 0 | 1 | -1) => {
    const m = new Match(roster[0], roster[1], stageOf(roster[1]), { cpu: null }, { message() {}, end() {} });
    const ref: { s: NetSession | null } = { s: null };
    const room: Room = { send: (msg) => queue.push({ at: now + latency + Math.floor(Math.random() * 4), to: sessions.filter((x) => x !== ref.s), m: JSON.parse(JSON.stringify(msg)) }), setPresence() {}, leave() {} };
    const sess: NetSession = new NetSession(m, room, local); ref.s = sess; sessions.push(sess); return sess;
  };
  const hist: Map<number, string>[] = [];
  const snap = (x: NetSession) => ({ frame: x.frame, st: x.match.fighters.map((f) => [Math.round(f.x * 100), Math.round(f.y * 100), Math.round(f.life * 100), Math.round(f.meter * 100), f.state].join(',')).join(' | ') });
  const a = mk(0), b = mk(1); let spec: NetSession | null = null;
  const wasMuted = audio.muted; if (!wasMuted) audio.toggleMute();
  let ma = 0, mb = 0;
  for (now = 0; now < frames; now++) {
    if (now === 400) spec = mk(-1);
    if (now % 7 === 0) ma = Math.floor(Math.random() * 512); if (now % 5 === 0) mb = Math.floor(Math.random() * 512);
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].at <= now) { const q = queue.splice(i, 1)[0]; q.to.forEach((t) => t.onMsg(q.m)); }
    a.tick(ma); b.tick(mb); spec?.tick(0);
    sessions.forEach((x, i) => (hist[i] ??= new Map()).set(x.frame, snap(x).st));
  }
  if (!wasMuted) audio.toggleMute();
  const common = Math.min(...sessions.map((x) => x.frame));
  const at = hist.map((h) => h.get(common));
  return { frames: sessions.map((x) => x.frame), common, equal: at.every((v) => v !== undefined && v === at[0]), state: at[0], round: a.match.round, wins: a.match.wins };
}

// ---------- teclas de debug
window.addEventListener('keydown', (e) => {
  if (e.code === 'F1') { debug = !debug; e.preventDefault(); }
  if (e.code === 'F2' && match) { match.slowmo = match.slowmo ? 0 : 4; e.preventDefault(); }
  if (e.code === 'F3' && match) { match.training = !match.training; e.preventDefault(); }
});

// acesso de debug no console: __of().match.fighters[0]
(window as unknown as { __of: () => unknown }).__of = () => ({ mode, match, debug, input, audio, netSelfTest });

// ---------- loop
startLoop({
  update() {
    input.step();
    const p = input.ports[0];
    if (mode === 'fight' && match) {
      if (p.pressed('pause') || (!paused && p.pressed('start'))) {
        paused = !paused;
        if (paused) screens.pause(() => { paused = false; screens.hide(); }, () => { paused = false; goTitle(); });
        else screens.hide();
      } else if (paused) screens.update(input);   // no frame em que o menu abre, o mesmo botão não pode já confirmar/fechar
      if (!match || mode !== 'fight') return;               // saiu pela pausa
      match.update(input, paused);
      hud.update(match);
      return;
    }
    if (mode === 'netfight' && session && match) {
      session.tick(netMenuOpen ? 0 : maskOf(p));
      hud.update(match);
      if (session.lost) { hud.message('CONEXÃO PERDIDA', 120, 'small'); leaveNetMatch(); }
      else if (session.quitBy !== null && !netOver) {           // o outro desistiu: quem ficou leva a vitória e registra
        netOver = true; netMenuOpen = false; screens.hide();
        const w = (1 - session.quitBy) as 0 | 1;
        if (session.local === w && netCfg) lobby?.report(netCfg, w);
        hud.message(`${netCfg?.names[session.quitBy] ?? ''} DESISTIU`, 200, 'small');
        setTimeout(leaveNetMatch, 2500);
      } else if (netMenuOpen) screens.update(input);
      else if ((p.pressed('pause') || p.pressed('start')) && !netOver) {
        netMenuOpen = true;
        const s = session;
        screens.netMenu(s.local < 0, () => { netMenuOpen = false; screens.hide(); }, () => {
          netMenuOpen = false; screens.hide();
          if (s.local >= 0) { netRoom?.send({ t: 'quit', p: s.local }); netOver = true; }
          leaveNetMatch();
        });
      }
      return;
    }
    if (mode === 'lobby') return;
    if (mode === 'intro') {
      introClock += 1 / 60;
      const t = audio.musicTime() >= 0 ? audio.musicTime() : introClock;
      if (t >= INTRO_END || input.anyPressed) goTitle();
      return;
    }
    screens.update(input);
    if (match && (mode === 'result')) { match.update(input, false); hud.update(match); }
    else if (demo) demo.idleUpdate();
  },
  render() {
    ctx.clearRect(0, 0, W, H);
    if (mode === 'boot') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }
    if (mode === 'intro') { cinematic.render(ctx, audio.musicTime() >= 0 ? audio.musicTime() : introClock); ctx.imageSmoothingEnabled = false; return; }
    if (mode === 'fight' || mode === 'result' || mode === 'netfight') { match?.render(ctx, debug); return; }
    const intro = stages.get('intro');
    if (mode === 'title' && intro) { ctx.drawImage(intro.img, 0, 0, W, H); ctx.fillStyle = 'rgba(6,10,30,0.35)'; ctx.fillRect(0, 0, W, H); return; }
    const lift = stages.get('elevator');
    if (lift && mode !== 'loading') { ctx.drawImage(lift.img, 0, 0, W, H); ctx.fillStyle = 'rgba(6,4,12,0.45)'; ctx.fillRect(0, 0, W, H); return; } // telas antes da luta: hall do elevador
    if (demo) demo.render(ctx, false);
    if (mode !== 'loading') { ctx.fillStyle = 'rgba(6,10,30,0.72)'; ctx.fillRect(0, 0, W, H); }
  },
});

// ---------- boot
(async () => {
  const ids = [...ROSTER, ...SECRET];
  const total = ids.length * 5 + 6; let done = 0;
  const tick = () => { done++; screens.loading(done, total); };
  screens.loading(0, total);
  await audio.loadTracks(); audio.preload('intro', 'select');
  const fighters = await Promise.all(ids.map((id) => loadFighter(id, tick)));
  const names = [...new Set([DEFAULT_STAGE, 'intro', 'elevator', ...fighters.map((f) => f.def.stage ?? DEFAULT_STAGE)])];
  const loaded = await Promise.all(names.map((n) => loadStage(n, tick).catch(() => null)));
  loaded.forEach((st, i) => { if (st) stages.set(names[i], st); });
  void audio.preloadVoices(import.meta.env.BASE_URL);
  roster = fighters;
  demo = new Match(roster[0], roster[1 % roster.length], stageOf(roster[0]), { cpu: null }, { message() {}, end() {} });
  demo.phase = 'over';
  await cinematic.load(import.meta.env.BASE_URL).catch(() => undefined);
  // o navegador só libera som depois de um gesto: a abertura começa no primeiro toque/tecla
  setMode('boot');
  const invited = new URLSearchParams(location.search).has('arena');
  screens.boot(() => { screens.hide(); if (invited) { online = true; showSelect(); } else { introClock = 0; setMode('intro'); } }, invited);
})().catch((err) => { console.error(err); screens.loading(0, 1); document.getElementById('screens')!.innerHTML += `<div class="err">${String(err)}</div>`; });
