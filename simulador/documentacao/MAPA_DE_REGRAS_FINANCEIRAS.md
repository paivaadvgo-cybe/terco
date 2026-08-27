# Mapa de regras financeiras

Auditoria de `Simulador_GoiasFomento 08-05-2025.xlsx`, feita com
`simulador/ferramentas/auditar_planilha.py`. Doze abas, 32.580 fórmulas,
605 células em erro.

Este documento descreve **o que a planilha faz hoje**. Onde a regra encontrada
parece equivocada, a observação está registrada e marcada — nada foi corrigido.
As correções são assunto de uma segunda versão, e dependem de autorização.

## 1. Panorama das abas

| Aba | Estado | Papel | Motor |
|---|---|---|---|
| `Tabela de Encargos` | oculta | Tabela oficial de taxas, prazos, carências e limites. Vigência 16/12/2024 | — |
| `Fator K - FGI` | oculta | Fatores K por prazo + fórmula do encargo de garantia | — |
| `Linhas Investimento` | visível | Linhas de investimento | SAC mensal |
| `Linhas Giro Puro` | visível | Linhas de capital de giro | SAC mensal |
| `Linhas Transportes` | visível | Táxi, mototáxi, escolar, TransGás, feirantes | SAC mensal |
| `Mais Crédito` | visível | Microcrédito, teto de R$ 5.000 | SAC mensal |
| `Mais Crédito (2)` | oculta | Cópia da anterior com teto de R$ 21.000 para a linha 1 | SAC mensal |
| `Linhas Fungetur` | visível | Turismo, taxa fixa + SELIC | SAC com dois juros, dias úteis |
| `Linhas FINEP` | visível | Inovação, taxa fixa + TR | SAC com dois juros, dias úteis |
| `FCO Empresarial` | visível | FCO empresarial, MEI, PNMPO, geração de energia | SAC com periodicidade |
| `FCO Rural` | visível | FCO Desenvolvimento Rural e FCO Verde | SAC com periodicidade |
| `Produtor Empreendedor` | visível | Produtor Empreendedor e Fruticultura | SAC **ou** capitalização na carência |

As abas de produto compartilham o mesmo esqueleto: um bloco de entrada em
`A14:F19`, um cronograma a partir da linha 23, e blocos auxiliares à direita
para IOF, TIR e análise de receita. O que muda entre elas é o motor de juros,
a unidade das taxas e quais encargos incidem.

## 2. Bloco de entrada, comum às abas de produto

| Célula | Campo | Observação |
|---|---|---|
| `B15` | Valor solicitado | O que o cliente pede, antes dos encargos |
| `B16` | Carência, em meses | |
| `B17` | Prazo total, em meses | Inclui a carência |
| `D15` | Taxa cheia (nominal) | Selecionada pela linha escolhida |
| `D16` | Taxa com bônus | É a taxa que de fato remunera o contrato |
| `D17` | Data da proposta | `=TODAY()` |
| `E19`/`F19` | Percentual garantido pelo FGI | Validação exige no mínimo 0,2 |
| `E23` | **Valor financiado** | Valor solicitado mais os encargos que forem financiados |
| `C23` | Taxa do período | Deriva de `D16`; a conversão muda por aba |

O cronograma ocupa `A23:F…`: `A` parcela, `B` regime (carência ou
amortização), `C` juros, `D` amortização, `E` saldo devedor, `F` prestação.
A linha 23 é a parcela zero: contém apenas o saldo inicial.

## 3. Sistema de amortização

**Todos os cronogramas da planilha são SAC.** Nenhuma das doze abas monta o
cronograma por prestação constante: em toda parte a amortização é uma fração
fixa do saldo inicial e a prestação é a soma dela com os juros do período.

O PRICE aparece uma única vez, e fora do cronograma. Em `Linhas Investimento`,
a célula `AL18` traz

```
prestacaoPrice = PMT(taxa = TIR do fluxo com bônus; n = prazo; VP = −valorSolicitado)
```

É um indicador isolado, à direita da aba, que mostra qual seria a prestação
constante equivalente — calculada sobre a TIR que o próprio fluxo SAC produziu,
e sobre o valor solicitado, não sobre o financiado. Não alimenta cronograma,
totais nem encargos, e não existe nas outras onze abas.

Ou seja: o comparador PRICE × SAC pedido pelo item 30 do escopo é uma extensão
do aplicativo, não uma migração — o SAC é a única referência comportamental
para cronograma que a planilha oferece. `AL18` serve como âncora de validação
para o motor PRICE, e é assim que os testes a usam.

### 3.1 SAC mensal (Investimento, Giro Puro, Transportes, Mais Crédito)

```
juros(n)        = saldo(n-1) × taxa
amortizacao(n)  = 0                              se n ≤ carência
                = valorFinanciado / (prazo − carência)   caso contrário
saldo(n)        = saldo(n-1) − amortizacao(n)
prestacao(n)    = amortizacao(n) + juros(n)
```

Durante a carência a amortização é zero e **os juros são pagos**, não
capitalizados: o saldo devedor permanece constante e a prestação do período de
carência é exatamente o juro do mês. A amortização usa o valor inicial fixo,
não o saldo corrente — é o SAC clássico.

> **Inconsistência registrada, de efeito financeiro direto.** A base da
> amortização **muda no meio da própria coluna**. Em `Linhas Investimento`,
> `Linhas Transportes`, `Mais Crédito`, `Mais Crédito (2)` e `FCO Empresarial`,
> as parcelas 1 a 12 dividem o **valor solicitado** e as parcelas 13 em diante
> dividem o **valor financiado**:
>
> ```
> parcelas 1 a 12    →  amortizacao = valorSolicitado / (prazo − carência)
> parcelas 13 adiante→  amortizacao = valorFinanciado / (prazo − carência)
> ```
>
> Como o valor financiado é maior que o solicitado sempre que houver encargo
> financiado, as primeiras parcelas amortizam de menos e **o saldo não fecha**.
> No estado salvo de `Linhas Investimento` — R$ 100.000, 60 meses, 6 de
> carência, R$ 103.507,50 financiados — sobram R$ 389,72 depois da última
> parcela:
>
> ```
>  6 parcelas × 1.851,85  (base R$ 100.000,00)  =  11.111,11
> 48 parcelas × 1.916,81  (base R$ 103.507,50)  =  92.006,67
>                                       somado  = 103.117,78
>               103.507,50 − 103.117,78         =     389,72
> ```
>
> Não é resíduo de arredondamento — a planilha não arredonda em lugar nenhum,
> e R$ 389,72 é grande demais para isso. É a troca de base na linha 36.
> `Linhas Giro Puro` usa o valor financiado em toda a coluna e fecha em zero;
> `Linhas FINEP` faz a troca ao contrário, na parcela 220. Ver ABERTO-07.

### 3.2 SAC com dois componentes de juros (Fungetur e FINEP)

```
jurosFixo(n)      = ((1 + taxaFixa)^(22/252) − 1) × (saldo(n-1) + jurosIndexador(n))
jurosIndexador(n) = ((1 + indexador)^(22/252) − 1) × saldo(n-1)
amortizacao(n)    = 0  se n ≤ carência;  senão  valorFinanciado / (prazo − carência)
saldo(n)          = saldo(n-1) − amortizacao(n)
prestacao(n)      = jurosFixo(n) + jurosIndexador(n) + amortizacao(n)
```

As taxas dessas linhas são anuais e viram taxa do período pelo expoente
`22/252` — vinte e dois dias úteis num ano de duzentos e cinquenta e dois.

> **Observação técnica.** A base do juro fixo é `saldo + jurosIndexador`, não
> apenas o saldo: o juro do indexador entra na base do juro fixo do mesmo
> período. É uma capitalização parcial dentro do próprio período, e o juro do
> indexador não é somado ao saldo devedor — é pago na prestação. A regra é
> reproduzida como está.

### 3.3 SAC com periodicidade (FCO Empresarial, FCO Rural, Produtor Empreendedor)

O FCO permite pagar mensal, bimestral, trimestral, semestral ou anualmente.
Um seletor (`AN17`) escolhe entre cinco colunas paralelas. Sendo `p` o número
de meses do período (1, 2, 3, 6 ou 12), nos meses em que há pagamento:

```
juros(n)       = saldo(n-p) × ((1 + taxaMensal)^p − 1)
amortizacao(n) = valorFinanciado / (prazo − carência) × p
```

Nos demais meses não há pagamento. A taxa mensal vem da taxa anual por
`(1 + taxaAnual)^(1/12) − 1`. A planilha valida que carência e prazo sejam
múltiplos inteiros do período (`AL21`, `AL22`) — e é essa validação que revela
o ritmo: se a carência precisa ser múltipla do período, é porque o pagamento
periódico já corre durante ela, pagando só o juro acumulado.

> **Inconsistência registrada.** A periodicidade chega ao cronograma pela
> metade. A coluna de juros a consulta, mas a **coluna de amortização não**:
> `D` divide sempre por mês, `E$23/(prazo − carência)`, e as colunas `AU:AZ`,
> que calculam a amortização acumulada do período, só são lidas na primeira
> linha do cronograma. Escolher pagamento semestral produz juros semestrais e
> amortização mensal.
>
> Há ainda um segundo seletor, `AN18`, sem rótulo na planilha. Quando
> verdadeiro, os juros são periódicos durante a carência e voltam a ser
> mensais depois dela; quando falso, são periódicos o tempo todo. No estado
> salvo `AN18` é verdadeiro e `AN17` é 1, de modo que os dois caminhos
> coincidem e a diferença não aparece. Ver ABERTO-13.

### 3.4 Capitalização na carência (Produtor Empreendedor, linha 2)

Quando a linha 2 é escolhida, `BG21` fica verdadeiro e um segundo motor
assume — e ele trata a carência de modo oposto ao das demais abas:

```
saldo(n) = saldo(n-1) × (1 + taxa)      se n ≤ carência     ← juros capitalizados
         = saldo(n-1) − amortizacao(n)  caso contrário
amortizacao(n) = saldoAoFimDaCarencia / (prazo − carência)
prestacao(n)   = 0                       se n ≤ carência     ← nada é pago
```

O saldo ao fim da carência é lido por `XLOOKUP` sobre a própria coluna do
saldo. É a confirmação de que **carência não é uma coisa só nesta planilha**:
há duas regras distintas, e a escolha depende da linha de crédito.

## 4. Taxas

### 4.1 Unidades

A mesma grandeza aparece em três unidades diferentes:

| Aba | Unidade na tabela interna | Conversão até a taxa do período |
|---|---|---|
| `Linhas Giro Puro` | **pontos percentuais mensais** (`2,27`) | nenhuma |
| `Linhas Investimento`, `Transportes`, `Mais Crédito`, `Produtor` | decimal mensal (`0,0217`) | nenhuma |
| `FCO Empresarial`, `FCO Rural` | decimal **anual** (`0,088992`) | `(1+i)^(1/12) − 1` |
| `Linhas Fungetur`, `Linhas FINEP` | pontos percentuais **anuais** (`5`) | `/100`, depois `(1+i)^(22/252) − 1` |

> **Inconsistência registrada.** `Linhas Giro Puro` guarda as taxas em pontos
> percentuais enquanto todas as outras abas mensais usam decimal. A fórmula de
> seleção `=LARGE(C6:C13;1)` que as demais abas usam em `D16` devolveria
> `1,77` nessa aba — cento e setenta e sete por cento ao mês. A aba só produz
> número correto porque `D16` teve a fórmula **sobrescrita à mão** pelo valor
> `0,005`. Ver `MATRIZ_EXCEL_APLICATIVO.md`, item ABERTO-03.

### 4.2 Taxa cheia, taxa com bônus e taxa aplicada

A taxa que remunera o contrato é sempre a **taxa com bônus** (`D16` → `C23`).
A taxa cheia (`D15`) só é usada no fluxo da TIR sem bônus.

O bônus não tem uma regra única:

| Grupo | Como a taxa com bônus é obtida |
|---|---|
| Giro, Investimento, Tecnologia (13 linhas) | `taxaCheia × 0,77` |
| Transportes, Microcrédito | Taxa própria, tabelada, **que não é 0,77 da cheia** |
| FCO | Colunas próprias, por município prioritário e não prioritário |
| Fungetur, FINEP | Não há bônus; há indexador |

Confirmando o que o item 11 do escopo antecipava: `0,77` é regra de um grupo,
não constante do sistema. Em `GoiásFomento Taxi`, por exemplo, a cheia é
2,19% e a com bônus é 1,59% — `2,19 × 0,77 = 1,686`, que não é 1,59.

### 4.3 Seleção por garantia

Em `Investimento`, `Giro Puro` e `Transportes` a taxa com bônus depende da
classe de garantia, escolhida em `K4`:

- `K4 = 1` → coluna `Q` (CG1)
- `K4 = 2` → coluna `R` (CG2)
- `K4 = 3` → coluna `P` (taxa bônus sem garantia)

## 5. Valor financiado

`E23` monta o valor financiado a partir de três chaves: TAC descontada ou
financiada (`AA1`), IOF descontado ou financiado (`AB1`) e o tratamento da
garantia (`J16`). É uma tabela-verdade de onze ramos:

| TAC | IOF | Garantia | Valor financiado |
|---|---|---|---|
| desc. | desc. | 1 | `B15` |
| desc. | desc. | 2 | `B15 + garantia` |
| desc. | desc. | 3 | `B15` |
| desc. | fin. | 1 | `B15 + IOF` |
| desc. | fin. | 2 | `B15 + IOF + garantia` |
| desc. | fin. | 3 | `B15 + IOF` |
| fin. | desc. | 1 | `B15 + TAC` |
| fin. | desc. | 2 | `B15 + TAC + garantia` |
| fin. | desc. | 3 | **ausente** |
| fin. | fin. | 1 | `B15 + TAC + IOF` |
| fin. | fin. | 2 | `B15 + TAC + IOF + garantia` |
| fin. | fin. | 3 | `B15 + TAC + IOF` |

> **Inconsistência registrada.** A combinação TAC financiada + IOF descontado
> + garantia 3 não tem ramo. O `IF` encadeado cai no fim sem valor e devolve
> `FALSO`, que propaga para todo o cronograma. Ver ABERTO-01.

## 6. TAC

A escada da TAC aparece duas vezes, com formas diferentes.

**Forma de referência** (`I15`), a escada limpa:

```
valor ≤ 3.000                    →  R$ 50,00
3.000 < valor ≤ 21.000           →  3% do valor, limitado a R$ 420,00
21.000 < valor ≤ 100.000         →  2% do valor
valor > 100.000                  →  R$ 2.000,00 + 0,5% do valor
```

**Forma aplicada** (`F15`), que é a que entra no valor financiado:

```
se TAC descontada:
    valor ≤ 3.000            →  50
    valor ≤ 21.000           →  se valor × 0,03 ≤ 420 então valor × 1,015 × 0,03 senão 420
    valor ≤ 100.000          →  valor × 0,02
    acima                    →  2.000 + valor × 0,005
se TAC financiada:
    valor × 1,015 ≤ 3.000    →  50
    valor × 1,015 ≤ 21.000   →  se valor × 1,015 × 0,03 ≤ 420 então valor × 1,015 × 0,03 senão 420
    valor ≤ 100.000          →  valor × 1,015 × 0,02
    acima                    →  2.000 + valor × 1,015 × 0,005
```

> **Inconsistência registrada.** No ramo da TAC descontada, a faixa dos 3%
> **testa** o limite sobre `valor × 0,03` mas **cobra** `valor × 1,015 × 0,03`.
> Como o teste e o valor cobrado usam bases diferentes, a TAC pode ultrapassar
> o teto de R$ 420,00 que o próprio teste pretende impor: em R$ 14.000, o teste
> dá 420,00 e passa, mas o valor cobrado é R$ 426,30. O fator `1,015` também
> aparece na faixa dos 3% mas não nas faixas de 2% e 0,5% do mesmo ramo.
> Ver ABERTO-02.

## 7. IOF

Três alíquotas, todas guardadas na própria aba:

| Alíquota | Valor | Base |
|---|---|---|
| Adicional | 0,38% | Valor liberado, uma vez |
| Diária normal | 0,0041% ao dia | Cada parcela de amortização |
| Diária simples | 0,00137% ao dia | Cada parcela de amortização |

O IOF diário é calculado parcela a parcela, e **os dias são contados desde a
liberação, com teto de 365 dias**:

```
dias(n) = dataVencimento(n) − dataLiberacao
iof(n)  = min(dias(n), 365) × aliquotaDiaria × amortizacao(n)
```

A soma total é montada assim:

```
IOF = 0                                            se o IOF não incide
    = adicional + Σ iofSimples(n)                  se aplicável e valor ≤ 30.000
    = adicional + Σ iofNormal(n)                   caso contrário
```

E, quando o IOF é financiado, o total ainda é multiplicado por `1,03`.

A amortização usada na base do IOF é `B15/(prazo − carência)` — o **valor
solicitado**, não o financiado. As datas avançam de trinta em trinta dias a
partir da data da proposta; a planilha não usa calendário civil.

## 8. Garantias

Três modalidades, selecionadas por `L24`:

| Código | Modalidade | Fórmula |
|---|---|---|
| 1 | FAMPE | `valor × percentualGarantido × 0,001 × prazo` |
| 2 | FGI | `(K × VL × %G × P) / (1 − K × %G × P)` |
| 3 | FUNDEQ | `valor × percentualGarantido × 0,001 × prazo` |

FAMPE e FUNDEQ têm fórmula idêntica na planilha.

### 8.1 FGI

```
K   = fator K, buscado por XLOOKUP exato sobre o prazo total
VL  = valorFinanciado + TAC + IOF
%G  = percentual garantido (0,8 no estado salvo; mínimo 0,2)
P   = prazo total em meses
ECG = (K × (VL × %G) × P) / (1 − (K × %G × P))
```

A busca é **exata**: `XLOOKUP` sem modo de correspondência. Prazo sem fator
resulta em `#N/A`, e não em interpolação. A tabela cobre 3 a 103 meses.

> **Inconsistência registrada.** A linha 100 da tabela repete o prazo 84 com
> fator 0,0006, enquanto a linha 90 já traz 84 com fator 0,0007. Como o
> `XLOOKUP` devolve a primeira ocorrência, a segunda entrada é inalcançável e
> não altera resultado nenhum. A sequência salta de 93 para 84 e volta para
> 94, o que sugere erro de digitação. Ver ABERTO-04.

> **Limite registrado.** Linhas com prazo acima de 103 meses — FCO Verde
> (240), FCO Empresarial (144), Fungetur Capital Fixo (240), FINEP Aquisição
> Inovadora (120) — não têm fator K. Ver ABERTO-05.

### 8.2 Renda para aval e alienação de imóvel

```
rendaParaAval    = max(maiorPrestacao × 3;  2.424,00)
alienacaoImovel  = (valorSolicitado − parteGarantidaFGI) × 1,5 / 0,7
```

O piso de R$ 2.424,00 está escrito diretamente na fórmula, sem rótulo.

## 9. TIR

Duas colunas de fluxo, `AJ` (com bônus) e `AK` (sem bônus):

```
fluxo(0) = − valorSolicitado
fluxo(n) = prestacao(n)     para n de 1 até o prazo
TIR      = IRR(fluxo)
```

A planilha chama isso de TIR, e não de CET — a nomenclatura foi preservada.

> **Inconsistência registrada.** Em `Linhas Giro Puro`, o fluxo sem bônus usa
> `$D$15`, a taxa cheia, mas essa célula **está vazia** nessa aba. O produto
> vira zero, o fluxo degenera e a TIR sem bônus resulta `#VALUE!`.
> Ver ABERTO-06.

## 10. Preenchimento incompleto do cronograma

Este é o achado de maior efeito prático. As fórmulas do cronograma **não foram
arrastadas até o fim** em nenhuma aba, e cada coluna para numa linha diferente:

| Aba | Parcelas com fórmula completa | Prazo máximo das linhas da aba |
|---|---|---|
| `Linhas Giro Puro` | 48 | 36 |
| `Linhas Investimento` | 63 | 60 |
| `Linhas Transportes` | 63 | 60 |
| `Mais Crédito` | 48 | 36 |
| `Linhas Fungetur` | 240 | 240 |
| `Linhas FINEP` | 240 | 120 |
| `FCO Empresarial` | 185 | 144 |
| `FCO Rural` | 280 | 240 |
| `Produtor Empreendedor` | 72 | 240 |

Dentro do prazo permitido por cada linha o cronograma se sustenta — exceto em
`Produtor Empreendedor`, cuja linha de 240 meses excede em muito as 72
parcelas preenchidas. O estado salvo de `Linhas Giro Puro` tem prazo 60, acima
do teto de 36 da própria aba, e é daí que vêm as 29 células em erro dessa aba:
o saldo da parcela 49 é texto vazio, e a multiplicação por texto dá `#VALUE!`.

O efeito colateral é mais sério que o erro visível: os totais somam faixas
fixas (`SUM(F23:F242)`, `SUM(AG30:AG83)`) que incluem as linhas vazias, de
modo que **o total simplesmente ignora as parcelas não preenchidas, sem
sinalizar nada**. Um prazo de 60 em `Linhas Giro Puro` produz um total de
prestações que corresponde a 48 parcelas.

No aplicativo isso não se reproduz: o cronograma é gerado por laço, com o
número de parcelas que o prazo pedir. A regra é a fórmula; o limite de linhas
é acidente de planilha. A consequência para os testes de equivalência está
registrada em `PLANO_DE_TESTES.md`.

## 11. Blocos fora do escopo do simulador

As colunas `AL`–`AR` das abas mensais e `BB`–`BD` das abas de FCO calculam
receita, despesa e margem da operação para a instituição — não são encargos do
cliente e não entram no cronograma. Ficam registradas aqui para que não sejam
confundidas com encargos, e não serão migradas ao MVP.


## 12. Arredondamento

**A planilha não arredonda em momento algum do cálculo.** Não há `ARRED`,
`ROUND`, `TRUNC`, `TETO` nem `MOEDA` em nenhuma das 32.580 fórmulas; as seis
ocorrências de `INT` são as validações de periodicidade do FCO, que checam se
prazo e carência são múltiplos inteiros do período.

Todos os valores monetários trafegam em precisão dupla completa, do saldo
inicial até o total. Os dois centavos que aparecem na tela vêm apenas do
formato de célula `"R$" #,##0.00`.

A regra para o motor é, portanto: **precisão total no cálculo, arredondamento
só na apresentação**. `roundMoney()` existe para formatar e para comparar, não
para conduzir a conta. Qualquer arredondamento intermediário afastaria o
resultado do da planilha.

Como consequência, o saldo final legítimo de um SAC bem formado é zero a menos
de erro de ponto flutuante — algo da ordem de 10⁻¹⁰. Um resíduo de centavos ou
mais não é arredondamento: é regra, e deve ser exibido, como manda o item 24 do
escopo. O caso de `Linhas Investimento` acima é exatamente isso.
