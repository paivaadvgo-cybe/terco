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
import { viagemEmCSV, viagensEmCSV, baixar } from '../csv.js';
import { distancia, consumo, litros, inteiro, numero, desdeQuando, valorDePid, unidadeDePid } from '../formatar.js';
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

  /**
   * Levar tudo embora de uma vez.
   *
   * Existe por um motivo concreto: trocar o endereço de onde o aplicativo é
   * servido cria um armazenamento novo e vazio — navegador guarda dado por
   * origem. Quem muda de hospedagem, ou só quer um backup antes de limpar o
   * aparelho, precisava abrir viagem por viagem e exportar uma a uma.
   *
   * O botão avisa antes e avisa durante. Ler todas as amostras de todas as
   * viagens pode levar alguns segundos num celular com meses de gravação, e um
   * botão que não responde por cinco segundos é um botão que a pessoa toca de
   * novo — e aí são duas leituras do banco disputando a mesma tela.
   */
  const exportarTudo = botao('Exportar todas as viagens (CSV)', async () => {
    if (exportarTudo.disabled) return;
    exportarTudo.disabled = true;
    const rotulo = exportarTudo.textContent;
    exportarTudo.textContent = 'Lendo as viagens…';

    try {
      const configuracao = await contexto.armazenamento.configuracao();
      const amostrasPorViagem = new Map();

      for (const [ordem, viagem] of viagens.entries()) {
        exportarTudo.textContent = `Lendo ${ordem + 1} de ${viagens.length}…`;
        amostrasPorViagem.set(viagem.id, await contexto.armazenamento.amostrasDa(viagem.id));
      }

      exportarTudo.textContent = 'Montando a planilha…';
      const conteudo = viagensEmCSV(viagens, amostrasPorViagem, {
        combustivel: configuracao.combustivel,
        cilindrada: configuracao.cilindrada,
      });

      const hoje = new Date().toISOString().slice(0, 10);
      baixar(`viagens-${hoje}.csv`, conteudo);
      avisar(`${viagens.length} viagem(ns) exportada(s)`, 'ok');
    } catch (erro) {
      avisar(`Não foi possível exportar: ${erro.message}`, 'erro', 6000);
    } finally {
      exportarTudo.textContent = rotulo;
      exportarTudo.disabled = false;
    }
  }, { tipo: 'secundario', classe: 'largo' });

  tela.append(cartao([
    el('p', {
      classe: 'campo-dica',
      texto: `${ocupacao.viagens} viagem(ns), ${inteiro(ocupacao.amostras)} amostras — cerca de ${numero(ocupacao.bytes / 1_048_576, 1)} MB no aparelho.`,
    }),
    exportarTudo,
    el('p', {
      classe: 'campo-dica',
      texto: 'Um arquivo só: em cima, uma linha por viagem; embaixo, todas as amostras com a coluna «Viagem» '
        + 'identificando cada uma. É o que levar antes de trocar o aparelho ou o endereço do aplicativo — '
        + 'o navegador guarda os dados por endereço, e num endereço novo o histórico não aparece.',
    }),
  ]));

  return tela;
}

/**
 * O vídeo da viagem, com os dados do instante que está na tela.
 *
 * É aqui que a gravação deixa de ser planilha. Ver «4.300 rpm às 14h32» não
 * explica nada; ver a ultrapassagem acontecendo enquanto o número sobe, sim. O
 * vídeo e os dados são duas séries no mesmo relógio, e o que sincroniza as duas
 * é a hora em que cada trecho começou.
 *
 * **A busca da amostra é por aproximação, e tem de ser.** As amostras vêm a
 * cada segundo e o vídeo corre a trinta quadros por segundo; exigir coincidência
 * exata não acharia nada. Pega-se a amostra mais próxima, e se a mais próxima
 * estiver a mais de três segundos — um buraco na gravação — mostra-se travessão
 * em vez do dado de outro momento.
 */
function cartaoDeVideo(trechos, amostras, contexto) {
  const tocador = el('video', { classe: 'tocador', controls: true, playsInline: true });
  tocador.setAttribute('playsinline', '');

  const leitura = el('div', { classe: 'leitura-do-video' });
  const lista = el('div', { classe: 'trechos' });

  let atual = null;
  let endereco = null;

  /** Troca o trecho em cartaz, soltando o endereço temporário do anterior. */
  function tocar(trecho) {
    if (endereco) URL.revokeObjectURL(endereco);
    endereco = URL.createObjectURL(trecho.blob);
    atual = trecho;
    tocador.src = endereco;
    tocador.play().catch(() => { /* o navegador pode exigir um toque; os controles estão ali */ });

    for (const botaoDoTrecho of lista.querySelectorAll('.trecho')) {
      botaoDoTrecho.classList.toggle('tocando', botaoDoTrecho.dataset.id === trecho.id);
    }
    mostrarLeitura(trecho.de);
  }

  function mostrarLeitura(instante) {
    // `distancia` aqui seria a função de formatar quilômetros, importada no
    // topo. O nome é outro de propósito.
    let maisPerto = null;
    let menorDiferenca = Infinity;
    for (const amostra of amostras) {
      const diferenca = Math.abs(amostra.t - instante);
      if (diferenca < menorDiferenca) {
        menorDiferenca = diferenca;
        maisPerto = amostra;
      }
    }

    if (!maisPerto || menorDiferenca > 3000) {
      leitura.replaceChildren(el('span', { classe: 'leitura-vazia', texto: 'sem dados neste instante' }));
      return;
    }

    const mostrar = ['0D', '0C', 'TURBO', '05']
      .filter((pid) => Number.isFinite(maisPerto.v[pid]))
      .map((pid) => el('span', { classe: 'leitura-item' }, [
        el('strong', { texto: `${valorDePid(pid, maisPerto.v[pid])} ${unidadeDePid(pid)}` }),
        el('small', { texto: definicaoDe(pid)?.curto ?? pid }),
      ]));

    leitura.replaceChildren(...(mostrar.length ? mostrar : [
      el('span', { classe: 'leitura-vazia', texto: 'sem dados neste instante' }),
    ]));
  }

  tocador.addEventListener('timeupdate', () => {
    if (atual) mostrarLeitura(atual.de + tocador.currentTime * 1000);
  });

  // Ao terminar um trecho, emenda no seguinte: a viagem foi contínua, e obrigar
  // um toque a cada trinta segundos transformaria a revisão numa maratona.
  tocador.addEventListener('ended', () => {
    const indice = trechos.findIndex((t) => t.id === atual?.id);
    if (indice >= 0 && indice + 1 < trechos.length) tocar(trechos[indice + 1]);
  });

  for (const trecho of trechos) {
    lista.append(el('button', {
      type: 'button',
      classe: 'trecho',
      dados: { id: trecho.id },
      aoTocar: () => tocar(trecho),
    }, [
      el('span', { classe: 'trecho-hora', texto: hora(trecho.de) }),
      el('span', { classe: 'trecho-tamanho', texto: `${numero(trecho.bytes / 1_048_576, 1)} MB` }),
    ]));
  }

  const total = trechos.reduce((soma, t) => soma + (t.bytes ?? 0), 0);

  contexto.aoSair(() => {
    tocador.pause();
    tocador.removeAttribute('src');
    if (endereco) URL.revokeObjectURL(endereco);
  });

  tocar(trechos[0]);

  return cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Vídeo da viagem' }),
    tocador,
    leitura,
    lista,
    el('div', { classe: 'coluna-botoes' }, [
      botao('Baixar o trecho em cartaz', () => {
        if (!atual) return;
        baixar(`viagem-${hora(atual.de).replace(':', 'h')}.${atual.tipo?.includes('mp4') ? 'mp4' : 'webm'}`, atual.blob, atual.tipo);
        avisar('Trecho salvo');
      }, { tipo: 'fantasma', classe: 'largo' }),
    ]),
    el('p', {
      classe: 'campo-dica',
      texto: `${trechos.length} trecho(s), ${numero(total / 1_048_576, 1)} MB no aparelho. Apagar a viagem apaga o vídeo junto.`,
    }),
  ]);
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

  /* --------------------------------------------------------------- vídeo */

  const trechos = await armazenamento.videosDa(viagem.id);
  if (trechos.length > 0) tela.append(cartaoDeVideo(trechos, amostras, contexto));

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
