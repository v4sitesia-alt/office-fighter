/** Ids dos lutadores (pasta public/fighters/<id>) na ordem da tela de seleção. */
// A grade tem 5 colunas: a ordem alterna as cores das molduras pra vizinho nenhum (do lado, em cima ou embaixo) ter o mesmo tom.
//   roxo · verde · amarelo · laranja · ciano / vermelho · dourado · rosa · azul · verde-oliva / a fila de baixo é a escada dos chefes
export const ROSTER = ['edgard', 'laura', 'landim', 'eneias', 'santana',
  'michael', 'dede', 'van', 'kevin', 'crm',
  'leo', 'dias', 'xablau', 'mundim'];
/** Lutadores secretos: carregados sempre (aparecem como adversário e online), mas só escolhíveis depois de destravados. */
export const SECRET = ['dener'];
/** Travados no lançamento: aparecem como adversários, mas só dá pra jogar com eles depois de destravar.
 *  Xablau e Mundim: zerando o arcade (vencendo o Mundim) ou com o código. Dener: só com o código.
 *  Código = sequência digitada na tela de seleção. Só direções, H (chute), J (forte) e B (especial): G confirma e V volta. */
export const LOCKED: Record<string, { code: string[]; byArcade: boolean }> = {
  xablau: { code: ['down', 'down', 'down', 'kick', 'kick', 'kick'], byArcade: true },                       // ↓ ↓ ↓ H H H   (desce pro subsolo e chuta)
  mundim: { code: ['up', 'up', 'up', 'up', 'up', 'special', 'heavy'], byArcade: true },                    // ↑ ↑ ↑ ↑ ↑ B J (sobe a torre e solta o especial)
  dener: { code: ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'special', 'heavy'], byArcade: false },  // ↑ ↑ ↓ ↓ ← → ← → B J
};
/** Cenário usado quando o lutador não define o seu. */
export const DEFAULT_STAGE = 'office';
