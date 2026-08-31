/**
 * Painel de administração dos parâmetros.
 *
 * O que ele faz, na ordem em que se usa:
 *
 *   1. Abre com o conjunto que está publicado. Pode-se também carregar um
 *      arquivo salvo, para retomar uma alteração começada em outro dia.
 *   2. Edita. Todo campo vem do esquema, com o rótulo e a explicação que estão
 *      lá — a tela não sabe o que é uma alíquota de IOF, ela só desenha o que
 *      o esquema descreve.
 *   3. **Testa.** Antes de publicar, roda uma simulação real com os parâmetros
 *      pendentes e mostra o resultado ao lado do que os parâmetros atuais
 *      dariam. É a diferença entre ver o número e acreditar no número.
 *   4. Confere: a lista do que mudou em português, mais o que a validação
 *      encontrou.
 *   5. Publica: gera os dois arquivos e explica onde colocá-los.
 *
 * Uma decisão que atravessa o arquivo: **nada é salvo automaticamente em lugar
 * nenhum**. A edição vive na memória da aba e some se ela fechar, e é por isso
 * que existe o botão de baixar rascunho. Guardar sozinho no navegador criaria
 * uma segunda verdade — um conjunto pela metade, invisível, que ressurgiria
 * semanas depois sem ninguém lembrar do que era.
 */

import { VIGENTES } from './../data/parametros-vigentes.js';
import { simular, listarLinhas, listarProdutos } from './../produtos/produtos.js';
import { moeda, numero, plural, taxa as formatarTaxa } from './../ui/formatar.js';
import {
  CAMPOS_DA_LINHA, CAMPOS_IOF, CAMPOS_SIMPLES, CAMPOS_DO_INDEXADOR, CAMPOS_DA_PUBLICACAO,
  CAMPOS_DA_FAIXA_DE_TAC, ABAS_QUE_ALIMENTAM_PRODUTO,
  CAMPOS_DO_PRODUTO, CAMPOS_ESTRUTURAIS_DO_PRODUTO, ESCOLHAS_DE_COMPORTAMENTO,
  lerCaminho, escreverCaminho, lerCampo, tipoDe, blocosDeTaxa,
} from './esquema.js';
import { validar } from './validar.js';
import { diferencas } from './diferenca.js';
import { arquivosParaPublicar, lerConjunto, metadadosDePublicacao } from './serializar.js';
import { conferirSenha, definirSenha, exigeSenha, disponivel, TAMANHO_MINIMO } from './acesso.js';

const criar = (tag, atributos = {}, filhos = []) => {
  const el = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (chave === 'class') el.className = valor;
    else if (chave === 'texto') el.textContent = valor;
    else if (chave.startsWith('on')) el.addEventListener(chave.slice(2).toLowerCase(), valor);
    else if (valor !== null && valor !== false && valor !== undefined) {
      el.setAttribute(chave, valor === true ? '' : valor);
    }
  }
  for (const filho of [].concat(filhos)) {
    if (filho) el.append(typeof filho === 'string' ? document.createTextNode(filho) : filho);
  }
  return el;
};

/* ── estado ───────────────────────────────────────────────────────────────
 *
 * `publicado` é o que está no ar e não se altera aqui. `edicao` é a cópia em
 * que se trabalha. A comparação entre os dois é a lista de diferenças, e é
 * também o que decide se há algo a publicar.
 */

const publicado = VIGENTES;
let edicao = comMetadadosLimpos(structuredClone(VIGENTES));

/**
 * A edição começa sem os campos que descrevem a publicação **anterior**.
 *
 * Ato normativo, quem publicou e observações são desta alteração, não da
 * passada. Deixá-los preenchidos com o que veio do arquivo faria o próximo
 * administrador publicar sob a norma de outra pessoa sem reparar — e a
 * conferência acusaria tarde demais. A vigência fica: ela é a data em que os
 * parâmetros atuais passaram a valer, e serve de ponto de partida.
 */
function comMetadadosLimpos(conjunto) {
  return {
    ...conjunto,
    metadados: {
      ...conjunto.metadados,
      atoNormativo: '', publicadoPor: '', observacoes: '',
    },
  };
}
let secaoAtual = 'linhas';

const conteudo = document.getElementById('conteudo');
const menu = document.querySelector('.menu');
const painelDeErro = document.getElementById('erro');

// Linhas primeiro porque é o que mais se altera: taxa, prazo, limite. Produtos
// logo depois, que é onde se inclui ou exclui uma família inteira.
const SECOES = [
  { id: 'linhas', titulo: 'Linhas de crédito' },
  { id: 'produtos', titulo: 'Produtos' },
  { id: 'fatorK', titulo: 'Fator K do FGI' },
  { id: 'encargos', titulo: 'Encargos' },
  { id: 'indexadores', titulo: 'Indexadores' },
  { id: 'teste', titulo: 'Testar' },
  { id: 'conferir', titulo: 'Conferir e publicar' },
  { id: 'acesso', titulo: 'Senha' },
];

function mostrarErro(mensagem) {
  painelDeErro.textContent = mensagem;
  painelDeErro.hidden = !mensagem;
  if (mensagem) painelDeErro.scrollIntoView({ block: 'nearest' });
}

/* ── campos genéricos ─────────────────────────────────────────────────────
 *
 * Um campo sabe o caminho que edita. Ao mudar, escreve no conjunto em edição e
 * pede o redesenho só da barra de estado — redesenhar a seção inteira faria o
 * foco saltar do campo a cada tecla, que foi como esta tela funcionou até eu
 * digitar nela.
 */

function campoDe(campo, caminho, { sufixo, redesenhar = false } = {}) {
  const valorAtual = lerCaminho(edicao, caminho);
  const tipo = tipoDe(campo);
  const id = `c-${caminho.replace(/[^\w]/g, '-')}`;

  const controle = campo.varias
    ? criar('textarea', { id, rows: '3' })
    : tipo.entrada === 'select'
    ? criar('select', { id }, (tipo.opcoes ?? []).map((o) => criar('option', {
      value: o, texto: tipo.descrever(o), selected: o === valorAtual,
    })))
      : criar('input', {
        id,
        type: tipo.entrada,
        value: tipo.exibir(valorAtual),
        inputmode: tipo.modoDeEntrada ?? null,
      });
  if (campo.varias) controle.value = tipo.exibir(valorAtual);

  const envolucro = criar('div', { class: 'campo' }, [
    criar('label', { for: id }, [
      campo.rotulo,
      sufixo || campo.unidade ? criar('span', { class: 'sufixo', texto: ` (${sufixo ?? campo.unidade})` }) : null,
    ]),
    controle,
    campo.ajuda ? criar('p', { class: 'ajuda', texto: campo.ajuda }) : null,
  ]);

  controle.addEventListener('change', () => {
    const lido = lerCampo(campo, controle.value, valorAtual);
    if (typeof lido === 'number' && Number.isNaN(lido)) {
      envolucro.classList.add('invalido');
      mostrarErro(`${campo.rotulo}: "${controle.value}" não é um número reconhecível.`);
      return;
    }
    envolucro.classList.remove('invalido');
    mostrarErro('');
    escreverCaminho(edicao, caminho, lido);
    envolucro.classList.toggle('alterado', lido !== lerCaminho(publicado, caminho));
    // Na tela de conferência o valor digitado muda o que a própria tela diz —
    // preencher o ato normativo é o que libera a publicação. Sem redesenhar,
    // quem preenche fica olhando um impedimento que já resolveu, e o botão de
    // publicar nunca aparece. Nas demais seções o redesenho é dispensável e
    // custaria o foco a cada campo.
    if (redesenhar) { desenhar(); return; }
    atualizarBarra();
  });

  if (valorAtual !== lerCaminho(publicado, caminho)) envolucro.classList.add('alterado');
  return envolucro;
}

/** Os três campos de uma taxa: valor, unidade e o tipo, que é sempre efetiva. */
function camposDaTaxa(campo, caminho) {
  const taxa = lerCaminho(edicao, caminho);
  if (taxa === null || taxa === undefined) {
    return criar('div', { class: 'campo' }, [
      criar('label', { texto: campo.rotulo }),
      criar('p', { class: 'ajuda' }, [
        'Sem valor nesta linha. ',
        criar('button', {
          type: 'button',
          class: 'secundario',
          onClick: () => {
            escreverCaminho(edicao, caminho, { valor: 0, unidade: 'mensal', tipo: 'efetiva' });
            desenhar();
          },
          texto: 'Definir uma taxa',
        }),
      ]),
    ]);
  }
  return criar('div', { class: 'campos' }, [
    campoDe({ ...campo, tipo: 'percentual', rotulo: campo.rotulo }, `${caminho}.valor`, { sufixo: '%' }),
    campoDe({ rotulo: `${campo.rotulo} — unidade`, tipo: 'unidade',
      ajuda: 'Muda como o motor lê o número, e não o número.' }, `${caminho}.unidade`),
  ]);
}

/* ── seção: linhas de crédito ─────────────────────────────────────────────── */

function resumoDaLinha(linha) {
  const blocos = blocosDeTaxa(linha);
  const cheia = blocos[0]?.alvo?.taxaCheia;
  return [
    cheia ? `${formatarTaxa(cheia)}` : 'sem taxa',
    `até ${linha.prazoMaximo} meses`,
    `limite ${moeda(linha.limite ?? 0)}`,
  ].join(' · ');
}

function linhaEditavel(linha, caminho, aoExcluir) {
  const simples = CAMPOS_DA_LINHA.filter((c) => c.tipo !== 'taxa');
  const deTaxa = CAMPOS_DA_LINHA.filter((c) => c.tipo === 'taxa');
  const blocos = blocosDeTaxa(linha);

  const alterada = JSON.stringify(linha) !== JSON.stringify(lerCaminho(publicado, caminho));

  return criar('details', { class: 'linha-editavel', 'data-alterada': alterada ? 'sim' : 'nao' }, [
    criar('summary', {}, [
      linha.nome || '(sem nome)',
      criar('span', { class: 'resumo-da-linha', texto: resumoDaLinha(linha) }),
    ]),
    criar('div', { class: 'campos' }, simples.map((c) => campoDe(c, `${caminho}.${c.chave}`))),
    ...blocos.map((bloco) => {
      const alvo = bloco.caminho ? `${caminho}.${bloco.caminho}` : caminho;
      const campos = deTaxa
        .filter((c) => bloco.alvo?.[c.chave] !== undefined || c.obrigatorio)
        .map((c) => camposDaTaxa(c, `${alvo}.${c.chave}`));
      return bloco.rotulo
        ? criar('div', { class: 'bloco-de-municipio' }, [
          criar('h4', { texto: `Taxas — ${bloco.rotulo}` }), ...campos,
        ])
        : criar('div', {}, campos);
    }),
    criar('p', {}, [
      criar('button', {
        type: 'button', class: 'secundario', texto: 'Excluir esta linha', onClick: aoExcluir,
      }),
    ]),
  ]);
}

/** Que produtos leem de um grupo — dito na tela, para não se editar em vão. */
function quemUsa(nomeDoGrupo) {
  const produtos = listarProdutos(edicao)
    .filter((p) => {
      try {
        return listarLinhas(p.codigo, {}, edicao).some((l) => l.grupo === nomeDoGrupo);
      } catch { return false; }
    })
    .map((p) => p.nome);
  return produtos.length > 0
    ? `Lido por: ${produtos.join(', ')}.`
    : 'Nenhum produto lê deste grupo hoje.';
}

function secaoLinhas() {
  const partes = [
    criar('h2', { texto: 'Linhas de crédito' }),
    criar('p', { class: 'ajuda', texto:
      'A tabela de encargos é de onde os produtos leem as linhas que oferecem. '
      + 'Alterar prazo, carência, limite ou taxa aqui muda o que o simulador calcula.' }),
  ];

  edicao.tabelaDeEncargos.forEach((grupo, i) => {
    const caminhoDoGrupo = `tabelaDeEncargos.${i}`;
    partes.push(criar('section', { class: 'grupo-de-linhas' }, [
      criar('h3', { texto: grupo.grupo }),
      criar('p', { class: 'quem-usa', texto: quemUsa(grupo.grupo) }),
      ...grupo.linhas.map((linha, j) => linhaEditavel(
        linha, `${caminhoDoGrupo}.linhas.${j}`,
        () => {
          if (!confirm(`Excluir "${linha.nome}" do grupo ${grupo.grupo}?`)) return;
          edicao.tabelaDeEncargos[i].linhas.splice(j, 1);
          desenhar();
        },
      )),
      criar('p', {}, [
        criar('button', {
          type: 'button', texto: 'Incluir linha neste grupo',
          onClick: () => {
            edicao.tabelaDeEncargos[i].linhas.push({
              nome: 'Nova linha',
              prazoMaximo: 24,
              carenciaMaxima: 3,
              limite: 100000,
              taxaCheia: { valor: 0.02, unidade: grupo.unidadeTaxa ?? 'mensal', tipo: 'efetiva' },
              taxaBonus: null,
            });
            desenhar();
          },
        }),
      ]),
    ]));
  });

  // As abas: só uma alimenta produto. As demais são registro de auditoria, e
  // aparecem como tal — campo editável que não muda cálculo nenhum é pior do
  // que campo nenhum.
  partes.push(criar('h2', { texto: 'Linhas registradas por aba da planilha' }));
  for (const [nome, aba] of Object.entries(edicao.linhasPorAba ?? {})) {
    const alimenta = ABAS_QUE_ALIMENTAM_PRODUTO.includes(nome);
    partes.push(criar('section', { class: 'grupo-de-linhas' }, [
      criar('h3', { texto: nome }),
      alimenta
        ? criar('p', { class: 'quem-usa', texto: quemUsa(nome) })
        : criar('p', { class: 'somente-leitura', texto:
          'Registro de auditoria do que esta aba da planilha trazia. Nenhum produto lê daqui, '
          + 'e por isso os campos não são editáveis: alterá-los não mudaria cálculo nenhum. '
          + `A aba tem ${plural(aba.linhas.length, 'linha', 'linhas')}.` }),
      ...(alimenta
        ? aba.linhas.map((linha, j) => linhaEditavel(
          linha, `linhasPorAba.${nome}.linhas.${j}`,
          () => {
            if (!confirm(`Excluir "${linha.nome}"?`)) return;
            edicao.linhasPorAba[nome].linhas.splice(j, 1);
            desenhar();
          },
        ))
        : []),
    ]));
  }
  return partes;
}

/* ── seção: produtos ──────────────────────────────────────────────────────
 *
 * Um produto é uma combinação de comportamentos que o motor já implementa, e
 * cada campo estrutural é uma escolha entre os que existem. Não há campo livre
 * ali: escolher um comportamento que o motor não saiba executar é impossível
 * por construção, porque as opções saem do esquema.
 *
 * O que exige desenvolvimento é um comportamento **novo** — um sistema de
 * amortização que não seja SAC nem PRICE, uma convenção de taxa que não seja
 * nenhuma das duas. Compor um produto novo com o que já existe, não.
 */

function escolhaDe(produto, codigo, campo) {
  const caminho = `produtos.${codigo}.${campo.chave}`;
  const atual = lerCaminho(edicao, caminho) ?? '';
  const opcoes = ESCOLHAS_DE_COMPORTAMENTO[campo.escolhas];
  const id = `c-${caminho.replace(/[^\w]/g, '-')}`;
  const publicadoAgora = lerCaminho(publicado, caminho) ?? '';

  const seletor = criar('select', { id }, opcoes.map((o) => criar('option', {
    value: o.valor, texto: o.texto, selected: String(o.valor) === String(atual),
  })));

  const escolhida = opcoes.find((o) => String(o.valor) === String(atual));
  const envolucro = criar('div', { class: 'campo' }, [
    criar('label', { for: id, texto: campo.rotulo }),
    seletor,
    criar('p', { class: 'ajuda', texto: escolhida?.ajuda ?? campo.ajuda }),
  ]);

  seletor.addEventListener('change', () => {
    // O indexador guarda `null`, e não string vazia: um indexador «vazio» que
    // fosse texto passaria pela busca e daria erro de código desconhecido.
    const valor = campo.chave === 'regras.indexador' && seletor.value === '' ? null : seletor.value;
    escreverCaminho(edicao, caminho, valor);
    desenhar();
  });

  if (String(atual) !== String(publicadoAgora)) envolucro.classList.add('alterado');
  return envolucro;
}

function gruposDoProduto(codigo) {
  const caminho = `produtos.${codigo}.gruposDeEncargos`;
  const atuais = lerCaminho(edicao, caminho) ?? [];
  const todos = edicao.tabelaDeEncargos.map((g) => g.grupo);

  return criar('div', { class: 'campo' }, [
    criar('label', { texto: 'Grupos de linhas que este produto oferece' }),
    criar('div', { class: 'caixas' }, todos.map((nome) => {
      const marcada = atuais.includes(nome);
      const caixa = criar('input', { type: 'checkbox', checked: marcada, id: `g-${codigo}-${nome.replace(/\W/g, '')}` });
      caixa.addEventListener('change', () => {
        const lista = new Set(lerCaminho(edicao, caminho) ?? []);
        if (caixa.checked) lista.add(nome); else lista.delete(nome);
        escreverCaminho(edicao, caminho, [...lista]);
        desenhar();
      });
      return criar('label', { class: 'caixa' }, [caixa, nome]);
    })),
    criar('p', { class: 'ajuda', texto:
      'As linhas que este produto oferece saem dos grupos marcados. Um produto sem grupo '
      + 'nenhum não tem o que oferecer, e a conferência avisa.' }),
  ]);
}

function secaoProdutos() {
  const partes = [
    criar('h2', { texto: 'Produtos' }),
    criar('p', { class: 'ajuda', texto:
      'Um produto é uma família de linhas de crédito que compartilham a forma de calcular. '
      + 'Os campos marcados como estruturais mudam o cálculo de todas as linhas da família '
      + 'de uma vez — altere-os e confira na aba Testar antes de publicar.' }),
  ];

  for (const [codigo, produto] of Object.entries(edicao.produtos ?? {})) {
    let quantasLinhas = 0;
    try { quantasLinhas = listarLinhas(codigo, {}, edicao).length; } catch { quantasLinhas = 0; }

    partes.push(criar('section', { class: 'grupo-de-linhas' }, [
      criar('h3', { texto: produto.nome || codigo }),
      criar('p', { class: 'quem-usa', texto:
        `Código ${codigo} · ${plural(quantasLinhas, 'linha oferecida', 'linhas oferecidas')}.` }),

      criar('div', { class: 'campos' },
        CAMPOS_DO_PRODUTO.map((c) => campoDe(c, `produtos.${codigo}.${c.chave}`))),

      gruposDoProduto(codigo),

      criar('h4', { class: 'estrutural', texto: 'Comportamento de cálculo' }),
      criar('p', { class: 'ajuda', texto:
        'Vale para todas as linhas desta família. Cada opção é um comportamento que o motor '
        + 'implementa; não há como escolher um que ele não saiba executar.' }),
      criar('div', { class: 'campos' },
        CAMPOS_ESTRUTURAIS_DO_PRODUTO.map((c) => escolhaDe(produto, codigo, c))),

      criar('p', {}, [
        criar('button', {
          type: 'button', class: 'secundario', texto: 'Excluir este produto',
          onClick: () => {
            if (!confirm(`Excluir o produto "${produto.nome}"?\n\n`
              + 'As linhas dele deixam de ser oferecidas. Simulações já salvas continuam '
              + 'guardadas, mas não poderão ser refeitas.')) return;
            delete edicao.produtos[codigo];
            desenhar();
          },
        }),
      ]),
    ]));
  }

  partes.push(criar('p', {}, [
    criar('button', {
      type: 'button', texto: 'Incluir produto',
      onClick: () => {
        const nome = prompt('Nome do produto:');
        if (nome === null || nome.trim() === '') return;
        const codigo = novoCodigo(nome);
        if (codigo in (edicao.produtos ?? {})) { mostrarErro(`Já existe um produto com o código ${codigo}.`); return; }
        edicao.produtos[codigo] = {
          codigo,
          nome: nome.trim(),
          abaDeOrigem: '',
          gruposDeEncargos: [],
          regras: {
            convencaoTaxa: 'mensalComposta',
            varianteTAC: 'padrao',
            baseAmortizacao: 'valorFinanciado',
            tratamentoCarencia: 'pagos',
            bonus: { tipo: 'tabelado' },
            alienacao: { descontaParteGarantida: true },
            indexador: null,
            periodicidades: [1],
            modalidadesDeGarantia: ['FAMPE', 'FGI', 'FUNDEQ'],
            percentualGarantidoMinimo: 0.2,
          },
          linhasEmAberto: [],
        };
        secaoAtual = 'produtos';
        desenhar();
      },
    }),
  ]));
  return partes;
}

/** Código a partir do nome: sem acento, sem espaço, começando por letra. */
function novoCodigo(nome) {
  const base = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
  return /^[a-zA-Z]/.test(base) ? base.charAt(0).toLowerCase() + base.slice(1) : `p${base}`;
}

/* ── seção: fator K ───────────────────────────────────────────────────────── */

function secaoFatorK() {
  const fatores = edicao.fatorKFGI.fatores;
  const prazos = Object.keys(fatores).map(Number).sort((a, b) => a - b);

  const corpo = criar('tbody', {}, prazos.map((prazo) => criar('tr', {}, [
    criar('td', { texto: `${prazo} meses` }),
    criar('td', {}, [criar('input', {
      type: 'text',
      value: String(fatores[prazo]).replace('.', ','),
      'aria-label': `Fator K de ${prazo} meses`,
      onChange: (ev) => {
        const lido = Number(String(ev.target.value).replace(',', '.'));
        if (!Number.isFinite(lido) || lido <= 0) {
          mostrarErro(`Fator K de ${prazo} meses: "${ev.target.value}" não é um número positivo.`);
          return;
        }
        mostrarErro('');
        fatores[prazo] = lido;
        atualizarBarra();
      },
    })]),
    criar('td', {}, [criar('button', {
      type: 'button', class: 'secundario', texto: 'Remover',
      onClick: () => {
        if (!confirm(`Remover o prazo de ${prazo} meses da tabela do fator K?\n\n`
          + 'A busca é exata: operações com este prazo passarão a ser recusadas.')) return;
        delete fatores[prazo];
        desenhar();
      },
    })]),
  ])));

  return [
    criar('h2', { texto: 'Fator K do FGI' }),
    criar('p', { class: 'ajuda', texto:
      'Consultado por prazo exato, sem interpolação: um prazo que não estiver aqui faz a '
      + 'operação ser recusada, em vez de receber um fator aproximado. '
      + `Hoje a tabela cobre ${prazos.length} prazos, de ${prazos[0]} a ${prazos[prazos.length - 1]} meses.` }),
    criar('div', { class: 'rolagem' }, [
      criar('table', { class: 'tabela-de-fatores' }, [
        criar('thead', {}, [criar('tr', {}, [
          criar('th', { texto: 'Prazo' }), criar('th', { texto: 'Fator K' }), criar('th', { texto: '' }),
        ])]),
        corpo,
      ]),
    ]),
    criar('p', {}, [criar('button', {
      type: 'button', texto: 'Incluir prazo',
      onClick: () => {
        const resposta = prompt('Prazo em meses:');
        if (resposta === null) return;
        const prazo = Number(resposta);
        if (!Number.isInteger(prazo) || prazo < 1) { mostrarErro('Prazo precisa ser um número inteiro de meses.'); return; }
        if (prazo in fatores) { mostrarErro(`O prazo de ${prazo} meses já está na tabela.`); return; }
        fatores[prazo] = 0.001;
        desenhar();
      },
    })]),
  ];
}

/* ── seção: encargos ──────────────────────────────────────────────────────── */

function secaoEncargos() {
  const escada = edicao.encargos.tac.escadaPadrao;

  return [
    criar('h2', { texto: 'IOF' }),
    criar('div', { class: 'campos' }, CAMPOS_IOF.map((c) => campoDe(c, `encargos.iof.${c.chave}`))),

    criar('h2', { texto: 'TAC — escada por faixa de valor' }),
    criar('p', { class: 'ajuda', texto:
      'As faixas são percorridas de cima para baixo, e vale a primeira em que o valor couber. '
      + 'A última precisa ficar sem teto.' }),
    ...escada.map((faixa, i) => criar('section', { class: 'grupo-de-linhas' }, [
      criar('h3', { texto: `Faixa ${i + 1} — ${faixa.tipo}` }),
      criar('div', { class: 'campos' },
        CAMPOS_DA_FAIXA_DE_TAC
          .filter((c) => faixa[c.chave] !== undefined)
          .map((c) => campoDe(c, `encargos.tac.escadaPadrao.${i}.${c.chave}`))),
    ])),

    criar('h2', { texto: 'Demais encargos' }),
    criar('div', { class: 'campos' },
      Object.entries(CAMPOS_SIMPLES).map(([caminho, campo]) => campoDe(campo, caminho))),
  ];
}

/* ── seção: indexadores ───────────────────────────────────────────────────── */

function secaoIndexadores() {
  const partes = [
    criar('h2', { texto: 'Indexadores' }),
    criar('p', { class: 'ajuda', texto:
      'O valor daqui é uma sugestão que aparece no formulário de simulação, e nunca é '
      + 'aplicado sozinho: quem simula informa o valor a usar. Uma sugestão defasada produz '
      + 'simulação plausível e errada, e por isso a data de vigência é pedida junto.' }),
  ];
  for (const [codigo, ix] of Object.entries(edicao.indexadores)) {
    partes.push(criar('section', { class: 'grupo-de-linhas' }, [
      criar('h3', { texto: `${codigo} — ${ix.nome}` }),
      criar('p', { class: 'quem-usa', texto: `Fonte: ${ix.fonte}. ${ix.descricao}` }),
      ix.referencia === null
        ? criar('p', { class: 'somente-leitura' }, [
          'Sem valor de referência. ',
          criar('button', {
            type: 'button', class: 'secundario', texto: 'Passar a sugerir um valor',
            onClick: () => {
              edicao.indexadores[codigo].referencia = {
                valor: 0, unidade: 'anual', origem: 'informado na administração',
                vigencia: new Date().toISOString().slice(0, 10),
              };
              desenhar();
            },
          }),
        ])
        : criar('div', { class: 'campos' },
          CAMPOS_DO_INDEXADOR.map((c) => campoDe(c, `indexadores.${codigo}.${c.chave}`))),
    ]));
  }
  return partes;
}

/* ── seção: testar ────────────────────────────────────────────────────────
 *
 * A parte que justifica o painel existir. Sem ela, publicar é um ato de fé:
 * altera-se 8,8992 para 9,15 e não há como saber, antes de todo mundo ver, se
 * a parcela saiu como se esperava.
 */

const testeAtual = { produto: null, linha: null, valor: 50000, prazo: 24, carencia: 0 };

function secaoTeste() {
  const produtos = listarProdutos(edicao);
  if (testeAtual.produto === null) testeAtual.produto = produtos[0]?.codigo ?? null;

  let linhas = [];
  try { linhas = listarLinhas(testeAtual.produto, {}, edicao); } catch { linhas = []; }
  if (!linhas.some((l) => l.nome === testeAtual.linha)) testeAtual.linha = linhas[0]?.nome ?? null;

  const seletor = (rotulo, opcoes, atual, aoMudar) => criar('div', { class: 'campo' }, [
    criar('label', { texto: rotulo }),
    criar('select', { onChange: (ev) => { aoMudar(ev.target.value); desenhar(); } },
      opcoes.map((o) => criar('option', { value: o.valor, texto: o.texto, selected: o.valor === atual }))),
  ]);

  const numeroDe = (rotulo, chave) => criar('div', { class: 'campo' }, [
    criar('label', { texto: rotulo }),
    criar('input', {
      type: 'number', value: String(testeAtual[chave]),
      onChange: (ev) => { testeAtual[chave] = Number(ev.target.value); desenhar(); },
    }),
  ]);

  const partes = [
    criar('h2', { texto: 'Testar antes de publicar' }),
    criar('p', { class: 'ajuda', texto:
      'Roda a mesma simulação duas vezes: com os parâmetros que estão no ar e com os que '
      + 'você editou. Se a alteração não era para mexer nesta linha, as duas colunas têm de '
      + 'sair iguais.' }),
    criar('div', { class: 'campos' }, [
      seletor('Produto', produtos.map((p) => ({ valor: p.codigo, texto: p.nome })),
        testeAtual.produto, (v) => { testeAtual.produto = v; testeAtual.linha = null; }),
      linhas.length > 0
        ? seletor('Linha', linhas.map((l) => ({ valor: l.nome, texto: l.nome })),
          testeAtual.linha, (v) => { testeAtual.linha = v; })
        : criar('p', { class: 'somente-leitura', texto: 'Este produto não tem linha disponível no conjunto editado.' }),
      numeroDe('Valor solicitado', 'valor'),
      numeroDe('Prazo (meses)', 'prazo'),
      numeroDe('Carência (meses)', 'carencia'),
    ]),
  ];

  const entrada = {
    produto: testeAtual.produto, linha: testeAtual.linha,
    valorSolicitado: testeAtual.valor, prazo: testeAtual.prazo, carencia: testeAtual.carencia,
  };
  const executar = (conjunto) => {
    try { return { ok: true, s: simular(entrada, conjunto) }; }
    catch (e) { return { ok: false, mensagem: e.message ?? String(e) }; }
  };
  const antes = executar(publicado);
  const depois = executar(edicao);

  const celula = (r, extrair) => {
    if (!r.ok) return criar('td', { texto: '—' });
    return criar('td', { texto: extrair(r.s) });
  };
  const linhaDeComparacao = (rotulo, extrair) => {
    const a = antes.ok ? extrair(antes.s) : null;
    const d = depois.ok ? extrair(depois.s) : null;
    return criar('tr', { 'data-relevancia': a !== d ? 'critica' : null }, [
      criar('td', { texto: rotulo }),
      celula(antes, extrair),
      celula(depois, extrair),
    ]);
  };

  if (!antes.ok && !depois.ok) {
    partes.push(criar('p', { class: 'achado impedimento', texto:
      `Nenhum dos dois conjuntos calcula esta operação: ${depois.mensagem}` }));
    return partes;
  }
  if (antes.ok !== depois.ok) {
    partes.push(criar('p', { class: 'achado impedimento', texto: depois.ok
      ? 'Os parâmetros novos passam a calcular uma operação que hoje é recusada: '
        + antes.mensagem
      : 'Os parâmetros novos passam a recusar uma operação que hoje é calculada: '
        + depois.mensagem }));
  }

  partes.push(criar('div', { class: 'rolagem' }, [
    criar('table', { class: 'tabela-de-fatores' }, [
      criar('thead', {}, [criar('tr', {}, [
        criar('th', { texto: '' }),
        criar('th', { texto: 'No ar hoje' }),
        criar('th', { texto: 'Com a sua alteração' }),
      ])]),
      criar('tbody', {}, [
        linhaDeComparacao('Taxa aplicada', (s) => formatarTaxa(s.taxaAplicada)),
        linhaDeComparacao('Valor financiado', (s) => moeda(s.valorFinanciado)),
        linhaDeComparacao('TAC', (s) => moeda(s.tac)),
        linhaDeComparacao('IOF', (s) => moeda(s.iof)),
        linhaDeComparacao('Primeira parcela', (s) => moeda(s.primeiraParcela)),
        linhaDeComparacao('Última parcela', (s) => moeda(s.ultimaParcela)),
        linhaDeComparacao('Total de juros', (s) => moeda(s.totalJuros)),
        linhaDeComparacao('Total pago', (s) => moeda(s.totalPago)),
        linhaDeComparacao('TIR ao mês', (s) => (s.tirComBonus === null ? '—' : `${numero(s.tirComBonus * 100, 4)}%`)),
      ]),
    ]),
  ]));
  return partes;
}

/* ── seção: senha ─────────────────────────────────────────────────────────── */

function secaoAcesso() {
  const configurada = exigeSenha(edicao);
  const partes = [
    criar('h2', { texto: 'Senha do painel' }),
    criar('p', { class: 'achado alerta', texto:
      'Leia antes de confiar nela. O simulador não tem servidor: tudo roda no navegador de '
      + 'quem abre a página, e o código é público. Uma senha conferida aqui impede o acesso '
      + 'acidental — o clique errado, a aba aberta na máquina compartilhada —, e deixa '
      + 'explícito que a página não é para qualquer um. Não impede quem saiba abrir as '
      + 'ferramentas do desenvolvedor. Para isso seria preciso um servidor que autentique '
      + 'de verdade.' }),
    criar('p', { class: 'ajuda', texto:
      'A senha nunca é guardada: fica um resumo dela, calculado com sal e trezentas e dez mil '
      + 'iterações, de modo que cada tentativa de adivinhação custa caro. Por isso o mínimo de '
      + `${TAMANHO_MINIMO} caracteres — o resumo fica num arquivo público, e senha curta se `
      + 'quebra mesmo com o cálculo caro.' }),
  ];

  if (!disponivel()) {
    partes.push(criar('p', { class: 'achado impedimento', texto:
      'Esta página está aberta fora de um contexto seguro, e o navegador não oferece as funções '
      + 'de criptografia. Abra pelo endereço https do site.' }));
    return partes;
  }

  partes.push(criar('p', { class: configurada ? 'somente-leitura' : 'achado alerta', texto: configurada
    ? `Há senha definida em ${edicao.acesso.definidaEm}. Trocá-la exige publicar, como qualquer parâmetro.`
    : 'Não há senha definida: o painel abre para quem tiver o endereço.' }));

  const campoSenha = criar('input', { type: 'password', id: 'senha-nova', autocomplete: 'new-password' });
  const campoRepete = criar('input', { type: 'password', id: 'senha-repete', autocomplete: 'new-password' });

  partes.push(criar('div', { class: 'campos' }, [
    criar('div', { class: 'campo' }, [
      criar('label', { for: 'senha-nova', texto: configurada ? 'Nova senha' : 'Senha' }),
      campoSenha,
      criar('p', { class: 'ajuda', texto: `Ao menos ${TAMANHO_MINIMO} caracteres.` }),
    ]),
    criar('div', { class: 'campo' }, [
      criar('label', { for: 'senha-repete', texto: 'Repita' }),
      campoRepete,
      criar('p', { class: 'ajuda', texto: 'Se as duas não baterem, nada é alterado.' }),
    ]),
  ]));

  partes.push(criar('p', {}, [
    criar('button', {
      type: 'button', texto: configurada ? 'Trocar a senha' : 'Definir a senha',
      onClick: async () => {
        if (campoSenha.value !== campoRepete.value) {
          mostrarErro('As duas senhas não são iguais.');
          return;
        }
        try {
          edicao.acesso = await definirSenha(campoSenha.value);
          mostrarErro('');
          desenhar();
        } catch (e) {
          mostrarErro(e.message);
        }
      },
    }),
    configurada ? ' ' : null,
    configurada ? criar('button', {
      type: 'button', class: 'secundario', texto: 'Remover a senha',
      onClick: () => {
        if (!confirm('Remover a senha? O painel passa a abrir para quem tiver o endereço.')) return;
        delete edicao.acesso;
        desenhar();
      },
    }) : null,
  ]));

  partes.push(criar('p', { class: 'ajuda', texto:
    'A senha só passa a valer depois de publicada, como qualquer outro parâmetro: ela vai '
    + 'junto no arquivo, na aba Conferir e publicar.' }));
  return partes;
}

/* ── seção: conferir e publicar ───────────────────────────────────────────── */

function secaoConferir() {
  const dif = diferencas(publicado, edicao);
  const resultado = validar(edicao, { referencia: publicado });

  const partes = [
    criar('h2', { texto: 'Conferir e publicar' }),
    criar('div', { class: 'campos' },
      CAMPOS_DA_PUBLICACAO.map((c) => campoDe(c, `metadados.${c.chave}`, { redesenhar: true }))),
  ];

  partes.push(criar('h3', { texto: `O que mudou — ${plural(dif.total, 'alteração', 'alterações')}` }));
  if (dif.total === 0) {
    partes.push(criar('p', { class: 'somente-leitura', texto:
      'Nenhuma diferença em relação ao que está publicado. Não há o que publicar.' }));
  } else {
    partes.push(criar('ul', { class: 'lista-de-mudancas' }, dif.mudancas.map((m) => criar('li', {
      'data-relevancia': m.relevancia,
    }, [
      criar('span', { class: 'rotulo', texto: m.rotulo }),
      criar('span', { class: 'de-para' }, [
        m.de ? criar('span', { class: 'de', texto: m.de }) : null,
        m.de && m.para ? ' → ' : null,
        m.para ? criar('span', { class: 'para', texto: m.para }) : null,
      ]),
      m.nota ? criar('span', { class: 'nota', texto: m.nota }) : null,
    ]))));
  }

  const achados = [...resultado.impedimentos, ...resultado.alertas];
  partes.push(criar('h3', { texto: 'Conferência — '
    + `${plural(resultado.impedimentos.length, 'impedimento', 'impedimentos')}, `
    + `${plural(resultado.alertas.length, 'alerta', 'alertas')}` }));
  if (achados.length === 0) {
    partes.push(criar('p', { class: 'somente-leitura', texto: 'Nada a apontar.' }));
  }
  for (const a of achados) {
    partes.push(criar('p', { class: `achado ${a.severidade}` }, [
      a.mensagem,
      a.herdado ? criar('span', { class: 'herdado', texto: 'já existia' }) : null,
      criar('span', { class: 'onde', texto: a.onde }),
    ]));
  }

  partes.push(criar('h3', { texto: 'Publicar' }));

  // O botão fica sempre visível, e desabilitado quando não dá para publicar,
  // com o motivo ao lado.
  //
  // Escondê-lo foi erro de projeto: quem administra abria esta tela, procurava
  // o botão que o manual descreve, não achava, e não tinha como saber por quê —
  // o aviso existia, mas embaixo da lista de achados, que pode ser longa.
  // Um botão ausente não ensina nada; um botão desabilitado diz que ele existe
  // e o que falta para usá-lo.
  const pendencias = resultado.impedimentos.map((i) => i.mensagem);
  if (resultado.podePublicar && dif.total === 0) pendencias.push('Não há alteração nenhuma a publicar.');

  if (pendencias.length > 0) {
    partes.push(criar('div', { class: 'falta-para-publicar' }, [
      criar('p', { texto: pendencias.length === 1
        ? 'Falta uma coisa para poder publicar:'
        : `Faltam ${pendencias.length} coisas para poder publicar:` }),
      criar('ul', {}, pendencias.map((m) => criar('li', { texto: m }))),
    ]));
  }

  if (pendencias.length > 0) {
    partes.push(criar('p', {}, [
      criar('button', {
        type: 'button', disabled: true, texto: 'Baixar os arquivos para publicar',
        title: pendencias.join(' '),
      }),
    ]));
  } else {
    partes.push(
      criar('ol', { class: 'passos-da-publicacao' }, [
        criar('li', {}, ['Baixe os dois arquivos, um em cada botão abaixo. '
          + 'São dois cliques porque o navegador barra o segundo download automático.']),
        criar('li', {}, [
          'No repositório, substitua ', criar('code', { texto: 'simulador/js/data/parametros-vigentes.js' }),
          ' e ', criar('code', { texto: 'simulador/dados/PARAMETROS_VIGENTES.json' }),
          ' pelos arquivos baixados.',
        ]),
        criar('li', {}, [
          'Confirme a alteração descrevendo o ato normativo. A publicação leva cerca de um minuto, '
          + 'e quem abrir o simulador depois disso já recebe os valores novos — sem aviso e sem clique.',
        ]),
        criar('li', {}, [
          'Guarde o relatório desta tela junto do processo: é o registro do que mudou e por quê.',
        ]),
      ]),
      botoesDeDownload(),
      criar('p', {}, [
        criar('button', {
          type: 'button', class: 'secundario', texto: 'Imprimir o relatório de alterações',
          onClick: () => window.print(),
        }),
      ]),
    );
  }
  return partes;
}

/* ── arquivos ─────────────────────────────────────────────────────────────── */

function baixar(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: `${tipo};charset=utf-8` }));
  const a = criar('a', { href: url, download: nome.split('/').pop() });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Carimba os metadados da publicação e devolve os dois arquivos prontos.
 *
 * O carimbo do instante é feito **uma vez** por publicação, e não a cada
 * clique. Refazê-lo daria aos dois arquivos um `publicadoEm` diferente: o
 * módulo que o aplicativo carrega e o JSON que o auditor lê passariam a
 * discordar, sendo que existem justamente para dizer a mesma coisa. Encontrado
 * ao conferir os dois arquivos baixados, que não batiam.
 *
 * O carimbo é descartado quando a edição muda, para que uma alteração feita
 * depois do primeiro download não seja publicada sob o instante anterior.
 */
let carimboDaPublicacao = null;

function prepararPublicacao() {
  const meta = edicao.metadados ?? {};
  if (carimboDaPublicacao === null) carimboDaPublicacao = new Date().toISOString();
  edicao.metadados = {
    ...meta,
    ...metadadosDePublicacao(publicado, {
      atoNormativo: meta.atoNormativo,
      vigenciaInicio: meta.vigenciaInicio,
      publicadoPor: meta.publicadoPor,
      observacoes: meta.observacoes,
    }),
    publicadoEm: carimboDaPublicacao,
    baseadoEm: meta.baseadoEm ?? publicado.metadados?.baseadoEm ?? null,
  };
  return arquivosParaPublicar(edicao);
}

/**
 * O conteúdo da edição, ignorando o que é da publicação em si.
 *
 * Serve para perceber que algo mudou depois de um download: aí o carimbo e as
 * marcas de «já baixado» são descartados, porque o arquivo que está na pasta
 * de downloads deixou de corresponder ao que está na tela — e publicar um
 * arquivo velho junto de um novo é o pior desfecho possível.
 */
function assinaturaDaEdicao() {
  const { metadados, ...resto } = edicao;
  const m = metadados ?? {};
  // Lista do que conta, e não do que se ignora. Preparar a publicação escreve
  // `versao`, `sucedeVersao` e `publicadoEm` nos metadados; com uma lista de
  // exclusões, esquecer um deles fazia a assinatura mudar sozinha logo após o
  // primeiro download, e as marcas de «já baixado» sumiam sem nada ter mudado.
  return JSON.stringify({
    ...resto,
    digitado: {
      vigenciaInicio: m.vigenciaInicio ?? '',
      atoNormativo: m.atoNormativo ?? '',
      publicadoPor: m.publicadoPor ?? '',
      observacoes: m.observacoes ?? '',
    },
  });
}

let assinaturaVista = null;

function esquecerDownloadsSeMudou() {
  const agora = assinaturaDaEdicao();
  if (assinaturaVista !== null && agora !== assinaturaVista) {
    carimboDaPublicacao = null;
    jaBaixados.clear();
  }
  assinaturaVista = agora;
}

/**
 * Um arquivo por clique.
 *
 * Baixar os dois de uma vez é o que se esperaria, e foi como estava — mas o
 * navegador barra o segundo download automático de uma mesma página sem
 * autorização, e o aviso disso é um ícone discreto na barra de endereço. O
 * efeito para quem administra foi só um dos dois arquivos aparecer na pasta,
 * sem nada explicando a ausência do outro; e publicar um sem o outro deixa os
 * dois em desacordo.
 *
 * Cada botão baixa o seu, no clique da pessoa, que é o que o navegador sempre
 * permite. Ao lado deles fica a marca de qual já foi baixado, para que a falta
 * de um seja visível na própria tela.
 */
const jaBaixados = new Set();

function baixarUm(indice) {
  const arquivo = prepararPublicacao()[indice];
  baixar(arquivo.nome, arquivo.conteudo, arquivo.tipo);
  jaBaixados.add(arquivo.nome);
  desenhar();
}

function botoesDeDownload() {
  const arquivos = arquivosParaPublicar(edicao);
  return criar('div', { class: 'arquivos-a-baixar' }, arquivos.map((arquivo, i) => {
    const baixado = jaBaixados.has(arquivo.nome);
    return criar('p', { class: 'arquivo-a-baixar' }, [
      criar('button', {
        type: 'button',
        class: baixado ? 'secundario' : '',
        texto: `${baixado ? 'Baixar de novo' : 'Baixar'} ${arquivo.nome.split('/').pop()}`,
        onClick: () => baixarUm(i),
      }),
      criar('span', { class: baixado ? 'ja-baixado' : 'falta-baixar',
        texto: baixado ? ' ✓ baixado' : ' ainda não baixado' }),
    ]);
  }));
}

function baixarRascunho() {
  baixar('rascunho-parametros.json', `${JSON.stringify(edicao, null, 2)}\n`, 'application/json');
}

function abrirArquivo() {
  const entrada = criar('input', { type: 'file', accept: '.json,.js,application/json,text/javascript' });
  entrada.addEventListener('change', async () => {
    const arquivo = entrada.files?.[0];
    if (!arquivo) return;
    try {
      edicao = comMetadadosLimpos(lerConjunto(await arquivo.text()));
      mostrarErro('');
      desenhar();
    } catch (e) {
      mostrarErro(`Não consegui ler o arquivo: ${e.message}`);
    }
  });
  entrada.click();
}

/* ── barra de estado e desenho ────────────────────────────────────────────── */

function atualizarBarra() {
  const barra = document.querySelector('.estado-da-edicao .resumo');
  if (!barra) return;
  const dif = diferencas(publicado, edicao);
  barra.replaceChildren(...(dif.total === 0
    ? [document.createTextNode('Nenhuma alteração ainda. '
      + `Em vigor: ${publicado.metadados?.versao ?? '—'}.`)]
    : [
      criar('strong', { texto: dif.total === 1
        ? '1 alteração pendente' : `${dif.total} alterações pendentes` }),
      document.createTextNode(dif.criticas > 0
        ? `, ${dif.criticas === 1 ? 'uma delas' : `${dif.criticas} delas`} de efeito amplo. `
          + 'Nada foi publicado ainda.'
        : '. Nada foi publicado ainda.'),
    ]));
}

function barraDeEstado() {
  return criar('div', { class: 'estado-da-edicao' }, [
    criar('p', { class: 'resumo' }),
    criar('div', { class: 'acoes' }, [
      criar('button', { type: 'button', class: 'secundario', texto: 'Abrir arquivo', onClick: abrirArquivo }),
      criar('button', { type: 'button', class: 'secundario', texto: 'Baixar rascunho', onClick: baixarRascunho }),
      criar('button', {
        type: 'button', class: 'secundario', texto: 'Descartar alterações',
        onClick: () => {
          if (!confirm('Descartar tudo que foi alterado e voltar ao que está publicado?')) return;
          edicao = comMetadadosLimpos(structuredClone(publicado));
          mostrarErro('');
          desenhar();
        },
      }),
    ]),
  ]);
}

const DESENHOS = {
  acesso: secaoAcesso,
  produtos: secaoProdutos,
  linhas: secaoLinhas,
  fatorK: secaoFatorK,
  encargos: secaoEncargos,
  indexadores: secaoIndexadores,
  teste: secaoTeste,
  conferir: secaoConferir,
};

function desenharMenu() {
  menu.replaceChildren(...SECOES.map((s) => criar('button', {
    type: 'button',
    class: s.id === secaoAtual ? 'ativo' : '',
    'aria-current': s.id === secaoAtual ? 'page' : null,
    texto: s.titulo,
    onClick: () => { secaoAtual = s.id; desenhar(); window.scrollTo({ top: 0 }); },
  })));
}

function desenhar() {
  esquecerDownloadsSeMudou();
  desenharMenu();
  conteudo.replaceChildren(barraDeEstado(), ...(DESENHOS[secaoAtual] ?? secaoLinhas)());
  atualizarBarra();
}

/**
 * A porta.
 *
 * Nada do painel é desenhado antes de a senha bater. Não é controle de acesso —
 * o código é público e a verificação roda no navegador de quem abre —, mas é o
 * que impede o acesso acidental, que é o dano real: publicar uma alteração de
 * taxa por engano.
 *
 * A liberação vale pela aba, e não pelo aparelho: `sessionStorage` some quando
 * a aba fecha. Numa máquina compartilhada, deixar o painel aberto para sempre
 * seria pior do que não ter senha nenhuma.
 */
const CHAVE_DA_SESSAO = 'simulador-goiasfomento:painel-liberado';

function pedirSenha() {
  const campo = criar('input', { type: 'password', id: 'senha', autocomplete: 'current-password' });
  const aviso = criar('p', { class: 'achado impedimento', hidden: true });

  const tentar = async () => {
    try {
      if (await conferirSenha(campo.value, publicado.acesso)) {
        sessionStorage.setItem(CHAVE_DA_SESSAO, '1');
        desenhar();
        return;
      }
    } catch { /* cai no aviso */ }
    aviso.textContent = 'Senha incorreta.';
    aviso.hidden = false;
    campo.select();
  };

  campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') tentar(); });

  conteudo.replaceChildren(criar('section', { class: 'grupo-de-linhas porta' }, [
    criar('h2', { texto: 'Painel de administração' }),
    criar('p', { class: 'ajuda', texto:
      'Esta página altera os parâmetros que todo mundo vê. Informe a senha para continuar.' }),
    aviso,
    criar('div', { class: 'campo' }, [
      criar('label', { for: 'senha', texto: 'Senha' }), campo,
    ]),
    criar('p', {}, [criar('button', { type: 'button', texto: 'Entrar', onClick: tentar })]),
    criar('p', { class: 'ajuda', texto:
      'Quem só quer conferir os parâmetros em vigor não precisa de senha: eles estão na aba '
      + 'Parâmetros do simulador, sem possibilidade de alteração.' }),
  ]));
  menu.replaceChildren();
  campo.focus();
}

if (exigeSenha(publicado) && sessionStorage.getItem(CHAVE_DA_SESSAO) !== '1') {
  pedirSenha();
} else {
  desenhar();
}
