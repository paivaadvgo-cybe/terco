/**
 * A identidade deste aparelho, e o que ela guarda.
 *
 * Mora no `localStorage`, e **fora do backup** de propósito. Se viajasse no
 * arquivo de backup, restaurar num aparelho novo levaria a licença junto — e
 * uma licença de um aparelho passaria a valer em quantos aparelhos o cliente
 * quisesse. Ficando de fora, o backup continua servindo para o que serve
 * (salvar o movimento) e a licença continua sendo de quem a comprou.
 *
 * O que fica aqui:
 *
 * · **Installation ID** — o número que o cliente manda para o desenvolvedor e
 *   a que a licença fica presa.
 * · **Data de instalação** — o começo da avaliação.
 * · **Marca d'água** — o maior instante já visto. É o que denuncia o relógio
 *   atrasado de propósito.
 * · **A licença** importada, se houver.
 *
 * **Quando o `localStorage` não existe** (janela anônima com armazenamento
 * bloqueado), tudo isto passa a viver só na memória: o aplicativo funciona, a
 * avaliação recomeça a cada sessão e nenhuma licença fica guardada. É o mesmo
 * caso em que o IndexedDB também não abre — quem está assim não está
 * trabalhando, está espiando.
 */

const CHAVE = 'lavarapido_dispositivo_v1';

/** Reserva para quando o navegador recusa o armazenamento. */
let emMemoria = null;

/**
 * Esquece a reserva em memória.
 *
 * Existe para os testes. A reserva é global de propósito — uma página, um
 * aparelho —, e é justamente por ser global que dois cenários rodando no mesmo
 * processo se contaminavam: o primeiro deixava a marca d'água lá no futuro, e
 * o segundo nascia acusando relógio atrasado. No navegador nada disto acontece;
 * lá a reserva só entra em jogo quando o armazenamento está bloqueado, e aí ela
 * vale por uma sessão inteira, que é o que se quer.
 */
export function esquecerReserva() {
  emMemoria = null;
}

function novoIdentificador() {
  const aleatorio = globalThis.crypto?.randomUUID
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return aleatorio.slice(0, 20).toUpperCase().replace(/(.{5})(?=.)/g, '$1-');
}

function ler() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return emMemoria;
  }
}

function gravar(registro) {
  emMemoria = registro;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(registro));
  } catch { /* sem armazenamento: vale o que está em memória, nesta sessão */ }
  return registro;
}

/** O registro deste aparelho, criando-o na primeira vez. */
export function carregarDispositivo(agora = Date.now()) {
  const existente = ler();
  if (existente?.instalacaoId) {
    if (!existente.instalacaoEm) existente.instalacaoEm = agora;
    if (!existente.registros) existente.registros = [];
    return existente;
  }
  return gravar({
    instalacaoId: novoIdentificador(),
    instalacaoEm: agora,
    marcaDagua: agora,
    licenca: null,
    registros: [],
  });
}

export function salvarDispositivo(registro) {
  return gravar(registro);
}

/**
 * Altera o registro relendo-o antes — e nunca por cima de uma cópia em memória.
 *
 * O aplicativo guarda o registro do aparelho desde que abriu. Gravar essa cópia
 * apaga o que tiver mudado no armazenamento nesse meio-tempo, e quem muda por
 * fora é uma segunda aba do mesmo aplicativo — coisa comum em quem usa no
 * computador do escritório. O caso ruim é concreto: a licença é ativada numa
 * aba, e a outra, ao anotar a passagem do tempo, grava o registro antigo por
 * cima e a licença some. Reler antes de escrever custa nada e fecha isso.
 *
 * @param {(atual: object) => object} mudanca  devolve só os campos que mudam
 */
export function atualizarDispositivo(mudanca, agora = Date.now()) {
  const atual = carregarDispositivo(agora);
  return gravar({ ...atual, ...mudanca(atual) });
}

/**
 * Atualiza a marca d'água.
 *
 * Só para frente: é justamente o relógio que anda para trás que ela existe
 * para flagrar.
 */
export function marcarPassagemDoTempo(dispositivo, agora = Date.now()) {
  return atualizarDispositivo(
    (atual) => (agora > (atual.marcaDagua ?? 0) ? { marcaDagua: agora } : {}),
    agora,
  );
}

/** Um diário curto, para o desenvolvedor entender o que aconteceu no aparelho. */
export function anotar(dispositivo, evento, agora = Date.now()) {
  return atualizarDispositivo(
    (atual) => ({ registros: [{ em: agora, evento }, ...(atual.registros ?? [])].slice(0, 50) }),
    agora,
  );
}
