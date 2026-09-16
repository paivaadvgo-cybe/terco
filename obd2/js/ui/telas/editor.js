/**
 * O editor do painel.
 *
 * **A prévia usa os mesmos visores do painel de verdade**, com os valores que
 * estiverem chegando do carro — ou com valores de exemplo, quando não há
 * conexão. Um editor que mostra caixas cinzas com o nome do PID dentro obriga a
 * sair, olhar, voltar e corrigir; aqui o que se arrasta já é o que se vai ver
 * dirigindo.
 *
 * **Editar é um modo, não uma tela sempre ativa.** Fora do editor o painel não
 * arrasta nada: um toque que move um mostrador enquanto se dirige é pior que
 * não poder mover. Aqui dentro, arrastar move e tocar abre os ajustes do item.
 *
 * **Salvar é explícito.** O editor trabalha numa cópia e só grava quando se
 * confirma. Sem isso, experimentar posições mexeria no painel que está em uso —
 * e desistir no meio deixaria o layout pela metade.
 */

import { el, botao, campo, selecao, entrada } from '../elementos.js';
import { avisar, confirmar, abrirFolha } from '../avisos.js';
import { criarVisor } from '../medidor.js';
import { ligarGrade, posicionarNaGrade } from '../grade.js';
import { tudoQueSeMostra, definicaoDe } from '../../obd/pids.js';
import {
  COLUNAS, LINHAS_MAXIMAS, LIMITE_DE_PAINEIS, TIPOS, MODELOS, criarItem, escalaDe,
  mover, redimensionar, primeiroLugarVago, alturaDoPainel, linhasDoEditor,
} from '../../dominio/painel.js';

/**
 * Valores de exemplo para quando não há carro conectado.
 *
 * Um painel montado com tudo em travessão não deixa ver se a escala escolhida
 * faz sentido — e escolher a escala é metade do que se vem fazer aqui.
 */
const EXEMPLO = {
  '0C': 2600, '0D': 78, GPS: 74, '05': 91, '04': 42, 11: 28, 10: 14.2,
  '0B': 140, 33: 94, TURBO: 0.46, 42: 14.1, '2F': 63, '0F': 34, '5C': 98,
  CONSUMO: 11.4, MEDIA: 10.8, LH: 6.8, '1F': 842, '0E': 12, 46: 29, 43: 38,
  '0A': 380, 21: 0, 31: 1200, '5E': 6.8,
};

export async function telaEditor(contexto, parametros = {}) {
  const { armazenamento, sessao } = contexto;
  const configuracao = await armazenamento.configuracao();

  const paineis = configuracao.paineis.map((p) => ({ ...p, itens: p.itens.map((i) => ({ ...i })) }));
  let indice = Math.max(0, paineis.findIndex((p) => p.id === (parametros.id ?? configuracao.painelAtivo)));
  let itens = paineis[indice].itens;
  let sujo = false;

  const tela = el('div', { classe: 'tela tela-editor' });

  /* ------------------------------------------------------- os cinco painéis */

  const abas = el('div', { classe: 'abas-de-painel' });

  function desenharAbas() {
    abas.replaceChildren(
      ...paineis.map((painel, ordem) => el('button', {
        type: 'button',
        classe: `aba-painel ${ordem === indice ? 'ativa' : ''}`.trim(),
        texto: painel.nome,
        aoTocar: () => trocarDePainel(ordem),
      })),
      paineis.length < LIMITE_DE_PAINEIS
        ? el('button', {
          type: 'button',
          classe: 'aba-painel nova',
          texto: '+',
          atributos: { 'aria-label': 'Novo painel' },
          aoTocar: novoPainel,
        })
        : null,
    );
  }

  async function trocarDePainel(ordem) {
    if (ordem === indice) return;
    if (sujo && !await confirmar({
      titulo: 'Trocar de painel sem salvar?',
      texto: 'As mudanças neste painel são perdidas.',
      acao: 'Trocar assim mesmo',
      perigo: true,
    })) return;

    indice = ordem;
    itens = paineis[indice].itens;
    sujo = false;
    desenharAbas();
    desenharGrade();
  }

  /**
   * Um painel novo começa de um modelo.
   *
   * Montar quatorze mostradores do zero, um a um, com o dedo, é trabalho de
   * meia hora; partir de um arranjo pronto e mexer leva um minuto. «Vazio»
   * existe para quem quer mesmo começar do nada.
   */
  function novoPainel() {
    if (paineis.length >= LIMITE_DE_PAINEIS) return;

    const folha = abrirFolha('Novo painel', el('div', { classe: 'tela' }, [
      el('p', { classe: 'campo-dica', texto: 'Escolha por onde começar. Tudo pode ser mudado depois.' }),
      ...MODELOS.map((modelo) => botao(modelo.nome, () => {
        paineis.push(modelo.montar(`Painel ${paineis.length + 1}`));
        indice = paineis.length - 1;
        itens = paineis[indice].itens;
        sujo = true;
        desenharAbas();
        desenharGrade();
        folha.fechar();
      }, { tipo: modelo.chave === 'instrumentos' ? 'principal' : 'fantasma', classe: 'largo' })),
      el('div', { classe: 'detalhe-linhas' }, MODELOS.map((modelo) => (
        el('p', { classe: 'campo-dica', texto: `${modelo.nome}: ${modelo.descricao}` })
      ))),
    ]));
  }

  /* ------------------------------------------------------------- a prévia */

  const grade = el('div', { classe: 'grade-do-painel editando' });
  const visores = new Map();

  function valorDe(chave) {
    const aoVivo = sessao.estado.valores[chave];
    return Number.isFinite(aoVivo) ? aoVivo : EXEMPLO[chave];
  }

  function desenharGrade() {
    visores.clear();
    grade.replaceChildren(...itens.map((item) => {
      const visor = criarVisor(item, { escala: escalaDe(item) });
      visores.set(item.id, visor);
      visor.atualizar(valorDe(item.chave));

      const no = el('div', { classe: 'item-do-painel' }, [
        visor.no,
        el('span', { classe: 'alca-de-tamanho', atributos: { 'aria-hidden': 'true' } }),
      ]);
      posicionarNaGrade(no, item);
      return no;
    }));
    grade.style.setProperty('--linhas', String(linhasDoEditor(itens)));
  }

  ligarGrade(grade, {
    colunas: COLUNAS,
    aoMover(id, destino) {
      const novos = mover(itens, id, destino);
      if (!novos) return false;
      itens = novos;
      paineis[indice].itens = itens;
      sujo = true;
      desenharGrade();
      return true;
    },
    aoRedimensionar(id, tamanho, { previa }) {
      const novos = redimensionar(itens, id, tamanho);
      if (!novos) return false;

      itens = novos;
      paineis[indice].itens = itens;
      sujo = true;

      /*
       * Durante o arrasto, só o item que está sendo puxado muda de lugar na
       * grade — refazer os dez visores a cada pixel de dedo engasga a tela
       * justamente enquanto se olha para ela. O desenho completo fica para o
       * momento de soltar.
       */
      if (previa) {
        const no = grade.querySelector(`.item-do-painel[data-id="${id}"]`);
        const item = itens.find((i) => i.id === id);
        if (no && item) posicionarNaGrade(no, item);
        grade.style.setProperty('--linhas', String(linhasDoEditor(itens)));
      } else {
        desenharGrade();
      }
      return true;
    },
    aoTocarItem: (id) => abrirAjustesDoItem(id),
  });

  /* --------------------------------------------------- ajustes de um item */

  /**
   * Um par de botões «−» e «+» com o valor no meio.
   *
   * Existe porque a alça de canto não serve no celular. Ela tem trinta pixels e
   * fica na quina de uma célula que, num painel cheio, tem oitenta — e a quina
   * é justamente onde a alça do vizinho também está. Com o dedo, acertar aquilo
   * é loteria; com o mouse, é trivial, e foi por isso que o defeito passou pelo
   * computador sem aparecer. O arrasto continua para quem gosta; estes botões
   * são o caminho que sempre funciona.
   */
  function passoDeTamanho(rotulo, valorNo, diminuir, aumentar) {
    return el('div', { classe: 'passo' }, [
      el('span', { classe: 'passo-nome', texto: rotulo }),
      el('div', { classe: 'passo-controles' }, [
        botao('−', diminuir, {
          tipo: 'secundario',
          classe: 'passo-botao',
          atributos: { 'aria-label': `Diminuir ${rotulo.toLowerCase()}` },
        }),
        valorNo,
        botao('+', aumentar, {
          tipo: 'secundario',
          classe: 'passo-botao',
          atributos: { 'aria-label': `Aumentar ${rotulo.toLowerCase()}` },
        }),
      ]),
    ]);
  }

  function abrirAjustesDoItem(id) {
    const item = itens.find((i) => i.id === id);
    if (!item) return;

    /*
     * O item é reprocurado a cada uso, e não guardado.
     *
     * `redimensionar` devolve uma lista nova com um objeto novo para o item
     * mexido — ele não altera o que já existe. Guardar a referência daqui faria
     * o segundo toque no «+» crescer um objeto que já saiu da lista, e a tela
     * mostraria um tamanho que ninguém salvou.
     */
    const atual = () => itens.find((i) => i.id === id);

    const larguraNo = el('span', { classe: 'passo-valor' });
    const alturaNo = el('span', { classe: 'passo-valor' });

    function mostrarTamanho() {
      const agora = atual();
      larguraNo.textContent = String(agora?.largura ?? '—');
      alturaNo.textContent = String(agora?.altura ?? '—');
    }

    function mudarTamanho(delta) {
      const agora = atual();
      if (!agora) return;

      const alvo = {
        largura: agora.largura + (delta.largura ?? 0),
        altura: agora.altura + (delta.altura ?? 0),
      };

      // Recusar dizendo por quê. `redimensionar` prenderia o valor no mínimo em
      // silêncio, e quem tocasse «−» três vezes sem nada acontecer concluiria
      // que o botão não funciona.
      const medida = (TIPOS[agora.tipo] ?? TIPOS.mostrador).minimo;
      if (alvo.largura < medida.largura || alvo.altura < medida.altura) {
        avisar(`${TIPOS[agora.tipo].nome} não cabe em menos de ${medida.largura}×${medida.altura} células`, 'atencao', 4000);
        return;
      }
      if (alvo.largura > COLUNAS || alvo.altura > LINHAS_MAXIMAS) {
        avisar(`A grade tem ${COLUNAS} colunas e ${LINHAS_MAXIMAS} linhas`, 'atencao', 4000);
        return;
      }

      const ajustado = redimensionar(itens, id, alvo);
      if (!ajustado) {
        avisar('Não cabe aí: outro mostrador está no caminho. Mova-o primeiro.', 'atencao', 5000);
        return;
      }

      itens = ajustado;
      paineis[indice].itens = itens;
      sujo = true;
      // A grade atrás da folha redesenha na hora: é ela a prévia, e ver o
      // mostrador crescer enquanto se toca no «+» é o que dispensa fechar,
      // olhar, reabrir.
      desenharGrade();
      mostrarTamanho();
    }

    mostrarTamanho();

    const catalogo = tudoQueSeMostra();
    const qual = selecao(
      Object.entries(catalogo).map(([chave, definicao]) => ({ valor: chave, nome: definicao.nome })),
      item.chave,
    );

    const tipo = selecao(
      Object.entries(TIPOS).map(([chave, t]) => ({ valor: chave, nome: t.nome })),
      item.tipo,
    );

    const escala = escalaDe(item);
    const minimo = entrada({ type: 'number', inputmode: 'decimal', step: 'any', value: escala.min });
    const maximo = entrada({ type: 'number', inputmode: 'decimal', step: 'any', value: escala.max });

    const folha = abrirFolha(definicaoDe(item.chave)?.nome ?? 'Mostrador', el('div', { classe: 'tela' }, [
      /*
       * O tamanho vem primeiro, e não é ordem alfabética: é o que mais se vem
       * fazer aqui, e o único ajuste que vale na hora, sem «Aplicar». Numa tela
       * de celular deitado a folha não cabe inteira de jeito nenhum — então o
       * que fica acima da dobra tem de ser o que resolve sozinho.
       */
      campo('Tamanho', el('div', { classe: 'passos-de-tamanho' }, [
        passoDeTamanho('Largura', larguraNo, () => mudarTamanho({ largura: -1 }), () => mudarTamanho({ largura: 1 })),
        passoDeTamanho('Altura', alturaNo, () => mudarTamanho({ altura: -1 }), () => mudarTamanho({ altura: 1 })),
      ]), 'Em células da grade, e vale na hora: o painel atrás muda enquanto você toca.'),
      campo('O que mostrar', qual),
      campo('Como mostrar', tipo, 'Ponteiro ocupa mais espaço e se lê de relance. Número cabe em uma célula.'),
      el('div', { classe: 'dois-campos' }, [
        campo('Mínimo', minimo),
        campo('Máximo', maximo),
      ]),
      el('p', {
        classe: 'campo-dica',
        texto: 'A escala decide onde o ponteiro para. Apertá-la em torno da faixa que o seu carro usa de verdade é o que faz a diferença entre um ponteiro que mexe e um que fica quase parado.',
      }),
      el('div', { classe: 'coluna-botoes' }, [
        botao('Aplicar', aplicar, { tipo: 'principal', classe: 'largo' }),
        botao('Voltar a escala automática', () => {
          delete item.min;
          delete item.max;
          sujo = true;
          desenharGrade();
          folha.fechar();
          avisar('Escala automática');
        }, { tipo: 'fantasma', classe: 'largo' }),
        botao('Remover do painel', remover, { tipo: 'perigo', classe: 'largo' }),
      ]),
    ]));

    function aplicar() {
      // Não `item`: mexer no tamanho antes de aplicar troca o objeto da lista,
      // e escrever no antigo salvaria a escala num item que já não existe.
      const alvo = atual();
      if (!alvo) return;

      const novoMin = Number.parseFloat(String(minimo.value).replace(',', '.'));
      const novoMax = Number.parseFloat(String(maximo.value).replace(',', '.'));

      if (Number.isFinite(novoMin) && Number.isFinite(novoMax) && novoMax <= novoMin) {
        avisar('O máximo precisa ser maior que o mínimo', 'erro');
        return;
      }

      const novoTipo = tipo.value;
      const medida = TIPOS[novoTipo].minimo;
      alvo.chave = qual.value;
      alvo.tipo = novoTipo;
      alvo.min = Number.isFinite(novoMin) ? novoMin : undefined;
      alvo.max = Number.isFinite(novoMax) ? novoMax : undefined;

      // Trocar de tipo pode exigir mais espaço — um número de 1×1 que vira
      // ponteiro precisa de 2×2. Cresce só o necessário, e o teste de encaixe
      // recusa se não couber.
      const maior = { largura: Math.max(alvo.largura, medida.largura), altura: Math.max(alvo.altura, medida.altura) };
      const ajustado = redimensionar(itens, alvo.id, maior);
      if (ajustado) itens = ajustado;
      else if (maior.largura > alvo.largura || maior.altura > alvo.altura) {
        avisar('Não há espaço para este formato — mova outros mostradores primeiro', 'atencao', 5000);
      }

      paineis[indice].itens = itens;
      sujo = true;
      desenharGrade();
      folha.fechar();
    }

    function remover() {
      itens = itens.filter((i) => i.id !== id);
      paineis[indice].itens = itens;
      sujo = true;
      desenharGrade();
      folha.fechar();
      avisar('Removido do painel');
    }
  }

  /* ----------------------------------------------------- acrescentar item */

  function acrescentar() {
    const catalogo = tudoQueSeMostra();
    const qual = selecao(
      Object.entries(catalogo).map(([chave, definicao]) => ({ valor: chave, nome: definicao.nome })),
      '0D',
    );
    const tipo = selecao(
      Object.entries(TIPOS).map(([chave, t]) => ({ valor: chave, nome: t.nome })),
      'mostrador',
    );

    const folha = abrirFolha('Acrescentar ao painel', el('div', { classe: 'tela' }, [
      campo('O que mostrar', qual),
      campo('Como mostrar', tipo),
      botao('Acrescentar', () => {
        const medida = TIPOS[tipo.value].minimo;
        const vago = primeiroLugarVago(itens, medida.largura, medida.altura);
        if (!vago) {
          avisar('O painel está cheio — remova algo antes', 'atencao');
          return;
        }
        itens = [...itens, criarItem(qual.value, tipo.value, { ...vago, ...medida })];
        paineis[indice].itens = itens;
        sujo = true;
        desenharGrade();
        folha.fechar();
      }, { tipo: 'principal', classe: 'largo' }),
    ]));
  }

  /* -------------------------------------------------------------- salvar */

  async function salvar() {
    await armazenamento.salvarPaineis(paineis, paineis[indice].id);
    await sessao.recarregarConfiguracao();
    sujo = false;
    avisar('Painel salvo');
    contexto.ir('painel');
  }

  function renomear() {
    const nome = entrada({ value: paineis[indice].nome, maxlength: 24 });
    const folha = abrirFolha('Nome do painel', el('div', { classe: 'tela' }, [
      campo('Como chamar', nome, 'Aparece na barra de escolha, aqui e nos ajustes.'),
      botao('Salvar nome', () => {
        paineis[indice].nome = nome.value.trim().slice(0, 24) || paineis[indice].nome;
        sujo = true;
        desenharAbas();
        folha.fechar();
      }, { tipo: 'principal', classe: 'largo' }),
    ]));
  }

  async function apagarPainel() {
    if (paineis.length === 1) {
      avisar('Não dá para apagar o único painel', 'atencao');
      return;
    }
    const confirmado = await confirmar({
      titulo: `Apagar «${paineis[indice].nome}»?`,
      texto: 'A disposição deste painel é perdida. Os outros não mudam.',
      acao: 'Apagar',
      perigo: true,
    });
    if (!confirmado) return;

    paineis.splice(indice, 1);
    indice = 0;
    itens = paineis[0].itens;
    sujo = true;
    desenharAbas();
    desenharGrade();
  }

  /* --------------------------------------------------------------- monta */

  desenharAbas();
  desenharGrade();

  /*
   * O editor cabe na janela, como o painel — e pelo mesmo motivo.
   *
   * Empilhado, ele era três telas de altura num celular deitado: o cartão das
   * abas, a grade e cinco botões largos. Quem abria para arrumar um mostrador
   * via os botões, rolava, via metade da grade, e arrastava às cegas. Agora a
   * grade fica com a janela inteira e os comandos vão para uma coluna estreita
   * ao lado.
   *
   * **E é o que faz a prévia não mentir.** No painel as linhas dividem a altura
   * disponível; com a grade do editor em células quadradas, o mesmo painel tinha
   * duas formas diferentes, e a que se arrastava não era a que se via dirigindo.
   */
  document.body.classList.add('editor-fixo');
  contexto.aoSair(() => document.body.classList.remove('editor-fixo'));

  const lateral = el('div', { classe: 'editor-lateral' }, [
    el('p', {
      classe: 'campo-dica',
      texto: 'Arraste para mover. Puxe o canto para redimensionar. Toque para escolher.',
    }),
    botao('Acrescentar', acrescentar, { tipo: 'secundario', classe: 'largo' }),
    botao('Salvar', salvar, { tipo: 'principal', classe: 'largo' }),
    botao('Renomear', renomear, { tipo: 'fantasma', classe: 'largo' }),
    botao('Apagar painel', apagarPainel, { tipo: 'perigo', classe: 'largo' }),
    botao('Sair sem salvar', async () => {
      if (sujo && !await confirmar({
        titulo: 'Sair sem salvar?',
        texto: 'As mudanças são perdidas.',
        acao: 'Sair',
        perigo: true,
      })) return;
      contexto.ir('painel');
    }, { tipo: 'fantasma', classe: 'largo' }),
  ]);

  if (itens.length === 0) {
    grade.append(el('p', {
      classe: 'palco-vazio',
      texto: 'Painel vazio. Toque em «Acrescentar».',
    }));
  }

  /*
   * As abas dos painéis ficam numa faixa larga, e não na coluna estreita.
   *
   * São pastilhas com nome dentro — «Instrumentos», «Completo» —, e numa coluna
   * de cento e setenta pixels elas quebram em três linhas e empurram «Apagar»
   * para fora da tela. Deitadas, ocupam vinte e oito pixels de uma largura que
   * sobra.
   */
  tela.append(el('div', { classe: 'palco' }, [
    el('div', { classe: 'palco-grade' }, [abas, grade]),
    lateral,
  ]));

  /*
   * A prévia acompanha o carro, se houver carro.
   *
   * Sem assinar a sessão, montar o painel com o motor ligado mostraria números
   * congelados no instante em que a tela abriu — e a escala escolhida pareceria
   * certa para um valor que já mudou.
   */
  contexto.aoSair(sessao.assinar(() => {
    for (const [id, visor] of visores) {
      const item = itens.find((i) => i.id === id);
      if (item) visor.atualizar(valorDe(item.chave));
    }
  }));

  return tela;
}
