/**
 * O painel: o que o carro está fazendo agora.
 *
 * É a tela que fica aberta com o celular preso ao painel, e por isso quase tudo
 * aqui é decidido pela leitura de relance: nada muda de lugar enquanto se
 * dirige, e o toque não move nada — a disposição se edita no editor, parado.
 *
 * **O que aparece vem da disposição salva**, montada no editor: cada item diz o
 * que mostra, de que jeito, onde e em que escala. Esta tela só desenha. É a
 * mesma função de desenho que o editor usa, e é isso que garante que a prévia
 * de lá corresponde ao que se vê aqui.
 *
 * **A tela é montada uma vez e atualizada por dentro.** A sessão avisa várias
 * vezes por segundo; redesenhar a tela a cada aviso destruiria e recriaria
 * dezenas de elementos por segundo, o que no celular aparece como tremor nos
 * números e gasta bateria à toa. Os mostradores guardam o último valor e só
 * tocam no DOM quando o número muda de verdade.
 */

import { el, botao, cartao, vazio, linhaDeValor } from '../elementos.js';
import { criarVisor } from '../medidor.js';
import { posicionarNaGrade } from '../grade.js';
import { escalaDe, alturaDoPainel } from '../../dominio/painel.js';
import { avisar } from '../avisos.js';
import { numero, valorDePid, unidadeDePid } from '../formatar.js';
import { duracao } from '../../dominio/datas.js';
import { diagnostico } from '../../obd/transportes.js';
import { definicaoDe, DERIVADOS, EXTERNOS, CALCULADOS } from '../../obd/pids.js';
import { ESTADOS, MAXIMOS_ACOMPANHADOS } from '../../sessao.js';

/**
 * Um valor escolhido no painel só vira mostrador se este carro puder alimentá-lo.
 *
 * Um mostrador que nunca vai ter número é ruído puro — e pior, faz duvidar do
 * resto da tela. Antes de o inventário chegar (`pids` vazio), mostra-se tudo:
 * naquele instante ainda não se sabe, e esconder seria adivinhar.
 */
function alimentavel(chave, estado) {
  // O GPS não vem do carro: quem o alimenta é o celular, e ele só existe na
  // tela quando o condutor o ligou nos ajustes e o sinal apareceu.
  if (EXTERNOS[chave]) return Boolean(estado.gps?.ativo);

  /*
   * As contas do aplicativo dependem do que as alimenta, e não todas do mesmo.
   *
   * Consumo e média precisam de uma fonte de combustível — o PID de vazão, o
   * fluxo de ar, ou a dedução pelo coletor com a cilindrada informada. Num carro
   * sem nenhuma das três elas nunca teriam número, e somem em vez de ficar em
   * travessão para sempre.
   *
   * Máxima e distância precisam só de velocidade, que todo carro com OBD tem.
   * Tratá-las como consumo as esconderia num carro sem sensor de fluxo de ar —
   * e não há motivo nenhum para isso.
   */
  if (chave === 'MAXIMA' || chave === 'DISTANCIA') {
    return estado.pids.length === 0 || estado.pids.includes('0D') || Boolean(estado.gps?.ativo);
  }
  if (CALCULADOS[chave]) return Boolean(estado.consumo?.origem);

  if (!estado.pids || estado.pids.length === 0) return true;
  const derivado = DERIVADOS[chave];
  if (derivado) return derivado.precisa.every((pid) => estado.pids.includes(pid));
  return estado.pids.includes(chave);
}

/**
 * Um botão do trilho: ícone em cima, nome miúdo embaixo.
 *
 * Só ícone seria adivinhação — «⛶» não diz «quadro de instrumentos» para
 * ninguém que não o conheça. Só texto não caberia em sessenta pixels. Os dois
 * juntos cabem, e o nome deixa de ser necessário depois da segunda vez.
 */
function botaoDoTrilho(icone, rotulo, aoTocar) {
  const nome = el('span', { classe: 'trilho-nome', texto: rotulo });
  const marca = el('span', { classe: 'trilho-icone', texto: icone });
  const no = el('button', {
    classe: 'trilho-botao',
    type: 'button',
    aoTocar,
    atributos: { 'aria-label': rotulo, title: rotulo },
  }, [marca, nome]);
  return { no, nome, marca };
}

export async function telaPainel(contexto) {
  const { sessao } = contexto;
  const configuracao = await contexto.armazenamento.configuracao();

  if (sessao.estado.situacao !== 'conectado' && sessao.estado.situacao !== 'erro') {
    return telaDesconectado(contexto);
  }

  const tela = el('div', { classe: 'tela tela-painel' });

  /*
   * **Esta tela não desliza.** É a regra que manda em tudo o que vem abaixo.
   *
   * Um painel de carro que rola é um painel que se lê errado: o número que se
   * quer conferir de relance está meio centímetro fora da janela, e conferi-lo
   * custa um gesto com a mão que deveria estar no volante. Antes, o painel
   * dividia a tela com um cartão de máximos, um de gravação, um de situação e
   * três parágrafos de dica — e num celular deitado isso é quatro vezes a
   * altura disponível.
   *
   * Então a tela passou a ser exatamente do tamanho da janela, e o que não é
   * instrumento saiu do caminho: os controles viraram um trilho estreito na
   * borda, e o resto foi para uma gaveta que se abre quando se pede. A classe
   * no `body` é o que apaga o título e prende a altura; ela sai junto com a
   * tela, porque as outras telas continuam rolando normalmente.
   */
  document.body.classList.add('painel-fixo');
  contexto.aoSair(() => document.body.classList.remove('painel-fixo'));

  /* ---------------------------------------------------- o painel montado */

  /*
   * O painel é desenhado a partir da disposição salva, e não de uma estrutura
   * fixa no código.
   *
   * Cada item traz o que mostra, de que jeito, onde e em que escala. A mesma
   * função desenha aqui e no editor — é o que garante que a prévia não mente.
   */
  const painel = configuracao.paineis.find((p) => p.id === configuracao.painelAtivo)
    ?? configuracao.paineis[0];

  const itensVisiveis = painel.itens.filter((item) => alimentavel(item.chave, sessao.estado));
  const grade = el('div', { classe: 'grade-do-painel' });
  const visores = new Map();

  for (const item of itensVisiveis) {
    const visor = criarVisor(item, { escala: escalaDe(item) });
    visores.set(item.id, { visor, item });

    const no = el('div', { classe: 'item-do-painel' }, [visor.no]);
    posicionarNaGrade(no, item);
    grade.append(no);
  }

  /*
   * As linhas dividem a altura disponível, e não seguem a largura da coluna.
   *
   * Fora daqui a célula é quadrada, porque um painel que rola tem altura de
   * sobra. Aqui não há sobra nenhuma: a altura é a da janela, e o que se quer é
   * o maior ponteiro que couber nela. Com célula quadrada, o painel ou sobrava
   * faixa vazia embaixo ou vazava para fora da tela.
   */
  grade.style.setProperty('--linhas', String(Math.max(1, alturaDoPainel(itensVisiveis))));

  /* ------------------------------------------------------------- alertas */

  // A luz de anomalia acesa não vai para a gaveta: é a única coisa da tela que
  // pede uma decisão. Em faixa fina, acima dos mostradores, custa quinze pixels.
  const listaDeAlertas = el('div', { classe: 'alertas' });

  /* -------------------------------------------------------------- câmera */

  /**
   * A prévia da câmera ocupa a lateral esquerda, e os instrumentos a direita.
   *
   * Ela já foi um retângulo de 150 pixels no meio de uma pilha de cartões, o
   * que num celular deitado é pequeno demais para conferir o enquadramento e
   * atrapalhado demais para o resto. Em coluna, cada um fica com a metade que
   * lhe cabe: a imagem tem altura inteira para mostrar a estrada, e os
   * mostradores continuam inteiros ao lado, sem nada empurrando nada.
   *
   * A coluna só existe quando há imagem. Sem gravação de vídeo, reservar
   * quarenta por cento da tela para um retângulo preto seria roubar espaço dos
   * ponteiros em troca de nada.
   */
  const previa = el('video', {
    classe: 'previa-de-video',
    muted: true,
    autoplay: true,
    playsInline: true,
  });
  previa.setAttribute('muted', '');
  previa.setAttribute('playsinline', '');

  const estadoDoVideo = el('p', { classe: 'camera-estado', hidden: true });
  const colunaDaCamera = el('div', { classe: 'palco-camera', hidden: true }, [previa, estadoDoVideo]);

  /* --------------------------------------------------------- o trilho */

  /**
   * Gravar vídeo é uma escolha por viagem, não um ajuste escondido.
   *
   * Gasta espaço, bateria e esquenta o aparelho — é uma decisão que se toma de
   * novo a cada viagem, e por isso o interruptor fica no trilho, ao lado do
   * botão de gravar. O que vem dos ajustes é só o estado inicial dele.
   */
  let gravarVideo = Boolean(configuracao.gravarVideo) && sessao.videoDisponivel();

  const gravar = botaoDoTrilho('⏺', 'Gravar', alternarGravacao);
  const video = botaoDoTrilho('🎥', 'Vídeo', () => {
    gravarVideo = !gravarVideo;
    desenharVideoNoTrilho();
  });
  const detalhes = botaoDoTrilho('📋', 'Detalhes', () => abrirGaveta(true));
  const cheio = botaoDoTrilho('⛶', 'Cheio', alternarTelaCheia);
  const editar = botaoDoTrilho('✎', 'Editar', () => contexto.ir('editor'));

  function desenharVideoNoTrilho() {
    const podeVideo = sessao.videoDisponivel();
    video.no.disabled = !podeVideo || sessao.estado.gravando;
    video.no.setAttribute('aria-pressed', String(podeVideo && gravarVideo));
    video.nome.textContent = podeVideo ? 'Vídeo' : 'Sem vídeo';
  }
  desenharVideoNoTrilho();

  const trilho = el('div', { classe: 'trilho' }, [
    gravar.no, video.no, detalhes.no, cheio.no, editar.no,
  ]);

  /* ---------------------------------------------------------- o palco */

  const palco = el('div', { classe: 'palco' }, [
    colunaDaCamera,
    el('div', { classe: 'palco-grade' }, [listaDeAlertas, grade]),
    trilho,
  ]);
  tela.append(palco);

  if (itensVisiveis.length === 0) {
    grade.append(el('p', {
      classe: 'palco-vazio',
      texto: 'Nenhum dos mostradores escolhidos está disponível neste carro. Toque em «Editar».',
    }));
  }

  /* ---------------------------------------------------------- a gaveta */

  /*
   * O que não é instrumento mora aqui.
   *
   * Situação da conexão, máximos e as explicações são coisas que se leem uma
   * vez — paradas, no acostamento ou antes de sair — e não de relance com o
   * carro andando. Na tela, empurravam os ponteiros para fora da janela; numa
   * gaveta, continuam a um toque de distância e não custam altura nenhuma.
   */
  const situacao = el('p', { classe: 'situacao', texto: '' });

  const linhasDeMaximo = new Map();
  const cartaoDeMaximos = cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Máximos' }),
    el('div', { classe: 'detalhe-linhas', id: 'maximos' }),
    el('p', {
      classe: 'campo-dica',
      texto: 'O maior valor que o aplicativo chegou a ler. Entre duas leituras o carro pode ter passado disso — é leitura, não medição homologada.',
    }),
  ]);
  const areaDeMaximos = cartaoDeMaximos.querySelector('#maximos');

  const gaveta = el('aside', { classe: 'gaveta', hidden: true }, [
    el('div', { classe: 'gaveta-topo' }, [
      el('h2', { classe: 'secao-titulo', texto: 'Detalhes' }),
      botao('✕', () => abrirGaveta(false), { tipo: 'fantasma', classe: 'gaveta-fechar', atributos: { 'aria-label': 'Fechar' } }),
    ]),
    cartao([situacao]),
    cartaoDeMaximos,
    cartao([
      el('p', {
        classe: 'campo-dica',
        texto: sessao.videoDisponivel()
          ? 'A gravação guarda uma amostra por segundo no aparelho. Com vídeo, guarda também a imagem da câmera traseira, em trechos de 30 s — cerca de 20 MB por minuto.'
          : 'A gravação guarda uma amostra por segundo no aparelho. Este navegador não grava vídeo.',
      }),
      botao('Personalizar painel', () => contexto.ir('editor'), { tipo: 'fantasma', classe: 'largo' }),
    ]),
  ]);
  const fundoDaGaveta = el('div', { classe: 'gaveta-fundo', hidden: true, aoTocar: () => abrirGaveta(false) });
  tela.append(fundoDaGaveta, gaveta);

  function abrirGaveta(abrir) {
    gaveta.hidden = !abrir;
    fundoDaGaveta.hidden = !abrir;
    detalhes.no.setAttribute('aria-pressed', String(abrir));
  }

  /*
   * O modo quadro de instrumentos.
   *
   * Esconde a barra de abas e o trilho: sobram a câmera e os instrumentos, de
   * ponta a ponta, sobre fundo preto. É o que transforma um aplicativo num
   * quadro de instrumentos — e num celular deitado, preso ao painel do carro, a
   * barra de abas ocupa um sexto da altura útil só para ficar ali sem ser
   * tocada.
   *
   * O `requestFullscreen` é um bônus, não o mecanismo: ele é recusado em
   * situações comuns (sem gesto recente, navegador em modo restrito), e o modo
   * precisa funcionar mesmo assim. Por isso quem esconde a interface é a classe
   * no `body`, e a tela cheia do sistema entra por cima quando aceita.
   */
  function alternarTelaCheia() {
    const entrando = !document.body.classList.contains('quadro-de-instrumentos');
    document.body.classList.toggle('quadro-de-instrumentos', entrando);

    if (entrando) {
      abrirGaveta(false);
      document.documentElement.requestFullscreen?.().catch(() => {});
      avisar('Toque no painel para sair', 'ok', 2600);
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  // Sair é tocar em qualquer lugar do painel: procurar um botãozinho de saída
  // com o carro andando é o oposto do que este modo existe para fazer.
  grade.addEventListener('click', () => {
    if (document.body.classList.contains('quadro-de-instrumentos')) alternarTelaCheia();
  });

  // A tela cheia pode cair por fora (botão «voltar», gesto do sistema): sem
  // ouvir isso, a interface ficaria escondida com a tela cheia já encerrada.
  const aoSairDaTelaCheia = () => {
    if (!document.fullscreenElement) document.body.classList.remove('quadro-de-instrumentos');
  };
  document.addEventListener('fullscreenchange', aoSairDaTelaCheia);
  contexto.aoSair(() => {
    document.removeEventListener('fullscreenchange', aoSairDaTelaCheia);
    document.body.classList.remove('quadro-de-instrumentos');
  });

  /*
   * A segunda fonte de velocidade acompanha o ponteiro que a mostra.
   *
   * Ela não é um item do painel: é um detalhe de um item — a comparação só faz
   * sentido colada à velocidade principal. Achá-lo aqui, uma vez, evita
   * procurá-lo a cada atualização.
   */
  const escolhaDeVelocimetro = configuracao.velocimetro ?? 'obd';
  const principalEhGPS = escolhaDeVelocimetro === 'gps'
    || (escolhaDeVelocimetro === 'ambos' && configuracao.velocimetroPrincipal === 'gps');
  const fontePrincipal = principalEhGPS ? 'GPS' : '0D';
  const fonteSecundaria = escolhaDeVelocimetro === 'ambos' ? (principalEhGPS ? '0D' : 'GPS') : null;

  const visorDaVelocidade = [...visores.values()]
    .find((v) => v.item.chave === fontePrincipal && v.item.tipo === 'ponteiro')?.visor ?? null;

  async function alternarGravacao() {
    try {
      if (sessao.estado.gravando) {
        const encerrada = await sessao.pararGravacao();
        avisar(encerrada?.resumo?.distancia
          ? `Viagem gravada: ${numero(encerrada.resumo.distancia, 1)} km`
          : 'Gravação encerrada');
      } else {
        await sessao.comecarGravacao({ comVideo: gravarVideo });
        // O erro da câmera não impede a viagem, então ele é avisado à parte: a
        // gravação dos dados começou de qualquer jeito, e dizer só «falhou»
        // faria desligar tudo achando que nada foi gravado.
        const falha = sessao.estado.video.erro;
        if (falha) avisar(`Gravando sem vídeo — ${falha}`, 'atencao', 7000);
        else avisar('Gravando. A tela fica acesa enquanto durar.', 'ok', 3200);
      }
    } catch (erro) {
      avisar(`Não foi possível: ${erro.message}`, 'erro');
    }
  }

  /* ---------------------------------------------------------- atualização */

  let comecouEm = null;
  /**
   * O texto da segunda velocidade.
   *
   * Quando é o GPS, ele carrega o estado do sinal junto: sem correção recente,
   * mostrar o último número seria afirmar uma velocidade de meio minuto atrás —
   * e é exatamente em túnel e viaduto, onde o sinal cai, que alguém olharia.
   */
  function textoDaSegundaFonte(estado) {
    if (!fonteSecundaria) return null;
    const valor = estado.valores[fonteSecundaria];

    if (fonteSecundaria === 'GPS') {
      if (estado.gps?.erro) return `GPS indisponível`;
      if (!estado.gps?.confiavel) return 'GPS sem sinal';
      return `GPS ${valorDePid('GPS', valor)} km/h`;
    }
    return Number.isFinite(valor) ? `OBD ${valorDePid('0D', valor)} km/h` : 'OBD —';
  }

  function desenharEstado(estado) {
    // O cronômetro da gravação vive no rótulo do botão: com o painel inteiro
    // configurável, não há mais um cartão fixo onde pô-lo — e o botão é onde se
    // olha para saber se está gravando.
    if (estado.gravando) comecouEm ??= estado.viagem?.inicio ?? Date.now();
    else comecouEm = null;

    for (const { visor, item } of visores.values()) visor.atualizar(estado.valores[item.chave]);
    visorDaVelocidade?.atualizarSecundario(textoDaSegundaFonte(estado));

    gravar.marca.textContent = estado.gravando ? '⏹' : '⏺';
    gravar.nome.textContent = estado.gravando
      ? duracao(Date.now() - (comecouEm ?? Date.now()))
      : 'Gravar';
    gravar.no.classList.toggle('gravando', Boolean(estado.gravando));
    // Trocar a escolha da câmera no meio da gravação não teria efeito até a
    // próxima, e o interruptor mentiria sobre o que está acontecendo.
    desenharVideoNoTrilho();

    desenharVideo(estado);
    desenharMaximos(estado);

    const taxa = estado.leiturasPorSegundo;
    situacao.textContent = estado.situacao === 'conectado'
      ? `${ESTADOS[estado.situacao]} · ${taxa ? `${numero(taxa, 1)} leituras/s` : 'lendo…'}`
      : `${ESTADOS[estado.situacao]}${estado.detalhe ? ` · ${estado.detalhe}` : ''}`;
    situacao.dataset.situacao = estado.situacao;

    listaDeAlertas.replaceChildren(...(estado.alertas ?? []).map((alerta) => el('p', {
      classe: `alerta alerta-${alerta.nivel}`,
      texto: alerta.texto,
    })));
  }

  /**
   * A prévia da câmera e o que está acontecendo com ela.
   *
   * O `srcObject` só é trocado quando o fluxo muda de verdade: reatribuí-lo a
   * cada aviso da sessão — várias vezes por segundo — faria o vídeo reiniciar
   * sem parar, e a prévia ficaria piscando preta.
   */
  let fluxoNaTela = null;
  function desenharVideo(estado) {
    const fluxo = sessao.fluxoDeVideo();
    if (fluxo !== fluxoNaTela) {
      fluxoNaTela = fluxo;
      previa.srcObject = fluxo;
      colunaDaCamera.hidden = !fluxo;
      palco.classList.toggle('com-camera', Boolean(fluxo));
      if (fluxo) previa.play().catch(() => {});
    }

    const gravacao = estado.video ?? {};
    if (gravacao.gravando) {
      const megabytes = gravacao.bytes / 1_048_576;
      estadoDoVideo.hidden = false;
      estadoDoVideo.className = 'camera-estado';
      estadoDoVideo.textContent = `● ${gravacao.trechos} trecho(s) · ${numero(megabytes, 0)} MB`;
    } else if (gravacao.erro && estado.gravando) {
      estadoDoVideo.hidden = false;
      estadoDoVideo.className = 'camera-estado camera-estado-erro';
      estadoDoVideo.textContent = `Sem vídeo: ${gravacao.erro}`;
    } else {
      estadoDoVideo.hidden = true;
    }
  }

  /**
   * Os máximos: o desta conexão e o de sempre, lado a lado.
   *
   * As linhas são criadas uma vez e só o texto muda. Recriar a lista a cada
   * aviso da sessão faria seis elementos nascerem e morrerem várias vezes por
   * segundo, com o carro andando.
   */
  function desenharMaximos(estado) {
    const chaves = MAXIMOS_ACOMPANHADOS.filter((chave) => alimentavel(chave, estado));
    if (chaves.length === 0) {
      cartaoDeMaximos.hidden = true;
      return;
    }
    cartaoDeMaximos.hidden = false;

    for (const chave of chaves) {
      const definicao = definicaoDe(chave);
      if (!definicao) continue;

      let linha = linhasDeMaximo.get(chave);
      if (!linha) {
        linha = linhaDeValor(definicao.nome, '—');
        linhasDeMaximo.set(chave, linha);
        areaDeMaximos.append(linha);
      }

      const daSessao = estado.maximos?.[chave];
      const deSempre = estado.recordes?.[chave];
      const unidade = unidadeDePid(chave);
      const agora = Number.isFinite(daSessao) ? `${valorDePid(chave, daSessao)} ${unidade}` : '—';
      // O recorde só aparece quando é maior: repetir o mesmo número duas vezes
      // não informa nada e só ocupa a linha.
      const recorde = Number.isFinite(deSempre) && (!Number.isFinite(daSessao) || deSempre > daSessao)
        ? ` · recorde ${valorDePid(chave, deSempre)}`
        : '';

      linha.querySelector('.linha-numero').textContent = `${agora}${recorde}`;
    }
  }

  contexto.aoSair(sessao.assinar(desenharEstado));

  // A câmera não pode continuar ligada numa tela que saiu — mas a gravação em
  // andamento é da sessão, não da tela, e essa continua.
  contexto.aoSair(() => { previa.srcObject = null; });

  // O relógio da gravação anda mesmo quando o carro não muda de estado — sem
  // ele o cronômetro congelaria num carro parado em semáforo.
  const relogio = setInterval(() => {
    if (sessao.estado.gravando) desenharEstado(sessao.estado);
  }, 1000);
  contexto.aoSair(() => clearInterval(relogio));

  return tela;
}

/**
 * A tela de quem ainda não conectou.
 *
 * Não é uma tela de erro: é a primeira coisa que a maioria vê. Por isso ela
 * oferece os dois caminhos — conectar e experimentar — e diz de cara o que este
 * navegador consegue fazer, em vez de deixar descobrir tocando.
 */
function telaDesconectado(contexto) {
  const aparelho = diagnostico();
  const tela = el('div', { classe: 'tela' });

  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Nenhum adaptador conectado' }),
    el('p', {
      classe: 'campo-dica',
      texto: 'O painel mostra rotação, velocidade, temperatura e consumo lidos direto da central do carro, pelo conector OBD-II.',
    }),
    aparelho.algumDisponivel
      ? botao('Conectar adaptador', () => contexto.ir('conexao'), { tipo: 'principal', classe: 'largo' })
      : el('p', { classe: 'alerta alerta-atencao', texto: aparelho.ble.motivo ?? 'Este navegador não consegue conectar em adaptadores.' }),
    botao('Ver com carro simulado', () => contexto.ir('conexao?demo=1'), { tipo: 'fantasma', classe: 'largo' }),
  ]));

  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'O que é preciso' }),
    vazio(
      'Um adaptador ELM327 Bluetooth BLE',
      'Os adaptadores Bluetooth comuns (clássico) e os Wi-Fi não funcionam em navegador nenhum. A tela de conexão explica por quê.',
    ),
  ]));

  return tela;
}
