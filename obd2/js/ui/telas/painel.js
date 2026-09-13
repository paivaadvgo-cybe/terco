/**
 * O painel: o que o carro está fazendo agora.
 *
 * É a tela que fica aberta com o celular preso ao painel, e por isso quase tudo
 * aqui é decidido pela leitura de relance: dois ponteiros grandes no alto —
 * rotação e velocidade, os únicos que se olha andando —, o resto em mostradores
 * abaixo, e nada que mude de lugar enquanto se dirige.
 *
 * **A tela é montada uma vez e atualizada por dentro.** A sessão avisa várias
 * vezes por segundo; redesenhar a tela a cada aviso destruiria e recriaria
 * dezenas de elementos por segundo, o que no celular aparece como tremor nos
 * números e gasta bateria à toa. Os mostradores guardam o último valor e só
 * tocam no DOM quando o número muda de verdade.
 */

import { el, botao, cartao, vazio, linhaDeValor } from '../elementos.js';
import { criarMedidor, criarMostrador, criarCartaoDeValor } from '../medidor.js';
import { avisar } from '../avisos.js';
import { numero, consumo as formatarConsumo, valorDePid, unidadeDePid } from '../formatar.js';
import { duracao } from '../../dominio/datas.js';
import { diagnostico } from '../../obd/transportes.js';
import { definicaoDe, DERIVADOS } from '../../obd/pids.js';
import { ESTADOS, MAXIMOS_ACOMPANHADOS } from '../../sessao.js';

/** Os dois que ganham ponteiro grande. O resto vira mostrador. */
const PRINCIPAIS = ['0C', '0D'];

/**
 * Um valor escolhido no painel só vira mostrador se este carro puder alimentá-lo.
 *
 * Um mostrador que nunca vai ter número é ruído puro — e pior, faz duvidar do
 * resto da tela. Antes de o inventário chegar (`pids` vazio), mostra-se tudo:
 * naquele instante ainda não se sabe, e esconder seria adivinhar.
 */
function alimentavel(chave, estado) {
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

  /* ------------------------------------------------------------ ponteiros */

  const medidores = PRINCIPAIS.map((pid) => criarMedidor(pid));
  tela.append(el('div', { classe: 'medidores' }, medidores.map((m) => m.no)));

  /* -------------------------------------------------------------- consumo */

  const cartaoConsumo = criarCartaoDeValor('Consumo', { unidade: '', dica: '' });
  const cartaoDistancia = criarCartaoDeValor('Gravação', { unidade: '' });

  /* ---------------------------------------------------------- mostradores */

  const escolhidos = (configuracao.painel ?? [])
    .filter((pid) => !PRINCIPAIS.includes(pid))
    .filter((pid) => alimentavel(pid, sessao.estado));
  const mostradores = escolhidos.map((pid) => criarMostrador(pid));

  tela.append(cartao([
    situacao,
    listaDeAlertas,
    el('div', { classe: 'mostradores' }, [
      cartaoConsumo.no,
      cartaoDistancia.no,
      ...mostradores.map((m) => m.no),
    ]),
  ]));

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
  function desenharEstado(estado) {
    for (const medidor of medidores) medidor.atualizar(estado.valores[medidor.no.dataset.pid]);
    for (const mostrador of mostradores) mostrador.atualizar(estado.valores[mostrador.no.dataset.pid]);

    const { litrosPorHora, kmPorLitro, origem, parado } = estado.consumo ?? {};
    const fonte = origem === 'medido' ? 'medido pelo carro' : `estimado pelo ${origem}`;
    if (parado && Number.isFinite(litrosPorHora)) {
      // Parado, km/L seria infinito. Litro por hora é o número que faz sentido
      // com o motor girando e o carro sem andar.
      cartaoConsumo.atualizar(numero(litrosPorHora, 1), 'parado, motor ligado', 'L/h');
    } else if (Number.isFinite(kmPorLitro)) {
      cartaoConsumo.atualizar(formatarConsumo(kmPorLitro).replace(' km/L', ''), fonte, 'km/L');
    } else {
      cartaoConsumo.atualizar('—', origem ? fonte : 'este carro não informa', '');
    }

    if (estado.gravando) {
      comecouEm ??= estado.viagem?.inicio ?? Date.now();
      cartaoDistancia.atualizar(duracao(Date.now() - comecouEm), 'gravando', '');
    } else {
      comecouEm = null;
      cartaoDistancia.atualizar('—', 'não está gravando', '');
    }

    botaoGravar.textContent = estado.gravando ? 'Parar gravação' : 'Gravar viagem';
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
