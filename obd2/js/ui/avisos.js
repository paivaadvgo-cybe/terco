/**
 * Avisos, confirmações e folhas.
 *
 * Duas coisas que o navegador já faz — `alert` e `confirm` — e que aqui são
 * refeitas por um motivo só: as nativas travam a página e aparecem como caixa
 * do sistema, com o nome do site no meio. Num aplicativo instalado isso denuncia
 * que não é um aplicativo, e num carro o botãozinho do sistema é difícil de
 * acertar.
 *
 * O que confirma destruição é sempre vermelho, e o botão que destrói nunca é o
 * primeiro na ordem de leitura. Apagar as falhas da central é irreversível e
 * zera os monitores de emissão; apagar uma viagem gravada perde o histórico.
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
