/**
 * Senha do painel de administração.
 *
 * **O que isto é, e o que não é.** O simulador não tem servidor: tudo roda no
 * navegador de quem abre a página, e o código é público. Uma senha conferida no
 * navegador, portanto, **não é controle de acesso**. Quem souber abrir as
 * ferramentas do desenvolvedor pula a verificação, e os parâmetros continuam
 * legíveis no repositório de qualquer jeito — eles não são segredo, são a
 * tabela de crédito que o simulador usa à vista de todos.
 *
 * O que a senha faz, e faz bem: impede o acesso **acidental**. O gerente que
 * clicou no link errado, o visitante curioso, a aba aberta na máquina
 * compartilhada. E deixa explícito que a página não é para qualquer um, o que
 * tem valor próprio — publicar uma alteração de taxa por engano é dano real, e
 * é contra esse engano que ela protege.
 *
 * Para impedir alteração de fato seria preciso um servidor que autentique de
 * verdade, e essa é a mesma decisão que está pendente com o administrador de
 * rede sobre por onde publicar.
 *
 * **Como é guardada.** Nunca a senha: um resumo dela por PBKDF2-SHA-256, com
 * sal aleatório e 310 mil iterações. O arquivo publicado é público, e um resumo
 * simples ali seria adivinhado em minutos com uma lista de senhas comuns; com
 * PBKDF2 cada tentativa custa caro, e a conta deixa de valer a pena. Ainda
 * assim, senha curta ou óbvia se quebra — daí o mínimo exigido.
 */

const ITERACOES = 310000;
const TAMANHO_DO_SAL = 16;
const BITS = 256;

/** Mínimo que faz a força bruta valer o custo de tentar. */
export const TAMANHO_MINIMO = 12;

const paraHex = (buffer) => [...new Uint8Array(buffer)]
  .map((b) => b.toString(16).padStart(2, '0')).join('');

const deHex = (hex) => new Uint8Array(
  (hex.match(/.{2}/g) ?? []).map((par) => parseInt(par, 16)),
);

/**
 * `crypto.subtle` só existe em contexto seguro — https ou localhost.
 * Num contexto inseguro não há como conferir nada, e fingir que há seria pior
 * do que dizer que não há.
 */
export function disponivel() {
  return typeof crypto !== 'undefined' && crypto.subtle !== undefined;
}

async function resumir(senha, sal, iteracoes = ITERACOES) {
  const chave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes }, chave, BITS,
  );
  return paraHex(bits);
}

/** Descritor a guardar no conjunto de parâmetros. Não contém a senha. */
export async function definirSenha(senha) {
  if (String(senha).length < TAMANHO_MINIMO) {
    throw new Error(
      `A senha precisa ter ao menos ${TAMANHO_MINIMO} caracteres. O resumo dela fica num `
      + 'arquivo público, e uma senha curta é adivinhada mesmo com o cálculo caro.',
    );
  }
  const sal = crypto.getRandomValues(new Uint8Array(TAMANHO_DO_SAL));
  return {
    algoritmo: 'PBKDF2-SHA-256',
    iteracoes: ITERACOES,
    sal: paraHex(sal),
    resumo: await resumir(senha, sal),
    definidaEm: new Date().toISOString().slice(0, 10),
  };
}

/**
 * Confere a senha contra o descritor.
 *
 * A comparação é em tempo constante. O ganho aqui é pequeno — quem mede tempo
 * de resposta neste ponto já tem o arquivo inteiro em mãos —, mas comparar com
 * `===` seria escrever a versão errada de uma coisa que tem versão certa.
 */
export async function conferirSenha(senha, descritor) {
  if (!descritor) return true;
  const calculado = await resumir(
    senha, deHex(descritor.sal), descritor.iteracoes ?? ITERACOES,
  );
  const esperado = descritor.resumo ?? '';
  if (calculado.length !== esperado.length) return false;
  let diferenca = 0;
  for (let i = 0; i < calculado.length; i += 1) {
    diferenca |= calculado.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferenca === 0;
}

/** Há senha configurada neste conjunto? */
export function exigeSenha(parametros) {
  return Boolean(parametros?.acesso?.resumo);
}
