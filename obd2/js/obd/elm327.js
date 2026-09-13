/**
 * A conversa com o adaptador ELM327.
 *
 * Este arquivo é o único que sabe a ordem das coisas: quem abre, o que se
 * pergunta primeiro, quanto tempo se espera e o que fazer quando não vem nada.
 * Abaixo dele fica o transporte (Bluetooth, USB ou simulação), que só sabe
 * levar e trazer texto; acima, o aplicativo, que só sabe pedir valores.
 *
 * **Uma pergunta por vez, sempre.** O ELM327 tem um buffer de comando só. Duas
 * perguntas enviadas juntas não voltam duas respostas: voltam uma resposta e
 * um `?`, ou pior, a resposta da segunda com o rótulo da primeira. Por isso
 * tudo passa por uma fila, mesmo quando o painel quer seis valores ao mesmo
 * tempo. A fila também é o que permite cancelar o resto quando o carro desliga
 * no meio de uma volta.
 *
 * **O fim da resposta é o `>`, e só ele.** Não se conta linhas nem se espera um
 * tempo fixo: o adaptador pode responder em um quadro ou em nove, e por
 * Bluetooth cada quadro chega picado em pedaços de vinte bytes. Espera-se o
 * convite; o que chegar antes é resposta, o que chegar depois é da próxima.
 */

import {
  PROMPT, interpretar, dadosDoServico, comandoDePid, bytesDaLinha,
} from './protocolo.js';
import { decodificar, lerInventario, PIDS_DE_INVENTARIO, lerStatusDaLuz } from './pids.js';
import { codigosDeDados, detalhar } from './dtc.js';

/**
 * Tempos limite, em milissegundos.
 *
 * O da abertura é largo porque a primeira consulta do serviço 01 dispara a
 * busca de protocolo: o adaptador testa CAN 11 bits, CAN 29 bits, ISO, KWP e
 * PWM, um por um, e num carro antigo isso passa de dez segundos. Cortar ali
 * seria concluir «não deu» exatamente no carro onde a busca é necessária.
 */
export const TEMPOS = {
  comando: 4000,
  reinicio: 9000,
  descoberta: 15000,
  falhas: 9000,
  apagar: 9000,
};

/** Quantas trocas ficam guardadas para a tela de diagnóstico. */
const TAMANHO_DO_REGISTRO = 120;

/**
 * A sequência de abertura.
 *
 * A ordem importa. `ATE0` vem logo depois do reinício porque enquanto o eco
 * está ligado metade do que chega é o que se acabou de mandar. `ATSP0` vem por
 * último entre os ajustes porque muda o estado da linha, e só então se pergunta
 * algo ao carro.
 */
const ABERTURA = [
  { comando: 'ATZ', tempo: TEMPOS.reinicio, descricao: 'reiniciando o adaptador' },
  { comando: 'ATE0', descricao: 'desligando o eco' },
  { comando: 'ATL0', descricao: 'desligando a quebra de linha extra' },
  { comando: 'ATS0', descricao: 'desligando os espaços' },
  { comando: 'ATH0', descricao: 'escondendo os cabeçalhos' },
  // Tempo adaptativo: o adaptador aprende quanto o carro demora e para de
  // esperar o limite inteiro em toda consulta. É o ajuste que mais muda a
  // fluidez do painel.
  { comando: 'ATAT1', descricao: 'ligando o tempo adaptativo', opcional: true },
  { comando: 'ATSP0', descricao: 'deixando o protocolo em automático' },
];

const NOMES_DE_PROTOCOLO = {
  0: 'automático',
  1: 'SAE J1850 PWM',
  2: 'SAE J1850 VPW',
  3: 'ISO 9141-2',
  4: 'ISO 14230-4 KWP (5 baud)',
  5: 'ISO 14230-4 KWP (rápido)',
  6: 'ISO 15765-4 CAN (11 bits, 500 kbps)',
  7: 'ISO 15765-4 CAN (29 bits, 500 kbps)',
  8: 'ISO 15765-4 CAN (11 bits, 250 kbps)',
  9: 'ISO 15765-4 CAN (29 bits, 250 kbps)',
  10: 'SAE J1939 CAN',
};

export class ErroDoAdaptador extends Error {
  constructor(mensagem, { grave = false, comando = '' } = {}) {
    super(mensagem);
    this.name = 'ErroDoAdaptador';
    this.grave = grave;
    this.comando = comando;
  }
}

export function criarELM327(transporte, { aoRegistrar } = {}) {
  let buffer = '';
  let pendente = null;
  let fila = Promise.resolve();
  let fechado = false;
  const registro = [];

  /**
   * O truque do dígito no fim (`010C1`).
   *
   * Diz ao adaptador para devolver assim que a primeira central responder, em
   * vez de esperar o tempo limite à toa — dobra a taxa do painel. Clones
   * antigos não conhecem e respondem `?`. Descobre-se na primeira consulta e
   * não se pergunta de novo.
   */
  let aceitaContagem = true;

  const anotar = (direcao, texto) => {
    const entrada = { direcao, texto: String(texto).trim(), quando: Date.now() };
    registro.push(entrada);
    if (registro.length > TAMANHO_DO_REGISTRO) registro.shift();
    aoRegistrar?.(entrada);
  };

  /**
   * Cada pedaço que chega do transporte.
   *
   * Por Bluetooth isto é chamado a cada vinte bytes, e a resposta de um VIN
   * chega em oito chamadas. Só o `>` encerra.
   */
  function receber(pedaco) {
    buffer += pedaco;
    if (!pendente) return;
    if (buffer.includes(PROMPT)) {
      const resposta = buffer.slice(0, buffer.indexOf(PROMPT));
      // O que vier depois do convite pertence à próxima resposta — jogar fora
      // o buffer inteiro perderia o começo dela.
      buffer = buffer.slice(buffer.indexOf(PROMPT) + 1);
      const aguardando = pendente;
      pendente = null;
      clearTimeout(aguardando.relogio);
      anotar('entrada', resposta);
      aguardando.resolver(resposta);
    }
  }

  /** Manda um comando e espera o convite. Uma de cada vez, pela fila. */
  function enviar(comando, tempoLimite = TEMPOS.comando) {
    const meuTurno = fila.then(() => executar(comando, tempoLimite));
    // A fila não pode parar por causa de uma falha: o próximo comando talvez
    // funcione, e um painel que morre na primeira consulta sem resposta é
    // inútil num carro que está andando.
    fila = meuTurno.catch(() => {});
    return meuTurno;
  }

  function executar(comando, tempoLimite) {
    if (fechado) return Promise.reject(new ErroDoAdaptador('adaptador desconectado', { grave: true, comando }));

    return new Promise((resolver, recusar) => {
      // Sobras da resposta anterior (um `NO DATA` atrasado, o eco de um
      // comando que expirou) apareceriam como resposta desta pergunta.
      buffer = '';

      const relogio = setTimeout(() => {
        pendente = null;
        recusar(new ErroDoAdaptador(`sem resposta a ${comando}`, { comando }));
      }, tempoLimite);

      pendente = { resolver, recusar, relogio, comando };
      anotar('saida', comando);

      // O `\r` é obrigatório: sem ele o adaptador fica esperando o resto da
      // linha para sempre, e a falha aparece como «sem resposta».
      Promise.resolve(transporte.enviar(`${comando}\r`)).catch((erro) => {
        clearTimeout(relogio);
        pendente = null;
        recusar(new ErroDoAdaptador(erro.message ?? 'falha ao enviar', { grave: true, comando }));
      });
    });
  }

  /** Manda e já entende: devolve `{ ok, aviso, linhas }`. */
  async function comandar(comando, tempoLimite) {
    const texto = await enviar(comando, tempoLimite);
    return interpretar(texto, comando);
  }

  /** Manda um comando `AT` e diz se o adaptador aceitou. */
  async function ajustar(comando, tempoLimite) {
    const resposta = await comandar(comando, tempoLimite);
    return /OK|ELM327|[0-9]/i.test(resposta.texto);
  }

  const adaptador = {
    transporte,
    registro,

    get conectado() {
      return !fechado && transporte.conectado !== false;
    },

    enviar,
    comandar,

    /**
     * Abre a conversa e descobre com quem se está falando.
     *
     * Um ajuste que falha não aborta a abertura: `ATAT1` não existe em clones
     * antigos, e desistir por causa dele deixaria de fora adaptadores que
     * funcionam perfeitamente para tudo o mais.
     */
    async iniciar({ aoProgredir } = {}) {
      await transporte.abrir?.();
      transporte.aoReceber(receber);

      let versao = 'desconhecida';
      for (const passo of ABERTURA) {
        aoProgredir?.(passo.descricao);
        try {
          const resposta = await comandar(passo.comando, passo.tempo ?? TEMPOS.comando);
          const identificacao = /ELM327\s*V?([0-9.]+)/i.exec(resposta.texto);
          if (identificacao) versao = identificacao[1];
        } catch (erro) {
          if (!passo.opcional) throw erro;
        }
      }

      // A primeira consulta ao carro é o que dispara a busca de protocolo.
      aoProgredir?.('procurando a central do carro');
      const primeira = await comandar('0100', TEMPOS.descoberta);
      if (!primeira.ok) {
        throw new ErroDoAdaptador(
          primeira.aviso?.texto ?? 'o carro não respondeu à primeira consulta',
          { grave: true, comando: '0100' },
        );
      }

      return { versao, protocolo: await adaptador.protocolo() };
    },

    /** Qual protocolo o adaptador acabou usando. Só para mostrar na tela. */
    async protocolo() {
      try {
        const resposta = await comandar('ATDPN');
        // A resposta vem como `A6` (automático, protocolo 6) ou `6`.
        const numero = parseInt(resposta.texto.replace(/[^0-9A-F]/gi, '').slice(-1), 16);
        return {
          numero,
          nome: NOMES_DE_PROTOCOLO[numero] ?? 'desconhecido',
          automatico: /A/i.test(resposta.texto),
        };
      } catch {
        return { numero: null, nome: 'desconhecido', automatico: false };
      }
    },

    /**
     * Os bytes crus de um PID do serviço 01, sem interpretar.
     *
     * Existe separado porque nem todo PID é um número para o painel: o 01 é um
     * mapa de bits com a lâmpada e a contagem de falhas, e passá-lo pela tabela
     * de conversão devolveria `null` — o aplicativo concluiria que o carro não
     * respondeu quando ele respondeu perfeitamente.
     */
    async consultarBruto(pid) {
      const resposta = await comandar(comandoDePid(1, pid, aceitaContagem ? 1 : 0));

      // O clone não conhece o dígito de contagem. Descobre-se uma vez.
      if (!resposta.ok && resposta.aviso?.codigo === '?' && aceitaContagem) {
        aceitaContagem = false;
        return adaptador.consultarBruto(pid);
      }
      if (!resposta.ok) {
        if (resposta.aviso?.grave) {
          throw new ErroDoAdaptador(resposta.aviso.texto, { grave: true, comando: `01${pid}` });
        }
        return null;
      }
      return dadosDoServico(resposta.linhas, 0x01, pid);
    },

    /**
     * Pergunta um PID do serviço 01.
     *
     * Devolve `{ valor, bytes }`, ou `null` quando o carro não respondeu — que
     * é situação normal, não erro: carro nenhum tem todos os PIDs.
     */
    async consultar(pid) {
      const bytes = await adaptador.consultarBruto(pid);
      if (!bytes) return null;
      const valor = decodificar(pid, bytes);
      return valor === null ? null : { valor, bytes };
    },

    /**
     * Quais PIDs este carro tem.
     *
     * Pergunta bloco a bloco e só continua enquanto o bloco anterior anuncia o
     * próximo. Sem isso, o painel perguntaria a temperatura do óleo a cada
     * volta para um carro que não a mede, gastando um quarto das consultas em
     * `NO DATA`.
     */
    async inventario() {
      const suportados = [];
      for (const base of PIDS_DE_INVENTARIO) {
        let resposta;
        try {
          resposta = await comandar(comandoDePid(1, base, aceitaContagem ? 1 : 0));
        } catch {
          break;
        }
        if (!resposta.ok) break;
        const bytes = dadosDoServico(resposta.linhas, 0x01, base);
        if (!bytes) break;
        const bloco = lerInventario(base, bytes);
        suportados.push(...bloco.suportados);
        if (!bloco.temProximoBloco) break;
      }
      return suportados;
    },

    /** A luz do painel e quantas falhas a central guarda. */
    async statusDaLuz() {
      const bytes = await adaptador.consultarBruto('01').catch(() => null);
      return bytes ? lerStatusDaLuz(bytes) : null;
    },

    /**
     * As falhas guardadas, nas três origens.
     *
     * Serviço 03 são as confirmadas — as que acendem a luz. 07 são as pendentes,
     * vistas uma vez e ainda não confirmadas. 0A são as permanentes, que o
     * aplicativo não consegue apagar de propósito: só a própria central as tira,
     * depois de verificar que o defeito acabou. Muita gente apaga o código, vê a
     * luz sumir e acha que resolveu; mostrar as permanentes ao lado é o que
     * evita esse engano.
     */
    async falhas() {
      const ler = async (servico, origem) => {
        try {
          const resposta = await comandar(comandoDePid(servico, null, 0), TEMPOS.falhas);
          if (!resposta.ok) return [];
          const dados = dadosDoServico(resposta.linhas, servico);
          return dados ? codigosDeDados(dados).map((codigo) => detalhar(codigo, origem)) : [];
        } catch {
          return [];
        }
      };

      const [confirmadas, pendentes, permanentes] = await Promise.all([
        ler(0x03, 'confirmada'),
        ler(0x07, 'pendente'),
        ler(0x0a, 'permanente'),
      ]);
      return { confirmadas, pendentes, permanentes, luz: await adaptador.statusDaLuz() };
    },

    /**
     * Apaga as falhas e a luz.
     *
     * O serviço 04 não conserta nada: zera a memória da central, e com ela os
     * monitores de emissão — o carro fica «não pronto» e reprova em inspeção
     * até rodar alguns ciclos. A tela avisa; aqui só se manda.
     */
    async apagarFalhas() {
      const resposta = await comandar('04', TEMPOS.apagar);
      if (!resposta.ok) {
        throw new ErroDoAdaptador(resposta.aviso?.texto ?? 'a central recusou o pedido', { comando: '04' });
      }
      return true;
    },

    /**
     * O chassi (VIN), pelo serviço 09.
     *
     * Não cabe num quadro só, então a resposta chega em pedaços numerados que
     * o protocolo remonta. O primeiro byte é a contagem de itens, não faz parte
     * do número — incluí-lo transforma o chassi num texto com um caractere de
     * controle no começo, que só aparece como espaço em branco na tela.
     */
    async vin() {
      try {
        const resposta = await comandar('0902', TEMPOS.falhas);
        if (!resposta.ok) return null;
        const dados = dadosDoServico(resposta.linhas, 0x09, '02');
        if (!dados || dados.length < 2) return null;
        const texto = String.fromCharCode(...dados.slice(1).filter((b) => b >= 32 && b < 127));
        return texto.length >= 11 ? texto.trim() : null;
      } catch {
        return null;
      }
    },

    /** A tensão medida pelo próprio adaptador, que funciona com o motor desligado. */
    async tensaoDaBateria() {
      try {
        const resposta = await comandar('ATRV');
        const numero = Number.parseFloat(resposta.texto.replace(',', '.').replace(/[^0-9.]/g, ''));
        return Number.isFinite(numero) && numero > 4 && numero < 20 ? numero : null;
      } catch {
        return null;
      }
    },

    async fechar() {
      fechado = true;
      pendente = null;
      try {
        await transporte.fechar?.();
      } catch { /* fechar um transporte já caído não é problema de ninguém */ }
    },
  };

  return adaptador;
}

/** Os bytes de uma linha, exportados para quem quiser conferir uma resposta crua. */
export { bytesDaLinha };
