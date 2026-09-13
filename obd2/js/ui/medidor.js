/**
 * Os ponteiros do painel.
 *
 * Desenhados em SVG e atualizados por atributo, e não redesenhados: o painel
 * recebe valor novo várias vezes por segundo, e recriar o elemento a cada
 * leitura faz o navegador refazer o desenho inteiro — no celular isso aparece
 * como engasgo, justamente quando o carro acelera e há mais o que mostrar.
 *
 * **Ponteiro e número, juntos.** O ponteiro sobre uma escala numerada é o que
 * se lê de relance, sem focar: a posição no mostrador já diz «perto de cento e
 * vinte» antes de o olho decifrar dígito nenhum — é para isso que o painel de
 * um carro é analógico há cem anos. O número no vão de baixo é para quando se
 * quer o valor exato, parado no semáforo. Um sem o outro perde metade.
 *
 * Os números da escala existem por isso: um ponteiro sem eles mostra «mais ou
 * menos no meio», e não «cento e vinte».
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

/*
 * A geometria do mostrador.
 *
 * Duzentos e quarenta graus, começando em 150° e terminando em 390° — que é a
 * abertura de um velocímetro de carro, e não por estética: com o ponteiro
 * partindo de baixo à esquerda, a faixa de velocidade em que se dirige de
 * verdade cai na metade de cima do mostrador, que é onde o olho bate ao voltar
 * da estrada. Num semicírculo, 60 e 120 km/h ficam separados por poucos graus.
 *
 * No SVG o ângulo cresce no sentido horário, porque o eixo vertical aponta para
 * baixo. Por isso 150° é a ponta esquerda e 390° (que é 30°) é a direita.
 */
const RAIO = 70;
const CENTRO = { x: 100, y: 84 };
const ANGULO_INICIAL = 150;
const ABERTURA = 240;

/*
 * A altura do desenho reserva espaço abaixo do mostrador para o número.
 *
 * O mostrador em si termina em y≈120 (o centro mais o raio vezes o seno de
 * 150°). O resto é o vão onde o digital mora. Sem essa folga, o número encosta
 * por cima dos valores da escala: «2.189» é largo o bastante para cobrir o «0»
 * de um lado e o «8» do outro, e foi exatamente o que aconteceu na primeira
 * tentativa.
 */
const ALTURA = 200;

const rad = (graus) => (graus * Math.PI) / 180;
const ponto = (graus, raio) => ({
  x: CENTRO.x + raio * Math.cos(rad(graus)),
  y: CENTRO.y + raio * Math.sin(rad(graus)),
});

/** A fração 0..1 vira o ângulo do ponteiro. */
const anguloDe = (fracao) => ANGULO_INICIAL + fracao * ABERTURA;

/** Um arco entre duas frações da escala, como caminho de SVG. */
function arco(de, ate, raio) {
  const inicio = ponto(anguloDe(de), raio);
  const fim = ponto(anguloDe(ate), raio);
  const maior = (ate - de) * ABERTURA > 180 ? 1 : 0;
  return `M ${inicio.x.toFixed(1)},${inicio.y.toFixed(1)} A ${raio},${raio} 0 ${maior} 1 ${fim.x.toFixed(1)},${fim.y.toFixed(1)}`;
}

/**
 * O passo entre os números da escala.
 *
 * Escolhido para caber de quatro a sete números no mostrador. Mais que isso
 * vira uma régua ilegível no tamanho de meia tela de celular; menos, e a escala
 * deixa de ajudar a estimar onde o ponteiro está.
 */
export function passoDaEscala(min, max) {
  const faixa = max - min;
  for (const passo of [1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 60, 100, 200, 250, 500, 1000, 2000, 5000]) {
    if (faixa / passo <= 7) return passo;
  }
  return faixa / 7;
}

/** Os traços da escala: os numerados e os miúdos entre eles. */
export function tracosDaEscala(min, max) {
  const passo = passoDaEscala(min, max);
  const meio = passo / 2;
  const traços = [];

  for (let valor = Math.ceil(min / meio) * meio; valor <= max + 1e-9; valor += meio) {
    // A comparação por resto falha com fração binária (0,1 + 0,2). O desvio
    // contra o passo inteiro é estável para os passos usados aqui.
    const restoInteiro = Math.abs(valor / passo - Math.round(valor / passo)) < 1e-9;
    traços.push({ valor, numerado: restoInteiro });
  }
  return traços;
}

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
export function criarMedidor(pid, { titulo = null, secundario = false, escala = null } = {}) {
  const definicao = definicaoDe(pid) ?? {};
  // A escala pode vir do item do painel personalizado. Sem ela, vale a da
  // tabela de PIDs — que é genérica de propósito.
  const minimo = escala?.min ?? definicao.min ?? 0;
  const maximo = escala?.max ?? definicao.max ?? 100;
  const divisor = definicao.escalaDividida ?? 1;
  const fracaoDe = (valor) => Math.min(1, Math.max(0, (valor - minimo) / (maximo - minimo)));

  const desenho = svg('svg', {
    viewBox: `0 0 200 ${ALTURA}`,
    class: 'medidor-desenho',
    role: 'img',
    'aria-label': titulo ?? definicao.nome ?? pid,
  });

  /* ------------------------------------------------------------- a escala */

  desenho.append(svg('path', { d: arco(0, 1, RAIO), class: 'medidor-trilho' }));

  // A zona vermelha é desenhada só onde ela existe de verdade. Um velocímetro
  // não tem faixa vermelha: o limite ali é a lei, não o motor.
  if (Number.isFinite(definicao.zonaVermelha)) {
    desenho.append(svg('path', {
      d: arco(fracaoDe(definicao.zonaVermelha), 1, RAIO),
      class: 'medidor-zona-vermelha',
    }));
  }

  for (const traco of tracosDaEscala(minimo, maximo)) {
    const angulo = anguloDe(fracaoDe(traco.valor));
    const fora = ponto(angulo, RAIO);
    const dentro = ponto(angulo, RAIO - (traco.numerado ? 13 : 7));

    desenho.append(svg('line', {
      x1: fora.x.toFixed(1),
      y1: fora.y.toFixed(1),
      x2: dentro.x.toFixed(1),
      y2: dentro.y.toFixed(1),
      class: `medidor-traco ${traco.numerado ? 'maior' : ''}`.trim(),
    }));

    if (!traco.numerado) continue;

    // O número fica para dentro do traço, e é o que o pedido chama de «os
    // valores no velocímetro»: sem eles o ponteiro mostra «mais ou menos no
    // meio», e não «cento e vinte».
    const ondeFica = ponto(angulo, RAIO - 26);
    const texto = svg('text', {
      x: ondeFica.x.toFixed(1),
      y: ondeFica.y.toFixed(1),
      class: 'medidor-valor-da-escala',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    texto.textContent = String(Math.round(traco.valor / divisor));
    desenho.append(texto);
  }

  /* ------------------------------------------------------------ o ponteiro */

  /*
   * O ponteiro vive num grupo que gira, e não num caminho redesenhado.
   *
   * Girar um grupo é uma transformação que a placa de vídeo faz sozinha; refazer
   * a geometria a cada leitura obrigaria o navegador a recalcular o desenho
   * dezenas de vezes por segundo, com o carro andando.
   */
  const ponteiro = svg('g', { class: 'medidor-ponteiro' });
  ponteiro.append(svg('polygon', {
    points: [
      `${CENTRO.x - 10},${CENTRO.y - 3.6}`,
      `${CENTRO.x + RAIO - 18},${CENTRO.y - 1.3}`,
      `${CENTRO.x + RAIO - 18},${CENTRO.y + 1.3}`,
      `${CENTRO.x - 10},${CENTRO.y + 3.6}`,
    ].join(' '),
  }));
  desenho.append(ponteiro);
  desenho.append(svg('circle', { cx: CENTRO.x, cy: CENTRO.y, r: 7, class: 'medidor-eixo' }));

  /* ------------------------------------------------------------- o digital */

  /*
   * O número mora **dentro** do SVG, e não numa camada de HTML por cima.
   *
   * Por cima, ele tinha de ser alinhado ao desenho por CSS — e bastava a célula
   * mudar de proporção para os dois se separarem: numa célula baixa o mostrador
   * encolhia e o número ficava boiando embaixo, ou estourava para fora. Dentro
   * do desenho, ele é parte da mesma imagem: escala junto, fica no mesmo lugar
   * em qualquer tamanho de célula, e nunca sobra nem falta.
   *
   * A unidade é a de verdade, sem o divisor da escala: este encolhe só os
   * rótulos («8» no lugar de «8000»), e escrever «×1000» ao lado do número
   * inteiro diria que 2.224 são dois milhões de rotações.
   */
  const texto = (classe, y, conteudo = '') => {
    const no = svg('text', {
      x: 100, y, class: classe, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
    });
    no.textContent = conteudo;
    return no;
  };

  const numero = texto('medidor-numero', 152, '—');
  const unidade = texto('medidor-unidade', 173, unidadeDePid(pid));
  const segunda = texto('medidor-secundario', 191);
  if (!secundario) segunda.setAttribute('visibility', 'hidden');

  desenho.append(numero, unidade, segunda);

  const rotulo = el('span', { classe: 'medidor-titulo', texto: titulo ?? definicao.curto ?? definicao.nome ?? pid });
  const no = el('div', { classe: 'medidor', dados: { pid } }, [desenho, rotulo]);

  let ultimo;
  return {
    no,

    atualizar(valor) {
      if (valor === ultimo) return;
      ultimo = valor;

      numero.textContent = valorDePid(pid, valor);
      // Sem leitura, o ponteiro volta ao começo da escala em vez de congelar
      // onde estava: parado no meio, ele continuaria afirmando um número.
      const angulo = anguloDe(Number.isFinite(valor) ? fracaoDe(valor) : 0);
      ponteiro.setAttribute('transform', `rotate(${angulo.toFixed(1)} ${CENTRO.x} ${CENTRO.y})`);
      no.dataset.faixa = faixa(definicao, valor);
    },

    /**
     * A linha menor sob o número — a segunda fonte de velocidade.
     *
     * Recebe texto pronto, e não um valor: quem chama sabe de onde veio o
     * número (OBD ou GPS) e se dá para confiar nele, e isso precisa aparecer
     * junto. Um «82» sem origem, embaixo de outro «78», não informa nada.
     */
    atualizarSecundario(conteudo) {
      segunda.setAttribute('visibility', conteudo ? 'visible' : 'hidden');
      segunda.textContent = conteudo ?? '';
    },
  };
}

/**
 * Um mostrador pequeno, sem arco.
 *
 * Para o que não tem escala interessante — tensão, temperatura do ar, tempo de
 * motor ligado. Cabem seis numa tela de celular sem espremer nada.
 */
export function criarMostrador(pid, { titulo = null, escala = null } = {}) {
  const definicao = escala
    ? { ...(definicaoDe(pid) ?? {}), min: escala.min, max: escala.max }
    : (definicaoDe(pid) ?? {});
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

/**
 * Uma barra horizontal.
 *
 * O terceiro tipo de visor, e o que melhor serve ao que é «nível»: tanque,
 * temperatura, carga. Numa barra, «pela metade» se lê sem número nenhum e sem
 * decifrar escala — é a forma que o marcador de combustível tem há oitenta
 * anos, e por um bom motivo.
 *
 * Ela cabe em uma linha da grade, o que permite empilhar quatro leituras no
 * espaço de um ponteiro. Num painel personalizado isso é o que decide entre
 * mostrar três coisas e mostrar oito.
 */
export function criarBarra(pid, { titulo = null, escala = null } = {}) {
  const definicao = definicaoDe(pid) ?? {};
  const minimo = escala?.min ?? definicao.min ?? 0;
  const maximo = escala?.max ?? definicao.max ?? 100;

  const numero = el('span', { classe: 'barra-numero', texto: '—' });
  const preenchida = el('div', { classe: 'barra-cheia' });

  const no = el('div', { classe: 'visor-barra', dados: { pid } }, [
    el('div', { classe: 'barra-topo' }, [
      el('span', { classe: 'barra-titulo', texto: titulo ?? definicao.curto ?? definicao.nome ?? pid }),
      el('div', { classe: 'barra-valor' }, [numero, el('span', { classe: 'barra-unidade', texto: unidadeDePid(pid) })]),
    ]),
    el('div', { classe: 'barra-trilho' }, [preenchida]),
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
      preenchida.style.width = `${(fracao * 100).toFixed(1)}%`;
      no.dataset.faixa = faixa({ ...definicao, min: minimo, max: maximo }, valor);
    },
  };
}

/**
 * O visor de um item do painel, seja ele qual for.
 *
 * É a única porta de entrada usada pelo painel e pelo editor — e é isso que
 * garante que os dois desenhem a mesma coisa. Um editor que mostra uma prévia
 * diferente do resultado não é um editor: é uma adivinhação.
 */
export function criarVisor(item, { escala = null } = {}) {
  const opcoes = { escala: escala ?? null };
  if (item.tipo === 'ponteiro') return criarMedidor(item.chave, opcoes);
  if (item.tipo === 'barra') return criarBarra(item.chave, opcoes);
  return criarMostrador(item.chave, opcoes);
}
