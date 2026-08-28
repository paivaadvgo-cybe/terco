/**
 * Aplicativo: navegação entre as telas e a ligação com o motor.
 *
 * A interface chama o motor; o motor não conhece HTML. Este arquivo é a única
 * costura entre os dois, e é aqui que o erro estruturado do motor vira uma
 * mensagem legível — sem nunca virar um número inventado.
 */

import { simular } from './produtos/produtos.js';
import { PARAMETROS } from './data/parametros.js';
import { listarProdutos, listarLinhas, PRODUTOS, VERSAO_DO_MOTOR } from './produtos/produtos.js';
import { Formulario, criar } from './ui/formulario.js';
import { desenharResultado } from './ui/resultado.js';
import { desenharCronograma } from './ui/cronograma.js';
import { desenharComparador } from './ui/comparador.js';
import { moeda, taxa, meses, dataHora } from './ui/formatar.js';
import * as armazem from './storage/simulacoes.js';

const TELAS = {
  nova: 'Nova simulação',
  salvas: 'Simulações salvas',
  comparar: 'Comparar',
  relatorios: 'Relatórios',
  parametros: 'Parâmetros',
  sobre: 'Sobre',
};

const app = {
  tela: 'nova',
  simulacao: null,
  formulario: null,
};

const $ = (seletor) => document.querySelector(seletor);

function navegar(tela) {
  app.tela = tela;
  for (const botao of document.querySelectorAll('.menu button')) {
    botao.setAttribute('aria-current', botao.dataset.tela === tela ? 'page' : 'false');
  }
  $('#conteudo').replaceChildren();
  desenhar[tela]();
  window.scrollTo(0, 0);
}

/**
 * Traduz o erro do motor para a linguagem de quem opera.
 *
 * O motor devolve mensagem técnica e, junto, os dados estruturados que a
 * originaram. Reaproveitar esses dados aqui deixa o número em reais na tela
 * sem obrigar o motor a saber o que é «pt-BR» — a formatação continua sendo
 * assunto da interface.
 */
function mensagemDeErro(e) {
  const d = e.dados ?? {};
  switch (e.codigo) {
    case 'VALOR_ACIMA_DO_LIMITE':
      return `Esta linha vai até ${moeda(d.limite)}, e foram pedidos ${moeda(d.valorSolicitado)}.`;
    case 'VALOR_ABAIXO_DO_MINIMO':
      return `Esta linha começa em ${moeda(d.minimo)}, e foram pedidos ${moeda(d.valorSolicitado)}.`;
    case 'PRAZO_INVALIDO':
      return d.prazoMaximo
        ? `Esta linha vai até ${meses(d.prazoMaximo)}, e foram pedidos ${meses(d.prazo)}.`
        : e.message;
    case 'CARENCIA_INVALIDA':
      return d.carenciaMaxima
        ? `Esta linha admite até ${meses(d.carenciaMaxima)} de carência, e foram pedidos ${meses(d.carencia)}.`
        : e.message;
    default:
      return e.message;
  }
}

/** O erro do motor traz código e mensagem; os dois vão para a tela. */
function mostrarErro(mensagem, codigo) {
  const painel = $('#erro');
  painel.replaceChildren(
    criar('strong', { texto: codigo ? `${codigo} — ` : 'Não foi possível calcular. ' }),
    document.createTextNode(mensagem),
  );
  painel.hidden = false;
  painel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function limparErro() {
  const painel = $('#erro');
  painel.hidden = true;
  painel.replaceChildren();
}

const desenhar = {
  nova() {
    const raiz = $('#conteudo');
    const area = criar('div', { class: 'coluna' });
    raiz.append(area);
    app.formulario = new Formulario(area, (entrada) => {
      limparErro();
      try {
        app.simulacao = simular(entrada);
        mostrarResultado();
      } catch (e) {
        if (e.codigo) mostrarErro(mensagemDeErro(e), e.codigo);
        else throw e;
      }
    });
  },

  async salvas() {
    const raiz = $('#conteudo');
    raiz.append(criar('h1', { texto: 'Simulações salvas' }));

    if (!await armazem.disponivel()) {
      raiz.append(criar('p', { class: 'aviso' }, [
        'Este navegador não permite guardar simulações neste aparelho.',
      ]));
      return;
    }

    const lista = await armazem.listar();
    if (!lista.length) {
      raiz.append(criar('p', { class: 'vazio' }, [
        'Nenhuma simulação salva ainda. Faça uma simulação e use ',
        criar('strong', { texto: 'Salvar simulação' }), ' ao fim do resultado.',
      ]));
      return;
    }

    raiz.append(criar('ul', { class: 'lista-salvas' }, lista.map((s) => criar('li', {}, [
      criar('div', { class: 'resumo-salva' }, [
        criar('strong', { texto: s.apelido }),
        criar('span', {
          class: 'meta',
          texto: `${moeda(s.valorSolicitado)} · ${meses(s.prazo)} · ${s.sistemaAmortizacao}`
            + ` · salva em ${dataHora(s.salvaEm)} · parâmetros ${s.versaoParametros}`,
        }),
      ]),
      criar('div', { class: 'acoes-linha' }, [
        criar('button', { onClick: () => { app.simulacao = s; mostrarResultado(); } }, ['Abrir']),
        criar('button', {
          onClick: async () => {
            const novo = prompt('Novo nome para a simulação:', s.apelido);
            if (novo) { await armazem.renomear(s.id, novo); navegar('salvas'); }
          },
        }, ['Renomear']),
        criar('button', {
          onClick: async () => { await armazem.duplicar(s.id); navegar('salvas'); },
        }, ['Duplicar']),
        criar('button', {
          class: 'perigo',
          onClick: async () => {
            if (confirm(`Excluir "${s.apelido}"? Isto não pode ser desfeito.`)) {
              await armazem.excluir(s.id); navegar('salvas');
            }
          },
        }, ['Excluir']),
      ]),
    ]))));
  },

  comparar() {
    const raiz = $('#conteudo');
    if (!app.simulacao) {
      raiz.append(
        criar('h1', { texto: 'Comparar' }),
        criar('p', { class: 'vazio' }, [
          'A comparação parte de uma simulação. Faça uma em ',
          criar('strong', { texto: 'Nova simulação' }),
          ' — ou abra uma salva — e a aba ',
          criar('strong', { texto: 'SAC × PRICE' }),
          ' aparece junto com o resultado.',
        ]),
      );
      return;
    }
    mostrarResultado('comparacao');
  },

  relatorios() {
    proximaFase('Relatórios', 13,
      'Vai gerar o relatório completo para impressão e a exportação do cronograma em CSV.');
  },

  parametros() {
    const raiz = $('#conteudo');
    raiz.append(criar('h1', { texto: 'Parâmetros' }));
    raiz.append(criar('p', { class: 'subtitulo' }, [
      `Vigência ${PARAMETROS.versao}, extraída de ${PARAMETROS.origem}. `,
      'Motor ', VERSAO_DO_MOTOR, '.',
    ]));

    for (const familia of listarProdutos()) {
      const perfil = PRODUTOS[familia.codigo];
      const opcoes = perfil.regras.exigePorte ? { porte: 1 } : {};
      const linhas = listarLinhas(familia.codigo, opcoes);

      raiz.append(criar('section', { class: 'bloco' }, [
        criar('h2', { texto: familia.nome }),
        criar('p', { class: 'meta', texto: `Aba de origem: ${familia.abaDeOrigem}` }),
        criar('div', { class: 'rolagem-tabela' }, [
          criar('table', { class: 'parametros' }, [
            criar('thead', {}, [criar('tr', {}, [
              criar('th', { texto: 'Linha' }),
              criar('th', { class: 'num', texto: 'Taxa cheia' }),
              criar('th', { class: 'num', texto: 'Com bônus' }),
              criar('th', { class: 'num', texto: 'Prazo' }),
              criar('th', { class: 'num', texto: 'Carência' }),
              criar('th', { class: 'num', texto: 'Limite' }),
            ])]),
            criar('tbody', {}, linhas.map((l) => {
              const cheia = l.taxaCheia ?? l.porMunicipio?.prioritario?.taxaCheia;
              const bonus = l.taxaBonus ?? l.porMunicipio?.prioritario?.taxaBonus;
              return criar('tr', { class: l.emAberto ? 'indisponivel' : '' }, [
                criar('td', {}, [
                  l.nome,
                  l.emAberto ? criar('small', { class: 'ajuda', texto: l.emAberto.motivo }) : null,
                ].filter(Boolean)),
                criar('td', { class: 'num', texto: cheia ? taxa(cheia) : '—' }),
                criar('td', { class: 'num', texto: bonus ? taxa(bonus) : '—' }),
                criar('td', { class: 'num', texto: meses(l.prazoMaximo) }),
                criar('td', { class: 'num', texto: meses(l.carenciaMaxima) }),
                criar('td', { class: 'num', texto: moeda(l.limite) }),
              ]);
            })),
          ]),
        ]),
      ]));
    }
  },

  sobre() {
    const raiz = $('#conteudo');
    raiz.append(criar('h1', { texto: 'Sobre' }));
    raiz.append(criar('div', { class: 'texto' }, [
      criar('p', {}, [
        'Simulador de financiamento reconstruído a partir da planilha ',
        criar('em', { texto: PARAMETROS.origem }), ', com as regras dela preservadas.',
      ]),
      criar('p', {}, [
        'Tudo é calculado neste aparelho. Não há servidor, conta nem envio de dados: '
        + 'as simulações salvas ficam guardadas no próprio navegador.',
      ]),
      criar('h2', { texto: 'O que os números são, e o que não são' }),
      criar('p', {}, [
        'Os valores reproduzem o comportamento da planilha, inclusive onde ela é '
        + 'inconsistente. Quatorze pontos da planilha não puderam virar código sem uma '
        + 'decisão da instituição, e estão documentados na matriz de equivalência do '
        + 'repositório. Onde a regra não existe, o aplicativo recusa a simular em vez de '
        + 'produzir um número plausível.',
      ]),
      criar('p', {}, [
        'A TIR exibida é a taxa interna de retorno do fluxo de prestações, como a planilha '
        + 'a calcula. ', criar('strong', { texto: 'Não é o Custo Efetivo Total.' }),
        ' O CET exigiria trazer todos os encargos para dentro do fluxo, e a planilha não '
        + 'faz isso.',
      ]),
      criar('p', {}, [
        'Uma simulação não é proposta, não vincula a instituição e não garante concessão.',
      ]),
      criar('h2', { texto: 'Versões' }),
      criar('p', { class: 'meta' }, [
        `Parâmetros ${PARAMETROS.versao} · motor ${VERSAO_DO_MOTOR}`,
      ]),
    ]));
  },
};

function proximaFase(nome, fase, descricao) {
  $('#conteudo').append(
    criar('h1', { texto: nome }),
    criar('p', { class: 'vazio' }, [
      criar('strong', { texto: `Ainda não implementado — fase ${fase}. ` }), descricao,
    ]),
  );
}

function mostrarResultado(abaInicial = 'resumo') {
  const raiz = $('#conteudo');
  raiz.replaceChildren();

  const abas = criar('nav', { class: 'abas' });
  const painel = criar('div', { class: 'painel' });
  const alvos = {
    resumo: () => desenharResultado(painel, app.simulacao, {
      aoSalvar: async () => {
        const apelido = prompt('Nome desta simulação:',
          `${app.simulacao.linha} — ${moeda(app.simulacao.valorSolicitado)}`);
        if (!apelido) return;
        try {
          app.simulacao = await armazem.salvar(app.simulacao, apelido);
          alert('Simulação salva neste aparelho.');
        } catch (e) {
          mostrarErro(e.message);
        }
      },
      aoVoltar: () => navegar('nova'),
    }),
    cronograma: () => desenharCronograma(painel, app.simulacao),
    comparacao: () => {
      // O PRICE é gerado sob demanda, com a mesma entrada: comparar exige que a
      // única diferença entre os dois cronogramas seja o sistema.
      try {
        const price = app.simulacao.sistemaAmortizacao === 'PRICE'
          ? app.simulacao
          : simular({ ...app.simulacao.parametrosUtilizados.entrada, sistemaAmortizacao: 'PRICE' });
        const sac = app.simulacao.sistemaAmortizacao === 'SAC'
          ? app.simulacao
          : simular({ ...app.simulacao.parametrosUtilizados.entrada, sistemaAmortizacao: 'SAC' });
        desenharComparador(painel, sac, price);
      } catch (e) {
        painel.replaceChildren(criar('p', { class: 'aviso' }, [
          'Não foi possível montar a comparação: ', e.codigo ? mensagemDeErro(e) : e.message,
        ]));
      }
    },
  };

  for (const [chave, rotulo] of [['resumo', 'Resultado'], ['cronograma', 'Cronograma'], ['comparacao', 'SAC × PRICE']]) {
    abas.append(criar('button', {
      'data-aba': chave,
      onClick: (e) => {
        for (const b of abas.children) b.setAttribute('aria-current', b === e.target ? 'true' : 'false');
        alvos[chave]();
      },
    }, [rotulo]));
  }
  const inicial = abas.querySelector(`[data-aba="${abaInicial}"]`) ?? abas.firstElementChild;
  inicial.setAttribute('aria-current', 'true');

  raiz.append(abas, painel);
  alvos[inicial.dataset.aba]();
}

function iniciar() {
  const menu = $('.menu');
  for (const [chave, rotulo] of Object.entries(TELAS)) {
    menu.append(criar('button', {
      'data-tela': chave, onClick: () => navegar(chave),
    }, [rotulo]));
  }
  navegar('nova');
}

document.addEventListener('DOMContentLoaded', iniciar);
