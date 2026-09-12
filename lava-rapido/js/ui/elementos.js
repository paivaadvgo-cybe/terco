/**
 * Montagem de elementos.
 *
 * Meia dúzia de funções, e nenhuma biblioteca. O aplicativo tem dez telas
 * simples; um framework custaria mais no primeiro carregamento — que acontece
 * na rua, no 4G do bairro — do que economizaria em linhas.
 *
 * **Nada aqui usa `innerHTML` com dado do usuário.** Modelo de carro e
 * observação são texto que alguém digitou, e `textContent` é o que garante que
 * um `<` digitado por engano continue sendo um `<` na tela.
 */

export function el(etiqueta, propriedades = {}, filhos = []) {
  const no = document.createElement(etiqueta);
  const { classe, texto, atributos, dados, aoTocar, ...resto } = propriedades;

  if (classe) no.className = classe;
  if (texto !== undefined && texto !== null) no.textContent = String(texto);
  for (const [nome, valor] of Object.entries(atributos ?? {})) {
    if (valor === false || valor === null || valor === undefined) continue;
    no.setAttribute(nome, valor === true ? '' : String(valor));
  }
  for (const [nome, valor] of Object.entries(dados ?? {})) no.dataset[nome] = valor;
  for (const [nome, valor] of Object.entries(resto)) no[nome] = valor;
  if (aoTocar) no.addEventListener('click', aoTocar);

  for (const filho of [].concat(filhos)) {
    if (filho === null || filho === undefined || filho === false) continue;
    no.append(filho.nodeType ? filho : document.createTextNode(String(filho)));
  }
  return no;
}

export function limpar(no) {
  no.replaceChildren();
  return no;
}

/** Botão grande — o padrão do aplicativo. `tipo` pinta: principal, perigo, fantasma. */
export function botao(rotulo, aoTocar, { tipo = 'normal', classe = '', ...resto } = {}) {
  return el('button', {
    classe: `botao botao-${tipo} ${classe}`.trim(),
    type: 'button',
    aoTocar,
    ...resto,
  }, [rotulo]);
}

/** Cartão: o bloco branco com sombra que organiza quase toda tela. */
export function cartao(filhos, classe = '') {
  return el('section', { classe: `cartao ${classe}`.trim() }, filhos);
}

export function titulo(texto, nivel = 2, classe = '') {
  return el(`h${nivel}`, { texto, classe });
}

/** Linha de «rótulo à esquerda, valor à direita» — a forma de toda a parte financeira. */
export function linhaDeValor(rotulo, valor, classe = '') {
  return el('div', { classe: `linha-valor ${classe}`.trim() }, [
    el('span', { classe: 'linha-rotulo', texto: rotulo }),
    el('span', { classe: 'linha-numero', texto: valor }),
  ]);
}

export function vazio(mensagem, detalhe = '') {
  return el('div', { classe: 'vazio' }, [
    el('p', { classe: 'vazio-mensagem', texto: mensagem }),
    detalhe ? el('p', { classe: 'vazio-detalhe', texto: detalhe }) : null,
  ]);
}

/** Campo de formulário com rótulo preso ao controle, para o toque acertar. */
export function campo(rotulo, controle, dica = '') {
  const id = controle.id || `campo-${Math.random().toString(36).slice(2, 8)}`;
  controle.id = id;
  return el('div', { classe: 'campo' }, [
    el('label', { classe: 'campo-rotulo', texto: rotulo, htmlFor: id }),
    controle,
    dica ? el('p', { classe: 'campo-dica', texto: dica }) : null,
  ]);
}

export function entrada(propriedades = {}) {
  return el('input', { classe: 'entrada', type: 'text', ...propriedades });
}

export function selecao(opcoes, valor, propriedades = {}) {
  const campoSelecao = el('select', { classe: 'entrada', ...propriedades });
  for (const opcao of opcoes) {
    campoSelecao.append(el('option', { value: opcao.valor, texto: opcao.nome, selected: opcao.valor === valor }));
  }
  return campoSelecao;
}
