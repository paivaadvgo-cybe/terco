/**
 * Receber o pagamento.
 *
 * É a tela mais importante depois de registrar a lavagem, e a que mais precisa
 * ser rápida: o cliente está com a chave na mão, o carro seguinte está
 * esperando. Uma folha, cinco botões grandes, um toque.
 *
 * «PENDENTE» é um dos cinco, do mesmo tamanho dos outros. Quando não dá para
 * cobrar na hora — o cliente voltou depois, o maquininha não passou, é conhecido
 * — o operador precisa de uma saída de um toque. Se a saída for difícil, a
 * lavagem some do sistema, e o que some do sistema nunca é cobrado.
 */

import { el, botao } from './elementos.js';
import { moeda } from './formatar.js';
import { FORMAS } from '../dominio/lavagem.js';
import { exibir as exibirPlaca } from '../dominio/placa.js';
import { abrirFolha, avisar } from './avisos.js';

/**
 * Abre a folha de recebimento de uma lavagem já finalizada.
 *
 * Resolve com a lavagem atualizada, ou `null` se fecharam sem decidir — caso em
 * que ela continua finalizada e aparece nos pendentes, que é o comportamento
 * certo: lavagem entregue e não paga é dívida, esteja ela marcada ou não.
 */
export function abrirRecebimento(armazenamento, lavagem, { titulo = 'Lavagem concluída' } = {}) {
  return new Promise((resolver) => {
    let resultado = null;

    const registrar = async (forma) => {
      try {
        const atualizada = forma === 'pendente'
          ? await armazenamento.deixarPendente(lavagem.id)
          : await armazenamento.receber(lavagem.id, forma);
        resultado = atualizada;
        folha.fechar();
        if (forma === 'pendente') {
          avisar('Registrado como pendente', 'atencao');
        } else {
          mostrarComprovante(atualizada);
        }
      } catch (erro) {
        avisar(erro.message, 'erro');
      }
    };

    const conteudo = el('div', { classe: 'receber' }, [
      el('p', { classe: 'receber-placa', texto: exibirPlaca(lavagem.placa) }),
      el('p', { classe: 'receber-valor', texto: moeda(lavagem.valor) }),
      el('p', { classe: 'receber-pergunta', texto: 'Receber agora?' }),
      el('div', { classe: 'receber-formas' },
        FORMAS.map((forma) => botao(forma.nome, () => registrar(forma.id), { tipo: 'principal', classe: 'forma' }))),
      botao('Pendente — recebo depois', () => registrar('pendente'), { tipo: 'atencao', classe: 'largo' }),
    ]);

    const folha = abrirFolha(titulo, conteudo, { aoFechar: () => resolver(resultado) });
  });
}

/** O comprovante: o que foi recebido, como, e um botão só. */
export function mostrarComprovante(lavagem) {
  const conteudo = el('div', { classe: 'comprovante' }, [
    el('p', { classe: 'comprovante-marca', texto: '✅' }),
    el('p', { classe: 'comprovante-titulo', texto: 'Pagamento registrado' }),
    el('p', { classe: 'comprovante-valor', texto: moeda(lavagem.pagamento?.valor ?? lavagem.valor) }),
    el('p', {
      classe: 'comprovante-forma',
      texto: FORMAS.find((f) => f.id === lavagem.pagamento?.forma)?.nome ?? '',
    }),
    botao('Concluir', () => folha.fechar(), { tipo: 'principal', classe: 'largo' }),
  ]);
  const folha = abrirFolha('', conteudo);
  return folha;
}

/**
 * O caminho de um toque só: finalizar e já perguntar do dinheiro.
 *
 * Duas coisas acontecem em sequência porque, no pátio, elas são uma só — o
 * carro fica pronto e o cliente paga. Separar em duas telas com dois toques
 * cada uma é o que faz um sistema ser abandonado depois da primeira semana.
 */
export async function finalizarEReceber(armazenamento, lavagem) {
  const pronta = lavagem.estado === 'finalizado' || lavagem.estado === 'pendente'
    ? lavagem
    : await armazenamento.finalizar(lavagem.id);
  return abrirRecebimento(armazenamento, pronta, {
    titulo: lavagem.estado === 'pendente' ? 'Receber pendente' : 'Lavagem concluída',
  });
}
