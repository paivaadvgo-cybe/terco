/**
 * O protocolo do ELM327, em texto puro.
 *
 * O adaptador é um terminal serial disfarçado: recebe uma linha, responde
 * algumas, e termina sempre com `>` — o convite para o próximo comando. Tudo
 * neste arquivo é conversão de texto em bytes e de bytes em resposta, sem
 * Bluetooth, sem USB e sem navegador, para que a parte que mais erra em campo
 * seja a parte que se pode testar em terra firme.
 *
 * **Três armadilhas moram aqui**, e são a razão de o arquivo existir separado:
 *
 * · O eco. Sem `ATE0`, o adaptador repete o comando antes de responder, e a
 *   primeira linha da resposta é a pergunta. Manda-se `ATE0` na abertura, mas
 *   um adaptador que reiniciou sozinho volta com eco ligado — então o eco é
 *   descartado aqui também, por endereço e não por confiança.
 * · O `SEARCHING...`. Na primeira consulta o adaptador procura o protocolo do
 *   carro e escreve isso no meio da resposta. Não é erro nem dado.
 * · A resposta em pedaços. Um VIN não cabe num quadro CAN, e o ELM327 entrega
 *   `0:`, `1:`, `2:` com uma linha de tamanho antes. Quem lê byte a byte sem
 *   remontar isso lê lixo e acha que o carro é que está estranho.
 */

/** O adaptador terminou de falar quando escreve o convite. */
export const PROMPT = '>';

/**
 * Respostas que não são dado.
 *
 * `NO DATA` é a mais comum e a menos preocupante: o carro não responde àquele
 * PID. Não é falha de conexão, e tratá-la como falha faz o aplicativo
 * desconectar sozinho no meio de uma viagem porque perguntou a temperatura do
 * óleo a um carro que não tem o sensor.
 *
 * **Alguns textos dizem o que fazer, e não só o que houve.** Não é enfeite:
 * `UNABLE TO CONNECT` é a falha mais comum de todas numa primeira conexão, e a
 * causa quase sempre é a mesma — a ignição desligada. O conector OBD tem
 * energia permanente, então o adaptador acende, responde a todos os comandos de
 * configuração e parece perfeito; a linha do carro, essa só acorda com a chave
 * na posição «ligado». Sem a dica, a mensagem está certa e não ajuda: manda
 * procurar defeito num adaptador que está funcionando.
 */
export const AVISOS = {
  'NO DATA': { grave: false, texto: 'o carro não respondeu a esta consulta' },
  'UNABLE TO CONNECT': {
    grave: true,
    texto: 'o adaptador não achou a central do carro — ligue a ignição (sem precisar dar partida) e tente de novo',
  },
  'BUS INIT: ERROR': { grave: true, texto: 'falha ao abrir a linha de comunicação' },
  'BUS ERROR': { grave: true, texto: 'erro na linha de comunicação' },
  'BUS BUSY': { grave: false, texto: 'a linha está ocupada' },
  'CAN ERROR': { grave: true, texto: 'erro no barramento CAN' },
  'DATA ERROR': { grave: false, texto: 'a resposta veio corrompida' },
  'BUFFER FULL': { grave: false, texto: 'a resposta foi maior que a memória do adaptador' },
  'FB ERROR': { grave: true, texto: 'erro de realimentação no adaptador' },
  'LV RESET': { grave: true, texto: 'o adaptador reiniciou por queda de tensão' },
  STOPPED: { grave: false, texto: 'a consulta foi interrompida' },
  ERROR: { grave: true, texto: 'o adaptador recusou o comando' },
  '?': { grave: false, texto: 'o adaptador não conhece este comando' },
};

const SO_HEXA = /^[0-9A-F\s]+$/;

/** Uma linha só, sem espaços e em maiúsculas — como o resto do arquivo espera. */
const normalizar = (linha) => linha.replace(/\s+/g, '').toUpperCase();

/**
 * As linhas úteis de uma resposta.
 *
 * Tira o convite, o eco do comando, o `SEARCHING...` e as linhas vazias. O que
 * sobra é dado ou é aviso — e distinguir os dois é trabalho de `interpretar`.
 */
export function linhasDaResposta(texto, comando = '') {
  const eco = normalizar(comando);
  return String(texto)
    .split(/[\r\n]+/)
    .map((linha) => linha.replace(/>/g, '').trim())
    .filter((linha) => linha.length > 0)
    .filter((linha) => !/^SEARCHING/i.test(linha))
    .filter((linha) => normalizar(linha) !== eco)
    .map((linha) => linha.toUpperCase());
}

/** O aviso que esta linha carrega, se carregar algum. */
export function avisoDaLinha(linha) {
  const limpa = String(linha).trim().toUpperCase();
  if (limpa === '?') return { codigo: '?', ...AVISOS['?'] };
  for (const [codigo, aviso] of Object.entries(AVISOS)) {
    if (limpa.startsWith(codigo)) return { codigo, ...aviso };
  }
  return null;
}

/**
 * Remonta uma resposta partida em quadros.
 *
 * Quando a resposta não cabe num quadro CAN, o ELM327 escreve o tamanho total
 * numa linha e numera os pedaços — `0:`, `1:`, `2:`. É o formato do VIN e da
 * lista longa de falhas. As linhas vêm em ordem quase sempre, e «quase» não
 * serve: a numeração existe justamente para o caso em que não vêm, então a
 * ordem daqui é a dos números, não a da chegada.
 *
 * O primeiro pedaço traz dois bytes de cabeçalho ISO-TP que o ELM327 já
 * consumiu; o que ele entrega é dado. A linha de tamanho é descartada: ela
 * conta bytes do serviço, e recontar aqui só criaria uma segunda verdade.
 */
export function juntarQuadros(linhas) {
  const pedacos = [];
  const soltas = [];

  for (const linha of linhas) {
    const partido = /^([0-9A-F]):(.*)$/.exec(normalizar(linha));
    if (partido) pedacos.push([parseInt(partido[1], 16), partido[2]]);
    else soltas.push(linha);
  }

  if (pedacos.length === 0) return linhas;

  // A linha de tamanho (`014`) acompanha os pedaços e não é dado. Some junto
  // com ela qualquer outra linha solta — numa resposta partida não há dado
  // fora dos pedaços.
  pedacos.sort((a, b) => a[0] - b[0]);
  return [pedacos.map(([, dado]) => dado).join('')];
}

/**
 * Os bytes de uma linha hexadecimal. Linha que não é hexa vira lista vazia.
 *
 * Quando os espaços estão ligados, cada grupo é um byte — e um grupo de três
 * dígitos é o endereço da central (`7E8`), que o adaptador imprime com `ATH1`.
 * Emendar tudo e partir de dois em dois desalinharia a linha inteira a partir
 * dali, e a resposta viraria números plausíveis e errados. Os grupos que não
 * têm dois dígitos são descartados: são cabeçalho, não dado.
 */
export function bytesDaLinha(linha) {
  const texto = String(linha).toUpperCase().trim();
  if (!SO_HEXA.test(texto) || texto.length < 2) return [];

  const grupos = texto.split(/\s+/);
  const emendada = grupos.length > 1 && grupos.some((g) => g.length !== 2)
    ? grupos.filter((g) => g.length === 2).join('')
    : grupos.join('');

  const bytes = [];
  for (let i = 0; i + 1 < emendada.length; i += 2) bytes.push(parseInt(emendada.slice(i, i + 2), 16));
  return bytes;
}

/**
 * O texto cru de uma resposta, já entendido.
 *
 * Devolve `{ ok, aviso, linhas, texto }`. `ok` é falso quando não sobrou dado
 * nenhum — e nesse caso `aviso` diz o porquê, com a diferença entre «o carro
 * não tem esse sensor» e «o adaptador caiu» preservada em `aviso.grave`.
 */
export function interpretar(texto, comando = '') {
  const linhas = linhasDaResposta(texto, comando);
  const avisos = linhas.map(avisoDaLinha).filter(Boolean);
  const dados = juntarQuadros(linhas.filter((linha) => !avisoDaLinha(linha)));

  return {
    ok: dados.length > 0,
    aviso: avisos[0] ?? null,
    linhas: dados,
    texto: linhas.join('\n'),
  };
}

/**
 * Os bytes de dado de uma resposta a um serviço, ou `null`.
 *
 * O carro responde com o serviço somado a `0x40` — o serviço 01 vira 41 — e
 * repete o PID perguntado. Conferir os dois não é preciosismo: com o adaptador
 * em modo automático chegam respostas de mais de uma central, e às vezes a
 * resposta de uma consulta anterior chega atrasada. Aceitar a primeira linha
 * que aparecer é como mostrar a temperatura do motor no lugar da rotação, e
 * ninguém desconfia de um número plausível.
 */
export function dadosDoServico(linhas, servico, pid = null) {
  const servicoEsperado = servico + 0x40;
  const pidEsperado = pid === null ? null : parseInt(pid, 16);

  for (const linha of linhas) {
    const bytes = bytesDaLinha(linha);
    if (bytes.length === 0) continue;

    // Um cabeçalho de endereço pode sobrar quando `ATH1` está ligado; procurar
    // o serviço em vez de exigi-lo no começo aceita os dois casos.
    for (let i = 0; i < bytes.length; i += 1) {
      if (bytes[i] !== servicoEsperado) continue;
      if (pidEsperado === null) return bytes.slice(i + 1);
      if (bytes[i + 1] === pidEsperado) return bytes.slice(i + 2);
    }
  }
  return null;
}

/** `0C` a partir de 12; o formato que o ELM327 espera receber e devolve. */
export function hexa(numero, digitos = 2) {
  return Number(numero).toString(16).toUpperCase().padStart(digitos, '0');
}

/**
 * O comando que pergunta um PID.
 *
 * O dígito extra no fim (`010C1`) diz ao adaptador quantas respostas esperar:
 * com ele, o ELM327 devolve assim que a primeira central responde, em vez de
 * esperar o tempo limite inteiro à toa. É o que separa um painel a 8 leituras
 * por segundo de um a 2 — e é gratuito, porque o carro responde igual.
 */
export function comandoDePid(servico, pid, respostas = 1) {
  const base = `${hexa(servico)}${pid === null ? '' : String(pid).toUpperCase()}`;
  return respostas ? `${base}${respostas}` : base;
}
