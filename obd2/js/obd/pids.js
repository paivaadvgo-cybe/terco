/**
 * Os PIDs do serviço 01 — o que o carro sabe contar sobre si mesmo.
 *
 * Cada entrada traz o nome em português, a unidade, quantos bytes ocupa e a
 * conta que transforma bytes em número. As contas são as da norma SAE J1979, e
 * estão escritas uma vez, aqui, porque uma conta errada não quebra nada: só
 * mostra um número plausível. Rotação com divisão errada dá 500 em vez de 2000
 * e a pessoa acha que o carro é que está estranho.
 *
 * **`ritmo` é o que faz o painel parecer vivo.** Um adaptador clone entrega de
 * 4 a 10 respostas por segundo no total, para todos os PIDs somados. Perguntar
 * tudo a cada volta faz a rotação atualizar uma vez por segundo, que na tela
 * parece travamento. Então rotação e velocidade vão em toda volta, o resto
 * espaça: a temperatura do motor não muda em 200 ms, e o nível de combustível
 * não muda em um minuto.
 */

/** Quantas voltas do painel cada ritmo espera antes de perguntar de novo. */
export const RITMOS = { rapido: 1, medio: 5, lento: 25 };

export const PIDS = {
  '04': {
    nome: 'Carga do motor', curto: 'Carga', unidade: '%', bytes: 1, ritmo: 'medio',
    decodificar: (b) => (b[0] * 100) / 255, casas: 0, min: 0, max: 100,
  },
  '05': {
    nome: 'Temperatura do motor', curto: 'Motor', unidade: '°C', bytes: 1, ritmo: 'lento',
    decodificar: (b) => b[0] - 40, casas: 0, min: -40, max: 130, faixaBoa: [70, 105],
  },
  '0A': {
    nome: 'Pressão de combustível', curto: 'Combustível', unidade: 'kPa', bytes: 1, ritmo: 'lento',
    decodificar: (b) => b[0] * 3, casas: 0, min: 0, max: 765,
  },
  '0B': {
    nome: 'Pressão do coletor', curto: 'Coletor', unidade: 'kPa', bytes: 1, ritmo: 'medio',
    decodificar: (b) => b[0], casas: 0, min: 0, max: 255,
  },
  '0C': {
    nome: 'Rotação', curto: 'Giro', unidade: 'rpm', bytes: 2, ritmo: 'rapido',
    decodificar: (b) => (b[0] * 256 + b[1]) / 4, casas: 0, min: 0, max: 8000, principal: true,
  },
  '0D': {
    nome: 'Velocidade', curto: 'Velocidade', unidade: 'km/h', bytes: 1, ritmo: 'rapido',
    decodificar: (b) => b[0], casas: 0, min: 0, max: 240, principal: true,
  },
  '0E': {
    nome: 'Avanço de ignição', curto: 'Avanço', unidade: '°', bytes: 1, ritmo: 'medio',
    decodificar: (b) => b[0] / 2 - 64, casas: 1, min: -64, max: 64,
  },
  '0F': {
    nome: 'Temperatura do ar admitido', curto: 'Ar admitido', unidade: '°C', bytes: 1, ritmo: 'lento',
    decodificar: (b) => b[0] - 40, casas: 0, min: -40, max: 120,
  },
  10: {
    nome: 'Fluxo de ar', curto: 'Fluxo de ar', unidade: 'g/s', bytes: 2, ritmo: 'rapido',
    decodificar: (b) => (b[0] * 256 + b[1]) / 100, casas: 1, min: 0, max: 200,
  },
  11: {
    nome: 'Acelerador', curto: 'Acelerador', unidade: '%', bytes: 1, ritmo: 'rapido',
    decodificar: (b) => (b[0] * 100) / 255, casas: 0, min: 0, max: 100,
  },
  '1F': {
    nome: 'Tempo de motor ligado', curto: 'Ligado há', unidade: 's', bytes: 2, ritmo: 'lento',
    decodificar: (b) => b[0] * 256 + b[1], casas: 0, min: 0, max: 65535,
  },
  21: {
    nome: 'Distância com a luz acesa', curto: 'Com a luz', unidade: 'km', bytes: 2, ritmo: 'lento',
    decodificar: (b) => b[0] * 256 + b[1], casas: 0, min: 0, max: 65535,
  },
  '2F': {
    nome: 'Nível de combustível', curto: 'Tanque', unidade: '%', bytes: 1, ritmo: 'lento',
    decodificar: (b) => (b[0] * 100) / 255, casas: 0, min: 0, max: 100,
  },
  31: {
    nome: 'Distância desde a última limpeza', curto: 'Desde a limpeza', unidade: 'km', bytes: 2, ritmo: 'lento',
    decodificar: (b) => b[0] * 256 + b[1], casas: 0, min: 0, max: 65535,
  },
  33: {
    nome: 'Pressão atmosférica', curto: 'Atmosfera', unidade: 'kPa', bytes: 1, ritmo: 'lento',
    decodificar: (b) => b[0], casas: 0, min: 0, max: 255,
  },
  42: {
    nome: 'Tensão do módulo', curto: 'Tensão', unidade: 'V', bytes: 2, ritmo: 'medio',
    decodificar: (b) => (b[0] * 256 + b[1]) / 1000, casas: 1, min: 0, max: 16, faixaBoa: [13, 14.8],
  },
  43: {
    nome: 'Carga absoluta', curto: 'Carga abs.', unidade: '%', bytes: 2, ritmo: 'medio',
    decodificar: (b) => ((b[0] * 256 + b[1]) * 100) / 255, casas: 0, min: 0, max: 400,
  },
  46: {
    nome: 'Temperatura ambiente', curto: 'Ambiente', unidade: '°C', bytes: 1, ritmo: 'lento',
    decodificar: (b) => b[0] - 40, casas: 0, min: -40, max: 60,
  },
  '5C': {
    nome: 'Temperatura do óleo', curto: 'Óleo', unidade: '°C', bytes: 1, ritmo: 'lento',
    decodificar: (b) => b[0] - 40, casas: 0, min: -40, max: 160, faixaBoa: [80, 115],
  },
  '5E': {
    nome: 'Consumo instantâneo', curto: 'Consumo', unidade: 'L/h', bytes: 2, ritmo: 'rapido',
    decodificar: (b) => (b[0] * 256 + b[1]) / 20, casas: 1, min: 0, max: 100,
  },
};

/** Os PIDs que o painel mostra quando ninguém escolheu nada. */
export const PADRAO_DO_PAINEL = ['0C', '0D', '05', '11', '04', '42'];

/**
 * Os PIDs que perguntam quais PIDs existem.
 *
 * Cada um responde por um bloco de 32, e o último bit de cada resposta diz se
 * vale a pena perguntar o próximo bloco. Perguntar os quatro sempre custa meio
 * segundo de abertura e enche o registro de `NO DATA` em carro antigo.
 */
export const PIDS_DE_INVENTARIO = ['00', '20', '40', '60'];

/**
 * Lê a máscara de PIDs suportados.
 *
 * A resposta são quatro bytes, 32 bits, e a ordem é a que engana: o bit mais
 * significativo do primeiro byte é o PID seguinte ao perguntado, não o
 * anterior. Perguntando `0100`, o primeiro bit é o PID 01 e o último é o 20.
 *
 * Devolve `{ suportados, temProximoBloco }`.
 */
export function lerInventario(base, bytes) {
  const inicio = parseInt(base, 16);
  const suportados = [];
  if (!bytes || bytes.length < 4) return { suportados, temProximoBloco: false };

  for (let i = 0; i < 32; i += 1) {
    const byte = bytes[Math.floor(i / 8)];
    const ligado = (byte & (0x80 >> (i % 8))) !== 0;
    // O bit 32 é o único que não descreve a si mesmo: ele anuncia o bloco
    // seguinte, e tratá-lo como PID inventaria um PID `20` que não existe.
    if (i === 31) return { suportados, temProximoBloco: ligado };
    if (ligado) suportados.push(hexaDePid(inicio + i + 1));
  }
  return { suportados, temProximoBloco: false };
}

export function hexaDePid(numero) {
  return numero.toString(16).toUpperCase().padStart(2, '0');
}

/** O PID existe na tabela e o carro respondeu quantos bytes a conta precisa? */
export function decodificar(pid, bytes) {
  const definicao = PIDS[String(pid).toUpperCase()];
  if (!definicao || !bytes || bytes.length < definicao.bytes) return null;
  const valor = definicao.decodificar(bytes);
  return Number.isFinite(valor) ? valor : null;
}

export function definicaoDe(pid) {
  return PIDS[String(pid).toUpperCase()] ?? null;
}

/** Os PIDs conhecidos que este carro tem, na ordem da tabela. */
export function conhecidosEntre(suportados) {
  const tem = new Set(suportados.map((p) => String(p).toUpperCase()));
  return Object.keys(PIDS).filter((pid) => tem.has(pid));
}

/**
 * A luz de anomalia e a contagem de falhas, do PID 01.
 *
 * É o único PID que não vira número na tela: o primeiro byte tem a lâmpada no
 * bit mais alto e o número de falhas nos sete de baixo. É por ele que o
 * aplicativo sabe que há algo a mostrar na tela de falhas antes de perguntar.
 */
export function lerStatusDaLuz(bytes) {
  if (!bytes || bytes.length < 1) return null;
  return {
    luzAcesa: (bytes[0] & 0x80) !== 0,
    falhas: bytes[0] & 0x7f,
  };
}
