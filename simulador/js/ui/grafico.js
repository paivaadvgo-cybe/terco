/**
 * Gráfico de linhas em SVG, desenhado à mão.
 *
 * Sem biblioteca, por dois motivos que se somam: o aplicativo precisa
 * funcionar sem internet, e trazer um pacote de gráficos por CDN quebraria
 * isso; e o que estes gráficos precisam — duas linhas, eixo de parcelas,
 * cruzeta e leitura ao passar o dedo — cabe em duzentas linhas.
 *
 * O SVG é redesenhado na largura real do quadro, e não esticado por
 * `viewBox`. Um `viewBox` fixo escalado para a tela de um celular reduziria
 * junto o texto dos eixos, e um rótulo de 12px viraria 6px — ilegível
 * exatamente no aparelho em que o simulador mais vai ser usado.
 */

import { criar } from './formulario.js';

const NS = 'http://www.w3.org/2000/svg';
const ALTURA = 260;
const MARGEM = { topo: 16, baixo: 30, esquerda: 56 };

/** Espaço à direita para o rótulo de ponta, quando ele couber. */
const FOLGA_ROTULO = 66;
/** Abaixo desta largura de plotagem, o rótulo de ponta não cabe sem apertar. */
const LARGURA_MINIMA_COM_ROTULO = 200;
/** Rótulos mais próximos que isto se sobrepõem; melhor nenhum que dois ilegíveis. */
const DISTANCIA_MINIMA_ENTRE_ROTULOS = 13;

const svg = (tag, atributos = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(atributos)) {
    if (v !== null && v !== undefined) el.setAttribute(k, v);
  }
  return el;
};

/** Escadas de 1, 2 ou 5 vezes uma potência de dez — as que se leem sem esforço. */
export function passoLegivel(bruto) {
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const normalizado = bruto / potencia;
  const passo = normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 5 ? 5 : 10;
  return passo * potencia;
}

export function marcasDoEixo(minimo, maximo, quantidade = 4) {
  if (maximo === minimo) return [minimo];
  const passo = passoLegivel((maximo - minimo) / quantidade);
  const marcas = [];
  for (let v = Math.ceil(minimo / passo) * passo; v <= maximo + 1e-9; v += passo) marcas.push(v);
  return marcas;
}

/**
 * @param {HTMLElement} raiz
 * @param {object} opcoes
 * @param {string} opcoes.titulo
 * @param {Array<{nome, classe, pontos: number[]}>} opcoes.series  Um valor por parcela.
 * @param {(v:number)=>string} opcoes.formatar       Para a leitura e o rótulo final.
 * @param {(v:number)=>string} opcoes.formatarEixo   Mais curto, para o eixo.
 * @param {(v:number)=>string} [opcoes.formatarPonta] Para o rótulo de ponta.
 */
export function desenharGrafico(raiz, opcoes) {
  const quadro = criar('figure', { class: 'grafico' }, [
    criar('figcaption', { texto: opcoes.titulo }),
  ]);

  const legenda = criar('div', { class: 'legenda' }, opcoes.series.map((s) => criar('span', {
    class: `chave ${s.classe}`,
  }, [criar('span', { class: 'traco' }), s.nome])));
  quadro.append(legenda);

  const area = criar('div', {
    class: 'area-grafico', tabindex: '0', role: 'img',
    'aria-label': `${opcoes.titulo}. ${opcoes.series.map((s) => s.nome).join(' e ')}`
      + `, ao longo de ${opcoes.series[0].pontos.length} parcelas.`,
  });
  const leitura = criar('div', { class: 'leitura', hidden: true });
  quadro.append(area, leitura);
  raiz.append(quadro);

  let indice = null;

  const render = () => {
    // Esvaziar antes de medir não é zelo: o SVG anterior tem largura fixa em
    // atributo, e um SVG largo demais escora o próprio contêiner aberto. Medir
    // com ele dentro devolveria a largura que ele impôs, e o gráfico nunca
    // encolheria de volta — a página inteira passaria a rolar para o lado no
    // celular.
    area.replaceChildren();
    const largura = Math.max(Math.floor(area.clientWidth) || 320, 240);
    const n = opcoes.series[0].pontos.length;
    const todos = opcoes.series.flatMap((s) => s.pontos);
    const alto = Math.max(...todos, 0);
    const baixo = Math.min(...todos, 0);

    // O rótulo de ponta não é clipado quando falta espaço: ou cabe inteiro, ou
    // não é desenhado. A legenda e a leitura continuam identificando as séries,
    // então nada se perde a não ser a conveniência.
    const cabeRotulo = largura - MARGEM.esquerda - FOLGA_ROTULO >= LARGURA_MINIMA_COM_ROTULO;
    const margemDireita = cabeRotulo ? FOLGA_ROTULO : 14;
    const larguraUtil = largura - MARGEM.esquerda - margemDireita;
    const alturaUtil = ALTURA - MARGEM.topo - MARGEM.baixo;
    const px = (i) => MARGEM.esquerda + (n === 1 ? larguraUtil / 2 : (i / (n - 1)) * larguraUtil);
    const py = (v) => MARGEM.topo + alturaUtil - (alto === baixo ? 0 : ((v - baixo) / (alto - baixo)) * alturaUtil);

    const desenho = svg('svg', { width: largura, height: ALTURA, class: 'tela' });

    // Grade horizontal: fio de um passo acima da superfície, sólido e discreto.
    for (const marca of marcasDoEixo(baixo, alto)) {
      const y = py(marca);
      desenho.append(svg('line', { class: 'grade', x1: MARGEM.esquerda, x2: largura - margemDireita, y1: y, y2: y }));
      const rotulo = svg('text', { class: 'rotulo-eixo', x: MARGEM.esquerda - 8, y: y + 4, 'text-anchor': 'end' });
      rotulo.textContent = opcoes.formatarEixo(marca);
      desenho.append(rotulo);
    }

    // Eixo das parcelas: primeira, meio e última, que é o que se lê de relance.
    for (const i of n <= 2 ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1]) {
      const t = svg('text', { class: 'rotulo-eixo', x: px(i), y: ALTURA - 10, 'text-anchor': 'middle' });
      t.textContent = String(i + 1);
      desenho.append(t);
    }

    const cruzeta = svg('line', {
      class: 'cruzeta', y1: MARGEM.topo, y2: ALTURA - MARGEM.baixo, x1: 0, x2: 0, visibility: 'hidden',
    });
    desenho.append(cruzeta);

    // Duas pontas quase na mesma altura viram um borrão. Nesse caso os dois
    // rótulos saem, e não um só — deixar um seria dizer que aquela série é a
    // que importa.
    const alturasFinais = opcoes.series.map((s) => py(s.pontos[n - 1]));
    const rotulosSeparados = alturasFinais.every((y, i) => alturasFinais.every(
      (outro, j) => i === j || Math.abs(y - outro) >= DISTANCIA_MINIMA_ENTRE_ROTULOS));
    const rotularPontas = cabeRotulo && rotulosSeparados;

    const marcadores = [];
    for (const s of opcoes.series) {
      const d = s.pontos.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(2)},${py(v).toFixed(2)}`).join(' ');
      desenho.append(svg('path', { class: `linha ${s.classe}`, d }));

      // Ponta: marcador com anel da cor da superfície, e o valor rotulado
      // direto na linha — com duas séries, o rótulo direto vem antes da grade.
      const ux = px(n - 1);
      const uy = py(s.pontos[n - 1]);
      desenho.append(svg('circle', { class: `ponta ${s.classe}`, cx: ux, cy: uy, r: 4.5 }));
      if (rotularPontas) {
        const fim = svg('text', { class: 'rotulo-fim', x: ux + 9, y: uy + 4 });
        fim.textContent = (opcoes.formatarPonta ?? opcoes.formatarEixo)(s.pontos[n - 1]);
        desenho.append(fim);
      }

      const m = svg('circle', { class: `marcador ${s.classe}`, r: 4.5, visibility: 'hidden' });
      desenho.append(m);
      marcadores.push(m);
    }

    const captura = svg('rect', {
      class: 'captura', x: MARGEM.esquerda, y: MARGEM.topo,
      width: Math.max(larguraUtil, 1), height: alturaUtil,
    });
    desenho.append(captura);

    const mostrar = (i) => {
      indice = Math.max(0, Math.min(n - 1, i));
      const x = px(indice);
      cruzeta.setAttribute('x1', x);
      cruzeta.setAttribute('x2', x);
      cruzeta.setAttribute('visibility', 'visible');
      opcoes.series.forEach((s, k) => {
        marcadores[k].setAttribute('cx', x);
        marcadores[k].setAttribute('cy', py(s.pontos[indice]));
        marcadores[k].setAttribute('visibility', 'visible');
      });
      leitura.hidden = false;
      leitura.replaceChildren(
        criar('strong', { texto: `Parcela ${indice + 1}` }),
        ...opcoes.series.map((s) => criar('span', { class: 'linha-leitura' }, [
          criar('span', { class: `chave ${s.classe}` }, [criar('span', { class: 'traco' })]),
          criar('span', { class: 'numero', texto: opcoes.formatar(s.pontos[indice]) }),
          criar('span', { class: 'nome', texto: s.nome }),
        ])),
      );
    };

    const esconder = () => {
      indice = null;
      cruzeta.setAttribute('visibility', 'hidden');
      for (const m of marcadores) m.setAttribute('visibility', 'hidden');
      leitura.hidden = true;
    };

    // A cruzeta acha o X: mira-se numa parcela, nunca num traço de 2px.
    const doPonteiro = (evento) => {
      const caixa = desenho.getBoundingClientRect();
      const relativo = evento.clientX - caixa.left - MARGEM.esquerda;
      mostrar(Math.round((relativo / larguraUtil) * (n - 1)));
    };
    captura.addEventListener('pointermove', doPonteiro);
    captura.addEventListener('pointerdown', doPonteiro);
    area.addEventListener('pointerleave', esconder);

    // Pelo teclado se chega ao mesmo lugar, com as mesmas informações.
    area.addEventListener('keydown', (e) => {
      const passo = e.shiftKey ? 12 : 1;
      if (e.key === 'ArrowRight') { mostrar((indice ?? -1) + passo); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { mostrar((indice ?? n) - passo); e.preventDefault(); }
      else if (e.key === 'Home') { mostrar(0); e.preventDefault(); }
      else if (e.key === 'End') { mostrar(n - 1); e.preventDefault(); }
      else if (e.key === 'Escape') esconder();
    });
    area.addEventListener('blur', esconder);

    area.append(desenho);
  };

  render();
  if (typeof ResizeObserver !== 'undefined') {
    let largura = area.clientWidth;
    new ResizeObserver(() => {
      if (Math.abs(area.clientWidth - largura) > 8) { largura = area.clientWidth; render(); }
    }).observe(area);
  }
  return quadro;
}
