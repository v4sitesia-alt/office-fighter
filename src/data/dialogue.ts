// Monta a conversa antes da luta: usa o roteiro do par quando existe (story.json > pairs), senão combina as falas genéricas.
import story from './story.json';

export interface Line { who: 0 | 1; text: string }
interface Voice { open: string[]; reply: string[]; close: string[]; ending: string }
const S = story as unknown as { pairs: Record<string, [string, string][]>; mirror: [string, string][]; fighters: Record<string, Voice> };

type Exchange = [string, string][];
const B = story as unknown as { banter: Exchange[]; rematch: Exchange[]; fighters: Record<string, { nick: string }> };
const rnd = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/** Conversa do banco: A é o jogador na revanche (quem perdeu é o B... ou seja, quem volta); fora isso, sorteado. */
function fromBank(bank: Exchange[], a: string, b: string, aIs: 0 | 1): Line[] {
  const ids = aIs === 0 ? [a, b] : [b, a];
  return rnd(bank).map(([w, t]) => {
    const who = ((w === 'A' ? 0 : 1) ^ aIs) as 0 | 1, me = w === 'A' ? ids[0] : ids[1], other = w === 'A' ? ids[1] : ids[0];
    return { who, text: t.replace('{a}', B.fighters[me]?.nick ?? '').replace('{b}', B.fighters[other]?.nick ?? '') };
  });
}

/** attempt = quantas vezes o jogador já perdeu esta luta: na revanche a conversa muda. */
/** Conversa curta: provocação, resposta e tréplica. Nada além disso, pra não esfriar a luta. */
export function scriptFor(a: string, b: string, mirror: boolean, attempt = 0): Line[] { return muted(fullScript(a, b, mirror, attempt).slice(0, 3), a, b); }

/** Quem não fala: o Xablau só grunhe. Qualquer fala dele, em qualquer conversa (par, banco genérico, revanche, espelho), vira grunhido. */
const G = story as unknown as { grunts?: Record<string, string[]> };
const MUTE: Record<string, string[]> = { xablau: G.grunts?.xablau ?? ['GRRRRRR...', 'HNNNNGH!', 'RRRAAAAAH!', 'GRRH. HNGH. GRRRH.', 'UUUURGH...', 'KHHHHHH...'] };
/** Grunhido que já vem escrito no roteiro do par fica (ex.: o gemido de medo diante do Dener); só fala com palavra é sorteada.
 *  Mesma regra do tools/story-check.py. */
const GRUNT = /^[GRHNAUKOEIYM\s!.\-…,?]+$/;
function muted(lines: Line[], a: string, b: string): Line[] {
  return lines.map((l) => { const g = MUTE[l.who === 0 ? a : b]; return g && !GRUNT.test(l.text) ? { ...l, text: rnd(g) } : l; });
}
function fullScript(a: string, b: string, mirror: boolean, attempt = 0): Line[] {
  if (mirror || a === b) return S.mirror.map(([w, t]) => ({ who: w === 'A' ? 0 : 1, text: t }));
  if (attempt > 0) return fromBank(B.rematch, a, b, 1);                         // A = o adversário, que ganhou a anterior
  const key = [a, b].sort().join('|'), pair = S.pairs[key];
  if (pair) return pair.map(([id, t]) => ({ who: id === a ? 0 : 1, text: t }));
  const A = S.fighters[a], Bv = S.fighters[b]; if (!A || !Bv) return [];
  // sem roteiro próprio: uma conversa do banco + a frase de efeito de cada um
  const lines = fromBank(B.banter, a, b, Math.random() < 0.5 ? 0 : 1), last = lines[lines.length - 1].who;
  const closer = (1 - last) as 0 | 1;
  lines.push({ who: closer, text: rnd((closer === 0 ? A : Bv).close) });
  if (lines.length < 4) lines.push({ who: last, text: rnd((last === 0 ? A : Bv).close) });
  return lines;
}
export const endingOf = (id: string) => S.fighters[id]?.ending ?? '';
