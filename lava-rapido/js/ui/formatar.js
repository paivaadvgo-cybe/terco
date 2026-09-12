/**
 * Números para a tela, e da tela para o número.
 *
 * O aplicativo guarda dinheiro em **centavos inteiros**. A conversão acontece
 * aqui e em nenhum outro lugar: é a única forma de garantir que o valor
 * mostrado, o valor somado e o valor gravado são o mesmo valor.
 *
 * A leitura do que foi digitado é a metade perigosa. Quem digita está com
 * pressa e escreve `40`, `40,00`, `R$ 40`, `40.00` e às vezes `1.250,00`. Ler
 * um separador de milhar como decimal transforma mil duzentos e cinquenta em
 * um e vinte e cinco, e o fechamento sai com um número plausível e errado.
 */

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NUMERO = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/** Centavos para `R$ 40,00`. Sem valor, travessão — nunca `R$ 0,00` por engano. */
export function moeda(centavos) {
  if (centavos === null || centavos === undefined || !Number.isFinite(Number(centavos))) return '—';
  // O zero negativo de uma subtração exata apareceria como «-R$ 0,00».
  const valor = Math.round(Number(centavos)) / 100;
  return MOEDA.format(valor === 0 ? 0 : valor);
}

/** `R$ 40` — para os botões, onde o «,00» só ocupa espaço. */
export function moedaCurta(centavos) {
  if (centavos === null || centavos === undefined || !Number.isFinite(Number(centavos))) return '—';
  const valor = Math.round(Number(centavos));
  return valor % 100 === 0 ? `R$ ${valor / 100}` : moeda(valor);
}

export function numero(valor, casas = 1) {
  if (!Number.isFinite(Number(valor))) return '—';
  return casas === 1 ? NUMERO.format(Number(valor))
    : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas }).format(Number(valor));
}

/**
 * O que foi digitado, em centavos.
 *
 * Devolve `null` para o que não é número — e `null` não é zero: um campo de
 * valor vazio não pode virar uma lavagem de graça.
 */
export function lerValor(texto) {
  if (texto === null || texto === undefined) return null;
  let limpo = String(texto).replace(/\s|R\$|r\$/g, '').trim();
  if (limpo === '') return null;

  if (limpo.includes(',')) {
    // Vírgula é o decimal; ponto só pode ser milhar.
    limpo = limpo.replace(/\./g, '').replace(',', '.');
  } else if (limpo.includes('.')) {
    const depois = limpo.length - limpo.lastIndexOf('.') - 1;
    // `1.250` é mil duzentos e cinquenta; `40.50` é quarenta e cinquenta.
    limpo = depois === 1 || depois === 2 ? limpo : limpo.replace(/\./g, '');
  }

  const valor = Number(limpo);
  if (!Number.isFinite(valor) || valor < 0) return null;
  return Math.round(valor * 100);
}

/** Centavos no campo de edição: `40,00`, sem símbolo. */
export function valorParaCampo(centavos) {
  if (!Number.isFinite(Number(centavos))) return '';
  return (Math.round(Number(centavos)) / 100).toFixed(2).replace('.', ',');
}

/** `27 lavagens`, `1 lavagem` — plural sem gambiarra de `(s)`. */
export function plural(quantidade, singular, plural_) {
  return `${quantidade} ${quantidade === 1 ? singular : plural_}`;
}
