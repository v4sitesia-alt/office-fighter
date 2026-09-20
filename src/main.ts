import './styles.css';
import { loadFighter, loadReferee, loadStage, type StageAssets } from './core/assets';
import { Referee } from './game/referee';
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
import { maskOf, NetSession, WatchSession } from './net/netplay';
import { joinRoom, type Room } from './net/transport';
import * as store from './net/store';

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
/** Música do cenário: a do dono; se ele não tem, a de outro lutador que mora no mesmo cenário (a fábrica é do Sant'Anna). */
const trackOf = (f: FighterAssets) => {
  if (hasTrack(`fighter-${f.def.id}`)) return `fighter-${f.def.id}`;
  const mate = roster.find((o) => o.def.stage === f.def.stage && hasTrack(`fighter-${o.def.id}`));
  return mate ? `fighter-${mate.def.id}` : null;
};
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
let continues = 0, secretFight = false, tries = 0, arcadeScore = 0;

function buildCampaign() {
  continues = 0; secretFight = false; tries = 0; arcadeScore = 0;
  // 4 rivais do elenco (a partir da posição do jogador), depois Dias, Leo (no elevador), Xablau e o chefão
  const bosses = ['dias', 'leo', 'xablau', 'mundim']   // subchefe, o elevador com o Leo, a parada no andar do Xablau e o último andar
    .map((id) => roster.findIndex((f) => f.def.id === id)).filter((i) => i >= 0);
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
  match = new Match(roster[playerIdx], roster[opp.idx], stage, { cpu: level, hueP2: opp.hue, label: secretFight ? '53º ANDAR' : isLast ? 'LUTA FINAL' : `LUTA ${fightNo + 1}`, baseScore: arcadeScore }, {
    message: (t, f, k) => hud.message(t, f, k),
    end: (winner, perfect) => {
      setMode('result');
      const won = winner === 0;
      arcadeScore = match?.score[0] ?? arcadeScore;
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
        setMode('ending'); screens.ending(roster[playerIdx], () => finishArcade(), note);
      }, () => finishArcade());
    },
  });
  hud.localIndex = 0; hud.bind(match);
  paused = false;
  screens.hide();
  setMode('fight');
  { const tr = trackOf(owner); if (tr) audio.music(tr); } // música do dono do cenário
}

/** Fim do arcade (zerou ou desistiu no game over): grava a pontuação e mostra o ranking. */
function finishArcade() {
  const score = arcadeScore; arcadeScore = 0;
  if (score <= 0) { goTitle(); return; }
  let saved = false;
  const save = (name: string) => {
    if (saved) return;            // Enter repetido / vários cliques em GRAVAR gravavam a mesma pontuação várias vezes
    saved = true;
    try { localStorage.setItem('v4f-name', name); } catch { /* sem storage */ }
    let id = ''; try { id = sessionStorage.getItem('v4f-id') ?? Math.random().toString(36).slice(2, 10); sessionStorage.setItem('v4f-id', id); } catch { /* sem storage */ }
    void store.submitScore(id, { name, fighter: roster[playerIdx].def.id, score }).catch(() => undefined).then(() => showRanking(score));
  };
  let name = ''; try { name = localStorage.getItem('v4f-name') ?? ''; } catch { /* sem storage */ }
  setMode('difficulty');
  if (name) save(name); else screens.askName(`${String(score).padStart(6, '0')} PONTOS`, save);
}
function showRanking(mine = -1) {
  setMode('difficulty');
  void Promise.all([store.topScores().catch(() => []), store.ranking().catch(() => [])]).then(([a, b]) => screens.ranking(a, b, mine, goTitle));
}

function showVersus() {
  const opp = campaign[fightNo];
  setMode('versus');
  // última luta: em vez da tela VS, a cena do escritório (o Mundim levanta da mesa e vem até a frente) e corta pra batalha
  if (roster[opp.idx].def.id === 'mundim' && !opp.hue && !secretFight && tries === 0) {
    audio.preload('fighter-mundim');
    screens.finalScene(roster[playerIdx], roster[opp.idx], scriptFor(roster[playerIdx].def.id, 'mundim', false, 0), startFight);
    return;
  }
  audio.preload(`fighter-${(opp.hue ? roster[playerIdx] : roster[opp.idx]).def.id}`);
  screens.versus(roster[playerIdx], roster[opp.idx], secretFight ? 'LUTA SECRETA · 53º ANDAR' : fightNo === campaign.length - 1 ? 'LUTA FINAL' : `LUTA ${fightNo + 1} DE ${campaign.length}`, opp.hue, scriptFor(roster[playerIdx].def.id, roster[opp.idx].def.id, !!opp.hue, tries), startFight);
}

function goTitle() {
  match = null;
  setMode('title');
  if (audio.musicTime() < INTRO_END - 1) audio.seekMusic(INTRO_END); // título no trecho dos 19 s; se a música da intro já vinha tocando (voltou do menu), segue sem pular
  const menu = () => { setMode('difficulty'); screens.mainMenu(() => { online = false; showSelect(); }, () => { online = true; showSelect(); }, () => showRanking(), goTitle); };
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
let watchSession: WatchSession | null = null;
let netRoom: Room | null = null, watchRoom: Room | null = null;
let netCfg: NetMatchCfg | null = null;
let netMenuOpen = false, netOver = false;
const netStatus = document.createElement('div'); netStatus.className = 'net-status';
const netPing = document.createElement('div'); netPing.className = 'net-ping';
document.querySelector('.screen')!.append(netStatus, netPing);

function openLobby() {
  screens.hide();
  lobby ??= new Lobby(document.getElementById('screens')!, document.getElementById('room')!, roster, {
    start: startNetMatch,
    abort: (matchId, why) => { if (netCfg?.matchId === matchId && session && !session.connected) abortNetMatch(why); },
    exit: () => { lobby?.close(); lobby?.dispose(); lobby = null; goTitle(); },
    changeFighter: () => showSelect(),
  });
  setMode('lobby');
  lobby.open(roster[playerIdx].def.id);
}

const otherName = () => (netCfg ? netCfg.names[netCfg.local === 1 ? 0 : 1] : '');

function closeNetRooms() {
  netRoom?.leave(); watchRoom?.leave(); netRoom = null; watchRoom = null; session = null; watchSession = null;
  loop.setBackground(false);
  netStatus.className = 'net-status'; netPing.textContent = '';
}

function startNetMatch(cfg: NetMatchCfg) {
  if (session || watchSession) closeNetRooms();          // ex.: aceitou um desafio enquanto assistia
  paused = false;
  const fa = roster.find((r) => r.def.id === cfg.f[0]) ?? roster[0], fb = roster.find((r) => r.def.id === cfg.f[1]) ?? roster[0];
  const vs = `${cfg.names[0]} x ${cfg.names[1]}`;
  let over = false;
  netCfg = cfg; netMenuOpen = false; netOver = false;
  const m = new Match(fa, fb, stageOf(fb), { cpu: null }, {
    message: (t, f, k) => hud.message(t, f, k),
    end: (winner) => {
      if (over || netOver) return; over = true; netOver = true;
      session?.flushFeed();
      if (cfg.local === 0 && winner >= 0) lobby?.report(cfg, winner as 0 | 1);
      hud.message(winner >= 0 ? `${cfg.names[winner as 0 | 1]} VENCEU` : 'EMPATE', 200, 'small');
      setTimeout(leaveNetMatch, 3500);
    },
  });
  match = m; hud.localIndex = cfg.local; hud.bind(m);
  m.fighters.forEach((f, i) => { (document.querySelectorAll('#hud .name')[i] as HTMLElement).textContent = `${cfg.names[i]} · ${f.def.name}`; });
  if (cfg.local < 0) {
    watchRoom = joinRoom(`watch-${cfg.matchId}`, null, { onMsg: (msg) => watchSession?.onMsg(msg) });
    watchSession = new WatchSession(m, watchRoom);
  } else {
    netRoom = joinRoom(`match-${cfg.matchId}`, null, { onMsg: (msg) => session?.onMsg(msg) });
    if (cfg.local === 0) watchRoom = joinRoom(`watch-${cfg.matchId}`, null, { onMsg: (msg) => session?.onWatchMsg(msg) });
    const s = new NetSession(m, netRoom, cfg.local as 0 | 1, watchRoom);
    s.onConnect = () => { lobby?.connected(cfg.matchId); audio.sfx('menuConfirm'); };
    session = s;
  }
  lobby?.setStatus(cfg.local < 0 ? 'assistindo' : 'lutando', cfg.matchId, vs);
  screens.hide();
  setMode('netfight');
  loop.setBackground(true);
  { const tr = trackOf(fb); if (tr) audio.music(tr); }
}

function leaveNetMatch() {
  closeNetRooms(); match = null;
  if (mode === 'netfight') openLobby();
}

/** A luta não vai rolar (ninguém conectou, caiu, cancelou): volta pra sala com o motivo. */
function abortNetMatch(why: string) {
  session?.quit();
  closeNetRooms(); match = null; netMenuOpen = false; screens.hide();
  if (mode === 'netfight') openLobby();
  lobby?.note(why);
}

/** Aviso no meio da tela: conectando / esperando o outro / entrando na transmissão. */
function paintNetStatus() {
  let title = '', sub = '';
  const s = session, w = watchSession;
  if (s && !s.connected) {
    const left = Math.max(0, Math.ceil(((netCfg?.connectMs ?? 15000) - (Date.now() - s.born)) / 1000));
    title = `CONECTANDO COM ${otherName()}…`; sub = `${left}s · V OU PAUSE CANCELA`;
  } else if (s && s.stalled > 45 && !netOver) {
    title = `AGUARDANDO ${otherName()}…`; sub = 'A INTERNET DELE OSCILOU OU ELE TROCOU DE JANELA';
  } else if (w && !w.playing) { title = 'ENTRANDO NA TRANSMISSÃO…'; sub = 'A LUTA APARECE EM INSTANTES'; }
  const cls = title ? 'net-status show' : 'net-status', html = title ? `<b>${title}</b><i>${sub}</i>` : '';
  if (netStatus.className !== cls) netStatus.className = cls;
  if (netStatus.innerHTML !== html) netStatus.innerHTML = html;
  const ping = s?.connected ? `${Math.round(s.rtt)} ms · atraso ${s.delay}${s.desync ? ' · ⚠ DESSINCRONIZOU' : ''}` : '';
  if (netPing.textContent !== ping) netPing.textContent = ping;
}

// ---------- teclas de debug
window.addEventListener('keydown', (e) => {
  if (e.code === 'F1') { debug = !debug; e.preventDefault(); }
  if (e.code === 'F2' && match) { match.slowmo = match.slowmo ? 0 : 4; e.preventDefault(); }
  if (e.code === 'F3' && match) { match.training = !match.training; e.preventDefault(); }
});

/** Debug: começa uma luta avulsa entre dois lutadores, no cenário do segundo. Não conta pro arcade nem pro ranking. */
function debugFight(a: string, b: string, cpu: Difficulty | null = 'normal') {
  const fa = roster.find((f) => f.def.id === a), fb = roster.find((f) => f.def.id === b);
  if (!fa || !fb) return false;
  match = new Match(fa, fb, stageOf(fb), { cpu, hueP2: a === b ? 150 : 0, label: 'TESTE' }, { message: (t, f, k) => hud.message(t, f, k), end: () => goTitle() });
  hud.localIndex = 0; hud.bind(match); paused = false; screens.hide(); setMode('fight');
  return true;
}
// acesso de debug no console: __of().match.fighters[0] · __of().fight('edgard', 'landim')
/** Debug: mostra a cena final com o lutador dado e volta pro título. */
function debugScene(a: string) {
  const fa = roster.find((f) => f.def.id === a), boss = roster.find((f) => f.def.id === 'mundim');
  if (!fa || !boss) return false;
  setMode('versus'); screens.finalScene(fa, boss, scriptFor(a, 'mundim', false, 0), goTitle); return true;
}
(window as unknown as { __of: () => unknown }).__of = () => ({ mode, match, debug, input, audio, fight: debugFight, scene: debugScene, get session() { return session; }, get watchSession() { return watchSession; }, get lobby() { return lobby; } });

// ---------- loop
const loop = startLoop({
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
    if (mode === 'netfight' && match && (session || watchSession)) {
      const s = session;
      if (s) {
        s.tick(netMenuOpen ? 0 : maskOf(p));
        if (!s.connected && Date.now() - s.born > (netCfg?.connectMs ?? 15000)) { abortNetMatch(`${otherName()} não conectou. Tente de novo.`); return; }
      } else watchSession!.tick();
      if (!match) return;
      hud.update(match);
      paintNetStatus();
      if (s?.lost) { abortNetMatch(`A conexão com ${otherName()} caiu.`); return; }
      if (watchSession?.lost) { abortNetMatch('A transmissão da luta caiu.'); return; }
      if (s && s.quitBy !== null && !netOver) {                 // o outro desistiu: quem ficou leva a vitória e registra
        netOver = true; netMenuOpen = false; screens.hide();
        const w = (1 - s.quitBy) as 0 | 1;
        if (s.local === w && netCfg && s.frame > 100) lobby?.report(netCfg, w);
        hud.message(s.frame > 100 ? `${otherName()} DESISTIU` : `${otherName()} SAIU`, 200, 'small');
        setTimeout(leaveNetMatch, 2500);
      } else if (netMenuOpen) screens.update(input);
      else if (s && !s.connected && (p.pressed('pause') || p.pressed('start') || p.pressed('block'))) { abortNetMatch('Desafio cancelado.'); return; }
      else if ((p.pressed('pause') || p.pressed('start')) && !netOver) {
        netMenuOpen = true;
        screens.netMenu(!s, () => { netMenuOpen = false; screens.hide(); }, () => {
          netMenuOpen = false; screens.hide();
          if (s) { s.quit(); netOver = true; }
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
  Referee.assets = await loadReferee();
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
