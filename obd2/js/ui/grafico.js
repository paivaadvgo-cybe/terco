/**
 * O gráfico de uma viagem.
 *
 * SVG desenhado à mão, sem biblioteca: é uma linha, dois eixos e um rótulo, e
 * qualquer biblioteca de gráficos pesa mais que o aplicativo inteiro.
 *
 * **A redução de pontos é o que faz isto funcionar.** Meia hora gravada a cada
 * segundo são 1.800 pontos para 350 pixels de largura — cinco pontos por pixel.
 * Desenhá-los todos custa memória e não muda um pixel do resultado. Mas reduzir
 * pegando «um a cada cinco» apagaria justamente os picos, que são o que se quer
 * ver num gráfico de rotação. Então cada coluna de pixels guarda o seu mínimo e
 * o seu máximo: a linha fica com a mesma silhueta, com um quinto dos pontos.
 */

import { el } from './elementos.js';
import { valorDePid, unidadeDePid } from './formatar.js';
import { definicaoDe } from '../obd/pids.js';
import { hora } from '../dominio/datas.js';

const SVG = 'http://www.w3.org/2000/svg';
const LARGURA = 340;
const ALTURA = 150;
const MARGEM = { esquerda: 6, direita: 6, cima: 10, baixo: 18 };

function svg(etiqueta, atributos = {}) {
  const no = document.createElementNS(SVG, etiqueta);
  for (const [nome, valor] of Object.entries(atributos)) no.setAttribute(nome, String(valor));
  return no;
}

/** Mínimo e máximo por coluna de pixel, preservando os picos. */
export function reduzir(serie, colunas = LARGURA) {
  if (serie.length <= colunas) return serie;
  const primeiro = serie[0].t;
  const ultimo = serie[serie.length - 1].t;
  const duracao = Math.max(1, ultimo - primeiro);

  const caixas = new Map();
  for (const ponto of serie) {
    const coluna = Math.floor(((ponto.t - primeiro) / duracao) * (colunas - 1));
    const caixa = caixas.get(coluna);
    if (!caixa) caixas.set(coluna, { min: ponto, max: ponto });
    else {
      if (ponto.valor < caixa.min.valor) caixa.min = ponto;
      if (ponto.valor > caixa.max.valor) caixa.max = ponto;
    }
  }

  const reduzida = [];
  for (const coluna of [...caixas.keys()].sort((a, b) => a - b)) {
    const { min, max } = caixas.get(coluna);
    // Na ordem do tempo dentro da coluna: invertida, a linha desenha um zigue
    // que não aconteceu.
    reduzida.push(...(min.t <= max.t ? [min, max] : [max, min]));
  }
  return reduzida;
}

/**
 * Desenha a série de um PID.
 *
 * A escala vertical nasce dos dados, não da faixa do PID: num trecho de cidade,
 * um conta-giros desenhado de 0 a 8.000 rpm vira uma linha reta rente ao chão.
 * O zero é mantido quando os dados já chegam perto dele, que é o caso da
 * velocidade — cortar o eixo ali exageraria cada freada.
 */
export function criarGrafico(serie, pid) {
  if (!serie || serie.length < 2) {
    return el('p', { classe: 'vazio-mensagem', texto: 'Sem dados suficientes para o gráfico.' });
  }

  const pontos = reduzir(serie);
  const valores = pontos.map((p) => p.valor);
  const bruto = { min: Math.min(...valores), max: Math.max(...valores) };
  const min = bruto.min > 0 && bruto.min < bruto.max * 0.25 ? 0 : bruto.min;
  const max = bruto.max === min ? min + 1 : bruto.max;

  const t0 = pontos[0].t;
  const t1 = pontos[pontos.length - 1].t;
  const largura = LARGURA - MARGEM.esquerda - MARGEM.direita;
  const altura = ALTURA - MARGEM.cima - MARGEM.baixo;

  const x = (t) => MARGEM.esquerda + ((t - t0) / Math.max(1, t1 - t0)) * largura;
  const y = (valor) => MARGEM.cima + altura - ((valor - min) / (max - min)) * altura;

  const desenho = svg('svg', {
    viewBox: `0 0 ${LARGURA} ${ALTURA}`,
    class: 'grafico',
    role: 'img',
    'aria-label': `${definicaoDe(pid)?.nome ?? pid} ao longo da viagem`,
  });

  // Três linhas de grade: o bastante para dar noção de altura sem virar papel
  // quadriculado atrás de uma linha fina.
  for (const fracao of [0, 0.5, 1]) {
    const altura0 = MARGEM.cima + altura * fracao;
    desenho.append(svg('line', {
      x1: MARGEM.esquerda, x2: LARGURA - MARGEM.direita, y1: altura0, y2: altura0, class: 'grafico-grade',
    }));
  }

  const caminho = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ');
  desenho.append(svg('path', { d: caminho, class: 'grafico-linha' }));

  const eixo = el('div', { classe: 'grafico-eixo' }, [
    el('span', { texto: hora(t0) }),
    el('span', { texto: `${valorDePid(pid, min)} – ${valorDePid(pid, max)} ${unidadeDePid(pid)}` }),
    el('span', { texto: hora(t1) }),
  ]);

  return el('div', { classe: 'grafico-caixa' }, [desenho, eixo]);
}
