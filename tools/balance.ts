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
import { Ai } from '../src/game/ai';
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
const roster = (fs.readFileSync('src/data/roster.ts', 'utf8').match(/'([a-z]+)'/g) ?? []).map((s) => s.replace(/'/g, '')).filter((id) => id !== 'office');
const ids = [...new Set(roster)]; const F = Object.fromEntries(ids.map((id) => [id, load(id)]));

function fight(a: string, b: string, seed: number) {
  let result: 0 | 1 | -1 | null = null;
  const m = new Match(F[a], F[b], STAGE, { cpu: level, seed: seed * 7 + 3 }, { message() {}, end: (w) => { result = w; } });
  const ai1 = new Ai(m.fighters[0], m.fighters[1], level, seed * 13 + 5);
  const ports = { ports: [ai1.ctrl as Controller, nullCtrl] };
  let ticks = 0; const used: Record<string, number> = {}, dmg: [Record<string, number>, Record<string, number>] = [{}, {}];
  let last: unknown = null; let prev = [100, 100];
  while (result === null && ticks++ < 40000) {
    if (m.phase === 'fight') ai1.update(m.projectiles, true);
    m.update(ports, false);
    const mv = m.fighters[0].move; if (mv && mv !== last) { const n = m.fighters[0].moveName!; used[n] = (used[n] ?? 0) + 1; } last = mv;
    for (const i of [0, 1]) {                                  // de onde veio o dano que o lutador i causou
      const d = prev[1 - i] - m.fighters[1 - i].life;
      if (d > 0) { const src = m.fighters[1 - i].lastHitBy && m.fighters[i].moveName ? m.fighters[i].moveName! : 'magia/bloqueio'; dmg[i][src] = (dmg[i][src] ?? 0) + d; }
    }
    prev = [m.fighters[0].life, m.fighters[1].life];
  }
  return { w: result ?? -1, life: [m.fighters[0].life, m.fighters[1].life], rounds: m.wins, ticks, used, dmg };
}

const stat = Object.fromEntries(ids.map((id) => [id, { w: 0, n: 0, life: 0, vs: {} as Record<string, [number, number]> }]));
const moves: Record<string, Record<string, number>> = {}, dealt: Record<string, Record<string, number>> = {}, fights: Record<string, number> = {};
const t0 = Date.now(); let count = 0;
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
  const a = ids[i], b = ids[j];
  if (only.length && !only.includes(a) && !only.includes(b)) continue;
  for (let k = 0; k < N; k++) {
    const swap = k % 2 === 1, [p1, p2] = swap ? [b, a] : [a, b];           // metade das lutas de cada lado (o P1 age primeiro no frame)
    const r = fight(p1, p2, 100 + k + i * 31 + j * 17); count++;
    const wa = r.w === -1 ? 0.5 : (r.w === 0) !== swap ? 1 : 0;
    stat[a].w += wa; stat[b].w += 1 - wa; stat[a].n++; stat[b].n++;
    const la = swap ? r.life[1] - r.life[0] : r.life[0] - r.life[1]; stat[a].life += la; stat[b].life -= la;
    (stat[a].vs[b] ??= [0, 0])[0] += wa; stat[a].vs[b][1]++; (stat[b].vs[a] ??= [0, 0])[0] += 1 - wa; stat[b].vs[a][1]++;
    const mu = (moves[p1] ??= {}); for (const [n, c] of Object.entries(r.used)) mu[n] = (mu[n] ?? 0) + c;
    for (const [who, d] of [[p1, r.dmg[0]], [p2, r.dmg[1]]] as const) { const t = (dealt[who] ??= {}); for (const [n, c] of Object.entries(d)) t[n] = (t[n] ?? 0) + c; fights[who] = (fights[who] ?? 0) + 1; }
  }
}
const rows = ids.filter((id) => stat[id].n).map((id) => ({ id, pct: 100 * stat[id].w / stat[id].n, life: stat[id].life / stat[id].n, s: F[id].def.stats }))
  .sort((x, y) => y.pct - x.pct);
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
if (argv.includes('--dano')) { console.log('\ndano médio por luta, por origem:'); for (const r of rows) console.log(r.id.padEnd(9), Object.entries(dealt[r.id] ?? {}).sort((x, y) => y[1] - x[1]).map(([n, c]) => `${n} ${(c / fights[r.id]).toFixed(0)}`).join(' · ')); }
if (argv.includes('--moves')) for (const [id, mu] of Object.entries(moves)) console.log(id.padEnd(9), Object.entries(mu).sort((x, y) => y[1] - x[1]).map(([n, c]) => `${n}:${c}`).join(' '));
