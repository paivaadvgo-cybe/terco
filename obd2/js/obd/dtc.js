/**
 * Códigos de falha: de dois bytes a `P0301`, e de `P0301` a português.
 *
 * A luz amarela no painel não diz nada além de «leve ao mecânico». O código diz
 * qual sensor, qual cilindro, qual circuito — e é a diferença entre trocar uma
 * bobina e trocar o motor. Por isso este arquivo carrega uma descrição para os
 * códigos genéricos mais comuns: não substitui manual, mas evita sair de casa
 * sem saber se o problema é uma tampa de tanque mal fechada ou uma falha de
 * combustão.
 *
 * **O que não é feito aqui, de propósito:** adivinhar código de fabricante. Um
 * `P1345` significa coisas diferentes em marcas diferentes, e chutar seria
 * pior que calar — quem lê um diagnóstico errado com confiança troca peça boa.
 * Esses aparecem com a família explicada e o texto «específico do fabricante».
 */

/** A letra vem dos dois bits mais altos do primeiro byte. Esta é a ordem. */
const SISTEMAS = ['P', 'C', 'B', 'U'];

const FAMILIAS = {
  P: 'Motor e transmissão',
  C: 'Chassi (freios, suspensão, direção)',
  B: 'Carroceria (airbag, vidros, painel)',
  U: 'Rede de comunicação entre os módulos',
};

/**
 * Descrições dos códigos genéricos mais comuns.
 *
 * Lista curta e conferida, e não um dicionário de dez mil linhas baixado de
 * algum lugar: o aplicativo inteiro precisa caber no cache do celular, e o que
 * aparece na oficina do dia a dia cabe em uma tela de arquivo.
 */
const DESCRICOES = {
  P0010: 'Atuador do comando de admissão — circuito aberto',
  P0011: 'Comando de admissão adiantado demais',
  P0016: 'Virabrequim e comando fora de sincronismo',
  P0030: 'Aquecedor da sonda lambda 1 — circuito',
  P0068: 'Fluxo de ar não confere com a posição do acelerador',
  P0100: 'Medidor de fluxo de ar (MAF) — circuito',
  P0101: 'Medidor de fluxo de ar (MAF) — leitura fora da faixa',
  P0102: 'Medidor de fluxo de ar (MAF) — sinal baixo',
  P0103: 'Medidor de fluxo de ar (MAF) — sinal alto',
  P0105: 'Sensor de pressão do coletor (MAP) — circuito',
  P0106: 'Sensor de pressão do coletor (MAP) — leitura fora da faixa',
  P0107: 'Sensor de pressão do coletor (MAP) — sinal baixo',
  P0108: 'Sensor de pressão do coletor (MAP) — sinal alto',
  P0110: 'Sensor de temperatura do ar admitido — circuito',
  P0113: 'Sensor de temperatura do ar admitido — sinal alto',
  P0115: 'Sensor de temperatura do motor — circuito',
  P0116: 'Sensor de temperatura do motor — leitura fora da faixa',
  P0117: 'Sensor de temperatura do motor — sinal baixo',
  P0118: 'Sensor de temperatura do motor — sinal alto',
  P0120: 'Sensor de posição do acelerador (TPS) — circuito',
  P0121: 'Sensor de posição do acelerador (TPS) — leitura inconsistente',
  P0122: 'Sensor de posição do acelerador (TPS) — sinal baixo',
  P0123: 'Sensor de posição do acelerador (TPS) — sinal alto',
  P0128: 'Motor não atinge a temperatura — válvula termostática',
  P0130: 'Sonda lambda 1 (antes do catalisador) — circuito',
  P0131: 'Sonda lambda 1 — tensão baixa (mistura pobre)',
  P0132: 'Sonda lambda 1 — tensão alta (mistura rica)',
  P0133: 'Sonda lambda 1 — resposta lenta',
  P0134: 'Sonda lambda 1 — sem atividade',
  P0135: 'Aquecedor da sonda lambda 1 — circuito',
  P0136: 'Sonda lambda 2 (depois do catalisador) — circuito',
  P0141: 'Aquecedor da sonda lambda 2 — circuito',
  P0171: 'Mistura pobre demais (banco 1)',
  P0172: 'Mistura rica demais (banco 1)',
  P0174: 'Mistura pobre demais (banco 2)',
  P0175: 'Mistura rica demais (banco 2)',
  P0200: 'Circuito dos bicos injetores',
  P0201: 'Bico injetor do cilindro 1 — circuito',
  P0202: 'Bico injetor do cilindro 2 — circuito',
  P0203: 'Bico injetor do cilindro 3 — circuito',
  P0204: 'Bico injetor do cilindro 4 — circuito',
  P0217: 'Superaquecimento do motor',
  P0219: 'Rotação acima do limite',
  P0230: 'Bomba de combustível — circuito',
  P0299: 'Turbo/compressor abaixo da pressão esperada',
  P0300: 'Falha de combustão em cilindros variados',
  P0301: 'Falha de combustão no cilindro 1',
  P0302: 'Falha de combustão no cilindro 2',
  P0303: 'Falha de combustão no cilindro 3',
  P0304: 'Falha de combustão no cilindro 4',
  P0305: 'Falha de combustão no cilindro 5',
  P0306: 'Falha de combustão no cilindro 6',
  P0320: 'Sensor de rotação — circuito',
  P0325: 'Sensor de detonação — circuito',
  P0335: 'Sensor de posição do virabrequim — circuito',
  P0340: 'Sensor de posição do comando — circuito',
  P0401: 'Recirculação de gases (EGR) — fluxo insuficiente',
  P0402: 'Recirculação de gases (EGR) — fluxo excessivo',
  P0420: 'Catalisador abaixo do rendimento (banco 1)',
  P0430: 'Catalisador abaixo do rendimento (banco 2)',
  P0440: 'Sistema de vapores de combustível (EVAP) — falha geral',
  P0442: 'Vazamento pequeno no sistema de vapores (EVAP)',
  P0443: 'Válvula de purga do canister — circuito',
  P0455: 'Vazamento grande no EVAP — quase sempre a tampa do tanque',
  P0456: 'Vazamento muito pequeno no EVAP',
  P0500: 'Sensor de velocidade — circuito',
  P0505: 'Controle de marcha lenta — falha',
  P0506: 'Marcha lenta abaixo do esperado',
  P0507: 'Marcha lenta acima do esperado',
  P0600: 'Falha de comunicação interna do módulo',
  P0601: 'Erro de memória do módulo de injeção',
  P0606: 'Processador do módulo de injeção — falha',
  P0700: 'Módulo do câmbio — falha registrada',
  P0706: 'Sensor de posição da alavanca — faixa incorreta',
  P0740: 'Conversor de torque — embreagem sem travar',
  P0755: 'Solenoide B do câmbio — circuito',
  U0100: 'Perdeu comunicação com o módulo de injeção',
  U0101: 'Perdeu comunicação com o módulo do câmbio',
  U0121: 'Perdeu comunicação com o módulo do freio (ABS)',
  U0155: 'Perdeu comunicação com o painel de instrumentos',
  C0035: 'Sensor de roda dianteira esquerda — circuito',
  C0040: 'Sensor de roda dianteira direita — circuito',
  B0001: 'Airbag do motorista — circuito',
};

/**
 * Dois bytes viram um código.
 *
 * `0x01 0x33` é `P0133`: os dois bits mais altos escolhem a letra, os dois
 * seguintes o primeiro dígito, e os três nibbles restantes são o resto, já em
 * hexadecimal — um código pode legitimamente ter um `F` no meio.
 */
export function codigoDeBytes(a, b) {
  const letra = SISTEMAS[(a & 0xc0) >> 6];
  const primeiro = (a & 0x30) >> 4;
  const resto = ((a & 0x0f) << 8) | b;
  return `${letra}${primeiro}${resto.toString(16).toUpperCase().padStart(3, '0')}`;
}

/**
 * Os códigos que vieram numa resposta dos serviços 03, 07 ou 0A.
 *
 * Há duas formas de resposta no mundo real, e a diferença é um byte: em CAN o
 * carro manda quantos códigos existem antes de mandá-los; nos protocolos mais
 * antigos, não manda, e completa o quadro com `0000` até encher.
 *
 * A paridade separa os dois casos sem chutar: com o byte de contagem sobra um
 * número ímpar de bytes, sem ele sobra um número par. É a única pista confiável
 * — o próprio valor da contagem pode coincidir com o primeiro byte de um código
 * de verdade.
 */
export function codigosDeDados(dados) {
  if (!dados || dados.length === 0) return [];
  const bytes = dados.length % 2 === 1 ? dados.slice(1) : dados;

  const codigos = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    // `0000` é enchimento de quadro, não é o código P0000.
    if (bytes[i] === 0 && bytes[i + 1] === 0) continue;
    const codigo = codigoDeBytes(bytes[i], bytes[i + 1]);
    if (!codigos.includes(codigo)) codigos.push(codigo);
  }
  return codigos;
}

/** Genérico (definido pela norma) ou específico do fabricante? */
export function generico(codigo) {
  const primeiro = String(codigo).charAt(1);
  return primeiro === '0' || primeiro === '2';
}

/** O que o código quer dizer, com a honestidade de dizer quando não se sabe. */
export function descrever(codigo) {
  const limpo = String(codigo).toUpperCase();
  const conhecido = DESCRICOES[limpo];
  if (conhecido) return { texto: conhecido, certeza: 'conhecido', familia: FAMILIAS[limpo.charAt(0)] };

  return {
    texto: generico(limpo)
      ? 'Código genérico não catalogado neste aplicativo — consulte o manual do veículo.'
      : 'Código específico do fabricante: o mesmo número significa coisas diferentes em marcas diferentes.',
    certeza: 'desconhecido',
    familia: FAMILIAS[limpo.charAt(0)] ?? 'Sistema não identificado',
  };
}

/** O relatório completo de um código, do jeito que a tela mostra. */
export function detalhar(codigo, origem = 'confirmada') {
  const descricao = descrever(codigo);
  return { codigo: String(codigo).toUpperCase(), origem, ...descricao };
}

export const ORIGENS = {
  confirmada: {
    nome: 'Confirmada',
    explicacao: 'A central confirmou a falha e acendeu a luz do painel.',
  },
  pendente: {
    nome: 'Pendente',
    explicacao: 'Aconteceu uma vez e ainda não se repetiu. Some sozinha se não voltar.',
  },
  permanente: {
    nome: 'Permanente',
    explicacao: 'Só sai depois que a central confirmar, ela mesma, que o defeito acabou — apagar pelo aparelho não tira.',
  },
};
