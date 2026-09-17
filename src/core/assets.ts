import type { FighterAssets, FighterDef, FramesFile } from '../game/types';

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`imagem não carregou: ${url}`));
    img.src = url;
  });
}

export async function loadJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

const BASE = import.meta.env.BASE_URL;

export async function loadFighter(id: string, onProgress?: () => void): Promise<FighterAssets> {
  const dir = `${BASE}fighters/${id}/`;
  const tick = () => onProgress?.();
  const [def, frames] = await Promise.all([
    loadJSON<FighterDef>(dir + 'fighter.json').then((v) => (tick(), v)),
    loadJSON<FramesFile>(dir + 'frames.json').then((v) => (tick(), v)),
  ]);
  const sheet = await loadImage(dir + frames.sheet); tick();
  const fx = await loadImage(dir + (frames.fx?.file ?? 'special_fx.png')).catch(() => undefined); tick();
  const portrait = await loadImage(dir + 'portrait.png').catch(() => undefined); tick();
  return { def, frames, sheet, fx, portrait };
}

export interface StageAssets { far: HTMLImageElement; mid: HTMLImageElement; floor: HTMLImageElement }

export async function loadStage(name: string, onProgress?: () => void): Promise<StageAssets> {
  const dir = `${BASE}stages/${name}-`;
  const [far, mid, floor] = await Promise.all(
    ['far', 'mid', 'floor'].map((l) => loadImage(`${dir}${l}.png`).then((v) => (onProgress?.(), v))),
  );
  return { far, mid, floor };
}
