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
  for (const m of Object.values(def.moves)) {
    if (m?.projectile?.sprite) fxFiles.add(m.projectile.sprite);
    if (m?.projectile?.trail) fxFiles.add(m.projectile.trail);
    if (m?.beam) [m.beam.start, m.beam.mid, m.beam.end].forEach((f) => fxFiles.add(f));
    if (m?.shield) fxFiles.add(m.shield.sprite);
    if (m?.zone?.pillar) { const p = m.zone.pillar; [p.base, p.tile, p.top, p.swarm].forEach((f) => fxFiles.add(f)); }
    if (m?.zone?.rain) [m.zone.rain.bomb, m.zone.rain.boom, m.zone.rain.up ?? ''].forEach((f) => f && fxFiles.add(f));
  }
  const fx: Record<string, HTMLImageElement> = {};
  await Promise.all([...fxFiles].map((f) => loadImage(dir + f).then((img) => { fx[f] = img; }).catch(() => undefined))); tick();
  const portrait = await loadImage(dir + 'portrait.png').catch(() => undefined); tick();
  const secretPortrait = def.secret ? await loadImage(dir + 'secret.png').catch(() => undefined) : undefined;
  const morph = def.morph ? await loadFighter(def.morph).catch(() => undefined) : undefined;
  return { def, frames, sheet, fx, portrait, secretPortrait, morph };
}

/** Juiz (robô das bandeiras): atlas próprio em public/referee/. Se faltar, o jogo segue sem juiz. */
export async function loadReferee() {
  const dir = `${BASE}referee/`;
  try { const frames = await loadJSON<FramesFile>(dir + 'frames.json'); return { frames, sheet: await loadImage(dir + frames.sheet) }; } catch { return null; }
}

export interface StageAssets { name: string; img: HTMLImageElement; scroll?: HTMLImageElement; front?: HTMLImageElement }

/** Cenários em camadas (elevador): <name>-scroll.jpg desce em loop atrás e <name>-front.png (transparente) fica parado na frente. */
const LAYERED = new Set(['leo']);

/** Cenário = uma imagem 16:9 em public/stages/<name>.png (chão dos lutadores em ~87% da altura). */
export async function loadStage(name: string, onProgress?: () => void): Promise<StageAssets> {
  const img = await loadImage(`${BASE}stages/${name}.png`); onProgress?.();
  if (!LAYERED.has(name)) return { name, img };
  const [scroll, front] = await Promise.all([loadImage(`${BASE}stages/${name}-scroll.jpg`), loadImage(`${BASE}stages/${name}-front.png`)].map((q) => q.catch(() => undefined)));
  return { name, img, scroll, front };
}
