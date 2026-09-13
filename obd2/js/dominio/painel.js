/**
 * O painel personalizado: o que aparece, onde, de que tamanho e em que escala.
 *
 * **Por que uma grade, e não posição livre em pixels.** Arrastar para qualquer
 * ponto parece mais livre até o celular girar, ou até o painel ser aberto em
 * outro aparelho: um mostrador em «x = 280 px» some da tela de 360 px, e um
 * layout montado com carinho no aparelho de casa chega torto no do carro. Numa
 * grade de colunas, a mesma configuração se estica e encolhe sem perder a
 * disposição — o que estava no canto superior direito continua lá.
 *
 * A grade também resolve o alinhamento sozinha. Sem ela, encostar dois
 * mostradores um no outro com o dedo, num celular balançando no suporte, é uma
 * tarefa de precisão que ninguém quer fazer dirigindo.
 *
 * **Mínimo e máximo por item, e não por PID.** A tabela de PIDs traz uma escala
 * genérica: rotação de 0 a 8.000 serve para quase tudo e é larga demais para um
 * diesel que corta em 4.500. Quem personaliza quer a escala do *seu* carro, e a
 * escala muda onde o ponteiro para — que é a informação inteira de um mostrador
 * analógico.
 */

import { definicaoDe } from '../obd/pids.js';

/** Quantas configurações diferentes cabem. */
export const LIMITE_DE_PAINEIS = 5;

/** Colunas da grade. Quatro cabem num celular em pé sem virar régua. */
export const COLUNAS = 4;

/** O maior painel que se pode montar, em linhas. */
export const LINHAS_MAXIMAS = 12;

export const TIPOS = {
  ponteiro: { nome: 'Ponteiro', minimo: { largura: 2, altura: 2 } },
  mostrador: { nome: 'Número', minimo: { largura: 1, altura: 1 } },
  barra: { nome: 'Barra', minimo: { largura: 2, altura: 1 } },
};

function novoId(prefixo) {
  return `${prefixo}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Um item do painel.
 *
 * `min` e `max` ficam indefinidos até alguém mexer: assim a escala acompanha a
 * tabela de PIDs, e um item criado hoje não congela o limite que a tabela tinha
 * hoje. Quem define um limite passa a mandar nele, e é isso que se espera de
 * uma personalização.
 */
export function criarItem(chave, tipo = 'mostrador', posicao = {}) {
  const medida = TIPOS[tipo] ?? TIPOS.mostrador;
  return {
    id: novoId('i'),
    chave: String(chave).toUpperCase(),
    tipo: TIPOS[tipo] ? tipo : 'mostrador',
    x: posicao.x ?? 0,
    y: posicao.y ?? 0,
    largura: posicao.largura ?? medida.minimo.largura,
    altura: posicao.altura ?? medida.minimo.altura,
    min: posicao.min,
    max: posicao.max,
  };
}

/** A escala efetiva de um item: a dele, se tiver; a do PID, se não. */
export function escalaDe(item) {
  const definicao = definicaoDe(item.chave) ?? {};
  const min = Number.isFinite(item.min) ? item.min : (definicao.min ?? 0);
  const max = Number.isFinite(item.max) ? item.max : (definicao.max ?? 100);
  // Máximo igual ou menor que o mínimo dividiria por zero e o ponteiro ficaria
  // parado no começo da escala para qualquer valor.
  return max > min ? { min, max } : { min, max: min + 1 };
}

/** Os retângulos de dois itens se encostam? */
export function colide(a, b) {
  return a.x < b.x + b.largura
    && b.x < a.x + a.largura
    && a.y < b.y + b.altura
    && b.y < a.y + a.altura;
}

/** Cabe nesta posição, sem sair da grade nem cobrir outro item? */
export function cabe(item, posicao, outros) {
  const alvo = { ...item, ...posicao };
  if (alvo.x < 0 || alvo.y < 0) return false;
  if (alvo.x + alvo.largura > COLUNAS) return false;
  if (alvo.y + alvo.altura > LINHAS_MAXIMAS) return false;
  return !outros.some((outro) => outro.id !== item.id && colide(alvo, outro));
}

/**
 * O primeiro lugar vago onde um item deste tamanho cabe.
 *
 * Varre linha a linha, da esquerda para a direita — a mesma ordem em que se lê.
 * Devolve `null` quando não há espaço, e aí quem chamou avisa em vez de
 * empilhar o item novo por cima de outro.
 */
export function primeiroLugarVago(itens, largura, altura) {
  for (let y = 0; y + altura <= LINHAS_MAXIMAS; y += 1) {
    for (let x = 0; x + largura <= COLUNAS; x += 1) {
      const alvo = { id: null, x, y, largura, altura };
      if (!itens.some((outro) => colide(alvo, outro))) return { x, y };
    }
  }
  return null;
}

/**
 * Move um item, trocando de lugar com quem estiver lá se der.
 *
 * A troca só acontece entre itens do mesmo tamanho — é a única em que o
 * resultado é previsível. Arrastar um ponteiro de 2×2 para cima de um mostrador
 * de 1×1 não tem resposta óbvia, e inventar uma (empurrar? encolher? empilhar?)
 * seria pior que recusar e deixar a pessoa escolher outro lugar.
 *
 * Devolve a lista nova, ou `null` quando não dá — e quem chamou avisa.
 */
export function mover(itens, id, destino) {
  const item = itens.find((i) => i.id === id);
  if (!item) return null;

  const outros = itens.filter((i) => i.id !== id);
  const alvo = { ...item, x: destino.x, y: destino.y };

  if (alvo.x < 0 || alvo.y < 0 || alvo.x + alvo.largura > COLUNAS) return null;
  if (alvo.y + alvo.altura > LINHAS_MAXIMAS) return null;

  const atrapalham = outros.filter((outro) => colide(alvo, outro));
  if (atrapalham.length === 0) {
    return itens.map((i) => (i.id === id ? alvo : i));
  }

  if (atrapalham.length === 1) {
    const vizinho = atrapalham[0];
    const mesmoTamanho = vizinho.largura === item.largura && vizinho.altura === item.altura;
    if (mesmoTamanho) {
      return itens.map((i) => {
        if (i.id === id) return alvo;
        if (i.id === vizinho.id) return { ...vizinho, x: item.x, y: item.y };
        return i;
      });
    }
  }
  return null;
}

/** Redimensiona um item, se o tamanho novo couber. */
export function redimensionar(itens, id, tamanho) {
  const item = itens.find((i) => i.id === id);
  if (!item) return null;

  const minimo = (TIPOS[item.tipo] ?? TIPOS.mostrador).minimo;
  const largura = Math.max(minimo.largura, Math.min(COLUNAS, tamanho.largura));
  const altura = Math.max(minimo.altura, Math.min(LINHAS_MAXIMAS, tamanho.altura));

  if (!cabe(item, { largura, altura }, itens)) return null;
  return itens.map((i) => (i.id === id ? { ...i, largura, altura } : i));
}

/** Quantas linhas o painel ocupa de fato. */
export function alturaDoPainel(itens) {
  return itens.reduce((maior, item) => Math.max(maior, item.y + item.altura), 0);
}

/**
 * O painel de fábrica.
 *
 * Dois ponteiros lado a lado no alto — que é onde o olho bate —, e o resto em
 * números embaixo. É o mesmo arranjo que o aplicativo tinha fixo antes de
 * existir personalização, para que quem nunca abrir o editor não perceba
 * diferença nenhuma.
 */
export function painelPadrao(nome = 'Padrão') {
  return {
    id: novoId('p'),
    nome,
    itens: [
      criarItem('0C', 'ponteiro', { x: 0, y: 0, largura: 2, altura: 2 }),
      criarItem('0D', 'ponteiro', { x: 2, y: 0, largura: 2, altura: 2 }),
      criarItem('CONSUMO', 'mostrador', { x: 0, y: 2, largura: 1, altura: 1 }),
      criarItem('MEDIA', 'mostrador', { x: 1, y: 2, largura: 1, altura: 1 }),
      criarItem('TURBO', 'mostrador', { x: 2, y: 2, largura: 1, altura: 1 }),
      criarItem('05', 'mostrador', { x: 3, y: 2, largura: 1, altura: 1 }),
      criarItem('11', 'mostrador', { x: 0, y: 3, largura: 1, altura: 1 }),
      criarItem('04', 'mostrador', { x: 1, y: 3, largura: 1, altura: 1 }),
      criarItem('42', 'mostrador', { x: 2, y: 3, largura: 1, altura: 1 }),
      criarItem('2F', 'mostrador', { x: 3, y: 3, largura: 1, altura: 1 }),
    ],
  };
}

/**
 * Põe um painel em forma, venha de onde vier.
 *
 * O que está gravado no aparelho foi escrito por uma versão anterior do
 * aplicativo, ou por um editor que travou no meio. Confiar nele sem conferir é
 * como o painel some: um item com `largura: 0` não aparece, um `x` fora da
 * grade empurra a linha inteira, e um `chave` que não existe mais desenha um
 * mostrador vazio para sempre.
 */
export function normalizar(painel, indice = 0) {
  const itens = [];

  for (const bruto of painel?.itens ?? []) {
    if (!bruto || !definicaoDe(bruto.chave)) continue;

    const tipo = TIPOS[bruto.tipo] ? bruto.tipo : 'mostrador';
    const minimo = TIPOS[tipo].minimo;
    const item = {
      id: bruto.id ?? novoId('i'),
      chave: String(bruto.chave).toUpperCase(),
      tipo,
      largura: Math.max(minimo.largura, Math.min(COLUNAS, Math.round(bruto.largura) || minimo.largura)),
      altura: Math.max(minimo.altura, Math.min(LINHAS_MAXIMAS, Math.round(bruto.altura) || minimo.altura)),
      min: Number.isFinite(bruto.min) ? bruto.min : undefined,
      max: Number.isFinite(bruto.max) ? bruto.max : undefined,
      x: Math.max(0, Math.round(bruto.x) || 0),
      y: Math.max(0, Math.round(bruto.y) || 0),
    };

    // Fora da grade ou por cima de outro: vai para o primeiro lugar vago, em
    // vez de sumir. Perder um mostrador em silêncio é pior que achá-lo noutro
    // canto.
    if (!cabe(item, {}, itens)) {
      const vago = primeiroLugarVago(itens, item.largura, item.altura);
      if (!vago) continue;
      item.x = vago.x;
      item.y = vago.y;
    }
    itens.push(item);
  }

  return {
    id: painel?.id ?? novoId('p'),
    nome: String(painel?.nome ?? `Painel ${indice + 1}`).slice(0, 24) || `Painel ${indice + 1}`,
    itens,
  };
}

/**
 * Converte a escolha antiga — uma lista de PIDs — no primeiro painel.
 *
 * Quem já tinha o aplicativo instalado escolheu mostradores numa tela que não
 * existe mais. Abrir a versão nova e encontrar o painel vazio seria perder essa
 * escolha sem aviso, então ela é lida uma vez e vira layout.
 */
export function converterEscolhaAntiga(lista) {
  const painel = painelPadrao();
  if (!Array.isArray(lista) || lista.length === 0) return painel;

  // Rotação e velocidade sempre foram os dois ponteiros grandes, estivessem ou
  // não na lista — a tela antiga nem os oferecia para escolher.
  const PONTEIROS = ['0C', '0D'];
  const restantes = lista.filter((chave) => !PONTEIROS.includes(chave) && definicaoDe(chave));

  /*
   * Consumo e média entram mesmo sem estarem na lista antiga.
   *
   * Eles nunca foram escolhíveis: eram cartões fixos, sempre na tela. Converter
   * só o que estava na lista os deixaria de fora, e quem atualizasse o
   * aplicativo veria o consumo simplesmente sumir — sem ter mexido em nada, e
   * sem nenhum aviso de que agora ele é um item que se acrescenta.
   */
  const chaves = ['CONSUMO', 'MEDIA', ...restantes.filter((c) => c !== 'CONSUMO' && c !== 'MEDIA')];

  const itens = [
    criarItem('0C', 'ponteiro', { x: 0, y: 0, largura: 2, altura: 2 }),
    criarItem('0D', 'ponteiro', { x: 2, y: 0, largura: 2, altura: 2 }),
  ];
  chaves.forEach((chave, ordem) => {
    itens.push(criarItem(chave, 'mostrador', { x: ordem % COLUNAS, y: 2 + Math.floor(ordem / COLUNAS) }));
  });

  return { ...painel, itens };
}

/** Os painéis gravados, em forma, com pelo menos um e no máximo cinco. */
export function normalizarTodos(paineis) {
  const lista = (Array.isArray(paineis) ? paineis : [])
    .slice(0, LIMITE_DE_PAINEIS)
    .map(normalizar)
    .filter((painel) => painel.itens.length > 0);
  return lista.length > 0 ? lista : [painelPadrao()];
}

/** As chaves que um painel precisa que o carro responda. */
export function chavesDoPainel(painel) {
  return [...new Set((painel?.itens ?? []).map((item) => item.chave))];
}
