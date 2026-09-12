/**
 * Despesas.
 *
 * Quatro campos, e três deles já vêm preenchidos: valor, descrição, categoria e
 * data. Um lava-rápido gasta com produto, água, luz, manutenção e aluguel — e é
 * a soma disso que transforma faturamento em resultado.
 *
 * O formulário fica aberto no topo, sem botão para «adicionar despesa» que
 * abriria outra tela. Lançar precisa custar menos que não lançar; senão não se
 * lança, e o resultado do mês fica bonito e falso.
 */

import { el, botao, cartao, campo, entrada, selecao, vazio, linhaDeValor } from '../elementos.js';
import { moeda, lerValor } from '../formatar.js';
import { avisar, confirmar } from '../avisos.js';
import { CATEGORIAS_DE_DESPESA } from '../../armazenamento/storage.js';
import { intervalo as intervaloDe, exibirDia, dia as diaDe } from '../../dominio/datas.js';
import { totalDeDespesas, despesasPorCategoria } from '../../dominio/caixa.js';

const nomeDaCategoria = (id) => CATEGORIAS_DE_DESPESA.find((c) => c.id === id)?.nome ?? id;

export async function telaDespesas(contexto) {
  const { armazenamento } = contexto;
  const tela = el('div', { classe: 'tela tela-despesas' });
  const estado = { periodo: 'mes' };

  async function desenhar() {
    const periodo = intervaloDe(estado.periodo, armazenamento.agora());
    const despesas = await armazenamento.despesas(periodo);
    const total = totalDeDespesas(despesas);

    const campoDescricao = entrada({ placeholder: 'Shampoo, conta de água…' });
    const campoValor = entrada({ type: 'text', inputMode: 'decimal', placeholder: '0,00' });
    const campoCategoria = selecao(
      CATEGORIAS_DE_DESPESA.map((c) => ({ valor: c.id, nome: c.nome })), 'produto',
    );
    const campoData = entrada({ type: 'date', value: diaDe(armazenamento.agora()) });

    const lancar = async () => {
      const valor = lerValor(campoValor.value);
      if (!valor) { avisar('Informe o valor da despesa', 'atencao'); return; }
      if (!campoDescricao.value.trim()) { avisar('Descreva a despesa', 'atencao'); return; }
      await armazenamento.salvarDespesa({
        descricao: campoDescricao.value,
        valor,
        categoria: campoCategoria.value,
        em: new Date(`${campoData.value}T12:00:00`).getTime(),
        dia: campoData.value,
      });
      avisar('Despesa lançada', 'ok');
      desenhar();
    };

    const formulario = cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Lançar despesa' }),
      campo('Descrição', campoDescricao),
      campo('Valor', campoValor),
      campo('Categoria', campoCategoria),
      campo('Data', campoData),
      botao('LANÇAR', lancar, { tipo: 'principal', classe: 'largo' }),
    ]);

    const porCategoria = despesasPorCategoria(despesas);
    const resumo = cartao([
      el('h2', { classe: 'secao-titulo', texto: `Despesas · ${periodo.rotulo}` }),
      ...porCategoria.map((c) => linhaDeValor(nomeDaCategoria(c.chave), moeda(c.valor))),
      porCategoria.length ? el('hr', { classe: 'separador' }) : null,
      linhaDeValor('Total', moeda(total), 'forte'),
    ]);

    const lista = cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Lançamentos' }),
      despesas.length
        ? el('div', { classe: 'lista' }, despesas.map((d) => el('article', { classe: 'despesa' }, [
          el('div', { classe: 'despesa-corpo' }, [
            el('p', { classe: 'despesa-descricao', texto: d.descricao }),
            el('p', { classe: 'despesa-detalhe', texto: `${nomeDaCategoria(d.categoria)} · ${exibirDia(d.dia)}` }),
          ]),
          el('span', { classe: 'despesa-valor', texto: moeda(d.valor) }),
          botao('✕', async () => {
            if (!await contexto.autorizar('Apagar a despesa')) return;
            if (!await confirmar({
              titulo: 'Apagar despesa?', texto: d.descricao, acao: 'Apagar', perigo: true,
            })) return;
            await armazenamento.removerDespesa(d.id);
            avisar('Despesa apagada', 'ok');
            desenhar();
          }, { tipo: 'fantasma', classe: 'apagar', atributos: { 'aria-label': `Apagar ${d.descricao}` } }),
        ])))
        : vazio('Nenhuma despesa no período'),
    ]);

    const seletor = el('div', { classe: 'filtros' }, [
      { id: 'hoje', nome: 'Hoje' }, { id: '7dias', nome: '7 dias' }, { id: 'mes', nome: 'Este mês' },
    ].map((p) => el('button', {
      classe: `filtro ${estado.periodo === p.id ? 'ativo' : ''}`.trim(),
      type: 'button',
      texto: p.nome,
      aoTocar: () => { estado.periodo = p.id; desenhar(); },
    })));

    tela.replaceChildren(formulario, seletor, resumo, lista);
  }

  await desenhar();
  return tela;
}
