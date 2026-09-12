/**
 * Caixa.
 *
 * Quanto se vendeu, quanto entrou, e por onde entrou. As duas primeiras
 * perguntas são diferentes — faturamento inclui quem saiu devendo — e ficam
 * separadas na tela pelo mesmo motivo pelo qual ficam separadas no cálculo:
 * juntá-las é como um caixa deixa de fechar.
 *
 * Daqui saem os três caminhos do dinheiro: despesas, fechamento do dia e a
 * lista de pendentes.
 */

import { el, botao, cartao, linhaDeValor } from '../elementos.js';
import { moeda, plural, numero } from '../formatar.js';
import { intervalo as intervaloDe } from '../../dominio/datas.js';
import { caixa as calcularCaixa, resultadoOperacional } from '../../dominio/caixa.js';
import { FORMAS } from '../../dominio/lavagem.js';

const PERIODOS = [
  { id: 'hoje', nome: 'Hoje' },
  { id: 'ontem', nome: 'Ontem' },
  { id: '7dias', nome: '7 dias' },
  { id: 'mes', nome: 'Este mês' },
];

export async function telaCaixa(contexto, parametros = {}) {
  const { armazenamento } = contexto;
  const tela = el('div', { classe: 'tela tela-caixa' });
  const estado = { periodo: parametros.periodo ?? 'hoje' };

  async function desenhar() {
    const periodo = intervaloDe(estado.periodo, armazenamento.agora());
    const lavagens = await armazenamento.lavagensNoIntervalo(periodo);
    const despesas = await armazenamento.despesas(periodo);
    const contas = calcularCaixa(lavagens);
    const resultado = resultadoOperacional(lavagens, despesas);

    const seletor = el('div', { classe: 'filtros' }, PERIODOS.map((p) => el('button', {
      classe: `filtro ${estado.periodo === p.id ? 'ativo' : ''}`.trim(),
      type: 'button',
      texto: p.nome,
      aoTocar: () => { estado.periodo = p.id; desenhar(); },
    })));

    const destaque = cartao([
      el('p', { classe: 'caixa-rotulo', texto: 'Faturamento' }),
      el('p', { classe: 'caixa-numero', texto: moeda(contas.faturamento) }),
      el('p', {
        classe: 'caixa-detalhe',
        texto: `${plural(contas.quantidade, 'lavagem', 'lavagens')} · ticket médio ${moeda(contas.ticketMedio)}`,
      }),
    ], 'destaque');

    const formas = cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Como entrou' }),
      ...FORMAS.map((f) => linhaDeValor(f.nome, moeda(contas.porForma[f.id]))),
      linhaDeValor('Pendente', moeda(contas.pendente), 'pendente'),
      el('hr', { classe: 'separador' }),
      linhaDeValor('Recebido', moeda(contas.recebido), 'forte'),
    ]);

    const operacional = cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Resultado operacional' }),
      linhaDeValor('Receita', moeda(resultado.receita)),
      linhaDeValor('Despesas', `- ${moeda(resultado.despesas)}`),
      el('hr', { classe: 'separador' }),
      linhaDeValor('Resultado', moeda(resultado.resultado), resultado.resultado < 0 ? 'negativo forte' : 'forte'),
      el('p', {
        classe: 'observacao',
        texto: 'Receita menos despesas do período. Não é lucro líquido: não entram pró-labore, impostos nem retiradas.',
      }),
    ]);

    const atalhos = el('div', { classe: 'coluna-botoes' }, [
      botao('💸 Despesas', () => contexto.ir('despesas'), { tipo: 'secundario', classe: 'largo' }),
      botao('📋 Fechamento do dia', () => contexto.ir('fechamento'), { tipo: 'secundario', classe: 'largo' }),
      contas.pendente
        ? botao(`⚠️ Pendentes · ${moeda(contas.pendente)}`, () => contexto.ir('pendentes'), { tipo: 'atencao', classe: 'largo' })
        : null,
    ].filter(Boolean));

    tela.replaceChildren(seletor, destaque, formas, operacional, atalhos);
    if (contas.quantidade === 0) {
      destaque.append(el('p', { classe: 'observacao', texto: `Nenhuma lavagem em ${periodo.rotulo.toLowerCase()}.` }));
    }
    // Média diária só faz sentido em período de mais de um dia.
    if (estado.periodo === '7dias' || estado.periodo === 'mes') {
      const dias = Math.max(1, new Set(lavagens.map((l) => l.dia)).size);
      destaque.append(el('p', {
        classe: 'caixa-detalhe',
        texto: `Média por dia com movimento: ${numero(contas.quantidade / dias)} lavagens · ${moeda(Math.round(contas.faturamento / dias))}`,
      }));
    }
  }

  await desenhar();
  return tela;
}
