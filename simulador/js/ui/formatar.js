/**
 * Formatação para leitura humana.
 *
 * Vive na camada de interface, e não no motor, por um motivo que é regra do
 * projeto: o motor calcula em precisão dupla do começo ao fim, como a
 * planilha, e o arredondamento acontece só aqui, na borda. Se `roundMoney`
 * entrasse num laço de cálculo, o resultado deixaria de bater com o Excel.
 */

import { roundMoney } from './../engine/arredondamento.js';

const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const NUMERO = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function moeda(valor) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  const arredondado = roundMoney(valor);
  // Um saldo residual de −1e-11 arredonda para zero negativo, e o Intl o
  // escreve como "-R$ 0,00" — que parece defeito, e não é. Soma-se zero para
  // que o sinal desapareça junto com a diferença.
  return MOEDA.format(arredondado === 0 ? 0 : arredondado);
}

/** Sem o símbolo, para tabelas onde ele se repetiria em cada célula. */
export function numero(valor, casas = 2) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casas, maximumFractionDigits: casas,
  }).format(valor === 0 ? 0 : valor);
}

const SUFIXO = {
  mensal: 'a.m.', bimestral: 'a.b.', trimestral: 'a.t.', semestral: 'a.s.', anual: 'a.a.',
};

/** Uma taxa nunca é exibida sem a unidade — é o que separa 2,17% de 0,0217. */
export function taxa(t, casas = 4) {
  if (!t || !Number.isFinite(t.valor)) return '—';
  return `${numero(t.valor * 100, casas)}% ${SUFIXO[t.unidade] ?? t.unidade}`;
}

/** Taxas derivadas, como a TIR, vêm como número solto e são sempre mensais. */
export function percentual(valor, casas = 4, sufixo = 'a.m.') {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return `${numero(valor * 100, casas)}%${sufixo ? ` ${sufixo}` : ''}`;
}

export function data(texto) {
  if (!texto) return '—';
  const [ano, mes, dia] = texto.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

export function dataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function meses(n) {
  if (!Number.isFinite(n)) return '—';
  return n === 1 ? '1 mês' : `${n} meses`;
}

/** Deixa só o número, com ponto decimal: "R$ 60.000,00" vira "60000.00". */
function normalizar(texto) {
  if (!texto) return '';
  return String(texto).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
}

/** Lê um campo de moeda aceitando "60.000,00", "60000" ou "R$ 60.000,00". */
export function lerValor(texto) {
  if (typeof texto === 'number') return texto;
  const limpo = normalizar(texto);
  return limpo === '' ? NaN : Number.parseFloat(limpo);
}

/**
 * Lê um campo de percentual: "13,75" vira 0,1375.
 *
 * O deslocamento da vírgula é feito na notação, e não dividindo por cem:
 * `1.07 / 100` dá 0,010700000000000001, enquanto `1.07e-2` dá exatamente o
 * double mais próximo de 0,0107. A diferença é de 10⁻¹⁸ e não muda parcela
 * nenhuma, mas o número guardado passa a ser o que a pessoa digitou, e não
 * um vizinho dele.
 */
export function lerPercentual(texto) {
  const limpo = normalizar(texto);
  if (limpo === '' || !Number.isFinite(Number(limpo))) return NaN;
  return Number(`${limpo}e-2`);
}
