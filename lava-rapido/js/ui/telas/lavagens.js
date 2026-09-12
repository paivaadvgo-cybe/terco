/**
 * Lavagens: o pátio agora, e tudo o que já passou.
 *
 * Duas abas na mesma tela porque são a mesma pergunta em tempos diferentes —
 * «cadê o carro?» e «quando esse carro veio?». Separá-las em dois itens do menu
 * inferior gastaria um quinto da barra para uma tela que se consulta uma vez
 * por dia.
 *
 * A pesquisa é por placa e só por placa. Sem cadastro de cliente, a placa é o
 * nome de todo mundo.
 */

import { el, cartao, entrada, vazio } from '../elementos.js';
import { moeda, plural } from '../formatar.js';
import { cartaoDeLavagem, acaoPrincipal } from '../lavagem-cartao.js';
import { finalizarEReceber } from '../receber.js';
import { normalizar } from '../../dominio/placa.js';
import { intervalo as intervaloDe } from '../../dominio/datas.js';
import { ESTADOS } from '../../dominio/lavagem.js';
import { caixa } from '../../dominio/caixa.js';

const FILTROS = [
  { id: 'hoje', nome: 'Hoje' },
  { id: 'ontem', nome: 'Ontem' },
  { id: '7dias', nome: '7 dias' },
  { id: 'mes', nome: 'Este mês' },
  { id: 'personalizado', nome: 'Período' },
];

export async function telaLavagens(contexto, parametros = {}) {
  const { armazenamento } = contexto;
  const tela = el('div', { classe: 'tela tela-lavagens' });

  const estado = {
    aba: parametros.aba === 'historico' ? 'historico' : 'patio',
    filtro: parametros.filtro ?? 'hoje',
    de: null,
    ate: null,
    busca: '',
  };

  const abas = () => el('div', { classe: 'abas' }, [
    el('button', {
      classe: `aba ${estado.aba === 'patio' ? 'ativa' : ''}`.trim(),
      type: 'button',
      texto: 'No pátio',
      aoTocar: () => { estado.aba = 'patio'; desenhar(); },
    }),
    el('button', {
      classe: `aba ${estado.aba === 'historico' ? 'ativa' : ''}`.trim(),
      type: 'button',
      texto: 'Histórico',
      aoTocar: () => { estado.aba = 'historico'; desenhar(); },
    }),
  ]);

  async function painelDoPatio() {
    const fila = await armazenamento.fila();
    if (!fila.length) {
      return cartao([vazio('O pátio está vazio', 'As lavagens em andamento aparecem aqui.')]);
    }
    return cartao([
      el('h2', { classe: 'secao-titulo', texto: plural(fila.length, 'veículo no pátio', 'veículos no pátio') }),
      el('div', { classe: 'lista' }, fila.map((lavagem) => cartaoDeLavagem(lavagem, {
        aoTocar: (l) => contexto.abrirLavagem(l),
        acoes: [
          lavagem.estado === ESTADOS.AGUARDANDO
            ? acaoPrincipal('INICIAR', async () => { await armazenamento.iniciar(lavagem.id); desenhar(); }, 'secundario')
            : null,
          acaoPrincipal('FINALIZAR', async () => {
            await finalizarEReceber(armazenamento, lavagem);
            desenhar();
          }),
        ].filter(Boolean),
      }))),
    ]);
  }

  async function painelDoHistorico() {
    const periodo = intervaloDe(estado.filtro, armazenamento.agora(), { de: estado.de, ate: estado.ate });
    const todas = await armazenamento.lavagensNoIntervalo(periodo);
    const campoBusca = entrada({
      classe: 'entrada entrada-busca',
      placeholder: '🔎 Placa',
      value: estado.busca,
      autocapitalize: 'characters',
      oninput: (evento) => {
        estado.busca = evento.target.value;
        atualizarLista();
      },
    });

    const listaNo = el('div', { classe: 'lista' });
    const total = el('p', { classe: 'historico-total' });

    const atualizarLista = () => {
      const filtro = normalizar(estado.busca);
      const visiveis = filtro ? todas.filter((l) => (l.placa ?? '').includes(filtro)) : todas;
      const soma = caixa(visiveis);
      total.textContent = `${plural(soma.quantidade, 'lavagem', 'lavagens')} · ${moeda(soma.faturamento)}`;
      listaNo.replaceChildren(...(visiveis.length
        ? visiveis.map((l) => cartaoDeLavagem(l, { mostrarDia: true, aoTocar: (x) => contexto.abrirLavagem(x) }))
        : [vazio('Nada encontrado', filtro ? `Nenhuma lavagem da placa ${filtro} neste período.` : 'Nenhuma lavagem neste período.')]));
    };

    const filtros = el('div', { classe: 'filtros' }, FILTROS.map((f) => el('button', {
      classe: `filtro ${estado.filtro === f.id ? 'ativo' : ''}`.trim(),
      type: 'button',
      texto: f.nome,
      aoTocar: () => { estado.filtro = f.id; desenhar(); },
    })));

    const periodoPersonalizado = estado.filtro === 'personalizado'
      ? el('div', { classe: 'periodo' }, [
        entrada({
          type: 'date', value: estado.de ?? '', classe: 'entrada',
          onchange: (evento) => { estado.de = evento.target.value; desenhar(); },
        }),
        el('span', { texto: 'a' }),
        entrada({
          type: 'date', value: estado.ate ?? '', classe: 'entrada',
          onchange: (evento) => { estado.ate = evento.target.value; desenhar(); },
        }),
      ])
      : null;

    atualizarLista();

    return cartao([
      campoBusca,
      filtros,
      periodoPersonalizado,
      el('p', { classe: 'periodo-rotulo', texto: periodo.rotulo }),
      total,
      listaNo,
    ]);
  }

  async function desenhar() {
    const painel = estado.aba === 'patio' ? await painelDoPatio() : await painelDoHistorico();
    tela.replaceChildren(abas(), painel);
  }

  await desenhar();
  return tela;
}

