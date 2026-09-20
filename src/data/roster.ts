/** Ids dos lutadores (pasta public/fighters/<id>) na ordem da tela de seleção. */
// A grade tem 5 colunas: a ordem alterna as cores das molduras pra vizinho nenhum (do lado, em cima ou embaixo) ter o mesmo tom.
//   roxo · verde · amarelo · laranja · ciano / vermelho · dourado · rosa · azul · verde-oliva / a fila de baixo é a escada dos chefes
export const ROSTER = ['edgard', 'laura', 'landim', 'eneias', 'santana',
  'michael', 'dede', 'van', 'kevin', 'crm',
  'leo', 'dias', 'xablau', 'mundim'];
/** Lutadores secretos: carregados sempre (aparecem como adversário e online), mas só escolhíveis depois de destravados. */
export const SECRET = ['dener'];
/** Cenário usado quando o lutador não define o seu. */
export const DEFAULT_STAGE = 'office';
