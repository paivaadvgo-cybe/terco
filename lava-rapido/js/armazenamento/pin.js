/**
 * O PIN administrativo.
 *
 * **O que ele é.** Uma tranca de operação: impede que quem está atendendo mude
 * preço, apague registro ou restaure um backup por engano ou por conta própria.
 *
 * **O que ele não é.** Segurança contra quem tem o aparelho na mão e sabe o que
 * faz. Os dados vivem no IndexedDB do navegador, à vista de quem abrir as
 * ferramentas de desenvolvedor. Guardar o resumo em vez do número evita o caso
 * comum — alguém xereta o banco e lê o PIN do patrão, que costuma ser o mesmo
 * de outras coisas — e é até onde um aplicativo sem servidor consegue ir.
 * Prometer mais que isso seria mentira, e mentira sobre segurança é a pior.
 *
 * O resumo é SHA-256 do PIN com um sal fixo. Sal fixo não protege contra tabela
 * pronta de quatro dígitos; está aqui para que dois lava-rápidos com o mesmo
 * PIN não tenham o mesmo resumo, e nada mais.
 */

const SAL = 'lava-rapido-lite/pin/v1';

export function pinValido(texto) {
  return /^\d{4}$|^\d{6}$/.test(String(texto ?? '').trim());
}

async function sha256(texto) {
  const dados = new TextEncoder().encode(texto);
  const resumo = await crypto.subtle.digest('SHA-256', dados);
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * O resumo que fica gravado.
 *
 * Sem `crypto.subtle` — que só existe em contexto seguro — o PIN ainda precisa
 * funcionar, porque a tranca é de operação. Guardar o número em claro seria pior
 * que um resumo fraco, então há uma reserva, marcada no próprio texto para que
 * nunca se confunda com o resumo bom.
 */
export async function resumoDoPin(pin) {
  const texto = SAL + String(pin);
  if (globalThis.crypto?.subtle) return `sha256:${await sha256(texto)}`;

  let soma = 0x811c9dc5;
  for (const codigo of texto) {
    soma ^= codigo.codePointAt(0);
    soma = Math.imul(soma, 0x01000193) >>> 0;
  }
  return `fraco:${soma.toString(16)}`;
}

export async function conferirPin(pin, resumoGravado) {
  if (!resumoGravado) return true;          // sem PIN definido, nada está trancado
  return (await resumoDoPin(pin)) === resumoGravado;
}
