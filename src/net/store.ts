// Dados persistentes no Supabase: ranking e campeonato (tabelas em supabase/schema.sql).
import { ONLINE, supa } from './transport';

export interface RankRow { id: string; name: string; wins: number; losses: number; points: number }
export interface Tournament { id: string; name: string; owner: string; status: 'inscricoes' | 'andamento' | 'fim'; champion: string | null }
export interface Entry { tournament_id: string; player_id: string; name: string; fighter: string }
export interface TMatch { id: string; tournament_id: string; round: number; slot: number; p1: string | null; p1_name: string | null; p2: string | null; p2_name: string | null; winner: string | null; status: 'pendente' | 'chamando' | 'lutando' | 'fim' }

const db = () => supa();
export const storeReady = ONLINE;

export async function upsertPlayer(id: string, name: string, fighter: string) {
  if (!ONLINE) return;
  await db().from('players').upsert({ id, name, fighter, updated_at: new Date().toISOString() }, { onConflict: 'id', ignoreDuplicates: false });
}
export async function ranking(): Promise<RankRow[]> {
  if (!ONLINE) return [];
  const { data } = await db().from('players').select('id,name,wins,losses,points').gt('points', 0).order('points', { ascending: false }).order('wins', { ascending: false }).limit(8);
  return (data ?? []) as RankRow[];
}
export async function recordResult(w: { id: string; name: string }, l: { id: string; name: string }) {
  if (!ONLINE) return;
  await db().rpc('record_result', { w_id: w.id, w_name: w.name, l_id: l.id, l_name: l.name });
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
