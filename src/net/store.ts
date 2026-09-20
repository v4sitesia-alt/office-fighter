// Dados persistentes no Supabase: ranking e campeonato (tabelas em supabase/schema.sql).
import { ONLINE, supa } from './transport';

export interface RankRow { id: string; name: string; wins: number; losses: number; points: number }
export interface Tournament { id: string; name: string; owner: string; status: 'inscricoes' | 'andamento' | 'fim'; champion: string | null }
export interface Entry { tournament_id: string; player_id: string; name: string; fighter: string }
export interface TMatch { id: string; tournament_id: string; round: number; slot: number; p1: string | null; p1_name: string | null; p2: string | null; p2_name: string | null; winner: string | null; status: 'pendente' | 'chamando' | 'lutando' | 'fim' }

const db = () => supa();
export const storeReady = ONLINE;

// ---------- ranking da arena
// Quem entra na arena ganha um id novo a cada visita (é por aba, pra duas abas serem dois jogadores). Se o ranking
// usasse esse id, a mesma pessoa virava uma linha por visita e as vitórias ficavam espalhadas. Por isso o ranking
// é pelo NOME: sem acento, maiúsculo e sem símbolos ("Graúda" = "GRAUDA"), igual em qualquer visita ou aparelho.

/** Linha do ranking de uma pessoa: `nome:EDGARD`. Nome sem letra nem número fica com o id da visita. */
export function rankKey(name: string, fallback: string) {
  const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  return n ? `nome:${n}` : fallback;
}
/** Junta as linhas da mesma pessoa (inclusive as antigas, de antes do ranking por nome). Espera a mais recente primeiro. */
export function mergeRanking(rows: RankRow[], top = 8): RankRow[] {
  const by = new Map<string, RankRow>();
  for (const r of rows) {
    if (/^\s*testes?\s*$/i.test(r.name)) continue;
    const k = rankKey(r.name, r.id), cur = by.get(k);
    if (cur) { cur.wins += r.wins; cur.losses += r.losses; cur.points += r.points; }
    else by.set(k, { id: k, name: r.name, wins: r.wins, losses: r.losses, points: r.points }); // nome exibido: o mais recente
  }
  return [...by.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.losses - b.losses).slice(0, top);
}
/** Argumentos do registro de uma luta; null quando os dois lados são a mesma pessoa (duas abas com o mesmo nome). */
export function resultArgs(w: { id: string; name: string }, l: { id: string; name: string }) {
  const wk = rankKey(w.name, w.id), lk = rankKey(l.name, l.id);
  return wk === lk ? null : { w_id: wk, w_name: w.name, l_id: lk, l_name: l.name };
}

export async function upsertPlayer(id: string, name: string, fighter: string) {
  if (!ONLINE) return;
  await db().from('players').upsert({ id: rankKey(name, id), name, fighter, updated_at: new Date().toISOString() }, { onConflict: 'id', ignoreDuplicates: false });
}
export async function ranking(): Promise<RankRow[]> {
  if (!ONLINE) return [];
  const { data } = await db().from('players').select('id,name,wins,losses,points').gt('points', 0).order('updated_at', { ascending: false }).limit(1000);
  return mergeRanking((data ?? []) as RankRow[]);
}
export async function recordResult(w: { id: string; name: string }, l: { id: string; name: string }) {
  const args = resultArgs(w, l);
  if (!ONLINE || !args) return;
  await db().rpc('record_result', args);
}

// ---------- campeonato
export async function currentTournament(): Promise<Tournament | null> {
  if (!ONLINE) return null;
  const { data } = await db().from('tournaments').select('*').order('created_at', { ascending: false }).limit(1);
  return ((data ?? [])[0] as Tournament) ?? null;
}
export async function createTournament(name: string, owner: string) { await db().from('tournaments').insert({ name, owner }); }
export async function joinTournament(tid: string, player_id: string, name: string, fighter: string) {
  await db().from('tournament_entries').upsert({ tournament_id: tid, player_id, name, fighter }, { onConflict: 'tournament_id,player_id' });
}
export async function leaveTournament(tid: string, player_id: string) { await db().from('tournament_entries').delete().match({ tournament_id: tid, player_id }); }
export async function entries(tid: string): Promise<Entry[]> {
  const { data } = await db().from('tournament_entries').select('*').eq('tournament_id', tid).order('joined_at');
  return (data ?? []) as Entry[];
}
export async function matches(tid: string): Promise<TMatch[]> {
  const { data } = await db().from('matches').select('*').eq('tournament_id', tid).order('round').order('slot');
  return (data ?? []) as TMatch[];
}
export async function patchMatch(id: string, patch: Partial<TMatch>) { await db().from('matches').update(patch).eq('id', id); }

/** Sorteia a chave (eliminatória simples, com folgas) e põe o campeonato em andamento. */
export async function startTournament(t: Tournament, es: Entry[]) {
  const pool = [...es].sort(() => Math.random() - 0.5);
  let size = 2; while (size < pool.length) size *= 2;
  const rounds = Math.log2(size);
  const rows: Omit<TMatch, 'id'>[] = [];
  for (let r = 0; r < rounds; r++) for (let s = 0; s < size / 2 ** (r + 1); s++)
    rows.push({ tournament_id: t.id, round: r, slot: s, p1: null, p1_name: null, p2: null, p2_name: null, winner: null, status: 'pendente' });
  // distribui: primeiro um em cada luta, depois o segundo (as folgas ficam espalhadas)
  const first = rows.filter((m) => m.round === 0);
  pool.forEach((e, i) => { const m = first[i % first.length]; if (i < first.length) { m.p1 = e.player_id; m.p1_name = e.name; } else { m.p2 = e.player_id; m.p2_name = e.name; } });
  await db().from('matches').insert(rows);
  await db().from('tournaments').update({ status: 'andamento' }).eq('id', t.id);
  for (const m of await matches(t.id)) if (m.round === 0 && m.p1 && !m.p2) await finishMatch(t, m, m.p1, m.p1_name!); // folga: passa direto
}

/** Fecha a luta e empurra o vencedor pra próxima; se era a final, fecha o campeonato. */
export async function finishMatch(t: Tournament, m: TMatch, winnerId: string, winnerName: string) {
  await patchMatch(m.id, { winner: winnerId, status: 'fim' });
  const all = await matches(t.id);
  const next = all.find((x) => x.round === m.round + 1 && x.slot === Math.floor(m.slot / 2));
  if (!next) { await db().from('tournaments').update({ status: 'fim', champion: winnerName }).eq('id', t.id); return; }
  await patchMatch(next.id, m.slot % 2 === 0 ? { p1: winnerId, p1_name: winnerName } : { p2: winnerId, p2_name: winnerName });
}

/** Avisa quando qualquer tabela do campeonato/ranking muda. */
export function watch(onChange: () => void) {
  if (!ONLINE) return () => undefined;
  const ch = db().channel('v4f:db')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_entries' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, onChange)
    .subscribe();
  return () => { void db().removeChannel(ch); };
}

// ---------- ranking do arcade (tabela `scores`; sem rede ou sem a tabela, fica só neste navegador)
export interface ScoreRow { name: string; fighter: string; score: number }
const localScores = (): ScoreRow[] => { try { return JSON.parse(localStorage.getItem('v4f-scores') ?? '[]') as ScoreRow[]; } catch { return []; } };
export async function submitScore(player_id: string, row: ScoreRow) {
  const all = [...localScores(), row].sort((a, b) => b.score - a.score).slice(0, 20);
  try { localStorage.setItem('v4f-scores', JSON.stringify(all)); } catch { /* sem storage */ }
  if (ONLINE) await db().from('scores').insert({ player_id, ...row });
}
/** A mesma partida gravada mais de uma vez (Enter repetido, na versão antiga do jogo) aparece uma vez só. */
const isTest = (name: string) => /^\s*testes?\s*$/i.test(name);      // nome usado nos testes: não aparece no ranking
export function uniqueScores(rows: (ScoreRow & { player_id?: string | null })[], top = 10): ScoreRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => !isTest(r.name)).filter((r) => { const k = `${r.player_id ?? r.name}|${r.fighter}|${r.score}`; return !seen.has(k) && !!seen.add(k); })
    .slice(0, top).map(({ name, fighter, score }) => ({ name, fighter, score }));
}
export async function topScores(): Promise<ScoreRow[]> {
  if (ONLINE) {
    const { data, error } = await db().from('scores').select('player_id,name,fighter,score').order('score', { ascending: false }).limit(80);
    if (!error && data) return uniqueScores(data as ScoreRow[]);
  }
  return uniqueScores(localScores());
}
