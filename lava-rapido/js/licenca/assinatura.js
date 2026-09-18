/**
 * A assinatura da licença.
 *
 * O aplicativo carrega **apenas a chave pública**, que confere assinaturas e
 * não emite nenhuma. A chave privada vive no computador de quem vende o
 * aplicativo, dentro do gerador de licenças
 * (`ferramentas/gerador-de-licencas.html`), e nunca esteve neste repositório.
 * Publicar a chave pública não enfraquece nada: com ela dá para verificar uma
 * licença, não para criar uma.
 *
 * **O que isto protege, e o que não protege.** Impede que alguém escreva um
 * arquivo de licença à mão e o importe — a assinatura não fecharia. Não impede
 * que alguém edite o JavaScript servido e tire a verificação inteira; num
 * aplicativo que roda no navegador do cliente, nada impede. A licença é um
 * combinado comercial com uma porta trancada, não um cofre.
 *
 * O texto assinado é o JSON **canônico** da licença: chaves em ordem
 * alfabética, sem espaços. Sem isso, o mesmo conteúdo com as chaves em outra
 * ordem geraria outra assinatura, e uma licença válida seria recusada em um
 * navegador e aceita em outro — um defeito que só apareceria no aparelho do
 * cliente.
 */

/** Chave pública do Lava-Rápido Lite. Pareada com o gerador entregue ao desenvolvedor. */
export const CHAVE_PUBLICA = { kty: 'EC', crv: 'P-256', x: 'pFLxRkKzaAJF7zWfc1AbCIVo08KIugLmSds18YFLg34', y: 'zLKT-SjxlfZabOAoOV9YdNsb-BNqM3-SzL7iQselcq0' };

const codificador = new TextEncoder();
const decodificador = new TextDecoder();

export function paraBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

export function deBase64(texto) {
  return Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));
}

/** JSON com as chaves sempre na mesma ordem — é isto que se assina. */
export function canonico(valor) {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  if (valor && typeof valor === 'object') {
    return `{${Object.keys(valor).sort().map((k) => `${JSON.stringify(k)}:${canonico(valor[k])}`).join(',')}}`;
  }
  return JSON.stringify(valor);
}

let chaveCarregada = null;
async function importarChave(jwk) {
  if (jwk === CHAVE_PUBLICA && chaveCarregada) return chaveCarregada;
  const chave = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  if (jwk === CHAVE_PUBLICA) chaveCarregada = chave;
  return chave;
}

/**
 * Confere o envelope `{ app, kind, licenca, sig }`.
 *
 * Devolve `false` para qualquer defeito — arquivo trocado, assinatura de outro
 * produto, campo faltando. Nunca lança: um arquivo estranho escolhido por
 * engano não pode derrubar a tela.
 */
export async function envelopeConfere(envelope, chavePublica = CHAVE_PUBLICA) {
  try {
    if (!envelope || envelope.app !== 'LavaRapidoLite' || envelope.tipo !== 'licenca') return false;
    if (!envelope.licenca || !envelope.sig) return false;
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      await importarChave(chavePublica),
      deBase64(envelope.sig),
      codificador.encode(canonico(envelope.licenca)),
    );
  } catch {
    return false;
  }
}

/** Assina uma licença. Só o gerador usa — o aplicativo não tem chave privada. */
export async function assinarLicenca(licenca, chavePrivadaJwk) {
  const chave = await crypto.subtle.importKey(
    'jwk', chavePrivadaJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const assinatura = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, chave, codificador.encode(canonico(licenca)),
  );
  return { app: 'LavaRapidoLite', tipo: 'licenca', versao: 1, licenca, sig: paraBase64(assinatura) };
}

/** O arquivo `.lava` é o envelope em base64 — texto curto, que cabe num WhatsApp. */
export function escreverArquivo(envelope) {
  return paraBase64(codificador.encode(JSON.stringify(envelope)));
}

export function lerArquivo(texto) {
  const limpo = String(texto ?? '').trim();
  try {
    return JSON.parse(limpo);
  } catch { /* não é JSON puro; tenta base64 */ }
  try {
    return JSON.parse(decodificador.decode(deBase64(limpo)));
  } catch {
    return null;
  }
}
