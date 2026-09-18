// Transporte em tempo real: salas com mensagens (broadcast) e presença.
// Com VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY usa o Supabase Realtime (qualquer pessoa com o link entra);
// sem as chaves cai no BroadcastChannel, que só liga abas do mesmo navegador (serve pra testar).
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

export interface Peer { id: string; name: string; fighter: string; status: 'livre' | 'procurando' | 'lutando' | 'assistindo'; matchId?: string; vs?: string }
export type Msg = { t: string; [k: string]: unknown };

export interface Room {
  send(m: Msg): void;
  setPresence(me: Peer): void;
  leave(): void;
}
export interface RoomHandlers { onMsg(m: Msg): void; onPeers?(peers: Peer[]): void }

const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://rijffrhwuwouogurovkz.supabase.co';
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const ONLINE = !!(URL_ && KEY);
let client: SupabaseClient | null = null;
export const supa = () => (client ??= createClient(URL_!, KEY!, { realtime: { params: { eventsPerSecond: 20 } } }));

export function joinRoom(name: string, me: Peer | null, h: RoomHandlers): Room {
  return ONLINE ? supabaseRoom(name, me, h) : localRoom(name, me, h);
}

function supabaseRoom(name: string, me: Peer | null, h: RoomHandlers): Room {
  const ch: RealtimeChannel = supa().channel(`v4f:${name}`, { config: { broadcast: { self: false, ack: false }, presence: { key: me?.id ?? '' } } });
  ch.on('broadcast', { event: 'm' }, ({ payload }) => h.onMsg(payload as Msg));
  ch.on('presence', { event: 'sync' }, () => {
    const st = ch.presenceState() as Record<string, unknown[]>;
    h.onPeers?.(Object.values(st).map((arr) => arr[arr.length - 1] as unknown as Peer).filter((p) => p && p.id));
  });
  let ready = false; let pending: Peer | null = me;
  ch.subscribe((status) => { if (status === 'SUBSCRIBED') { ready = true; if (pending) void ch.track(pending); } });
  return {
    send: (m) => { void ch.send({ type: 'broadcast', event: 'm', payload: m }); },
    setPresence: (p) => { pending = p; if (ready) void ch.track(p); },
    leave: () => { void supa().removeChannel(ch); },
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
  const timer = window.setInterval(beat, 1000); beat(); emit();
  return {
    send: (m) => bc.postMessage(m),
    setPresence: (p) => { self = p; beat(); emit(); },
    leave: () => { if (self) bc.postMessage({ t: '__bye', id: self.id }); clearInterval(timer); bc.close(); },
  };
}
