// Medidor de equilíbrio: CPU contra CPU, todos contra todos, com a MESMA lógica do jogo (sem tela).
//
//   npm run balance                         todos contra todos, 4 lutas por par (2 de cada lado), CPU difícil
//   npm run balance -- --n 8                mais lutas por par (mais preciso, mais demorado)
//   npm run balance -- --level normal       outra dificuldade da CPU
//   npm run balance -- --only dias,crm      só os pares que envolvem esses lutadores
//
// Lê a tabela assim: "vitórias" é a taxa de vitória geral do lutador; perto de 50% = equilibrado. A CPU não é gente
// (não abusa de alcance nem de combo como um jogador bom), então use como termômetro: quem passa de ~62% ou cai de ~38%
// merece ajuste na ficha (tools/balance.py). O Dener é apelão de propósito e fica fora da média.
import fs from 'node:fs';
import { Match } from '../src/game/match';
import { Ai, PROFILES } from '../src/game/ai';
import { ROSTER, SECRET } from '../src/data/roster';
import type { Difficulty, FighterAssets } from '../src/game/types';
import type { StageAssets } from '../src/core/assets';
import type { Controller } from '../src/core/input';

const load = (id: string): FighterAssets => {                      // `morph` junto: no 2º round o Mundim vira o monstro, e isso conta na medição
  const def = JSON.parse(fs.readFileSync(`public/fighters/${id}/fighter.json`, 'utf8'));
  return { def, frames: JSON.parse(fs.readFileSync(`public/fighters/${id}/frames.json`, 'utf8')),
    sheet: {} as HTMLImageElement, fx: {}, morph: def.morph ? load(def.morph) : undefined };
};
const STAGE = { name: 'teste', img: {} as HTMLImageElement } as StageAssets;
const nullCtrl: Controller = { held: () => false, pressed: () => false };

const argv = process.argv.slice(2); const arg = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const N = Math.max(2, Number(arg('n', '4'))), level = arg('level', 'hard') as Difficulty, only = arg('only', '').split(',').filter(Boolean);
const roster = [...ROSTER, ...SECRET];   // a lista de verdade (ler as aspas do arquivo pegava também os códigos secretos: 'down', 'kick'...)
const ids = [...new Set(roster)]; const F = Object.fromEntries(ids.map((id) => [id, load(id)]));

function fight(a: string, b: string, seed: number, lv1: Difficulty = level, lv2: Difficulty = level) {
  let result: 0 | 1 | -1 | null = null;
  const m = new Match(F[a], F[b], STAGE, { cpu: lv2, seed: seed * 7 + 3 }, { message() {}, end: (w) => { result = w; } });
  const ai1 = new Ai(m.fighters[0], m.fighters[1], lv1, seed * 13 + 5);
  const ports = { ports: [ai1.ctrl as Controller, nullCtrl] };
  let ticks = 0; const used: Record<string, number> = {}, dmg: [Record<string, number>, Record<string, number>] = [{}, {}];
  let last: unknown = null; let prev = [100, 100]; const ia: Record<string, number> = {}; let rounds = 0, byTime = 0, fightFrames = 0, ph = m.phase;
  while (result === null && ticks++ < 40000) {
    // a metamorfose (Mundim -> A COISA) troca o objeto do lutador: a CPU do P1 precisa olhar pros lutadores que estão em campo
    // agora (antes ela seguia o Mundim antigo, parado no lugar da transformação, e apanhava às cegas no 2º e 3º rounds)
    ai1.me = m.fighters[0]; ai1.other = m.fighters[1];
    if (m.phase === 'fight') { ai1.update(m.projectiles, true); if (ai1.debug) ia[ai1.debug] = (ia[ai1.debug] ?? 0) + 1; }   // tempo em cada decisão da CPU (--ia)
    m.update(ports, false);
    if (m.phase === 'fight') fightFrames++;
    if (ph === 'fight' && m.phase === 'ko') { rounds++; if (m.timer <= 0) byTime++; }   // round decidido: por nocaute ou no tempo
    ph = m.phase;
    const mv = m.fighters[0].move; if (mv && mv !== last) { const n = m.fighters[0].moveName!; used[n] = (used[n] ?? 0) + 1; } last = mv;
    for (const i of [0, 1]) {                                  // de onde veio o dano que o lutador i causou
      const d = prev[1 - i] - m.fighters[1 - i].life;
      if (d > 0) { const src = m.fighters[1 - i].lastHitBy && m.fighters[i].moveName ? m.fighters[i].moveName! : 'magia/bloqueio'; dmg[i][src] = (dmg[i][src] ?? 0) + d; }
    }
    prev = [m.fighters[0].life, m.fighters[1].life];
  }
  return { w: result ?? -1, life: [m.fighters[0].life, m.fighters[1].life], rounds: m.wins, ticks, used, dmg, ia, nRounds: rounds, byTime, fightFrames };
}

// ---------- --arcade: o termômetro da dificuldade do arcade. Um "jogador" (CPU com perfil de gente, mais lenta e que defende
// menos) joga as 8 paradas com cada lutador, contra a CPU no nível da rampa (DIFF_RAMP do main.ts) — a régua é relativa:
// serve pra comparar uma rampa com outra, não pra prever a taxa de vitória de ninguém.
//   npm run balance -- --arcade                  jogador médio (reage em 10 quadros, defende metade)
//   npm run balance -- --arcade novato           jogador novato (reage em 16, defende 1 em 4, não pune)
//   npm run balance -- --arcade --rampa normal,normal,hard,hard,hard,hard,hard,boss     testa outra rampa sem mexer no jogo
//   npm run balance -- --arcade --alivio 0     sem o alívio (MERCY do main.ts: a cada N derrotas na mesma luta, a CPU desce um nível)
if (argv.includes('--arcade')) {
  const PLAYER = {
    bom:    { ...PROFILES.hard },
    medio:  { reaction: 10, attackChance: 0.55, blockChance: 0.5,  jumpChance: 0.1,  specialChance: 0.6,  retreatChance: 0.12, punishBlock: true,  mixup: 0.5, chain: 0.65 },
    novato: { reaction: 16, attackChance: 0.45, blockChance: 0.25, jumpChance: 0.12, specialChance: 0.4,  retreatChance: 0.1,  punishBlock: false, mixup: 0.2, chain: 0.35 },
  };
  const who = (arg('arcade', 'medio') in PLAYER ? arg('arcade', 'medio') : 'medio') as keyof typeof PLAYER;
  const tweak = Object.fromEntries(arg('perfil', '').split(',').filter(Boolean).map((kv) => kv.split('=')).map(([k, v]) => [k, v === 'true' ? true : v === 'false' ? false : Number(v)]));
  Object.assign(PROFILES, { jogador: { ...PLAYER[who], ...tweak } });   // --perfil reaction=7,blockChance=0.6 ajusta o jogador
  const main = fs.readFileSync('src/main.ts', 'utf8');
  const ramps = (main.match(/DIFF_RAMP[^=]*=\s*\[([\s\S]*?)\];/)?.[1] ?? '').match(/\[[^\[\]]+\]/g)?.map((r) => r.match(/'(\w+)'/g)!.map((s) => s.slice(1, -1))) ?? [];
  const cur = main.match(/let difficulty: Difficulty = '(\w+)'/)?.[1] ?? 'normal';
  const ramp = (arg('rampa', '') ? arg('rampa', '').split(',') : ramps[['easy', 'normal', 'hard'].indexOf(cur)]) as Difficulty[];
  const bossIds = main.match(/const bosses = \[([^\]]+)\]/)![1].match(/'(\w+)'/g)!.map((s) => s.slice(1, -1));
  const NA = argv.includes('--n') ? N : 12;
  const mercy = arg('alivio', '') ? Number(arg('alivio', '')) : Number(main.match(/const MERCY = (\d+)/)?.[1] ?? 0);   // --alivio 0 desliga
  const LV: Difficulty[] = ['easy', 'normal', 'hard', 'boss'];
  const bosses = bossIds.map((id) => ROSTER.indexOf(id));
  const perFight: number[][] = [], perFighter: Record<string, number[]> = {}, lostBy: Record<string, number[]> = {};
  const t1 = Date.now();
  ROSTER.forEach((pid, pi) => {                      // a mesma conta do buildCampaign: 4 rivais a partir da posição do jogador, depois os chefes
    const pool = ROSTER.map((_, i) => i).filter((i) => i !== pi && !bosses.includes(i));
    const camp = [...pool.map((_, k) => pool[(k + pi) % pool.length]).slice(0, 4), ...bosses];
    lostBy[pid] = [];
    perFighter[pid] = camp.map((oi, k) => {
      if (arg('luta', '') && Number(arg('luta', '')) !== k + 1) { lostBy[pid].push(0); return 1; }   // --luta 8: só essa parada
      const memo = new Map<Difficulty, number>();
      const pAt = (lv: Difficulty) => {                // taxa de vitória do jogador contra a CPU nesse nível (simulada uma vez por nível)
        if (!memo.has(lv)) { let w = 0; for (let s = 0; s < NA; s++) if (fight(pid, ROSTER[oi], 500 + s * 37 + k * 11 + pi * 101, 'jogador' as Difficulty, lv).w === 0) w++; memo.set(lv, w / NA); }
        return memo.get(lv)!;
      };
      const lv0 = ramp[Math.min(k, ramp.length - 1)], p0 = pAt(lv0);
      // derrotas esperadas até vencer: a cada `mercy` derrotas a CPU desce um nível (MERCY do main.ts); 0 vitórias conta como meia
      let e = 0, surv = 1;
      for (let i = 0; i < 400 && surv > 1e-6; i++) {
        const lv = mercy ? LV[Math.max(0, LV.indexOf(lv0) - Math.floor(i / mercy))] : lv0;
        surv *= 1 - Math.max(pAt(lv), 0.5 / NA); e += surv;
      }
      lostBy[pid].push(e);
      (perFight[k] ??= []).push(p0);
      return p0;
    });
  });
  if (argv.includes('--json')) { console.log('JSON ' + JSON.stringify(perFighter)); process.exit(0); }
  console.log(`\narcade · jogador ${who} · rampa ${ramp.join(' ')} · ${mercy ? `a cada ${mercy} derrotas a CPU desce 1 nível` : 'sem alívio'} · ${NA} lutas por parada · ${((Date.now() - t1) / 1000).toFixed(0)} s\n`);
  console.log('luta  CPU     o jogador vence de primeira   derrotas até passar');
  perFight.forEach((ps, k) => {
    const p = ps.reduce((s, x) => s + x, 0) / ps.length, l = ROSTER.reduce((s, id) => s + lostBy[id][k], 0) / ROSTER.length;
    const vs = k >= 4 ? ROSTER[bosses[k - 4]] : 'rival';
    console.log(`${String(k + 1).padStart(3)}   ${ramp[Math.min(k, ramp.length - 1)].padEnd(7)} ${(100 * p).toFixed(0).padStart(3)}%  ${'█'.repeat(Math.round(p * 20)).padEnd(20, '·')}  ${l.toFixed(1).padStart(5)}   ${vs}`);
  });
  const rows2 = ROSTER.map((id) => ({ id, flaw: perFighter[id].reduce((s, p) => s * p, 1), cont: lostBy[id].reduce((s, x) => s + x, 0) }));
  const avg = (f: (r: typeof rows2[number]) => number) => rows2.reduce((s, r) => s + f(r), 0) / rows2.length;
  console.log(`\nzerar sem perder nenhuma luta: ${(100 * avg((r) => r.flaw)).toFixed(1)}% · derrotas até zerar (continues): ${avg((r) => r.cont).toFixed(1)} em média`);
  console.log(rows2.sort((a, b) => a.cont - b.cont).map((r) => `${r.id} ${r.cont.toFixed(1)}`).join(' · '));
  process.exit(0);
}

const stat = Object.fromEntries(ids.map((id) => [id, { w: 0, n: 0, life: 0, vs: {} as Record<string, [number, number]> }]));
const iaT: Record<string, Record<string, number>> = {};
const moves: Record<string, Record<string, number>> = {}, dealt: Record<string, Record<string, number>> = {}, fights: Record<string, number> = {};
const t0 = Date.now(); let count = 0; let allRounds = 0, allByTime = 0, allFight = 0;
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
  const a = ids[i], b = ids[j];
  if (only.length && !only.includes(a) && !only.includes(b)) continue;
  for (let k = 0; k < N; k++) {
    const swap = k % 2 === 1, [p1, p2] = swap ? [b, a] : [a, b];           // metade das lutas de cada lado (o P1 age primeiro no frame)
    const r = fight(p1, p2, 100 + k + i * 31 + j * 17); count++; allRounds += r.nRounds; allByTime += r.byTime; allFight += r.fightFrames;
    const wa = r.w === -1 ? 0.5 : (r.w === 0) !== swap ? 1 : 0;
    stat[a].w += wa; stat[b].w += 1 - wa; stat[a].n++; stat[b].n++;
    const la = swap ? r.life[1] - r.life[0] : r.life[0] - r.life[1]; stat[a].life += la; stat[b].life -= la;
    (stat[a].vs[b] ??= [0, 0])[0] += wa; stat[a].vs[b][1]++; (stat[b].vs[a] ??= [0, 0])[0] += 1 - wa; stat[b].vs[a][1]++;
    const mu = (moves[p1] ??= {}); for (const [n, c] of Object.entries(r.used)) mu[n] = (mu[n] ?? 0) + c;
    const it = (iaT[p1] ??= {}); for (const [n, c] of Object.entries(r.ia)) it[n] = (it[n] ?? 0) + c;
    for (const [who, d] of [[p1, r.dmg[0]], [p2, r.dmg[1]]] as const) { const t = (dealt[who] ??= {}); for (const [n, c] of Object.entries(d)) t[n] = (t[n] ?? 0) + c; fights[who] = (fights[who] ?? 0) + 1; }
  }
}
const rows = ids.filter((id) => stat[id].n).map((id) => ({ id, pct: 100 * stat[id].w / stat[id].n, life: stat[id].life / stat[id].n, s: F[id].def.stats }))
  .sort((x, y) => y.pct - x.pct);
if (argv.includes('--matriz')) {                                   // quem ganha de quem (% de vitórias de A contra B): o manual usa pra VANTAGEM/DESVANTAGEM
  const mx = Object.fromEntries(ids.filter((id) => stat[id].n).map((a) => [a, Object.fromEntries(Object.entries(stat[a].vs).map(([b, [w, n]]) => [b, Math.round(1000 * w / n) / 10]))]));
  fs.writeFileSync('tools/matchups.json', JSON.stringify({ n: N, pct: Object.fromEntries(rows.map((r) => [r.id, Math.round(r.pct * 10) / 10])), vs: mx }, null, 1));
}
if (argv.includes('--json')) { console.log('JSON ' + JSON.stringify(Object.fromEntries(rows.map((r) => [r.id, Math.round(r.pct * 10) / 10])))); process.exit(0); }
console.log(`\n${count} lutas · CPU ${level} · ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
console.log('lutador   vitórias  saldo de vida   força agil. poder peso   piores / melhores confrontos');
for (const r of rows) {
  const vs = Object.entries(stat[r.id].vs).map(([o, [w, n]]) => [o, 100 * w / n] as [string, number]).sort((x, y) => x[1] - y[1]);
  const bad = vs.slice(0, 2).map(([o, p]) => `${o} ${p.toFixed(0)}%`).join(', '), good = vs.slice(-2).reverse().map(([o, p]) => `${o} ${p.toFixed(0)}%`).join(', ');
  const bar = '█'.repeat(Math.round(r.pct / 5)).padEnd(20, '·');
  console.log(`${r.id.padEnd(9)} ${r.pct.toFixed(0).padStart(4)}%  ${bar} ${r.life.toFixed(0).padStart(4)}   ${r.s.power.toFixed(2)} ${r.s.speed.toFixed(2)}  ${(r.s.magic ?? 1).toFixed(2)} ${r.s.weight.toFixed(2)}   ${bad}  /  ${good}`);
}
const mid = rows.filter((r) => !F[r.id].def.secret); const spread = Math.max(...mid.map((r) => r.pct)) - Math.min(...mid.map((r) => r.pct));
console.log(`\namplitude (sem o secreto): ${spread.toFixed(0)} pontos · desvio: ${Math.sqrt(mid.reduce((s, r) => s + (r.pct - 50) ** 2, 0) / mid.length).toFixed(1)}`);
console.log(`round médio: ${(allFight / Math.max(1, allRounds) / 60).toFixed(1)} s de luta · ${(100 * allByTime / Math.max(1, allRounds)).toFixed(0)}% dos rounds acabam no tempo`);
if (argv.includes('--dano')) { console.log('\ndano médio por luta, por origem:'); for (const r of rows) console.log(r.id.padEnd(9), Object.entries(dealt[r.id] ?? {}).sort((x, y) => y[1] - x[1]).map(([n, c]) => `${n} ${(c / fights[r.id]).toFixed(0)}`).join(' · ')); }
if (argv.includes('--ia')) for (const [id, it] of Object.entries(iaT)) { const tot = Object.values(it).reduce((s, c) => s + c, 0); console.log(id.padEnd(9), Object.entries(it).sort((x, y) => y[1] - x[1]).map(([n, c]) => `${n} ${(100 * c / tot).toFixed(0)}%`).join(' · ')); }
if (argv.includes('--moves')) for (const [id, mu] of Object.entries(moves)) console.log(id.padEnd(9), Object.entries(mu).sort((x, y) => y[1] - x[1]).map(([n, c]) => `${n}:${c}`).join(' '));
