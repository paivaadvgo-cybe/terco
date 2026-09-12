/**
 * Pagamentos pendentes.
 *
 * A lista do que foi entregue e não foi pago. Existe porque dívida que não
 * aparece não é cobrada: no papel, o fiado do lava-rápido some no caderno; aqui
 * ele fica na tela inicial, com valor somado, até alguém receber.
 *
 * Cada linha traz o que a cobrança exige — placa, veículo, serviço, valor e
 * data — e um botão só: RECEBER AGORA.
 */

import { el, cartao, vazio } from '../elementos.js';
import { moeda, plural } from '../formatar.js';
import { cartaoDeLavagem, acaoPrincipal } from '../lavagem-cartao.js';
import { finalizarEReceber } from '../receber.js';

export async function telaPendentes(contexto) {
  const { armazenamento } = contexto;
  const tela = el('div', { classe: 'tela tela-pendentes' });

  async function desenhar() {
    const pendentes = await armazenamento.pendentes();
    const total = pendentes.reduce((soma, l) => soma + (Number(l.valor) || 0), 0);

    tela.replaceChildren(cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Pagamentos pendentes' }),
      pendentes.length
        ? el('div', { classe: 'coluna' }, [
          el('p', {
            classe: 'pendentes-total',
            texto: `${plural(pendentes.length, 'pendência', 'pendências')} · ${moeda(total)}`,
          }),
          el('div', { classe: 'lista' }, pendentes.map((lavagem) => cartaoDeLavagem(lavagem, {
            mostrarDia: true,
            aoTocar: (l) => contexto.abrirLavagem(l),
            acoes: [acaoPrincipal('RECEBER AGORA', async () => {
              await finalizarEReceber(armazenamento, lavagem);
              desenhar();
            })],
          }))),
        ])
        : vazio('Nenhum pagamento pendente', 'Tudo que saiu do pátio foi pago.'),
    ]));
  }

  await desenhar();
  return tela;
}
