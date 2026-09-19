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
  loopFrom?: number;           // sem `loop`: toca tudo uma vez e depois repete a partir deste índice (pose de vitória que "senta e medita")
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
  sprite?: string;             // arquivo em public/fighters/<id>/ (padrão special_fx.png)
  homing?: boolean;            // teleguiado: sobe em curva pro céu e desce em cima do adversário
  boomerang?: boolean;         // vai, freia e volta pra mão de quem jogou (some ao chegar)
  hits?: number;               // quantos acertos o mesmo projétil pode dar (padrão 1); entre um e outro espera `rehit` frames
  rehit?: number;
  spin?: number;               // giro do sprite (rad/frame)
  hitVoice?: string;           // som gravado ao acertar ou bater na defesa (míssil explodindo, garrafa quebrando)
  style?: 'ball' | 'slash' | 'cloud' | 'bat' | 'coin' | 'heart' | 'wave';   // magia desenhada por código (sem sprite)
  color?: string; size?: number;
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

/** Raio contínuo (olho biônico): sai do lutador, cresce até o alcance ou até bater no adversário e termina num estouro.
 *  É montado com três peças (tools/pieces.py): início, trecho do meio que se repete e estouro final. */
export interface BeamDef {
  x: number; y: number;        // de onde sai (centro do raio), relativo aos pés (unidades do sprite)
  reach: number;               // alcance máximo (unidades do sprite)
  grow: number;                // quanto o raio cresce por frame (unidades do sprite)
  thick: number;               // altura da caixa de acerto (unidades do sprite)
  start: string; mid: string; end: string;   // peças em public/fighters/<id>/
  every?: number;              // raio contínuo: acerta de novo a cada N frames enquanto estiver ativo
  overlap?: number;            // quanto o trecho do meio entra por baixo do início, onde o início vai sumindo (px da peça)
}

export type MoveKind = 'ground' | 'air' | 'low' | 'portal' | 'dive' | 'throw';

/** Agarrão: avança, agarra (indefensável), segura, levanta e arremessa. */
export interface ThrowDef {
  speed: number;                                  // px/frame do avanço
  dash: number; grab: number; hold: number; lift: number; throw: number; whiff: number;   // frames de cada fase
  holdOffset: { x: number; y: number };           // posição da vítima enquanto segura (unidades do sprite)
  liftOffset: { x: number; y: number };           // posição da vítima levantada
  release: { damage: number; knockback: number; launch: number; hitstop?: number };
  air?: number;                                   // sobe com a vítima durante o 'lift' (unidades do sprite)
  ticks?: number; tickDamage?: number;            // combo: acertos durante o 'lift'
}

export interface MoveDef extends HitDef {
  kind?: MoveKind;
  phases: { startup: number[]; active: number[]; recovery: number[]; impact?: number[]; hold?: number[]; lift?: number[]; throw?: number[] };
  startup: number; active: number; recovery: number;
  dash?: number;               // avanço em px/frame durante startup+active
  impact?: number;             // dive: frames parado no chão após o impacto
  landingLag?: number;         // air: frames travado ao pousar
  anchor?: 'feet' | 'center';
  hitbox: Box;                 // relativo aos pés, x pra frente, y negativo pra cima (unidades do sprite)
  hitboxes?: Box[];            // uma por frame de `phases.active` (golpe longo: o alcance cresce junto com o desenho)
  chain?: MoveName[];          // encadeamento: se este golpe encostou (acerto ou defesa), a recuperação pode ser cancelada num destes
  chainMax?: number;           // quantos encadeamentos seguidos a sequência aceita (padrão 3)
  meterGain?: number;
  meterCost?: number;
  name?: string;
  projectile?: ProjectileDef;
  beam?: BeamDef;
  /** Carga de energia: durante o preparo o lutador fica INTOCÁVEL e a aura em volta dele acerta quem chegar perto. */
  aura?: { box: Box; damage: number; hitstun: number; blockstun: number; knockback: number; every: number };
  zone?: ZoneDef;
  throw?: ThrowDef;
}

export type MoveName =
  | 'punch' | 'kick' | 'heavy' | 'long' | 'special' | 'super'
  | 'airPunch' | 'airKick' | 'airHeavy'
  | 'lowPunch' | 'lowKick' | 'lowHeavy';

export interface FighterDef {
  id: string; name: string; role: string; tagline?: string; bio?: string; side?: 'heroi' | 'neutro' | 'vilao'; secret?: boolean; gender?: 'f' | 'm';
  meterRegen?: number;          // barra de especial que se recarrega sozinha (por frame)
  colors: { primary: string; secondary: string };
  origin?: { region: string; city: string; lon: number; lat: number; label?: 'left' | 'right' | 'above' | 'below' };
  stage?: string;               // public/stages/<stage>.png (cenário do lutador)
  scale: number;
  stats: { speed: number; power: number; weight: number; magic?: number; jump?: number; inertia?: number }   // inertia = frames pra máquina pesada pegar a velocidade cheia ao andar;   // força = power, agilidade = speed, poder = magic
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
  fx: Record<string, HTMLImageElement>;   // sprites de projétil por arquivo
  secretPortrait?: HTMLImageElement;      // thumb do slot enquanto o lutador está travado
  portrait?: HTMLImageElement;
}

export type Difficulty = 'easy' | 'normal' | 'hard';
