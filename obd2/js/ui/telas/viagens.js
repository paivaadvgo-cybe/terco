/**
 * Viagens gravadas: a lista e o detalhe.
 *
 * O que uma gravação responde e o painel não: o carro esquentou naquele
 * congestionamento? a rotação subiu sozinha antes de a luz acender? o consumo
 * piorou depois da revisão? São perguntas sobre o tempo, e só se responde com
 * histórico.
 *
 * **A lista lê só os resumos.** O resumo é calculado uma vez, ao encerrar a
 * viagem, e gravado junto dela. Recalcular a partir das amostras a cada abertura
 * seriam duas mil contas por viagem para chegar sempre ao mesmo número — com a
 * tela parada enquanto isso.
 */

import { el, botao, cartao, vazio, selecao, linhaDeValor } from '../elementos.js';
import { avisar, confirmar } from '../avisos.js';
import { criarGrafico } from '../grafico.js';
import { viagemEmCSV, baixar } from '../csv.js';
import { distancia, consumo, litros, inteiro, numero, desdeQuando } from '../formatar.js';
import { exibirDia, hora, duracao } from '../../dominio/datas.js';
import { serieDe } from '../../dominio/viagem.js';
import { definicaoDe } from '../../obd/pids.js';

export async function telaViagens(contexto) {
  const viagens = await contexto.armazenamento.viagens();
  const tela = el('div', { classe: 'tela' });

  if (viagens.length === 0) {
    tela.append(cartao([
      vazio(
        'Nenhuma viagem gravada',
        'Conecte ao carro, abra o painel e toque em «Gravar viagem». Uma amostra por segundo, guardada só no aparelho.',
      ),
      botao('Ir para o painel', () => contexto.ir('painel'), { tipo: 'principal', classe: 'largo' }),
    ]));
    return tela;
  }

  const ocupacao = await contexto.armazenamento.ocupacao();

  tela.append(el('div', { classe: 'lista' }, viagens.map((viagem) => {
    const resumo = viagem.resumo ?? {};
    return el('div', {
      classe: 'item viagem',
      aoTocar: () => contexto.ir(`viagem?id=${encodeURIComponent(viagem.id)}`),
    }, [
      el('div', { classe: 'item-corpo' }, [
        el('span', { classe: 'item-nome', texto: `${exibirDia(viagem.dia)} · ${hora(viagem.inicio)}` }),
        el('span', {
          classe: 'item-detalhe',
          texto: [
            distancia(resumo.distancia),
            duracao(resumo.duracao),
            resumo.consumoMedio ? consumo(resumo.consumoMedio) : null,
          ].filter(Boolean).join(' · '),
        }),
        el('span', { classe: 'item-detalhe suave', texto: desdeQuando(viagem.inicio) }),
      ]),
      el('span', { classe: 'item-seta', texto: '›' }),
    ]);
  })));

  tela.append(cartao([
    el('p', {
      classe: 'campo-dica',
      texto: `${ocupacao.viagens} viagem(ns), ${inteiro(ocupacao.amostras)} amostras — cerca de ${numero(ocupacao.bytes / 1_048_576, 1)} MB no aparelho.`,
    }),
  ]));

  return tela;
}

export async function telaViagem(contexto, parametros = {}) {
  const { armazenamento } = contexto;
  const viagem = await armazenamento.viagem(parametros.id);
  const tela = el('div', { classe: 'tela' });

  if (!viagem) {
    tela.append(cartao([vazio('Viagem não encontrada', 'Ela pode ter sido apagada.')]));
    return tela;
  }

  const amostras = await armazenamento.amostrasDa(viagem.id);
  const resumo = viagem.resumo ?? {};

  /* --------------------------------------------------------------- resumo */

  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: `${exibirDia(viagem.dia)} · ${hora(viagem.inicio)}` }),
    el('div', { classe: 'detalhe-linhas' }, [
      linhaDeValor('Duração', duracao(resumo.duracao)),
      linhaDeValor('Distância', distancia(resumo.distancia)),
      linhaDeValor('Velocidade média', resumo.velocidadeMedia ? `${numero(resumo.velocidadeMedia, 0)} km/h` : '—'),
      linhaDeValor('Velocidade máxima', resumo.velocidadeMaxima ? `${numero(resumo.velocidadeMaxima, 0)} km/h` : '—'),
      linhaDeValor('Rotação máxima', resumo.rotacaoMaxima ? `${inteiro(resumo.rotacaoMaxima)} rpm` : '—'),
      linhaDeValor('Temperatura máxima', resumo.temperaturaMaxima ? `${numero(resumo.temperaturaMaxima, 0)} °C` : '—'),
      linhaDeValor('Parado', duracao(resumo.tempoParado)),
      linhaDeValor('Combustível', resumo.temConsumo ? litros(resumo.litros) : '—'),
      linhaDeValor('Consumo médio', consumo(resumo.consumoMedio)),
    ]),
    resumo.origemDoConsumo && resumo.origemDoConsumo !== 'medido'
      ? el('p', {
        classe: 'campo-dica',
        texto: `O consumo foi calculado pelo ${resumo.origemDoConsumo}, e não medido pelo carro: é uma estimativa, boa em velocidade constante e otimista no trânsito.`,
      })
      : null,
    resumo.buracos > 3000
      ? el('p', {
        classe: 'alerta alerta-atencao',
        texto: `${duracao(resumo.buracos)} sem amostras durante a viagem (tela apagada, aplicativo em segundo plano ou queda do adaptador). Esse tempo não entrou na distância.`,
      })
      : null,
  ]));

  /* -------------------------------------------------------------- gráfico */

  const disponiveis = [...new Set(amostras.flatMap((a) => Object.keys(a.v ?? {})))]
    .filter((pid) => definicaoDe(pid))
    .sort();

  if (disponiveis.length > 0) {
    let escolhido = disponiveis.includes('0D') ? '0D' : disponiveis[0];
    const area = el('div', { classe: 'grafico-area' });

    const escolha = selecao(
      disponiveis.map((pid) => ({ valor: pid, nome: definicaoDe(pid).nome })),
      escolhido,
    );
    escolha.addEventListener('change', () => {
      escolhido = escolha.value;
      area.replaceChildren(criarGrafico(serieDe(amostras, escolhido), escolhido));
    });
    area.append(criarGrafico(serieDe(amostras, escolhido), escolhido));

    tela.append(cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Ao longo da viagem' }),
      escolha,
      area,
    ]));
  }

  /* --------------------------------------------------------------- ações */

  tela.append(cartao([
    botao('Exportar em planilha (CSV)', async () => {
      const configuracao = await armazenamento.configuracao();
      const conteudo = viagemEmCSV(viagem, amostras, {
        combustivel: configuracao.combustivel,
        cilindrada: configuracao.cilindrada,
      });
      baixar(`viagem-${viagem.dia}-${hora(viagem.inicio).replace(':', 'h')}.csv`, conteudo);
      avisar('Planilha gerada');
    }, { tipo: 'secundario', classe: 'largo' }),
    botao('Apagar esta viagem', async () => {
      const confirmado = await confirmar({
        titulo: 'Apagar a viagem?',
        texto: 'As amostras gravadas são perdidas. Não há cópia em nenhum outro lugar.',
        acao: 'Apagar',
        perigo: true,
      });
      if (!confirmado) return;
      await armazenamento.apagarViagem(viagem.id);
      avisar('Viagem apagada');
      contexto.ir('viagens');
    }, { tipo: 'perigo', classe: 'largo' }),
    botao('Voltar', () => contexto.ir('viagens'), { tipo: 'fantasma', classe: 'largo' }),
  ]));

  return tela;
}
