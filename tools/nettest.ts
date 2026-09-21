// Testes da arena online, rodando no Node com a MESMA lógica do jogo (luta, lockstep e convites), sem tela.
//
//   npm run nettest -- sim          rede simulada (atraso, perda, chegada fora de ordem): a luta não pode travar
//                                   nem dessincronizar, e a plateia tem que ver exatamente a mesma luta
//   npm run nettest -- real         dois robôs em processos separados pelo Supabase de verdade: um desafia, o outro
//                                   aceita, lutam uma partida inteira e os estados são comparados frame a frame
//   npm run nettest -- invites      protocolo de convite: aceitar, recusar, cancelar, expirar, aceite atrasado,
//                                   quem convidou ocupado, desafio cruzado e aceite perdido na rede
//   npm run nettest -- ranking      ranking: a mesma pessoa (outra visita, outro aparelho, com ou sem acento) soma numa
//                                   linha só, e a pontuação do arcade gravada repetida aparece uma vez
//   npm run nettest -- bot [--name ROBÔ] [--fighter santana] [--challenge NOME]
//                                   robô que entra na sala: aceita qualquer desafio (ou desafia NOME) e luta sozinho,
//                                   pra testar com o jogo aberto no navegador
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Match } from '../src/game/match';
import type { FighterAssets } from '../src/game/types';
import type { StageAssets } from '../src/core/assets';
import { Rng } from '../src/core/rng';
import { NetSession, WatchSession, hashMatch } from '../src/net/netplay';
import { Invites } from '../src/net/invites';
import { Squad, SQUAD, duoConfig, type SquadState } from '../src/net/squad';
import { joinRoom, type Msg, type Peer, type Room } from '../src/net/transport';
import { mergeRanking, rankKey, resultArgs, uniqueScores, type RankRow } from '../src/net/store';

const load = (id: string): FighterAssets => {                      // `morph` junto: no 2º round o Mundim vira o monstro, e isso conta na medição
  const def = JSON.parse(fs.readFileSync(`public/fighters/${id}/fighter.json`, 'utf8'));
  return { def, frames: JSON.parse(fs.readFileSync(`public/fighters/${id}/frames.json`, 'utf8')),
    sheet: {} as HTMLImageElement, fx: {}, morph: def.morph ? load(def.morph) : undefined };
};
const STAGE = { name: 'teste', img: {} as HTMLImageElement } as StageAssets;
const log = (o: object) => console.log(JSON.stringify(o));

/** Botões "de gente": anda, pula, bate, segura defesa, com trocas a cada poucos frames. */
function player(seed: number) {
  const rng = new Rng(seed); let mask = 0, hold = 0;
  return () => {
    if (--hold <= 0) {
      hold = 4 + Math.floor(rng.next() * 18);
      const r = rng.next();
      mask = r < 0.25 ? 0 : r < 0.45 ? (1 << (rng.chance(0.5) ? 0 : 1)) : r < 0.55 ? 1 << 2 : r < 0.62 ? 1 << 4 : r < 0.72 ? 1 << 5 : r < 0.8 ? 1 << 6 : r < 0.86 ? 1 << 7 : r < 0.92 ? (1 << 3) | (1 << 6) : 1 << 8;
    }
    return mask;
  };
}

// ---------------------------------------------------------------- rede simulada
function sim() {
  const cases = [
    { name: 'rede boa', lat: [2, 4], drop: 0, late: 0 },
    { name: 'rede ruim + quem convidou entra 2 s depois', lat: [3, 14], drop: 0.15, late: 120 },
    { name: 'rede péssima (30% de perda, até 0,5 s de atraso)', lat: [5, 30], drop: 0.3, late: 40 },
  ];
  let ok = true;
  for (const c of cases) {
    const rng = new Rng(7);
    type Sub = { id: string; on: (m: Msg) => void };
    const q: { at: number; to: Sub; m: Msg }[] = []; let now = 0;
    const net = (subs: Sub[]) => (self: Sub): Room => ({
      send: (m) => { for (const s of subs) if (s !== self && !(rng.chance(c.drop))) q.push({ at: now + c.lat[0] + Math.floor(rng.next() * (c.lat[1] - c.lat[0] + 1)), to: s, m: JSON.parse(JSON.stringify(m)) }); },
      setPresence() {}, leave() {}, ready: () => true,
    });
    const play: Sub[] = [], watch: Sub[] = [];
    const [A, B] = [load('edgard'), load('santana')];
    const hashes: Map<number, number>[] = [new Map(), new Map(), new Map()];
    let ended = [false, false, false];
    const mk = () => new Match(A, B, STAGE, { cpu: null }, { message() {}, end() {} });
    const ma = mk(), mb = mk(), mw = mk();
    const subA: Sub = { id: 'a', on: (m) => sa.onMsg(m) }, subB: Sub = { id: 'b', on: (m) => sb.onMsg(m) };
    const wA: Sub = { id: 'wa', on: (m) => sa.onWatchMsg(m) }, wS: Sub = { id: 'ws', on: (m) => sw?.onMsg(m) };
    play.push(subA, subB); watch.push(wA, wS);
    const sa = new NetSession(ma, net(play)(subA), 0, net(watch)(wA));
    const sb = new NetSession(mb, net(play)(subB), 1);
    let sw: WatchSession | null = null;
    const ia = player(1), ib = player(2);
    let longest = 0, streak = 0, lastFrame = 0, stalls = 0;
    for (now = 0; now < 30000 && !(ended[0] && ended[1] && ended[2]); now++) {   // cabe uma luta de 3 rounds mesmo com metade dos ticks travados
      for (let i = q.length - 1; i >= 0; i--) if (q[i].at <= now) { const x = q.splice(i, 1)[0]; x.to.on(x.m); }
      if (now >= c.late) sa.tick(ia());           // quem convidou entra depois de quem aceitou
      sb.tick(ib());
      if (now === 1500) sw = new WatchSession(mw, net(watch)(wS));
      sw?.tick();
      for (const [k, s] of [[0, sa], [1, sb], [2, sw]] as const) {
        if (!s) continue;
        const fr = s.frame, mt = [ma, mb, mw][k];
        if (!hashes[k].has(fr)) hashes[k].set(fr, hashMatch(mt));
        if (mt.phase === 'over' && mt.phaseFrame > 130) ended[k] = true;
      }
      if (now > c.late + 30 && sa.connected && sa.frame === lastFrame && !ended[0]) { streak++; stalls++; longest = Math.max(longest, streak); } else streak = 0;   // só conta depois que os dois estão rodando
      lastFrame = sa.frame;
      if (now % 900 === 0) sa.flushFeed();
    }
    sa.flushFeed();
    for (let t = 0; t < 1500 && sw && !ended[2]; t++, now++) { for (let i = q.length - 1; i >= 0; i--) if (q[i].at <= now) { const x = q.splice(i, 1)[0]; x.to.on(x.m); } sw.tick(); if (mw.phase === 'over' && mw.phaseFrame > 130) ended[2] = true; if (!hashes[2].has(sw.frame)) hashes[2].set(sw.frame, hashMatch(mw)); }
    let diff = 0, compared = 0;
    for (const [f, h] of hashes[0]) { for (const k of [1, 2]) { const o = hashes[k].get(f); if (o !== undefined) { compared++; if (o !== h) diff++; } } }
    const pass = ended[0] && ended[1] && ended[2] && diff === 0 && !sa.desync && !sb.desync;
    ok &&= pass;
    log({ caso: c.name, passou: pass, frames: [sa.frame, sb.frame, sw?.frame], terminou: ended, maiorTravadaTicks: longest, ticksTravados: stalls, atraso: [sa.delay, sb.delay], framesComparados: compared, diferencas: diff, placar: ma.wins });
  }
  process.exitCode = ok ? 0 : 1;
}

// ---------------------------------------------------------------- duplas: 4 jogadores na mesma luta + plateia
/** Quem controla cada lado agora: dono do lutador que está em campo. */
export const seatsOf = (m: Match, owner: [number[], number[]]) => (): [number, number] => [owner[0][m.active[0]], owner[1][m.active[1]]];
function simDuo() {
  const cases = [
    { name: 'duplas, 4 pessoas, rede boa', lat: [2, 4], drop: 0, owner: [[0, 1], [2, 3]] as [number[], number[]] },
    { name: 'duplas, 4 pessoas, rede ruim (15% de perda)', lat: [3, 14], drop: 0.15, owner: [[0, 1], [2, 3]] as [number[], number[]] },
    { name: 'duplas, 3 pessoas (um controla os dois do lado B), 30% de perda', lat: [5, 30], drop: 0.3, owner: [[0, 1], [2, 2]] as [number[], number[]] },
  ];
  let ok = true;
  for (const c of cases) {
    const rng = new Rng(11), n = Math.max(...c.owner.flat()) + 1;
    type Sub = { on: (m: Msg) => void };
    const q: { at: number; to: Sub; m: Msg }[] = []; let now = 0, sent = 0;
    const net = (subs: Sub[], count = false) => (self: Sub): Room => ({
      send: (m) => { if (count) sent++; for (const s of subs) if (s !== self && !(rng.chance(c.drop))) q.push({ at: now + c.lat[0] + Math.floor(rng.next() * (c.lat[1] - c.lat[0] + 1)), to: s, m: JSON.parse(JSON.stringify(m)) }); },
      setPresence() {}, leave() {}, ready: () => true,
    });
    const F = ['edgard', 'laura', 'santana', 'kevin'].map(load);
    const mk = () => { const m = new Match(F[0], F[2], STAGE, { cpu: null, partners: [F[1], F[3]] }, { message() {}, end() {} }); m.teams.flat().forEach((f) => { f.life = 14; }); return m; };   // pouca vida: a luta tem que passar pelo nocaute com entrada do companheiro
    const ms = Array.from({ length: n + 1 }, mk), play: Sub[] = [], watch: Sub[] = [];
    const ss: NetSession[] = []; let sw: WatchSession | null = null;
    for (let i = 0; i < n; i++) play.push({ on: (m) => ss[i].onMsg(m) });
    const wA: Sub = { on: (m) => ss[0].onWatchMsg(m) }, wS: Sub = { on: (m) => sw?.onMsg(m) }; watch.push(wA, wS);
    for (let i = 0; i < n; i++) { const s = new NetSession(ms[i], net(play, true)(play[i]), i, i === 0 ? net(watch)(wA) : null, n); s.seats = seatsOf(ms[i], c.owner); ss.push(s); }
    const hands = ss.map((_, i) => { const p = player(20 + i), r = new Rng(90 + i); return () => p() | (r.chance(0.004) ? 1 << 9 : 0); });   // de vez em quando aperta TROCA
    const hashes = ms.map(() => new Map<number, number>()), ended = ms.map(() => false);
    let tags = 0, lastActive = '00';
    for (now = 0; now < 40000 && !ended.every(Boolean); now++) {
      for (let i = q.length - 1; i >= 0; i--) if (q[i].at <= now) { const x = q.splice(i, 1)[0]; x.to.on(x.m); }
      ss.forEach((s, i) => s.tick(hands[i]()));
      if (now === 1500) sw = new WatchSession(ms[n], net(watch)(wS));
      sw?.tick();
      [...ss, sw].forEach((s, k) => { if (!s) return; if (!hashes[k].has(s.frame)) hashes[k].set(s.frame, hashMatch(ms[k])); if (ms[k].phase === 'over' && ms[k].phaseFrame > 130) ended[k] = true; });
      const act = ms[0].active.join(''); if (act !== lastActive) { tags++; lastActive = act; }
      if (now % 900 === 0) ss[0].flushFeed();
    }
    ss[0].flushFeed();
    for (let t = 0; t < 2000 && sw && !ended[n]; t++, now++) { for (let i = q.length - 1; i >= 0; i--) if (q[i].at <= now) { const x = q.splice(i, 1)[0]; x.to.on(x.m); } sw.tick(); if (ms[n].phase === 'over' && ms[n].phaseFrame > 130) ended[n] = true; if (!hashes[n].has(sw.frame)) hashes[n].set(sw.frame, hashMatch(ms[n])); }
    let diff = 0, compared = 0;
    for (const [f, h] of hashes[0]) for (let k = 1; k <= n; k++) { const o = hashes[k].get(f); if (o !== undefined) { compared++; if (o !== h) diff++; } }
    const pass = ended.every(Boolean) && diff === 0 && ss.every((s) => !s.desync) && tags > 0;
    ok &&= pass;
    log({ caso: c.name, passou: pass, frames: [...ss.map((s) => s.frame), sw?.frame], trocas: tags, fim: ms[0].timer > 0 ? 'nocaute' : 'tempo', vencedor: ms[0].winner, vidas: ms[0].teams.map((t) => t.map((f) => Math.round(f.life))), mensagensPorSegundo: Math.round(sent / (ss[0].frame / 60)), framesComparados: compared, diferencas: diff });
  }
  if (!ok) process.exitCode = 1;
}

// ---------------------------------------------------------------- mesa de duplas (rede simulada com perda, relógio real)
async function squadTest() {
  const rng = new Rng(5), DROP = 0.25;
  type Sub = { on: (m: Msg) => void; dead?: boolean };
  const rooms = new Map<string, Sub[]>();
  const join = (name: string, h: { onMsg(m: Msg): void }): Room => {
    const subs = rooms.get(name) ?? (rooms.set(name, []), rooms.get(name)!); const self: Sub = { on: (m) => h.onMsg(m) }; subs.push(self);
    return { send: (m) => { for (const s of subs) if (s !== self && !s.dead && !rng.chance(DROP)) setTimeout(() => s.on(JSON.parse(JSON.stringify(m))), 20 + rng.next() * 120); }, setPresence() {}, leave() { self.dead = true; }, ready: () => true };
  };
  SQUAD.CONFIRM_MS = 4000; SQUAD.DRAFT_MS = 5000; SQUAD.GO_MS = 600; SQUAD.SILENT_MS = 2500; SQUAD.BEAT_MS = 300; SQUAD.RETRY_MS = 150;
  const F = ['edgard', 'laura', 'kevin', 'dede', 'van', 'dias'], names = ['ANA', 'BIA', 'CAIO', 'DUDA'];
  const started: (SquadState | null)[] = [null, null, null, null], closed: string[] = ['', '', '', ''];
  const mk = (i: number) => new Squad('p0', () => ({ id: `p${i}`, name: names[i], fighter: F[i] }), join, { change() {}, start: (s) => { started[i] = s; }, closed: (w) => { closed[i] = w; } }, () => F, () => ['office', 'alley']);
  const sq = [0, 1, 2, 3].map(mk);
  const timer = setInterval(() => sq.forEach((s) => s.tick()), 50);
  const wait = async (ok: () => boolean, ms = 6000) => { const t0 = Date.now(); while (!ok() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 25)); return ok(); };
  const out: Record<string, unknown> = {};
  out.sentaram = await wait(() => sq.every((s) => s.state?.members.length === 4));
  out.ladosCheios = sq[0].state!.members.filter((m) => m.team === 0).length === 2;
  const mover = sq.findIndex((s, i) => i > 0 && s.mine?.team === 0), outro = sq.findIndex((s) => s.mine?.team === 1);
  sq[mover].setTeam(1);                                           // lado cheio: o anfitrião recusa e nada muda
  await new Promise((r) => setTimeout(r, 700));
  out.ladoCheioRecusado = sq[0].state!.members.find((m) => m.id === `p${mover}`)!.team === 0;
  sq[0].start();
  out.pediuConfirmacao = await wait(() => sq.every((s) => s.state?.phase === 'confirma'));
  sq.slice(1).forEach((s) => s.confirm());
  out.draftAbriu = await wait(() => sq.every((s) => s.state?.phase === 'draft'));
  sq[mover].lock('van'); sq[outro].lock('van');                   // dois travam o mesmo lutador ao mesmo tempo: só um leva
  await wait(() => sq.every((s) => s.state!.seats.filter((x) => x.locked).length >= 1));
  await new Promise((r) => setTimeout(r, 600));
  const vans = sq[0].state!.seats.filter((x) => x.fighter === 'van' && x.locked);
  out.semRepetir = vans.length === 1 && sq.every((s) => s.state!.seats.filter((x) => x.fighter === 'van').length === 1);
  sq.forEach((s, i) => { if (s.mySeat >= 0) s.lock(F.filter((f) => f !== 'van')[i]); });
  sq[0].setStage('alley');
  out.comecou = await wait(() => started.every(Boolean));
  const cfgs = started.map((s, i) => s && duoConfig(s, `p${i}`));
  out.mesmaLuta = new Set(cfgs.map((c) => JSON.stringify([c?.matchId, c?.duo.f, c?.duo.owner, c?.stage]))).size === 1 && cfgs[0]?.stage === 'alley';
  out.cadaUmNoSeuLugar = cfgs.every((c, i) => c!.duo.players[c!.duo.me] === names[i] && c!.duo.owner[c!.local as 0 | 1].includes(c!.duo.me)) && new Set(cfgs[0]!.duo.f.flat()).size === 4;
  sq.forEach((s) => s.resume());
  out.voltouPraMesa = await wait(() => sq.every((s) => s.state?.phase === 'mesa'));
  sq[3].leave();
  out.saidaAvisada = await wait(() => sq[0].state!.members.length === 3);
  sq[0].leave();
  out.mesaFechou = await wait(() => !!closed[1] && !!closed[2]);
  clearInterval(timer);
  const pass = Object.values(out).every((v) => v === true);
  log({ teste: 'mesa de duplas', passou: pass, ...out, fechou: closed });
  if (!pass) process.exitCode = 1;
  setTimeout(() => process.exit(), 300);
}

// ---------------------------------------------------------------- protocolo de convite (rede simulada, relógio real)
async function invitesTest() {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  type Ev = { start: [string, number][]; abort: string[]; notes: string[]; rings: number };
  const mkWorld = (lat = 30) => {
    let dropNext: string | null = null;
    const subs: { id: string; on: (m: Msg) => void }[] = [];
    const room = (id: string): Room => ({ send: (m) => { if (dropNext === m.t) { dropNext = null; return; } for (const s of subs) if (s.id !== id) setTimeout(() => s.on(m), typeof lat === 'number' ? lat : 30); }, setPresence() {}, leave() {}, ready: () => true });
    const make = (id: string, ttl = 400) => {
      const me: Peer = { id, name: id.toUpperCase(), fighter: 'edgard', status: 'livre' };
      const ev: Ev = { start: [], abort: [], notes: [], rings: 0 };
      const r = room(id);
      const inv: Invites = new Invites(() => r, () => me, () => me.status === 'lutando', {
        start: (mid, other, local) => { ev.start.push([other.id, local]); me.status = 'lutando'; void mid; },
        abort: (mid, why) => ev.abort.push(why), note: (x) => ev.notes.push(x), ring: () => { ev.rings++; }, change: () => {},
      }, { invite: ttl, auto: ttl });
      subs.push({ id, on: (m) => inv.onMsg(m) });
      return { me, ev, inv };
    };
    return { make, drop: (t: string) => { dropNext = t; }, setLat: (l: number) => { lat = l; } };
  };
  const results: [string, boolean, string][] = [];
  const check = (name: string, ok: boolean, info: object) => results.push([name, ok, JSON.stringify(info)]);
  { const w = mkWorld(), a = w.make('a'), b = w.make('b');
    a.inv.challenge(b.me); await wait(80); b.inv.accept(); await wait(120);
    check('aceitar', a.ev.start[0]?.[1] === 0 && b.ev.start[0]?.[1] === 1 && a.ev.start.length === 1, { a: a.ev.start, b: b.ev.start });
    a.inv.dispose(); b.inv.dispose(); }
  { const w = mkWorld(), a = w.make('a'), b = w.make('b');
    a.inv.challenge(b.me); await wait(80); b.inv.decline(); await wait(80);
    check('recusar', !a.inv.out && a.ev.notes.some((n) => n.includes('recusou')) && !a.ev.start.length, { notas: a.ev.notes });
    a.inv.dispose(); b.inv.dispose(); }
  { const w = mkWorld(), a = w.make('a'), b = w.make('b');
    a.inv.challenge(b.me); await wait(80); a.inv.cancel(); await wait(80);
    check('cancelar', !b.inv.inc && b.ev.notes.some((n) => n.includes('cancelou')), { notas: b.ev.notes });
    a.inv.dispose(); b.inv.dispose(); }
  { const w = mkWorld(), a = w.make('a'), b = w.make('b');
    a.inv.challenge(b.me); await wait(900);
    check('expirar nos dois lados', !a.inv.out && !b.inv.inc && a.ev.notes.some((n) => n.includes('não respondeu')), { a: a.ev.notes, b: b.ev.notes });
    a.inv.dispose(); b.inv.dispose(); }
  { const w = mkWorld(250), a = w.make('a'), b = w.make('b');    // o convite chega 250 ms depois: o prazo de B acaba depois do de A
    a.inv.challenge(b.me); await wait(550); const expiredA = !a.inv.out; b.inv.accept(); await wait(600);
    check('aceite atrasado ainda vale se quem convidou está livre', expiredA && a.ev.start.length === 1 && b.ev.start.length === 1 && !b.ev.abort.length, { expiredA, a: a.ev.start, b: b.ev.start, abort: b.ev.abort });
    a.inv.dispose(); b.inv.dispose(); }
  { const w = mkWorld(250), a = w.make('a'), b = w.make('b');
    a.inv.challenge(b.me); await wait(550); a.me.status = 'lutando'; b.inv.accept(); await wait(700);
    check('aceite atrasado com quem convidou ocupado: volta com aviso', !a.ev.start.length && b.ev.abort.length === 1, { abort: b.ev.abort });
    a.inv.dispose(); b.inv.dispose(); }
  { const w = mkWorld(), a = w.make('a'), b = w.make('b');
    a.inv.challenge(b.me); b.inv.challenge(a.me); await wait(300);
    const locals = [...a.ev.start.map((x) => x[1]), ...b.ev.start.map((x) => x[1])].sort();
    check('desafio cruzado vira uma luta só', a.ev.start.length === 1 && b.ev.start.length === 1 && locals.join() === '0,1', { a: a.ev.start, b: b.ev.start });
    a.inv.dispose(); b.inv.dispose(); }
  { const w = mkWorld(), a = w.make('a'), b = w.make('b');
    a.inv.challenge(b.me); await wait(80); w.drop('accept'); b.inv.accept(); await wait(1200);
    check('aceite perdido na rede é reenviado', a.ev.start.length === 1 && b.ev.start.length === 1, { a: a.ev.start });
    a.inv.dispose(); b.inv.dispose(); }
  { const w = mkWorld(), a = w.make('a'), b = w.make('b'); b.me.status = 'procurando';
    a.inv.challenge(b.me, true); await wait(150);
    check('JOGAR AGORA aceita sozinho', a.ev.start.length === 1 && b.ev.start.length === 1 && b.ev.rings === 0, { a: a.ev.start, b: b.ev.start });
    a.inv.dispose(); b.inv.dispose(); }
  for (const [n, ok, info] of results) log({ caso: n, passou: ok, detalhe: JSON.parse(info) });
  process.exitCode = results.every((r) => r[1]) ? 0 : 1;
}

// ---------------------------------------------------------------- robô (Supabase de verdade)
function bot(args: Record<string, string>) {
  const id = args.id ?? `bot${Math.random().toString(36).slice(2, 8)}`;
  const me: Peer = { id, name: (args.name ?? 'ROBÔ TESTE').toUpperCase(), fighter: args.fighter ?? 'santana', status: 'livre' };
  const roster: Record<string, FighterAssets> = {};
  const fighter = (fid: string) => (roster[fid] ??= load(fid));
  let peers: Peer[] = [];
  let session: NetSession | null = null, room: Room | null = null, match: Match | null = null;
  let t0 = 0, connectedAt = 0, frames = 0, done = false;
  const input = player(Number(args.seed ?? 3));
  const lobby = joinRoom('lobby', me, {
    onMsg: (m) => { if (!invites.onMsg(m) && m.t !== 'result') log({ ev: 'msg', t: m.t }); },
    onPeers: (p) => {
      peers = p;
      const target = args.challenge && p.find((x) => x.name === args.challenge.toUpperCase() || x.id === args.challenge);
      if (target && !session && !invites.out && target.status !== 'lutando') { invites.challenge(target); log({ ev: 'desafiou', para: target.name }); }
    },
    onStatus: (okk) => log({ ev: okk ? 'na-sala' : 'erro-sala' }),
  });
  const invites = new Invites(() => lobby, () => me, () => me.status === 'lutando', {
    start: (matchId, other, local) => {
      t0 = Date.now();
      log({ ev: 'luta-comecou', local, contra: other.name, matchId });
      me.status = 'lutando'; me.matchId = matchId; me.vs = local === 0 ? `${me.name} x ${other.name}` : `${other.name} x ${me.name}`; lobby.setPresence(me);
      const [fa, fb] = local === 0 ? [me.fighter, other.fighter] : [other.fighter, me.fighter];
      match = new Match(fighter(fa), fighter(fb), STAGE, { cpu: null }, { message() {}, end: (w) => { log({ ev: 'fim', vencedor: w, frames: session?.frame, placar: match?.wins }); done = true; } });
      room = joinRoom(`match-${matchId}`, null, { onMsg: (m) => session?.onMsg(m) });
      const watch = local === 0 ? joinRoom(`watch-${matchId}`, null, { onMsg: (m) => session?.onWatchMsg(m) }) : null;
      session = new NetSession(match, room, local, watch);
      session.onConnect = () => { connectedAt = Date.now(); invites.connected(matchId); log({ ev: 'conectou', msDesdeInicio: connectedAt - t0 }); };
      session.onDesync = (f) => log({ ev: 'DESSINCRONIZOU', frame: f });
    },
    abort: (matchId, why) => log({ ev: 'abortou', matchId, why }),
    note: (t) => log({ ev: 'aviso', t }),
    ring: () => { log({ ev: 'desafio-recebido', de: invites.inc?.from.name }); if (args.accept !== 'no') setTimeout(() => invites.accept(), Number(args.acceptAfter ?? 800)); },
    change: () => {},
  });
  // loop de 60 Hz com acumulador (igual ao jogo)
  let last = performance.now(), acc = 0;
  const timer = setInterval(() => {
    const now = performance.now(); acc += Math.min(250, now - last); last = now;
    while (acc >= 1000 / 60) {
      acc -= 1000 / 60;
      if (!session || !match) continue;
      session.tick(input());
      if (session.frame !== frames) { frames = session.frame; if (frames % 60 === 0) log({ ev: 'frame', f: frames, h: hashMatch(match), atraso: session.delay, rtt: Math.round(session.rtt), fase: match.phase, round: match.round, vida: match.fighters.map((f) => Math.round(f.life)) }); }
      if (session.lost) { log({ ev: 'caiu' }); done = true; }
      if (session.quitBy !== null && !done) { log({ ev: 'outro-saiu', frame: session.frame }); done = true; }
      if (args.quitAfter && connectedAt && Date.now() - connectedAt > Number(args.quitAfter) * 1000 && !done) { log({ ev: 'desisti', frame: session.frame }); done = true; }
      if (!session.connected && Date.now() - session.born > 15000) { log({ ev: 'nao-conectou' }); done = true; }
    }
    if (done || (args.maxSec && Date.now() - start > Number(args.maxSec) * 1000)) {
      clearInterval(timer); session?.quit(); setTimeout(() => { room?.leave(); lobby.leave(); invites.dispose(); process.exit(0); }, 600);
    }
  }, 5);
  const start = Date.now();
  log({ ev: 'robo', id, nome: me.name, lutador: me.fighter, sala: peers.length });
}

// ---------------------------------------------------------------- dois robôs pelo Supabase
async function real() {
  const self = fileURLToPath(import.meta.url);
  const run = (a: string[]) => {
    const p = spawn(process.execPath, [self, 'bot', ...a], { stdio: ['ignore', 'pipe', 'inherit'] });
    const lines: Record<string, unknown>[] = []; let buf = '';
    p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { lines.push(JSON.parse(l)); } catch { /* ignora */ } } });
    return { p, lines, done: new Promise<void>((ok) => p.on('exit', () => ok())) };
  };
  const tag = Date.now().toString(36);
  const b = run(['--id', `zzb${tag}`, '--name', `ACEITA ${tag}`, '--fighter', 'santana', '--seed', '5', '--acceptAfter', '1500', '--maxSec', '300']);
  await new Promise((r) => setTimeout(r, 2500));
  const a = run(['--id', `zza${tag}`, '--name', `DESAFIA ${tag}`, '--fighter', 'edgard', '--seed', '9', '--challenge', `zzb${tag}`, '--maxSec', '300']);
  await Promise.all([a.done, b.done]);
  const ev = (L: Record<string, unknown>[], e: string) => L.find((x) => x.ev === e);
  const fa = new Map(a.lines.filter((x) => x.ev === 'frame').map((x) => [x.f, x.h])), fb = new Map(b.lines.filter((x) => x.ev === 'frame').map((x) => [x.f, x.h]));
  let compared = 0, diff = 0; for (const [f, h] of fa) if (fb.has(f)) { compared++; if (fb.get(f) !== h) diff++; }
  const lastA = a.lines.filter((x) => x.ev === 'frame').pop();
  const res = {
    desafio: !!ev(a.lines, 'desafiou'), recebeu: !!ev(b.lines, 'desafio-recebido'),
    comecou: [ev(a.lines, 'luta-comecou')?.local, ev(b.lines, 'luta-comecou')?.local],
    conectouMs: [ev(a.lines, 'conectou')?.msDesdeInicio, ev(b.lines, 'conectou')?.msDesdeInicio],
    fim: [ev(a.lines, 'fim'), ev(b.lines, 'fim')],
    framesComparados: compared, diferencas: diff,
    ultimoFrame: lastA, dessincronizou: [!!ev(a.lines, 'DESSINCRONIZOU'), !!ev(b.lines, 'DESSINCRONIZOU')],
    problemas: [...a.lines, ...b.lines].filter((x) => ['caiu', 'nao-conectou', 'abortou', 'erro-sala'].includes(x.ev as string)),
  };
  log(res);
  process.exitCode = res.fim[0] && res.fim[1] && diff === 0 && compared > 20 ? 0 : 1;
}

// ---------------------------------------------------------------- ranking (sem banco: só as regras)
function rankingTest() {
  const results: [string, boolean, unknown][] = [];
  const check = (name: string, ok: boolean, info: unknown) => results.push([name, ok, info]);
  const keys = ['EDGARD', ' edgard ', 'Edgard', 'GRAÚDA', 'GRAUDA', 'graúda!', 'NAVEGADOR  TEST'].map((n) => rankKey(n, 'x'));
  check('nome vira a mesma chave com espaço, minúscula e acento', keys[0] === keys[1] && keys[1] === keys[2] && keys[3] === keys[4] && keys[4] === keys[5] && keys[0] !== keys[3], keys);
  check('nome só com símbolo fica com o id da visita', rankKey('???', 'abc123') === 'abc123' && rankKey('', 'abc123') === 'abc123', rankKey('???', 'abc123'));
  // linhas como estão hoje no banco: uma por visita, mais recente primeiro
  const row = (id: string, name: string, wins: number, losses: number): RankRow => ({ id, name, wins, losses, points: wins * 3 + losses });
  const merged = mergeRanking([
    row('nome:EDGARD', 'EDGARD', 2, 1), row('k1', 'Edgard', 1, 0), row('k2', 'EDGARD', 0, 2), row('k3', 'GRAÚDA', 3, 0),
    row('k4', 'GRAUDA', 1, 1), row('k5', 'FULANO', 0, 1),
  ]);
  const ed = merged.find((r) => r.id === 'nome:EDGARD'), gr = merged.find((r) => r.id === 'nome:GRAUDA');
  check('visitas da mesma pessoa somam numa linha', merged.length === 3 && !!ed && ed.wins === 3 && ed.losses === 3 && ed.points === 12 && !!gr && gr.wins === 4 && gr.losses === 1 && gr.points === 13, merged);
  check('ordem por pontos e nome exibido é o mais recente', merged[0].id === 'nome:GRAUDA' && merged[0].name === 'GRAÚDA' && merged[1].name === 'EDGARD', merged.map((r) => `${r.name} ${r.points}`));
  check('ranking mostra no máximo 8', mergeRanking(Array.from({ length: 20 }, (_, i) => row(`p${i}`, `JOGADOR ${i}`, i, 0))).length === 8, null);
  const args = resultArgs({ id: 'a1', name: 'Graúda' }, { id: 'b2', name: 'EDGARD' });
  check('vitória grava na linha do nome, não na da visita', args?.w_id === 'nome:GRAUDA' && args?.l_id === 'nome:EDGARD' && args?.w_name === 'Graúda', args);
  check('mesmo nome dos dois lados não conta', resultArgs({ id: 'a1', name: 'EDGARD' }, { id: 'b2', name: 'edgard' }) === null, null);
  const dup = { player_id: 'fb2q3gmv', name: 'FULANO', fighter: 'van', score: 11974 };
  const top = uniqueScores([dup, { ...dup }, { ...dup }, { player_id: 'zz', name: 'FULANO', fighter: 'van', score: 11974 }, { player_id: 'fb2q3gmv', name: 'FULANO', fighter: 'kevin', score: 9000 }]);
  check('pontuação do arcade gravada repetida aparece uma vez', top.length === 3 && top.filter((r) => r.score === 11974).length === 2, top);
  check('nome TESTE não aparece em nenhum ranking', mergeRanking([row('t1', 'TESTE', 5, 0), row('t2', 'Ana', 1, 0)]).length === 1 && uniqueScores([{ name: 'teste', fighter: 'van', score: 99999 }, { name: 'ANA', fighter: 'van', score: 10 }]).length === 1, null);
  for (const [n, ok, info] of results) log({ caso: n, passou: ok, detalhe: info });
  process.exitCode = results.every((r) => r[1]) ? 0 : 1;
}

const [mode, ...rest] = process.argv.slice(2);
const args: Record<string, string> = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) args[rest[i].slice(2)] = rest[i + 1]?.startsWith('--') || rest[i + 1] === undefined ? 'yes' : rest[++i];
if (mode === 'sim') { sim(); simDuo(); } else if (mode === 'duo') simDuo(); else if (mode === 'squad') void squadTest(); else if (mode === 'invites') void invitesTest(); else if (mode === 'ranking') rankingTest(); else if (mode === 'real') void real(); else if (mode === 'bot') bot(args);
else console.log('uso: nettest sim | invites | ranking | real | bot [--name N] [--fighter id] [--challenge NOME]');
