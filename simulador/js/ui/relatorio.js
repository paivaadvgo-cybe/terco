/**
 * Relatório para impressão, e exportação do cronograma.
 *
 * O item 33 do escopo lista o que o relatório precisa conter: identificação,
 * parâmetros, premissas, resumo, cronograma, totais, TIR, gráficos e as duas
 * versões. Está tudo aqui, numa página só, formatada para sair no papel sem
 * cortar tabela no meio.
 *
 * **Sobre o PDF.** O escopo pede PDF «quando houver infraestrutura adequada».
 * Ela existe e já está no aparelho: a caixa de impressão de qualquer navegador
 * moderno salva em PDF, no computador e no celular. Embutir uma biblioteca de
 * PDF custaria um pacote por CDN — e o simulador precisa funcionar sem
 * internet — ou uma etapa de compilação, que ele não tem. Imprimir e salvar em
 * PDF entrega o mesmo arquivo sem nenhum dos dois custos.
 */

import { criar } from './formulario.js';
import { desenharGrafico } from './grafico.js';
import { cronogramaEmCSV, nomeDoArquivo } from './csv.js';
import { moeda, numero, taxa, percentual, meses, data, dataHora, textoDoAviso } from './formatar.js';

const acumular = (valores) => {
  let total = 0;
  return valores.map((v) => { total += v; return total; });
};

const noEixo = (v) => (Math.abs(v) >= 1000 ? `${numero(v / 1000, 0)} mil` : numero(v, 0));
const naPonta = (v) => numero(v, 0);

function par(rotulo, valor) {
  return [criar('dt', { texto: rotulo }), criar('dd', { texto: valor })];
}

function secao(titulo, conteudo, classe = '') {
  return criar('section', { class: `secao-relatorio ${classe}`.trim() }, [
    criar('h2', { texto: titulo }), ...[].concat(conteudo),
  ]);
}

/** Entrega o arquivo ao navegador e devolve o objeto de URL logo em seguida. */
export function baixarCSV(s) {
  const blob = new Blob([cronogramaEmCSV(s)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const ligacao = criar('a', { href: url, download: nomeDoArquivo(s) });
  document.body.append(ligacao);
  ligacao.click();
  ligacao.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function desenharRelatorio(raiz, s) {
  raiz.replaceChildren();

  raiz.append(criar('div', { class: 'acoes acoes-relatorio' }, [
    criar('button', { class: 'principal', onClick: () => window.print() }, ['Imprimir ou salvar em PDF']),
    criar('button', { onClick: () => baixarCSV(s) }, ['Exportar cronograma em CSV']),
  ]));

  const relatorio = criar('article', { class: 'relatorio' });
  raiz.append(relatorio);

  // ── identificação
  relatorio.append(criar('header', { class: 'topo-relatorio' }, [
    criar('p', { class: 'orgao', texto: 'GoiásFomento · Simulador Financeiro' }),
    criar('h1', { texto: s.linha }),
    criar('p', { class: 'subtitulo', texto: `${s.nomeDoProduto} · ${s.sistemaAmortizacao}` }),
  ]));

  const entrada = s.parametrosUtilizados.entrada;
  const linha = s.parametrosUtilizados.linha;

  relatorio.append(secao('Premissas da simulação', criar('dl', { class: 'pares' }, [
    ...par('Valor solicitado', moeda(s.valorSolicitado)),
    ...par('Prazo total', meses(s.prazo)),
    ...par('Carência', s.carencia ? meses(s.carencia) : 'sem carência'),
    ...par('Sistema de amortização', s.sistemaAmortizacao),
    ...par('TAC', s.parametrosUtilizados.tacFinanciada ? 'financiada' : 'descontada da liberação'),
    ...par('IOF', !s.parametrosUtilizados.iofIncide ? 'não incide'
      : s.parametrosUtilizados.iofFinanciado ? 'financiado' : 'descontado da liberação'),
    ...par('Garantia', s.garantia
      ? `${s.garantia.modalidade}, ${s.parametrosUtilizados.garantiaFinanciada ? 'financiada' : 'descontada'}`
      : 'sem encargo de garantia'),
    ...(s.garantia ? par('Percentual garantido', percentual(s.parametrosUtilizados.percentualGarantido, 0, '')) : []),
    ...(entrada.municipioPrioritario !== undefined
      ? par('Município', entrada.municipioPrioritario ? 'prioritário' : 'não prioritário') : []),
    ...(entrada.porte !== undefined ? par('Porte', `Porte ${entrada.porte}`) : []),
    ...par('Data da proposta', data(entrada.dataProposta)),
    ...par('Calendário', 'meses de trinta dias corridos'),
  ])));

  // ── parâmetros da linha
  relatorio.append(secao('Parâmetros da linha', criar('dl', { class: 'pares' }, [
    ...par('Limite da linha', moeda(linha.limite)),
    ...par('Prazo máximo', meses(linha.prazoMaximo)),
    ...par('Carência máxima', meses(linha.carenciaMaxima)),
    ...par('Taxa cheia', taxa(s.taxaCheia)),
    ...par('Taxa com bônus', taxa(s.taxaBonus)),
    ...par('Taxa aplicada', taxa(s.taxaAplicada)),
    ...(s.taxaIndexador ? par('Indexador informado', taxa(s.taxaIndexador)) : []),
    // A linha da conversão só aparece quando há conversão. Numa linha de taxa
    // já mensal, exibir a fórmula sugeriria que algo foi transformado, e o
    // "resultado" seria o mesmo número repetido duas linhas abaixo.
    ...(s.taxaAplicada.unidade === 'mensal' ? [] : [
      ...par('Conversão para o período', s.parametrosUtilizados.premissas.convencaoTaxa === 'diasUteis'
        ? '(1 + i) elevado a 22/252, menos 1 — por dias úteis'
        : '(1 + i) elevado a 1/12, menos 1 — composição mensal'),
      ...par('Taxa mensal resultante', percentual(s.parametrosUtilizados.premissas.taxaMensal.valor)),
    ]),
  ])));

  // ── resumo e encargos
  relatorio.append(secao('Resumo financeiro', criar('dl', { class: 'pares' }, [
    ...par('Valor solicitado', moeda(s.valorSolicitado)),
    ...par('TAC', moeda(s.tac)),
    ...par('IOF', moeda(s.iof)),
    ...(s.garantia ? par(`Garantia — ${s.garantia.modalidade}`, moeda(s.garantia.valor)) : []),
    ...par('Total de encargos', moeda(s.totalEncargos)),
    ...par('Valor financiado', moeda(s.valorFinanciado)),
    ...par('Valor líquido liberado', moeda(s.valorLiquido)),
    ...par('Renda exigida do avalista', moeda(s.rendaParaAval)),
    ...par('Imóvel em alienação', s.alienacaoImovel ? moeda(s.alienacaoImovel) : 'não exigido'),
  ])));

  relatorio.append(secao('Totais e taxa interna de retorno', [
    criar('dl', { class: 'pares' }, [
      ...par('Primeira parcela', moeda(s.primeiraParcela)),
      ...par('Última parcela', moeda(s.ultimaParcela)),
      ...par('Total de juros', moeda(s.totalJuros)),
      ...par('Total amortizado', moeda(s.totalAmortizacao)),
      ...par('Total pago', moeda(s.totalPago)),
      ...par('Saldo residual', moeda(s.saldoResidual)),
      ...par('TIR com bônus', percentual(s.tirComBonus)),
      ...par('TIR sem bônus', percentual(s.tirSemBonus)),
    ]),
    criar('p', { class: 'meta' }, [
      'A taxa interna de retorno é a do fluxo de prestações, como a planilha a calcula. ',
      criar('strong', { texto: 'Não é o Custo Efetivo Total' }),
      ': o CET exigiria trazer todos os encargos para dentro do fluxo.',
    ]),
  ]));

  // ── gráficos
  const galeria = criar('div', { class: 'galeria galeria-relatorio' });
  desenharGrafico(galeria, {
    titulo: 'Evolução da prestação',
    series: [{ nome: 'Prestação', classe: 'serie-1', pontos: s.cronograma.map((p) => p.prestacao) }],
    formatar: moeda, formatarEixo: noEixo, formatarPonta: naPonta,
  });
  desenharGrafico(galeria, {
    titulo: 'Evolução do saldo devedor',
    series: [{ nome: 'Saldo', classe: 'serie-1', pontos: s.cronograma.map((p) => p.saldoFinal) }],
    formatar: moeda, formatarEixo: noEixo, formatarPonta: naPonta,
  });
  desenharGrafico(galeria, {
    titulo: 'Juros e amortização acumulados',
    series: [
      { nome: 'Juros', classe: 'serie-2', pontos: acumular(s.cronograma.map((p) => p.juros + p.jurosIndexador)) },
      { nome: 'Amortização', classe: 'serie-1', pontos: acumular(s.cronograma.map((p) => p.amortizacao)) },
    ],
    formatar: moeda, formatarEixo: noEixo, formatarPonta: naPonta,
  });
  relatorio.append(secao('Gráficos', galeria));

  // ── observações
  // O aviso do saldo residual já explica que não é arredondamento; repetir
  // isso numa segunda observação só faria o leitor duvidar da primeira.
  const observacoes = (s.avisos ?? []).map(textoDoAviso);
  if (observacoes.length) {
    relatorio.append(secao('Observações', criar('ul', { class: 'observacoes' },
      observacoes.map((o) => criar('li', { texto: o })))));
  }

  // ── cronograma
  relatorio.append(secao('Cronograma', criar('table', { class: 'cronograma cronograma-relatorio' }, [
    criar('thead', {}, [criar('tr', {}, [
      criar('th', { texto: '#' }),
      criar('th', { texto: 'Vencimento' }),
      criar('th', { texto: 'Regime' }),
      criar('th', { class: 'num', texto: 'Saldo inicial' }),
      criar('th', { class: 'num', texto: 'Juros' }),
      criar('th', { class: 'num', texto: 'Amortização' }),
      criar('th', { class: 'num', texto: 'Prestação' }),
      criar('th', { class: 'num', texto: 'Saldo final' }),
    ])]),
    criar('tbody', {}, s.cronograma.map((p) => criar('tr', {}, [
      criar('td', { texto: String(p.parcela) }),
      criar('td', { texto: data(p.dataVencimento) }),
      criar('td', { texto: p.regime === 'carencia' ? 'Carência' : 'Amortização' }),
      criar('td', { class: 'num', texto: moeda(p.saldoInicial) }),
      criar('td', { class: 'num', texto: moeda(p.juros + p.jurosIndexador) }),
      criar('td', { class: 'num', texto: moeda(p.amortizacao) }),
      criar('td', { class: 'num', texto: moeda(p.prestacao) }),
      criar('td', { class: 'num', texto: moeda(p.saldoFinal) }),
    ]))),
    criar('tfoot', {}, [criar('tr', {}, [
      criar('th', { colspan: 4, texto: 'Totais' }),
      criar('td', { class: 'num', texto: moeda(s.totalJuros) }),
      criar('td', { class: 'num', texto: moeda(s.totalAmortizacao) }),
      criar('td', { class: 'num', texto: moeda(s.totalPago) }),
      criar('td', { class: 'num', texto: moeda(s.saldoResidual) }),
    ])]),
  ]), 'secao-cronograma'));

  // ── procedência
  relatorio.append(criar('footer', { class: 'rodape-relatorio' }, [
    criar('p', {}, [
      `Parâmetros da vigência ${s.versaoParametros} · motor ${s.versaoMotor} · `,
      `simulado em ${dataHora(s.dataSimulacao)}.`,
    ]),
    criar('p', {}, [
      'Documento gerado por simulação. Não constitui proposta, não vincula a '
      + 'GoiásFomento e não garante concessão de crédito.',
    ]),
  ]));
}
