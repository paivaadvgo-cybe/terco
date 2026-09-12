/**
 * Carimba na versão do cache o conteúdo da casca.
 *
 *     node ferramentas/versionar_casca.mjs          # confere
 *     node ferramentas/versionar_casca.mjs --gravar # atualiza sw.js
 *
 * O service worker serve os módulos **cache primeiro**: enquanto o nome do
 * cache não muda, o navegador continua entregando o que guardou, e uma versão
 * nova não chega a quem já abriu o aplicativo. A regra «mudou arquivo, muda a
 * versão» depende de alguém lembrar — e lembrar falha calado, porque nada
 * quebra: a tela só não muda.
 *
 * Aqui a versão é o resumo do próprio conteúdo. Alterar qualquer arquivo
 * guardado muda o resumo, e `tests/pwa.test.js` acusa a diferença antes da
 * publicação. Deixa de ser disciplina e passa a ser aritmética.
 *
 * O `sw.js` não entra no resumo: ele não é guardado por si mesmo, e incluí-lo
 * criaria uma dependência circular — gravar a versão mudaria o arquivo que a
 * versão descreve.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arquivoSW = path.join(raiz, 'sw.js');
const PREFIXO = 'lava-rapido-lite-';

/** Os caminhos listados na casca, na ordem em que estão no arquivo. */
export function cascaDe(textoDoSW) {
  const inicio = textoDoSW.indexOf('const CASCA = [');
  const fim = textoDoSW.indexOf('];', inicio);
  return [...textoDoSW.slice(inicio, fim).matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);
}

/**
 * Resumo do conteúdo da casca.
 *
 * O caminho entra junto do conteúdo: renomear um arquivo sem mudar uma linha
 * dele também precisa gerar versão nova, porque o endereço guardado é outro.
 * `'./'` é a pasta, não um arquivo — vale pelo `index.html`.
 */
export function resumoDaCasca(raizDoProjeto, casca) {
  const soma = crypto.createHash('sha256');
  for (const caminho of casca) {
    if (caminho === './') continue;
    soma.update(caminho);
    soma.update(fs.readFileSync(path.join(raizDoProjeto, caminho)));
  }
  return soma.digest('hex').slice(0, 12);
}

export function versaoDeclarada(textoDoSW) {
  return textoDoSW.match(/const VERSAO = '([^']+)'/)?.[1] ?? null;
}

export function versaoEsperada(raizDoProjeto, textoDoSW) {
  return PREFIXO + resumoDaCasca(raizDoProjeto, cascaDe(textoDoSW));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const texto = fs.readFileSync(arquivoSW, 'utf8');
  const declarada = versaoDeclarada(texto);
  const esperada = versaoEsperada(raiz, texto);

  if (declarada === esperada) {
    console.log(`em dia: ${declarada}`);
  } else if (process.argv.includes('--gravar')) {
    fs.writeFileSync(arquivoSW, texto.replace(
      `const VERSAO = '${declarada}'`, `const VERSAO = '${esperada}'`,
    ), 'utf8');
    console.log(`${declarada} → ${esperada}`);
  } else {
    console.error(`a casca mudou e a versão não: declarada ${declarada}, esperada ${esperada}`);
    console.error('rode com --gravar para atualizar.');
    process.exit(1);
  }
}
