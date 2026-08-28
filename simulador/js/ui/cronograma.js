/**
 * Tabela do cronograma.
 *
 * Até duzentas e quarenta linhas, com sete colunas. Em tela estreita a tabela
 * rola dentro do próprio quadro, e não empurra a página para o lado — é a
 * diferença entre um aplicativo usável no celular e um que exige o computador.
 */

import { criar } from './formulario.js';
import { moeda, data } from './formatar.js';

const COLUNAS = [
  ['#', (p) => String(p.parcela), 'num'],
  ['Vencimento', (p) => data(p.dataVencimento), ''],
  ['Regime', (p) => (p.regime === 'carencia' ? 'Carência' : 'Amortização'), ''],
  ['Saldo inicial', (p) => moeda(p.saldoInicial), 'num'],
  ['Juros', (p) => moeda(p.juros + p.jurosIndexador), 'num'],
  ['Amortização', (p) => moeda(p.amortizacao), 'num'],
  ['Prestação', (p) => moeda(p.prestacao), 'num'],
  ['Saldo final', (p) => moeda(p.saldoFinal), 'num'],
];

export function desenharCronograma(raiz, s) {
  raiz.replaceChildren();

  raiz.append(criar('div', { class: 'barra-cronograma' }, [
    criar('p', {}, [`${s.cronograma.length} parcelas · total pago ${moeda(s.totalPago)}`]),
  ]));

  const cabecalho = criar('tr', {}, COLUNAS.map(([rotulo, , classe]) => criar('th', { class: classe, texto: rotulo })));
  const corpo = criar('tbody', {}, s.cronograma.map((p) => criar('tr', {
    class: p.regime === 'carencia' ? 'em-carencia' : '',
  }, COLUNAS.map(([, ler, classe]) => criar('td', { class: classe, texto: ler(p) })))));

  const rodape = criar('tfoot', {}, [
    criar('tr', {}, [
      criar('th', { colspan: 4, texto: 'Totais' }),
      criar('td', { class: 'num', texto: moeda(s.totalJuros) }),
      criar('td', { class: 'num', texto: moeda(s.totalAmortizacao) }),
      criar('td', { class: 'num', texto: moeda(s.totalPago) }),
      criar('td', { class: 'num', texto: moeda(s.saldoResidual) }),
    ]),
  ]);

  raiz.append(criar('div', { class: 'rolagem-tabela' }, [
    criar('table', { class: 'cronograma' }, [criar('thead', {}, [cabecalho]), corpo, rodape]),
  ]));
}
