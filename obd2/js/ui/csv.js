/**
 * Exportação em CSV.
 *
 * O destino é o Excel brasileiro, e ele tem manias: separa colunas por ponto e
 * vírgula (não por vírgula, que aqui é decimal), quer o decimal com vírgula, e
 * sem o BOM abre o arquivo em Latin-1 — o que transforma «Rotação» em garatuja.
 * Os três detalhes estão aqui, e é por isso que este arquivo existe em vez de um
 * `join(',')` espalhado pelas telas.
 *
 * **Por que exportar.** O aplicativo mostra a viagem; quem quer investigar um
 * defeito intermitente precisa do dado bruto, alinhado no tempo, para cruzar
 * com o que sentiu ao volante. É também a garantia de que nada aqui é uma
 * jaula: a gravação é da pessoa, e sai em formato que qualquer planilha abre.
 */

import { horaCompleta, exibirDia } from '../dominio/datas.js';
import { definicaoDe } from '../obd/pids.js';
import { consumoInstantaneo } from '../dominio/leituras.js';

/** Um campo. Aspas dobradas, e aspas ao redor quando há separador ou quebra. */
export function campoCSV(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * Número como o Excel pt-BR entende: vírgula decimal, sem separador de milhar.
 *
 * Ausência vira célula vazia, nunca zero — e é preciso dizer isso explicitamente
 * porque `Number(null)` é `0`. Um PID que o carro não respondeu exportado como
 * `0,00` entra na média da planilha e a puxa para baixo, silenciosamente.
 */
export function numeroCSV(valor, casas = 2) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (!Number.isFinite(Number(valor))) return '';
  return Number(valor).toFixed(casas).replace('.', ',');
}

export function montarCSV(linhas) {
  // O BOM não é enfeite: sem ele o Excel abre como Latin-1 e come os acentos.
  return `﻿${linhas.map((linha) => linha.map(campoCSV).join(';')).join('\r\n')}\r\n`;
}

/**
 * As colunas de uma exportação.
 *
 * São os PIDs que **aparecem nas amostras**, e não a tabela inteira: exportar
 * quarenta colunas vazias porque o aplicativo conhece quarenta PIDs é o tipo de
 * planilha que ninguém abre duas vezes.
 */
export function colunasDe(amostras) {
  const presentes = new Set();
  for (const amostra of amostras) {
    for (const [pid, valor] of Object.entries(amostra.v ?? {})) {
      if (Number.isFinite(valor)) presentes.add(pid);
    }
  }
  return [...presentes].sort();
}

/** Uma linha por amostra: hora, segundos desde o início e um PID por coluna. */
export function amostrasEmCSV(amostras, opcoes = {}) {
  const pontos = [...(amostras ?? [])].sort((a, b) => a.t - b.t);
  if (pontos.length === 0) return montarCSV([['Sem amostras']]);

  const colunas = colunasDe(pontos);
  const inicio = pontos[0].t;

  const cabecalho = [
    'Hora', 'Segundos',
    ...colunas.map((pid) => {
      const definicao = definicaoDe(pid);
      return definicao ? `${definicao.nome} (${definicao.unidade})` : `PID ${pid}`;
    }),
    'Consumo (L/h)',
  ];

  const linhas = [cabecalho];
  for (const ponto of pontos) {
    const { litrosPorHora } = consumoInstantaneo(ponto.v, opcoes);
    linhas.push([
      horaCompleta(ponto.t),
      numeroCSV((ponto.t - inicio) / 1000, 1),
      ...colunas.map((pid) => numeroCSV(ponto.v[pid], definicaoDe(pid)?.casas ?? 2)),
      numeroCSV(litrosPorHora, 2),
    ]);
  }
  return montarCSV(linhas);
}

/** O resumo no topo e o movimento embaixo — a planilha que se manda ao mecânico. */
export function viagemEmCSV(viagem, amostras, opcoes = {}) {
  const resumo = viagem.resumo ?? {};
  const cabecalho = [
    ['Viagem', exibirDia(viagem.dia ?? '')],
    ['Início', horaCompleta(viagem.inicio)],
    ['Fim', horaCompleta(viagem.fim)],
    ['Distância (km)', numeroCSV(resumo.distancia, 2)],
    ['Velocidade média (km/h)', numeroCSV(resumo.velocidadeMedia, 1)],
    ['Velocidade máxima (km/h)', numeroCSV(resumo.velocidadeMaxima, 0)],
    ['Rotação máxima (rpm)', numeroCSV(resumo.rotacaoMaxima, 0)],
    ['Temperatura máxima (°C)', numeroCSV(resumo.temperaturaMaxima, 0)],
    ['Combustível estimado (L)', numeroCSV(resumo.litros, 2)],
    ['Consumo médio (km/L)', numeroCSV(resumo.consumoMedio, 1)],
    ['Origem do consumo', resumo.origemDoConsumo ?? 'não calculado'],
    ['Amostras', viagem.amostras ?? 0],
    [],
  ];
  const movimento = amostrasEmCSV(amostras, opcoes).replace(/^﻿/, '');
  return montarCSV(cabecalho) + movimento;
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
