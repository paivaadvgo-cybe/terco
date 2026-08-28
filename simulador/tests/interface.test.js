/**
 * Testes da camada de interface.
 *
 * Só o que pode ser testado sem navegador: formatação e leitura de campo.
 * São funções pequenas e é justamente por isso que erram sem chamar atenção —
 * um separador de milhar lido como decimal transforma sessenta mil em sessenta,
 * e o cálculo segue adiante com um número plausível.
 *
 * O comportamento da tela em si é verificado dirigindo o aplicativo num
 * navegador de verdade; o README explica como. Ele não entra aqui porque
 * exigiria uma dependência de build, e o simulador não tem nenhuma.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  moeda, numero, taxa, percentual, data, meses, lerValor, lerPercentual,
} from '../js/ui/formatar.js';

// O Intl separa o símbolo do número com espaço não separável (U+00A0), e não
// com o espaço comum. Escrever o literal errado faz o teste falhar por um
// caractere invisível — daí a constante, que deixa a diferença à vista.
const ESPACO = '\u00A0';
const reais = (texto) => `R$${ESPACO}${texto}`;

test('moeda formata em reais e trata o que não é número', () => {
  assert.equal(moeda(62149.635), reais('62.149,64'));
  assert.equal(moeda(0), reais('0,00'));
  assert.equal(moeda(1234567.891), reais('1.234.567,89'));
  for (const vazio of [null, undefined, NaN, Infinity]) {
    assert.equal(moeda(vazio), '—', `${vazio} deveria virar travessão`);
  }
});

test('o zero negativo do saldo residual não aparece com sinal', () => {
  // Um SAC bem formado fecha em algo como −1e-11. Escrito como "-R$ 0,00",
  // isso parece defeito de cálculo para quem lê.
  assert.equal(moeda(-1e-11), reais('0,00'));
  assert.equal(moeda(-0), reais('0,00'));
  // Um resíduo de verdade continua aparecendo, com sinal e tudo.
  assert.equal(moeda(-389.72), `-${reais('389,72')}`);
});

test('a taxa nunca é exibida sem a unidade', () => {
  assert.equal(taxa({ valor: 0.0217, unidade: 'mensal' }), '2,1700% a.m.');
  assert.equal(taxa({ valor: 0.10267, unidade: 'anual' }), '10,2670% a.a.');
  assert.equal(taxa({ valor: 0.05, unidade: 'semestral' }), '5,0000% a.s.');
  assert.equal(taxa(null), '—');
});

test('percentual serve para as taxas derivadas, como a TIR', () => {
  assert.equal(percentual(0.017859866497962784), '1,7860% a.m.');
  assert.equal(percentual(0.0165, 2), '1,65% a.m.');
  assert.equal(percentual(null), '—');
});

test('numero e meses', () => {
  assert.equal(numero(1111.111111), '1.111,11');
  assert.equal(numero(0.0041, 4), '0,0041');
  assert.equal(meses(1), '1 mês');
  assert.equal(meses(60), '60 meses');
  assert.equal(meses(0), '0 meses');
});

test('data vira o formato brasileiro', () => {
  assert.equal(data('2026-08-06'), '06/08/2026');
  assert.equal(data('2026-08-06T00:00:00.000Z'), '06/08/2026');
  assert.equal(data(null), '—');
});

test('lerValor entende o que se digita num campo de dinheiro', () => {
  // O separador de milhar lido como decimal transformaria sessenta mil em
  // sessenta, e a simulação seguiria com um número plausível.
  assert.equal(lerValor('60.000,00'), 60000);
  assert.equal(lerValor('R$ 1.234,56'), 1234.56);
  assert.equal(lerValor('1234,56'), 1234.56);
  assert.equal(lerValor('60000'), 60000);
  assert.equal(lerValor(60000), 60000);
  assert.ok(Number.isNaN(lerValor('')));
  assert.ok(Number.isNaN(lerValor(null)));
});

test('lerPercentual converte pontos percentuais em decimal', () => {
  assert.equal(lerPercentual('13,75'), 0.1375);
  assert.equal(lerPercentual('1,07'), 0.0107);
  assert.equal(lerPercentual('0'), 0);
  assert.ok(Number.isNaN(lerPercentual('')));
});

test('ida e volta entre campo e valor preserva o número', () => {
  for (const valor of [1, 100, 3000.01, 21000, 62149.63, 2000000]) {
    const texto = valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    assert.equal(lerValor(texto), valor, `ida e volta de ${valor}`);
  }
});
