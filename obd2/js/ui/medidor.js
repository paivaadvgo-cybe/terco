/**
 * Os ponteiros do painel.
 *
 * Desenhados em SVG e atualizados por atributo, e não redesenhados: o painel
 * recebe valor novo várias vezes por segundo, e recriar o elemento a cada
 * leitura faz o navegador refazer o desenho inteiro — no celular isso aparece
 * como engasgo, justamente quando o carro acelera e há mais o que mostrar.
 *
 * **Sem ponteiro girando, de propósito.** Um arco que cresce é legível de
 * relance, com o celular preso ao painel e o olho voltando para a estrada. Um
 * ponteiro fino exige foco para ler a escala, que é exatamente o que não se tem
 * dirigindo. O número grande no meio é o que se lê; o arco é só a noção de
 * «perto do fim».
 */

import { el } from './elementos.js';
import { valorDePid, unidadeDePid } from './formatar.js';
import { definicaoDe } from '../obd/pids.js';

const SVG = 'http://www.w3.org/2000/svg';

function svg(etiqueta, atributos = {}) {
  const no = document.createElementNS(SVG, etiqueta);
  for (const [nome, valor] of Object.entries(atributos)) no.setAttribute(nome, String(valor));
  return no;
}

/** O caminho do arco e o seu comprimento, para o traço crescer sem medir nada. */
const RAIO = 76;
const CENTRO = { x: 100, y: 104 };
const COMPRIMENTO = Math.PI * RAIO;
const CAMINHO = `M ${CENTRO.x - RAIO},${CENTRO.y} A ${RAIO},${RAIO} 0 0 1 ${CENTRO.x + RAIO},${CENTRO.y}`;

/**
 * Em que faixa o valor está: boa, atenção ou perigo.
 *
 * Quando o PID declara uma faixa boa (temperatura do motor, tensão), é ela que
 * manda — 92 °C é excelente e 40 °C é motor frio, e nenhum dos dois é «perto do
 * fim da escala». Sem faixa declarada, vale a proximidade do limite, que é o
 * comportamento esperado num conta-giros.
 */
function faixa(definicao, valor) {
  if (!Number.isFinite(valor)) return 'sem';
  if (definicao?.faixaBoa) {
    const [baixo, alto] = definicao.faixaBoa;
    if (valor < baixo) return 'frio';
    if (valor > alto * 1.08) return 'perigo';
    if (valor > alto) return 'atencao';
    return 'boa';
  }
  const max = definicao?.max ?? 100;
  const fracao = valor / max;
  if (fracao > 0.92) return 'perigo';
  if (fracao > 0.8) return 'atencao';
  return 'boa';
}

/**
 * Um ponteiro grande.
 *
 * Devolve `{ no, atualizar }`. `atualizar(null)` é um estado de verdade: o carro
 * parou de responder aquele PID, e o mostrador mostra travessão em vez de
 * congelar no último número — congelado, ninguém percebe que a leitura morreu.
 */
export function criarMedidor(pid, { titulo = null } = {}) {
  const definicao = definicaoDe(pid) ?? {};
  const minimo = definicao.min ?? 0;
  const maximo = definicao.max ?? 100;

  const desenho = svg('svg', {
    viewBox: '0 0 200 114',
    class: 'medidor-desenho',
    role: 'img',
    'aria-label': titulo ?? definicao.nome ?? pid,
  });
  desenho.append(svg('path', { d: CAMINHO, class: 'medidor-trilho' }));

  const arco = svg('path', {
    d: CAMINHO,
    class: 'medidor-arco',
    'stroke-dasharray': `0 ${COMPRIMENTO}`,
  });
  desenho.append(arco);

  const numero = el('span', { classe: 'medidor-numero', texto: '—' });
  const unidade = el('span', { classe: 'medidor-unidade', texto: unidadeDePid(pid) });
  const rotulo = el('span', { classe: 'medidor-titulo', texto: titulo ?? definicao.curto ?? definicao.nome ?? pid });

  const no = el('div', { classe: 'medidor', dados: { pid } }, [
    desenho,
    el('div', { classe: 'medidor-centro' }, [numero, unidade]),
    rotulo,
  ]);

  let ultimo;
  return {
    no,
    atualizar(valor) {
      if (valor === ultimo) return;
      ultimo = valor;

      numero.textContent = valorDePid(pid, valor);
      const fracao = Number.isFinite(valor)
        ? Math.min(1, Math.max(0, (valor - minimo) / (maximo - minimo)))
        : 0;
      arco.setAttribute('stroke-dasharray', `${(COMPRIMENTO * fracao).toFixed(1)} ${COMPRIMENTO}`);
      no.dataset.faixa = faixa(definicao, valor);
    },
  };
}

/**
 * Um mostrador pequeno, sem arco.
 *
 * Para o que não tem escala interessante — tensão, temperatura do ar, tempo de
 * motor ligado. Cabem seis numa tela de celular sem espremer nada.
 */
export function criarMostrador(pid, { titulo = null } = {}) {
  const definicao = definicaoDe(pid) ?? {};
  const numero = el('span', { classe: 'mostrador-numero', texto: '—' });
  const unidade = el('span', { classe: 'mostrador-unidade', texto: unidadeDePid(pid) });
  const no = el('div', { classe: 'mostrador', dados: { pid } }, [
    el('span', { classe: 'mostrador-titulo', texto: titulo ?? definicao.curto ?? definicao.nome ?? pid }),
    el('div', { classe: 'mostrador-linha' }, [numero, unidade]),
  ]);

  let ultimo;
  return {
    no,
    atualizar(valor) {
      if (valor === ultimo) return;
      ultimo = valor;
      numero.textContent = valorDePid(pid, valor);
      no.dataset.faixa = faixa(definicao, valor);
    },
  };
}

/** Um mostrador de texto livre — consumo, distância, o que não é PID. */
export function criarCartaoDeValor(titulo, { unidade = '', dica = '' } = {}) {
  const numero = el('span', { classe: 'mostrador-numero', texto: '—' });
  const sufixo = el('span', { classe: 'mostrador-unidade', texto: unidade });
  const detalhe = el('span', { classe: 'mostrador-dica', texto: dica });
  const no = el('div', { classe: 'mostrador' }, [
    el('span', { classe: 'mostrador-titulo', texto: titulo }),
    el('div', { classe: 'mostrador-linha' }, [numero, sufixo]),
    detalhe,
  ]);

  return {
    no,
    /**
     * A unidade entra separada do número, e não emendada no texto.
     *
     * Junto, «0,8 L/h» é uma palavra só de dezoito pixels de altura, e numa
     * caixa de cem pixels ela quebra no meio — o mostrador cresce, empurra os
     * vizinhos e a grade inteira dança a cada leitura.
     */
    atualizar(texto, novaDica = null, novaUnidade = null) {
      numero.textContent = texto ?? '—';
      if (novaDica !== null) detalhe.textContent = novaDica;
      if (novaUnidade !== null) sufixo.textContent = novaUnidade;
    },
  };
}
