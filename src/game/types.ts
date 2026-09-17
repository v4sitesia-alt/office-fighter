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

/** O que um acerto faz na vítima. */
export interface HitDef {
  damage: number; hitstun: number; blockstun: number;
  knockback: number;           // px/frame iniciais
  launch?: number;             // impulso vertical (negativo = pra cima)
  knockdown?: boolean;
  hitstop?: number;
  low?: boolean;               // só defende agachado
  overhead?: boolean;          // só defende em pé
}

export interface ProjectileDef {
  x: number; y: number;        // spawn relativo aos pés (unidades do sprite)
  speed: number;               // px de tela por frame
  lifetime: number;
  scale?: number;              // escala extra da imagem
  count?: number;              // rajada: quantos projéteis
  every?: number;              // rajada: frames entre um e outro
  hitbox: Box;                 // relativo ao centro do projétil (unidades do sprite)
}

/** Efeito no chão com hitbox própria (portal, explosão). Nasce nos pés do alvo ou do atacante. */
export interface ZoneDef {
  frames: number[]; fps: number; lifetime: number;
  at: 'target' | 'self';
  hitbox: Box;                 // relativo aos pés da zona
  hits: { at: number; damage: number; knockdown?: boolean; launch?: number }[];
  hitstun: number; blockstun: number; knockback: number; hitstop?: number;
  low?: boolean; overhead?: boolean;
}

export type MoveKind = 'ground' | 'air' | 'low' | 'portal' | 'dive';

export interface MoveDef extends HitDef {
  kind?: MoveKind;
  phases: { startup: number[]; active: number[]; recovery: number[]; impact?: number[] };
  startup: number; active: number; recovery: number;
  impact?: number;             // dive: frames parado no chão após o impacto
  landingLag?: number;         // air: frames travado ao pousar
  anchor?: 'feet' | 'center';
  hitbox: Box;                 // relativo aos pés, x pra frente, y negativo pra cima (unidades do sprite)
  meterGain?: number;
  meterCost?: number;
  name?: string;
  projectile?: ProjectileDef;
  zone?: ZoneDef;
}

export type MoveName =
  | 'punch' | 'kick' | 'heavy' | 'special' | 'super'
  | 'airPunch' | 'airKick' | 'airHeavy'
  | 'lowPunch' | 'lowKick' | 'lowHeavy';

export interface FighterDef {
  id: string; name: string; role: string; tagline?: string;
  colors: { primary: string; secondary: string };
  origin?: { region: string; city: string; lon: number; lat: number; label?: 'left' | 'right' | 'above' | 'below' };
  stage?: string;               // public/stages/<stage>.png (cenário do lutador)
  scale: number;
  stats: { speed: number; power: number; weight: number };
  hurtbox: Box; crouchHurtbox: Box;
  pushbox: { x: number; w: number };
  anims: Record<string, AnimDef>;
  moves: Partial<Record<MoveName, MoveDef>>;
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
