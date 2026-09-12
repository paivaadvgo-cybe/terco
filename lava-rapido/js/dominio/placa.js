/**
 * A placa.
 *
 * Ela é o identificador do aplicativo inteiro: não há cadastro de cliente,
 * não há nome, telefone nem CPF — o carro é a placa, e o histórico de um
 * cliente é o histórico da placa dele.
 *
 * Duas regras valem mais que qualquer validação daqui: a placa nunca impede
 * o atendimento, e nenhum carro fica sem ser lavado porque o formato não
 * bateu. O que este módulo faz é limpar o que foi digitado e dizer se aquilo
 * *parece* uma placa brasileira. Quem chama decide o que fazer com a resposta,
 * e a única resposta aceitável na tela é um aviso discreto.
 */

/** Placa do padrão antigo (ABC1234) e do Mercosul (ABC1D23), na mesma expressão. */
const FORMATO = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

/** Marca das lavagens registradas sem placa. */
export const SEM_PLACA = null;

/**
 * Tira o que não é letra nem número e põe em maiúsculas.
 *
 * O teclado do celular corrige, insere espaço e às vezes hífen; quem digita
 * está em pé, no meio do movimento. `abc-1d23` e `ABC 1D23` são a mesma placa,
 * e precisam virar a mesma chave — senão o mesmo carro aparece duas vezes no
 * histórico, cada vez com um jeito de escrever.
 */
export function normalizar(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto).normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 7);
}

/** A placa normalizada está no formato brasileiro? */
export function eValida(texto) {
  return FORMATO.test(normalizar(texto));
}

/**
 * A placa como ela vai para o banco, ou `null` quando não há placa.
 *
 * Guardar `''` e `null` como coisas diferentes criaria dois tipos de «sem
 * placa» e um deles viraria uma placa vazia no histórico.
 */
export function paraRegistro(texto) {
  const limpa = normalizar(texto);
  return limpa === '' ? SEM_PLACA : limpa;
}

/** Como a placa aparece na tela. */
export function exibir(placa) {
  return placa ? placa : 'SEM PLACA';
}
