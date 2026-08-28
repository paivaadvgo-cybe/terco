# Relatório de equivalência — planilha × aplicativo

Comparação célula a célula entre o estado salvo de cada aba de
`Simulador_GoiasFomento 08-05-2025.xlsx` e o resultado do motor do aplicativo.

Os casos não foram transcritos. Saem da própria planilha, por
`ferramentas/extrair_casos.py`, com todos os dígitos que o Excel gravou — e a
mesma comparação que produziu este documento roda como teste automatizado em
`tests/equivalencia.test.js`. O relatório não pode, portanto, afirmar uma
aprovação que os testes não sustentem.

**Parâmetros 2024-12-16 · motor 0.1.0 · gerado em 2026-08-28**

## Resumo

| | |
|---|---|
| Abas comparadas | 9 de 9 abas de produto |
| Parcelas conferidas | 468 |
| Valores comparados | 1872 |
| Idênticos ao último bit | **1872** (100.0%) |
| Maior diferença | **zero** |
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

A planilha totaliza percorrendo intervalos de tamanho fixo — `SUM(F23:F242)`,
`SUM(AG30:AG83)` — independentes do prazo do contrato. Como as fórmulas do
cronograma não foram arrastadas até o fim, esses intervalos incluem linhas
vazias, e o total corresponde a menos parcelas do que a operação tem.

O teste do IOF **procura** o ponto de corte em vez de presumi-lo: se existe um
número de parcelas cuja soma dá exatamente o valor da planilha, a diferença é
truncamento e nada mais. Se não existisse, seria divergência de regra, e o
teste falharia.

### 2 · TIR de `Linhas Giro Puro`

Nessa aba as fórmulas param na parcela 48 de um contrato de 60. O fluxo que
chega ao `IRR` tem doze parcelas a menos e devolve **taxa negativa** —
−0,11% ao mês para um contrato que rende juros. O motor, com o contrato
inteiro, devolve taxa positiva; e reproduz o número da planilha quando recebe o
mesmo fluxo curto, o que prova que a divergência é o fluxo, não a regra.

## Fora do alcance desta comparação

- **Linhas com `#REF!`** (ABERTO-12) e **a linha sem taxa** (ABERTO-14): a
  planilha não produz valor, e o aplicativo recusa a simular. Não há o que
  comparar, e é assim que deve ser.
- **IOF de Fungetur, FINEP e FCO**: nas duas primeiras a célula que parecia o
  IOF é, na verdade, o encargo do FAMPE — o rótulo ao lado diz «CCA FAMPE»; no
  FCO o IOF não incide (`L19` é falso).
- **PRICE**: a planilha não tem cronograma de prestação constante. A única
  âncora é a célula `AL18`, conferida em `tests/price.test.js`.

## CASO 001 · Linhas Investimento

**Entrada** — o estado salvo da aba, lido do arquivo.

| Campo | Valor |
|---|---|
| Valor solicitado | R$ 100.000,00 |
| Valor financiado | R$ 103.507,50 |
| Prazo | 60 meses |
| Carência | 6 meses |
| Taxa | 0.0165 mensal |
| Conversão | (1+i)^(1/12) − 1 |
| Base da amortização | planilha |
| Tratamento da carência | juros pagos |

**Cronograma** — 60 parcelas conferidas, uma a uma.

| Parcela | Campo | Excel | JavaScript | Δ |
|---|---|---|---|---|
| 1 | juros | `1707.87375` | `1707.87375` | **0** |
| 1 | amortização | `0` | `0` | **0** |
| 1 | saldo | `103507.5` | `103507.5` | **0** |
| 1 | prestação | `1707.87375` | `1707.87375` | **0** |
| 7 | juros | `1707.87375` | `1707.87375` | **0** |
| 7 | amortização | `1851.851851851852` | `1851.851851851852` | **0** |
| 7 | saldo | `101655.64814814815` | `101655.64814814815` | **0** |
| 7 | prestação | `3559.725601851852` | `3559.725601851852` | **0** |
| 31 | juros | `955.249166666665` | `955.249166666665` | **0** |
| 31 | amortização | `1916.8055555555557` | `1916.8055555555557` | **0** |
| 31 | saldo | `55977.083333333234` | `55977.083333333234` | **0** |
| 31 | prestação | `2872.054722222221` | `2872.054722222221` | **0** |
| 60 | juros | `38.05770833333201` | `38.05770833333201` | **0** |
| 60 | amortização | `1916.8055555555557` | `1916.8055555555557` | **0** |
| 60 | saldo | `389.7222222221417` | `389.7222222221417` | **0** |
| 60 | prestação | `1954.8632638888876` | `1954.8632638888876` | **0** |

**Encargos e indicadores**

| Item | Excel | JavaScript | Δ | |
|---|---|---|---|---|
| TAC | `2000` | `2000` | **0** | ✓ idêntico |
| Renda para aval | `10679.176805555555` | `10679.176805555555` | **0** | ✓ idêntico |
| Alienação de imóvel | `214285.7142857143` | `214285.7142857143` | **0** | ✓ idêntico |
| IOF adicional | `380` | `380` | **0** | ✓ idêntico |
| TIR com bônus | `0.017859866497962784` | `0.01785986649797638` | 1.36e-14 | ✓ dentro da tolerância |

**Resultado: ✓ APROVADO — todos os valores do cronograma idênticos ao último bit**

---

## CASO 002 · Linhas Giro Puro

**Entrada** — o estado salvo da aba, lido do arquivo.

| Campo | Valor |
|---|---|
| Valor solicitado | R$ 60.000,00 |
| Valor financiado | R$ 62.149,64 |
| Prazo | 60 meses |
| Carência | 6 meses |
| Taxa | 0.005 mensal |
| Conversão | (1+i)^(1/12) − 1 |
| Base da amortização | valorFinanciado |
| Tratamento da carência | juros pagos |

**Cronograma** — 48 parcelas conferidas, uma a uma. A planilha só calculou 48 das 60 do contrato; as demais não têm valor para comparar (ABERTO-08).

| Parcela | Campo | Excel | JavaScript | Δ |
|---|---|---|---|---|
| 1 | juros | `310.748175` | `310.748175` | **0** |
| 1 | amortização | `0` | `0` | **0** |
| 1 | saldo | `62149.635` | `62149.635` | **0** |
| 1 | prestação | `310.748175` | `310.748175` | **0** |
| 7 | juros | `310.748175` | `310.748175` | **0** |
| 7 | amortização | `1150.9191666666668` | `1150.9191666666668` | **0** |
| 7 | saldo | `60998.715833333335` | `60998.715833333335` | **0** |
| 7 | prestação | `1461.6673416666667` | `1461.6673416666667` | **0** |
| 25 | juros | `207.16545000000002` | `207.16545000000002` | **0** |
| 25 | amortização | `1150.9191666666668` | `1150.9191666666668` | **0** |
| 25 | saldo | `40282.17083333334` | `40282.17083333334` | **0** |
| 25 | prestação | `1358.0846166666668` | `1358.0846166666668` | **0** |
| 48 | juros | `74.80974583333337` | `74.80974583333337` | **0** |
| 48 | amortização | `1150.9191666666668` | `1150.9191666666668` | **0** |
| 48 | saldo | `13811.030000000006` | `13811.030000000006` | **0** |
| 48 | prestação | `1225.7289125000002` | `1225.7289125000002` | **0** |

**Encargos e indicadores**

| Item | Excel | JavaScript | Δ | |
|---|---|---|---|---|
| TAC | `1217.9999999999998` | `1217.9999999999998` | **0** | ✓ idêntico |
| Renda para aval | `4385.002025` | `4385.002025` | **0** | ✓ idêntico |
| Alienação de imóvel | `128571.42857142858` | `128571.42857142858` | **0** | ✓ idêntico |
| IOF adicional | `228` | `228` | **0** | ✓ idêntico |
| TIR com bônus | `-0.0010961245385661122` | `0.006169536553515513` | 7.27e-3 | ⚠ divergência conhecida — ABERTO-08 |

**Resultado: ✓ APROVADO — todos os valores do cronograma idênticos ao último bit**

> A divergência assinalada acima não é do motor. A planilha só calculou 48 das 60 parcelas do contrato, e o indicador foi apurado sobre esse fluxo curto. Ver a seção de divergências esperadas, no começo deste documento.

---

## CASO 003 · Linhas Transportes

**Entrada** — o estado salvo da aba, lido do arquivo.

| Campo | Valor |
|---|---|
| Valor solicitado | R$ 44.000,00 |
| Valor financiado | R$ 45.603,43 |
| Prazo | 36 meses |
| Carência | 0 meses |
| Taxa | 0.0165 mensal |
| Conversão | (1+i)^(1/12) − 1 |
| Base da amortização | planilha |
| Tratamento da carência | juros pagos |

**Cronograma** — 36 parcelas conferidas, uma a uma.

| Parcela | Campo | Excel | JavaScript | Δ |
|---|---|---|---|---|
| 1 | juros | `752.4566500000001` | `752.4566500000001` | **0** |
| 1 | amortização | `1222.2222222222222` | `1222.2222222222222` | **0** |
| 1 | saldo | `44381.211111111115` | `44381.211111111115` | **0** |
| 1 | prestação | `1974.6788722222223` | `1974.6788722222223` | **0** |
| 19 | juros | `385.04720833333374` | `385.04720833333374` | **0** |
| 19 | amortização | `1266.762037037037` | `1266.762037037037` | **0** |
| 19 | saldo | `22069.43240740743` | `22069.43240740743` | **0** |
| 19 | prestação | `1651.8092453703707` | `1651.8092453703707` | **0** |
| 36 | juros | `29.720456944444713` | `29.720456944444713` | **0** |
| 36 | amortização | `1266.762037037037` | `1266.762037037037` | **0** |
| 36 | saldo | `534.477777777794` | `534.477777777794` | **0** |
| 36 | prestação | `1296.4824939814819` | `1296.4824939814819` | **0** |

**Encargos e indicadores**

| Item | Excel | JavaScript | Δ | |
|---|---|---|---|---|
| TAC | `880` | `880` | **0** | ✓ idêntico |
| Renda para aval | `5924.036616666666` | `5924.036616666666` | **0** | ✓ idêntico |
| Alienação de imóvel | `94285.71428571429` | `94285.71428571429` | **0** | ✓ idêntico |
| IOF adicional | `167.2` | `167.2` | **0** | ✓ idêntico |

**Resultado: ✓ APROVADO — todos os valores do cronograma idênticos ao último bit**

---

## CASO 004 · Mais Crédito

**Entrada** — o estado salvo da aba, lido do arquivo.

| Campo | Valor |
|---|---|
| Valor solicitado | R$ 5.000,00 |
| Valor financiado | R$ 5.000,00 |
| Prazo | 36 meses |
| Carência | 6 meses |
| Taxa | 0.0169 mensal |
| Conversão | (1+i)^(1/12) − 1 |
| Base da amortização | planilha |
| Tratamento da carência | juros pagos |

**Cronograma** — 36 parcelas conferidas, uma a uma.

| Parcela | Campo | Excel | JavaScript | Δ |
|---|---|---|---|---|
| 1 | juros | `84.49999999999999` | `84.49999999999999` | **0** |
| 1 | amortização | `0` | `0` | **0** |
| 1 | saldo | `5000` | `5000` | **0** |
| 1 | prestação | `84.49999999999999` | `84.49999999999999` | **0** |
| 7 | juros | `84.49999999999999` | `84.49999999999999` | **0** |
| 7 | amortização | `166.66666666666666` | `166.66666666666666` | **0** |
| 7 | saldo | `4833.333333333333` | `4833.333333333333` | **0** |
| 7 | prestação | `251.16666666666663` | `251.16666666666663` | **0** |
| 19 | juros | `50.69999999999999` | `50.69999999999999` | **0** |
| 19 | amortização | `166.66666666666666` | `166.66666666666666` | **0** |
| 19 | saldo | `2833.333333333333` | `2833.333333333333` | **0** |
| 19 | prestação | `217.36666666666665` | `217.36666666666665` | **0** |
| 36 | juros | `2.8166666666666673` | `2.8166666666666673` | **0** |
| 36 | amortização | `166.66666666666666` | `166.66666666666666` | **0** |
| 36 | saldo | `5.684341886080802e-14` | `5.684341886080802e-14` | **0** |
| 36 | prestação | `169.48333333333332` | `169.48333333333332` | **0** |

**Encargos e indicadores**

| Item | Excel | JavaScript | Δ | |
|---|---|---|---|---|
| TAC | `150` | `150` | **0** | ✓ idêntico |
| Renda para aval | `2424` | `2424` | **0** | ✓ idêntico |
| IOF adicional | `19` | `19` | **0** | ✓ idêntico |

**Resultado: ✓ APROVADO — todos os valores do cronograma idênticos ao último bit**

---

## CASO 005 · Mais Crédito (2)

**Entrada** — o estado salvo da aba, lido do arquivo.

| Campo | Valor |
|---|---|
| Valor solicitado | R$ 21.000,00 |
| Valor financiado | R$ 21.000,00 |
| Prazo | 36 meses |
| Carência | 6 meses |
| Taxa | 0.0169 mensal |
| Conversão | (1+i)^(1/12) − 1 |
| Base da amortização | planilha |
| Tratamento da carência | juros pagos |

**Cronograma** — 36 parcelas conferidas, uma a uma.

| Parcela | Campo | Excel | JavaScript | Δ |
|---|---|---|---|---|
| 1 | juros | `354.9` | `354.9` | **0** |
| 1 | amortização | `0` | `0` | **0** |
| 1 | saldo | `21000` | `21000` | **0** |
| 1 | prestação | `354.9` | `354.9` | **0** |
| 7 | juros | `354.9` | `354.9` | **0** |
| 7 | amortização | `700` | `700` | **0** |
| 7 | saldo | `20300` | `20300` | **0** |
| 7 | prestação | `1054.9` | `1054.9` | **0** |
| 19 | juros | `212.93999999999997` | `212.93999999999997` | **0** |
| 19 | amortização | `700` | `700` | **0** |
| 19 | saldo | `11900` | `11900` | **0** |
| 19 | prestação | `912.9399999999999` | `912.9399999999999` | **0** |
| 36 | juros | `11.829999999999998` | `11.829999999999998` | **0** |
| 36 | amortização | `700` | `700` | **0** |
| 36 | saldo | `0` | `0` | **0** |
| 36 | prestação | `711.83` | `711.83` | **0** |

**Encargos e indicadores**

| Item | Excel | JavaScript | Δ | |
|---|---|---|---|---|
| TAC | `420` | `420` | **0** | ✓ idêntico |
| Renda para aval | `3164.7000000000003` | `3164.7000000000003` | **0** | ✓ idêntico |
| IOF adicional | `79.8` | `79.8` | **0** | ✓ idêntico |

**Resultado: ✓ APROVADO — todos os valores do cronograma idênticos ao último bit**

---

## CASO 006 · Linhas Fungetur

**Entrada** — o estado salvo da aba, lido do arquivo.

| Campo | Valor |
|---|---|
| Valor solicitado | R$ 1.000.000,00 |
| Valor financiado | R$ 1.007.000,00 |
| Prazo | 60 meses |
| Carência | 3 meses |
| Taxa | 0.05 anual |
| Indexador | 0.1 anual |
| Conversão | (1+i)^(22/252) − 1 |
| Base da amortização | valorFinanciado |
| Tratamento da carência | juros pagos |

**Cronograma** — 60 parcelas conferidas, uma a uma.

| Parcela | Campo | Excel | JavaScript | Δ |
|---|---|---|---|---|
| 1 | juros | `4334.338197110748` | `4334.338197110748` | **0** |
| 1 | amortização | `0` | `0` | **0** |
| 1 | saldo | `1007000` | `1007000` | **0** |
| 1 | prestação | `12748.269771766054` | `12748.269771766054` | **0** |
| 4 | juros | `4334.338197110748` | `4334.338197110748` | **0** |
| 4 | amortização | `17666.666666666668` | `17666.666666666668` | **0** |
| 4 | saldo | `989333.3333333334` | `989333.3333333334` | **0** |
| 4 | prestação | `30414.93643843272` | `30414.93643843272` | **0** |
| 31 | juros | `2281.2306300582927` | `2281.2306300582927` | **0** |
| 31 | amortização | `17666.666666666668` | `17666.666666666668` | **0** |
| 31 | saldo | `512333.33333333436` | `512333.33333333436` | **0** |
| 31 | prestação | `24376.282336017233` | `24376.282336017233` | **0** |
| 60 | juros | `76.04102100194636` | `76.04102100194636` | **0** |
| 60 | amortização | `17666.666666666668` | `17666.666666666668` | **0** |
| 60 | saldo | `7.930793799459934e-10` | `7.930793799459934e-10` | **0** |
| 60 | prestação | `17890.320522311697` | `17890.320522311697` | **0** |

**Encargos e indicadores**

| Item | Excel | JavaScript | Δ | |
|---|---|---|---|---|
| TAC | `7000` | `7000` | **0** | ✓ idêntico |

**Resultado: ✓ APROVADO — todos os valores do cronograma idênticos ao último bit**

---

## CASO 007 · Linhas FINEP

**Entrada** — o estado salvo da aba, lido do arquivo.

| Campo | Valor |
|---|---|
| Valor solicitado | R$ 300.000,00 |
| Valor financiado | R$ 300.000,00 |
| Prazo | 60 meses |
| Carência | 6 meses |
| Taxa | 0.055 anual |
| Indexador | 0.0107 anual |
| Conversão | (1+i)^(22/252) − 1 |
| Base da amortização | valorFinanciado |
| Tratamento da carência | juros pagos |

**Cronograma** — 60 parcelas conferidas, uma a uma.

| Parcela | Campo | Excel | JavaScript | Δ |
|---|---|---|---|---|
| 1 | juros | `1406.847092521911` | `1406.847092521911` | **0** |
| 1 | amortização | `0` | `0` | **0** |
| 1 | saldo | `300000` | `300000` | **0** |
| 1 | prestação | `1685.726065867109` | `1685.726065867109` | **0** |
| 7 | juros | `1406.847092521911` | `1406.847092521911` | **0** |
| 7 | amortização | `5555.555555555556` | `5555.555555555556` | **0** |
| 7 | saldo | `294444.44444444444` | `294444.44444444444` | **0** |
| 7 | prestação | `7241.281621422664` | `7241.281621422664` | **0** |
| 31 | juros | `781.5817180677275` | `781.5817180677275` | **0** |
| 31 | amortização | `5555.555555555556` | `5555.555555555556` | **0** |
| 31 | saldo | `161111.11111111095` | `161111.11111111095` | **0** |
| 31 | prestação | `6492.070036592837` | `6492.070036592837` | **0** |
| 60 | juros | `26.052723935589704` | `26.052723935589704` | **0** |
| 60 | amortização | `5555.555555555556` | `5555.555555555556` | **0** |
| 60 | saldo | `-2.637534635141492e-10` | `-2.637534635141492e-10` | **0** |
| 60 | prestação | `5586.772704923464` | `5586.772704923464` | **0** |

**Encargos e indicadores**

| Item | Excel | JavaScript | Δ | |
|---|---|---|---|---|
| TAC | `3500` | `3500` | **0** | ✓ idêntico |

**Resultado: ✓ APROVADO — todos os valores do cronograma idênticos ao último bit**

---

## CASO 008 · FCO Empresarial

**Entrada** — o estado salvo da aba, lido do arquivo.

| Campo | Valor |
|---|---|
| Valor solicitado | R$ 1.000.000,00 |
| Valor financiado | R$ 1.007.000,00 |
| Prazo | 84 meses |
| Carência | 12 meses |
| Taxa | 0.10267 anual |
| Conversão | (1+i)^(1/12) − 1 |
| Base da amortização | planilha |
| Tratamento da carência | juros pagos |

**Cronograma** — 84 parcelas conferidas, uma a uma.

| Parcela | Campo | Excel | JavaScript | Δ |
|---|---|---|---|---|
| 1 | juros | `8235.0442330667` | `8235.0442330667` | **0** |
| 1 | amortização | `0` | `0` | **0** |
| 1 | saldo | `1007000` | `1007000` | **0** |
| 1 | prestação | `8235.0442330667` | `8235.0442330667` | **0** |
| 13 | juros | `8235.0442330667` | `8235.0442330667` | **0** |
| 13 | amortização | `13986.111111111111` | `13986.111111111111` | **0** |
| 13 | saldo | `993013.8888888889` | `993013.8888888889` | **0** |
| 13 | prestação | `22221.15534417781` | `22221.15534417781` | **0** |
| 43 | juros | `4803.775802622238` | `4803.775802622238` | **0** |
| 43 | amortização | `13986.111111111111` | `13986.111111111111` | **0** |
| 43 | saldo | `573430.5555555552` | `573430.5555555552` | **0** |
| 43 | prestação | `18789.88691373335` | `18789.88691373335` | **0** |
| 84 | juros | `114.37561434814215` | `114.37561434814215` | **0** |
| 84 | amortização | `13986.111111111111` | `13986.111111111111` | **0** |
| 84 | saldo | `-7.894414011389017e-10` | `-7.894414011389017e-10` | **0** |
| 84 | prestação | `14100.486725459254` | `14100.486725459254` | **0** |

**Encargos e indicadores**

| Item | Excel | JavaScript | Δ | |
|---|---|---|---|---|
| TAC | `7000` | `7000` | **0** | ✓ idêntico |

**Resultado: ✓ APROVADO — todos os valores do cronograma idênticos ao último bit**

---

## CASO 009 · Produtor Empreendedor

**Entrada** — o estado salvo da aba, lido do arquivo.

| Campo | Valor |
|---|---|
| Valor solicitado | R$ 50.000,00 |
| Valor financiado | R$ 54.597,20 |
| Prazo | 48 meses |
| Carência | 18 meses |
| Taxa | 0.005 mensal |
| Conversão | (1+i)^(1/12) − 1 |
| Base da amortização | valorFinanciado |
| Tratamento da carência | juros capitalizados |

**Cronograma** — 48 parcelas conferidas, uma a uma.

| Parcela | Campo | Excel | JavaScript | Δ |
|---|---|---|---|---|
| 1 | juros | `272.986` | `272.986` | **0** |
| 1 | amortização | `0` | `0` | **0** |
| 1 | saldo | `54870.185999999994` | `54870.185999999994` | **0** |
| 1 | prestação | `0` | `0` | **0** |
| 19 | juros | `298.62728549679093` | `298.62728549679093` | **0** |
| 19 | amortização | `1990.8485699786063` | `1990.8485699786063` | **0** |
| 19 | saldo | `57734.608529379584` | `57734.608529379584` | **0** |
| 19 | prestação | `2289.475855475397` | `2289.475855475397` | **0** |
| 25 | juros | `238.90182839743284` | `238.90182839743284` | **0** |
| 25 | amortização | `1990.8485699786063` | `1990.8485699786063` | **0** |
| 25 | saldo | `45789.517109507964` | `45789.517109507964` | **0** |
| 25 | prestação | `2229.750398376039` | `2229.750398376039` | **0** |
| 48 | juros | `9.954242849893179` | `9.954242849893179` | **0** |
| 48 | amortização | `1990.8485699786063` | `1990.8485699786063` | **0** |
| 48 | saldo | `2.955857780762017e-11` | `2.955857780762017e-11` | **0** |
| 48 | prestação | `2000.8028128284996` | `2000.8028128284996` | **0** |

**Encargos e indicadores**

| Item | Excel | JavaScript | Δ | |
|---|---|---|---|---|
| TAC | `1000` | `1000` | **0** | ✓ idêntico |

**Resultado: ✓ APROVADO — todos os valores do cronograma idênticos ao último bit**

---

## Conclusão

O aplicativo reproduz a planilha. Dos 1872 valores de cronograma
comparados, 1872 são idênticos ao último bit e nenhum precisou da
tolerância. As duas divergências que existem são defeitos da planilha, já
documentados, e o teste demonstra a causa de cada uma em vez de acomodá-la.

O critério do item 46 do escopo — «o usuário puder reproduzir uma simulação do
Excel no aplicativo» — está atendido para as nove abas de produto que a
planilha calcula.
