# Plano de testes

Os testes são a referência de validação. Um motor só é considerado pronto
quando os casos desta lista passam.

## 1. Estrutura

```
simulador/tests/
├── base.test.js           Arredondamento, unidade de taxa e calendário
├── sac.test.js            SAC nas suas quatro variantes
├── price.test.js          PRICE, incluindo a âncora AL18
├── encargos.test.js       TAC, IOF, FGI, FAMPE, FUNDEQ, aval, alienação
├── produtos.test.js       Cada linha de crédito, com os seus limites
└── equivalencia.test.js   Planilha × aplicativo, valor a valor
```

`base.test.js` não estava no plano original. Foi acrescentado porque é nas
primitivas que os erros silenciosos nascem: uma taxa lida como 2,17 em vez de
0,0217 erra por cem vezes sem dar sinal, e sai mais barato pegar isso ali do
que dentro de um cronograma de duzentas parcelas.

Sem dependência externa: `node --test`, que já vem no Node 18 e adiante. O
aplicativo é estático e não tem etapa de build; os testes rodam com
`node --test simulador/tests/`.

## 2. Tolerância

**R$ 0,01 para valores monetários** é o padrão, e ela é generosa: a planilha
não arredonda em nenhuma etapa, de modo que o motor deve bater com ela em
precisão dupla. A tolerância existe para absorver diferença de ordem de
operações, não arredondamento.

- Valores monetários: `±0,01`
- Taxas e TIR: `±1e-9`
- Saldo final de um SAC bem formado: `±1e-6` de zero

Se algum caso exigir tolerância maior, isso é achado, não ajuste: significa que
uma regra de arredondamento passou despercebida na auditoria, e ela precisa ser
documentada antes de a tolerância ser afrouxada.

## 3. Âncoras extraídas da planilha

O estado salvo de cada aba é um caso de teste completo, com entrada e saída já
calculadas pelo Excel. São estes os valores de referência.

### CASO 001 · `Linhas Investimento`

```
Entrada     valor 100.000,00 · prazo 60 · carência 6 · taxa 1,65% a.m.
            TAC financiada · IOF financiado · sem garantia financiada
Encargos    TAC        2.000,00
            IOF        1.507,50
            financiado 103.507,50
Parcela 1   juros 1.707,87375 · amortização 0 · saldo 103.507,50
Parcela 7   juros 1.707,87375 · amortização 1.851,851851851852
            saldo 101.655,64814814815 · prestação 3.559,725601851852
Parcela 60  juros 38,05770833333201 · amortização 1.916,8055555555557
            saldo 389,7222222221417 · prestação 1.954,8632638888876
TIR         com bônus 0,017859866497962784 · sem bônus 0,02207331730268325
PMT (AL18)  2.729,684637819343
```

O saldo final de R$ 389,72 é o efeito de ABERTO-07. O caso é executado duas
vezes: com `baseAmortizacao: "planilha"`, que deve reproduzir o resíduo, e com
`"valorFinanciado"`, que deve fechar em zero.

### CASO 002 · `Linhas Giro Puro`

```
Entrada     valor 60.000,00 · prazo 60 · carência 6 · taxa 0,5% a.m.
Encargos    TAC 1.218,00 · IOF 931,635 · financiado 62.149,635
Parcela 1   juros 310,748175 · amortização 0 · saldo 62.149,635
Parcela 7   juros 310,748175 · amortização 1.150,9191666666668
            saldo 60.998,715833333335
Aval        4.385,002025
Alienação   128.571,42857142858
```

O prazo de 60 excede o teto de 36 da própria aba, e a planilha calcula assim
mesmo. O aplicativo deve recusar com `PRAZO_INVALIDO`; o caso de equivalência
roda com a validação desligada.

### CASO 003 · FGI

```
Entrada     prazo 60 · valor 60.000,00 · TAC 1.218,00 · IOF 931,635 · %G 0,8
K           0,001
VL          62.149,635
ECG         3.133,5950420168074
```

### CASO 004 · `FCO Empresarial`, mensal

```
Entrada     valor 1.000.000,00 · prazo 84 · carência 12
            taxa nominal 11,1241% a.a. · com bônus 10,267% a.a.
Conversão   taxa mensal 0,008177799635617378
Financiado  1.007.000,00 (TAC 7.000,00)
Parcela 1   juros 8.235,0442330667 · amortização 13.986,111111111111
```

### CASO 005 · `Linhas Fungetur`

```
Entrada     valor 1.000.000,00 · prazo 60 · carência 3
            taxa fixa 5% a.a. · indexador 10% a.a.
Financiado  1.007.000,00
Parcela 1   juros fixo 4.334,338197110748
```

Valida a conversão `(1+i)^(22/252) − 1` e a base composta do juro fixo.

### CASO 006 · `Produtor Empreendedor`, com capitalização

```
Entrada     valor 50.000,00 · prazo 48 · carência 18 · taxa 0,5% a.m.
Base        54.597,20  (valor + garantia 2.400,00 + TAC 1.000,00 + IOF 1.197,20)
Parcela 1   saldo 54.870,185999999994 · prestação 0
```

Valida o motor de carência capitalizada e a prestação zero na carência.

## 4. SAC

| Caso | Cenário | Verificação |
|---|---|---|
| SAC-01 | Sem carência | Amortização constante; saldo final zero |
| SAC-02 | Com carência, juros pagos | Saldo constante na carência; prestação igual ao juro |
| SAC-03 | Com carência, juros capitalizados | Saldo cresce; prestação zero na carência |
| SAC-04 | Prazo mínimo, 1 parcela | Uma parcela; saldo final zero |
| SAC-05 | Prazo máximo, 240 parcelas | 240 parcelas; saldo final zero |
| SAC-06 | Taxa zero | Juros zero em todas; prestação igual à amortização |
| SAC-07 | Taxa elevada, 10% a.m. | Sem estouro; juros decrescentes |
| SAC-08 | Carência igual a prazo menos 1 | Uma parcela amortizante, com todo o principal |
| SAC-09 | Carência igual ao prazo | `CARENCIA_INVALIDA` |
| SAC-10 | Periodicidade semestral | Pagamento só de seis em seis meses; zero no meio |
| SAC-11 | Periodicidade não múltipla do prazo | `PERIODICIDADE_INCOMPATIVEL` |
| SAC-12 | Última parcela | Saldo final a menos de 1e-6 de zero |
| SAC-13 | Soma das amortizações | Igual ao valor financiado, a menos de 1e-6 |
| SAC-14 | Base de amortização `"planilha"` | Reproduz a troca na parcela 13 e o resíduo |

## 5. PRICE

Os mesmos cenários SAC-01 a SAC-09, mais:

| Caso | Cenário | Verificação |
|---|---|---|
| PRICE-01 | Prestação constante | Todas as prestações iguais, a menos de 0,01 |
| PRICE-02 | Amortização crescente | Cada amortização maior que a anterior |
| PRICE-03 | Taxa zero | `PMT = VP/n`, sem divisão por zero |
| PRICE-04 | Âncora `AL18` | `PMT(0,017859866497962784; 60; −100.000)` = 2.729,6846378193432, com tolerância de 1e-9 — a rotina interna do Excel arredonda o último bit de outro jeito, e a diferença é de três quartos de um ULP |
| PRICE-05 | Última parcela | Saldo final a menos de 1e-6 de zero — sem arredondamento intermediário, o erro acumulado em 240 parcelas não passa de 10⁻⁹ |
| PRICE-06 | Carência capitalizada | O juro da primeira parcela amortizante incide sobre o saldo crescido |
| PRICE-07 | Base divergente e indexador | `PARAMETRO_INCOMPATIVEL`, em vez de inventar regra |

## 6. Encargos

### TAC — as faixas e as suas bordas, conforme o item 37 do escopo

| Valor | Faixa | Modo referência | Modo planilha, TAC descontada |
|---|---|---|---|
| R$ 1,00 | fixo | 50,0000 | 50,0000 |
| R$ 100,00 | fixo | 50,0000 | 50,0000 |
| R$ 3.000,00 | fixo, borda superior | 50,0000 | 50,0000 |
| R$ 3.000,01 | 3% | 90,0003 | 91,3503 |
| R$ 14.000,00 | 3%, onde o teto encosta | 420,0000 | **426,3000** |
| R$ 21.000,00 | 3% travado no teto | 420,0000 | 420,0000 |
| R$ 21.000,01 | 2% | 420,0002 | 420,0002 |
| R$ 100.000,00 | 2%, borda superior | 2.000,0000 | 2.000,0000 |
| R$ 100.000,01 | fixo mais percentual | 2.500,0001 | 2.500,0001 |
| R$ 2.000.000,00 | teto das linhas | 12.000,0000 | 12.000,0000 |

O caso de R$ 14.000,00 é o que demonstra ABERTO-02: o teste do teto passa com
420,00, mas o valor cobrado é 426,30 — seis reais e trinta acima do teto que o
próprio teste pretendia impor. É o único valor da tabela em que os dois modos
divergem por causa do teto; em R$ 3.000,01 a divergência vem do fator `1,015`
aplicado à faixa de 3%.

A escada é contínua na borda dos R$ 21.000,00: a faixa de 3% já está travada em
420,00 e a de 2% começa em 420,0002.

### IOF

| Caso | Cenário | Verificação |
|---|---|---|
| IOF-01 | Adicional | 0,38% do valor liberado |
| IOF-02 | Prazo curto, menos de 365 dias | Proporcional aos dias |
| IOF-03 | Prazo longo | Nenhuma parcela passa de 365 dias de base |
| IOF-04 | Valor de R$ 30.000,00 | Usa a alíquota simples |
| IOF-05 | Valor de R$ 30.000,01 | Usa a alíquota normal |
| IOF-06 | Financiado | Total multiplicado por 1,03 |
| IOF-07 | Não incidente | Zero |
| IOF-08 | Base | Valor solicitado, não o financiado |

### FGI

| Caso | Cenário | Verificação |
|---|---|---|
| FGI-01 | Prazo 3 | K = 0,0142 |
| FGI-02 | Prazo 60 | K = 0,001 |
| FGI-03 | Prazo 84 | K = 0,0007, a primeira ocorrência — ABERTO-04 |
| FGI-04 | Prazo 103 | K = 0,0005 |
| FGI-05 | Prazo 2 | `FATOR_K_NAO_ENCONTRADO` |
| FGI-06 | Prazo 104 | `FATOR_K_NAO_ENCONTRADO` — ABERTO-05 |
| FGI-07 | Prazo 61,5 | `FATOR_K_NAO_ENCONTRADO`, sem interpolação |
| FGI-08 | Fórmula | Reproduz o CASO 003 |

### Garantias

| Caso | Cenário | Verificação |
|---|---|---|
| GAR-01 | FAMPE | `valor × %G × 0,001 × prazo` |
| GAR-02 | FUNDEQ | Mesmo resultado do FAMPE |
| GAR-03 | Renda para aval, parcela alta | `maiorPrestacao × 3` |
| GAR-04 | Renda para aval, parcela baixa | Piso de R$ 2.424,00 |
| GAR-05 | Alienação de imóvel, com FGI | Desconta a parte garantida |
| GAR-06 | Percentual garantido abaixo de 0,2 | Erro de validação |

## 7. Produtos

Uma bateria por linha, sobre as 39 linhas da `Tabela de Encargos` e as 53 das
abas de produto. Para cada uma:

1. Valor no limite exato → aceito.
2. Valor um centavo acima → `VALOR_ACIMA_DO_LIMITE`.
3. Prazo no teto → aceito. Prazo um mês acima → `PRAZO_INVALIDO`.
4. Carência no teto → aceita. Um mês acima → `CARENCIA_INVALIDA`.
5. Taxa com bônus confere com a `Tabela de Encargos`.
6. Onde houver bônus por fator, `cheia × 0,77` reproduz a tabelada.
7. FCO: prioritário e não prioritário dão taxas distintas.
8. FINEP: porte I e II contra porte III.
9. Linhas com `#REF!` na seleção → `REGRA_EM_ABERTO`, e nunca um número.

## 8. Equivalência

Para cada um dos seis casos âncora, a comparação é valor a valor: cada parcela
do cronograma, cada encargo, cada total, cada TIR. O relatório
`EQUIVALENCIA_EXCEL.md` é gerado pela execução e traz, por caso, a entrada, o
valor do Excel, o valor do JavaScript e o veredito.

Duas divergências são **esperadas e aprovadas**, porque o defeito está na
planilha e está documentado:

1. **Totais em prazo acima do preenchimento** (ABERTO-08). Onde a planilha soma
   uma faixa fixa de linhas, o aplicativo soma o cronograma inteiro. Em
   `Linhas Giro Puro` com prazo 60, a planilha totaliza 48 parcelas e o
   aplicativo, 60. O teste confere que a divergência é exatamente a soma das
   parcelas que a planilha deixou de fora, e falha se for outra coisa.

2. **Células em erro.** Onde a planilha traz `#REF!`, `#VALUE!` ou `#N/A`, o
   aplicativo devolve erro estruturado. O teste confere que **há** erro dos
   dois lados, não que os valores coincidem.

Fora essas duas, qualquer divergência reprova.

## 9. Ordem de execução

Segue as fases do escopo. Cada fase só avança com a anterior verde:

```
Fase 4-5    base.test.js e sac.test.js
Fase 6-7    price.test.js
Fase 8      encargos.test.js
Fase 9-10   produtos.test.js
Fase 15     equivalencia.test.js
```
