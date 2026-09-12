/**
 * Avisos, confirmações e o teclado do PIN.
 *
 * Três coisas que o navegador já faz — `alert`, `confirm`, `prompt` — e que
 * aqui são refeitas por um motivo só: as nativas travam a página e aparecem
 * como caixa do sistema, com o nome do site no meio. Num aplicativo instalado
 * isso denuncia que não é um aplicativo, e com uma mão ocupada o botãozinho do
 * sistema é difícil de acertar.
 *
 * O que confirma destruição é sempre vermelho, e o botão que destrói nunca é o
 * primeiro na ordem de leitura. Restaurar um backup por engano apaga o
 * movimento inteiro.
 */

import { el, botao } from './elementos.js';

let recipiente = null;

function area() {
  if (!recipiente) {
    recipiente = document.getElementById('avisos') ?? el('div', { id: 'avisos', classe: 'avisos' });
    if (!recipiente.isConnected) document.body.append(recipiente);
  }
  return recipiente;
}

/** Mensagem curta que some sozinha. `tipo`: ok, erro, atencao. */
export function avisar(mensagem, tipo = 'ok', duracao = 2600) {
  const aviso = el('output', { classe: `aviso aviso-${tipo}`, texto: mensagem, atributos: { role: 'status' } });
  area().append(aviso);
  setTimeout(() => {
    aviso.classList.add('saindo');
    setTimeout(() => aviso.remove(), 220);
  }, duracao);
  return aviso;
}

function abrirDialogo(conteudo, { aoFechar } = {}) {
  const dialogo = el('dialog', { classe: 'dialogo' }, [conteudo]);
  document.body.append(dialogo);
  dialogo.addEventListener('close', () => {
    aoFechar?.(dialogo.returnValue);
    dialogo.remove();
  });
  // Tocar fora fecha, como em qualquer folha de celular.
  dialogo.addEventListener('click', (evento) => {
    if (evento.target === dialogo) dialogo.close('');
  });
  dialogo.showModal();
  return dialogo;
}

/** Pergunta de sim ou não. Devolve `true` só com o toque no botão de ação. */
export function confirmar({
  titulo, texto = '', acao = 'Confirmar', cancelar = 'Cancelar', perigo = false,
}) {
  return new Promise((resolver) => {
    let resposta = false;
    const corpo = el('div', { classe: 'dialogo-corpo' }, [
      el('h2', { classe: 'dialogo-titulo', texto: titulo }),
      texto ? el('p', { classe: 'dialogo-texto', texto }) : null,
      el('div', { classe: 'dialogo-botoes' }, [
        botao(cancelar, () => dialogo.close(''), { tipo: 'fantasma' }),
        botao(acao, () => { resposta = true; dialogo.close('ok'); }, { tipo: perigo ? 'perigo' : 'principal' }),
      ]),
    ]);
    const dialogo = abrirDialogo(corpo, { aoFechar: () => resolver(resposta) });
  });
}

/**
 * Pede o PIN administrativo.
 *
 * Teclado numérico próprio, de teclas grandes: o do sistema abriria por cima da
 * tela e, em muitos aparelhos, com letras junto. Devolve o que foi digitado, ou
 * `null` se desistiram.
 */
export function pedirPin({ titulo = 'PIN administrativo', texto = '' } = {}) {
  return new Promise((resolver) => {
    let digitado = '';
    let resposta = null;

    const pontos = el('div', { classe: 'pin-pontos' });
    const desenhar = () => {
      pontos.replaceChildren(...Array.from({ length: Math.max(4, digitado.length) }, (_, i) => el('span', {
        classe: `pin-ponto ${i < digitado.length ? 'cheio' : ''}`.trim(),
      })));
    };

    const teclar = (tecla) => {
      if (tecla === 'apagar') digitado = digitado.slice(0, -1);
      else if (digitado.length < 6) digitado += tecla;
      desenhar();
      if (digitado.length === 6) confirmarPin();
    };

    const confirmarPin = () => {
      resposta = digitado;
      dialogo.close('ok');
    };

    const teclado = el('div', { classe: 'pin-teclado' }, [
      ...'123456789'.split('').map((t) => botao(t, () => teclar(t), { tipo: 'tecla' })),
      botao('⌫', () => teclar('apagar'), { tipo: 'tecla' }),
      botao('0', () => teclar('0'), { tipo: 'tecla' }),
      botao('OK', confirmarPin, { tipo: 'tecla-ok' }),
    ]);

    const corpo = el('div', { classe: 'dialogo-corpo' }, [
      el('h2', { classe: 'dialogo-titulo', texto: titulo }),
      texto ? el('p', { classe: 'dialogo-texto', texto }) : null,
      pontos,
      teclado,
      botao('Cancelar', () => dialogo.close(''), { tipo: 'fantasma', classe: 'largo' }),
    ]);

    desenhar();
    const dialogo = abrirDialogo(corpo, { aoFechar: () => resolver(resposta) });
  });
}

/** Folha que sobe de baixo, para conteúdo maior que um aviso. */
export function abrirFolha(titulo, conteudo, { aoFechar } = {}) {
  const corpo = el('div', { classe: 'dialogo-corpo folha' }, [
    el('div', { classe: 'folha-topo' }, [
      el('h2', { classe: 'dialogo-titulo', texto: titulo }),
      botao('✕', () => dialogo.close(''), { tipo: 'fantasma', classe: 'fechar', atributos: { 'aria-label': 'Fechar' } }),
    ]),
    conteudo,
  ]);
  const dialogo = abrirDialogo(corpo, { aoFechar });
  return { fechar: () => dialogo.close(''), dialogo };
}
