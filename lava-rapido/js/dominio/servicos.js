/**
 * Os serviços oferecidos.
 *
 * Esta é a lista **inicial**, gravada no banco na primeira abertura. A partir
 * daí quem manda é o banco: o administrador acrescenta, renomeia e desativa
 * serviços pelas configurações, e nada aqui volta a ser lido. O código nunca
 * consulta esta lista para calcular nada — se consultasse, uma alteração feita
 * no aplicativo conviveria com um valor fixo escondido no código, e o preço da
 * tela não seria o preço cobrado.
 *
 * `personalizado: true` marca o serviço cujo preço é digitado na hora. É o
 * escape para o que não cabe em tabela — uma lavagem de motor, um carro muito
 * sujo, um combinado com o cliente — e existe para que ninguém precise mexer
 * na tabela de preços no meio do movimento.
 */

export const SERVICOS_PADRAO = [
  { id: 'externa', nome: 'Lavagem Externa', ordem: 1, ativo: true, personalizado: false },
  { id: 'externa-interna', nome: 'Lavagem Externa + Interna', ordem: 2, ativo: true, personalizado: false },
  { id: 'externa-caixa', nome: 'Lavagem Externa + Caixa de Roda', ordem: 3, ativo: true, personalizado: false },
  { id: 'completa', nome: 'Lavagem Externa + Interna + Caixa de Roda', ordem: 4, ativo: true, personalizado: false },
  { id: 'moto', nome: 'Lavagem de Moto', ordem: 5, ativo: true, personalizado: false },
  { id: 'personalizado', nome: 'Serviço Personalizado', ordem: 6, ativo: true, personalizado: true },
];

/**
 * Nome curto, para caber no cartão do movimento sem quebrar em três linhas.
 *
 * O «de» entra na poda junto com «Lavagem»: sem ele, «Lavagem de Moto» virava
 * «de Moto», e o cartão dizia «Biz · de Moto».
 */
export function nomeCurto(nome) {
  return String(nome ?? '')
    .replace(/^Lavagem\s+(de\s+)?/i, '')
    .replace(/\s*\+\s*Caixa de Roda/i, ' + Caixa')
    .trim();
}
