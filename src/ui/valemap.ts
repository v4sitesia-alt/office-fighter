// Mapa do Vale Quatro, o estado fictício do jogo: cada lutador tem o seu ponto (src/data/places.json).
import type { FighterAssets } from '../game/types';
import data from '../data/places.json';

const P = data.places as Record<string, { name: string; x: number; y: number }>;
export const placeOf = (id: string) => P[id]?.name ?? '???';

/** Onde o lutador luta melhor (def.range, tools/balance.py): régua de 3 marcas (perto, meia, longe) com a dele acesa + o nome. */
export const RANGES = { perto: 'LUTA DE PERTO', medio: 'MEIA DISTÂNCIA', longe: 'LUTA DE LONGE' } as const;
export function rangeTag(r?: keyof typeof RANGES) {
  if (!r) return '';
  const k = (['perto', 'medio', 'longe'] as const).indexOf(r);
  return `<span class="rng r-${r}"><span class="rng-dots">${[0, 1, 2].map((i) => `<i${i === k ? ' class="on"' : ''}></i>`).join('')}</span>${RANGES[r]}</span>`;
}

// contorno inventado (340x300): litoral recortado a leste, serra a oeste, um rio cortando o meio.
// Na torre, de baixo pra cima: o elevador (Leo), o laboratório do 51º (Xablau), o 52º (Mundim) e o 53º.
const COAST = 'M58,52 L96,34 L140,44 L178,26 L226,32 L262,20 L300,40 L318,78 L304,104 L322,138 L306,176 L316,214 L284,238 L246,262 L204,250 L170,276 L126,268 L92,280 L60,250 L36,214 L48,176 L28,138 L44,96 Z';
const RIVER = 'M300,40 C268,88 236,96 214,126 S160,188 126,268';
const HILLS = [[60, 120], [74, 140], [52, 160], [84, 100], [66, 200]];

export function valeMapSvg(roster: FighterAssets[]): string {
  const marks = roster.map((f, i) => {
    const p = P[f.def.id]; if (!p) return '';
    const name = p.name.split(' · ')[0].toUpperCase();          // no mapa só o lugar ("51º ANDAR"); o nome inteiro fica embaixo do lutador
    const w = name.length * 8;                                    // fonte pixel de 8px: cada letra ocupa 8
    const left = p.x > 200 ? p.x - 10 - w >= 0 : p.x + 10 + w > 340;
    return `<g class="mark" data-i="${i}"><circle class="dot" cx="${p.x}" cy="${p.y}" r="6"/><text class="lbl" x="${left ? p.x - 10 : p.x + 10}" y="${p.y + 3}" text-anchor="${left ? 'end' : 'start'}">${name}</text></g>`;
  }).join('');
  const hills = HILLS.map(([x, y]) => `<path class="hill" d="M${x - 9},${y + 6} L${x},${y - 8} L${x + 9},${y + 6} Z"/>`).join('');
  return `<svg viewBox="0 0 340 300" xmlns="http://www.w3.org/2000/svg">
    <rect class="sea" x="0" y="0" width="340" height="300" rx="10"/>
    <path class="land" d="${COAST}"/><path class="river" d="${RIVER}"/>${hills}
    <path class="tower" d="M181,128 L181,68 L186,60 L191,68 L191,128 Z"/>
    <text class="state" x="170" y="294" text-anchor="middle">${data.state}</text>
    ${marks}
  </svg>`;
}
