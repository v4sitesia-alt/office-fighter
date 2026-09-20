/** Ids dos lutadores (pasta public/fighters/<id>) na ordem da tela de seleção. */
// A grade tem 5 colunas: a ordem alterna as cores das molduras pra vizinho nenhum (do lado, em cima ou embaixo) ter o mesmo tom.
//   roxo · amarelo · verde · laranja · ciano / dourado · rosa · azul · vermelho · verde-oliva / bordô · ouro · verde · lima · (secreto)
export const ROSTER = ['edgard', 'landim', 'laura', 'eneias', 'santana',
  'leo', 'van', 'kevin', 'michael', 'crm',
  'mundim', 'dede', 'dias', 'xablau'];
/** Lutadores secretos: carregados sempre (aparecem como adversário e online), mas só escolhíveis depois de destravados. */
export const SECRET = ['dener'];
/** Cenário usado quando o lutador não define o seu. */
export const DEFAULT_STAGE = 'office';
