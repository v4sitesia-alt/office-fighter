// Monta a conversa antes da luta: usa o roteiro do par quando existe (story.json > pairs), senão combina as falas genéricas.
import story from './story.json';

export interface Line { who: 0 | 1; text: string }
interface Voice { open: string[]; reply: string[]; close: string[]; ending: string }
const S = story as unknown as { pairs: Record<string, [string, string][]>; mirror: [string, string][]; fighters: Record<string, Voice> };

export function scriptFor(a: string, b: string, mirror: boolean, villainB = true): Line[] {
  if (mirror || a === b) return S.mirror.map(([w, t]) => ({ who: w === 'A' ? 0 : 1, text: t }));
  const key = [a, b].sort().join('|'), pair = S.pairs[key];
  if (pair) return pair.map(([id, t]) => ({ who: id === a ? 0 : 1, text: t }));
  const A = S.fighters[a], B = S.fighters[b]; if (!A || !B) return [];
  let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pick = (arr: string[], k: number) => arr[(h + k) % arr.length];
  const first = villainB ? 1 : 0, O = first ? B : A, R = first ? A : B;   // quem desafia fala primeiro
  return [{ who: first as 0 | 1, text: pick(O.open, 0) }, { who: (1 - first) as 0 | 1, text: pick(R.reply, 1) }, { who: first as 0 | 1, text: pick(O.close, 2) }, { who: (1 - first) as 0 | 1, text: pick(R.close, 3) }];
}
export const endingOf = (id: string) => S.fighters[id]?.ending ?? '';
