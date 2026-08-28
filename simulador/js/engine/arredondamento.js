/**
 * Arredondamento.
 *
 * A planilha não arredonda em etapa nenhuma do cálculo: não há ARRED, ROUND
 * nem TRUNC em nenhuma das 32.580 fórmulas, e os dois centavos que aparecem
 * na tela vêm só do formato da célula. O motor faz igual — precisão dupla do
 * começo ao fim, arredondamento apenas na borda de apresentação e nas
 * comparações de teste.
 *
 * Arredondar no meio da conta afastaria o resultado do da planilha, e é por
 * isso que roundMoney não aparece dentro de nenhum laço deste motor.
 */

/**
 * Arredonda para casas decimais, meio para cima.
 *
 * `Math.round(1.005 * 100) / 100` devolve 1, porque 1.005 × 100 é
 * 100.49999999999999 em binário. A correção por epsilon relativo desempata
 * esses casos sem deslocar valores que já estão longe do meio.
 */
export function roundMoney(valor, casas = 2) {
  if (!Number.isFinite(valor)) return valor;
  const fator = 10 ** casas;
  const escalado = valor * fator;
  const folga = Math.abs(escalado) * Number.EPSILON * 4;
  return Math.round(escalado + Math.sign(escalado) * folga) / fator;
}

/**
 * Um saldo final de SAC bem formado é zero a menos de erro de ponto
 * flutuante. Resíduo de centavos não é arredondamento — é regra, e o item 24
 * do escopo manda exibi-lo.
 */
export function ehPraticamenteZero(valor, tolerancia = 1e-6) {
  return Math.abs(valor) <= tolerancia;
}

/** Soma preservando a ordem, para que o total seja reprodutível. */
export function somar(valores) {
  return valores.reduce((total, valor) => total + valor, 0);
}
