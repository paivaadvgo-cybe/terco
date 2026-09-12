/**
 * O estado de uma lavagem, e as únicas passagens permitidas entre estados.
 *
 * O fluxo é curto porque o trabalho é curto:
 *
 *     AGUARDANDO → EM LAVAGEM → FINALIZADO → PAGO
 *                                      ↓
 *                                  PENDENTE → PAGO
 *
 * Este módulo não toca no banco e não sabe que existe tela. Ele recebe uma
 * lavagem, devolve outra, e recusa o que não pode acontecer. A recusa importa:
 * sem ela, dois toques no mesmo botão «FINALIZAR» — coisa comum num celular
 * molhado — registram a segunda finalização por cima da primeira e movem a
 * hora de conclusão para frente. Aqui a segunda simplesmente não passa.
 */

export const ESTADOS = {
  AGUARDANDO: 'aguardando',
  LAVANDO: 'lavando',
  FINALIZADO: 'finalizado',
  PAGO: 'pago',
  PENDENTE: 'pendente',
  CANCELADO: 'cancelado',
};

/** Para onde cada estado pode ir. O que não está aqui não acontece. */
const PASSAGENS = {
  aguardando: ['lavando', 'finalizado', 'cancelado'],
  lavando: ['finalizado', 'cancelado'],
  finalizado: ['pago', 'pendente', 'cancelado'],
  pendente: ['pago', 'cancelado'],
  pago: ['cancelado'],
  cancelado: [],
};

export const ROTULOS = {
  aguardando: { texto: 'Aguardando', marca: '⚪' },
  lavando: { texto: 'Em lavagem', marca: '🟡' },
  finalizado: { texto: 'Finalizado', marca: '🔵' },
  pago: { texto: 'Pago', marca: '✅' },
  pendente: { texto: 'Pendente', marca: '⚠️' },
  cancelado: { texto: 'Cancelado', marca: '✖️' },
};

export const FORMAS = [
  { id: 'pix', nome: 'PIX' },
  { id: 'dinheiro', nome: 'Dinheiro' },
  { id: 'debito', nome: 'Débito' },
  { id: 'credito', nome: 'Crédito' },
];

const FORMAS_VALIDAS = new Set(FORMAS.map((f) => f.id));

export function nomeDaForma(id) {
  return FORMAS.find((f) => f.id === id)?.nome ?? '—';
}

export function rotulo(estado) {
  return ROTULOS[estado] ?? { texto: String(estado ?? '—'), marca: '•' };
}

export function podeIr(de, para) {
  return (PASSAGENS[de] ?? []).includes(para);
}

/** Está no pátio agora: ou esperando, ou sendo lavada. */
export function emAtendimento(lavagem) {
  return lavagem.estado === ESTADOS.AGUARDANDO || lavagem.estado === ESTADOS.LAVANDO;
}

/** Já foi entregue e ninguém pagou. */
export function devendo(lavagem) {
  return lavagem.estado === ESTADOS.PENDENTE || lavagem.estado === ESTADOS.FINALIZADO;
}

/** Entrou dinheiro por esta lavagem. */
export function recebida(lavagem) {
  return lavagem.estado === ESTADOS.PAGO;
}

function mover(lavagem, para, campos) {
  if (!podeIr(lavagem.estado, para)) {
    const erro = new Error(`uma lavagem ${rotulo(lavagem.estado).texto.toLowerCase()} não pode ir para ${rotulo(para).texto.toLowerCase()}`);
    erro.nome = 'PassagemInvalida';
    throw erro;
  }
  return { ...lavagem, estado: para, ...campos };
}

export function iniciar(lavagem, agora = Date.now()) {
  return mover(lavagem, ESTADOS.LAVANDO, { iniciadaEm: agora });
}

export function finalizar(lavagem, agora = Date.now()) {
  return mover(lavagem, ESTADOS.FINALIZADO, { finalizadaEm: agora });
}

/**
 * Recebe o pagamento.
 *
 * O valor recebido é o valor da lavagem: não há desconto nem troco a registrar
 * no MVP, e inventar um campo de valor livre aqui abriria a porta para um caixa
 * que não fecha com a soma das lavagens.
 */
export function receber(lavagem, forma, agora = Date.now()) {
  if (!FORMAS_VALIDAS.has(forma)) {
    const erro = new Error(`forma de pagamento desconhecida: ${forma}`);
    erro.nome = 'FormaInvalida';
    throw erro;
  }
  return mover(lavagem, ESTADOS.PAGO, {
    pagamento: { forma, valor: lavagem.valor, em: agora },
    pagaEm: agora,
  });
}

/** O carro saiu sem pagar. Vira dívida, e aparece na tela inicial até quitar. */
export function marcarPendente(lavagem, agora = Date.now()) {
  return mover(lavagem, ESTADOS.PENDENTE, { pendenteDesde: agora });
}

export function cancelar(lavagem, motivo = '', agora = Date.now()) {
  return mover(lavagem, ESTADOS.CANCELADO, { canceladaEm: agora, motivoDoCancelamento: motivo });
}
