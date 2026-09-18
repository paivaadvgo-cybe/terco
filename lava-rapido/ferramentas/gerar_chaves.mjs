/**
 * Gera o par de chaves da licença.
 *
 *     node ferramentas/gerar_chaves.mjs /uma/pasta/segura
 *
 * A **chave pública** vai para dentro do aplicativo (`js/licenca/assinatura.js`)
 * e serve só para conferir assinaturas. A **chave privada** assina as licenças,
 * fica no computador de quem vende o aplicativo e **nunca** entra neste
 * repositório — que é público. Quem tiver a chave privada emite licenças
 * válidas para qualquer aparelho.
 *
 * Girar as chaves é trocar as duas de uma vez: a pública no arquivo do
 * aplicativo, a privada no gerador. Licenças emitidas com a chave antiga param
 * de valer, e os clientes ativos precisam de um arquivo novo — por isso só se
 * gira quando há motivo (a privada vazou, por exemplo).
 *
 * P-256 com ECDSA porque é o que `crypto.subtle` tem em todo navegador, e
 * porque a assinatura cabe em um arquivo de texto pequeno, que se manda por
 * WhatsApp sem virar anexo grande.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const destino = process.argv[2];
if (!destino) {
  console.error('uso: node ferramentas/gerar_chaves.mjs <pasta onde gravar a chave privada>');
  console.error('a pasta deve ficar FORA do repositório.');
  process.exit(1);
}

const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publica = await crypto.subtle.exportKey('jwk', par.publicKey);
const privada = await crypto.subtle.exportKey('jwk', par.privateKey);

const limpa = ({ kty, crv, x, y, d }) => (d ? { kty, crv, x, y, d } : { kty, crv, x, y });

fs.mkdirSync(destino, { recursive: true });
const arquivo = path.join(destino, 'lava-rapido-chave-privada.jwk.json');
fs.writeFileSync(arquivo, `${JSON.stringify(limpa(privada), null, 2)}\n`, { mode: 0o600 });

console.log('chave privada gravada em:', arquivo);
console.log('  → guarde fora do repositório, em lugar de onde você consiga recuperá-la.');
console.log('\nchave pública, para colar em js/licenca/assinatura.js:');
console.log(`export const CHAVE_PUBLICA = ${JSON.stringify(limpa(publica))};`);
