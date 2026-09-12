/**
 * A tabela de preços.
 *
 * Os valores abaixo são **apenas o ponto de partida**, gravados no banco na
 * primeira abertura. Depois disso quem manda é o banco, e nada aqui é lido de
 * novo: preço fixo em código é a diferença entre um aplicativo que o dono usa
 * e um aplicativo que ele abandona no dia em que reajusta a lavagem simples.
 * A tela de preços edita cada célula, e é assim que o reajuste acontece.
 *
 * **Dinheiro é guardado em centavos**, sempre, em número inteiro. Em reais
 * fracionários, somar trinta lavagens de R$ 45,45 devolve um fechamento que
 * erra centavos, e um fechamento que erra centavos é um fechamento em que o
 * dono não confia. A conversão para reais acontece só na hora de mostrar.
 *
 * **A moto tem uma coluna só.** A tabela de referência dá um único preço para
 * moto, e existe um serviço próprio para ela. Em vez de repetir os R$ 15 em
 * quatro colunas que ninguém vende, a moto tem preço no serviço «Lavagem de
 * Moto» e traço no resto — que é o que a tela mostra e o que o operador vê.
 * O administrador pode preencher as outras células se quiser vendê-las.
 *
 * **«Outro» começa igual a Sedan.** É um palpite de meio de tabela, e está aqui
 * para que um veículo fora dos seis tipos não trave o atendimento à espera de
 * alguém editar a tabela. É ponto de partida como todo o resto.
 */

/** Em reais, como a tabela é lida por quem administra; convertida logo abaixo. */
const REAIS = {
  moto: { moto: 15 },
  hatch: { externa: 25, 'externa-interna': 40, 'externa-caixa': 50, completa: 55 },
  sedan: { externa: 30, 'externa-interna': 45, 'externa-caixa': 55, completa: 60 },
  suv: { externa: 35, 'externa-interna': 55, 'externa-caixa': 65, completa: 70 },
  picape: { externa: 40, 'externa-interna': 60, 'externa-caixa': 70, completa: 75 },
  van: { externa: 45, 'externa-interna': 70, 'externa-caixa': 80, completa: 85 },
  outro: { externa: 30, 'externa-interna': 45, 'externa-caixa': 55, completa: 60 },
};

/** A chave de uma célula da tabela. É também a chave do registro no banco. */
export function chave(tipo, servicoId) {
  return `${tipo}:${servicoId}`;
}

/** A tabela inicial, em centavos, na forma em que é gravada. */
export function tabelaPadrao() {
  const linhas = [];
  for (const [tipo, servicos] of Object.entries(REAIS)) {
    for (const [servicoId, valor] of Object.entries(servicos)) {
      linhas.push({ id: chave(tipo, servicoId), tipo, servicoId, valor: Math.round(valor * 100) });
    }
  }
  return linhas;
}

/**
 * O preço de um serviço para um tipo de veículo, em centavos.
 *
 * Devolve `null` quando a célula não tem preço — e `null` quer dizer «não
 * vendemos isso assim», não «custa zero». A tela usa a diferença: célula sem
 * preço não vira botão de serviço, e serviço sem preço nunca registra uma
 * lavagem de R$ 0,00 sem ninguém perceber.
 */
export function precoDe(tabela, tipo, servicoId) {
  const linha = tabela.find((p) => p.tipo === tipo && p.servicoId === servicoId);
  return linha && Number.isFinite(linha.valor) ? linha.valor : null;
}

/**
 * Os serviços vendáveis para um tipo de veículo, já com preço.
 *
 * O serviço personalizado entra sempre, com preço em aberto: é ele que garante
 * que nenhum atendimento pare por falta de célula preenchida.
 */
export function servicosDisponiveis(servicos, tabela, tipo) {
  return servicos
    .filter((s) => s.ativo !== false)
    .map((s) => ({ servico: s, valor: s.personalizado ? null : precoDe(tabela, tipo, s.id) }))
    .filter((linha) => linha.servico.personalizado || linha.valor !== null)
    .sort((a, b) => (a.servico.ordem ?? 99) - (b.servico.ordem ?? 99));
}
