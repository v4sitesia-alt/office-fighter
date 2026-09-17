// Mapa do Brasil em SVG (contorno simplificado em lon/lat) com os pontos de origem dos lutadores.
import type { FighterAssets } from '../game/types';

// contorno aproximado, sentido horário a partir da fronteira oeste (lon, lat)
const OUTLINE: [number, number][] = [
  [-70.0, -4.2], [-69.4, -1.0], [-66.9, 1.2], [-63.4, 2.4], [-60.6, 5.2], [-59.6, 4.4], [-58.5, 1.5], [-56.0, 1.9],
  [-54.0, 2.3], [-51.6, 4.3], [-50.0, 1.7], [-49.8, -0.2], [-48.4, -1.4], [-46.5, -1.0], [-44.3, -2.5], [-42.0, -2.8],
  [-38.5, -3.7], [-37.0, -4.8], [-35.2, -5.8], [-34.8, -7.1], [-34.9, -8.1], [-35.7, -9.7], [-37.1, -10.9], [-38.5, -13.0],
  [-39.0, -14.8], [-39.1, -17.7], [-39.7, -19.5], [-40.3, -20.3], [-41.0, -21.8], [-42.0, -22.9], [-43.2, -23.0], [-44.7, -23.4],
  [-46.3, -23.9], [-47.9, -25.0], [-48.5, -26.0], [-48.6, -27.6], [-49.7, -29.3], [-50.3, -30.5], [-51.2, -32.0], [-52.2, -32.7],
  [-53.4, -33.7], [-53.6, -33.0], [-55.6, -30.9], [-57.6, -30.2], [-56.0, -28.9], [-55.0, -28.3], [-53.8, -27.2], [-53.7, -26.2],
  [-54.6, -25.5], [-54.5, -24.0], [-54.3, -23.4], [-55.7, -22.5], [-57.8, -22.1], [-57.7, -21.5], [-57.6, -19.0], [-58.2, -18.0],
  [-59.7, -16.3], [-60.2, -15.1], [-60.5, -13.8], [-61.0, -13.5], [-62.7, -12.5], [-65.3, -10.8], [-68.7, -11.1], [-70.5, -11.0],
  [-72.0, -10.0], [-73.9, -7.5], [-72.7, -5.1], [-70.0, -4.2],
];

/** Outras capitais, apagadas: vagas pros próximos lutadores. */
const DIM: { name: string; lon: number; lat: number }[] = [
  { name: 'Manaus', lon: -60.0, lat: -3.1 }, { name: 'Fortaleza', lon: -38.5, lat: -3.7 }, { name: 'Recife', lon: -34.9, lat: -8.1 },
  { name: 'Salvador', lon: -38.5, lat: -13.0 }, { name: 'Brasília', lon: -47.9, lat: -15.8 }, { name: 'Belo Horizonte', lon: -43.9, lat: -19.9 },
  { name: 'São Paulo', lon: -46.6, lat: -23.5 }, { name: 'Porto Alegre', lon: -51.2, lat: -30.0 }, { name: 'Belém', lon: -48.5, lat: -1.5 },
];

const LON0 = -74.5, LON1 = -33.5, LAT0 = 6.0, LAT1 = -34.5; // caixa do mapa
const SW = 340, SH = 300;

function project(lon: number, lat: number): [number, number] {
  const x = 20 + ((lon - LON0) / (LON1 - LON0)) * (SW - 40);
  const y = 10 + ((LAT0 - lat) / (LAT0 - LAT1)) * (SH - 20);
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

export function brazilMapSvg(roster: FighterAssets[]): string {
  const pts = OUTLINE.map(([lon, lat]) => project(lon, lat).join(',')).join(' ');
  const dim = DIM.filter((d) => !roster.some((f) => f.def.origin && Math.abs(f.def.origin.lon - d.lon) < 0.6 && Math.abs(f.def.origin.lat - d.lat) < 0.6))
    .map((d) => { const [x, y] = project(d.lon, d.lat); return `<circle class="dot dim" cx="${x}" cy="${y}" r="5"/>`; }).join('');
  const marks = roster.map((f, i) => {
    const o = f.def.origin; if (!o) return '';
    const [x, y] = project(o.lon, o.lat);
    const pos = o.label ?? (x > SW * 0.62 ? 'left' : 'right'); // perto da borda direita, rótulo à esquerda
    const lx = pos === 'left' ? x - 11 : pos === 'right' ? x + 11 : x;
    const ly = pos === 'above' ? y - 11 : pos === 'below' ? y + 16 : y + 4;
    const anchor = pos === 'left' ? 'end' : pos === 'right' ? 'start' : 'middle';
    return `<g class="mark" data-i="${i}"><circle class="dot" cx="${x}" cy="${y}" r="7"/><text class="lbl" x="${lx}" y="${ly}" text-anchor="${anchor}">${o.city.toUpperCase()}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${SW} ${SH}" xmlns="http://www.w3.org/2000/svg">
    <ellipse class="globe" cx="${SW / 2}" cy="${SH / 2}" rx="${SW / 2 - 4}" ry="${SH / 2 - 4}"/>
    <polygon class="land" points="${pts}"/>
    ${dim}${marks}
  </svg>`;
}
