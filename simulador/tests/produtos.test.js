/**
 * Testes dos produtos.
 *
 * Duas camadas. A primeira varre **todas** as linhas de todas as famílias e
 * exercita as bordas de cada uma — limite, prazo, carência —, porque são
 * quarenta e uma linhas e conferir só as três de sempre deixaria o resto sem
 * cobertura. A segunda verifica o que distingue cada família das outras: o
 * bônus por fator contra o tabelado, o município do FCO, o porte do FINEP, a
 * carência capitalizada do Produtor, a TAC de Giro Puro.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRODUTOS, listarProdutos, listarLinhas, obterLinha, simular, VERSAO_DO_MOTOR,
} from '../js/produtos/produtos.js';
import { PARAMETROS } from '../js/data/parametros.js';
import { VIGENTES } from '../js/data/parametros-vigentes.js';
import { ErroDeSimulacao } from '../js/engine/erros.js';

const perto = (obtido, esperado, rotulo, tolerancia = 1e-9) => assert.ok(
  Math.abs(obtido - esperado) <= tolerancia,
  `${rotulo}: obtido ${obtido}, esperado ${esperado}`,
);

/** Uma operação válida para a linha, no meio de todas as faixas. */
function operacaoDe(produto, linha, extra = {}) {
  const prazo = Math.min(linha.prazoMaximo ?? 24, 24);
  const carencia = Math.min(linha.carenciaMaxima ?? 0, 3, prazo - 1);
  const valor = Math.max(Math.min(linha.limite ?? 50000, 50000), linha.valorMinimo ?? 0);
  return {
    produto, linha: linha.nome,
    valorSolicitado: valor, prazo, carencia,
    dataProposta: '2026-08-06',
    ...(PRODUTOS[produto].regras.indexador ? { valorDoIndexador: 0.1 } : {}),
    ...(PRODUTOS[produto].regras.exigePorte ? { porte: 1 } : {}),
    ...extra,
  };
}

const familias = listarProdutos().map((p) => p.codigo);
const opcoesDe = (codigo) => (PRODUTOS[codigo].regras.exigePorte ? { porte: 1 } : {});

// ──────────────────────────────────────────────── varredura de todas as linhas

test('todas as famílias declaram linhas, e nenhuma fica sem parâmetro', () => {
  assert.equal(familias.length, 9);
  let total = 0;
  for (const codigo of familias) {
    const linhas = listarLinhas(codigo, opcoesDe(codigo));
    assert.ok(linhas.length > 0, `${codigo} não tem linha nenhuma`);
    for (const l of linhas) {
      assert.ok(l.nome && l.nome.trim(), `${codigo}: linha sem nome`);
      assert.ok(l.prazoMaximo > 0, `${codigo}/${l.nome}: prazo máximo ausente`);
      assert.ok(l.limite > 0, `${codigo}/${l.nome}: limite ausente`);
      if (!l.emAberto) {
        assert.ok(l.taxaCheia || l.porMunicipio, `${codigo}/${l.nome}: sem taxa`);
      }
    }
    total += linhas.length;
  }
  // Trinta e oito, contando o FINEP uma vez só: os três nomes dele existem em
  // dois portes, com taxas diferentes, e a varredura usa o porte I.
  assert.equal(total, 38, 'trinta e oito linhas ao todo');
  assert.equal(
    familias.reduce((n, c) => n + PRODUTOS[c].linhasEmAberto.length, 0), 3,
    'três delas não podem ser simuladas: duas com #REF! e uma sem taxa na tabela',
  );
});

test('cada linha declarada em aberto corresponde a uma linha que existe', () => {
  // Sem isto, uma linha bloqueada por engano de digitação passaria despercebida
  // e a operação seria simulada com taxa de outra linha.
  for (const codigo of familias) {
    const nomes = listarLinhas(codigo, opcoesDe(codigo)).map((l) => l.nome);
    for (const emAberto of PRODUTOS[codigo].linhasEmAberto) {
      assert.ok(nomes.includes(emAberto.nome),
        `${codigo}: a linha em aberto "${emAberto.nome}" não existe na família`);
    }
  }
});

test('o valor no limite passa e um centavo acima é recusado', () => {
  for (const codigo of familias) {
    for (const linha of listarLinhas(codigo, opcoesDe(codigo))) {
      if (linha.emAberto) continue;
      const rotulo = `${codigo}/${linha.nome}`;
      const base = operacaoDe(codigo, linha);

      assert.doesNotThrow(
        () => simular({ ...base, valorSolicitado: linha.limite }),
        `${rotulo}: o valor no limite deveria passar`,
      );
      assert.throws(
        () => simular({ ...base, valorSolicitado: linha.limite + 0.01 }),
        (e) => e instanceof ErroDeSimulacao && e.codigo === 'VALOR_ACIMA_DO_LIMITE',
        `${rotulo}: um centavo acima do limite deveria recusar`,
      );
    }
  }
});

test('o prazo no teto passa e um mês acima é recusado', () => {
  for (const codigo of familias) {
    for (const linha of listarLinhas(codigo, opcoesDe(codigo))) {
      if (linha.emAberto) continue;
      const rotulo = `${codigo}/${linha.nome}`;
      const base = operacaoDe(codigo, linha);

      assert.doesNotThrow(
        () => simular({ ...base, prazo: linha.prazoMaximo, carencia: 0 }),
        `${rotulo}: o prazo no teto deveria passar`,
      );
      assert.throws(
        () => simular({ ...base, prazo: linha.prazoMaximo + 1, carencia: 0 }),
        (e) => e.codigo === 'PRAZO_INVALIDO',
        `${rotulo}: um mês além do prazo deveria recusar`,
      );
    }
  }
});

test('a carência no teto passa e um mês acima é recusada', () => {
  for (const codigo of familias) {
    for (const linha of listarLinhas(codigo, opcoesDe(codigo))) {
      if (linha.emAberto) continue;
      const rotulo = `${codigo}/${linha.nome}`;
      const base = operacaoDe(codigo, linha);
      const carencia = linha.carenciaMaxima;

      assert.doesNotThrow(
        () => simular({ ...base, prazo: linha.prazoMaximo, carencia }),
        `${rotulo}: a carência no teto deveria passar`,
      );
      assert.throws(
        () => simular({ ...base, prazo: linha.prazoMaximo, carencia: carencia + 1 }),
        (e) => e.codigo === 'CARENCIA_INVALIDA',
        `${rotulo}: um mês além da carência deveria recusar`,
      );
    }
  }
});

test('toda simulação válida devolve números finitos e o modelo do item 26', () => {
  const campos = [
    'produto', 'linha', 'sistemaAmortizacao', 'valorSolicitado', 'valorFinanciado',
    'valorLiquido', 'taxaCheia', 'taxaBonus', 'taxaAplicada', 'prazo', 'carencia',
    'tac', 'iof', 'primeiraParcela', 'ultimaParcela', 'totalJuros', 'totalAmortizacao',
    'totalEncargos', 'totalPago', 'tirComBonus', 'tirSemBonus', 'cronograma',
    'parametrosUtilizados', 'versaoParametros', 'versaoMotor', 'dataSimulacao',
  ];
  for (const codigo of familias) {
    for (const linha of listarLinhas(codigo, opcoesDe(codigo))) {
      if (linha.emAberto) continue;
      const s = simular(operacaoDe(codigo, linha));
      const rotulo = `${codigo}/${linha.nome}`;
      for (const campo of campos) {
        assert.ok(campo in s, `${rotulo}: falta o campo ${campo}`);
      }
      for (const campo of ['valorFinanciado', 'tac', 'iof', 'totalPago', 'totalJuros']) {
        assert.ok(Number.isFinite(s[campo]), `${rotulo}: ${campo} = ${s[campo]}`);
      }
      // Contra o conjunto vigente, que é o que `simular` usa por padrão — e não
// contra a base da planilha, que segue congelada enquanto a administração
// publica versões novas.
      assert.equal(s.versaoParametros, VIGENTES.metadados.versao);
      assert.equal(s.versaoMotor, VERSAO_DO_MOTOR);
      assert.equal(s.cronograma.length, s.prazo);
      assert.ok(s.valorFinanciado >= s.valorSolicitado, `${rotulo}: financiado menor que o pedido`);
    }
  }
});

// ────────────────────────────────────────────── o que distingue cada família

test('o bônus por fator vale em Giro e Investimento, e reproduz a tabela', () => {
  for (const codigo of ['giro', 'investimento']) {
    assert.equal(PRODUTOS[codigo].regras.bonus.tipo, 'fator');
    for (const linha of listarLinhas(codigo)) {
      perto(linha.taxaCheia.valor * 0.77, linha.taxaBonus.valor,
        `${codigo}/${linha.nome}: cheia × 0,77 deveria dar a tabelada`, 1e-15);
    }
  }
});

test('em Transportes o bônus é tabelado, e não é 0,77 da cheia', () => {
  assert.equal(PRODUTOS.transportes.regras.bonus.tipo, 'tabelado');
  const taxi = obterLinha('transportes', 'GoiásFomento Taxi');
  assert.equal(taxi.taxaCheia.valor, 0.0219);
  assert.equal(taxi.taxaBonus.valor, 0.0159);
  // 2,19 × 0,77 = 1,686 — perto o bastante para enganar, longe o bastante
  // para errar por seis pontos-base ao mês.
  assert.ok(Math.abs(taxi.taxaCheia.valor * 0.77 - taxi.taxaBonus.valor) > 0.0009);

  const s = simular(operacaoDe('transportes', taxi));
  assert.equal(s.taxaAplicada.valor, 0.0159, 'a simulação usa a tabelada, não o fator');
});

test('o município muda a taxa do FCO', () => {
  const linha = obterLinha('fco', 'FCO Empresarial - (Pequeno)');
  assert.equal(linha.porMunicipio.prioritario.taxaCheia.valor, 0.088992);
  assert.equal(linha.porMunicipio.naoPrioritario.taxaCheia.valor, 0.1277);

  const base = operacaoDe('fco', linha);
  const prioritario = simular({ ...base, municipioPrioritario: true });
  const naoPrioritario = simular({ ...base, municipioPrioritario: false });

  assert.equal(prioritario.taxaCheia.valor, 0.088992);
  assert.equal(naoPrioritario.taxaCheia.valor, 0.1277);
  assert.ok(naoPrioritario.totalJuros > prioritario.totalJuros,
    'o município não prioritário paga mais juros');
});

test('o porte muda a taxa do FINEP, e sem ele o nome da linha é ambíguo', () => {
  const porte1 = obterLinha('finep', 'FINEP - Inovacred', { porte: 1 });
  const porte3 = obterLinha('finep', 'FINEP - Inovacred', { porte: 3 });
  assert.equal(porte1.taxaCheia.valor, 0.042);
  assert.equal(porte3.taxaCheia.valor, 0.055);

  assert.throws(() => obterLinha('finep', 'FINEP - Inovacred'),
    (e) => e.codigo === 'PARAMETRO_INCOMPATIVEL', 'sem porte, recusa em vez de escolher sozinho');
  assert.throws(() => listarLinhas('finep', { porte: 9 }),
    (e) => e.codigo === 'PARAMETRO_INCOMPATIVEL');
});

test('a carência do Produtor Fruticultura capitaliza; a da outra linha, não', () => {
  const fruticultura = obterLinha('produtorEmpreendedor', 'Produtor Empreendedor Fruticultura');
  const comum = obterLinha('produtorEmpreendedor', 'Produtor Empreendedor');

  const a = simular({ ...operacaoDe('produtorEmpreendedor', fruticultura), prazo: 48, carencia: 18 });
  const b = simular({ ...operacaoDe('produtorEmpreendedor', comum), prazo: 48, carencia: 18 });

  assert.equal(a.parametrosUtilizados.premissas.tratamentoCarencia, 'capitalizados');
  assert.equal(b.parametrosUtilizados.premissas.tratamentoCarencia, 'pagos');
  assert.equal(a.cronograma[0].prestacao, 0, 'nada é pago na carência capitalizada');
  assert.ok(b.cronograma[0].prestacao > 0, 'na outra linha o juro da carência é cobrado');
  assert.ok(a.cronograma[17].saldoFinal > a.valorFinanciado, 'o saldo cresceu durante a carência');
});

test('só Giro Puro usa a variante da TAC com o fator 1,015', () => {
  assert.equal(PRODUTOS.giro.regras.varianteTAC, 'giroPuro');
  for (const codigo of familias.filter((c) => c !== 'giro')) {
    assert.equal(PRODUTOS[codigo].regras.varianteTAC, 'padrao', `${codigo} não deveria usar a variante`);
  }
  // R$ 60.000 financiada: 1.218,00 em Giro Puro, 1.200,00 nas demais.
  const giro = simular({ ...operacaoDe('giro', obterLinha('giro', 'GoiásFomento Giro')), valorSolicitado: 60000 });
  assert.equal(giro.tac, 1217.9999999999998, "'Linhas Giro Puro'!F15");
});

test('as famílias indexadas exigem o valor do indexador', () => {
  for (const codigo of ['fungetur', 'finep']) {
    const linha = listarLinhas(codigo, opcoesDe(codigo))[0];
    const base = operacaoDe(codigo, linha);
    delete base.valorDoIndexador;
    assert.throws(() => simular(base), (e) => e.codigo === 'INDEXADOR_NAO_INFORMADO',
      `${codigo} deveria exigir o indexador`);
  }
  // E as famílias sem indexador não pedem nada.
  const giro = listarLinhas('giro')[0];
  assert.doesNotThrow(() => simular(operacaoDe('giro', giro)));
});

test('as linhas sem regra recusam em vez de devolver número', () => {
  const bloqueadas = [
    // ABERTO-12: a célula que selecionaria a taxa contém #REF!.
    ['fco', 'FCO PNMPO Giro Dissociado', 'REGRA_EM_ABERTO'],
    ['fco', 'FCO Mini e Micro Geração de Energia', 'REGRA_EM_ABERTO'],
    // ABERTO-14: a linha existe na tabela oficial, com prazo, carência e
    // limite, mas as duas células de taxa estão vazias.
    ['microcredito', 'GoiásFomento Microcrédito Produtivo - Capital de Giro', 'TAXA_NAO_PARAMETRIZADA'],
  ];
  for (const [produto, nome, codigo] of bloqueadas) {
    const linha = obterLinha(produto, nome);
    assert.ok(linha.emAberto, `${nome} deveria estar marcada em aberto`);
    assert.throws(() => simular(operacaoDe(produto, linha)),
      (e) => e instanceof ErroDeSimulacao && e.codigo === codigo,
      `${nome} deveria recusar com ${codigo}`);
  }
});

test('a base da amortização segue o perfil da família', () => {
  // Cinco abas trocam de base na parcela 13 (ABERTO-07); Giro Puro não.
  assert.equal(PRODUTOS.giro.regras.baseAmortizacao, 'valorFinanciado');
  assert.equal(PRODUTOS.investimento.regras.baseAmortizacao, 'planilha');
  assert.equal(PRODUTOS.transportes.regras.baseAmortizacao, 'planilha');
  assert.equal(PRODUTOS.fungetur.regras.baseAmortizacao, 'valorFinanciado');

  const s = simular({
    ...operacaoDe('investimento', obterLinha('investimento', 'GoiásFomento Investimento')),
    valorSolicitado: 100000, prazo: 60, carencia: 6,
  });
  assert.ok(Math.abs(s.saldoResidual) > 1,
    'com a base da planilha, sobra saldo — é ABERTO-07 reproduzido');
  assert.equal(s.avisos[0].codigo, 'SALDO_RESIDUAL');
});

test('o PRICE fecha o saldo mesmo nas famílias que o SAC deixa com resíduo', () => {
  const base = {
    ...operacaoDe('investimento', obterLinha('investimento', 'GoiásFomento Investimento')),
    valorSolicitado: 100000, prazo: 60, carencia: 6,
  };
  const price = simular({ ...base, sistemaAmortizacao: 'PRICE' });
  assert.equal(price.sistemaAmortizacao, 'PRICE');
  assert.ok(Math.abs(price.saldoResidual) < 1e-6);
  const prestacoes = new Set(price.cronograma.filter((p) => p.amortizacao > 0).map((p) => p.prestacao.toFixed(6)));
  assert.equal(prestacoes.size, 1, 'a prestação do PRICE é constante');
});

test('a TIR sem bônus é maior que a com bônus, quando há bônus', () => {
  const s = simular(operacaoDe('giro', obterLinha('giro', 'GoiásFomento Giro')));
  assert.ok(s.tirSemBonus > s.tirComBonus);
  // Sem bônus, as duas coincidem.
  const semBonus = simular({ ...operacaoDe('fungetur', listarLinhas('fungetur')[0]) });
  assert.equal(semBonus.tirSemBonus, semBonus.tirComBonus);
});

test('produto e linha inexistentes recusam com a lista do que existe', () => {
  assert.throws(() => simular({ produto: 'inexistente', linha: 'x', valorSolicitado: 1000, prazo: 12, carencia: 0 }),
    (e) => e.codigo === 'PARAMETRO_INCOMPATIVEL' && /Conhecidos/.test(e.message));
  assert.throws(() => obterLinha('giro', 'Linha Que Não Existe'),
    (e) => e.codigo === 'PARAMETRO_INCOMPATIVEL');
});
