/**
 * A faixa de licença, no alto de toda tela.
 *
 * Não tem botão de fechar, e isso é a decisão do arquivo. Um aviso que se
 * fecha é fechado no primeiro dia e nunca mais lido — e aí o cliente descobre
 * a cobrança no dia em que o aplicativo para, que é o pior dia possível para
 * descobrir. Fixa, ela incomoda um pouco todos os dias e não surpreende
 * nenhum.
 *
 * O que ela nunca faz é atrapalhar quem está dirigindo: ocupa uma linha, fica
 * acima do conteúdo e não cobre mostrador nenhum. E some inteira no modo quadro
 * de instrumentos — com o celular preso ao painel, a tela é para o carro.
 */

import { el, botao } from './elementos.js';
import { ESTADOS } from '../licenca/estado.js';

const emDias = (n) => (n === 1 ? '1 dia' : `${n} dias`);

/** O texto de cada situação. Só isto muda entre um estado e outro. */
export function textoDaFaixa(situacao) {
  const { estado, diasRestantes } = situacao;
  switch (estado) {
    case ESTADOS.AVALIACAO:
      return diasRestantes <= 1
        ? 'A avaliação termina hoje. Fale com o desenvolvedor para continuar conectando no carro.'
        : `Avaliação: ${emDias(diasRestantes)} restantes. Fale com o desenvolvedor para ativar sua licença.`;
    case ESTADOS.AVALIACAO_ENCERRADA:
      return 'Avaliação encerrada — conexão ao carro bloqueada. As viagens gravadas, a exportação e o carro simulado seguem liberados.';
    case ESTADOS.ATIVA:
      return diasRestantes <= 1
        ? 'Sua licença vence hoje. Renove para não ficar sem o painel no carro.'
        : `Licença vence em ${emDias(diasRestantes)}.`;
    case ESTADOS.VENCIDA:
      return 'Licença vencida — conexão ao carro bloqueada. As viagens gravadas e a exportação seguem liberadas.';
    case ESTADOS.MIGRACAO:
      return 'Esta licença é de outro aparelho. Peça ao desenvolvedor a licença deste aqui.';
    case ESTADOS.RELOGIO:
      return 'A data deste aparelho está atrasada. Acerte o relógio para o aplicativo voltar ao normal.';
    case ESTADOS.INVALIDA:
      return 'O arquivo de licença deste aparelho não confere. Peça um novo ao desenvolvedor.';
    default:
      return '';
  }
}

const MARCAS = {
  [ESTADOS.AVALIACAO]: '⏳',
  [ESTADOS.AVALIACAO_ENCERRADA]: '🔒',
  [ESTADOS.ATIVA]: '🟡',
  [ESTADOS.VENCIDA]: '🔒',
  [ESTADOS.MIGRACAO]: '🔁',
  [ESTADOS.RELOGIO]: '🛑',
  [ESTADOS.INVALIDA]: '⚠️',
};

/** Devolve a faixa, ou `null` quando não há nada a dizer. */
export function faixaDeLicenca(situacao, irParaLicenca) {
  if (!situacao?.avisar) return null;
  const texto = textoDaFaixa(situacao);
  if (!texto) return null;

  return el('div', {
    classe: `faixa-licenca faixa-${situacao.severidade ?? 'atencao'}`,
    atributos: { role: 'status' },
  }, [
    el('span', { classe: 'faixa-marca', texto: MARCAS[situacao.estado] ?? '⏳', atributos: { 'aria-hidden': 'true' } }),
    el('p', { classe: 'faixa-texto', texto }),
    botao('Ver', irParaLicenca, { tipo: 'fantasma', classe: 'faixa-botao' }),
  ]);
}
