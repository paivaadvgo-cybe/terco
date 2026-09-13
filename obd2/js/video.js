/**
 * A câmera: gravar a estrada junto com os dados.
 *
 * O que isto responde é uma pergunta que os números sozinhos não respondem —
 * *o que estava acontecendo ali?*. Um pico de rotação às 14h32 pode ser uma
 * ultrapassagem ou uma marcha errada, e um sobreaquecimento pode ser a subida
 * da serra ou o ventilador que não ligou. Com a imagem no mesmo relógio dos
 * dados, a gravação deixa de ser planilha e vira prova.
 *
 * **Por que em trechos, e não um arquivo só.** O `MediaRecorder` entrega
 * pedaços intermediários que não abrem em lugar nenhum: só o primeiro tem
 * cabeçalho, e sem ele o resto é dado solto. Um arquivo tocável só sai quando o
 * gravador **para**. Então o aplicativo para e recomeça a cada trinta segundos,
 * e cada trecho é um vídeo completo, com a hora em que começou. O preço são uns
 * poucos milissegundos perdidos na emenda entre um trecho e o seguinte — e o
 * que se ganha é que uma gravação interrompida à força (bateria, aplicativo
 * fechado, aba derrubada) perde só o trecho em curso, e não a viagem inteira.
 *
 * **Os limites são do navegador, e são reais:**
 *
 * · Com a tela apagada ou o aplicativo em segundo plano, o Android suspende a
 *   página e a gravação para. A trava de tela da sessão é o que segura isso, e
 *   ela pode ser recusada com a bateria fraca.
 * · Vídeo ocupa espaço de verdade: 720p gasta perto de 20 MB por minuto. O teto
 *   configurado existe para a gravação parar com aviso, em vez de o navegador
 *   cortar no meio quando a cota estourar.
 * · Gravar vídeo e conversar com o adaptador ao mesmo tempo esquenta o aparelho.
 *   Num suporte ao sol, num carro fechado, isso não é detalhe.
 *
 * Nada disso sai do aparelho. Os trechos vão para o IndexedDB, como as amostras.
 */

import { DURACAO_DO_TRECHO } from './armazenamento/esquema.js';

/**
 * Os formatos que se tenta, na ordem.
 *
 * VP8 antes de VP9 de propósito: o VP9 comprime melhor e custa bem mais CPU, e
 * num celular modesto gravando com o painel ativo é a CPU que falta primeiro.
 * O `mp4` entra por último, para navegadores que não tenham webm.
 */
const FORMATOS = [
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp8',
  'video/webm;codecs=vp9',
  'video/webm',
  'video/mp4',
];

export function suportado() {
  return typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== 'undefined';
}

/** O primeiro formato que este navegador aceita gravar. */
export function formatoDisponivel() {
  if (typeof MediaRecorder === 'undefined') return null;
  return FORMATOS.find((formato) => {
    try {
      return MediaRecorder.isTypeSupported(formato);
    } catch {
      return false;
    }
  }) ?? null;
}

/**
 * Por que a câmera não abriu, em português.
 *
 * O `NotAllowedError` do navegador vira «Permission denied» na tela, que não
 * diz a quem pedir nem onde. Cada um destes tem uma saída diferente, e dizer
 * qual é poupa a viagem inteira.
 */
export function explicarFalha(erro) {
  const nome = erro?.name ?? '';
  if (nome === 'NotAllowedError') {
    return 'A permissão da câmera foi negada. Toque no cadeado ao lado do endereço e libere a câmera.';
  }
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') {
    return 'Nenhuma câmera disponível com essa qualidade. Tente 480p nos ajustes.';
  }
  if (nome === 'NotReadableError') {
    return 'A câmera está ocupada por outro aplicativo. Feche o aplicativo de câmera e tente de novo.';
  }
  if (nome === 'SecurityError') {
    return 'A câmera só funciona em endereço https.';
  }
  return erro?.message ?? 'não foi possível abrir a câmera';
}

/**
 * O gravador de vídeo da viagem.
 *
 * `aoTrecho` é chamado com cada trecho pronto — é quem grava no banco decide o
 * que fazer com ele. `aoParar` avisa quando a gravação termina sozinha (espaço
 * no fim, câmera perdida), com o motivo.
 */
export function criarGravadorDeVideo({
  aoTrecho,
  aoParar,
  duracaoDoTrecho = DURACAO_DO_TRECHO,
} = {}) {
  let fluxo = null;
  let gravador = null;
  let pedacos = [];
  let inicioDoTrecho = 0;
  let relogio = null;
  let rodando = false;
  let formato = null;

  /**
   * Fecha o trecho atual e começa outro.
   *
   * O `stop()` é assíncrono: o `dataavailable` final e o `stop` chegam depois.
   * Recomeçar antes disso perderia o último pedaço, então o próximo trecho só
   * nasce dentro do `onstop`.
   */
  function fecharTrecho({ continuar }) {
    if (!gravador || gravador.state === 'inactive') {
      if (continuar) abrirTrecho();
      return;
    }
    gravador.dataSeguinte = continuar;
    gravador.stop();
  }

  function abrirTrecho() {
    if (!rodando || !fluxo) return;

    pedacos = [];
    inicioDoTrecho = Date.now();
    gravador = new MediaRecorder(fluxo, formato ? { mimeType: formato } : undefined);

    gravador.ondataavailable = (evento) => {
      if (evento.data && evento.data.size > 0) pedacos.push(evento.data);
    };

    gravador.onstop = async () => {
      const fim = Date.now();
      const continuar = gravador?.dataSeguinte ?? false;
      const blob = pedacos.length ? new Blob(pedacos, { type: formato ?? 'video/webm' }) : null;
      pedacos = [];

      if (blob && blob.size > 0) {
        try {
          // Quem grava pode mandar parar — por exemplo, ao bater no teto de
          // espaço. Nesse caso o trecho recém-fechado ainda é guardado: ele já
          // foi gravado, e jogá-lo fora seria perder imagem por burocracia.
          const seguir = await aoTrecho?.({ blob, de: inicioDoTrecho, ate: fim, tipo: blob.type });
          if (seguir === false) {
            rodando = false;
            pararTudo();
            aoParar?.('sem espaço');
            return;
          }
        } catch (erro) {
          rodando = false;
          pararTudo();
          aoParar?.(erro.message ?? 'falha ao guardar o trecho');
          return;
        }
      }

      if (continuar && rodando) abrirTrecho();
    };

    gravador.onerror = () => {
      rodando = false;
      pararTudo();
      aoParar?.('o gravador de vídeo falhou');
    };

    gravador.start();
    clearTimeout(relogio);
    relogio = setTimeout(() => fecharTrecho({ continuar: true }), duracaoDoTrecho);
  }

  function pararTudo() {
    clearTimeout(relogio);
    relogio = null;
    for (const trilha of fluxo?.getTracks() ?? []) trilha.stop();
    fluxo = null;
    gravador = null;
  }

  return {
    get gravando() { return rodando; },
    get fluxo() { return fluxo; },
    get formato() { return formato; },

    /**
     * Abre a câmera e começa.
     *
     * A câmera traseira é pedida por `facingMode: 'environment'` — e como
     * *ideal*, não como exigência: num aparelho de uma câmera só, exigir a
     * traseira faz a chamada falhar inteira em vez de usar a que existe.
     */
    async comecar({ altura = 720, audio = false } = {}) {
      if (!suportado()) throw new Error('este navegador não grava vídeo');

      fluxo = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          height: { ideal: altura },
          frameRate: { ideal: 30, max: 30 },
        },
        audio,
      });

      formato = formatoDisponivel();
      rodando = true;
      abrirTrecho();
      return fluxo;
    },

    /** Fecha o trecho em curso, guarda-o, e libera a câmera. */
    async parar() {
      if (!rodando) return;
      rodando = false;
      clearTimeout(relogio);

      await new Promise((pronto) => {
        if (!gravador || gravador.state === 'inactive') {
          pronto();
          return;
        }
        const anterior = gravador.onstop;
        gravador.onstop = async (evento) => {
          await anterior?.call(gravador, evento);
          pronto();
        };
        gravador.dataSeguinte = false;
        gravador.stop();
      });

      pararTudo();
    },
  };
}
