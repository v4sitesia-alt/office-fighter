// Mapa do estado fictício do Vale Quatro, com a cidade de cada lutador (origin.x / origin.y vão de 0 a 1).
import type { FighterAssets } from '../game/types';
import story from '../data/story.json';

const SW = 340, SH = 300;
const SHAPE = [[58, 38], [120, 22], [185, 30], [250, 24], [300, 70], [318, 128], [300, 170], [322, 222], [268, 276], [196, 262], [140, 284], [84, 272], [40, 226], [52, 170], [22, 120]];

export function stateMapSvg(roster: FighterAssets[]): string {
  const cap = roster.find((f) => f.def.id === story.capital)?.def.origin;
  const at = (o: { x: number; y: number }) => [Math.round(o.x * SW), Math.round(o.y * SH)];
  const roads = cap ? roster.map((f) => { const o = f.def.origin; if (!o || o === cap) return ''; const [x, y] = at(o), [cx, cy] = at(cap); return `<line class="road" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`; }).join('') : '';
  const marks = roster.map((f, i) => {
    const o = f.def.origin; if (!o) return '';
    const [x, y] = at(o), left = x > SW * 0.6;
    return `<g class="mark" data-i="${i}"><circle class="dot" cx="${x}" cy="${y}" r="${o === cap ? 8 : 6}"/><text class="lbl" x="${left ? x - 11 : x + 11}" y="${y + 4}" text-anchor="${left ? 'end' : 'start'}">${o.city.toUpperCase()}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${SW} ${SH}" xmlns="http://www.w3.org/2000/svg">
    <rect class="globe" x="2" y="2" width="${SW - 4}" height="${SH - 4}" rx="18"/>
    <polygon class="land" points="${SHAPE.map((p) => p.join(',')).join(' ')}"/>
    ${roads}${marks}
    <text class="st" x="${SW / 2}" y="${SH - 8}" text-anchor="middle">ESTADO DO ${story.state}</text>
  </svg>`;
}
