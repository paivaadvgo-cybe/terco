/**
 * Arrastar e redimensionar na grade, com o dedo.
 *
 * **Eventos de ponteiro, e não de toque nem de mouse.** `pointerdown` cobre
 * dedo, caneta e mouse com um código só — e, mais importante, traz a captura de
 * ponteiro: uma vez agarrado, o elemento continua recebendo os eventos mesmo
 * quando o dedo sai de cima dele. Sem isso, arrastar rápido larga o item no
 * meio do caminho, que é exatamente o que acontece num celular balançando.
 *
 * **A folga antes de começar a arrastar.** Um toque nunca é perfeitamente
 * parado: o dedo desliza dois ou três pixels ao encostar. Sem uma folga, todo
 * toque vira um arrasto de zero células, e abrir os ajustes de um mostrador
 * passa a ser impossível — o toque sempre «vira» arrasto. Oito pixels separam
 * as duas intenções com folga.
 *
 * **`touch-action: none` é obrigatório, e mora no CSS.** Sem ele o navegador
 * rola a página junto com o arrasto, e o item foge do dedo enquanto a tela anda
 * atrás. É a causa número um de arrasto que não funciona em celular.
 */

import { COLUNAS } from '../dominio/painel.js';

/** Quanto o dedo precisa andar para virar arrasto, em pixels. */
const FOLGA = 8;

/**
 * Liga o arrastar e o redimensionar numa grade.
 *
 * `aoMover` e `aoRedimensionar` recebem a posição já em células e devolvem
 * `true` se aceitaram. Recusar é normal — o lugar pode estar ocupado —, e a
 * recusa volta como uma sacudida no item, que é como se diz «não cabe» sem
 * texto.
 */
export function ligarGrade(grade, {
  aoMover,
  aoRedimensionar,
  aoTocarItem,
  colunas = COLUNAS,
} = {}) {
  let arrasto = null;

  /** O tamanho de uma célula, medido na tela. */
  function celula() {
    const caixa = grade.getBoundingClientRect();
    const estilo = getComputedStyle(grade);
    const vao = Number.parseFloat(estilo.gap || estilo.columnGap || '8') || 8;
    const largura = (caixa.width - vao * (colunas - 1)) / colunas;

    /*
     * A altura vem das linhas **já resolvidas**, e não de `grid-auto-rows`.
     *
     * Quando as linhas dividem a altura disponível — `minmax(0, 1fr)`, que é o
     * que a tela deitada exige —, `gridAutoRows` devolve o texto da função, e
     * `parseFloat` disso não é número. O arrasto passava a medir a linha com a
     * largura da coluna, e o item pulava duas células a cada célula que o dedo
     * andava para baixo.
     */
    const primeira = Number.parseFloat(estilo.gridTemplateRows);
    const altura = Number.isFinite(primeira) && primeira > 0
      ? primeira
      : (Number.parseFloat(estilo.gridAutoRows) || largura);
    return { largura, altura, vao, caixa };
  }

  function sacudir(no) {
    no.classList.remove('sacudindo');
    // Forçar o cálculo do estilo reinicia a animação; sem isso, duas recusas
    // seguidas só sacodem na primeira.
    void no.offsetWidth;
    no.classList.add('sacudindo');
    setTimeout(() => no.classList.remove('sacudindo'), 350);
  }

  grade.addEventListener('pointerdown', (evento) => {
    const alca = evento.target.closest('.alca-de-tamanho');
    const no = evento.target.closest('.item-do-painel');
    if (!no || !grade.contains(no)) return;

    const medida = celula();
    arrasto = {
      no,
      id: no.dataset.id,
      modo: alca ? 'tamanho' : 'posicao',
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      origem: {
        x: Number(no.dataset.x),
        y: Number(no.dataset.y),
        largura: Number(no.dataset.largura),
        altura: Number(no.dataset.altura),
      },
      medida,
      moveu: false,
      ultimo: null,
    };
    no.setPointerCapture(evento.pointerId);
  });

  grade.addEventListener('pointermove', (evento) => {
    if (!arrasto) return;
    const dx = evento.clientX - arrasto.inicioX;
    const dy = evento.clientY - arrasto.inicioY;

    if (!arrasto.moveu) {
      if (Math.hypot(dx, dy) < FOLGA) return;
      arrasto.moveu = true;
      arrasto.no.classList.add('arrastando');
    }
    evento.preventDefault();

    const passoX = arrasto.medida.largura + arrasto.medida.vao;
    const passoY = arrasto.medida.altura + arrasto.medida.vao;
    const celulasX = Math.round(dx / passoX);
    const celulasY = Math.round(dy / passoY);

    if (arrasto.modo === 'posicao') {
      // Enquanto o dedo anda, o item segue em pixels: pular de célula em célula
      // durante o arrasto faz o mostrador parecer preso, e a pessoa duvida se
      // está funcionando. O encaixe acontece ao soltar.
      arrasto.no.style.transform = `translate(${dx}px, ${dy}px)`;
      arrasto.ultimo = { x: arrasto.origem.x + celulasX, y: arrasto.origem.y + celulasY };
    } else {
      const largura = Math.max(1, Math.min(colunas, arrasto.origem.largura + celulasX));
      const altura = Math.max(1, arrasto.origem.altura + celulasY);
      arrasto.ultimo = { largura, altura };
      // O tamanho encaixa na hora: aqui o passo largo é a informação — mostra
      // exatamente quantas células o item vai ocupar.
      if (aoRedimensionar?.(arrasto.id, arrasto.ultimo, { previa: true }) === false) sacudir(arrasto.no);
    }
  });

  function soltar(evento) {
    if (!arrasto) return;
    const { no, id, modo, moveu, ultimo } = arrasto;
    arrasto = null;

    no.style.transform = '';
    no.classList.remove('arrastando');
    try {
      no.releasePointerCapture(evento.pointerId);
    } catch { /* já solto */ }

    if (!moveu) {
      aoTocarItem?.(id);
      return;
    }
    if (!ultimo) return;

    const aceitou = modo === 'posicao'
      ? aoMover?.(id, ultimo)
      : aoRedimensionar?.(id, ultimo, { previa: false });

    if (aceitou === false) sacudir(no);
  }

  grade.addEventListener('pointerup', soltar);
  grade.addEventListener('pointercancel', soltar);

  return {
    desligar() {
      arrasto = null;
    },
  };
}

/** Põe o item na célula certa da grade do CSS. */
export function posicionarNaGrade(no, item) {
  no.dataset.id = item.id;
  no.dataset.x = item.x;
  no.dataset.y = item.y;
  no.dataset.largura = item.largura;
  no.dataset.altura = item.altura;
  // As linhas e colunas do CSS contam a partir de 1, e as do modelo a partir de
  // 0. Misturar as duas convenções desloca o painel inteiro em uma célula.
  no.style.gridColumn = `${item.x + 1} / span ${item.largura}`;
  no.style.gridRow = `${item.y + 1} / span ${item.altura}`;
}

/**
 * Mantém as células quadradas em qualquer largura de tela.
 *
 * O CSS não calcula «a altura da linha é igual à largura da coluna»: a largura
 * da coluna depende do espaço disponível, que só existe depois do desenho. Sem
 * isto, a altura da linha teria de ser um número fixo em pixels — e o mesmo
 * painel sairia achatado num celular estreito e esticado num tablet, com um
 * item de 2×2 deixando de ser quadrado.
 *
 * Devolve a função que desliga a observação; a tela a chama ao sair.
 */
export function manterCelulasQuadradas(grade, colunas = COLUNAS) {
  const medir = () => {
    const vao = Number.parseFloat(getComputedStyle(grade).columnGap || '8') || 8;
    const largura = (grade.clientWidth - vao * (colunas - 1)) / colunas;
    if (largura > 0) grade.style.setProperty('--celula', `${largura.toFixed(2)}px`);
  };

  medir();
  if (typeof ResizeObserver === 'undefined') {
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }
  const observador = new ResizeObserver(medir);
  observador.observe(grade);
  return () => observador.disconnect();
}
