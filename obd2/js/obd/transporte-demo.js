/**
 * Um ELM327 de mentira, com um carro de mentira dentro.
 *
 * Existe por três razões, e nenhuma delas é enfeite:
 *
 * · **Dá para testar tudo em terra.** A pilha inteira — fila de comandos,
 *   remontagem de quadros, decodificação de PIDs, gravação de viagem — roda
 *   contra este arquivo no `node --test`, sem carro, sem adaptador e sem
 *   Bluetooth. O que se testa só no estacionamento não se testa.
 * · **O aplicativo abre para quem ainda não comprou o adaptador.** Ver o painel
 *   funcionando é o que responde «serve para o meu carro?» antes de gastar.
 * · **iPhone.** No Safari não há Web Bluetooth nem Web Serial, e o aplicativo
 *   não tem como conectar. Em vez de uma tela morta, ele mostra a simulação e
 *   diz, com todas as letras, que ali é simulação.
 *
 * O carro simulado responde no formato exato do adaptador real, com eco ligado
 * até `ATE0`, resposta partida em quadros no chassi e `NO DATA` nos PIDs que
 * ele não tem. Facilitar aqui seria esconder justamente os casos que quebram o
 * aplicativo lá fora.
 */

import { hexa } from './protocolo.js';

/** O chassi do carro simulado. Formato válido, veículo inexistente. */
const VIN_SIMULADO = '9BGRD08X04G111111';

/** O que o carro simulado sabe responder. Um flex 1.6 comum, sem sensor de óleo. */
const PIDS_SIMULADOS = ['01', '04', '05', '0B', '0C', '0D', '0E', '0F', '10', '11', '1F', '2F', '33', '42', '46'];

/**
 * O ciclo de condução, em segundos.
 *
 * Oitenta segundos que se repetem: marcha lenta, aceleração, cruzeiro, freada e
 * parada. Não é um carro de verdade — é o bastante para os ponteiros se
 * mexerem como se mexem, que é o que a tela precisa provar.
 */
function estadoDoCarro(segundos, { falhas }) {
  const t = segundos % 80;

  let velocidade;
  if (t < 8) velocidade = 0;
  else if (t < 26) velocidade = ((t - 8) / 18) * 82;               // acelerando
  else if (t < 58) velocidade = 82 + Math.sin((t - 26) / 3) * 6;   // cruzeiro, com o pé oscilando
  else if (t < 70) velocidade = Math.max(0, 82 * (1 - (t - 58) / 12)); // freando
  else velocidade = 0;

  const parado = velocidade < 1;
  // Marcha pela velocidade, como num câmbio manual mal dirigido.
  const marcha = parado ? 0 : Math.min(5, Math.max(1, Math.floor(velocidade / 18) + 1));
  const relacao = [0, 13.5, 24, 34, 44, 54][marcha] || 1;
  const rotacao = parado ? 780 + Math.sin(segundos * 2) * 30 : (velocidade / relacao) * 1000 + 900;

  const acelerando = t >= 8 && t < 26;
  const freando = t >= 58 && t < 70;
  const acelerador = parado ? 0 : (freando ? 0 : (acelerando ? 45 : 18));

  // O motor esquenta de 26 °C a 92 °C nos três primeiros minutos e fica lá.
  const temperatura = Math.min(92, 26 + segundos * 0.37);

  return {
    velocidade,
    rotacao,
    acelerador,
    temperatura,
    carga: parado ? 22 : 20 + acelerador * 1.2,
    fluxoDeAr: parado ? 2.4 : 2 + (rotacao / 1000) * (1 + acelerador / 30) * 2.2,
    coletor: parado ? 32 : 30 + acelerador * 1.3,
    avanco: parado ? 8 : 14 + (freando ? -6 : 0),
    arAdmitido: 31 + Math.min(12, segundos * 0.02),
    ambiente: 28,
    tanque: Math.max(4, 62 - segundos * 0.004),
    tensao: parado ? 13.9 : 14.2,
    ligadoHa: Math.floor(segundos),
    luz: falhas.length > 0,
  };
}

/** Bytes de cada PID, na forma exata em que o carro responderia. */
function respostaDePid(pid, carro) {
  const doisBytes = (valor) => hexa(Math.floor(valor / 256)) + hexa(Math.floor(valor) % 256);

  switch (pid) {
    case '01': return hexa((carro.luz ? 0x80 : 0) | 2) + '07E500';
    case '04': return hexa(Math.round((carro.carga * 255) / 100));
    case '05': return hexa(Math.round(carro.temperatura) + 40);
    case '0B': return hexa(Math.round(carro.coletor));
    case '0C': return doisBytes(Math.round(carro.rotacao * 4));
    case '0D': return hexa(Math.round(carro.velocidade));
    case '0E': return hexa(Math.round((carro.avanco + 64) * 2));
    case '0F': return hexa(Math.round(carro.arAdmitido) + 40);
    case '10': return doisBytes(Math.round(carro.fluxoDeAr * 100));
    case '11': return hexa(Math.round((carro.acelerador * 255) / 100));
    case '1F': return doisBytes(carro.ligadoHa);
    case '2F': return hexa(Math.round((carro.tanque * 255) / 100));
    case '33': return hexa(94);
    case '42': return doisBytes(Math.round(carro.tensao * 1000));
    case '46': return hexa(Math.round(carro.ambiente) + 40);
    default: return null;
  }
}

/**
 * A máscara de PIDs suportados de um bloco, montada a partir da lista.
 *
 * O último bit não descreve um PID: anuncia que o bloco seguinte também tem
 * coisa. Montá-lo aqui é o que faz o simulador exercitar o caminho de vários
 * blocos — um carro de verdade responde `0100` e `0120`, e o aplicativo que só
 * lê o primeiro bloco perde o nível de combustível e a tensão do módulo.
 */
function inventario(base) {
  const inicio = parseInt(base, 16);
  const bytes = [0, 0, 0, 0];
  for (const pid of PIDS_SIMULADOS) {
    const numero = parseInt(pid, 16);
    const posicao = numero - inicio - 1;
    if (posicao < 0 || posicao > 31) continue;
    bytes[Math.floor(posicao / 8)] |= 0x80 >> (posicao % 8);
  }
  if (PIDS_SIMULADOS.some((pid) => parseInt(pid, 16) > inicio + 0x20)) bytes[3] |= 0x01;
  return bytes.map((b) => hexa(b)).join('');
}

/** Os blocos de inventário que o carro simulado responde. */
const BLOCOS_SIMULADOS = ['00', '20', '40'];

/** As falhas que o carro simulado guarda, e que o serviço 04 apaga. */
const FALHAS_INICIAIS = {
  confirmadas: [0x03, 0x01], // P0301 — falha de combustão no cilindro 1
  pendentes: [0x04, 0x20],   // P0420 — catalisador abaixo do rendimento
};

export function criarTransporteDemo({ atraso = 40, agora = () => Date.now() } = {}) {
  const inicio = agora();
  let receber = () => {};
  let eco = true;
  let espacos = true;
  let confirmadas = [...FALHAS_INICIAIS.confirmadas];
  let pendentes = [...FALHAS_INICIAIS.pendentes];
  let aberto = false;

  const carroAgora = () => estadoDoCarro((agora() - inicio) / 1000, {
    falhas: confirmadas,
  });

  /** Aplica `ATS0`: o adaptador real tira os espaços quando mandam. */
  const formatar = (hexadecimal) => (espacos
    ? hexadecimal.replace(/(..)/g, '$1 ').trim()
    : hexadecimal);

  function responder(comando) {
    const limpo = comando.trim().toUpperCase().replace(/\s+/g, '');

    if (limpo.startsWith('AT')) {
      if (limpo === 'ATZ') {
        eco = true;
        espacos = true;
        return 'ELM327 v1.5';
      }
      if (limpo === 'ATE0') { eco = false; return 'OK'; }
      if (limpo === 'ATE1') { eco = true; return 'OK'; }
      if (limpo === 'ATS0') { espacos = false; return 'OK'; }
      if (limpo === 'ATS1') { espacos = true; return 'OK'; }
      if (limpo === 'ATDPN') return 'A6';
      if (limpo === 'ATRV') return `${carroAgora().tensao.toFixed(1)}V`;
      if (limpo === 'ATI') return 'ELM327 v1.5';
      if (/^AT(L|H|AT|SP|ST|CAF|CRA)/.test(limpo)) return 'OK';
      return '?';
    }

    if (limpo === '04') {
      confirmadas = [];
      return formatar('44');
    }

    // O dígito de contagem no fim (`010C1`) é opcional e não muda a resposta.
    const consulta = /^(0[1379A])([0-9A-F]{2})?([0-9])?$/.exec(limpo);
    if (!consulta) return '?';
    const [, servico, pid] = consulta;

    if (servico === '01') {
      if (['00', '20', '40', '60'].includes(pid)) {
        if (!BLOCOS_SIMULADOS.includes(pid)) return 'NO DATA';
        return formatar(`41${pid}${inventario(pid)}`);
      }
      const carro = carroAgora();
      const dados = PIDS_SIMULADOS.includes(pid) ? respostaDePid(pid, carro) : null;
      return dados ? formatar(`41${pid}${dados}`) : 'NO DATA';
    }

    if (servico === '03' || servico === '07') {
      const lista = servico === '03' ? confirmadas : pendentes;
      if (lista.length === 0) return formatar(`4${servico.slice(1)}00`);
      // Formato CAN: o byte de contagem antes dos códigos.
      const contagem = hexa(lista.length / 2);
      return formatar(`4${servico.slice(1)}${contagem}${lista.map((b) => hexa(b)).join('')}`);
    }

    if (servico === '0A') return formatar('4A00');

    if (servico === '09' && pid === '02') {
      // Resposta partida, como a de um carro real: o chassi não cabe num quadro.
      const corpo = `4902 01${[...VIN_SIMULADO].map((c) => hexa(c.charCodeAt(0))).join('')}`.replace(/\s/g, '');
      const total = hexa(corpo.length / 2, 3);
      // O primeiro quadro leva seis bytes e os seguintes, sete: é assim que o
      // ISO-TP parte a resposta, e o aplicativo precisa remontar quadros de
      // tamanhos diferentes.
      const pedacos = [corpo.slice(0, 12), ...(corpo.slice(12).match(/.{1,14}/g) ?? [])];
      return [total, ...pedacos.map((p, i) => `${i.toString(16).toUpperCase()}:${formatar(p)}`)].join('\r');
    }

    return 'NO DATA';
  }

  return {
    nome: 'demonstracao',
    rotulo: 'Simulação',
    simulado: true,
    conectado: false,

    async abrir() {
      aberto = true;
      this.conectado = true;
    },

    aoReceber(callback) { receber = callback; },
    aoDesconectar() { /* a simulação não cai sozinha */ },

    async enviar(texto) {
      if (!aberto) throw new Error('a simulação não está aberta');
      const comando = texto.replace(/[\r\n]/g, '');
      const resposta = responder(comando);
      // O atraso não é preguiça: sem ele a resposta chegaria antes de quem
      // perguntou terminar de registrar a pergunta, e o aplicativo passaria a
      // depender de uma ordem que o mundo real não garante.
      await new Promise((pronto) => { setTimeout(pronto, atraso); });
      receber(`${eco ? `${comando}\r` : ''}${resposta}\r\r>`);
    },

    async fechar() {
      aberto = false;
      this.conectado = false;
    },

    /** Só para as telas de demonstração: recolocar as falhas apagadas. */
    reporFalhas() {
      confirmadas = [...FALHAS_INICIAIS.confirmadas];
      pendentes = [...FALHAS_INICIAIS.pendentes];
    },
  };
}
