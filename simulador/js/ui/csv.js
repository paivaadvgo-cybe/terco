/**
 * Exportação do cronograma em CSV.
 *
 * Feito para abrir no Excel em português, que é onde este arquivo vai parar.
 * Isso decide três coisas que um CSV genérico erraria:
 *
 *   - **separador ponto e vírgula**, porque o Excel configurado em pt-BR usa a
 *     vírgula como separador decimal e trata a vírgula do CSV como decimal
 *     também, embaralhando as colunas;
 *   - **decimal com vírgula e sem separador de milhar**, para que a célula
 *     chegue como número e não como texto — um total que o Excel lê como texto
 *     não soma;
 *   - **marca de ordem de byte no começo**, sem a qual o Excel abre o arquivo
 *     em Latin-1 e "Carência" vira "CarÃªncia".
 *
 * As funções aqui são puras: recebem a simulação, devolvem texto. Quem baixa é
 * a interface.
 */

const SEPARADOR = ';';
const MARCA_DE_ORDEM = '﻿';

/** Número no formato que o Excel em português entende como número. */
export function numeroCSV(valor, casas = 2) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '';
  return valor.toFixed(casas).replace('.', ',');
}

/**
 * Um campo só é aspado quando precisa. Aspas dentro do texto viram duas, que é
 * como o formato escapa a si mesmo.
 */
export function campoCSV(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

const linha = (campos) => campos.map(campoCSV).join(SEPARADOR);

const CABECALHO = [
  'Parcela', 'Vencimento', 'Regime', 'Dias desde a liberação',
  'Saldo inicial', 'Juros', 'Juros do indexador', 'Amortização', 'Prestação', 'Saldo final',
];

/**
 * Monta o arquivo inteiro: um bloco de identificação, uma linha em branco e o
 * cronograma.
 *
 * O bloco de identificação sacrifica a pureza tabular do formato de propósito.
 * Sem ele, um cronograma exportado hoje e reencontrado daqui a seis meses é uma
 * coluna de números sem linha de crédito, sem taxa e sem a vigência dos
 * parâmetros que o produziram — impossível de conferir contra nada.
 */
export function cronogramaEmCSV(s) {
  const linhas = [
    linha(['Simulador Financeiro — GoiásFomento']),
    linha(['Produto', s.nomeDoProduto]),
    linha(['Linha', s.linha]),
    linha(['Sistema de amortização', s.sistemaAmortizacao]),
    linha(['Valor solicitado', numeroCSV(s.valorSolicitado)]),
    linha(['Valor financiado', numeroCSV(s.valorFinanciado)]),
    linha(['Valor líquido liberado', numeroCSV(s.valorLiquido)]),
    linha(['Taxa cheia', `${numeroCSV(s.taxaCheia.valor * 100, 4)}% ${s.taxaCheia.unidade}`]),
    linha(['Taxa aplicada', `${numeroCSV(s.taxaAplicada.valor * 100, 4)}% ${s.taxaAplicada.unidade}`]),
    s.taxaIndexador
      ? linha(['Indexador', `${numeroCSV(s.taxaIndexador.valor * 100, 4)}% ${s.taxaIndexador.unidade}`])
      : null,
    linha(['Prazo (meses)', s.prazo]),
    linha(['Carência (meses)', s.carencia]),
    linha(['TAC', numeroCSV(s.tac)]),
    linha(['IOF', numeroCSV(s.iof)]),
    s.garantia ? linha([`Garantia — ${s.garantia.modalidade}`, numeroCSV(s.garantia.valor)]) : null,
    linha(['Total de juros', numeroCSV(s.totalJuros)]),
    linha(['Total pago', numeroCSV(s.totalPago)]),
    linha(['Saldo residual', numeroCSV(s.saldoResidual)]),
    linha(['TIR com bônus', numeroCSV(s.tirComBonus * 100, 6)]),
    linha(['TIR sem bônus', numeroCSV(s.tirSemBonus * 100, 6)]),
    linha(['Versão dos parâmetros', s.versaoParametros]),
    linha(['Versão do motor', s.versaoMotor]),
    linha(['Data da simulação', s.dataSimulacao]),
    linha(['Aviso', 'Simulação. Não é proposta e não vincula a instituição.']),
    '',
    linha(CABECALHO),
    ...s.cronograma.map((p) => linha([
      p.parcela,
      p.dataVencimento,
      p.regime === 'carencia' ? 'Carência' : 'Amortização',
      p.diasDesdeLiberacao,
      numeroCSV(p.saldoInicial),
      numeroCSV(p.juros),
      numeroCSV(p.jurosIndexador),
      numeroCSV(p.amortizacao),
      numeroCSV(p.prestacao),
      numeroCSV(p.saldoFinal),
    ])),
  ].filter((l) => l !== null);

  // Fim de linha do Windows: é o que o Excel espera, e o que não quebra a
  // última coluna quando o arquivo passa por e-mail.
  return MARCA_DE_ORDEM + linhas.join('\r\n') + '\r\n';
}

/** Nome de arquivo sem acento, espaço nem barra — sobrevive a qualquer sistema. */
export function nomeDoArquivo(s, extensao = 'csv') {
  const limpo = (texto) => String(texto)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `simulacao-${limpo(s.linha)}-${s.dataSimulacao.slice(0, 10)}.${extensao}`;
}
