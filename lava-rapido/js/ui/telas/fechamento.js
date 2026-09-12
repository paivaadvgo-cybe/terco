/**
 * Fechamento do dia.
 *
 * O papel que o dono levava para casa, na tela. Um dia por vez, com os números
 * na ordem em que ele confere: quantos carros, quanto rodou, quanto entrou por
 * forma de pagamento, o que foi vendido, o que se gastou, o que sobrou.
 *
 * **Exportar.** Em CSV, que abre no Excel e serve para o contador, e em papel
 * pela impressão do próprio navegador — que em Android e iPhone já gera PDF.
 * Não há biblioteca de PDF embarcada: seriam centenas de quilobytes baixados
 * por todo mundo para um botão que a maioria nunca toca, e a impressão do
 * navegador resolve o mesmo problema com uma folha de estilo.
 *
 * Guardar o fechamento é opcional e não tranca o dia: é uma fotografia do que
 * foi conferido. Lançar algo depois continua permitido, e refazer o fechamento
 * atualiza a fotografia.
 */

import { el, botao, cartao, linhaDeValor } from '../elementos.js';
import { moeda, plural } from '../formatar.js';
import { avisar } from '../avisos.js';
import { dia as diaDe, exibirDia } from '../../dominio/datas.js';
import { fechamentoDoDia } from '../../dominio/caixa.js';
import { FORMAS } from '../../dominio/lavagem.js';
import { nomeDoTipo } from '../../dominio/veiculos.js';
import { fechamentoEmCSV, nomeDoArquivo, baixar } from '../csv.js';

export async function telaFechamento(contexto, parametros = {}) {
  const { armazenamento } = contexto;
  const tela = el('div', { classe: 'tela tela-fechamento' });
  const estado = { dia: parametros.dia ?? diaDe(armazenamento.agora()) };

  async function desenhar() {
    const lavagens = await armazenamento.lavagensDoDia(estado.dia);
    const despesas = (await armazenamento.despesas()).filter((d) => d.dia === estado.dia);
    const resumo = fechamentoDoDia(estado.dia, lavagens, despesas);

    const seletorDeDia = el('input', {
      type: 'date',
      classe: 'entrada entrada-dia',
      value: estado.dia,
      onchange: (evento) => { estado.dia = evento.target.value || estado.dia; desenhar(); },
    });

    const cabecalho = cartao([
      el('p', { classe: 'fechamento-rotulo', texto: 'Fechamento do dia' }),
      el('p', { classe: 'fechamento-data', texto: exibirDia(resumo.dia) }),
      seletorDeDia,
      el('div', { classe: 'fechamento-numeros' }, [
        el('div', { classe: 'fechamento-numero' }, [
          el('span', { classe: 'numero-grande', texto: String(resumo.quantidade) }),
          el('span', { classe: 'numero-rotulo', texto: resumo.quantidade === 1 ? 'lavagem' : 'lavagens' }),
        ]),
        el('div', { classe: 'fechamento-numero' }, [
          el('span', { classe: 'numero-grande', texto: moeda(resumo.faturamento) }),
          el('span', { classe: 'numero-rotulo', texto: 'faturamento' }),
        ]),
        el('div', { classe: 'fechamento-numero' }, [
          el('span', { classe: 'numero-grande', texto: moeda(resumo.ticketMedio) }),
          el('span', { classe: 'numero-rotulo', texto: 'ticket médio' }),
        ]),
      ]),
    ], 'destaque');

    const pagamentos = cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Formas de pagamento' }),
      ...FORMAS.map((f) => linhaDeValor(f.nome, moeda(resumo.porForma[f.id]))),
      linhaDeValor('Pendente', moeda(resumo.pendente), 'pendente'),
      el('hr', { classe: 'separador' }),
      linhaDeValor('Recebido', moeda(resumo.recebido), 'forte'),
    ]);

    const servicos = cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Serviços realizados' }),
      ...(resumo.servicos.length
        ? resumo.servicos.map((s) => linhaDeValor(`${s.quantidade}× ${s.nome}`, moeda(s.valor)))
        : [el('p', { classe: 'observacao', texto: 'Nenhum serviço neste dia.' })]),
    ]);

    const veiculos = cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Veículos' }),
      ...(resumo.tipos.length
        ? resumo.tipos.map((t) => linhaDeValor(nomeDoTipo(t.chave), plural(t.quantidade, 'veículo', 'veículos')))
        : [el('p', { classe: 'observacao', texto: '—' })]),
    ]);

    const equipe = resumo.funcionarios.length
      ? cartao([
        el('h2', { classe: 'secao-titulo', texto: 'Por responsável' }),
        ...resumo.funcionarios.map((f) => linhaDeValor(f.nome, `${plural(f.quantidade, 'lavagem', 'lavagens')} · ${moeda(f.valor)}`)),
      ])
      : null;

    const contas = cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Resultado do dia' }),
      linhaDeValor('Faturamento', moeda(resumo.faturamento)),
      linhaDeValor('Despesas', `- ${moeda(resumo.despesas)}`),
      el('hr', { classe: 'separador' }),
      linhaDeValor('Resultado operacional', moeda(resumo.resultado), resumo.resultado < 0 ? 'negativo forte' : 'forte'),
    ]);

    const exportar = el('div', { classe: 'coluna-botoes sem-impressao' }, [
      botao('⬇️ Exportar CSV', () => {
        baixar(nomeDoArquivo('fechamento', resumo.dia), fechamentoEmCSV(resumo, lavagens, despesas));
        avisar('Arquivo gerado', 'ok');
      }, { tipo: 'secundario', classe: 'largo' }),
      botao('🖨️ Imprimir / PDF', () => window.print(), { tipo: 'secundario', classe: 'largo' }),
      botao('✅ Guardar fechamento', async () => {
        await armazenamento.guardarFechamento(resumo);
        avisar('Fechamento guardado', 'ok');
      }, { tipo: 'principal', classe: 'largo' }),
    ]);

    const guardado = await armazenamento.fechamento(estado.dia);
    tela.replaceChildren(
      cabecalho, pagamentos, servicos, veiculos, equipe, contas, exportar,
      guardado
        ? el('p', { classe: 'observacao', texto: `Fechamento guardado em ${exibirDia(diaDe(guardado.fechadoEm))}.` })
        : null,
    );
  }

  await desenhar();
  return tela;
}

