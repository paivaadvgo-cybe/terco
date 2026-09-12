/**
 * Os tipos de veículo.
 *
 * A lista é curta de propósito. Ela vira seis botões grandes numa tela só, sem
 * rolagem, e é tocada com o polegar de quem está com a outra mão na mangueira.
 * Cada tipo a mais é uma linha a mais na tabela de preços e um botão a menos
 * de tamanho confortável.
 *
 * Os identificadores não mudam: eles são a chave da tabela de preços e ficam
 * gravados em toda lavagem já registrada. Renomear `nome` é seguro; renomear
 * `id` quebra o histórico de quem já usa o aplicativo.
 */

export const TIPOS = [
  { id: 'hatch', nome: 'Hatch', icone: '🚗' },
  { id: 'sedan', nome: 'Sedan', icone: '🚘' },
  { id: 'suv', nome: 'SUV', icone: '🚙' },
  { id: 'picape', nome: 'Picape', icone: '🛻' },
  { id: 'moto', nome: 'Moto', icone: '🏍️' },
  { id: 'van', nome: 'Van', icone: '🚐' },
  { id: 'outro', nome: 'Outro', icone: '🚚' },
];

const PORID = new Map(TIPOS.map((t) => [t.id, t]));

export function tipo(id) {
  return PORID.get(id) ?? null;
}

/** O nome do tipo, ou o próprio identificador se ele sumir da lista. */
export function nomeDoTipo(id) {
  return PORID.get(id)?.nome ?? (id ? String(id) : '—');
}

export function iconeDoTipo(id) {
  return PORID.get(id)?.icone ?? '🚗';
}
