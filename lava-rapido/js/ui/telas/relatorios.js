/**
 * Relatórios: dia, semana e mês.
 *
 * Três períodos, os mesmos números, sem gráfico. Gráfico em tela de celular
 * ocupa o espaço de seis linhas para dizer o que três números dizem melhor — e
 * a pergunta aqui é sempre a mesma: rodou mais ou menos que antes, e com o quê.
 *
 * A média diária é calculada sobre os **dias com movimento**, não sobre os dias
 * do calendário. Um lava-rápido que fecha domingo teria a média puxada para
 * baixo por um dia em que ninguém trabalhou, e a conta pareceria queda de
 * movimento onde havia descanso.
 */

import { el, botao, cartao, linhaDeValor, vazio } from '../elementos.js';
import { moeda, numero, plural } from '../formatar.js';
import { avisar } from '../avisos.js';
import { intervalo as intervaloDe, diasDoIntervalo } from '../../dominio/datas.js';
import { resumoDoPeriodo } from '../../dominio/caixa.js';
import { FORMAS } from '../../dominio/lavagem.js';
import { lavagensEmCSV, nomeDoArquivo, baixar } from '../csv.js';

const PERIODOS = [
  { id: 'hoje', nome: 'Dia' },
  { id: '7dias', nome: 'Semana' },
  { id: 'mes', nome: 'Mês' },
];

export async function telaRelatorios(contexto) {
  const { armazenamento } = contexto;
  const tela = el('div', { classe: 'tela tela-relatorios' });
  const estado = { periodo: 'hoje' };

  async function desenhar() {
    const periodo = intervaloDe(estado.periodo, armazenamento.agora());
    const lavagens = await armazenamento.lavagensNoIntervalo(periodo);
    const despesas = await armazenamento.despesas(periodo);
    const resumo = resumoDoPeriodo(lavagens, despesas, diasDoIntervalo(periodo));

    const seletor = el('div', { classe: 'filtros' }, PERIODOS.map((p) => el('button', {
      classe: `filtro ${estado.periodo === p.id ? 'ativo' : ''}`.trim(),
      type: 'button',
      texto: p.nome,
      aoTocar: () => { estado.periodo = p.id; desenhar(); },
    })));

    const principais = cartao([
      el('p', { classe: 'caixa-rotulo', texto: periodo.rotulo }),
      el('p', { classe: 'caixa-numero', texto: moeda(resumo.faturamento) }),
      el('p', { classe: 'caixa-detalhe', texto: plural(resumo.quantidade, 'lavagem', 'lavagens') }),
      el('hr', { classe: 'separador' }),
      linhaDeValor('Ticket médio', moeda(resumo.ticketMedio)),
      linhaDeValor('Recebido', moeda(resumo.recebido)),
      linhaDeValor('A receber', moeda(resumo.pendente), resumo.pendente ? 'pendente' : ''),
      estado.periodo === 'hoje' ? null : linhaDeValor(
        'Média por dia',
        `${numero(resumo.mediaDiariaLavagens)} lavagens · ${moeda(resumo.mediaDiariaFaturamento)}`,
      ),
      linhaDeValor('Dias com movimento', String(resumo.diasComMovimento)),
    ], 'destaque');

    const servicos = cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Serviços' }),
      ...(resumo.servicos.length
        ? resumo.servicos.map((s) => linhaDeValor(`${s.quantidade}× ${s.nome}`, moeda(s.valor)))
        : [vazio('Sem lavagens no período')]),
    ]);

    const pagamentos = cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Pagamentos' }),
      ...FORMAS.map((f) => linhaDeValor(f.nome, moeda(resumo.porForma[f.id]))),
      linhaDeValor('Pendente', moeda(resumo.pendente), 'pendente'),
    ]);

    const equipe = resumo.funcionarios.length
      ? cartao([
        el('h2', { classe: 'secao-titulo', texto: 'Por responsável' }),
        ...resumo.funcionarios.map((f) => linhaDeValor(
          f.nome, `${plural(f.quantidade, 'lavagem', 'lavagens')} · ${moeda(f.valor)}`,
        )),
      ])
      : null;

    const contas = cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Resultado operacional' }),
      linhaDeValor('Receita', moeda(resumo.faturamento)),
      linhaDeValor('Despesas', `- ${moeda(resumo.despesas)}`),
      el('hr', { classe: 'separador' }),
      linhaDeValor('Resultado', moeda(resumo.resultado), resumo.resultado < 0 ? 'negativo forte' : 'forte'),
    ]);

    const exportar = botao('⬇️ Exportar lavagens (CSV)', () => {
      if (!lavagens.length) { avisar('Nada para exportar neste período', 'atencao'); return; }
      baixar(nomeDoArquivo('lavagens', periodo.rotulo.toLowerCase().replace(/\s+/g, '-')), lavagensEmCSV(lavagens));
      avisar('Arquivo gerado', 'ok');
    }, { tipo: 'secundario', classe: 'largo' });

    tela.replaceChildren(seletor, principais, servicos, pagamentos, equipe, contas, exportar);
  }

  await desenhar();
  return tela;
}
