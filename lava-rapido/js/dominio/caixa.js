/**
 * As contas do dia: caixa, fechamento, despesas e resultado.
 *
 * Tudo aqui é função pura sobre listas já lidas do banco. É de propósito: são
 * as contas que o dono confere de cabeça no fim do dia, e é o único lugar do
 * aplicativo onde um erro silencioso vira prejuízo. Separadas do banco e da
 * tela, elas podem ser testadas com listas escritas à mão — e são.
 *
 * **Faturamento não é o que entrou no caixa.** Faturamento é o que foi vendido;
 * recebido é o que foi pago. Quando alguém sai devendo, os dois se separam, e
 * juntá-los num número só é o começo de um caixa que não fecha. As duas contas
 * aparecem sempre, lado a lado.
 *
 * Lavagem cancelada não entra em nada: nem em faturamento, nem em contagem,
 * nem em ticket médio.
 */

import { ESTADOS, FORMAS } from './lavagem.js';
import { dia } from './datas.js';

const validas = (lavagens) => lavagens.filter((l) => l.estado !== ESTADOS.CANCELADO);

/** Só o que vale dinheiro: não conta o que ainda está no pátio. */
const faturadas = (lavagens) => validas(lavagens).filter(
  (l) => l.estado === ESTADOS.PAGO || l.estado === ESTADOS.PENDENTE || l.estado === ESTADOS.FINALIZADO,
);

export function noIntervalo(registros, { de, ate }, campo = 'criadaEm') {
  return registros.filter((r) => r[campo] >= de && r[campo] < ate);
}

/**
 * O caixa de um conjunto de lavagens.
 *
 * `porForma` traz sempre as quatro formas, mesmo zeradas: uma linha que
 * desaparece quando o valor é zero faz quem confere procurar o que não sumiu.
 */
export function caixa(lavagens) {
  const contam = faturadas(lavagens);
  const porForma = Object.fromEntries(FORMAS.map((f) => [f.id, 0]));

  let recebido = 0;
  let pendente = 0;
  for (const l of contam) {
    if (l.estado === ESTADOS.PAGO && l.pagamento) {
      const valor = Number(l.pagamento.valor ?? l.valor) || 0;
      recebido += valor;
      if (porForma[l.pagamento.forma] !== undefined) porForma[l.pagamento.forma] += valor;
    } else {
      pendente += Number(l.valor) || 0;
    }
  }

  const quantidade = contam.length;
  const faturamento = recebido + pendente;
  return {
    quantidade,
    faturamento,
    recebido,
    pendente,
    porForma,
    ticketMedio: quantidade ? Math.round(faturamento / quantidade) : 0,
  };
}

/** Quanto cada serviço rendeu, do que mais rendeu para o que menos. */
export function porServico(lavagens) {
  return agrupar(faturadas(lavagens), (l) => l.servicoId, (l) => l.servicoNome);
}

export function porTipo(lavagens) {
  return agrupar(faturadas(lavagens), (l) => l.tipo, (l) => l.tipo);
}

/** Produção por funcionário. As lavagens sem responsável ficam de fora. */
export function porFuncionario(lavagens) {
  return agrupar(
    faturadas(lavagens).filter((l) => l.funcionarioId),
    (l) => l.funcionarioId,
    (l) => l.funcionarioNome,
  );
}

function agrupar(lavagens, chaveDe, nomeDe) {
  const mapa = new Map();
  for (const l of lavagens) {
    const chave = chaveDe(l) ?? 'outro';
    const atual = mapa.get(chave) ?? { chave, nome: nomeDe(l) ?? chave, quantidade: 0, valor: 0 };
    atual.quantidade += 1;
    atual.valor += Number(l.valor) || 0;
    mapa.set(chave, atual);
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor || b.quantidade - a.quantidade);
}

export function totalDeDespesas(despesas) {
  return despesas.reduce((soma, d) => soma + (Number(d.valor) || 0), 0);
}

export function despesasPorCategoria(despesas) {
  const mapa = new Map();
  for (const d of despesas) {
    const chave = d.categoria ?? 'outros';
    const atual = mapa.get(chave) ?? { chave, nome: chave, quantidade: 0, valor: 0 };
    atual.quantidade += 1;
    atual.valor += Number(d.valor) || 0;
    mapa.set(chave, atual);
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor);
}

/**
 * Receita menos despesas.
 *
 * Chama-se resultado operacional, e não lucro: não há aqui pró-labore,
 * imposto, depreciação nem retirada. Dar o nome maior ao número menor seria
 * mentir para quem toma decisão com ele.
 */
export function resultadoOperacional(lavagens, despesas) {
  const { faturamento, recebido, pendente } = caixa(lavagens);
  const despesa = totalDeDespesas(despesas);
  return { receita: faturamento, recebido, pendente, despesas: despesa, resultado: faturamento - despesa };
}

/** O fechamento de um dia: o que a tela mostra e o que o CSV exporta. */
export function fechamentoDoDia(diaTexto, lavagens, despesas) {
  const doDia = lavagens.filter((l) => dia(l.criadaEm) === diaTexto);
  const despesasDoDia = despesas.filter((d) => d.dia === diaTexto);
  return {
    dia: diaTexto,
    ...caixa(doDia),
    servicos: porServico(doDia),
    tipos: porTipo(doDia),
    funcionarios: porFuncionario(doDia),
    despesas: totalDeDespesas(despesasDoDia),
    resultado: caixa(doDia).faturamento - totalDeDespesas(despesasDoDia),
    canceladas: doDia.filter((l) => l.estado === ESTADOS.CANCELADO).length,
  };
}

/** Um período inteiro, com a média por dia que teve movimento. */
export function resumoDoPeriodo(lavagens, despesas, diasDoPeriodo) {
  const base = caixa(lavagens);
  const diasComMovimento = new Set(validas(lavagens).map((l) => dia(l.criadaEm))).size;
  return {
    ...base,
    dias: diasDoPeriodo.length,
    diasComMovimento,
    mediaDiariaLavagens: diasComMovimento ? base.quantidade / diasComMovimento : 0,
    mediaDiariaFaturamento: diasComMovimento ? Math.round(base.faturamento / diasComMovimento) : 0,
    despesas: totalDeDespesas(despesas),
    resultado: base.faturamento - totalDeDespesas(despesas),
    servicos: porServico(lavagens),
    funcionarios: porFuncionario(lavagens),
  };
}
