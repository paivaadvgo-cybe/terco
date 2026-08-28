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
  moeda, numero, taxa, percentual, data, meses, lerValor, lerPercentual, textoDoAviso,
} from '../js/ui/formatar.js';
import { numeroCSV, campoCSV, cronogramaEmCSV, nomeDoArquivo } from '../js/ui/csv.js';
import { simular } from '../js/produtos/produtos.js';
import { acumular } from '../js/ui/comparador.js';

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


// ──────────────────────────────────────── séries acumuladas da comparação

test('acumular soma progressivamente, preservando a ordem', () => {
  assert.deepEqual(acumular([1, 2, 3, 4]), [1, 3, 6, 10]);
  assert.deepEqual(acumular([]), []);
  assert.deepEqual(acumular([0, 0, 5]), [0, 0, 5]);
});

// ─────────────────────────────────────────────────── avisos e exportação

test('o aviso do motor é recomposto com o número em reais', () => {
  // O motor escreve "432.81" com toFixed — ponto decimal, sem símbolo. Correto
  // num log, errado num documento em português.
  const aviso = { codigo: 'SALDO_RESIDUAL', valor: -432.8055, mensagem: 'Restou saldo devedor de -432.81…' };
  const texto = textoDoAviso(aviso);
  assert.match(texto, /R\$/);
  assert.ok(!texto.includes('432.81'), 'o ponto decimal não deve sobreviver');
  assert.match(texto, /ABERTO-07/);
  // Um aviso sem tratamento próprio cai na mensagem do motor, sem se perder.
  assert.equal(textoDoAviso({ codigo: 'OUTRO', mensagem: 'texto original' }), 'texto original');
});

test('o CSV usa ponto e vírgula, vírgula decimal e marca de ordem de byte', () => {
  // São as três coisas que o Excel em português precisa: sem elas as colunas
  // embaralham, os totais não somam e os acentos quebram.
  const s = simular({
    produto: 'giro', linha: 'GoiásFomento Giro',
    valorSolicitado: 60000, prazo: 6, carencia: 2, dataProposta: '2026-08-06',
  });
  const csv = cronogramaEmCSV(s);
  assert.equal(csv.charCodeAt(0), 0xFEFF, 'sem a marca de ordem o Excel abre em Latin-1');
  assert.ok(csv.includes('\r\n'), 'fim de linha do Windows');

  const linhas = csv.slice(1).split('\r\n');
  const cabecalho = linhas.findIndex((l) => l.startsWith('Parcela;'));
  assert.ok(cabecalho > 0, 'o cronograma vem depois da identificação');
  assert.equal(linhas.length - cabecalho - 2, 6, 'uma linha por parcela');

  const primeira = linhas[cabecalho + 1].split(';');
  assert.equal(primeira[0], '1');
  assert.match(primeira[4], /^\d+,\d{2}$/, 'decimal com vírgula, sem separador de milhar');
});

test('o CSV escapa o que precisa e só o que precisa', () => {
  assert.equal(campoCSV('Pequeno Médio'), 'Pequeno Médio');
  assert.equal(campoCSV('Pequeno; Médio'), '"Pequeno; Médio"');
  assert.equal(campoCSV('linha "VIP"'), '"linha ""VIP"""');
  assert.equal(campoCSV('com\nquebra'), '"com\nquebra"');
  assert.equal(campoCSV(null), '');
});

test('numeroCSV entrega número, não texto', () => {
  assert.equal(numeroCSV(1234.5), '1234,50');
  assert.equal(numeroCSV(0), '0,00');
  assert.equal(numeroCSV(0.0165, 6), '0,016500');
  assert.equal(numeroCSV(null), '');
  assert.equal(numeroCSV(Infinity), '');
});

test('o nome do arquivo sobrevive a qualquer sistema', () => {
  const s = simular({
    produto: 'giro', linha: 'GoiásFomento Giro - IMCF',
    valorSolicitado: 10000, prazo: 12, carencia: 0, dataProposta: '2026-08-06',
  });
  const nome = nomeDoArquivo(s);
  assert.match(nome, /^[a-z0-9-]+\.csv$/, `"${nome}" tem caractere que não deveria`);
  assert.ok(nome.includes('imcf'));
});
