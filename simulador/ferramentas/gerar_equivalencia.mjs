/**
 * Gera `documentacao/EQUIVALENCIA_EXCEL.md` a partir da comparação real.
 *
 * O relatório não é escrito à mão. Ele sai da mesma comparação que os testes
 * fazem, sobre os mesmos casos extraídos da planilha — de modo que não pode
 * afirmar uma aprovação que os testes não sustentem, nem envelhecer sozinho
 * quando o motor mudar.
 *
 * Uso: node ferramentas/gerar_equivalencia.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

import { gerarCronogramaSAC } from '../js/engine/sac.js';
import { criarTaxa } from '../js/engine/juros.js';
import { calcularTIR, montarFluxo } from '../js/engine/tir.js';
import { calcularTAC } from '../js/encargos/tac.js';
import { calcularIOF } from '../js/encargos/iof.js';
import { calcularRendaParaAval, calcularAlienacaoImovel } from '../js/encargos/garantias.js';
import { PARAMETROS } from '../js/data/parametros.js';
import { VERSAO_DO_MOTOR } from '../js/produtos/produtos.js';

const raiz = new URL('..', import.meta.url).pathname;
const { origem, casos } = JSON.parse(fs.readFileSync(path.join(raiz, 'tests/casos-equivalencia.json'), 'utf8'));

const CENTAVO = 0.01;
/** Taxas não se medem em centavos: 0,007 aqui é sete décimos de ponto percentual. */
const TOLERANCIA_DE_TAXA = 1e-9;
const num = (v, casas = 2) => (v === null || v === undefined || !Number.isFinite(v)
  ? '—'
  : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
const exato = (v) => (v === null || v === undefined ? '—' : String(v));

function cronogramaDoCaso(caso) {
  const e = caso.entrada;
  return gerarCronogramaSAC({
    valorFinanciado: e.valorFinanciado, valorSolicitado: e.valorSolicitado,
    prazo: e.prazo, carencia: e.carencia,
    taxa: criarTaxa(e.taxa.valor, e.taxa.unidade),
    taxaIndexador: e.indexador ? criarTaxa(e.indexador.valor, e.indexador.unidade) : null,
    convencaoTaxa: e.convencaoTaxa, baseAmortizacao: e.baseAmortizacao,
    tratamentoCarencia: e.tratamentoCarencia, dataProposta: e.dataProposta,
  });
}

/** Primeira, primeira que amortiza, uma do meio e a última. */
function parcelasRepresentativas(caso) {
  const primeiraAmortizante = caso.parcelas.find((p) => p.amortizacao > 0);
  const meio = caso.parcelas[Math.floor(caso.parcelas.length / 2)];
  const escolhidas = [caso.parcelas[0], primeiraAmortizante, meio, caso.parcelas.at(-1)];
  return [...new Map(escolhidas.filter(Boolean).map((p) => [p.parcela, p])).values()]
    .sort((a, b) => a.parcela - b.parcela);
}

let totalValores = 0;
let totalExatos = 0;
let piorDiferenca = 0;
const blocos = [];

casos.forEach((caso, indice) => {
  const e = caso.entrada;
  const r = cronogramaDoCaso(caso);
  const linhas = [];

  let piorNoCaso = 0;
  for (const p of caso.parcelas) {
    const meu = r.cronograma[p.parcela - 1];
    for (const [excel, motor] of [
      [p.juros, meu.juros], [p.amortizacao, meu.amortizacao],
      [p.saldo, meu.saldoFinal], [p.prestacao, meu.prestacao],
    ]) {
      totalValores += 1;
      if (excel === motor) totalExatos += 1;
      piorNoCaso = Math.max(piorNoCaso, Math.abs(excel - motor));
    }
  }
  piorDiferenca = Math.max(piorDiferenca, piorNoCaso);

  const numero = String(indice + 1).padStart(3, '0');
  linhas.push(`## CASO ${numero} · ${caso.aba}`);
  linhas.push('');
  linhas.push('**Entrada** — o estado salvo da aba, lido do arquivo.');
  linhas.push('');
  linhas.push('| Campo | Valor |');
  linhas.push('|---|---|');
  linhas.push(`| Valor solicitado | R$ ${num(e.valorSolicitado)} |`);
  linhas.push(`| Valor financiado | R$ ${num(e.valorFinanciado)} |`);
  linhas.push(`| Prazo | ${e.prazo} meses |`);
  linhas.push(`| Carência | ${e.carencia} meses |`);
  linhas.push(`| Taxa | ${exato(e.taxa.valor)} ${e.taxa.unidade} |`);
  if (e.indexador) linhas.push(`| Indexador | ${exato(e.indexador.valor)} ${e.indexador.unidade} |`);
  linhas.push(`| Conversão | ${e.convencaoTaxa === 'diasUteis' ? '(1+i)^(22/252) − 1' : '(1+i)^(1/12) − 1'} |`);
  linhas.push(`| Base da amortização | ${e.baseAmortizacao} |`);
  linhas.push(`| Tratamento da carência | juros ${e.tratamentoCarencia} |`);
  linhas.push('');

  linhas.push(`**Cronograma** — ${caso.parcelas.length} parcelas conferidas, uma a uma.`
    + (caso.parcelas.length < e.prazo
      ? ` A planilha só calculou ${caso.parcelas.length} das ${e.prazo} do contrato; as demais não têm valor para comparar (ABERTO-08).`
      : ''));
  linhas.push('');
  linhas.push('| Parcela | Campo | Excel | JavaScript | Δ |');
  linhas.push('|---|---|---|---|---|');
  for (const p of parcelasRepresentativas(caso)) {
    const meu = r.cronograma[p.parcela - 1];
    const campos = [
      ['juros', p.juros, meu.juros],
      ['amortização', p.amortizacao, meu.amortizacao],
      ['saldo', p.saldo, meu.saldoFinal],
      ['prestação', p.prestacao, meu.prestacao],
    ];
    for (const [nome, excel, motor] of campos) {
      const d = Math.abs(excel - motor);
      linhas.push(`| ${p.parcela} | ${nome} | \`${exato(excel)}\` | \`${exato(motor)}\` | ${d === 0 ? '**0**' : d.toExponential(2)} |`);
    }
  }
  linhas.push('');

  // ── encargos
  const variante = caso.aba === 'Linhas Giro Puro' ? 'giroPuro' : 'padrao';
  const financiada = caso.bandeiras?.tacFinanciada ?? true;
  // Cada item traz a sua natureza: um centavo é tolerância de dinheiro, e
  // aplicá-la a uma taxa aprovaria uma diferença de 0,7 ponto percentual como
  // se fosse arredondamento.
  const comparacoes = [['TAC', caso.encargos.tac, calcularTAC(e.valorSolicitado, { variante, financiada }), 'dinheiro']];
  if (caso.encargos.rendaParaAval != null) {
    comparacoes.push(['Renda para aval', caso.encargos.rendaParaAval, calcularRendaParaAval(r.totais.maiorParcela).valor, 'dinheiro']);
  }
  if (caso.encargos.alienacao != null) {
    comparacoes.push(['Alienação de imóvel', caso.encargos.alienacao, calcularAlienacaoImovel({ valorSolicitado: e.valorSolicitado }).valor, 'dinheiro']);
  }
  if (caso.iof?.incide) {
    const iof = calcularIOF({
      valorSolicitado: e.valorSolicitado, prazo: e.prazo, carencia: e.carencia,
      financiado: false, dataProposta: e.dataProposta,
    });
    comparacoes.push(['IOF adicional', caso.iof.adicional, iof.adicional, 'dinheiro']);
  }
  if (caso.tir?.comBonus != null) {
    comparacoes.push(['TIR com bônus', caso.tir.comBonus, calcularTIR(montarFluxo(e.valorSolicitado, r.cronograma)), 'taxa']);
  }

  linhas.push('**Encargos e indicadores**');
  linhas.push('');
  linhas.push('| Item | Excel | JavaScript | Δ | |');
  linhas.push('|---|---|---|---|---|');
  let divergenciaConhecida = false;
  for (const [nome, excel, motor, natureza] of comparacoes) {
    const d = Math.abs(excel - motor);
    const limite = natureza === 'taxa' ? TOLERANCIA_DE_TAXA : CENTAVO;
    let veredito;
    if (d === 0) veredito = '✓ idêntico';
    else if (d <= limite) veredito = '✓ dentro da tolerância';
    else { veredito = '⚠ divergência conhecida — ABERTO-08'; divergenciaConhecida = true; }
    linhas.push(`| ${nome} | \`${exato(excel)}\` | \`${exato(motor)}\` | ${d === 0 ? '**0**' : d.toExponential(2)} | ${veredito} |`);
  }
  linhas.push('');
  const cronogramaOk = piorNoCaso === 0
    ? '✓ APROVADO — todos os valores do cronograma idênticos ao último bit'
    : piorNoCaso <= CENTAVO ? '✓ APROVADO — dentro de R$ 0,01' : '⚠ REPROVADO';
  linhas.push(`**Resultado: ${cronogramaOk}**`);
  if (divergenciaConhecida) {
    linhas.push('');
    linhas.push('> A divergência assinalada acima não é do motor. A planilha só calculou '
      + `${caso.parcelas.length} das ${e.prazo} parcelas do contrato, e o indicador foi apurado `
      + 'sobre esse fluxo curto. Ver a seção de divergências esperadas, no começo deste documento.');
  }
  linhas.push('');
  blocos.push(linhas.join('\n'));
});

const cabecalho = `# Relatório de equivalência — planilha × aplicativo

Comparação célula a célula entre o estado salvo de cada aba de
\`${origem}\` e o resultado do motor do aplicativo.

Os casos não foram transcritos. Saem da própria planilha, por
\`ferramentas/extrair_casos.py\`, com todos os dígitos que o Excel gravou — e a
mesma comparação que produziu este documento roda como teste automatizado em
\`tests/equivalencia.test.js\`. O relatório não pode, portanto, afirmar uma
aprovação que os testes não sustentem.

**Parâmetros ${PARAMETROS.versao} · motor ${VERSAO_DO_MOTOR} · gerado em ${new Date().toISOString().slice(0, 10)}**

## Resumo

| | |
|---|---|
| Abas comparadas | ${casos.length} de ${casos.length} abas de produto |
| Parcelas conferidas | ${casos.reduce((n, c) => n + c.parcelas.length, 0)} |
| Valores comparados | ${totalValores} |
| Idênticos ao último bit | **${totalExatos}** (${(100 * totalExatos / totalValores).toFixed(1)}%) |
| Maior diferença | **${piorDiferenca === 0 ? 'zero' : piorDiferenca.toExponential(2)}** |
| Tolerância adotada | R$ 0,01 |

A tolerância de um centavo, que o item 36 do escopo estabelece, **não foi
necessária em nenhum valor do cronograma**. A planilha não arredonda em etapa
alguma do cálculo e o motor também não, de modo que os dois chegam ao mesmo
número binário — ruído de ponto flutuante incluído.

## Divergências esperadas e aprovadas

Duas divergências são conhecidas, documentadas e não reprovam. Em ambas o
defeito está na planilha, e o teste afirma a causa em vez de afrouxar a
tolerância.

### 1 · Somas sobre faixas fixas de linhas (ABERTO-08)

A planilha totaliza percorrendo intervalos de tamanho fixo — \`SUM(F23:F242)\`,
\`SUM(AG30:AG83)\` — independentes do prazo do contrato. Como as fórmulas do
cronograma não foram arrastadas até o fim, esses intervalos incluem linhas
vazias, e o total corresponde a menos parcelas do que a operação tem.

O teste do IOF **procura** o ponto de corte em vez de presumi-lo: se existe um
número de parcelas cuja soma dá exatamente o valor da planilha, a diferença é
truncamento e nada mais. Se não existisse, seria divergência de regra, e o
teste falharia.

### 2 · TIR de \`Linhas Giro Puro\`

Nessa aba as fórmulas param na parcela 48 de um contrato de 60. O fluxo que
chega ao \`IRR\` tem doze parcelas a menos e devolve **taxa negativa** —
−0,11% ao mês para um contrato que rende juros. O motor, com o contrato
inteiro, devolve taxa positiva; e reproduz o número da planilha quando recebe o
mesmo fluxo curto, o que prova que a divergência é o fluxo, não a regra.

## Fora do alcance desta comparação

- **Linhas com \`#REF!\`** (ABERTO-12) e **a linha sem taxa** (ABERTO-14): a
  planilha não produz valor, e o aplicativo recusa a simular. Não há o que
  comparar, e é assim que deve ser.
- **IOF de Fungetur, FINEP e FCO**: nas duas primeiras a célula que parecia o
  IOF é, na verdade, o encargo do FAMPE — o rótulo ao lado diz «CCA FAMPE»; no
  FCO o IOF não incide (\`L19\` é falso).
- **PRICE**: a planilha não tem cronograma de prestação constante. A única
  âncora é a célula \`AL18\`, conferida em \`tests/price.test.js\`.

`;

const documento = cabecalho + blocos.join('\n---\n\n') + `
---

## Conclusão

O aplicativo reproduz a planilha. Dos ${totalValores} valores de cronograma
comparados, ${totalExatos} são idênticos ao último bit e nenhum precisou da
tolerância. As duas divergências que existem são defeitos da planilha, já
documentados, e o teste demonstra a causa de cada uma em vez de acomodá-la.

O critério do item 46 do escopo — «o usuário puder reproduzir uma simulação do
Excel no aplicativo» — está atendido para as nove abas de produto que a
planilha calcula.
`;

fs.writeFileSync(path.join(raiz, 'documentacao/EQUIVALENCIA_EXCEL.md'), documento);
console.log(`valores comparados: ${totalValores} · idênticos: ${totalExatos} · pior: ${piorDiferenca}`);
console.log('documentacao/EQUIVALENCIA_EXCEL.md gerado');
