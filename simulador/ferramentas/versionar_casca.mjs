/**
 * Carimba na versão do cache o conteúdo da casca.
 *
 *     node ferramentas/versionar_casca.mjs          # confere
 *     node ferramentas/versionar_casca.mjs --gravar # atualiza sw.js
 *
 * Por que isto existe. O service worker serve os módulos **cache primeiro**:
 * enquanto o nome do cache não muda, o navegador continua entregando o que
 * guardou, e uma versão nova publicada não chega a quem já visitou o site. A
 * regra era «mudou arquivo da casca, muda a versão», e a regra dependia de eu
 * lembrar. Não lembrei: duas entregas seguidas alteraram estilos e módulos
 * mantendo `v1`, e quem tinha o simulador aberto continuou vendo a tela antiga.
 *
 * A versão passa a ser o resumo do próprio conteúdo. Alterar qualquer arquivo
 * guardado muda o resumo, e o teste em `tests/pwa.test.js` acusa a diferença
 * antes de a publicação sair. Deixa de ser disciplina e passa a ser aritmética.
 *
 * O `sw.js` não entra no resumo — ele não é guardado por si mesmo, e incluí-lo
 * criaria uma dependência circular: gravar a versão mudaria o arquivo que a
 * versão descreve.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arquivoSW = path.join(raiz, 'sw.js');
const PREFIXO = 'simulador-goiasfomento-';

/** Os caminhos listados na casca, na ordem em que estão no arquivo. */
export function cascaDe(textoDoSW) {
  const inicio = textoDoSW.indexOf('const CASCA = [');
  const fim = textoDoSW.indexOf('];', inicio);
  return [...textoDoSW.slice(inicio, fim).matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);
}

/**
 * Resumo do conteúdo da casca.
 *
 * Entra o caminho junto do conteúdo: renomear um arquivo sem mudar uma linha
 * dele também precisa gerar versão nova, porque o endereço guardado no cache
 * é outro. `'./'` é a própria pasta, e não um arquivo — vale pelo index.
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

/** A versão que o `sw.js` declara hoje. */
export function versaoDeclarada(textoDoSW) {
  return textoDoSW.match(/const VERSAO = '([^']+)'/)?.[1] ?? null;
}

/** A versão que o conteúdo atual exige. */
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
