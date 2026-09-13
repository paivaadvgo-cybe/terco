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
import { posicionarNaGrade, manterCelulasQuadradas } from '../grade.js';
import { escalaDe, alturaDoPainel } from '../../dominio/painel.js';
import { avisar } from '../avisos.js';
import { numero, valorDePid, unidadeDePid } from '../formatar.js';
import { duracao } from '../../dominio/datas.js';
import { diagnostico } from '../../obd/transportes.js';
import { definicaoDe, DERIVADOS, EXTERNOS, CALCULADOS } from '../../obd/pids.js';
import { ESTADOS, MAXIMOS_ACOMPANHADOS } from '../../sessao.js';

/**
 * O que já aparece nos ponteiros grandes, e por isso não se repete embaixo.
 *
 * `GPS` entra na lista mesmo quando a fonte escolhida é o OBD: mostrá-lo como
 * mostrador miúdo ao lado do ponteiro de velocidade seria a mesma grandeza duas
 * vezes na mesma tela, com números diferentes e sem explicação.
 */
const PRINCIPAIS = ['0C', '0D', 'GPS'];

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

export async function telaPainel(contexto) {
  const { sessao } = contexto;
  const configuracao = await contexto.armazenamento.configuracao();

  if (sessao.estado.situacao !== 'conectado' && sessao.estado.situacao !== 'erro') {
    return telaDesconectado(contexto);
  }

  const tela = el('div', { classe: 'tela' });

  /* ------------------------------------------------------------ situação */

  const situacao = el('p', { classe: 'situacao', texto: '' });
  const listaDeAlertas = el('div', { classe: 'alertas' });

  /* -------------------------------------------------------- o painel montado */

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
  grade.style.setProperty('--linhas', String(Math.max(1, alturaDoPainel(itensVisiveis))));
  tela.append(grade);
  contexto.aoSair(manterCelulasQuadradas(grade));

  /*
   * O modo quadro de instrumentos.
   *
   * Esconde o título, a barra de abas e o resto da tela: sobra o painel, de
   * ponta a ponta, sobre fundo escuro. É o que transforma um aplicativo num
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

  if (itensVisiveis.length === 0) {
    tela.append(cartao([
      vazio('Painel vazio', 'Nenhum dos mostradores escolhidos está disponível neste carro.'),
      botao('Personalizar painel', () => contexto.ir('editor'), { tipo: 'principal', classe: 'largo' }),
    ]));
  }

  /* --------------------------------------------------------- situação */

  tela.append(cartao([situacao, listaDeAlertas]));

  /* ------------------------------------------------------------- máximos */

  /*
   * Os máximos ficam numa seção própria, e não como mais um mostrador.
   *
   * São de outra natureza: o painel mostra o agora, e isto mostra o que já
   * aconteceu. Misturar os dois faria alguém ler «132 km/h» achando que é a
   * velocidade atual — o que, num painel de carro, é exatamente o erro que não
   * se pode cometer.
   */
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
  tela.append(cartaoDeMaximos);

  /* ------------------------------------------------------------- gravação */

  const botaoGravar = botao('Gravar viagem', alternarGravacao, { tipo: 'principal', classe: 'largo' });

  /**
   * A câmera é uma escolha por gravação, não um ajuste escondido.
   *
   * Gravar vídeo gasta espaço, bateria e esquenta o aparelho — é uma decisão
   * que se toma de novo a cada viagem, e por isso o interruptor fica ao lado do
   * botão, e não a três toques de distância nos ajustes. O que vem dos ajustes
   * é só o estado inicial dele.
   */
  const comVideo = el('input', {
    type: 'checkbox',
    classe: 'interruptor-caixa',
    id: 'com-video',
    checked: Boolean(configuracao.gravarVideo) && sessao.videoDisponivel(),
    disabled: !sessao.videoDisponivel(),
  });

  const interruptorDeVideo = el('label', { classe: 'interruptor', htmlFor: 'com-video' }, [
    comVideo,
    el('span', { classe: 'interruptor-nome', texto: '🎥 Gravar vídeo da estrada junto' }),
  ]);

  /** A prévia da câmera. Fica escondida enquanto não há gravação de vídeo. */
  const previa = el('video', {
    classe: 'previa-de-video',
    muted: true,
    autoplay: true,
    playsInline: true,
    hidden: true,
  });
  previa.setAttribute('muted', '');
  previa.setAttribute('playsinline', '');

  const estadoDoVideo = el('p', { classe: 'campo-dica', hidden: true });

  tela.append(cartao([
    botaoGravar,
    interruptorDeVideo,
    previa,
    estadoDoVideo,
    botao('Modo quadro de instrumentos', alternarTelaCheia, { tipo: 'secundario', classe: 'largo' }),
    botao('Personalizar painel', () => contexto.ir('editor'), { tipo: 'fantasma', classe: 'largo' }),
    el('p', {
      classe: 'campo-dica',
      texto: sessao.videoDisponivel()
        ? 'A gravação guarda uma amostra por segundo no aparelho. Com vídeo, guarda também a imagem da câmera traseira, em trechos de 30 s — cerca de 20 MB por minuto.'
        : 'A gravação guarda uma amostra por segundo no aparelho. Este navegador não grava vídeo.',
    }),
  ]));

  async function alternarGravacao() {
    try {
      if (sessao.estado.gravando) {
        const encerrada = await sessao.pararGravacao();
        avisar(encerrada?.resumo?.distancia
          ? `Viagem gravada: ${numero(encerrada.resumo.distancia, 1)} km`
          : 'Gravação encerrada');
      } else {
        await sessao.comecarGravacao({ comVideo: comVideo.checked });
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

    botaoGravar.textContent = estado.gravando
      ? `Parar gravação · ${duracao(Date.now() - (comecouEm ?? Date.now()))}`
      : 'Gravar viagem';
    botaoGravar.className = `botao botao-${estado.gravando ? 'perigo' : 'principal'} largo`;
    // Trocar a escolha da câmera no meio da gravação não teria efeito até a
    // próxima, e o interruptor mentiria sobre o que está acontecendo.
    comVideo.disabled = estado.gravando || !sessao.videoDisponivel();

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
      previa.hidden = !fluxo;
      if (fluxo) previa.play().catch(() => {});
    }

    const video = estado.video ?? {};
    if (video.gravando) {
      const megabytes = video.bytes / 1_048_576;
      estadoDoVideo.hidden = false;
      estadoDoVideo.className = 'campo-dica';
      estadoDoVideo.textContent = `Vídeo: ${video.trechos} trecho(s), ${numero(megabytes, 0)} MB`;
    } else if (video.erro && estado.gravando) {
      estadoDoVideo.hidden = false;
      estadoDoVideo.className = 'alerta alerta-atencao';
      estadoDoVideo.textContent = `Sem vídeo: ${video.erro}`;
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
