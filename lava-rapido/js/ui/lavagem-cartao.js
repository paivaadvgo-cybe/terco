/**
 * O cartão de uma lavagem.
 *
 * Aparece no movimento do dia, na fila, nos pendentes e no histórico — quatro
 * telas, um desenho só. Repetir o desenho em cada uma delas levaria, em pouco
 * tempo, a quatro jeitos diferentes de mostrar a mesma lavagem, e a quem usa
 * isso parece quatro coisas diferentes.
 *
 * A informação vem na ordem em que o operador procura, olhando de longe: placa
 * primeiro (é assim que ele acha o carro no pátio), depois o que está sendo
 * feito, depois quanto é.
 */

import { el, botao } from './elementos.js';
import { moeda } from './formatar.js';
import { hora, exibirDiaCurto } from '../dominio/datas.js';
import { rotulo, nomeDaForma } from '../dominio/lavagem.js';
import { nomeDoTipo, iconeDoTipo } from '../dominio/veiculos.js';
import { exibir as exibirPlaca } from '../dominio/placa.js';
import { nomeCurto } from '../dominio/servicos.js';

/**
 * @param {object} lavagem
 * @param {{acoes?: HTMLElement[], mostrarDia?: boolean, aoTocar?: Function}} opcoes
 */
export function cartaoDeLavagem(lavagem, { acoes = [], mostrarDia = false, aoTocar = null } = {}) {
  const estado = rotulo(lavagem.estado);
  const descricao = [lavagem.modelo || nomeDoTipo(lavagem.tipo), nomeCurto(lavagem.servicoNome)]
    .filter(Boolean).join(' · ');

  const corpo = el('div', { classe: 'lavagem-corpo' }, [
    el('div', { classe: 'lavagem-linha1' }, [
      el('span', { classe: 'lavagem-placa', texto: exibirPlaca(lavagem.placa) }),
      el('span', { classe: `etiqueta etiqueta-${lavagem.estado}`, texto: `${estado.marca} ${estado.texto}` }),
    ]),
    el('p', { classe: 'lavagem-descricao', texto: `${iconeDoTipo(lavagem.tipo)} ${descricao}` }),
    el('div', { classe: 'lavagem-linha3' }, [
      el('span', { classe: 'lavagem-valor', texto: moeda(lavagem.valor) }),
      el('span', {
        classe: 'lavagem-hora',
        texto: `${mostrarDia ? `${exibirDiaCurto(lavagem.dia)} ` : ''}${hora(lavagem.criadaEm)}`,
      }),
    ]),
    lavagem.pagamento
      ? el('p', { classe: 'lavagem-pagamento', texto: `Recebido em ${nomeDaForma(lavagem.pagamento.forma)}` })
      : null,
    lavagem.funcionarioNome
      ? el('p', { classe: 'lavagem-responsavel', texto: `Responsável: ${lavagem.funcionarioNome}` })
      : null,
  ]);

  const cartao = el('article', {
    classe: `lavagem lavagem-${lavagem.estado}${aoTocar ? ' tocavel' : ''}`,
    dados: { id: lavagem.id },
  }, [
    aoTocar
      ? el('button', { classe: 'lavagem-toque', type: 'button', aoTocar: () => aoTocar(lavagem) }, [corpo])
      : corpo,
    acoes.length ? el('div', { classe: 'lavagem-acoes' }, acoes) : null,
  ]);
  return cartao;
}

/** O botão grande que a fila mostra em cada carro. */
export function acaoPrincipal(texto, aoTocar, tipo = 'principal') {
  return botao(texto, aoTocar, { tipo, classe: 'largo' });
}
