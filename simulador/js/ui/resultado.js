/**
 * Tela de resultado: resumo, indicadores e memória de cálculo.
 *
 * O item 41 do escopo pede que o sistema responda «por que esta parcela tem
 * este valor?». A memória de cálculo existe para isso, e ela não recalcula
 * nada: lê o que cada parcela já guardou de si mesma quando foi gerada.
 */

import { criar } from './formulario.js';
import { moeda, taxa, percentual, meses, data, dataHora, textoDoAviso } from './formatar.js';

function linhaDeResumo(rotulo, valor, destaque = false) {
  return criar('div', { class: destaque ? 'item item-destaque' : 'item' }, [
    criar('span', { class: 'rotulo', texto: rotulo }),
    criar('span', { class: 'valor', texto: valor }),
  ]);
}

function bloco(titulo, itens) {
  return criar('section', { class: 'bloco' }, [
    criar('h2', { texto: titulo }),
    criar('div', { class: 'grade' }, itens),
  ]);
}

export function desenharResultado(raiz, s, acoes = {}) {
  raiz.replaceChildren();

  raiz.append(criar('header', { class: 'cabecalho-resultado' }, [
    criar('h1', { texto: s.linha }),
    criar('p', { class: 'subtitulo' }, [
      `${s.nomeDoProduto} · ${s.sistemaAmortizacao} · ${meses(s.prazo)}`,
      s.carencia ? `, ${meses(s.carencia)} de carência` : ', sem carência',
    ]),
  ]));

  for (const aviso of s.avisos ?? []) {
    raiz.append(criar('p', { class: 'aviso' }, [
      criar('strong', { texto: 'Atenção. ' }), textoDoAviso(aviso),
    ]));
  }

  raiz.append(bloco('Resumo', [
    linhaDeResumo('Valor solicitado', moeda(s.valorSolicitado)),
    linhaDeResumo('Valor financiado', moeda(s.valorFinanciado), true),
    linhaDeResumo('Valor líquido liberado', moeda(s.valorLiquido)),
    linhaDeResumo('Taxa cheia', taxa(s.taxaCheia)),
    linhaDeResumo('Taxa com bônus', taxa(s.taxaBonus)),
    linhaDeResumo('Taxa aplicada', taxa(s.taxaAplicada), true),
    s.taxaIndexador ? linhaDeResumo('Indexador', taxa(s.taxaIndexador)) : null,
    linhaDeResumo('Prazo', meses(s.prazo)),
    linhaDeResumo('Carência', meses(s.carencia)),
  ].filter(Boolean)));

  raiz.append(bloco('Encargos', [
    linhaDeResumo('TAC', moeda(s.tac)),
    linhaDeResumo('IOF', moeda(s.iof)),
    s.garantia ? linhaDeResumo(`Garantia — ${s.garantia.modalidade}`, moeda(s.garantia.valor)) : null,
    linhaDeResumo('Total de encargos', moeda(s.totalEncargos), true),
    linhaDeResumo('Renda exigida do avalista', moeda(s.rendaParaAval)),
    linhaDeResumo('Imóvel em alienação', s.alienacaoImovel ? moeda(s.alienacaoImovel) : 'Não exigido'),
  ].filter(Boolean)));

  raiz.append(bloco('Indicadores', [
    linhaDeResumo('Primeira parcela', moeda(s.primeiraParcela), true),
    linhaDeResumo('Última parcela', moeda(s.ultimaParcela), true),
    linhaDeResumo('Total de juros', moeda(s.totalJuros)),
    linhaDeResumo('Total amortizado', moeda(s.totalAmortizacao)),
    linhaDeResumo('Total pago', moeda(s.totalPago), true),
    linhaDeResumo('TIR com bônus', percentual(s.tirComBonus)),
    linhaDeResumo('TIR sem bônus', percentual(s.tirSemBonus)),
    linhaDeResumo('Saldo residual', moeda(s.saldoResidual)),
  ]));

  raiz.append(memoriaDeCalculo(s));

  raiz.append(criar('section', { class: 'bloco procedencia' }, [
    criar('h2', { texto: 'Procedência' }),
    criar('p', {}, [
      `Parâmetros da vigência ${s.versaoParametros}, motor ${s.versaoMotor}. `,
      `Simulado em ${dataHora(s.dataSimulacao)}. `,
      'Os valores desta tela não constituem proposta nem garantia de concessão.',
    ]),
  ]));

  const botoes = criar('div', { class: 'acoes' }, [
    acoes.aoSalvar ? criar('button', { class: 'principal', onClick: acoes.aoSalvar }, ['Salvar simulação']) : null,
    acoes.aoImprimir ? criar('button', { onClick: acoes.aoImprimir }, ['Relatório']) : null,
    acoes.aoExportar ? criar('button', { onClick: acoes.aoExportar }, ['Exportar CSV']) : null,
    acoes.aoVoltar ? criar('button', { onClick: acoes.aoVoltar }, ['Nova simulação']) : null,
  ].filter(Boolean));
  if (botoes.childElementCount) raiz.append(botoes);
}

/**
 * A memória parte do que é fixo na operação e desce até uma parcela escolhida.
 * O seletor começa na primeira que amortiza, que é a que costuma gerar dúvida.
 */
function memoriaDeCalculo(s) {
  const premissas = s.parametrosUtilizados.premissas;
  const amortizantes = s.prazo - s.carencia;
  const secao = criar('section', { class: 'bloco memoria' }, [
    criar('h2', { texto: 'Memória de cálculo' }),
  ]);

  const base = premissas.saldoAoFimDaCarencia ?? s.valorFinanciado;
  secao.append(criar('dl', { class: 'derivacao' }, [
    criar('dt', { texto: 'Valor financiado' }),
    criar('dd', {}, [
      `${moeda(s.valorSolicitado)} solicitados`,
      s.parametrosUtilizados.tacFinanciada ? ` + ${moeda(s.tac)} de TAC financiada` : '',
      s.parametrosUtilizados.iofFinanciado && s.iof ? ` + ${moeda(s.iof)} de IOF financiado` : '',
      s.parametrosUtilizados.garantiaFinanciada && s.garantia ? ` + ${moeda(s.garantia.valor)} de garantia` : '',
      ` = ${moeda(s.valorFinanciado)}`,
    ]),
    criar('dt', { texto: 'Taxa do período' }),
    criar('dd', {}, [
      `${taxa(s.taxaAplicada)}`,
      premissas.convencaoTaxa === 'diasUteis'
        ? ` convertida por (1 + i)^(22/252) − 1, dando ${percentual(premissas.taxaMensal.valor)}`
        : s.taxaAplicada.unidade === 'anual'
          ? ` convertida por (1 + i)^(1/12) − 1, dando ${percentual(premissas.taxaMensal.valor)}`
          : '',
    ]),
    criar('dt', { texto: 'Amortização' }),
    criar('dd', {}, [
      s.carencia === 0
        ? 'Sem carência: a amortização começa na primeira parcela. '
        : premissas.tratamentoCarencia === 'capitalizados'
          ? `Os juros da carência são somados ao saldo, que chega a ${moeda(base)} ao fim dela. `
          : 'Os juros da carência são pagos mês a mês, e o saldo fica parado. ',
      s.sistemaAmortizacao === 'PRICE'
        ? `A prestação constante é ${moeda(premissas.prestacaoConstante)}, e a amortização é o que sobra dela depois do juro.`
        : `${moeda(base)} ÷ ${amortizantes} parcelas amortizantes = ${moeda(base / amortizantes)} por parcela.`,
    ]),
    premissas.baseAmortizacao === 'planilha' ? criar('dt', { texto: 'Base da amortização' }) : null,
    premissas.baseAmortizacao === 'planilha' ? criar('dd', {}, [
      'Esta linha reproduz a planilha, que divide o valor solicitado até a parcela 12 e o '
      + 'valor financiado da 13 em diante. É a origem do saldo residual — ver ABERTO-07.',
    ]) : null,
  ].filter(Boolean)));

  const inicial = s.cronograma.find((p) => p.amortizacao > 0) ?? s.cronograma[0];
  const seletor = criar('select', { id: 'memoria-parcela', class: 'seletor-parcela' });
  for (const p of s.cronograma) {
    seletor.append(criar('option', {
      value: p.parcela, selected: p.parcela === inicial.parcela,
      texto: `Parcela ${p.parcela} — ${data(p.dataVencimento)} — ${moeda(p.prestacao)}`,
    }));
  }
  const detalhe = criar('div', { class: 'detalhe-parcela' });
  const atualizar = () => {
    const p = s.cronograma[Number(seletor.value) - 1];
    detalhe.replaceChildren(...explicarParcela(p, s));
  };
  seletor.addEventListener('change', atualizar);

  secao.append(criar('h3', { texto: 'Por que esta parcela tem este valor?' }));
  secao.append(seletor);
  secao.append(detalhe);
  atualizar();
  return secao;
}

function explicarParcela(p, s) {
  const linhas = [
    ['Saldo no início', moeda(p.saldoInicial)],
    ['Taxa do mês', percentual(p.taxaAplicada)],
    ['Juros', `${moeda(p.saldoInicial)} × ${percentual(p.taxaAplicada)} = ${moeda(p.juros)}`],
  ];
  if (p.jurosIndexador) {
    linhas.push(['Juros do indexador', moeda(p.jurosIndexador)]);
    linhas.push(['Base do juro fixo', 'saldo + juros do indexador, como a planilha faz']);
  }
  linhas.push(['Amortização', p.amortizacao
    ? `${moeda(p.amortizacao)}${p.memoria.baseAmortizacao ? ` (divide o ${p.memoria.baseAmortizacao === 'valorSolicitado' ? 'valor solicitado' : 'valor financiado'})` : ''}`
    : `zero — parcela em ${p.regime === 'carencia' ? 'carência' : 'mês sem pagamento'}`]);
  linhas.push(['Prestação', p.prestacao
    ? `${moeda(p.amortizacao)} + ${moeda(p.juros + p.jurosIndexador)} = ${moeda(p.prestacao)}`
    : 'nada é pago nesta parcela']);
  linhas.push(['Saldo ao fim', moeda(p.saldoFinal)]);
  linhas.push(['Dias desde a liberação', `${p.diasDesdeLiberacao} dias, vencendo em ${data(p.dataVencimento)}`]);

  return [
    criar('dl', { class: 'derivacao' },
      linhas.flatMap(([r, v]) => [criar('dt', { texto: r }), criar('dd', { texto: v })])),
    criar('p', { class: 'regra-aplicada' }, [criar('code', { texto: p.memoria.formula })]),
  ];
}
