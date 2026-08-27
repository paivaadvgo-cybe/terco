/**
 * Produtos: as linhas de crédito e a simulação completa.
 *
 * Cada família tem um perfil que declara as suas regras — a convenção de taxa,
 * a variante da TAC, a base da amortização, o tratamento da carência, a forma
 * do bônus, a da alienação, o indexador. As linhas em si vêm dos parâmetros
 * extraídos da planilha; o perfil traz o que a tabela de parâmetros não diz.
 *
 * Nenhuma regra financeira nasce aqui. Este módulo compõe o que os motores e
 * os módulos de encargo já sabem fazer, na ordem que a planilha usa.
 */

import { erro } from './../engine/erros.js';
import { criarTaxa, aplicarBonus } from './../engine/juros.js';
import { gerarCronogramaSAC } from './../engine/sac.js';
import { gerarCronogramaPRICE } from './../engine/price.js';
import { calcularTIR, montarFluxo } from './../engine/tir.js';
import { calcularTAC } from './../encargos/tac.js';
import { calcularIOF } from './../encargos/iof.js';
import { calcularGarantia } from './../encargos/garantias.js';
import { calcularRendaParaAval, calcularAlienacaoImovel } from './../encargos/garantias.js';
import { resolverIndexador } from './../indexadores/indexadores.js';
import { PARAMETROS } from './../data/parametros.js';

import { PERFIL as GIRO } from './giro.js';
import { PERFIL as INVESTIMENTO } from './investimento.js';
import { PERFIL as TRANSPORTES } from './transportes.js';
import { PERFIL as MICROCREDITO } from './microcredito.js';
import { PERFIL as FUNGETUR } from './fungetur.js';
import { PERFIL as FINEP } from './finep.js';
import { PERFIL as FCO } from './fco.js';
import { PERFIL_FCO_RURAL, PERFIL_PRODUTOR } from './rural.js';

export const VERSAO_DO_MOTOR = '0.1.0';

export const PRODUTOS = Object.freeze({
  giro: GIRO,
  investimento: INVESTIMENTO,
  transportes: TRANSPORTES,
  microcredito: MICROCREDITO,
  fungetur: FUNGETUR,
  finep: FINEP,
  fco: FCO,
  fcoRural: PERFIL_FCO_RURAL,
  produtorEmpreendedor: PERFIL_PRODUTOR,
});

export function obterProduto(codigo) {
  const produto = PRODUTOS[codigo];
  if (produto === undefined) {
    erro('PARAMETRO_INCOMPATIVEL',
      `Produto desconhecido: ${JSON.stringify(codigo)}. Conhecidos: ${Object.keys(PRODUTOS).join(', ')}.`,
      { codigo });
  }
  return produto;
}

export function listarProdutos() {
  return Object.values(PRODUTOS).map(({ codigo, nome, abaDeOrigem }) => ({ codigo, nome, abaDeOrigem }));
}

/** Uma linha do FCO tem duas taxas; as demais, uma. Esta é a forma comum. */
function normalizarLinha(bruta, grupo, perfil) {
  const emAberto = perfil.linhasEmAberto.find((l) => l.nome === bruta.nome) ?? null;
  const comum = {
    nome: bruta.nome,
    grupo,
    prazoMaximo: bruta.prazoMaximo,
    carenciaMaxima: bruta.carenciaMaxima,
    limite: bruta.limite,
    valorMinimo: bruta.valorMinimo ?? null,
    emAberto,
  };
  if (bruta.municipioPrioritario) {
    return {
      ...comum,
      porMunicipio: {
        prioritario: bruta.municipioPrioritario,
        naoPrioritario: bruta.municipioNaoPrioritario,
      },
    };
  }
  return {
    ...comum,
    taxaCheia: bruta.taxaCheia,
    taxaBonus: bruta.taxaBonus,
    taxaIndexador: bruta.taxaIndexador ?? null,
  };
}

/**
 * Todas as linhas de uma família, já normalizadas.
 *
 * O FINEP repete os mesmos três nomes de linha nos dois grupos de porte, com
 * taxas diferentes — `FINEP - Inovacred` custa 4,2% ao ano nos portes I e II e
 * 5,5% no porte III. Sem informar o porte, o nome sozinho é ambíguo, e por
 * isso `porte` filtra o grupo em vez de deixar a primeira ocorrência ganhar.
 */
export function listarLinhas(codigoDoProduto, opcoes = {}, parametros = PARAMETROS) {
  const perfil = obterProduto(codigoDoProduto);
  const { porte = null } = opcoes;
  const grupoDoPorte = porte !== null && perfil.regras.portes
    ? perfil.regras.portes[porte] : null;

  if (perfil.regras.exigePorte && porte !== null && grupoDoPorte === undefined) {
    erro('PARAMETRO_INCOMPATIVEL',
      `Porte desconhecido: ${JSON.stringify(porte)}. Previstos: ${Object.keys(perfil.regras.portes).join(', ')}.`,
      { porte });
  }

  const linhas = [];

  for (const nomeDoGrupo of perfil.gruposDeEncargos) {
    if (grupoDoPorte !== null && nomeDoGrupo !== grupoDoPorte) continue;
    const grupo = parametros.tabelaDeEncargos.find((g) => g.grupo === nomeDoGrupo);
    if (grupo === undefined) continue;
    for (const bruta of grupo.linhas) {
      linhas.push(normalizarLinha(bruta, nomeDoGrupo, perfil));
    }
  }
  if (perfil.linhasDaAba) {
    const aba = parametros.linhasPorAba[perfil.linhasDaAba];
    for (const bruta of aba?.linhas ?? []) {
      linhas.push(normalizarLinha(bruta, perfil.linhasDaAba, perfil));
    }
  }
  return linhas;
}

export function obterLinha(codigoDoProduto, nomeDaLinha, opcoes = {}, parametros = PARAMETROS) {
  const perfil = obterProduto(codigoDoProduto);
  if (perfil.regras.exigePorte && (opcoes.porte === undefined || opcoes.porte === null)) {
    erro('PARAMETRO_INCOMPATIVEL',
      `${perfil.nome} exige o porte: a mesma linha tem taxa diferente conforme ele. `
      + `Previstos: ${Object.keys(perfil.regras.portes).join(', ')}.`,
      { produto: codigoDoProduto });
  }
  const linhas = listarLinhas(codigoDoProduto, opcoes, parametros);
  const linha = linhas.find((l) => l.nome === nomeDaLinha);
  if (linha === undefined) {
    erro('PARAMETRO_INCOMPATIVEL',
      `A linha ${JSON.stringify(nomeDaLinha)} não existe em ${codigoDoProduto}.`,
      { produto: codigoDoProduto, disponiveis: linhas.map((l) => l.nome) });
  }
  return linha;
}

/**
 * Resolve as três taxas da operação: cheia, com bônus e aplicada.
 *
 * O FCO escolhe primeiro entre município prioritário e não prioritário; as
 * demais famílias têm um par só. Onde o bônus é por fator, ele é aplicado
 * sobre a cheia; onde é tabelado, vale a taxa da tabela — e as duas coisas não
 * dão o mesmo número.
 */
function resolverTaxas(perfil, linha, entrada) {
  if (linha.emAberto) {
    // O código do erro vem da declaração: uma referência perdida e uma taxa
    // que nunca foi preenchida são coisas diferentes, e quem lê a mensagem
    // precisa saber qual das duas está no caminho.
    erro(linha.emAberto.codigo ?? 'REGRA_EM_ABERTO',
      `${linha.emAberto.motivo} A célula é ${linha.emAberto.celula}. `
      + 'Preencher esse valor por dedução seria inventar preço de crédito.',
      { linha: linha.nome, celula: linha.emAberto.celula });
  }

  let cheia;
  let bonusTabelado;
  if (linha.porMunicipio) {
    const chave = entrada.municipioPrioritario === false ? 'naoPrioritario' : 'prioritario';
    const variante = linha.porMunicipio[chave];
    if (!variante || !variante.taxaCheia) {
      erro('TAXA_NAO_PARAMETRIZADA',
        `A linha ${linha.nome} não tem taxa para município ${chave === 'prioritario' ? 'prioritário' : 'não prioritário'}.`,
        { linha: linha.nome, municipio: chave });
    }
    cheia = variante.taxaCheia;
    bonusTabelado = variante.taxaBonus;
  } else {
    cheia = linha.taxaCheia;
    bonusTabelado = linha.taxaBonus;
  }

  if (!cheia) {
    erro('TAXA_NAO_PARAMETRIZADA', `A linha ${linha.nome} não tem taxa cheia na tabela.`, { linha: linha.nome });
  }

  const regra = perfil.regras.bonus;
  let comBonus = cheia;
  if (regra.tipo === 'fator') {
    comBonus = aplicarBonus(cheia, regra);
  } else if (regra.tipo === 'tabelado') {
    if (!bonusTabelado) {
      erro('TAXA_NAO_PARAMETRIZADA',
        `A linha ${linha.nome} usa bônus tabelado, mas a tabela não traz a taxa com bônus.`,
        { linha: linha.nome });
    }
    comBonus = bonusTabelado;
  }

  return {
    cheia: criarTaxa(cheia.valor, cheia.unidade, cheia.tipo),
    comBonus: criarTaxa(comBonus.valor, comBonus.unidade, comBonus.tipo),
    aplicada: criarTaxa(
      entrada.usarBonus === false ? cheia.valor : comBonus.valor,
      cheia.unidade, 'efetiva',
    ),
  };
}

function validarOperacao(perfil, linha, entrada) {
  const { valorSolicitado, prazo, carencia } = entrada;

  if (!Number.isFinite(valorSolicitado) || valorSolicitado <= 0) {
    erro('VALOR_INVALIDO', `Recebido ${JSON.stringify(valorSolicitado)}.`, { valorSolicitado });
  }
  if (linha.limite !== null && valorSolicitado > linha.limite) {
    erro('VALOR_ACIMA_DO_LIMITE',
      `A linha ${linha.nome} vai até ${linha.limite.toFixed(2)}, e foram pedidos ${valorSolicitado.toFixed(2)}.`,
      { limite: linha.limite, valorSolicitado });
  }
  if (linha.valorMinimo !== null && valorSolicitado < linha.valorMinimo) {
    erro('VALOR_ABAIXO_DO_MINIMO',
      `A linha ${linha.nome} começa em ${linha.valorMinimo.toFixed(2)}.`,
      { minimo: linha.valorMinimo, valorSolicitado });
  }
  if (!Number.isInteger(prazo) || prazo < 1) {
    erro('PRAZO_INVALIDO', `Recebido ${JSON.stringify(prazo)}.`, { prazo });
  }
  if (linha.prazoMaximo !== null && prazo > linha.prazoMaximo) {
    erro('PRAZO_INVALIDO',
      `A linha ${linha.nome} vai até ${linha.prazoMaximo} meses, e foram pedidos ${prazo}.`,
      { prazoMaximo: linha.prazoMaximo, prazo });
  }
  if (!Number.isInteger(carencia) || carencia < 0) {
    erro('CARENCIA_INVALIDA', `Recebida ${JSON.stringify(carencia)}.`, { carencia });
  }
  if (linha.carenciaMaxima !== null && carencia > linha.carenciaMaxima) {
    erro('CARENCIA_INVALIDA',
      `A linha ${linha.nome} admite até ${linha.carenciaMaxima} meses de carência, e foram pedidos ${carencia}.`,
      { carenciaMaxima: linha.carenciaMaxima, carencia });
  }
  if (carencia >= prazo) {
    erro('CARENCIA_INVALIDA',
      `Carência de ${carencia} meses não deixa parcela para amortizar num prazo de ${prazo}.`,
      { carencia, prazo });
  }
  const minimo = perfil.regras.percentualGarantidoMinimo;
  if (entrada.percentualGarantido !== undefined && entrada.percentualGarantido < minimo) {
    erro('PARAMETRO_INCOMPATIVEL',
      `O percentual garantido mínimo é ${minimo}, e foi informado ${entrada.percentualGarantido}.`,
      { minimo, informado: entrada.percentualGarantido });
  }
}

/**
 * Simula uma operação de ponta a ponta.
 *
 * A ordem segue a da planilha: encargos primeiro, porque o valor financiado
 * depende de quais deles são financiados; cronograma depois; e por fim os
 * indicadores que dependem do cronograma, como a renda exigida do avalista.
 *
 * Não há circularidade: a base do FGI parte do valor solicitado, não do
 * financiado, então ela é conhecida antes de o financiado existir.
 */
export function simular(entrada, parametros = PARAMETROS) {
  const perfil = obterProduto(entrada.produto);
  const linha = obterLinha(entrada.produto, entrada.linha, { porte: entrada.porte ?? null }, parametros);
  validarOperacao(perfil, linha, entrada);

  const {
    valorSolicitado, prazo, carencia,
    tacFinanciada = true, iofFinanciado = true, garantiaFinanciada = false,
    iofIncide = true, modalidadeDeGarantia = null,
    sistemaAmortizacao = 'SAC', periodicidade = 1,
    dataProposta = new Date().toISOString().slice(0, 10),
    modoCalendario = '30dias',
    valorDoIndexador,
  } = entrada;

  const percentualGarantido = entrada.percentualGarantido
    ?? perfil.regras.percentualGarantidoPadrao ?? 0.8;

  if (!perfil.regras.periodicidades.includes(periodicidade)) {
    erro('PERIODICIDADE_INCOMPATIVEL',
      `${perfil.nome} admite periodicidade ${perfil.regras.periodicidades.join(', ')}; recebida ${periodicidade}.`,
      { produto: perfil.codigo, periodicidade });
  }

  const taxas = resolverTaxas(perfil, linha, entrada);
  const taxaIndexador = perfil.regras.indexador
    ? resolverIndexador(perfil.regras.indexador, { valor: valorDoIndexador })
    : null;

  // ── encargos
  const tac = calcularTAC(valorSolicitado, {
    variante: perfil.regras.varianteTAC, financiada: tacFinanciada,
  });
  const iof = calcularIOF({
    valorSolicitado, prazo, carencia,
    incide: iofIncide, financiado: iofFinanciado,
    dataProposta, modoCalendario,
  });
  const garantia = modalidadeDeGarantia
    ? calcularGarantia(modalidadeDeGarantia, {
      valorSolicitado, tac, iof: iof.total, percentualGarantido, prazo,
      tabelaFatorK: parametros.fatorKFGI.fatores,
    })
    : null;

  const valorFinanciado = valorSolicitado
    + (tacFinanciada ? tac : 0)
    + (iofFinanciado ? iof.total : 0)
    + (garantiaFinanciada && garantia ? garantia.valor : 0);

  const valorLiquido = valorSolicitado
    - (tacFinanciada ? 0 : tac)
    - (iofFinanciado ? 0 : iof.total)
    - (garantiaFinanciada || !garantia ? 0 : garantia.valor);

  // ── cronograma
  const tratamentoCarencia = perfil.regras.tratamentoCarenciaPorLinha?.[linha.nome]
    ?? perfil.regras.tratamentoCarencia;

  const entradaDoMotor = {
    valorFinanciado, valorSolicitado, prazo, carencia,
    taxa: taxas.aplicada, taxaIndexador,
    convencaoTaxa: perfil.regras.convencaoTaxa,
    periodicidade,
    baseAmortizacao: sistemaAmortizacao === 'PRICE' ? 'valorFinanciado' : perfil.regras.baseAmortizacao,
    tratamentoCarencia,
    dataProposta, modoCalendario,
  };
  const gerar = sistemaAmortizacao === 'PRICE' ? gerarCronogramaPRICE : gerarCronogramaSAC;
  const resultado = gerar(entradaDoMotor);

  // ── indicadores que dependem do cronograma
  const parteGarantida = garantia ? valorSolicitado * percentualGarantido : 0;
  const rendaParaAval = calcularRendaParaAval(resultado.totais.maiorParcela);
  const alienacao = calcularAlienacaoImovel({
    valorSolicitado, parteGarantida, ...perfil.regras.alienacao,
  });

  const tirComBonus = tir(valorSolicitado, resultado.cronograma);
  const tirSemBonus = taxas.cheia.valor === taxas.aplicada.valor
    ? tirComBonus
    : tir(valorSolicitado, gerar({ ...entradaDoMotor, taxa: taxas.cheia }).cronograma);

  return {
    id: null,
    produto: perfil.codigo,
    nomeDoProduto: perfil.nome,
    linha: linha.nome,
    sistemaAmortizacao,

    valorSolicitado,
    valorFinanciado,
    valorLiquido,

    taxaCheia: taxas.cheia,
    taxaBonus: taxas.comBonus,
    taxaAplicada: taxas.aplicada,
    taxaIndexador,

    prazo,
    carencia,

    tac,
    iof: iof.total,
    detalheDoIOF: iof,
    garantia: garantia ? { ...garantia } : null,
    rendaParaAval: rendaParaAval.valor,
    alienacaoImovel: alienacao.valor,

    primeiraParcela: resultado.totais.primeiraParcela,
    ultimaParcela: resultado.totais.ultimaParcela,

    totalJuros: resultado.totais.totalJuros + resultado.totais.totalJurosIndexador,
    totalAmortizacao: resultado.totais.totalAmortizacao,
    totalEncargos: tac + iof.total + (garantia ? garantia.valor : 0),
    totalPago: resultado.totais.totalPago,
    saldoResidual: resultado.totais.saldoResidual,

    tirComBonus,
    tirSemBonus,

    cronograma: resultado.cronograma,
    avisos: resultado.avisos,

    parametrosUtilizados: {
      linha,
      regras: perfil.regras,
      percentualGarantido,
      tacFinanciada, iofFinanciado, garantiaFinanciada, iofIncide,
      premissas: resultado.premissas,
    },
    versaoParametros: parametros.versao,
    versaoMotor: VERSAO_DO_MOTOR,
    dataSimulacao: new Date().toISOString(),
  };
}

/** A TIR não existe quando nada é pago — devolve nulo em vez de derrubar tudo. */
function tir(valorSolicitado, cronograma) {
  try {
    return calcularTIR(montarFluxo(valorSolicitado, cronograma));
  } catch (e) {
    if (e.codigo === 'TIR_SEM_SOLUCAO') return null;
    throw e;
  }
}
