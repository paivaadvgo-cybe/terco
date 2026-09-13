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
    // No mostrador a escala vai de 0 a 8, como num conta-giros de verdade:
    // «8000» em cada traço não caberia, e ninguém lê o conta-giros dígito a
    // dígito.
    escalaDividida: 1000,
    zonaVermelha: 6000,
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

/**
 * A pressão atmosférica presumida, em kPa, quando o carro não a informa.
 *
 * 101,3 kPa é o nível do mar. Em Goiânia, a 750 m, a real fica perto de 93 —
 * usar o padrão ali superestima o vácuo em 0,08 bar. É pouco para um ponteiro e
 * muito para uma conta, e por isso o valor presumido é marcado como presumido:
 * a tela diz quando o número não veio do barômetro do carro.
 */
export const ATMOSFERICA_PADRAO = 101.3;

/**
 * Valores que o carro não informa e que se calculam a partir dos que informa.
 *
 * **A pressão do turbo é o caso clássico.** Não existe PID de «pressão de
 * turbo» na norma: o que o carro mede é a pressão *absoluta* do coletor (PID
 * 0B) — que já inclui a atmosfera empurrando. O que o manômetro de turbo mostra
 * é a diferença: quanto o compressor somou acima do ar que já estava lá. Sem
 * subtrair a atmosférica, um motor em marcha lenta marcaria «0,3 bar de turbo»
 * parado na garagem.
 *
 * Daí sair negativo em carro aspirado, e em turbo fora de carga: o pistão
 * aspirando contra a borboleta fechada faz vácuo, e isso é o que está
 * acontecendo de verdade. Mostrar zero ali seria mentira confortável.
 *
 * Eles entram em `estado.valores` junto dos PIDs reais, com a mesma cara — e
 * por isso ponteiro, gráfico, exportação e escolha do painel funcionam sem
 * saber que a origem é outra.
 */
export const DERIVADOS = {
  TURBO: {
    nome: 'Pressão do turbo', curto: 'Turbo', unidade: 'bar', ritmo: 'rapido',
    casas: 2, min: -1, max: 2, derivado: true,
    /** Sem a pressão do coletor não há o que calcular. A atmosférica é opcional. */
    precisa: ['0B'],
    derivar: (valores) => {
      const coletor = valores['0B'];
      if (!Number.isFinite(coletor)) return null;
      const atmosferica = Number.isFinite(valores['33']) ? valores['33'] : ATMOSFERICA_PADRAO;
      return (coletor - atmosferica) / 100;
    },
  },
};

/**
 * Valores que não vêm do carro nem de uma conta sobre ele: vêm do celular.
 *
 * A velocidade do GPS é o caso, e ela existe por um motivo concreto: **o
 * velocímetro do carro mente para cima, de fábrica e por norma**. O
 * regulamento permite marcar acima da velocidade real, nunca abaixo, e os
 * fabricantes usam essa folga — 5 a 10% a mais é o comum. A velocidade do OBD
 * costuma ser a mesma do painel, com a mesma folga.
 *
 * O GPS mede o deslocamento no chão, e é o mais perto do real que um celular
 * alcança. Ver as duas lado a lado é a única forma de saber de quanto é a
 * diferença no seu carro — e ela é constante o bastante para ser útil.
 *
 * Não é perfeito: em túnel, em viaduto e sob mata fechada o sinal degrada, e o
 * número fica velho ou some. Por isso a leitura carrega precisão e idade, e a
 * tela mostra quando não dá para confiar.
 */
export const EXTERNOS = {
  GPS: {
    nome: 'Velocidade (GPS)', curto: 'GPS', unidade: 'km/h',
    casas: 0, min: 0, max: 240, externo: true, ritmo: 'rapido',
  },
};

/**
 * Números que o aplicativo calcula e que o painel pode mostrar como qualquer
 * outro.
 *
 * Eles já existiam — consumo instantâneo e média —, mas viviam presos em
 * cartões fixos da tela. Declará-los aqui é o que permite arrastá-los,
 * redimensioná-los e escolher a escala deles como se fossem PIDs: para o
 * mostrador, um número é um número, venha do carro ou de uma conta.
 *
 * Consumo aparece em duas unidades de propósito. Quilômetro por litro é o que
 * se compara com o tanque anterior, mas não existe parado — a conta daria
 * infinito. Litro por hora existe sempre, e é o número que faz sentido com o
 * motor girando e o carro sem andar.
 */
export const CALCULADOS = {
  CONSUMO: {
    nome: 'Consumo (km/L)', curto: 'Consumo', unidade: 'km/L',
    casas: 1, min: 0, max: 30, calculado: true, ritmo: 'rapido',
  },
  LH: {
    nome: 'Consumo (L/h)', curto: 'L/h', unidade: 'L/h',
    casas: 1, min: 0, max: 40, calculado: true, ritmo: 'rapido',
  },
  MEDIA: {
    nome: 'Consumo médio', curto: 'Média', unidade: 'km/L',
    casas: 1, min: 0, max: 30, calculado: true, ritmo: 'rapido',
  },
  /**
   * A maior velocidade lida desde que se conectou.
   *
   * É o «MAX» do canto de um quadro de instrumentos. Fica junto dos outros
   * valores, e não só na lista de máximos, porque num painel de instrumentos ele
   * é um mostrador como qualquer outro — e porque quem o quer no canto da tela
   * precisa poder pô-lo lá.
   */
  MAXIMA: {
    nome: 'Velocidade máxima', curto: 'Máxima', unidade: 'km/h',
    casas: 0, min: 0, max: 240, calculado: true, ritmo: 'rapido',
  },
  /** Quilômetros rodados desde a conexão — a «distância total» do painel. */
  DISTANCIA: {
    nome: 'Distância percorrida', curto: 'Distância', unidade: 'km',
    casas: 1, min: 0, max: 500, calculado: true, ritmo: 'rapido',
  },
};

/** A leitura veio do barômetro do carro, ou da atmosfera presumida? */
export function atmosfericaMedida(valores) {
  return Number.isFinite(valores?.['33']);
}

/**
 * Calcula os derivados que dão para calcular, a partir dos valores do momento.
 *
 * Devolve só o que tem origem: um derivado sem os PIDs de que precisa fica de
 * fora do objeto, e não entra como `null` — assim o mostrador continua com o
 * último valor bom em vez de piscar travessão a cada volta em que o PID de base
 * não foi perguntado.
 */
export function calcularDerivados(valores) {
  const saida = {};
  for (const [chave, definicao] of Object.entries(DERIVADOS)) {
    if (!definicao.precisa.every((pid) => Number.isFinite(valores[pid]))) continue;
    const valor = definicao.derivar(valores);
    if (Number.isFinite(valor)) saida[chave] = valor;
  }
  return saida;
}

/** Os derivados que este carro consegue alimentar, dados os PIDs que ele tem. */
export function derivadosPossiveis(suportados) {
  const tem = new Set(suportados.map((p) => String(p).toUpperCase()));
  return Object.keys(DERIVADOS).filter((chave) => DERIVADOS[chave].precisa.every((pid) => tem.has(pid)));
}

/** Os PIDs que o painel mostra quando ninguém escolheu nada. */
export const PADRAO_DO_PAINEL = ['0C', '0D', 'TURBO', '05', '11', '42'];

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

/**
 * A definição de um PID ou de um derivado.
 *
 * Os dois juntos de propósito: quem formata um número, desenha um ponteiro ou
 * monta uma coluna de planilha não tem por que saber se o valor veio do carro
 * ou de uma subtração.
 */
export function definicaoDe(pid) {
  const chave = String(pid).toUpperCase();
  return PIDS[chave] ?? DERIVADOS[chave] ?? EXTERNOS[chave] ?? CALCULADOS[chave] ?? null;
}

/** Tudo que o painel pode mostrar, na ordem em que se oferece para escolher. */
export function tudoQueSeMostra() {
  return { ...CALCULADOS, ...DERIVADOS, ...EXTERNOS, ...PIDS };
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
