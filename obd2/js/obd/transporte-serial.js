/**
 * Transporte por cabo, via Web Serial.
 *
 * É o caminho mais estável que existe: sem pareamento, sem queda de sinal e com
 * o dobro da taxa de leitura de um clone Bluetooth. A limitação é onde ele
 * existe — **Chrome e Edge no computador e no ChromeOS**. O Chrome do Android
 * não tem Web Serial, então adaptador USB com cabo OTG no celular não conecta
 * por aqui; e o Safari não tem nem isto nem Web Bluetooth.
 *
 * Na prática serve para duas coisas: diagnóstico com o notebook no banco do
 * carona, e desenvolvimento — depurar o painel com o celular preso ao carro é
 * muito pior do que depurá-lo sentado.
 */

/**
 * As velocidades que valem a pena tentar.
 *
 * 38400 é o padrão de fábrica do ELM327 e o que quase todo clone usa. 9600
 * aparece em placas antigas, e 115200 em adaptadores bons já reconfigurados.
 * Errar a velocidade não dá erro: dá caracteres embaralhados, que o aplicativo
 * leria como resposta corrompida — daí a lista ser oferecida na tela em vez de
 * ficar escondida numa constante.
 */
export const VELOCIDADES = [38400, 9600, 115200, 500000];

export function suportado() {
  return typeof navigator !== 'undefined' && Boolean(navigator.serial);
}

export function escolherPorta() {
  if (!suportado()) throw new Error('este navegador não tem Web Serial');
  return navigator.serial.requestPort();
}

export async function portasConhecidas() {
  try {
    return await navigator.serial.getPorts();
  } catch {
    return [];
  }
}

export function criarTransporteSerial(porta, { velocidade = 38400 } = {}) {
  const decodificador = new TextDecoder();
  let leitor = null;
  let escritor = null;
  let receber = () => {};
  let aoCair = () => {};
  let lendo = null;

  /**
   * O laço de leitura.
   *
   * Roda sozinho até a porta fechar. Não acumula nada: a montagem da resposta é
   * trabalho de quem sabe o que é uma resposta, e aqui só chega texto.
   */
  async function ler() {
    try {
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        if (value) receber(decodificador.decode(value, { stream: true }));
      }
    } catch (erro) {
      // Cabo arrancado, adaptador desligado: é queda, não defeito do aplicativo.
      aoCair(erro);
    }
  }

  const transporte = {
    nome: 'serial',
    rotulo: 'Adaptador por cabo (USB)',
    simulado: false,
    conectado: false,
    velocidade,

    async abrir() {
      await porta.open({ baudRate: velocidade });
      leitor = porta.readable.getReader();
      escritor = porta.writable.getWriter();
      lendo = ler();
      transporte.conectado = true;
    },

    aoReceber(callback) { receber = callback; },
    aoDesconectar(callback) { aoCair = callback; },

    async enviar(texto) {
      if (!escritor) throw new Error('porta não está aberta');
      await escritor.write(new TextEncoder().encode(texto));
    },

    async fechar() {
      transporte.conectado = false;
      // Cancelar antes de soltar: fechar a porta com o leitor preso deixa a
      // promessa do laço pendurada para sempre, e a próxima abertura falha
      // dizendo que a porta já está aberta.
      try {
        await leitor?.cancel();
      } catch { /* já cancelado */ }
      try {
        leitor?.releaseLock();
        escritor?.releaseLock();
      } catch { /* já solto */ }
      await lendo?.catch(() => {});
      try {
        await porta.close();
      } catch { /* já fechada */ }
      leitor = null;
      escritor = null;
    },
  };

  return transporte;
}
