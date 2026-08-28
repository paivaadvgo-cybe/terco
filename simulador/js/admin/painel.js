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
  lerCaminho, escreverCaminho, lerCampo, tipoDe, blocosDeTaxa,
} from './esquema.js';
import { validar } from './validar.js';
import { diferencas } from './diferenca.js';
import { arquivosParaPublicar, lerConjunto, metadadosDePublicacao } from './serializar.js';

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
let edicao = structuredClone(VIGENTES);
let secaoAtual = 'linhas';

const conteudo = document.getElementById('conteudo');
const menu = document.querySelector('.menu');
const painelDeErro = document.getElementById('erro');

const SECOES = [
  { id: 'linhas', titulo: 'Linhas de crédito' },
  { id: 'fatorK', titulo: 'Fator K do FGI' },
  { id: 'encargos', titulo: 'Encargos' },
  { id: 'indexadores', titulo: 'Indexadores' },
  { id: 'teste', titulo: 'Testar' },
  { id: 'conferir', titulo: 'Conferir e publicar' },
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
  const produtos = listarProdutos()
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
  const produtos = listarProdutos();
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
  if (!resultado.podePublicar) {
    partes.push(criar('p', { class: 'achado impedimento', texto:
      'Há impedimentos acima. Eles precisam ser resolvidos antes de gerar os arquivos.' }));
  } else if (dif.total === 0) {
    partes.push(criar('p', { class: 'somente-leitura', texto: 'Sem alterações a publicar.' }));
  } else {
    partes.push(
      criar('ol', { class: 'passos-da-publicacao' }, [
        criar('li', {}, ['Baixe os dois arquivos no botão abaixo.']),
        criar('li', {}, [
          'No repositório, substitua ', criar('code', { texto: 'simulador/js/data/parametros-vigentes.js' }),
          ' e ', criar('code', { texto: 'simulador/dados/PARAMETROS_VIGENTES.json' }),
          ' pelos arquivos baixados.',
        ]),
        criar('li', {}, [
          'Confirme a alteração descrevendo o ato normativo. A publicação leva cerca de um minuto, '
          + 'e quem já tiver o simulador aberto verá o aviso de atualização.',
        ]),
        criar('li', {}, [
          'Guarde o relatório desta tela junto do processo: é o registro do que mudou e por quê.',
        ]),
      ]),
      criar('p', {}, [
        criar('button', {
          type: 'button', texto: 'Baixar os arquivos para publicar',
          onClick: () => baixarArquivos(),
        }),
        ' ',
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

function baixarArquivos() {
  const meta = edicao.metadados ?? {};
  edicao.metadados = {
    ...meta,
    ...metadadosDePublicacao(publicado, {
      atoNormativo: meta.atoNormativo,
      vigenciaInicio: meta.vigenciaInicio,
      publicadoPor: meta.publicadoPor,
      observacoes: meta.observacoes,
    }),
    baseadoEm: meta.baseadoEm ?? publicado.metadados?.baseadoEm ?? null,
  };
  for (const arquivo of arquivosParaPublicar(edicao)) {
    baixar(arquivo.nome, arquivo.conteudo, arquivo.tipo);
  }
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
      edicao = lerConjunto(await arquivo.text());
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
          edicao = structuredClone(publicado);
          mostrarErro('');
          desenhar();
        },
      }),
    ]),
  ]);
}

const DESENHOS = {
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
  desenharMenu();
  conteudo.replaceChildren(barraDeEstado(), ...(DESENHOS[secaoAtual] ?? secaoLinhas)());
  atualizarBarra();
}

desenhar();
