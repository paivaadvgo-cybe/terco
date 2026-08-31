/**
 * O que mudou, dito em português.
 *
 * A tela de conferência é a última coisa que o administrador lê antes de
 * publicar, e por isso ela não mostra um diff de arquivo: mostra frases. «A
 * taxa cheia de FCO MEI passou de 8,8992% para 9,15% ao ano» é conferível
 * contra a norma que está em cima da mesa; um bloco de JSON com sinais de mais
 * e menos, não.
 *
 * A comparação é feita sobre a estrutura, e não sobre o texto dos arquivos:
 * assim uma linha incluída no meio da tabela aparece como uma inclusão, e não
 * como cinquenta linhas deslocadas.
 */

import { plural } from './../ui/formatar.js';
import {
  CAMPOS_DA_LINHA, CAMPOS_IOF, CAMPOS_SIMPLES, CAMPOS_DO_INDEXADOR,
  lerCaminho, tipoDe, blocosDeTaxa, TIPOS,
  CAMPOS_DO_PRODUTO, CAMPOS_ESTRUTURAIS_DO_PRODUTO, ESCOLHAS_DE_COMPORTAMENTO,
} from './esquema.js';

const CAMPO_POR_CHAVE = new Map(CAMPOS_DA_LINHA.map((c) => [c.chave, c]));

const mudanca = (o) => ({ tipo: 'alteracao', ...o });

/** Formata um valor para leitura, sabendo o tipo do campo. */
function comoTexto(campo, valor) {
  if (valor === null || valor === undefined || valor === '') return '(vazio)';
  return tipoDe(campo).descrever(valor);
}

function taxaComoTexto(taxa) {
  if (taxa === null || taxa === undefined) return '(vazio)';
  if (!Number.isFinite(taxa.valor)) return '(inválida)';
  return `${TIPOS.percentual.descrever(taxa.valor)} ${TIPOS.unidade.descrever(taxa.unidade)}`;
}

/** Compara as duas taxas de um mesmo campo, valor e unidade. */
function compararTaxa(antes, depois, onde, rotulo, mudancas) {
  const a = antes ?? null;
  const d = depois ?? null;
  if (a === null && d === null) return;

  if (a === null || d === null) {
    mudancas.push(mudanca({
      onde, rotulo, de: taxaComoTexto(a), para: taxaComoTexto(d),
      relevancia: 'alta',
    }));
    return;
  }
  if (a.valor !== d.valor) {
    mudancas.push(mudanca({
      onde, rotulo, de: taxaComoTexto(a), para: taxaComoTexto(d),
      relevancia: 'alta',
    }));
  }
  if (a.unidade !== d.unidade) {
    // Trocar a unidade não converte o número: muda como o motor o interpreta.
    // Uma taxa anual relida como mensal cobra doze vezes mais, e o valor na
    // tela continua o mesmo — é a alteração mais fácil de fazer sem perceber.
    mudancas.push(mudanca({
      onde, rotulo: `${rotulo} — unidade`,
      de: TIPOS.unidade.descrever(a.unidade), para: TIPOS.unidade.descrever(d.unidade),
      relevancia: 'critica',
      nota: 'A unidade muda como o número é lido, e não o número. '
        + 'A mesma taxa passa a valer por um período diferente.',
    }));
  }
}

function compararLinha(antes, depois, onde, mudancas) {
  for (const campo of CAMPOS_DA_LINHA) {
    if (campo.tipo === 'taxa') continue;
    if (antes[campo.chave] !== depois[campo.chave]) {
      mudancas.push(mudanca({
        onde, rotulo: `${depois.nome} · ${campo.rotulo}`,
        de: comoTexto(campo, antes[campo.chave]),
        para: comoTexto(campo, depois[campo.chave]),
        relevancia: 'alta',
      }));
    }
  }

  const blocosAntes = blocosDeTaxa(antes);
  const blocosDepois = blocosDeTaxa(depois);
  for (const bloco of blocosDepois) {
    const par = blocosAntes.find((b) => b.caminho === bloco.caminho);
    for (const campo of CAMPOS_DA_LINHA.filter((c) => c.tipo === 'taxa')) {
      compararTaxa(
        par?.alvo?.[campo.chave], bloco.alvo?.[campo.chave],
        bloco.caminho ? `${onde}.${bloco.caminho}.${campo.chave}` : `${onde}.${campo.chave}`,
        `${depois.nome} · ${campo.rotulo}${bloco.rotulo ? ` (${bloco.rotulo})` : ''}`,
        mudancas,
      );
    }
  }
}

/** Linhas de um grupo, casadas pelo nome — não pela posição. */
function compararLinhas(antes, depois, onde, contexto, mudancas) {
  const porNomeAntes = new Map((antes ?? []).map((l) => [l.nome, l]));
  const porNomeDepois = new Map((depois ?? []).map((l) => [l.nome, l]));

  (depois ?? []).forEach((linha, i) => {
    const anterior = porNomeAntes.get(linha.nome);
    if (anterior === undefined) {
      mudancas.push({
        tipo: 'inclusao', onde: `${onde}.${i}`,
        rotulo: `${contexto}: linha nova "${linha.nome}"`,
        para: `prazo até ${linha.prazoMaximo} meses, limite `
          + `${TIPOS.dinheiro.descrever(linha.limite ?? 0)}`,
        relevancia: 'alta',
      });
      return;
    }
    compararLinha(anterior, linha, `${onde}.${i}`, mudancas);
  });

  for (const [nome, linha] of porNomeAntes) {
    if (!porNomeDepois.has(nome)) {
      mudancas.push({
        tipo: 'exclusao', onde,
        rotulo: `${contexto}: linha excluída "${nome}"`,
        de: `prazo até ${linha.prazoMaximo} meses, limite `
          + `${TIPOS.dinheiro.descrever(linha.limite ?? 0)}`,
        relevancia: 'critica',
        nota: 'Simulações salvas que usavam esta linha continuam guardadas, mas não '
          + 'poderão ser refeitas com os parâmetros novos.',
      });
    }
  }
}

function compararFatorK(antes, depois, mudancas) {
  const a = antes?.fatorKFGI?.fatores ?? {};
  const d = depois?.fatorKFGI?.fatores ?? {};
  const prazos = [...new Set([...Object.keys(a), ...Object.keys(d)])].sort((x, y) => Number(x) - Number(y));

  for (const prazo of prazos) {
    if (a[prazo] === d[prazo]) continue;
    const dentro = prazo in d;
    const antes_ = prazo in a;
    mudancas.push({
      tipo: !antes_ ? 'inclusao' : (!dentro ? 'exclusao' : 'alteracao'),
      onde: `fatorKFGI.fatores.${prazo}`,
      rotulo: `Fator K do FGI · ${prazo} meses`,
      de: antes_ ? String(a[prazo]).replace('.', ',') : '(ausente)',
      para: dentro ? String(d[prazo]).replace('.', ',') : '(removido)',
      relevancia: dentro && antes_ ? 'media' : 'alta',
      nota: !dentro
        ? 'A busca do fator K é exata: operações com este prazo passarão a ser recusadas.'
        : undefined,
    });
  }
}

function compararEncargos(antes, depois, mudancas) {
  for (const campo of CAMPOS_IOF) {
    const caminho = `encargos.iof.${campo.chave}`;
    const a = lerCaminho(antes, caminho);
    const d = lerCaminho(depois, caminho);
    if (a !== d) {
      mudancas.push(mudanca({
        onde: caminho, rotulo: `IOF · ${campo.rotulo}`,
        de: comoTexto(campo, a), para: comoTexto(campo, d), relevancia: 'alta',
      }));
    }
  }
  for (const [caminho, campo] of Object.entries(CAMPOS_SIMPLES)) {
    const a = lerCaminho(antes, caminho);
    const d = lerCaminho(depois, caminho);
    if (a !== d) {
      mudancas.push(mudanca({
        onde: caminho, rotulo: campo.rotulo,
        de: comoTexto(campo, a), para: comoTexto(campo, d), relevancia: 'alta',
      }));
    }
  }

  const escadaA = antes?.encargos?.tac?.escadaPadrao ?? [];
  const escadaD = depois?.encargos?.tac?.escadaPadrao ?? [];
  const maior = Math.max(escadaA.length, escadaD.length);
  for (let i = 0; i < maior; i += 1) {
    const a = escadaA[i];
    const d = escadaD[i];
    if (JSON.stringify(a) === JSON.stringify(d)) continue;
    mudancas.push({
      tipo: a === undefined ? 'inclusao' : (d === undefined ? 'exclusao' : 'alteracao'),
      onde: `encargos.tac.escadaPadrao.${i}`,
      rotulo: `TAC · faixa ${i + 1}`,
      de: descreverFaixa(a), para: descreverFaixa(d), relevancia: 'alta',
    });
  }
}

function descreverFaixa(faixa) {
  if (faixa === undefined || faixa === null) return '(não existe)';
  const ate = faixa.ate === null || faixa.ate === undefined
    ? 'acima da última faixa' : `até ${TIPOS.dinheiro.descrever(faixa.ate)}`;
  if (faixa.tipo === 'fixo') return `${ate}: ${TIPOS.dinheiro.descrever(faixa.valor)}`;
  if (faixa.tipo === 'percentual') {
    return `${ate}: ${TIPOS.percentual.descrever(faixa.taxa)}`
      + (faixa.teto === undefined ? '' : `, com teto de ${TIPOS.dinheiro.descrever(faixa.teto)}`);
  }
  if (faixa.tipo === 'fixoMaisPercentual') {
    return `${ate}: ${TIPOS.dinheiro.descrever(faixa.fixo)} mais ${TIPOS.percentual.descrever(faixa.taxa)}`;
  }
  return JSON.stringify(faixa);
}

/** O texto de uma escolha de comportamento, e não o código dela. */
function textoDaEscolha(campo, valor) {
  const opcao = ESCOLHAS_DE_COMPORTAMENTO[campo.escolhas]
    .find((o) => String(o.valor) === String(valor ?? ''));
  return opcao ? opcao.texto : `(${valor})`;
}

/**
 * A senha do painel.
 *
 * Aparece na lista como qualquer alteração, e precisa aparecer: sem isso o
 * painel diria «sem alterações a publicar» depois de a senha ser trocada, e a
 * senha nova ficaria impublicável — o botão de publicar só surge quando há
 * diferença. O resumo em si não é mostrado; o que interessa é que mudou.
 */
function compararAcesso(antes, depois, mudancas) {
  const a = antes?.acesso ?? null;
  const d = depois?.acesso ?? null;
  if (a === null && d === null) return;
  if (a?.resumo === d?.resumo && a?.sal === d?.sal) return;

  mudancas.push({
    tipo: a === null ? 'inclusao' : (d === null ? 'exclusao' : 'alteracao'),
    onde: 'acesso',
    rotulo: 'Senha do painel de administração',
    de: a === null ? '(sem senha)' : `definida em ${a.definidaEm ?? '—'}`,
    para: d === null ? '(sem senha)' : `definida em ${d.definidaEm ?? '—'}`,
    relevancia: 'critica',
    nota: d === null
      ? 'O painel passa a abrir para quem tiver o endereço.'
      : 'Passa a valer para todos os navegadores assim que for publicada. '
        + 'Quem estiver com o painel aberto continua até fechar a aba.',
  });
}

function compararProdutos(antes, depois, mudancas) {
  const a = antes?.produtos ?? {};
  const d = depois?.produtos ?? {};

  for (const [codigo, produto] of Object.entries(d)) {
    const anterior = a[codigo];
    if (anterior === undefined) {
      mudancas.push({
        tipo: 'inclusao', onde: `produtos.${codigo}`,
        rotulo: `Produto novo "${produto.nome}"`,
        para: plural((produto.gruposDeEncargos ?? []).length, 'grupo de linhas', 'grupos de linhas'),
        relevancia: 'alta',
      });
      continue;
    }

    for (const campo of CAMPOS_DO_PRODUTO) {
      if (anterior[campo.chave] !== produto[campo.chave]) {
        mudancas.push(mudanca({
          onde: `produtos.${codigo}.${campo.chave}`,
          rotulo: `${produto.nome} · ${campo.rotulo}`,
          de: anterior[campo.chave] || '(vazio)', para: produto[campo.chave] || '(vazio)',
          relevancia: 'media',
        }));
      }
    }

    for (const campo of CAMPOS_ESTRUTURAIS_DO_PRODUTO) {
      const va = lerCaminho(anterior, campo.chave);
      const vd = lerCaminho(produto, campo.chave);
      if (String(va ?? '') === String(vd ?? '')) continue;
      mudancas.push(mudanca({
        onde: `produtos.${codigo}.${campo.chave}`,
        rotulo: `${produto.nome} · ${campo.rotulo}`,
        de: textoDaEscolha(campo, va), para: textoDaEscolha(campo, vd),
        relevancia: 'critica',
        nota: 'Muda o cálculo de todas as linhas desta família de uma vez, e não de uma linha só.',
      }));
    }

    const gruposA = (anterior.gruposDeEncargos ?? []).join(' · ');
    const gruposD = (produto.gruposDeEncargos ?? []).join(' · ');
    if (gruposA !== gruposD) {
      mudancas.push(mudanca({
        onde: `produtos.${codigo}.gruposDeEncargos`,
        rotulo: `${produto.nome} · Grupos de linhas`,
        de: gruposA || '(nenhum)', para: gruposD || '(nenhum)',
        relevancia: 'critica',
        nota: 'Muda quais linhas este produto oferece a quem simula.',
      }));
    }
  }

  for (const [codigo, produto] of Object.entries(a)) {
    if (codigo in d) continue;
    mudancas.push({
      tipo: 'exclusao', onde: `produtos.${codigo}`,
      rotulo: `Produto excluído "${produto.nome}"`,
      de: plural((produto.gruposDeEncargos ?? []).length, 'grupo de linhas', 'grupos de linhas'),
      relevancia: 'critica',
      nota: 'As linhas desta família deixam de ser oferecidas. Simulações salvas continuam '
        + 'guardadas, mas não poderão ser refeitas.',
    });
  }
}

function compararIndexadores(antes, depois, mudancas) {
  const codigos = [...new Set([
    ...Object.keys(antes?.indexadores ?? {}),
    ...Object.keys(depois?.indexadores ?? {}),
  ])];
  for (const codigo of codigos) {
    for (const campo of CAMPOS_DO_INDEXADOR) {
      const caminho = `indexadores.${codigo}.${campo.chave}`;
      const a = lerCaminho(antes, caminho);
      const d = lerCaminho(depois, caminho);
      if (a === d) continue;
      mudancas.push(mudanca({
        onde: caminho, rotulo: `${codigo} · ${campo.rotulo}`,
        de: comoTexto(campo, a), para: comoTexto(campo, d),
        relevancia: 'media',
        nota: campo.chave === 'referencia.valor'
          ? 'É uma sugestão no formulário, nunca aplicada sozinha: quem simula informa o valor.'
          : undefined,
      }));
    }
  }
}

/**
 * Todas as diferenças entre dois conjuntos, prontas para exibição.
 *
 * @returns {{mudancas: Array, total: number, criticas: number}}
 */
export function diferencas(antes, depois) {
  const mudancas = [];

  (depois?.tabelaDeEncargos ?? []).forEach((grupo, i) => {
    const anterior = (antes?.tabelaDeEncargos ?? []).find((g) => g.grupo === grupo.grupo);
    if (anterior === undefined) {
      mudancas.push({
        tipo: 'inclusao', onde: `tabelaDeEncargos.${i}`,
        rotulo: `Grupo novo "${grupo.grupo}"`,
        para: plural(grupo.linhas?.length ?? 0, 'linha', 'linhas'), relevancia: 'alta',
      });
      return;
    }
    compararLinhas(anterior.linhas, grupo.linhas, `tabelaDeEncargos.${i}.linhas`, grupo.grupo, mudancas);
  });

  for (const grupo of antes?.tabelaDeEncargos ?? []) {
    if (!(depois?.tabelaDeEncargos ?? []).some((g) => g.grupo === grupo.grupo)) {
      mudancas.push({
        tipo: 'exclusao', onde: 'tabelaDeEncargos',
        rotulo: `Grupo excluído "${grupo.grupo}"`,
        de: plural(grupo.linhas?.length ?? 0, 'linha', 'linhas'), relevancia: 'critica',
      });
    }
  }

  for (const aba of Object.keys(depois?.linhasPorAba ?? {})) {
    compararLinhas(
      antes?.linhasPorAba?.[aba]?.linhas, depois.linhasPorAba[aba].linhas,
      `linhasPorAba.${aba}.linhas`, aba, mudancas,
    );
  }

  compararAcesso(antes, depois, mudancas);
  compararProdutos(antes, depois, mudancas);
  compararFatorK(antes, depois, mudancas);
  compararEncargos(antes, depois, mudancas);
  compararIndexadores(antes, depois, mudancas);

  return {
    mudancas,
    total: mudancas.length,
    criticas: mudancas.filter((m) => m.relevancia === 'critica').length,
  };
}
