/**
 * Transporte para o adaptador ELM327 **Wi-Fi**, através de uma ponte local.
 *
 * ## O fato que decide tudo
 *
 * O adaptador Wi-Fi cria uma rede própria e fala **TCP puro** — quase sempre
 * `192.168.0.10:35000`. **Navegador nenhum abre soquete TCP.** Não há API, não
 * há bandeira para ligar, não há biblioteca que contorne: é uma decisão de
 * segurança das plataformas, igual no Chrome, no Safari e em todos os outros.
 * Quem promete «OBD Wi-Fi no navegador» sem mais nada está prometendo o que não
 * existe.
 *
 * O que o navegador abre é **WebSocket**. Então o que falta não é código de
 * navegador: é um tradutor rodando fora dele, que atenda WebSocket de um lado e
 * abra o TCP do outro. Esse tradutor é `ferramentas/ponte-wifi.mjs`, e roda no
 * próprio celular, no Termux, sem internet — a rede do dongle não tem nenhuma.
 *
 * ## Por que `ws://` numa página `https` funciona
 *
 * Parece que não deveria: página segura não carrega conteúdo inseguro. Mas a
 * regra de conteúdo misto abre exceção para **origens confiáveis por
 * natureza**, e `127.0.0.1` é uma delas — o tráfego não sai do aparelho, então
 * não há o que interceptar. É o mesmo mecanismo que os programas-ponte de
 * carteiras de criptomoeda e leitores de cartão usam há anos.
 *
 * Verificado em Chromium: página `https`, `ws://127.0.0.1`, aperto de mão
 * aceito e resposta do ELM327 de volta. Não é dedução.
 *
 * ## O endereço é da ponte, não do adaptador
 *
 * Quem digita `192.168.0.10` aqui não conecta, e o erro não explicaria por quê.
 * Por isso o transporte recusa endereço que não seja WebSocket, com o motivo
 * escrito — e quem configura o endereço do adaptador faz isso na ponte, que é
 * quem fala TCP.
 */

/** Onde a ponte atende, se ninguém mudou nada. */
export const PONTE_PADRAO = 'ws://127.0.0.1:8127';

/** Quanto se espera pelo aperto de mão antes de dizer que não há ponte. */
const TEMPO_LIMITE = 6000;

export function suportado() {
  return typeof WebSocket !== 'undefined';
}

/**
 * O endereço serve?
 *
 * Devolve o motivo quando não serve, e `null` quando serve — o texto vai
 * direto para a tela, e é ele que transforma «falhou» em «você digitou o
 * endereço do adaptador onde vai o da ponte».
 */
export function problemaNoEndereco(endereco) {
  const texto = String(endereco ?? '').trim();
  if (!texto) return 'informe o endereço da ponte.';

  let url;
  try {
    url = new URL(texto);
  } catch {
    return 'endereço inválido. O padrão é ws://127.0.0.1:8127.';
  }

  if (url.protocol === 'http:' || url.protocol === 'https:') {
    return 'o endereço da ponte começa com ws://, não com http://.';
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    return 'o endereço da ponte começa com ws://. O padrão é ws://127.0.0.1:8127.';
  }

  /*
   * O engano mais provável, e o mais caro de descobrir sozinho: digitar aqui o
   * endereço do adaptador. Ele fala TCP, não WebSocket — a conexão fica
   * pendurada até estourar o tempo e o erro não diz nada.
   */
  if (url.port === '35000' || /^192\.168\.(0\.10|4\.1)$/.test(url.hostname)) {
    return 'esse é o endereço do adaptador, e ele fala TCP. Aqui vai o da ponte — ws://127.0.0.1:8127 —, '
      + 'e o do adaptador se informa na ponte, com --obd.';
  }

  return null;
}

/**
 * Traduz a recusa do navegador em algo que se possa agir.
 *
 * O WebSocket esconde o motivo de propósito: `onerror` não traz código nem
 * texto, por segurança. O que sobra é o código de fechamento, e ele separa os
 * dois casos que importam — ponte no ar mas recusando (1002/1006 depois de
 * resposta HTTP) e ponte que não está no ar.
 */
function explicarFalha(codigo) {
  if (codigo === 1006 || codigo === undefined) {
    return 'a ponte não respondeu. Ela está rodando no celular? No Termux: node ponte-wifi.mjs, '
      + 'com o celular na rede Wi-Fi do adaptador.';
  }
  return `a ponte recusou a conexão (código ${codigo}). Se o painel foi aberto de outro endereço, `
    + 'acrescente-o na ponte com --origem.';
}

export function criarTransporteWiFi(endereco = PONTE_PADRAO, { tempoLimite = TEMPO_LIMITE } = {}) {
  const problema = problemaNoEndereco(endereco);
  if (problema) throw new Error(problema);

  let soquete = null;
  let receber = () => {};
  let aoCair = () => {};

  const transporte = {
    nome: 'wifi',
    rotulo: 'Adaptador Wi-Fi (pela ponte)',
    simulado: false,
    conectado: false,
    endereco,

    abrir() {
      return new Promise((resolver, rejeitar) => {
        soquete = new WebSocket(endereco);

        /*
         * Sem `binaryType` nem tratamento de `Blob`: a ponte manda texto, que é
         * o que o ELM327 fala. Um quadro binário aqui seria defeito da ponte, e
         * tratá-lo silenciosamente esconderia esse defeito.
         */
        const relogio = setTimeout(() => {
          soquete?.close();
          rejeitar(new Error('a ponte não respondeu a tempo. Confira se ela está de pé e se o endereço está certo.'));
        }, tempoLimite);

        soquete.onopen = () => {
          clearTimeout(relogio);
          transporte.conectado = true;
          resolver();
        };

        soquete.onmessage = (evento) => {
          if (typeof evento.data === 'string') receber(evento.data);
        };

        soquete.onclose = (evento) => {
          clearTimeout(relogio);
          // Antes de abrir, o fechamento é a falha da conexão; depois, é queda.
          if (!transporte.conectado) {
            rejeitar(new Error(explicarFalha(evento.code)));
            return;
          }
          transporte.conectado = false;
          aoCair(new Error('a ponte caiu. O celular saiu da rede do adaptador?'));
        };

        // `onerror` não traz motivo nenhum, por desenho do navegador. Quem
        // explica é o `onclose`, que vem logo depois — e sempre vem.
        soquete.onerror = () => {};
      });
    },

    aoReceber(callback) { receber = callback; },
    aoDesconectar(callback) { aoCair = callback; },

    async enviar(texto) {
      if (!soquete || soquete.readyState !== WebSocket.OPEN) throw new Error('a ponte não está aberta');
      soquete.send(texto);
    },

    async fechar() {
      transporte.conectado = false;
      // Fechar com código normal: assim a ponte fecha o TCP do adaptador em vez
      // de deixá-lo pendurado até o tempo dele estourar — e a próxima conexão
      // não encontra o dongle ocupado.
      try {
        soquete?.close(1000);
      } catch { /* já fechado */ }
      soquete = null;
    },
  };

  return transporte;
}
