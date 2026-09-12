/**
 * Configurações.
 *
 * Tudo que é raro fica aqui, e nada que é diário. O dono entra nesta tela no
 * primeiro dia, para pôr o nome e conferir os preços, e depois só quando
 * reajusta ou contrata alguém.
 *
 * **O PIN tranca o que muda dinheiro ou apaga dado** — preços, serviços,
 * restauração, apagar tudo. Não tranca registrar lavagem, finalizar nem
 * receber: quem atende precisa de zero senha por carro, ou o sistema vira
 * estorvo e volta para o caderno. Enquanto não houver PIN definido, nada está
 * trancado; a tranca é uma escolha de quem administra, não uma imposição.
 */

import { el, botao, cartao, campo, entrada, selecao, vazio, linhaDeValor } from '../elementos.js';
import { moeda, valorParaCampo, lerValor } from '../formatar.js';
import { avisar, confirmar, pedirPin } from '../avisos.js';
import { pinValido } from '../../armazenamento/pin.js';
import { TIPOS } from '../../dominio/veiculos.js';
import { baixar } from '../csv.js';
import { dia as diaDe } from '../../dominio/datas.js';

export async function telaConfiguracoes(contexto, parametros = {}) {
  const { armazenamento } = contexto;
  const secao = parametros.secao ?? 'geral';
  const desenhos = {
    geral: secaoGeral,
    servicos: secaoServicos,
    precos: secaoPrecos,
    equipe: secaoEquipe,
    dados: secaoDados,
  };
  return (desenhos[secao] ?? secaoGeral)(contexto, armazenamento);
}

/* ------------------------------------------------------------------- geral */

async function secaoGeral(contexto, armazenamento) {
  const configuracao = await armazenamento.configuracao();
  const tela = el('div', { classe: 'tela tela-config' });

  const campoNome = entrada({ value: configuracao.nome ?? '', placeholder: 'Meu Lava-Rápido' });
  const campoTelefone = entrada({ value: configuracao.telefone ?? '', type: 'tel', placeholder: '(00) 00000-0000' });
  const campoEndereco = entrada({ value: configuracao.endereco ?? '', placeholder: 'Rua, número, bairro' });

  const identidade = cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Meu lava-rápido' }),
    campo('Nome', campoNome),
    campo('Telefone', campoTelefone),
    campo('Endereço', campoEndereco),
    botao('SALVAR', async () => {
      await armazenamento.salvarConfiguracao({
        nome: campoNome.value.trim() || 'Meu Lava-Rápido',
        telefone: campoTelefone.value.trim(),
        endereco: campoEndereco.value.trim(),
      });
      avisar('Salvo', 'ok');
      contexto.recarregar();
    }, { tipo: 'principal', classe: 'largo' }),
  ]);

  const aparencia = cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Aparência' }),
    campo('Tema', selecao([
      { valor: 'auto', nome: 'Automático (do aparelho)' },
      { valor: 'claro', nome: 'Claro' },
      { valor: 'escuro', nome: 'Escuro' },
    ], configuracao.tema ?? 'auto', {
      onchange: async (evento) => {
        await armazenamento.salvarConfiguracao({ tema: evento.target.value });
        contexto.aplicarTema(evento.target.value);
        avisar('Tema alterado', 'ok');
      },
    })),
    campo('Modo rápido sempre ligado', selecao([
      { valor: 'nao', nome: 'Não — confirmar antes de iniciar' },
      { valor: 'sim', nome: 'Sim — registrar direto no serviço' },
    ], configuracao.modoRapido ? 'sim' : 'nao', {
      onchange: async (evento) => {
        await armazenamento.salvarConfiguracao({ modoRapido: evento.target.value === 'sim' });
        avisar('Salvo', 'ok');
      },
    }), 'No modo rápido, escolher o serviço já registra a lavagem.'),
  ]);

  const temPin = Boolean(configuracao.pin);
  const seguranca = cartao([
    el('h2', { classe: 'secao-titulo', texto: 'PIN administrativo' }),
    el('p', {
      classe: 'observacao',
      texto: temPin
        ? 'Preços, serviços, exclusões e restauração pedem o PIN. O atendimento não pede nada.'
        : 'Sem PIN, qualquer pessoa com o aparelho pode mudar preços e apagar registros.',
    }),
    botao(temPin ? 'Trocar PIN' : 'Definir PIN', async () => {
      if (temPin && !await contexto.autorizar('Trocar o PIN')) return;
      const novo = await pedirPin({ titulo: 'Novo PIN', texto: '4 ou 6 dígitos' });
      if (novo === null) return;
      if (!pinValido(novo)) { avisar('O PIN precisa ter 4 ou 6 dígitos', 'erro'); return; }
      const confirmacao = await pedirPin({ titulo: 'Repita o PIN' });
      if (confirmacao !== novo) { avisar('Os dois não bateram', 'erro'); return; }
      await armazenamento.definirPin(novo);
      avisar('PIN definido', 'ok');
      contexto.recarregar();
    }, { tipo: 'secundario', classe: 'largo' }),
    temPin
      ? botao('Remover PIN', async () => {
        if (!await contexto.autorizar('Remover o PIN')) return;
        await armazenamento.definirPin(null);
        avisar('PIN removido', 'atencao');
        contexto.recarregar();
      }, { tipo: 'fantasma', classe: 'largo' })
      : null,
  ]);

  const caminhos = cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Gestão' }),
    botao('🧼 Serviços', () => contexto.ir('config?secao=servicos'), { tipo: 'secundario', classe: 'largo' }),
    botao('💲 Preços', () => contexto.ir('config?secao=precos'), { tipo: 'secundario', classe: 'largo' }),
    botao('👷 Funcionários', () => contexto.ir('config?secao=equipe'), { tipo: 'secundario', classe: 'largo' }),
    botao('💾 Backup e dados', () => contexto.ir('config?secao=dados'), { tipo: 'secundario', classe: 'largo' }),
  ]);

  const sobre = cartao([
    el('p', { classe: 'observacao', texto: 'Lava-Rápido Lite — os dados ficam neste aparelho, sem servidor e sem nuvem. Funciona sem internet.' }),
    el('p', { classe: 'observacao', texto: `Armazenamento: ${armazenamento.driver.persistente ? 'permanente (IndexedDB)' : 'temporário — os dados somem ao fechar'}` }),
  ]);

  tela.replaceChildren(identidade, caminhos, aparencia, seguranca, sobre);
  return tela;
}

/* ---------------------------------------------------------------- serviços */

async function secaoServicos(contexto, armazenamento) {
  const tela = el('div', { classe: 'tela tela-config' });

  async function desenhar() {
    const servicos = await armazenamento.servicos();

    const editar = (servico) => {
      const campoNome = entrada({ value: servico?.nome ?? '' });
      const corpo = cartao([
        el('h2', { classe: 'secao-titulo', texto: servico ? 'Editar serviço' : 'Novo serviço' }),
        campo('Nome', campoNome),
        botao('SALVAR', async () => {
          if (!campoNome.value.trim()) { avisar('Dê um nome ao serviço', 'atencao'); return; }
          if (!await contexto.autorizar('Alterar serviços')) return;
          await armazenamento.salvarServico({ ...(servico ?? {}), nome: campoNome.value.trim() });
          avisar('Serviço salvo', 'ok');
          desenhar();
        }, { tipo: 'principal', classe: 'largo' }),
        botao('Cancelar', () => desenhar(), { tipo: 'fantasma', classe: 'largo' }),
      ]);
      tela.replaceChildren(corpo);
    };

    tela.replaceChildren(cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Serviços' }),
      el('div', { classe: 'lista' }, servicos.map((s) => el('article', { classe: 'item' }, [
        el('div', { classe: 'item-corpo' }, [
          el('p', { classe: 'item-nome', texto: s.nome }),
          el('p', {
            classe: 'item-detalhe',
            texto: [s.personalizado ? 'valor digitado na hora' : 'preço por tipo de veículo',
              s.ativo === false ? 'desativado' : null].filter(Boolean).join(' · '),
          }),
        ]),
        botao('Editar', () => editar(s), { tipo: 'fantasma' }),
        botao(s.ativo === false ? 'Ativar' : 'Desativar', async () => {
          if (!await contexto.autorizar('Alterar serviços')) return;
          await armazenamento.salvarServico({ ...s, ativo: s.ativo === false });
          desenhar();
        }, { tipo: 'fantasma' }),
        s.personalizado ? null : botao('✕', async () => {
          if (!await contexto.autorizar('Remover serviço')) return;
          if (!await confirmar({
            titulo: 'Remover serviço?',
            texto: `«${s.nome}» sai da lista e perde os preços. As lavagens já registradas continuam como estão.`,
            acao: 'Remover',
            perigo: true,
          })) return;
          await armazenamento.removerServico(s.id);
          avisar('Serviço removido', 'ok');
          desenhar();
        }, { tipo: 'fantasma', classe: 'apagar' }),
      ].filter(Boolean)))),
      botao('+ Novo serviço', () => editar(null), { tipo: 'principal', classe: 'largo' }),
      botao('‹ Voltar', () => contexto.ir('config'), { tipo: 'fantasma', classe: 'largo' }),
    ]));
  }

  await desenhar();
  return tela;
}

/* ------------------------------------------------------------------ preços */

async function secaoPrecos(contexto, armazenamento) {
  const tela = el('div', { classe: 'tela tela-config tela-precos' });

  async function desenhar() {
    const servicos = (await armazenamento.servicos()).filter((s) => !s.personalizado);
    const precos = await armazenamento.precos();
    const valorDe = (tipo, servicoId) => precos.find((p) => p.tipo === tipo && p.servicoId === servicoId)?.valor ?? null;

    const blocos = TIPOS.map((tipo) => cartao([
      el('h3', { classe: 'preco-tipo', texto: `${tipo.icone} ${tipo.nome}` }),
      ...servicos.map((servico) => {
        const atual = valorDe(tipo.id, servico.id);
        const campoValor = entrada({
          type: 'text',
          inputMode: 'decimal',
          classe: 'entrada entrada-preco',
          value: atual === null ? '' : valorParaCampo(atual),
          placeholder: '—',
          onchange: async (evento) => {
            const bruto = evento.target.value.trim();
            const valor = bruto === '' ? null : lerValor(bruto);
            if (bruto !== '' && valor === null) {
              avisar('Valor inválido', 'erro');
              evento.target.value = atual === null ? '' : valorParaCampo(atual);
              return;
            }
            if (!await contexto.autorizar('Alterar preços')) {
              evento.target.value = atual === null ? '' : valorParaCampo(atual);
              return;
            }
            await armazenamento.salvarPreco({ tipo: tipo.id, servicoId: servico.id, valor });
            avisar(valor === null ? `${servico.nome}: sem preço` : `${servico.nome}: ${moeda(valor)}`, 'ok');
            desenhar();
          },
        });
        return el('div', { classe: 'preco-linha' }, [
          el('span', { classe: 'preco-servico', texto: servico.nome }),
          campoValor,
        ]);
      }),
    ]));

    tela.replaceChildren(
      cartao([
        el('h2', { classe: 'secao-titulo', texto: 'Tabela de preços' }),
        el('p', { classe: 'observacao', texto: 'Deixe em branco o que não se vende para aquele veículo — assim o serviço não aparece no atendimento.' }),
      ]),
      ...blocos,
      botao('‹ Voltar', () => contexto.ir('config'), { tipo: 'fantasma', classe: 'largo' }),
    );
  }

  await desenhar();
  return tela;
}

/* ------------------------------------------------------------- funcionários */

async function secaoEquipe(contexto, armazenamento) {
  const tela = el('div', { classe: 'tela tela-config' });

  async function desenhar() {
    const configuracao = await armazenamento.configuracao();
    const equipe = await armazenamento.funcionarios({ incluirInativos: true });
    const campoNome = entrada({ placeholder: 'Nome' });

    tela.replaceChildren(cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Funcionários' }),
      campo('Módulo de funcionários', selecao([
        { valor: 'sim', nome: 'Ligado — perguntar o responsável' },
        { valor: 'nao', nome: 'Desligado' },
      ], configuracao.usarFuncionarios ? 'sim' : 'nao', {
        onchange: async (evento) => {
          await armazenamento.salvarConfiguracao({ usarFuncionarios: evento.target.value === 'sim' });
          avisar('Salvo', 'ok');
          desenhar();
        },
      })),
      el('div', { classe: 'lista' }, equipe.length ? equipe.map((f) => el('article', { classe: 'item' }, [
        el('div', { classe: 'item-corpo' }, [
          el('p', { classe: 'item-nome', texto: f.nome }),
          f.ativo === false ? el('p', { classe: 'item-detalhe', texto: 'inativo' }) : null,
        ]),
        botao(f.ativo === false ? 'Ativar' : 'Desativar', async () => {
          await armazenamento.salvarFuncionario({ ...f, ativo: f.ativo === false });
          desenhar();
        }, { tipo: 'fantasma' }),
        botao('✕', async () => {
          if (!await contexto.autorizar('Remover funcionário')) return;
          if (!await confirmar({
            titulo: 'Remover funcionário?',
            texto: `${f.nome} sai da lista. As lavagens dele continuam no histórico.`,
            acao: 'Remover',
            perigo: true,
          })) return;
          await armazenamento.removerFuncionario(f.id);
          desenhar();
        }, { tipo: 'fantasma', classe: 'apagar' }),
      ].filter(Boolean))) : [vazio('Nenhum funcionário cadastrado')]),
      campo('Novo funcionário', campoNome),
      botao('+ Adicionar', async () => {
        if (!campoNome.value.trim()) { avisar('Digite o nome', 'atencao'); return; }
        await armazenamento.salvarFuncionario({ nome: campoNome.value.trim() });
        avisar('Adicionado', 'ok');
        desenhar();
      }, { tipo: 'principal', classe: 'largo' }),
      botao('‹ Voltar', () => contexto.ir('config'), { tipo: 'fantasma', classe: 'largo' }),
    ]));
  }

  await desenhar();
  return tela;
}

/* ------------------------------------------------------------------- dados */

async function secaoDados(contexto, armazenamento) {
  const tela = el('div', { classe: 'tela tela-config' });

  async function desenhar() {
    const configuracao = await armazenamento.configuracao();

    const seletorDeArquivo = el('input', {
      type: 'file',
      accept: 'application/json,.json',
      classe: 'escondido',
      onchange: async (evento) => {
        const arquivo = evento.target.files?.[0];
        evento.target.value = '';
        if (!arquivo) return;
        try {
          const backup = JSON.parse(await arquivo.text());
          const contagem = Object.values(backup.colecoes ?? {}).reduce((s, c) => s + c.length, 0);
          if (!await confirmar({
            titulo: 'Restaurar backup?',
            texto: `O movimento atual deste aparelho será substituído por ${contagem} registros do arquivo. Não dá para desfazer.`,
            acao: 'Restaurar',
            perigo: true,
          })) return;
          if (!await contexto.autorizar('Restaurar backup')) return;
          await armazenamento.restaurar(backup);
          avisar('Backup restaurado', 'ok');
          contexto.recarregar();
        } catch (erro) {
          avisar(erro.message || 'Arquivo inválido', 'erro');
        }
      },
    });

    const backup = cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Backup' }),
      el('p', { classe: 'observacao', texto: 'Um arquivo JSON com lavagens, veículos, serviços, preços, funcionários, despesas e configurações. Guarde-o fora do aparelho.' }),
      botao('⬇️ Exportar backup', async () => {
        const dados = await armazenamento.exportar();
        baixar(`lavarapido-lite-backup-${diaDe(armazenamento.agora())}.json`,
          new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }));
        avisar('Backup gerado', 'ok');
      }, { tipo: 'principal', classe: 'largo' }),
      botao('⬆️ Restaurar backup', () => seletorDeArquivo.click(), { tipo: 'secundario', classe: 'largo' }),
      seletorDeArquivo,
      el('p', { classe: 'observacao', texto: 'As fotos não entram no backup — elas ocupam muito espaço e não são dado de gestão.' }),
    ]);

    const demonstracao = cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Modo demonstração' }),
      el('p', { classe: 'observacao', texto: 'Cria lavagens fictícias para conhecer o aplicativo. Elas ficam marcadas e podem ser apagadas sem tocar no que é real.' }),
      configuracao.demonstracao
        ? botao('Apagar dados de demonstração', async () => {
          if (!await confirmar({
            titulo: 'Apagar a demonstração?',
            texto: 'Só os registros fictícios são apagados. O que você registrou fica.',
            acao: 'Apagar',
            perigo: true,
          })) return;
          await armazenamento.apagarDemonstracao();
          avisar('Demonstração apagada', 'ok');
          contexto.recarregar();
        }, { tipo: 'perigo', classe: 'largo' })
        : botao('▶️ Carregar demonstração', async () => {
          await armazenamento.instalarDemonstracao();
          avisar('Demonstração carregada', 'ok');
          contexto.recarregar();
        }, { tipo: 'secundario', classe: 'largo' }),
    ]);

    const limpeza = cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Apagar dados' }),
      botao('Apagar movimento (manter preços e ajustes)', async () => {
        if (!await confirmar({
          titulo: 'Apagar todo o movimento?',
          texto: 'Lavagens, veículos, despesas, fotos e fechamentos. Serviços, preços e configurações ficam. Não dá para desfazer — exporte um backup antes.',
          acao: 'Apagar movimento',
          perigo: true,
        })) return;
        if (!await contexto.autorizar('Apagar movimento')) return;
        await armazenamento.apagarMovimento();
        avisar('Movimento apagado', 'ok');
        contexto.recarregar();
      }, { tipo: 'perigo', classe: 'largo' }),
      botao('Apagar tudo e recomeçar', async () => {
        if (!await confirmar({
          titulo: 'Apagar tudo?',
          texto: 'Volta o aplicativo ao estado de fábrica, inclusive preços e PIN. Não dá para desfazer.',
          acao: 'Apagar tudo',
          perigo: true,
        })) return;
        if (!await contexto.autorizar('Apagar tudo')) return;
        await armazenamento.apagarTudo();
        avisar('Tudo apagado', 'ok');
        contexto.recarregar();
      }, { tipo: 'perigo', classe: 'largo' }),
    ]);

    const espaco = cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Neste aparelho' }),
      linhaDeValor('Lavagens', String((await armazenamento.lavagensNoIntervalo({ de: 0, ate: Infinity })).length)),
      linhaDeValor('Veículos', String((await armazenamento.veiculos()).length)),
      linhaDeValor('Despesas', String((await armazenamento.despesas()).length)),
    ]);

    tela.replaceChildren(backup, demonstracao, espaco, limpeza,
      botao('‹ Voltar', () => contexto.ir('config'), { tipo: 'fantasma', classe: 'largo' }));
  }

  await desenhar();
  return tela;
}
