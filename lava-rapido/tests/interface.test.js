/**
 * Testes da camada de interface.
 *
 * Só o que pode ser verificado sem navegador: formatação de dinheiro, leitura
 * do que foi digitado e geração de CSV. São funções pequenas, e é por isso que
 * erram em silêncio — um separador de milhar lido como decimal transforma mil
 * duzentos e cinquenta reais em um e vinte e cinco, e o dia fecha com um número
 * plausível e errado.
 *
 * O comportamento da tela em si é verificado dirigindo o aplicativo num
 * navegador de verdade; o README explica como. Não virou teste do repositório
 * porque exigiria uma dependência de instalação, e este projeto não tem
 * nenhuma: `npm test` roda só com o Node.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { moeda, moedaCurta, lerValor, valorParaCampo, numero, plural } from '../js/ui/formatar.js';
import { campoCSV, numeroCSV, montarCSV, lavagensEmCSV, fechamentoEmCSV, nomeDoArquivo } from '../js/ui/csv.js';
import { lerRota, ABAS } from '../js/ui/navegacao.js';
import { extrairPlaca, disponivel, reconhecer } from '../js/servicos/reconhecimento-placa.js';
import { fechamentoDoDia } from '../js/dominio/caixa.js';

// O Intl separa o símbolo do número com espaço não separável (U+00A0). Escrever
// o literal errado faz o teste falhar por um caractere invisível.
const ESPACO = ' ';
const reais = (texto) => `R$${ESPACO}${texto}`;

/* -------------------------------------------------------------- formatação */

test('dinheiro sai em reais a partir de centavos inteiros', () => {
  assert.equal(moeda(4000), reais('40,00'));
  assert.equal(moeda(125000), reais('1.250,00'));
  assert.equal(moeda(0), reais('0,00'));
  assert.equal(moeda(4630), reais('46,30'));
});

test('valor ausente é travessão, e não R$ 0,00', () => {
  // Zero é um fato («não entrou nada»); travessão é a ausência de fato. Mostrar
  // R$ 0,00 no lugar de «—» faz parecer que houve serviço de graça.
  for (const vazio of [null, undefined, NaN, Infinity, 'abc']) {
    assert.equal(moeda(vazio), '—', `${vazio} deveria virar travessão`);
  }
});

test('o zero negativo não aparece com sinal', () => {
  assert.equal(moeda(-0), reais('0,00'));
  assert.equal(moeda(-4000), `-${reais('40,00')}`, 'prejuízo continua aparecendo com sinal');
});

test('a moeda curta tira o «,00» que só ocupa espaço no botão', () => {
  assert.equal(moedaCurta(4000), 'R$ 40');
  assert.equal(moedaCurta(4550), reais('45,50'), 'mas mantém os centavos quando existem');
});

test('o que foi digitado vira centavos, em todos os jeitos de digitar', () => {
  assert.equal(lerValor('40'), 4000);
  assert.equal(lerValor('40,00'), 4000);
  assert.equal(lerValor('40,5'), 4050);
  assert.equal(lerValor('R$ 40'), 4000);
  assert.equal(lerValor(' 45,50 '), 4550);
  assert.equal(lerValor('40.50'), 4050, 'ponto com duas casas é decimal');
  assert.equal(lerValor('1.250,00'), 125000, 'ponto de milhar com vírgula decimal');
  assert.equal(lerValor('1.250'), 125000, 'mil duzentos e cinquenta, e não um e vinte e cinco');
});

test('campo vazio não vira lavagem de graça', () => {
  for (const nada of ['', '   ', 'abc', null, undefined, '-5']) {
    assert.equal(lerValor(nada), null, `«${nada}» não pode virar zero`);
  }
});

test('centavos voltam ao campo de edição sem símbolo', () => {
  assert.equal(valorParaCampo(12345), '123,45');
  assert.equal(valorParaCampo(4000), '40,00');
});

test('números e plural', () => {
  assert.equal(numero(1.5), '1,5');
  assert.equal(plural(1, 'lavagem', 'lavagens'), '1 lavagem');
  assert.equal(plural(27, 'lavagem', 'lavagens'), '27 lavagens');
});

/* --------------------------------------------------------------------- CSV */

test('o CSV sai do jeito que o Excel brasileiro abre', () => {
  const texto = montarCSV([['Serviço', 'Valor'], ['Externa + Interna', numeroCSV(4000)]]);
  assert.ok(texto.startsWith('﻿'), 'sem BOM o Excel come os acentos');
  assert.ok(texto.includes('Serviço;Valor'), 'a coluna é separada por ponto e vírgula');
  assert.ok(texto.includes('40,00'), 'o decimal é vírgula');
  assert.ok(texto.endsWith('\r\n'));
});

test('campo com separador, aspas ou quebra vai entre aspas', () => {
  assert.equal(campoCSV('simples'), 'simples');
  assert.equal(campoCSV('Externa; Interna'), '"Externa; Interna"');
  assert.equal(campoCSV('aspas "no meio"'), '"aspas ""no meio"""');
  assert.equal(campoCSV(null), '');
});

test('o CSV de lavagens traz uma linha por lavagem, da mais antiga para a mais nova', () => {
  const base = { dia: '2026-09-12', tipo: 'hatch', modelo: 'Onix', servicoNome: 'Externa', valor: 2500, estado: 'pago' };
  const texto = lavagensEmCSV([
    { ...base, placa: 'DEF2E34', criadaEm: new Date(2026, 8, 12, 11).getTime(), pagamento: { forma: 'pix' } },
    { ...base, placa: 'ABC1D23', criadaEm: new Date(2026, 8, 12, 9).getTime(), pagamento: { forma: 'dinheiro' } },
  ]);
  const linhas = texto.trimEnd().split('\r\n');
  assert.ok(linhas[0].startsWith('﻿Data;Hora;Placa'));
  assert.ok(linhas[1].includes('ABC1D23'), 'a de 9h vem antes da de 11h');
  assert.ok(linhas[1].includes('09:00'));
  assert.ok(linhas[2].includes('DEF2E34'));
  assert.ok(texto.includes('Dinheiro') && texto.includes('PIX'));
});

test('a lavagem sem placa aparece no CSV como SEM PLACA', () => {
  const texto = lavagensEmCSV([{
    placa: null, dia: '2026-09-12', criadaEm: Date.now(), tipo: 'outro', servicoNome: 'Externa', valor: 3000, estado: 'pago',
  }]);
  assert.ok(texto.includes('SEM PLACA'));
});

test('o CSV do fechamento leva totais e movimento no mesmo arquivo', () => {
  const criadaEm = new Date(2026, 8, 12, 9).getTime();
  const lavagens = [
    { placa: 'ABC1D23', dia: '2026-09-12', criadaEm, tipo: 'hatch', modelo: 'Onix', servicoId: 'ei', servicoNome: 'Externa + Interna', valor: 4000, estado: 'pago', pagamento: { forma: 'pix', valor: 4000, em: criadaEm } },
    { placa: 'JKL4G56', dia: '2026-09-12', criadaEm, tipo: 'suv', servicoId: 'c', servicoNome: 'Completa', valor: 7000, estado: 'pendente' },
  ];
  const despesas = [{ descricao: 'Shampoo', valor: 5000, categoria: 'produto', dia: '2026-09-12' }];
  const resumo = fechamentoDoDia('2026-09-12', lavagens, despesas);
  const texto = fechamentoEmCSV(resumo, lavagens, despesas);

  assert.ok(texto.includes('Fechamento do dia;12/09/2026'));
  assert.ok(texto.includes('Faturamento;110,00'));
  assert.ok(texto.includes('Recebido;40,00'));
  assert.ok(texto.includes('Pendente;70,00'));
  assert.ok(texto.includes('Ticket médio;55,00'));
  assert.ok(texto.includes('PIX;40,00'));
  assert.ok(texto.includes('Total de despesas;;50,00'));
  assert.ok(texto.includes('Resultado operacional;;60,00'));
  assert.ok(texto.includes('Movimento do dia'));
  assert.ok(texto.includes('ABC1D23'));
  assert.equal((texto.match(/﻿/g) ?? []).length, 1, 'o BOM aparece uma vez só, no começo');
});

test('o nome do arquivo leva a data, para não sobrescrever o de ontem', () => {
  assert.equal(nomeDoArquivo('fechamento', '2026-09-12'), 'fechamento-2026-09-12.csv');
});

/* ----------------------------------------------------------------- rotas */

test('as rotas do endereço são lidas com os parâmetros', () => {
  assert.deepEqual(lerRota('#/nova'), { rota: 'nova', parametros: {} });
  assert.deepEqual(lerRota('#/nova?rapido=1'), { rota: 'nova', parametros: { rapido: '1' } });
  assert.deepEqual(lerRota('#/config?secao=precos'), { rota: 'config', parametros: { secao: 'precos' } });
  assert.equal(lerRota('').rota, 'inicio', 'sem endereço, abre o início');
  assert.equal(lerRota('#/').rota, 'inicio');
});

test('a barra de baixo tem as cinco seções do menu principal', () => {
  assert.deepEqual(ABAS.map((a) => a.rota), ['inicio', 'lavagens', 'caixa', 'relatorios', 'config']);
});

/* ------------------------------------------------------- leitura de placa */

test('a placa é achada no meio do texto reconhecido', () => {
  // O reconhecedor devolve tudo que enxerga: o «BRASIL» da placa Mercosul, o
  // adesivo da concessionária, a moldura. Só o que tem formato de placa vale.
  assert.equal(extrairPlaca(['BRASIL', 'ABC 1D23']), 'ABC1D23');
  assert.equal(extrairPlaca(['abc-1d23']), 'ABC1D23');
  assert.equal(extrairPlaca(['ABC1234']), 'ABC1234');
});

test('leitura que não casa com o formato vale como leitura falhada', () => {
  // Chutar uma placa errada é pior que não ler: vai para o histórico calada.
  assert.equal(extrairPlaca(['CONCESSIONÁRIA X', 'www.exemplo']), null);
  assert.equal(extrairPlaca([]), null);
});

test('sem recurso de leitura, o serviço diz que não tem — e não inventa', async () => {
  // No Node não existe TextDetector, como não existe no iPhone. A resposta
  // precisa ser a mesma: não deu, digite.
  assert.equal(disponivel(), false);
  const resultado = await reconhecer(null);
  assert.equal(resultado.ok, false);
  assert.ok(resultado.semRecurso);
  assert.match(resultado.motivo, /leitura automática/);
});
