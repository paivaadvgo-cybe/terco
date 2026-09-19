/**
 * Falhas: o que a luz amarela do painel não diz.
 *
 * A tela tem uma opinião embutida, e ela é deliberada: **apagar a falha não
 * conserta o carro.** O botão existe — é o dono do carro que decide —, mas vem
 * depois da lista, em vermelho, e com o aviso de que apagar zera também os
 * monitores de emissão, deixando o veículo «não pronto» para inspeção até rodar
 * alguns ciclos completos. Muita gente apaga o código, vê a luz sumir e acha que
 * resolveu; três dias depois a luz volta, e o defeito andou esse tempo todo.
 *
 * Por isso as falhas permanentes aparecem com destaque próprio: são as que o
 * serviço de limpeza **não** apaga, e são a prova, na tela, de que apagar não é
 * consertar.
 */

import { el, botao, cartao, vazio } from '../elementos.js';
import { avisar, confirmar } from '../avisos.js';
import { ORIGENS } from '../../obd/dtc.js';

export async function telaFalhas(contexto) {
  const { sessao } = contexto;
  const tela = el('div', { classe: 'tela' });

  if (sessao.estado.situacao !== 'conectado') {
    tela.append(cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Falhas registradas' }),
      vazio('Conecte ao carro para ler as falhas', 'A leitura é feita na central do veículo e não depende de internet.'),
      botao('Ir para a conexão', () => contexto.ir('conexao'), { tipo: 'principal', classe: 'largo' }),
    ]));
    return tela;
  }

  const corpo = el('div', { classe: 'lista' });
  const cabecalho = el('div', { classe: 'detalhe-linhas' });
  const acoes = el('div', { classe: 'coluna-botoes' });

  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Falhas registradas' }),
    cabecalho,
    acoes,
  ]));
  tela.append(corpo);

  let ultimaLeitura = null;

  function desenharCabecalho() {
    const luz = sessao.estado.luz;
    cabecalho.replaceChildren(
      el('p', {
        classe: `alerta alerta-${luz?.luzAcesa ? 'perigo' : 'ok'}`,
        texto: luz
          ? (luz.luzAcesa
            ? `Luz de anomalia acesa · ${luz.falhas} falha(s) na memória`
            : 'Luz de anomalia apagada')
          : 'A central não informou o estado da luz.',
      }),
    );
  }

  function desenharLista(falhas) {
    const grupos = [
      ['confirmada', falhas.confirmadas],
      ['pendente', falhas.pendentes],
      ['permanente', falhas.permanentes],
    ].filter(([, lista]) => lista.length > 0);

    if (grupos.length === 0) {
      corpo.replaceChildren(cartao([
        vazio('Nenhuma falha registrada', 'A central não guarda código de falha neste momento.'),
      ]));
      return;
    }

    corpo.replaceChildren(...grupos.map(([origem, lista]) => cartao([
      el('h3', { classe: 'secao-titulo', texto: `${ORIGENS[origem].nome} (${lista.length})` }),
      el('p', { classe: 'campo-dica', texto: ORIGENS[origem].explicacao }),
      ...lista.map((falha) => el('div', { classe: 'item falha' }, [
        el('div', { classe: 'item-corpo' }, [
          el('span', { classe: 'falha-codigo', texto: falha.codigo }),
          el('span', { classe: 'item-detalhe', texto: falha.texto }),
          el('span', { classe: 'item-detalhe suave', texto: falha.familia }),
        ]),
        falha.certeza === 'desconhecido'
          ? el('span', { classe: 'etiqueta etiqueta-pendente', texto: 'sem descrição' })
          : null,
      ])),
    ])));
  }

  async function ler() {
    acoes.replaceChildren(el('p', { classe: 'campo-dica', texto: 'Lendo a central…' }));
    try {
      ultimaLeitura = await sessao.lerFalhas();
      desenharLista(ultimaLeitura);
      desenharCabecalho();
      avisar('Leitura concluída');
    } catch (erro) {
      avisar(`Não foi possível ler: ${erro.message}`, 'erro', 5000);
    }
    desenharAcoes();
  }

  async function apagar() {
    const confirmado = await confirmar({
      titulo: 'Apagar as falhas da central?',
      texto: 'Isto apaga os códigos e a luz do painel, mas não conserta nada: se o defeito continuar, a luz volta. '
        + 'Apagar também zera os monitores de emissão — o carro fica «não pronto» e pode reprovar na inspeção até rodar alguns ciclos.',
      acao: 'Apagar assim mesmo',
      perigo: true,
    });
    if (!confirmado) return;

    try {
      await sessao.apagarFalhas();
      avisar('Falhas apagadas na central');
      await ler();
    } catch (erro) {
      avisar(`A central recusou: ${erro.message}`, 'erro', 5000);
    }
  }

  function desenharAcoes() {
    /*
     * O `filter` não é enfeite: `replaceChildren` é método nativo, e um `null`
     * entregue a ele **vira a palavra «null» escrita na tela**. O ajudante
     * `el()` do projeto descarta filhos nulos, e a semelhança entre os dois
     * esconde a diferença — antes de ler as falhas, a segunda posição é nula, e
     * a tela dizia «null» embaixo do botão.
     */
    acoes.replaceChildren(...[
      botao(ultimaLeitura ? 'Ler de novo' : 'Ler falhas', ler, { tipo: 'principal', classe: 'largo' }),
      ultimaLeitura ? botao('Apagar falhas e a luz', apagar, { tipo: 'perigo', classe: 'largo' }) : null,
    ].filter(Boolean));
  }

  desenharCabecalho();
  desenharAcoes();
  corpo.replaceChildren(cartao([
    vazio('Ainda não lido', 'A leitura leva alguns segundos e interrompe o painel pelo tempo da consulta.'),
  ]));

  // Ler já ao abrir seria o gesto óbvio — e é justamente por isso que não se
  // faz: a consulta de falhas ocupa a fila de comandos por vários segundos, e
  // quem só passou pela aba veria o painel travar sem ter pedido nada.
  return tela;
}
