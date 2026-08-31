/**
 * Conferência do conjunto antes de publicar.
 *
 * Duas severidades, e a distinção entre elas é o ponto do arquivo:
 *
 *   · **impedimento** — o conjunto produziria erro, ou um número sem regra por
 *     trás. Bloqueia a publicação. Um prazo zero, uma taxa que não é número,
 *     duas linhas com o mesmo nome no mesmo grupo: nada disso tem leitura
 *     possível, e publicar seria pôr o simulador para calcular sobre lixo.
 *
 *   · **alerta** — o valor é aceitável mas destoa. Uma taxa mensal de 15%, uma
 *     carência maior que o prazo, um indexador com referência de dois anos
 *     atrás. Não bloqueia: quem administra pode ter razão, e o simulador
 *     precisa continuar reproduzindo o que a instituição decidiu, mesmo quando
 *     é estranho — foi assim que os quatorze itens ABERTO chegaram até aqui.
 *
 * O que **não** se faz aqui é corrigir. Nenhuma função deste arquivo altera o
 * conjunto: elas descrevem o que encontraram e devolvem a decisão a quem
 * administra. Consertar em silêncio é como um simulador passa a discordar da
 * norma sem ninguém perceber.
 */

import {
  CAMPOS_DA_LINHA, CAMPOS_IOF, CAMPOS_SIMPLES, CAMPOS_DA_PUBLICACAO,
  lerCaminho, tipoDe, blocosDeTaxa,
  CAMPOS_ESTRUTURAIS_DO_PRODUTO, ESCOLHAS_DE_COMPORTAMENTO,
} from './esquema.js';

/** Uma taxa mensal acima disto é possível, mas merece um segundo olhar. */
const TAXA_MENSAL_ALTA = 0.15;
/** Idem, ao ano. */
const TAXA_ANUAL_ALTA = 1.0;
/** Referência de indexador mais velha que isto está provavelmente defasada. */
const DIAS_ATE_A_REFERENCIA_ENVELHECER = 180;

const impedimento = (onde, mensagem, detalhe) => ({ severidade: 'impedimento', onde, mensagem, detalhe });
const alerta = (onde, mensagem, detalhe) => ({ severidade: 'alerta', onde, mensagem, detalhe });

/** Número utilizável: nem texto, nem NaN, nem infinito. */
function finito(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function validarCampoSimples(valor, campo, onde) {
  const achados = [];
  const vazio = valor === null || valor === undefined || valor === '';

  if (vazio) {
    if (campo.obrigatorio) achados.push(impedimento(onde, `${campo.rotulo} não pode ficar em branco.`));
    return achados;
  }
  if (campo.tipo === 'texto' || campo.tipo === 'data' || campo.tipo === 'unidade') return achados;

  if (!finito(valor)) {
    achados.push(impedimento(onde, `${campo.rotulo} precisa ser um número. Recebido: ${JSON.stringify(valor)}.`));
    return achados;
  }
  if (campo.min !== undefined && valor < campo.min) {
    achados.push(impedimento(onde,
      `${campo.rotulo} está abaixo do mínimo admitido (${tipoDe(campo).descrever(campo.min)}).`,
      { valor }));
  }
  if (campo.max !== undefined && valor > campo.max) {
    achados.push(impedimento(onde,
      `${campo.rotulo} está acima do máximo admitido (${tipoDe(campo).descrever(campo.max)}).`,
      { valor }));
  }
  return achados;
}

/** Uma taxa é um objeto `{valor, unidade, tipo}`, e as três partes importam. */
function validarTaxa(taxa, rotulo, onde) {
  const achados = [];
  if (taxa === null || taxa === undefined) return achados;

  if (typeof taxa !== 'object') {
    return [impedimento(onde, `${rotulo} precisa trazer valor e unidade juntos.`, { taxa })];
  }
  if (!finito(taxa.valor)) {
    achados.push(impedimento(onde, `${rotulo}: o valor não é um número utilizável.`, { valor: taxa.valor }));
    return achados;
  }
  if (taxa.valor < 0) {
    achados.push(impedimento(onde, `${rotulo} não pode ser negativa.`, { valor: taxa.valor }));
  }
  if (taxa.unidade !== 'mensal' && taxa.unidade !== 'anual') {
    achados.push(impedimento(onde,
      `${rotulo}: unidade "${taxa.unidade}" desconhecida. A taxa precisa dizer se é ao mês ou ao ano — `
      + 'o mesmo número lido na unidade errada muda a parcela em muitas vezes.',
      { unidade: taxa.unidade }));
  }
  const alto = taxa.unidade === 'anual' ? TAXA_ANUAL_ALTA : TAXA_MENSAL_ALTA;
  if (taxa.valor > alto) {
    achados.push(alerta(onde,
      `${rotulo} está em ${(Number(`${taxa.valor}e2`)).toString().replace('.', ',')}% `
      + `ao ${taxa.unidade === 'anual' ? 'ano' : 'mês'}, acima do que estas linhas costumam praticar. `
      + 'Confira se o número não foi digitado em pontos percentuais onde se espera decimal.',
      { valor: taxa.valor, unidade: taxa.unidade }));
  }
  return achados;
}

function validarLinha(linha, onde) {
  const achados = [];
  const blocos = blocosDeTaxa(linha);

  for (const campo of CAMPOS_DA_LINHA) {
    if (campo.tipo !== 'taxa') {
      achados.push(...validarCampoSimples(linha[campo.chave], campo, onde));
      continue;
    }
    // Uma linha do FCO tem dois jogos de taxa, um por classe de município;
    // as demais têm um só. Cada jogo é conferido por inteiro.
    for (const bloco of blocos) {
      const valor = bloco.alvo?.[campo.chave];
      const rotulo = bloco.rotulo ? `${campo.rotulo} (${bloco.rotulo})` : campo.rotulo;
      const ondeBloco = bloco.caminho ? `${onde}.${bloco.caminho}` : onde;
      if (campo.obrigatorio && (valor === null || valor === undefined)) {
        achados.push(impedimento(ondeBloco, `${rotulo} não pode ficar em branco.`));
      }
      achados.push(...validarTaxa(valor, rotulo, ondeBloco));
    }
  }

  if (finito(linha.prazoMaximo) && finito(linha.carenciaMaxima)
      && linha.carenciaMaxima > linha.prazoMaximo) {
    achados.push(alerta(onde,
      `A carência máxima (${linha.carenciaMaxima} meses) passa do prazo máximo `
      + `(${linha.prazoMaximo} meses). Nenhuma operação poderá usá-la inteira.`,
      { prazoMaximo: linha.prazoMaximo, carenciaMaxima: linha.carenciaMaxima }));
  }
  if (finito(linha.valorMinimo) && finito(linha.limite) && linha.valorMinimo > linha.limite) {
    achados.push(impedimento(onde,
      `O valor mínimo passa do limite de crédito: nenhum valor seria admitido nesta linha.`,
      { valorMinimo: linha.valorMinimo, limite: linha.limite }));
  }
  for (const bloco of blocos) {
    const { taxaCheia, taxaBonus } = bloco.alvo ?? {};
    if (taxaBonus && taxaCheia && finito(taxaBonus.valor) && finito(taxaCheia.valor)
        && taxaBonus.valor > taxaCheia.valor) {
      achados.push(alerta(bloco.caminho ? `${onde}.${bloco.caminho}` : onde,
        `A taxa com bônus está acima da taxa cheia${bloco.rotulo ? ` (${bloco.rotulo})` : ''}, `
        + 'o que inverte o sentido do bônus de adimplência.',
        { cheia: taxaCheia.valor, bonus: taxaBonus.valor }));
    }
  }
  return achados;
}

/** A tabela de encargos, que é de onde dez dos onze produtos leem suas linhas. */
function validarTabelaDeEncargos(conjunto) {
  const achados = [];
  const grupos = conjunto.tabelaDeEncargos ?? [];

  if (grupos.length === 0) {
    return [impedimento('tabelaDeEncargos', 'A tabela de encargos ficou sem nenhum grupo.')];
  }

  grupos.forEach((grupo, i) => {
    const ondeGrupo = `tabelaDeEncargos.${i}`;
    if (!grupo.grupo) {
      achados.push(impedimento(ondeGrupo, 'O grupo está sem nome.'));
    }
    if (!Array.isArray(grupo.linhas) || grupo.linhas.length === 0) {
      achados.push(alerta(ondeGrupo,
        `O grupo "${grupo.grupo}" ficou sem nenhuma linha; os produtos que o consultam não terão o que oferecer.`));
      return;
    }
    const vistos = new Map();
    grupo.linhas.forEach((linha, j) => {
      const onde = `${ondeGrupo}.linhas.${j}`;
      achados.push(...validarLinha(linha, onde));
      if (linha.nome) {
        if (vistos.has(linha.nome)) {
          achados.push(impedimento(onde,
            `"${linha.nome}" aparece duas vezes no grupo "${grupo.grupo}". `
            + 'O nome identifica a linha, e a segunda nunca seria alcançada.',
            { primeira: vistos.get(linha.nome) }));
        }
        vistos.set(linha.nome, j);
      }
    });
  });
  return achados;
}

/** A tabela do fator K, que o FGI consulta por prazo exato. */
function validarFatorK(conjunto) {
  const achados = [];
  const fatores = conjunto.fatorKFGI?.fatores ?? {};
  const prazos = Object.keys(fatores);

  if (prazos.length === 0) {
    return [impedimento('fatorKFGI', 'A tabela do fator K ficou vazia; nenhuma operação com FGI poderia ser calculada.')];
  }
  for (const prazo of prazos) {
    const onde = `fatorKFGI.fatores.${prazo}`;
    if (!Number.isInteger(Number(prazo)) || Number(prazo) < 1) {
      achados.push(impedimento(onde, `"${prazo}" não é um prazo em meses.`));
    }
    const fator = fatores[prazo];
    if (!finito(fator) || fator <= 0) {
      achados.push(impedimento(onde, `O fator K de ${prazo} meses precisa ser um número positivo.`, { fator }));
    }
  }

  // A busca é exata, por decisão de escopo: sem interpolação silenciosa. Um
  // prazo ausente no meio da tabela não é erro de digitação detectável, mas é
  // um buraco por onde uma operação legítima passa a ser recusada.
  const emOrdem = prazos.map(Number).filter(Number.isInteger).sort((a, b) => a - b);
  const faltando = [];
  for (let p = emOrdem[0]; p < emOrdem[emOrdem.length - 1]; p += 1) {
    if (!(p in fatores)) faltando.push(p);
  }
  if (faltando.length > 0) {
    achados.push(alerta('fatorKFGI.fatores',
      `A tabela do fator K não tem os prazos ${faltando.slice(0, 12).join(', ')}`
      + `${faltando.length > 12 ? ` e mais ${faltando.length - 12}` : ''}. `
      + 'A busca é exata, sem interpolação: operações com esses prazos serão recusadas.',
      { faltando }));
  }
  return achados;
}

function validarEncargos(conjunto) {
  const achados = [];

  for (const campo of CAMPOS_IOF) {
    achados.push(...validarCampoSimples(
      lerCaminho(conjunto, `encargos.iof.${campo.chave}`),
      { ...campo, obrigatorio: true },
      `encargos.iof.${campo.chave}`,
    ));
  }
  for (const [caminho, campo] of Object.entries(CAMPOS_SIMPLES)) {
    achados.push(...validarCampoSimples(lerCaminho(conjunto, caminho), { ...campo, obrigatorio: true }, caminho));
  }

  const iof = conjunto.encargos?.iof ?? {};
  if (finito(iof.aliquotaDiariaSimples) && finito(iof.aliquotaDiariaNormal)
      && iof.aliquotaDiariaSimples > iof.aliquotaDiariaNormal) {
    achados.push(alerta('encargos.iof',
      'A alíquota diária reduzida está acima da normal, o que inverte o sentido da redução.',
      { reduzida: iof.aliquotaDiariaSimples, normal: iof.aliquotaDiariaNormal }));
  }

  const escada = conjunto.encargos?.tac?.escadaPadrao ?? [];
  if (escada.length === 0) {
    achados.push(impedimento('encargos.tac.escadaPadrao', 'A escada da TAC ficou sem faixas.'));
  } else {
    const ultima = escada[escada.length - 1];
    if (ultima.ate !== null && ultima.ate !== undefined) {
      achados.push(impedimento('encargos.tac.escadaPadrao',
        'A última faixa da TAC precisa ficar sem teto de valor, ou operações acima dela não encontrariam faixa nenhuma.'));
    }
    let anterior = -Infinity;
    escada.forEach((faixa, i) => {
      const onde = `encargos.tac.escadaPadrao.${i}`;
      if (faixa.ate !== null && faixa.ate !== undefined) {
        if (!finito(faixa.ate)) {
          achados.push(impedimento(onde, 'O limite da faixa precisa ser um número.', { ate: faixa.ate }));
        } else if (faixa.ate <= anterior) {
          achados.push(impedimento(onde,
            'As faixas da TAC precisam estar em ordem crescente; esta não passa da anterior, e nunca seria alcançada.',
            { ate: faixa.ate, anterior }));
        }
        anterior = faixa.ate;
      }
      if (faixa.tipo === 'fixo' && !finito(faixa.valor)) {
        achados.push(impedimento(onde, 'Faixa do tipo fixo sem valor.'));
      }
      if (faixa.tipo === 'percentual' && !finito(faixa.taxa)) {
        achados.push(impedimento(onde, 'Faixa percentual sem percentual.'));
      }
      if (faixa.tipo === 'fixoMaisPercentual' && (!finito(faixa.fixo) || !finito(faixa.taxa))) {
        achados.push(impedimento(onde, 'Faixa de fixo mais percentual sem uma das duas partes.'));
      }
    });

    // A variante de Giro Puro só reproduz a escada de quatro faixas na forma
    // exata da planilha. Avisar aqui é melhor do que deixar o erro aparecer
    // quando alguém for simular.
    const forma = ['fixo', 'percentual', 'percentual', 'fixoMaisPercentual'];
    const compativel = escada.length === forma.length
      && escada.every((f, i) => f.tipo === forma[i]) && escada[1]?.teto !== undefined;
    if (!compativel) {
      achados.push(alerta('encargos.tac.escadaPadrao',
        'A escada saiu da forma de quatro faixas que a variante de Linhas Giro Puro sabe reproduzir. '
        + 'As simulações de capital de giro passarão a ser recusadas — ver ABERTO-02.'));
    }
  }
  return achados;
}

function validarIndexadores(conjunto, hoje) {
  const achados = [];
  for (const [codigo, ix] of Object.entries(conjunto.indexadores ?? {})) {
    const onde = `indexadores.${codigo}`;
    const ref = ix.referencia;
    if (ref === null || ref === undefined) continue;

    if (!finito(ref.valor)) {
      achados.push(impedimento(onde,
        `A referência de ${codigo} existe mas o valor não é um número. `
        + 'Para dizer que não há referência, o campo inteiro fica vazio — zero seria um número, e um número seria usado.',
        { valor: ref.valor }));
    }
    if (ref.unidade !== 'mensal' && ref.unidade !== 'anual') {
      achados.push(impedimento(onde, `A referência de ${codigo} está sem unidade utilizável.`, { unidade: ref.unidade }));
    }
    if (ref.vigencia) {
      const dias = Math.floor((hoje - Date.parse(`${ref.vigencia}T00:00:00Z`)) / 86400000);
      if (Number.isFinite(dias) && dias > DIAS_ATE_A_REFERENCIA_ENVELHECER) {
        achados.push(alerta(onde,
          `A referência de ${codigo} é de ${ref.vigencia}, há ${dias} dias. `
          + 'Ela aparece como sugestão para quem simula; uma sugestão defasada produz uma simulação plausível e errada.',
          { vigencia: ref.vigencia, dias }));
      }
    }
  }
  return achados;
}

/**
 * Os produtos.
 *
 * O que se confere aqui é sobretudo coerência de referência: um produto que
 * aponta para um grupo de linhas que não existe simplesmente não oferece nada,
 * e um comportamento fora do vocabulário faria o motor recusar toda simulação
 * daquela família — os dois falham na hora de simular, longe de quem publicou.
 */
function validarProdutos(conjunto) {
  const achados = [];
  const produtos = conjunto.produtos ?? {};

  if (Object.keys(produtos).length === 0) {
    return [impedimento('produtos', 'Não sobrou nenhum produto; o simulador não teria o que oferecer.')];
  }

  const gruposExistentes = new Set((conjunto.tabelaDeEncargos ?? []).map((g) => g.grupo));

  for (const [codigo, produto] of Object.entries(produtos)) {
    const onde = `produtos.${codigo}`;

    if (!produto.nome || String(produto.nome).trim() === '') {
      achados.push(impedimento(onde, 'O produto está sem nome.'));
    }
    if (produto.codigo !== undefined && produto.codigo !== codigo) {
      achados.push(impedimento(onde,
        `O código interno do produto ("${produto.codigo}") não bate com a chave que o guarda ("${codigo}").`));
    }

    const grupos = produto.gruposDeEncargos ?? [];
    const daAba = produto.linhasDaAba ? 1 : 0;
    if (grupos.length === 0 && daAba === 0) {
      achados.push(alerta(onde,
        `"${produto.nome ?? codigo}" não está ligado a nenhum grupo de linhas, e por isso `
        + 'não tem o que oferecer a quem simula.'));
    }
    for (const grupo of grupos) {
      if (!gruposExistentes.has(grupo)) {
        achados.push(impedimento(`${onde}.gruposDeEncargos`,
          `"${produto.nome ?? codigo}" aponta para o grupo "${grupo}", que não existe na tabela de encargos.`,
          { grupo }));
      }
    }

    for (const campo of CAMPOS_ESTRUTURAIS_DO_PRODUTO) {
      const valor = lerCaminho(produto, campo.chave);
      const previstos = ESCOLHAS_DE_COMPORTAMENTO[campo.escolhas].map((o) => o.valor);
      const normalizado = valor === null || valor === undefined ? '' : String(valor);
      if (!previstos.map(String).includes(normalizado)) {
        achados.push(impedimento(`${onde}.${campo.chave}`,
          `${campo.rotulo} de "${produto.nome ?? codigo}" está em "${valor}", que o motor não implementa. `
          + `Previstos: ${previstos.filter(Boolean).join(', ')}.`,
          { valor }));
      }
    }

    if (produto.regras?.indexador && !(produto.regras.indexador in (conjunto.indexadores ?? {}))) {
      achados.push(impedimento(`${onde}.regras.indexador`,
        `O indexador "${produto.regras.indexador}" não está cadastrado.`));
    }
    if (!Array.isArray(produto.regras?.periodicidades) || produto.regras.periodicidades.length === 0) {
      achados.push(impedimento(`${onde}.regras.periodicidades`,
        'O produto precisa admitir ao menos uma periodicidade de pagamento.'));
    }
  }
  return achados;
}

function validarPublicacao(conjunto, referencia) {
  const achados = [];
  const meta = conjunto.metadados ?? {};
  for (const campo of CAMPOS_DA_PUBLICACAO) {
    const valor = meta[campo.chave];
    if (campo.obrigatorio && (valor === null || valor === undefined || String(valor).trim() === '')) {
      achados.push(impedimento(`metadados.${campo.chave}`,
        `${campo.rotulo} precisa ser preenchido antes de publicar.`));
    }
  }

  // O ato normativo descreve **esta** alteração. Como ele fica gravado no
  // conjunto publicado, a edição seguinte o encontra preenchido, e publicar sem
  // reparar nisso registraria a mudança nova sob a norma da anterior — que é
  // pior do que não registrar nada, porque parece registro válido.
  const anterior = referencia?.metadados?.atoNormativo;
  if (anterior && meta.atoNormativo && String(meta.atoNormativo).trim() === String(anterior).trim()) {
    achados.push(impedimento('metadados.atoNormativo',
      'O ato normativo é o mesmo da publicação anterior. Cada alteração tem a sua norma; '
      + 'aproveitar a anterior registraria esta mudança sob uma norma que não a determinou.',
      { anterior }));
  }
  if (meta.vigenciaInicio && !/^\d{4}-\d{2}-\d{2}$/.test(meta.vigenciaInicio)) {
    achados.push(impedimento('metadados.vigenciaInicio', 'A data de vigência está em formato não reconhecido.'));
  }
  return achados;
}

/** Identidade de um achado, para reconhecê-lo entre um conjunto e outro. */
const identidade = (a) => `${a.onde}\u0000${a.mensagem}`;

/**
 * Confere o conjunto inteiro.
 *
 * O parâmetro `referencia` é o conjunto que está publicado hoje, e existe por
 * uma razão prática: a planilha de origem tem defeitos que a instituição ainda
 * não decidiu como resolver — linhas com a taxa em branco, herdadas de células
 * `#REF!` e de uma tabela que nunca foi preenchida. Se um defeito desses
 * bloqueasse a publicação, ninguém conseguiria alterar uma taxa de juros sem
 * antes resolver quatro pendências que não dependem de quem administra a
 * página.
 *
 * Então a régua é o que **piorou**: um problema que já existe no conjunto
 * publicado vira alerta, marcado como herdado, e a publicação segue. Um
 * problema novo impede. Assim o painel não deixa introduzir defeito, e também
 * não trava por causa de defeito que não foi ele que criou.
 *
 * Os campos da publicação — vigência, ato normativo, quem publicou — ficam de
 * fora dessa regra e impedem sempre: eles descrevem *esta* alteração, e não há
 * como herdá-los de uma anterior.
 *
 * @param {object} conjunto
 * @param {object} [opcoes]
 * @param {object} [opcoes.referencia]  O conjunto hoje publicado.
 * @param {number} [opcoes.agora]       Instante de referência, para o teste poder fixá-lo.
 * @returns {{impedimentos: Array, alertas: Array, herdados: Array, podePublicar: boolean}}
 */
export function validar(conjunto, opcoes = {}) {
  const agora = opcoes.agora ?? Date.now();

  const daPublicacao = validarPublicacao(conjunto, opcoes.referencia);
  const doConteudo = [
    ...validarTabelaDeEncargos(conjunto),
    ...validarProdutos(conjunto),
    ...validarFatorK(conjunto),
    ...validarEncargos(conjunto),
    ...validarIndexadores(conjunto, agora),
  ];

  const jaExistiam = new Set(
    opcoes.referencia
      ? [
        ...validarTabelaDeEncargos(opcoes.referencia),
        ...validarProdutos(opcoes.referencia),
        ...validarFatorK(opcoes.referencia),
        ...validarEncargos(opcoes.referencia),
        ...validarIndexadores(opcoes.referencia, agora),
      ].map(identidade)
      : [],
  );

  const herdados = [];
  const classificados = doConteudo.map((achado) => {
    if (achado.severidade === 'impedimento' && jaExistiam.has(identidade(achado))) {
      const rebaixado = { ...achado, severidade: 'alerta', herdado: true };
      herdados.push(rebaixado);
      return rebaixado;
    }
    return achado;
  });

  const achados = [...daPublicacao, ...classificados];
  const impedimentos = achados.filter((a) => a.severidade === 'impedimento');
  return {
    impedimentos,
    alertas: achados.filter((a) => a.severidade === 'alerta'),
    herdados,
    podePublicar: impedimentos.length === 0,
  };
}
