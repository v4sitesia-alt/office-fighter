// Transporte em tempo real: salas com mensagens (broadcast) e presença.
// Com VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY usa o Supabase Realtime (qualquer pessoa com o link entra);
// sem as chaves cai no BroadcastChannel, que só liga abas do mesmo navegador (serve pra testar).
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

export interface Peer {
  id: string; name: string; fighter: string; status: 'livre' | 'procurando' | 'lutando' | 'assistindo' | 'dupla'; matchId?: string; vs?: string;
  table?: { n: number; open: boolean };   // anfitrião de uma mesa de duplas: quantos sentaram e se ainda dá pra entrar
  at?: string;                            // sentado na mesa deste anfitrião
  mc?: string;                            // luta de duplas em andamento (JSON), pra quem quiser assistir
}
export type Msg = { t: string; [k: string]: unknown };

export interface Room {
  send(m: Msg): void;
  setPresence(me: Peer): void;
  leave(): void;
  ready(): boolean;               // inscrito na sala (antes disso as mensagens ficam na fila)
}
export interface RoomHandlers { onMsg(m: Msg): void; onPeers?(peers: Peer[]): void; onStatus?(ok: boolean): void }

const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://rijffrhwuwouogurovkz.supabase.co';
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
/** `?local` na URL força o modo local (só abas deste navegador): dá pra testar a arena sem tocar no Supabase. */
const FORCE_LOCAL = typeof location !== 'undefined' && new URLSearchParams(location.search).has('local');
export const ONLINE = !!(URL_ && KEY) && !FORCE_LOCAL;
let client: SupabaseClient | null = null;
export const supa = () => (client ??= createClient(URL_!, KEY!));

export function joinRoom(name: string, me: Peer | null, h: RoomHandlers): Room {
  return ONLINE ? supabaseRoom(name, me, h) : localRoom(name, me, h);
}

function supabaseRoom(name: string, me: Peer | null, h: RoomHandlers): Room {
  const ch: RealtimeChannel = supa().channel(`v4f:${name}`, { config: { broadcast: { self: false, ack: false }, ...(me ? { presence: { key: me.id } } : {}) } });
  ch.on('broadcast', { event: 'm' }, ({ payload }) => h.onMsg(payload as Msg));
  if (h.onPeers) ch.on('presence', { event: 'sync' }, () => {
    const st = ch.presenceState() as Record<string, unknown[]>;
    h.onPeers?.(Object.values(st).map((arr) => arr[arr.length - 1] as unknown as Peer).filter((p) => p && p.id));
  });
  // Até a inscrição confirmar (~1,5 s), o supabase-js mandaria cada mensagem por uma requisição HTTP separada.
  // Em vez disso elas esperam numa fila curta e saem juntas quando a sala abre.
  let ready = false; let pending: Peer | null = me; const queue: Msg[] = [];
  const push = (m: Msg) => void ch.send({ type: 'broadcast', event: 'm', payload: m });
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') { ready = true; if (pending) void ch.track(pending); queue.splice(0).forEach(push); h.onStatus?.(true); }
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { ready = false; h.onStatus?.(false); }
    else if (status === 'CLOSED') ready = false;
  });
  return {
    send: (m) => { if (ready) push(m); else { queue.push(m); if (queue.length > 60) queue.shift(); } },
    setPresence: (p) => { pending = p; if (ready) void ch.track(p); },
    leave: () => { ready = false; void supa().removeChannel(ch); },
    ready: () => ready,
  };
}

function localRoom(name: string, me: Peer | null, h: RoomHandlers): Room {
  const bc = new BroadcastChannel(`v4f:${name}`);
  const peers = new Map<string, { p: Peer; seen: number }>();
  let self = me;
  const emit = () => h.onPeers?.([...(self ? [self] : []), ...[...peers.values()].map((v) => v.p)]);
  bc.onmessage = (e) => {
    const m = e.data as Msg;
    if (m.t === '__hi') { peers.set((m.p as Peer).id, { p: m.p as Peer, seen: Date.now() }); emit(); return; }
    if (m.t === '__bye') { peers.delete(m.id as string); emit(); return; }
    h.onMsg(m);
  };
  const beat = () => {
    if (self) bc.postMessage({ t: '__hi', p: self });
    const now = Date.now(); let changed = false;
    for (const [id, v] of peers) if (now - v.seen > 3500) { peers.delete(id); changed = true; }
    if (changed) emit();
  };
  const timer = setInterval(beat, 1000); beat(); emit();
  return {
    send: (m) => bc.postMessage(m),
    setPresence: (p) => { self = p; beat(); emit(); },
    leave: () => { if (self) bc.postMessage({ t: '__bye', id: self.id }); clearInterval(timer); bc.close(); },
    ready: () => true,
  };
}
