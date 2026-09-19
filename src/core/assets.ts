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
  const fxFiles = new Set<string>(['special_fx.png']);
  for (const m of Object.values(def.moves)) if (m?.projectile?.sprite) fxFiles.add(m.projectile.sprite);
  const fx: Record<string, HTMLImageElement> = {};
  await Promise.all([...fxFiles].map((f) => loadImage(dir + f).then((img) => { fx[f] = img; }).catch(() => undefined))); tick();
  const portrait = await loadImage(dir + 'portrait.png').catch(() => undefined); tick();
  const secretPortrait = def.secret ? await loadImage(dir + 'secret.png').catch(() => undefined) : undefined;
  return { def, frames, sheet, fx, portrait, secretPortrait };
}

export interface StageAssets { name: string; img: HTMLImageElement }

/** Cenário = uma imagem 16:9 em public/stages/<name>.png (chão dos lutadores em ~87% da altura). */
export async function loadStage(name: string, onProgress?: () => void): Promise<StageAssets> {
  const img = await loadImage(`${BASE}stages/${name}.png`); onProgress?.();
  return { name, img };
}
