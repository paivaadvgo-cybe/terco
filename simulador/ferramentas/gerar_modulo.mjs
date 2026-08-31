/**
 * Refaz o módulo de parâmetros a partir do JSON publicado.
 *
 *     node ferramentas/gerar_modulo.mjs
 *
 * Os dois arquivos guardam o mesmo conteúdo: o módulo é o que o aplicativo
 * carrega, e o JSON é o que se lê para auditar. Quando só o JSON chega — o
 * navegador barra o segundo download automático de uma página, e quem
 * administra acaba com um arquivo só —, esta ferramenta reconstrói o outro em
 * vez de exigir que a alteração seja refeita.
 *
 * Confere antes de gravar: um JSON que não seja um conjunto de parâmetros
 * reconhecível é recusado, e não convertido em módulo defeituoso.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { paraModulo, ARQUIVO_JSON, ARQUIVO_MODULO } from '../js/admin/serializar.js';
import { validar } from '../js/admin/validar.js';
// O conjunto que está publicado hoje, ainda não sobrescrito, serve de
// referência: sem ele os defeitos herdados da planilha — as linhas sem taxa,
// vindas de células `#REF!` — apareceriam como impedimento e barrariam a
// conversão, quando não são desta alteração e nem dependem de quem administra.
import { VIGENTES } from '../js/data/parametros-vigentes.js';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const origem = path.join(raiz, ARQUIVO_JSON);
const destino = path.join(raiz, ARQUIVO_MODULO);

const conjunto = JSON.parse(fs.readFileSync(origem, 'utf8'));

for (const chave of ['tabelaDeEncargos', 'produtos', 'encargos', 'fatorKFGI', 'metadados']) {
  if (conjunto[chave] === undefined) {
    console.error(`${ARQUIVO_JSON} não parece um conjunto de parâmetros: falta "${chave}".`);
    process.exit(1);
  }
}

const { impedimentos } = validar(conjunto, { referencia: VIGENTES });
const doConteudo = impedimentos.filter((i) => !i.onde.startsWith('metadados.'));
if (doConteudo.length > 0) {
  console.error('O conjunto tem impedimentos de conteúdo e não será convertido:');
  for (const i of doConteudo) console.error(`  · ${i.onde}: ${i.mensagem}`);
  process.exit(1);
}

fs.writeFileSync(destino, paraModulo(conjunto), 'utf8');

const linhas = Object.values(conjunto.linhasPorAba ?? {}).reduce((n, a) => n + a.linhas.length, 0);
console.log(`${ARQUIVO_MODULO} refeito a partir de ${ARQUIVO_JSON}`);
console.log(`vigência ${conjunto.metadados.versao} · ${Object.keys(conjunto.produtos).length} produtos · ${linhas} linhas por aba`);
if (conjunto.metadados.atoNormativo) console.log(`ato normativo: ${conjunto.metadados.atoNormativo}`);
