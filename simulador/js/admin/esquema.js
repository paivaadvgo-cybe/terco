/**
 * O que é administrável, e o que cada campo significa.
 *
 * Esta é a **única** lista de campos do painel: o formulário é gerado a partir
 * dela, a validação percorre ela, e a lista de diferenças a consulta para
 * saber como mostrar cada valor. Duas listas divergiriam em silêncio — um
 * campo novo passaria a aparecer na tela sem ser validado, que é exatamente o
 * caminho de um parâmetro publicado errado.
 *
 * Sobre o que **não** está aqui: as regras de comportamento — sistema de
 * amortização, tratamento da carência, convenção da taxa, qual base a
 * amortização divide — não são parâmetros, são a regra de cada família de
 * produto, lida da planilha. Mudá-las não é preencher um campo; é alterar o
 * que a linha de crédito é. Ficam no código, e com teste.
 *
 * Duas coisas que o painel precisa deixar visíveis, porque não são óbvias:
 *
 *   1. Dez dos onze produtos leem as linhas da `tabelaDeEncargos`. Só o
 *      `Produtor Empreendedor` lê da sua aba. Os demais blocos de `linhasPorAba`
 *      são registro de auditoria do que cada aba da planilha dizia — editá-los
 *      não muda cálculo nenhum, e o painel os mostra como somente-leitura em
 *      vez de fingir que são editáveis.
 *   2. Taxa carrega unidade. Trocar «anual» por «mensal» num campo não
 *      converte nada: muda como o motor interpreta o mesmo número, e um FCO
 *      lido como mensal cobraria doze vezes mais. Por isso a unidade é um
 *      campo próprio, e a lista de diferenças a destaca.
 */

import { lerPercentual, lerValor } from './../ui/formatar.js';

/* ── tipos de campo ───────────────────────────────────────────────────────
 *
 * Cada tipo sabe três coisas: como escrever o valor guardado num campo de
 * formulário, como ler de volta o que a pessoa digitou, e como descrevê-lo
 * numa frase. É o que permite o formulário e a lista de diferenças serem
 * genéricos.
 */

/**
 * Desloca a vírgula na notação, que é como se converte sem introduzir ruído.
 *
 * O cuidado com o expoente não é teórico: um número pequeno o bastante já
 * chega em notação exponencial — `String(1e-11)` é "1e-11" —, e grudar "e2"
 * no fim daquilo produz "1e-11e2", que é NaN. Somar ao expoente que já existe
 * resolve, e evita que um valor de arquivo mal preenchido apareça na tela como
 * NaN em vez de como número.
 */
function deslocar(v, casas) {
  const [mantissa, expoente] = String(v).split('e');
  return Number(`${mantissa}e${(expoente === undefined ? 0 : Number(expoente)) + casas}`);
}

/** Decimal em pontos percentuais, sem o ruído de multiplicar por cem. */
function emPontos(v) {
  return String(deslocar(v, 2));
}

/**
 * O mesmo, encurtado para caber num campo de formulário.
 *
 * Algumas taxas da planilha são resultado de fórmula e chegam com os dezessete
 * dígitos de um double: 2,395144289206206%. O número está certo, mas num campo
 * de taxa ele parece defeito, e o administrador que "arruma" aquilo acaba
 * publicando uma alteração que ninguém pediu.
 *
 * Seis casas em pontos percentuais são 10⁻⁸ em decimal — muito abaixo de
 * qualquer diferença que uma norma expresse. E como campo não tocado preserva
 * o valor guardado, encurtar aqui não perde precisão nenhuma: o número exato
 * continua no arquivo, e só é substituído se alguém digitar por cima.
 *
 * A exceção existe para não mentir: se o arredondamento zerar um valor que não
 * é zero, mostra-se o número inteiro, por mais feio que fique.
 */
function emPontosCurto(v) {
  const curto = Number(deslocar(v, 2).toFixed(6));
  if (curto === 0 && v !== 0) return emPontos(v);
  return String(curto);
}

export const TIPOS = Object.freeze({
  texto: {
    entrada: 'text',
    exibir: (v) => (v ?? ''),
    ler: (t) => String(t).trim(),
    descrever: (v) => `"${v}"`,
  },
  /*
   * Inteiro e dinheiro são campos de texto, e não `type="number"`.
   *
   * Não é preferência: um `input[type=number]` devolve o valor com ponto
   * decimal, e o leitor de números deste projeto lê no formato brasileiro, em
   * que o ponto separa milhar. Os dois juntos transformam "300000.5" em
   * 300.0005 — um limite de crédito cem vezes maior, gravado sem nada
   * indicar. Campo de texto, formato brasileiro dos dois lados, e o
   * descompasso deixa de existir.
   */
  inteiro: {
    entrada: 'text',
    modoDeEntrada: 'numeric',
    exibir: (v) => (v === null || v === undefined ? '' : String(v)),
    ler: (t) => {
      const n = lerValor(t);
      return Number.isFinite(n) ? Math.round(n) : NaN;
    },
    descrever: (v) => String(v),
  },
  dinheiro: {
    entrada: 'text',
    modoDeEntrada: 'decimal',
    exibir: (v) => (v === null || v === undefined ? ''
      : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
    ler: (t) => lerValor(t),
    descrever: (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  },
  // Guardado em decimal, digitado em pontos percentuais: 0,1375 aparece como
  // "13,75". É como a norma escreve, e como a planilha imprime.
  //
  // A ida e a volta deslocam a vírgula na notação, nunca multiplicando ou
  // dividindo por cem: `0.1375 * 100` dá 13,750000000000002, e o campo
  // mostraria treze dígitos de ruído para quem digitou "13,75". `0.1375e2` dá
  // 13,75 exato. Vale para os dois sentidos, e é o que faz abrir o painel e
  // publicar sem tocar em nada devolver o arquivo idêntico.
  percentual: {
    entrada: 'text',
    modoDeEntrada: 'decimal',
    exibir: (v) => (v === null || v === undefined ? '' : emPontosCurto(v).replace('.', ',')),
    ler: (t) => lerPercentual(t),
    // A descrição, ao contrário do campo, não encurta: é o que a lista de
    // diferenças mostra, e ali esconder dígitos faria duas taxas distintas
    // aparecerem como iguais.
    descrever: (v) => `${emPontos(v).replace('.', ',')}%`,
  },
  // Número puro que multiplica: o 1,015 da TAC de Giro Puro, o 1,03 do IOF
  // financiado, o multiplicador 3 da renda para aval.
  fator: {
    entrada: 'text',
    modoDeEntrada: 'decimal',
    exibir: (v) => (v === null || v === undefined ? '' : String(v).replace('.', ',')),
    ler: (t) => lerValor(t),
    descrever: (v) => String(v).replace('.', ','),
  },
  unidade: {
    entrada: 'select',
    opcoes: ['mensal', 'anual'],
    exibir: (v) => v ?? '',
    ler: (t) => String(t),
    descrever: (v) => `ao ${v === 'mensal' ? 'mês' : 'ano'}`,
  },
  /*
   * Taxa é composta: valor e unidade juntos, e nunca um sem o outro. Não se
   * desenha como campo único — o painel abre os dois, porque a unidade muda
   * como o valor é lido, e um número de taxa sem a unidade ao lado é um número
   * que não quer dizer nada.
   */
  taxa: {
    composto: true,
    partes: ['valor', 'unidade'],
    exibir: (t) => (t ? `${emPontosCurto(t.valor)}% ${t.unidade}` : ''),
    ler: () => { throw new Error('Taxa é composta: leia valor e unidade separadamente.'); },
    descrever: (t) => (t ? `${emPontos(t.valor).replace('.', ',')}% ao ${t.unidade === 'anual' ? 'ano' : 'mês'}` : '(vazio)'),
  },
  data: {
    entrada: 'date',
    exibir: (v) => (v ?? ''),
    ler: (t) => String(t),
    descrever: (v) => (v ? v.split('-').reverse().join('/') : '—'),
  },
});

/* ── campos de uma linha de crédito ──────────────────────────────────────── */

export const CAMPOS_DA_LINHA = Object.freeze([
  {
    chave: 'nome', rotulo: 'Nome da linha', tipo: 'texto', obrigatorio: true,
    ajuda: 'Como a linha aparece para quem simula. É também a chave que identifica '
      + 'a linha; renomear equivale a excluir uma e criar outra.',
  },
  {
    chave: 'prazoMaximo', rotulo: 'Prazo máximo', tipo: 'inteiro', unidade: 'meses',
    obrigatorio: true, min: 1, max: 480,
    ajuda: 'Prazo total, contando a carência. Simulações acima dele são recusadas.',
  },
  {
    chave: 'carenciaMaxima', rotulo: 'Carência máxima', tipo: 'inteiro', unidade: 'meses',
    obrigatorio: true, min: 0, max: 120,
    ajuda: 'Meses sem amortização no início. Precisa caber dentro do prazo máximo.',
  },
  {
    chave: 'limite', rotulo: 'Limite de crédito', tipo: 'dinheiro', obrigatorio: true, min: 0,
    ajuda: 'Maior valor financiável nesta linha.',
  },
  {
    chave: 'valorMinimo', rotulo: 'Valor mínimo', tipo: 'dinheiro', opcional: true, min: 0,
    ajuda: 'Menor valor admitido, onde a linha tem piso. Vazio significa sem piso. '
      + 'Hoje só as linhas FINEP têm.',
  },
  {
    chave: 'taxaCheia', rotulo: 'Taxa cheia', tipo: 'taxa', obrigatorio: true,
    ajuda: 'A taxa sem bônus de adimplência. É a que vale quando o tomador perde o bônus.',
  },
  {
    chave: 'taxaBonus', rotulo: 'Taxa com bônus', tipo: 'taxa', opcional: true,
    ajuda: 'Taxa com o bônus de adimplência aplicado. Vazio significa que a linha não tem bônus.',
  },
  {
    chave: 'taxaCG1', rotulo: 'Taxa — classe de garantia 1', tipo: 'taxa', opcional: true,
    ajuda: 'Onde a taxa varia conforme a garantia oferecida. Vazio usa a taxa com bônus.',
  },
  {
    chave: 'taxaCG2', rotulo: 'Taxa — classe de garantia 2', tipo: 'taxa', opcional: true,
    ajuda: 'Idem, para a segunda classe de garantia.',
  },
]);

/* ── blocos de encargo ───────────────────────────────────────────────────── */

export const CAMPOS_IOF = Object.freeze([
  {
    chave: 'aliquotaAdicional', rotulo: 'Alíquota adicional', tipo: 'percentual',
    min: 0, max: 0.1,
    ajuda: 'Incide uma vez sobre o valor solicitado, além do IOF diário. Hoje 0,38%.',
  },
  {
    chave: 'aliquotaDiariaNormal', rotulo: 'Alíquota diária', tipo: 'percentual',
    min: 0, max: 0.01, casasNaExibicao: 6,
    ajuda: 'Por dia corrido, sobre a amortização de cada parcela, limitada aos dias abaixo.',
  },
  {
    chave: 'aliquotaDiariaSimples', rotulo: 'Alíquota diária reduzida', tipo: 'percentual',
    min: 0, max: 0.01, casasNaExibicao: 6,
    ajuda: 'Alíquota das operações até o teto abaixo — hoje a de pessoa física em '
      + 'operações de pequeno valor.',
  },
  {
    chave: 'limiteDeDias', rotulo: 'Limite de dias', tipo: 'inteiro', min: 1, max: 3650,
    ajuda: 'Teto de dias cobrados por parcela, mesmo quando o vencimento é mais distante.',
  },
  {
    chave: 'tetoParaAliquotaSimples', rotulo: 'Teto para a alíquota reduzida', tipo: 'dinheiro', min: 0,
    ajuda: 'Até este valor solicitado vale a alíquota reduzida.',
  },
  {
    chave: 'fatorFinanciamento', rotulo: 'Fator do IOF financiado', tipo: 'fator', min: 1, max: 2,
    ajuda: 'Multiplica o IOF quando ele é financiado junto com a operação. Hoje 1,03.',
  },
]);

export const CAMPOS_DA_FAIXA_DE_TAC = Object.freeze([
  {
    chave: 'ate', rotulo: 'Até', tipo: 'dinheiro', opcional: true, min: 0,
    ajuda: 'Limite superior da faixa, inclusive. Vazio na última faixa, que não tem teto.',
  },
  {
    chave: 'valor', rotulo: 'Valor fixo', tipo: 'dinheiro', opcional: true, min: 0,
    ajuda: 'Só nas faixas do tipo «fixo».',
  },
  {
    chave: 'fixo', rotulo: 'Parcela fixa', tipo: 'dinheiro', opcional: true, min: 0,
    ajuda: 'Só nas faixas do tipo «fixo mais percentual».',
  },
  {
    chave: 'taxa', rotulo: 'Percentual', tipo: 'percentual', opcional: true, min: 0, max: 1,
    ajuda: 'Aplicado sobre o valor solicitado.',
  },
  {
    chave: 'teto', rotulo: 'Teto', tipo: 'dinheiro', opcional: true, min: 0,
    ajuda: 'Valor máximo desta faixa. Vazio significa sem teto.',
  },
]);

export const CAMPOS_SIMPLES = Object.freeze({
  'encargos.tac.fatorGiroPuro': {
    rotulo: 'Fator da TAC em Linhas Giro Puro', tipo: 'fator', min: 1, max: 2,
    ajuda: 'A anomalia registrada em ABERTO-02: só esta aba multiplica a base da TAC '
      + 'por 1,015, e o teto de R$ 420 acaba testado sobre uma base e cobrado sobre outra.',
  },
  'encargos.fampe.fator': {
    rotulo: 'Fator do FAMPE', tipo: 'fator', min: 0, max: 1,
    ajuda: 'Encargo = valor × percentual garantido × fator × prazo. Hoje 0,001.',
  },
  'encargos.fundeq.fator': {
    rotulo: 'Fator do FUNDEQ', tipo: 'fator', min: 0, max: 1,
    ajuda: 'Mesma fórmula do FAMPE. A planilha não distingue os dois; ficam separados '
      + 'aqui para que um possa mudar sem o outro.',
  },
  'encargos.aval.multiplicador': {
    rotulo: 'Multiplicador da renda para aval', tipo: 'fator', min: 1, max: 20,
    ajuda: 'Renda exigida do avalista = maior prestação × este número.',
  },
  'encargos.aval.pisoDeRenda': {
    rotulo: 'Piso da renda para aval', tipo: 'dinheiro', min: 0,
    ajuda: 'Renda mínima exigida, quando o cálculo acima fica abaixo dela.',
  },
  'encargos.alienacao.cobertura': {
    rotulo: 'Cobertura da alienação de imóvel', tipo: 'fator', min: 1, max: 5,
    ajuda: 'Quantas vezes o valor a garantir o imóvel precisa cobrir. Hoje 1,5.',
  },
  'encargos.alienacao.percentualMaximo': {
    rotulo: 'Percentual máximo do imóvel', tipo: 'percentual', min: 0.01, max: 1,
    ajuda: 'Fração do valor do imóvel que pode ser comprometida. Hoje 70%.',
  },
});

/* ── indexadores ─────────────────────────────────────────────────────────── */

export const CAMPOS_DO_INDEXADOR = Object.freeze([
  {
    chave: 'referencia.valor', rotulo: 'Valor de referência', tipo: 'percentual',
    opcional: true, min: 0, max: 1,
    ajuda: 'Aparece como sugestão no formulário, e nunca é aplicado sozinho: quem simula '
      + 'informa o valor. Vazio significa que não há referência a sugerir — é o caso do INPC, '
      + 'que a planilha nomeia sem trazer número.',
  },
  {
    chave: 'referencia.unidade', rotulo: 'Unidade', tipo: 'unidade', opcional: true,
    ajuda: 'Em que período o valor acima está expresso.',
  },
  {
    chave: 'referencia.vigencia', rotulo: 'Vigência da referência', tipo: 'data', opcional: true,
    ajuda: 'Data a que o valor de referência se refere. É o que permite ver que a sugestão envelheceu.',
  },
]);

/* ── produtos ─────────────────────────────────────────────────────────────
 *
 * Um produto não é código: é uma combinação de comportamentos que o motor já
 * implementa. Cada campo abaixo tem duas ou três opções, e a lista delas é a
 * lista do que existe — não há como escolher um comportamento que o motor não
 * saiba executar, porque as opções saem daqui e nada mais é aceito.
 *
 * O que exige desenvolvimento é um comportamento **novo**: um sistema de
 * amortização que não seja SAC nem PRICE, uma convenção de taxa que não seja
 * nenhuma das duas, um encargo que não exista. Compor um produto novo com o
 * que já existe, não.
 *
 * Estes campos mudam o cálculo de todas as linhas da família de uma vez, e por
 * isso vêm marcados como estruturais: o painel exige conferência no teste
 * antes de deixar publicar uma alteração neles.
 */

export const ESCOLHAS_DE_COMPORTAMENTO = Object.freeze({
  convencaoTaxa: [
    { valor: 'mensalComposta', texto: 'Mensal composta — (1+i)^(1/12) − 1',
      ajuda: 'A conversão do FCO e das famílias mensais.' },
    { valor: 'diasUteis', texto: 'Dias úteis — (1+i)^(22/252) − 1',
      ajuda: 'A convenção do Fungetur e do FINEP. Difere da mensal em cerca de 4,8%.' },
  ],
  baseAmortizacao: [
    { valor: 'valorFinanciado', texto: 'Valor financiado',
      ajuda: 'A amortização divide o valor com encargos embutidos. O saldo fecha em zero.' },
    { valor: 'valorSolicitado', texto: 'Valor solicitado',
      ajuda: 'Divide o valor pedido, sem os encargos financiados.' },
    { valor: 'planilha', texto: 'Como a planilha faz — troca na parcela 13',
      ajuda: 'Reproduz o ABERTO-07: as doze primeiras parcelas dividem o valor solicitado e '
        + 'as seguintes o financiado. O saldo não fecha, e sobra resíduo ao fim.' },
  ],
  tratamentoCarencia: [
    { valor: 'pagos', texto: 'Juros pagos na carência',
      ajuda: 'O saldo fica parado e os juros são cobrados mês a mês.' },
    { valor: 'capitalizados', texto: 'Juros capitalizados na carência',
      ajuda: 'Os juros entram no saldo, que cresce durante a carência.' },
  ],
  varianteTAC: [
    { valor: 'padrao', texto: 'Escada padrão',
      ajuda: 'A forma que doze das treze células da planilha aplicam.' },
    { valor: 'giroPuro', texto: 'Variante de Linhas Giro Puro',
      ajuda: 'Reproduz o ABERTO-02: o fator 1,015 entra de forma irregular, e o teto de '
        + 'R$ 420 é testado sobre uma base e cobrado sobre outra.' },
  ],
  tipoDeBonus: [
    { valor: 'nenhum', texto: 'Sem bônus de adimplência' },
    { valor: 'fator', texto: 'Fator sobre a taxa cheia',
      ajuda: 'A taxa com bônus é a cheia multiplicada por um fator — 0,77 em treze linhas.' },
    { valor: 'tabelado', texto: 'Taxa com bônus vem da tabela',
      ajuda: 'Cada linha traz a sua própria taxa com bônus, sem fator.' },
  ],
  indexador: [
    { valor: '', texto: 'Sem indexador' },
    { valor: 'SELIC', texto: 'Selic' },
    { valor: 'TR', texto: 'TR' },
    { valor: 'INPC', texto: 'INPC' },
  ],
});

export const CAMPOS_DO_PRODUTO = Object.freeze([
  {
    chave: 'nome', rotulo: 'Nome do produto', tipo: 'texto', obrigatorio: true,
    ajuda: 'Como a família aparece para quem simula.',
  },
  {
    chave: 'abaDeOrigem', rotulo: 'Aba de origem', tipo: 'texto', opcional: true,
    ajuda: 'De que aba da planilha esta família veio. Serve de registro; não afeta o cálculo.',
  },
]);

/** Os campos que mudam o cálculo de todas as linhas da família de uma vez. */
export const CAMPOS_ESTRUTURAIS_DO_PRODUTO = Object.freeze([
  {
    chave: 'regras.convencaoTaxa', rotulo: 'Convenção da taxa', escolhas: 'convencaoTaxa',
    ajuda: 'Como a taxa informada é convertida para o período de cálculo.',
  },
  {
    chave: 'regras.baseAmortizacao', rotulo: 'Base da amortização', escolhas: 'baseAmortizacao',
    ajuda: 'Que valor a amortização divide ao longo do cronograma.',
  },
  {
    chave: 'regras.tratamentoCarencia', rotulo: 'Carência', escolhas: 'tratamentoCarencia',
    ajuda: 'O que acontece com os juros durante a carência.',
  },
  {
    chave: 'regras.varianteTAC', rotulo: 'Variante da TAC', escolhas: 'varianteTAC',
    ajuda: 'Qual forma de cobrança da TAC esta família usa.',
  },
  {
    chave: 'regras.bonus.tipo', rotulo: 'Bônus de adimplência', escolhas: 'tipoDeBonus',
    ajuda: 'De onde sai a taxa com bônus.',
  },
  {
    chave: 'regras.indexador', rotulo: 'Indexador', escolhas: 'indexador',
    ajuda: 'Segundo componente de juros, cobrado à parte. A planilha não soma o indexador '
      + 'à taxa base — ele rende separadamente e entra na base do juro fixo do mesmo período.',
  },
]);

/* ── metadados da publicação ─────────────────────────────────────────────── */

export const CAMPOS_DA_PUBLICACAO = Object.freeze([
  {
    chave: 'vigenciaInicio', rotulo: 'Vigência a partir de', tipo: 'data', obrigatorio: true,
    ajuda: 'Data em que os parâmetros novos passam a valer. Também identifica a versão, '
      + 'e é o que cada simulação guarda para poder ser reproduzida depois.',
  },
  {
    chave: 'atoNormativo', rotulo: 'Ato normativo', tipo: 'texto', obrigatorio: true,
    ajuda: 'A norma que determinou a alteração — resolução, portaria, decisão de diretoria. '
      + 'Sem ela a simulação não tem como dizer sob que regra foi feita.',
  },
  {
    chave: 'publicadoPor', rotulo: 'Publicado por', tipo: 'texto', obrigatorio: true,
    ajuda: 'Quem respondeu pela alteração.',
  },
  {
    chave: 'observacoes', rotulo: 'Observações', tipo: 'texto', opcional: true, varias: true,
    ajuda: 'O que mais precise ficar registrado junto da versão.',
  },
]);

/* ── caminhos ─────────────────────────────────────────────────────────────
 *
 * Um campo é endereçado por um caminho como
 * `tabelaDeEncargos.2.linhas.0.taxaCheia.valor`. Ler e escrever por caminho é
 * o que permite que a validação e a lista de diferenças percorram o documento
 * inteiro sem conhecer a forma dele.
 */

export function lerCaminho(objeto, caminho) {
  return String(caminho).split('.').reduce(
    (atual, parte) => (atual === null || atual === undefined ? undefined : atual[parte]),
    objeto,
  );
}

export function escreverCaminho(objeto, caminho, valor) {
  const partes = String(caminho).split('.');
  const ultima = partes.pop();
  let atual = objeto;
  for (const parte of partes) {
    if (atual[parte] === null || atual[parte] === undefined) {
      atual[parte] = Number.isInteger(Number(parte)) ? [] : {};
    }
    atual = atual[parte];
  }
  atual[ultima] = valor;
  return objeto;
}

/** O tipo de um campo, para quem só tem o descritor. */
export function tipoDe(campo) {
  return TIPOS[campo.tipo] ?? TIPOS.texto;
}

/**
 * Lê o que a pessoa digitou — mas devolve o valor guardado, intacto, quando o
 * texto continua sendo o que o campo mostrava.
 *
 * Existe por um motivo aritmético. Algumas taxas da planilha são resultado de
 * fórmula, e trazem os dezessete dígitos de um double, como
 * 0,023951442892062056. Mostrá-la em pontos percentuais e lê-la de volta não
 * fecha: 2,395144289206206 é o mais próximo que o formato decimal alcança, e
 * relê como um double vizinho. A diferença é de 10⁻¹⁸, mas o motor não
 * arredonda em etapa alguma, e um vizinho publicado sem ninguém ter pedido é
 * uma alteração que não consta de norma nenhuma.
 *
 * Campo não tocado, valor preservado. E a lista de diferenças, por
 * consequência, só mostra o que de fato mudou.
 */
export function lerCampo(campo, texto, valorAtual) {
  const tipo = tipoDe(campo);
  if (texto === tipo.exibir(valorAtual)) return valorAtual;
  const cru = String(texto).trim();
  if (cru === '') return (campo.opcional || !campo.obrigatorio) ? null : NaN;
  return tipo.ler(cru);
}

/**
 * Onde ficam as taxas de uma linha.
 *
 * A maioria as guarda direto. As linhas do FCO, não: elas trazem dois jogos
 * completos, `municipioPrioritario` e `municipioNaoPrioritario`, porque o FCO
 * cobra menos em município prioritário — 8,8992% contra 9,799% ao ano no FCO
 * MEI. Tratar as duas formas como uma só faria o painel esconder metade das
 * taxas do FCO, e a validação acusaria como «sem taxa» a linha que tem duas.
 */
export const BLOCOS_DE_MUNICIPIO = Object.freeze([
  { chave: 'municipioPrioritario', rotulo: 'município prioritário' },
  { chave: 'municipioNaoPrioritario', rotulo: 'demais municípios' },
]);

export function blocosDeTaxa(linha) {
  const porMunicipio = BLOCOS_DE_MUNICIPIO
    .filter((b) => linha[b.chave] !== null && linha[b.chave] !== undefined)
    .map((b) => ({ rotulo: b.rotulo, caminho: b.chave, alvo: linha[b.chave] }));
  return porMunicipio.length > 0
    ? porMunicipio
    : [{ rotulo: '', caminho: '', alvo: linha }];
}

/**
 * As abas de `linhasPorAba` que realmente alimentam algum produto.
 *
 * As demais são registro do que cada aba da planilha dizia. Aparecem no painel
 * como somente-leitura: um campo editável que não muda cálculo nenhum é pior
 * do que campo nenhum.
 */
export const ABAS_QUE_ALIMENTAM_PRODUTO = Object.freeze(['Produtor Empreendedor']);
