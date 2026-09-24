/** Ids dos lutadores (pasta public/fighters/<id>) na ordem da tela de seleção. */
// A grade tem 5 colunas: a ordem alterna as cores das molduras pra vizinho nenhum (do lado, em cima ou embaixo) ter o mesmo tom.
//   roxo · verde · amarelo · laranja · ciano / vermelho · dourado · rosa · azul · verde-oliva / a fila de baixo é a escada dos chefes
export const ROSTER = ['edgard', 'laura', 'landim', 'eneias', 'santana',
  'michael', 'dede', 'van', 'kevin', 'crm',
  'leo', 'dias', 'xablau', 'mundim'];
/** Lutadores secretos: carregados sempre (aparecem como adversário e online), mas só escolhíveis depois de destravados. */
export const SECRET = ['dener'];
/** Travados: aparecem como adversários, mas só dá pra jogar com eles depois de destravar. Dener: só com o código.
 *  (Xablau e Mundim começaram travados no lançamento e foram liberados pra todo mundo em 2026-09-24; os códigos deles eram
 *  ↓ ↓ ↓ H H H e ↑ ↑ ↑ ↑ ↑ B J. Pra voltar a travar alguém: uma entrada aqui, com byArcade = sai zerando o arcade.)
 *  Código = sequência digitada na tela de seleção. Só direções, H (chute), J (forte) e B (especial): G confirma e V volta. */
export const LOCKED: Record<string, { code: string[]; byArcade: boolean }> = {
  dener: { code: ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'special', 'heavy'], byArcade: false },  // ↑ ↑ ↓ ↓ ← → ← → B J
};
/** Cenário usado quando o lutador não define o seu. */
export const DEFAULT_STAGE = 'office';
