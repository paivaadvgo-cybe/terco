/**
 * Serialização do conjunto de parâmetros vigente.
 *
 * O painel de administração e a ferramenta de linha de comando escrevem o
 * arquivo pela **mesma** função. Se fossem duas, o arquivo publicado pelo
 * painel poderia divergir em formatação do que está versionado, e cada
 * publicação produziria um diff sujo, cheio de mudanças que não são mudanças.
 *
 * Dois arquivos saem daqui, com o mesmo conteúdo:
 *
 *   · `js/data/parametros-vigentes.js` — módulo ES, que é o que o aplicativo
 *     carrega. Importar JSON exigiria atributos de importação, e um PWA que
 *     precisa abrir sem internet em qualquer navegador não deve depender
 *     disso.
 *   · `dados/PARAMETROS_VIGENTES.json` — o mesmo conteúdo em JSON, que é o que
 *     o painel reabre para continuar a edição, e o que um auditor lê sem
 *     executar nada.
 *
 * Sobre os números: `JSON.stringify` escreve a menor representação decimal que
 * volta ao mesmo double. Ou seja, o ciclo escrever→ler devolve exatamente o
 * mesmo bit — o que importa aqui, porque o motor não arredonda em etapa
 * alguma e uma taxa que perdesse o último dígito mudaria o cronograma inteiro.
 */

export const ARQUIVO_MODULO = 'js/data/parametros-vigentes.js';
export const ARQUIVO_JSON = 'dados/PARAMETROS_VIGENTES.json';

const CABECALHO = `/**
 * Parâmetros em vigor — escrito pelo painel de administração.
 *
 * Este é o único arquivo que a administração altera, e é o que o aplicativo
 * carrega. Não se edita à mão: abre-se \`admin.html\`, muda-se o que a norma
 * mudou, confere-se a lista de diferenças e publica-se.
 *
 * A base de comparação continua sendo \`parametros.js\`, extraído da planilha.
 * Ela não muda: é contra ela que os testes provam que o motor reproduz o
 * arquivo original. A diferença entre os dois arquivos é, exatamente, o que a
 * administração alterou desde então.
 */

export const VIGENTES = Object.freeze(
`;

const RODAPE = '\n);\n\nexport default VIGENTES;\n';

/** O conjunto como texto JSON, na formatação única do projeto. */
export function paraJSON(conjunto) {
  return `${JSON.stringify(conjunto, null, 2)}\n`;
}

/** O conjunto como módulo ES, que é o que o aplicativo importa. */
export function paraModulo(conjunto) {
  return CABECALHO + JSON.stringify(conjunto, null, 2) + RODAPE;
}

/**
 * Os dois arquivos a publicar, prontos para gravar ou baixar.
 * Devolve nome e conteúdo de cada um, sem tocar em disco nem no navegador —
 * quem chama decide o que fazer com eles.
 */
export function arquivosParaPublicar(conjunto) {
  return [
    { nome: ARQUIVO_MODULO, tipo: 'text/javascript', conteudo: paraModulo(conjunto) },
    { nome: ARQUIVO_JSON, tipo: 'application/json', conteudo: paraJSON(conjunto) },
  ];
}

/**
 * Lê de volta um conjunto salvo, vindo do arquivo JSON ou do módulo.
 *
 * Aceita o módulo porque é o arquivo que o administrador tem em mãos com mais
 * frequência — é o que está publicado —, e exigir que ele soubesse qual dos
 * dois abrir seria uma armadilha. Do módulo, aproveita-se só o literal entre
 * os parênteses: nada é executado.
 */
export function lerConjunto(texto) {
  const limpo = String(texto).trim();
  if (limpo.startsWith('{')) return JSON.parse(limpo);

  const abre = limpo.indexOf('Object.freeze(');
  const fecha = limpo.lastIndexOf(');');
  if (abre === -1 || fecha === -1 || fecha < abre) {
    throw new Error(
      'Arquivo não reconhecido. Esperava o JSON dos parâmetros ou o módulo '
      + 'parametros-vigentes.js.',
    );
  }
  return JSON.parse(limpo.slice(abre + 'Object.freeze('.length, fecha));
}

/** Metadados de uma publicação nova, a partir do conjunto que a originou. */
export function metadadosDePublicacao(anterior, { atoNormativo, vigenciaInicio, publicadoPor, observacoes }) {
  return {
    versao: vigenciaInicio,
    vigenciaInicio,
    atoNormativo: atoNormativo || '',
    publicadoPor: publicadoPor || '',
    publicadoEm: new Date().toISOString(),
    observacoes: observacoes || '',
    sucedeVersao: anterior?.metadados?.versao ?? anterior?.versao ?? null,
  };
}
