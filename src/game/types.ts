// Tipos dos contratos de dados (fighter.json + frames.json) e do combate.

export interface Box { x: number; y: number; w: number; h: number }

/** Um frame extraído do sheet (gerado por tools/sprites.py). Coordenadas em px do sheet. */
export interface FrameDef {
  i: number; cell: [number, number];
  sx: number; sy: number; sw: number; sh: number;
  ax: number;  // eixo do corpo medido pelos pés
  cx: number;  // eixo do corpo pelo centroide
  ay: number;  // linha dos pés
}

export interface FramesFile {
  sheet: string; width: number; height: number; cols: number; rows: number;
  frames: FrameDef[];
  fx?: { file: string; w: number; h: number };
}

export interface AnimDef {
  frames: number[];
  fps?: number;
  loop?: boolean;
  anchor?: 'feet' | 'center';
}

export interface ProjectileDef {
  x: number; y: number;        // ponto de spawn relativo aos pés (unidades do sprite)
  speed: number;               // px de tela por frame
  lifetime: number;            // frames
  hitbox: Box;                 // relativo ao centro do projétil (unidades do sprite)
}

export interface MoveDef {
  phases: { startup: number[]; active: number[]; recovery: number[] };
  startup: number; active: number; recovery: number;
  damage: number; hitstun: number; blockstun: number;
  hitbox: Box;                 // relativo aos pés, x pra frente, y negativo pra cima (unidades do sprite)
  knockback: number;           // px/frame iniciais
  launch?: number;             // impulso vertical no alvo (negativo = pra cima)
  knockdown?: boolean;
  meterGain?: number;
  meterCost?: number;
  hitstop?: number;
  name?: string;
  projectile?: ProjectileDef;
}

export type MoveName = 'punch' | 'kick' | 'heavy' | 'special';

export interface FighterDef {
  id: string; name: string; role: string; tagline?: string;
  colors: { primary: string; secondary: string };
  scale: number;
  stats: { speed: number; power: number; weight: number };
  hurtbox: Box; crouchHurtbox: Box;
  pushbox: { x: number; w: number };
  anims: Record<string, AnimDef>;
  moves: Record<MoveName, MoveDef>;
}

/** Tudo que o jogo precisa de um lutador, já carregado. */
export interface FighterAssets {
  def: FighterDef;
  frames: FramesFile;
  sheet: HTMLImageElement;
  fx?: HTMLImageElement;
  portrait?: HTMLImageElement;
}

export type Difficulty = 'easy' | 'normal' | 'hard';
