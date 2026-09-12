/**
 * A tela inicial: o dia, num relance.
 *
 * É a primeira coisa que abre, e responde de cima para baixo as perguntas que o
 * dono faz ao chegar: quanto rodou hoje, quanto entrou, o que está no pátio,
 * quem está devendo. Nada aqui exige toque para aparecer.
 *
 * O botão «NOVA LAVAGEM» ocupa o lugar que ocupa por medida, não por gosto: é o
 * único botão que será tocado dezenas de vezes por dia, quase sempre com uma
 * mão só e o polegar na metade de baixo da tela.
 */

import { el, botao, cartao, vazio } from '../elementos.js';
import { moeda, plural } from '../formatar.js';
import { cartaoDeLavagem, acaoPrincipal } from '../lavagem-cartao.js';
import { finalizarEReceber } from '../receber.js';
import { exibirDia } from '../../dominio/datas.js';

export async function telaInicio(contexto) {
  const { armazenamento } = contexto;
  const resumo = await armazenamento.resumoDeHoje();
  const fila = await armazenamento.fila();
  const configuracao = await armazenamento.configuracao();

  const numero = (icone, valor, descricao, classe = '') => el('div', { classe: `indicador ${classe}`.trim() }, [
    el('span', { classe: 'indicador-icone', texto: icone }),
    el('span', { classe: 'indicador-valor', texto: valor }),
    el('span', { classe: 'indicador-descricao', texto: descricao }),
  ]);

  const painel = cartao([
    el('div', { classe: 'painel-topo' }, [
      el('p', { classe: 'painel-titulo', texto: configuracao.nome || 'Lava-Rápido Lite' }),
      el('p', { classe: 'painel-dia', texto: `Hoje · ${exibirDia(resumo.dia)}` }),
    ]),
    el('div', { classe: 'indicadores' }, [
      numero('🚗', String(resumo.lavagens), resumo.lavagens === 1 ? 'lavagem' : 'lavagens'),
      numero('💰', moeda(resumo.recebido), 'recebido'),
      numero('🧼', String(resumo.emLavagem), 'em lavagem'),
      numero('⚠️', String(resumo.pendentes), 'pendente', resumo.pendentes ? 'alerta' : ''),
    ]),
  ], 'painel');

  const acoes = el('div', { classe: 'acoes-principais' }, [
    botao('+ NOVA LAVAGEM', () => contexto.ir('nova'), { tipo: 'principal', classe: 'gigante' }),
    botao('⚡ Lavagem rápida', () => contexto.ir('nova?rapido=1'), { tipo: 'secundario', classe: 'largo' }),
  ]);

  const alertaPendentes = resumo.pendentes
    ? botao(
      `⚠️ ${plural(resumo.pendentes, 'pagamento pendente', 'pagamentos pendentes')} · ${moeda(resumo.valorPendente)}`,
      () => contexto.ir('pendentes'),
      { tipo: 'atencao', classe: 'largo alerta-pendentes' },
    )
    : null;

  const secaoFila = fila.length
    ? cartao([
      el('h2', { classe: 'secao-titulo', texto: `No pátio (${fila.length})` }),
      el('div', { classe: 'lista' }, fila.map((lavagem) => cartaoDeLavagem(lavagem, {
        acoes: [acaoPrincipal('FINALIZAR', async () => {
          await finalizarEReceber(armazenamento, lavagem);
          contexto.recarregar();
        })],
      }))),
    ])
    : null;

  const movimento = cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Movimento de hoje' }),
    resumo.movimento.length
      ? el('div', { classe: 'lista' }, resumo.movimento.map((lavagem) => cartaoDeLavagem(lavagem, {
        aoTocar: (l) => contexto.abrirLavagem(l),
      })))
      : vazio('Nenhuma lavagem hoje', 'Toque em NOVA LAVAGEM para começar.'),
  ]);

  return el('div', { classe: 'tela tela-inicio' }, [painel, acoes, alertaPendentes, secaoFila, movimento]);
}
