/**
 * Exportação em CSV.
 *
 * O destino é o Excel brasileiro, e ele tem manias: separa colunas por ponto e
 * vírgula (não por vírgula, que aqui é decimal), quer o decimal com vírgula, e
 * sem o BOM abre o arquivo em Latin-1 — o que transforma «Lavagem Externa +
 * Caixa» em garatuja e faz o dono achar que o aplicativo corrompeu o
 * fechamento. Os três detalhes estão aqui, e é por isso que este arquivo existe
 * em vez de um `join(',')` espalhado pelas telas.
 *
 * **Por que CSV e não PDF.** Gerar PDF no navegador exige biblioteca de algumas
 * centenas de quilobytes, baixada por quem talvez nunca exporte nada. O
 * fechamento em papel sai pela impressão do próprio navegador, que já gera PDF
 * em Android e iPhone, e a tela tem folha de estilo de impressão para isso. O
 * que precisa virar conta vai em CSV.
 */

import { valorParaCampo } from './formatar.js';
import { exibirDia, hora } from '../dominio/datas.js';
import { nomeDaForma, rotulo } from '../dominio/lavagem.js';
import { nomeDoTipo } from '../dominio/veiculos.js';

/** Um campo. Aspas dobradas, e aspas ao redor quando há separador ou quebra. */
export function campoCSV(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Centavos como o Excel pt-BR entende: `40,00`, sem símbolo e sem milhar. */
export function numeroCSV(centavos) {
  return Number.isFinite(Number(centavos)) ? valorParaCampo(centavos) : '';
}

export function montarCSV(linhas) {
  // O BOM não é enfeite: sem ele o Excel abre como Latin-1 e come os acentos.
  return `﻿${linhas.map((linha) => linha.map(campoCSV).join(';')).join('\r\n')}\r\n`;
}

/** Uma linha por lavagem — o formato que serve tanto para o dia quanto para o mês. */
export function lavagensEmCSV(lavagens) {
  const linhas = [[
    'Data', 'Hora', 'Placa', 'Veículo', 'Modelo', 'Serviço', 'Valor',
    'Estado', 'Pagamento', 'Responsável',
  ]];
  for (const l of [...lavagens].sort((a, b) => a.criadaEm - b.criadaEm)) {
    linhas.push([
      exibirDia(l.dia), hora(l.criadaEm), l.placa ?? 'SEM PLACA', nomeDoTipo(l.tipo), l.modelo ?? '',
      l.servicoNome ?? '', numeroCSV(l.valor), rotulo(l.estado).texto,
      l.pagamento ? nomeDaForma(l.pagamento.forma) : '', l.funcionarioNome ?? '',
    ]);
  }
  return montarCSV(linhas);
}

/** O fechamento: cabeçalho com os totais e, abaixo, o movimento que os gerou. */
export function fechamentoEmCSV(fechamento, lavagens, despesas = []) {
  const linhas = [
    ['Fechamento do dia', exibirDia(fechamento.dia)],
    [],
    ['Lavagens', fechamento.quantidade],
    ['Faturamento', numeroCSV(fechamento.faturamento)],
    ['Recebido', numeroCSV(fechamento.recebido)],
    ['Pendente', numeroCSV(fechamento.pendente)],
    ['Ticket médio', numeroCSV(fechamento.ticketMedio)],
    [],
    ['Forma de pagamento', 'Valor'],
    ...Object.entries(fechamento.porForma).map(([forma, valor]) => [nomeDaForma(forma), numeroCSV(valor)]),
    ['Pendente', numeroCSV(fechamento.pendente)],
    [],
    ['Serviço', 'Quantidade', 'Valor'],
    ...fechamento.servicos.map((s) => [s.nome, s.quantidade, numeroCSV(s.valor)]),
    [],
    ['Tipo de veículo', 'Quantidade'],
    ...fechamento.tipos.map((t) => [nomeDoTipo(t.chave), t.quantidade]),
  ];

  if (fechamento.funcionarios.length) {
    linhas.push([], ['Responsável', 'Lavagens', 'Valor'],
      ...fechamento.funcionarios.map((f) => [f.nome, f.quantidade, numeroCSV(f.valor)]));
  }
  if (despesas.length) {
    linhas.push([], ['Despesa', 'Categoria', 'Valor'],
      ...despesas.map((d) => [d.descricao, d.categoria, numeroCSV(d.valor)]),
      ['Total de despesas', '', numeroCSV(fechamento.despesas)],
      ['Resultado operacional', '', numeroCSV(fechamento.resultado)]);
  }

  linhas.push([], ['Movimento do dia']);
  const movimento = lavagensEmCSV(lavagens).replace(/^﻿/, '').trimEnd().split('\r\n');
  return montarCSV(linhas) + movimento.join('\r\n') + '\r\n';
}

export function nomeDoArquivo(prefixo, dia, extensao = 'csv') {
  return `${prefixo}-${dia}.${extensao}`;
}

/**
 * Entrega o arquivo.
 *
 * Sem servidor: o conteúdo vira um endereço temporário na memória do próprio
 * aparelho, e o navegador o salva. Funciona sem internet, que é o ponto.
 */
export function baixar(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const endereco = URL.createObjectURL(blob);
  const ligacao = document.createElement('a');
  ligacao.href = endereco;
  ligacao.download = nome;
  document.body.append(ligacao);
  ligacao.click();
  ligacao.remove();
  // Revogar na hora cancelaria o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(endereco), 4000);
}
