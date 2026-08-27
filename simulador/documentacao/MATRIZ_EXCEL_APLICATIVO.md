# Matriz Excel × Aplicativo

Nenhuma regra financeira é considerada migrada sem aparecer aqui.

**Status:** `MAPEADO` — regra identificada e documentada, ainda não
implementada · `IMPLEMENTADO` — no código, com teste · `VALIDADO` — teste de
equivalência aprovado contra a planilha · `ABERTO` — regra quebrada, ambígua ou
inconsistente, aguardando decisão · `EXTENSAO` — não existe na planilha.

Fases 1 a 8 concluídas. SAC, PRICE e os encargos estão implementados e
validados contra as células da planilha, valor a valor. Indexadores, produtos e
interface seguem em `MAPEADO`.

## 1. Entrada e composição do valor

| Aba | Campo Excel | Regra identificada | Unidade | Regra JavaScript | Motor | Status |
|---|---|---|---|---|---|---|
| todas | `B15` | Valor solicitado | R$ | `entrada.valorSolicitado` | — | MAPEADO |
| todas | `B16` | Carência | meses | `entrada.carencia` | — | MAPEADO |
| todas | `B17` | Prazo total, inclui carência | meses | `entrada.prazo` | — | MAPEADO |
| todas | `D15` | Taxa cheia, selecionada pela linha | ver §4 do mapa | `taxaCheia` | `juros` | MAPEADO |
| todas | `D16` | Taxa com bônus; é a que remunera | ver §4 do mapa | `taxaAplicada` | `juros` | MAPEADO |
| todas | `D17` | Data da proposta, `=TODAY()` | data | `entrada.dataProposta` | `calendario` | MAPEADO |
| todas | `E23` | Valor financiado, tabela-verdade de 11 ramos | R$ | `comporValorFinanciado()` | `fluxo` | ABERTO-01 |
| Giro Puro | `C6:C12` | Taxa por linha e classe de garantia (`J4`, `K4`) | % a.m. | `selecionarTaxa()` | `juros` | ABERTO-03 |
| demais | `C6:C12` | idem | decimal a.m. | `selecionarTaxa()` | `juros` | MAPEADO |

## 2. Cronograma

| Aba | Campo Excel | Regra identificada | Unidade | Regra JavaScript | Motor | Status |
|---|---|---|---|---|---|---|
| todas | `A24:A…` | Contador, para quando passa do prazo | inteiro | laço até `prazo` | `sac` | VALIDADO |
| todas | `B24:B…` | Regime: carência até `B16`, depois amortização | texto | `parcela.regime` | `sac` | VALIDADO |
| mensais | `C24:C…` | `juros = saldoAnterior × taxa` | R$ | `gerarCronogramaSAC` | `sac` | VALIDADO |
| mensais | `D24:D…` | `0` na carência; senão `base/(prazo−carência)` | R$ | `baseAmortizacao: 'planilha'` | `sac` | VALIDADO · ABERTO-07 |
| mensais | `E24:E…` | `saldo = saldoAnterior − amortizacao` | R$ | `gerarCronogramaSAC` | `sac` | VALIDADO |
| mensais | `F24:F…` | `prestacao = amortizacao + juros` | R$ | `gerarCronogramaSAC` | `sac` | VALIDADO |
| Fungetur | `C24:C…` | `((1+fixa)^(22/252)−1) × (saldo + jurosIndexador)` | R$ | `convencaoTaxa: 'diasUteis'` | `sac` | VALIDADO |
| Fungetur | `D24:D…` | `((1+SELIC)^(22/252)−1) × saldo` | R$ | `taxaIndexador` | `sac` | VALIDADO |
| FINEP | `C24`, `D24` | idem, com TR no lugar da SELIC | R$ | idem | `sac` | VALIDADO |
| FCO | `AN:AR` | Juros por periodicidade: `saldo(n−p) × ((1+i)^p − 1)` | R$ | `periodicidade` | `sac` | IMPLEMENTADO · ABERTO-13 |
| FCO | `AV:AZ` | Amortização por periodicidade: `base/(prazo−car) × p` | R$ | `periodicidade` | `sac` | IMPLEMENTADO · ABERTO-13 |
| FCO | `AL21`, `AL22` | Prazo e carência múltiplos inteiros do período | booleano | `PERIODICIDADE_INCOMPATIVEL` | `sac` | IMPLEMENTADO |
| Produtor | `BG24:BG…` | Carência capitaliza: `saldo × (1+i)`; nada é pago | R$ | `tratamentoCarencia: 'capitalizados'` | `sac` | VALIDADO |
| Produtor | `BH23` | Saldo ao fim da carência, por `XLOOKUP` | R$ | `premissas.saldoAoFimDaCarencia` | `sac` | VALIDADO |
| todas | `C22`, `D22`, `F22` | Totais por soma de faixa fixa de linhas | R$ | soma do cronograma gerado | `fluxo` | ABERTO-08 |

## 3. Encargos

| Aba | Campo Excel | Regra identificada | Unidade | Regra JavaScript | Motor | Status |
|---|---|---|---|---|---|---|
| doze células | `F15`/`G15`/`I15` | Escada da TAC padrão | R$ | `calcularTAC(v, {variante:'padrao'})` | `encargos/tac` | VALIDADO |
| Giro Puro | `F15` | Variante com fator `1,015`, só nessa aba | R$ | `calcularTAC(v, {variante:'giroPuro'})` | `encargos/tac` | VALIDADO · ABERTO-02 |
| todas | `AC24` | IOF adicional, 0,38% do valor liberado | decimal | `PARAMETROS_IOF.aliquotaAdicional` | `encargos/iof` | VALIDADO |
| todas | `AC25` | IOF diário normal, 0,0041% ao dia | decimal/dia | `PARAMETROS_IOF.aliquotaDiariaNormal` | `encargos/iof` | VALIDADO |
| todas | `AC26` | IOF diário simples, 0,00137% ao dia | decimal/dia | `PARAMETROS_IOF.aliquotaDiariaSimples` | `encargos/iof` | VALIDADO |
| todas | `AG30:AG…` | `min(dias,365) × aliquota × amortizacaoBase` | R$ | `iofDaParcela()` | `encargos/iof` | VALIDADO |
| todas | `AF24` | Simples se valor ≤ 30.000; senão normal; zero se não incide | R$ | `calcularIOF()` | `encargos/iof` | VALIDADO · ABERTO-08 |
| todas | `F16` | IOF financiado multiplica por `1,03` | R$ | `calcularIOF({financiado:true})` | `encargos/iof` | VALIDADO |
| todas | `AD30:AD…` | Base do IOF é o valor **solicitado** | R$ | `calcularIOF()` | `encargos/iof` | VALIDADO |
| todas | `AB30:AB…` | Datas de trinta em trinta dias | data | `gerarVencimentos(d, n, '30dias')` | `calendario` | IMPLEMENTADO |

## 4. Garantias

| Aba | Campo Excel | Regra identificada | Unidade | Regra JavaScript | Motor | Status |
|---|---|---|---|---|---|---|
| Fator K | `F9:G110` | Fator K por prazo, 3 a 103 meses | decimal | `buscarFatorK(prazo)` | `encargos/fgi` | VALIDADO |
| Fator K | `I25` | `XLOOKUP` exato, sem interpolação | — | `FATOR_K_NAO_ENCONTRADO` | `encargos/fgi` | VALIDADO |
| Fator K | linha 100 | Prazo 84 repetido com fator divergente | decimal | primeira ocorrência prevalece | `encargos/fgi` | VALIDADO · ABERTO-04 |
| Fator K | tabela | Sem fator acima de 103 meses | — | `FATOR_K_NAO_ENCONTRADO` | `encargos/fgi` | ABERTO-05 |
| Fator K | `I30` | `(K × VL × %G × P)/(1 − K × %G × P)` | R$ | `calcularFGI()` | `encargos/fgi` | VALIDADO |
| Fator K | `I26` | `VL = valorSolicitado + TAC + IOF` | R$ | `calcularFGI().baseVL` | `encargos/fgi` | VALIDADO |
| todas | `M21` | FAMPE: `valor × %G × 0,001 × prazo` | R$ | `calcularFAMPE()` | `encargos/fampe` | VALIDADO |
| todas | `M23` | FUNDEQ: fórmula idêntica à do FAMPE | R$ | `calcularFUNDEQ()` | `encargos/garantias` | VALIDADO |
| todas | `M24` | Seleção da modalidade por `L24` | — | `calcularGarantia()` | `encargos/garantias` | VALIDADO |
| todas | `E19`/`F19` | Percentual garantido, mínimo 0,2 | decimal | `entrada.percentualGarantido` | `encargos/garantias` | MAPEADO |
| todas | `B19` | `max(maiorPrestacao × 3; 2.424,00)` | R$ | `calcularRendaParaAval()` | `encargos/garantias` | VALIDADO |
| todas | `D19` | `(valor − parteGarantida) × 1,5 / 0,7`, em quatro formas | R$ | `calcularAlienacaoImovel()` | `encargos/garantias` | VALIDADO |

## 5. Taxas e indexadores

| Aba | Campo Excel | Regra identificada | Unidade | Regra JavaScript | Motor | Status |
|---|---|---|---|---|---|---|
| Encargos | `B5:I62` | Tabela oficial, vigência 16/12/2024 | mista | `PARAMETROS_FINANCEIROS.json` | `data/parametros` | MAPEADO |
| Encargos | `E5:E17` | Bônus por `taxaCheia × 0,77` — 13 linhas apenas | decimal | `aplicarBonus(t, {tipo:'fator'})` | `juros` | IMPLEMENTADO |
| Encargos | `E20:E24` | Transportes e Microcrédito: bônus tabelado próprio | decimal | `aplicarBonus(t, {tipo:'tabelado'})` | `juros` | IMPLEMENTADO |
| Encargos | `C53:F62` | FCO: par prioritário / não prioritário | decimal a.a. | `fco.selecionarPorMunicipio()` | `produtos/fco` | MAPEADO |
| FCO | `C23` | `(1 + anual)^(1/12) − 1` | — | `paraMensal(t, 'mensalComposta')` | `juros` | VALIDADO |
| Fungetur | `C24` | `(1 + anual)^(22/252) − 1` | — | `paraMensal(t, 'diasUteis')` | `juros` | VALIDADO |
| Fungetur | `D16` | Indexador rotulado `INPC` na aba, `SELIC` na tabela | decimal a.a. | `indexador` | `indexadores` | ABERTO-09 |
| FINEP | `D16` | TR | decimal a.a. | `indexador` | `indexadores/tr` | MAPEADO |
| FCO | `O4` | Rótulo diz `TAXA (a.m.)`, valores são anuais | decimal a.a. | unidade explícita nos parâmetros | `data/parametros` | ABERTO-10 |
| Encargos | `C65:C68` | Cálculo auxiliar de spread, sem rótulo nem uso | decimal | não migrado | — | ABERTO-11 |

## 6. TIR e indicadores

| Aba | Campo Excel | Regra identificada | Unidade | Regra JavaScript | Motor | Status |
|---|---|---|---|---|---|---|
| mensais | `AJ22` | `IRR` do fluxo com bônus | decimal | `calcularTIR(fluxoComBonus)` | `tir` | MAPEADO |
| mensais | `AK22` | `IRR` do fluxo sem bônus | decimal | `calcularTIR(fluxoSemBonus)` | `tir` | MAPEADO |
| Giro Puro | `AK24` | Fluxo sem bônus usa `D15`, que está vazia | — | — | `tir` | ABERTO-06 |
| mensais | `AJ23` | Fluxo parte de `−valorSolicitado` | R$ | `fluxo.inicial` | `tir` | MAPEADO |
| Investimento | `AL18` | `PMT(TIR; prazo; −valorSolicitado)` | R$ | `calcularPMT()` | `price` | VALIDADO |
| — | — | Cronograma PRICE completo | — | `gerarCronogramaPRICE()` | `price` | EXTENSAO · IMPLEMENTADO |
| — | — | Comparador SAC × PRICE | — | `ui/comparador` | — | EXTENSAO |
| mensais | `AL17:AR19` | Receita, despesa e margem da instituição | R$ | não migrado | — | fora de escopo |
| FCO | `BB16:BD18` | idem | R$ | não migrado | — | fora de escopo |

## 7. Itens em aberto

Cada item traz a regra encontrada, a observação técnica, a possível
inconsistência e a sugestão. **Nenhuma sugestão foi aplicada.** O item 42 do
escopo exige autorização, e o objetivo desta fase é reproduzir o comportamento
existente.

### ABERTO-01 · Tabela-verdade do valor financiado incompleta

**Regra encontrada.** `E23` cobre onze das doze combinações de TAC descontada
ou financiada, IOF descontado ou financiado e garantia 1, 2 ou 3.

**Observação técnica.** Falta a combinação TAC financiada + IOF descontado +
garantia 3. O `IF` encadeado termina sem valor padrão.

**Possível inconsistência.** Nessa combinação `E23` devolve `FALSO`, que
propaga por todo o cronograma e produz totais sem sentido.

**Sugestão.** Completar com `valorSolicitado + TAC`, que é o que a simetria dos
outros dez ramos indica. Aguarda autorização.

### ABERTO-02 · Teto da TAC testado sobre base diferente da cobrada

**Regra encontrada.** Em `Linhas Giro Puro!F15`, ramo da TAC descontada, faixa
de R$ 3.000,01 a R$ 21.000: testa `valor × 0,03 ≤ 420` e cobra
`valor × 1,015 × 0,03`.

**Observação técnica.** O fator `1,015` aparece na faixa de 3% mas não nas
faixas de 2% e 0,5% do mesmo ramo. E a variante existe numa aba só: as outras
doze células que calculam TAC usam a escada padrão, inclusive a `I15` da
própria `Linhas Giro Puro`, que fica ao lado da `F15` e dá R$ 1.200,00 onde a
`F15` dá R$ 1.218,00.

**Possível inconsistência.** O teto de R$ 420,00 pode ser ultrapassado: em
R$ 14.000 o teste passa com 420,00 e a cobrança é R$ 426,30.

**Sugestão.** Testar e cobrar sobre a mesma base — ou, mais provável, adotar a
escada padrão também em `Linhas Giro Puro`, já que ela é o que as outras onze
abas fazem. Aguarda autorização; o motor tem as duas variantes e nenhuma é
padrão implícito.

### ABERTO-03 · `Linhas Giro Puro` guarda taxas em pontos percentuais

**Regra encontrada.** As colunas `O`, `P`, `Q` e `R` dessa aba trazem `2,27` e
`1,81`, enquanto as demais abas mensais trazem `0,0217` e `0,0165`.

**Observação técnica.** `D16` teria a fórmula `=LARGE(C6:C13;1)`, como nas
outras abas, e devolveria `1,77`. A célula foi sobrescrita à mão com `0,005`.

**Possível inconsistência.** Restaurar a fórmula produziria juros de 177% ao
mês. A aba está funcional apenas por causa da sobrescrita manual.

**Sugestão.** Converter a tabela dessa aba para decimal e restaurar a fórmula.
Aguarda autorização. Enquanto isso, os parâmetros extraídos registram a unidade
explicitamente e o motor converte na leitura.

### ABERTO-04 · Prazo 84 repetido na tabela do FGI

**Regra encontrada.** A linha 90 traz prazo 84 com fator 0,0007; a linha 100
traz 84 de novo, com 0,0006. A sequência salta de 93 para 84 e volta para 94.

**Observação técnica.** `XLOOKUP` devolve a primeira ocorrência, então a
entrada da linha 100 é inalcançável e não muda resultado nenhum.

**Possível inconsistência.** Erro de digitação. O valor pretendido é
desconhecido: pode ser uma linha a excluir.

**Sugestão.** Confirmar com a área gestora do FGI. Sem resposta, manter 0,0007
para o prazo 84, que é o comportamento atual. Aguarda autorização.

### ABERTO-05 · Prazos acima de 103 meses sem fator K

**Regra encontrada.** A tabela cobre 3 a 103 meses.

**Observação técnica.** FCO Verde e Fungetur Capital Fixo vão a 240 meses; FCO
Empresarial e Rural a 144; FINEP Aquisição Inovadora a 120.

**Possível inconsistência.** Escolher FGI nessas linhas com prazo longo produz
`#N/A`. Não se sabe se o FGI não se aplica a elas ou se falta tabela.

**Sugestão.** Confirmar a aplicabilidade. O aplicativo devolve
`FATOR_K_NAO_ENCONTRADO` e não interpola. Aguarda autorização.

### ABERTO-06 · TIR sem bônus quebrada em `Linhas Giro Puro`

**Regra encontrada.** O fluxo sem bônus usa `saldo × $D$15 + amortizacao`.

**Observação técnica.** `D15` está vazia nessa aba — é a única em que a taxa
cheia não foi preenchida.

**Possível inconsistência.** O produto vira zero, o fluxo perde os juros e a
`IRR` devolve `#VALUE!`.

**Sugestão.** Preencher `D15` com a mesma seleção das outras abas. Aguarda
autorização.

### ABERTO-07 · Base da amortização muda no meio da coluna

**Regra encontrada.** Em `Linhas Investimento`, `Linhas Transportes`,
`Mais Crédito`, `Mais Crédito (2)` e `FCO Empresarial`, as parcelas 1 a 12
dividem o valor solicitado e as parcelas 13 em diante dividem o financiado.
`Linhas Giro Puro` usa o financiado em toda a coluna; `Linhas FINEP` troca ao
contrário, na parcela 220.

**Observação técnica.** É o achado de maior efeito financeiro da auditoria.
Com R$ 100.000, 60 meses, 6 de carência e R$ 103.507,50 financiados, sobram
R$ 389,72 depois da última parcela.

**Possível inconsistência.** O saldo não fecha, e o resíduo cresce com o valor
dos encargos financiados. Não é arredondamento: a planilha não arredonda, e a
ordem de grandeza é de centenas de reais.

**Sugestão.** Usar o valor financiado em toda a coluna, que é o que
`Linhas Giro Puro` faz e o que fecha o saldo em zero. Aguarda autorização. Até
lá, o parâmetro `baseAmortizacao: "planilha"` reproduz a troca, para que o
teste de equivalência passe.

### ABERTO-08 · Totais somam faixas fixas de linhas

**Regra encontrada.** `SUM(F23:F242)`, `SUM(AG30:AG83)` e semelhantes somam
faixas de tamanho fixo, independentes do prazo.

**Observação técnica.** As fórmulas do cronograma não foram arrastadas até o
fim: cada coluna para numa linha diferente, e a faixa somada inclui as linhas
vazias. Ver §10 do mapa de regras.

**Possível inconsistência.** Um prazo acima do preenchimento produz um total
que corresponde a menos parcelas do que o contrato tem, **sem sinal nenhum de
erro**. Em `Linhas Giro Puro` com prazo 60, o total das prestações soma 48
parcelas. O IOF é mais estreito ainda: `AE25` vale R$ 676,50, que corresponde
às 42 parcelas amortizantes cujas linhas foram preenchidas, contra R$ 876,03
das 54 que o contrato tem. O motor reproduz os R$ 676,50 exatos quando a soma é
truncada na parcela 48, o que confirma que a divergência é só o truncamento e
nada mais — e o teste afirma as duas coisas.

**Sugestão.** No aplicativo o cronograma é gerado por laço e o total soma o que
foi gerado, de modo que o problema não se reproduz. A divergência contra a
planilha em prazos longos é esperada e está tratada no plano de testes.
Aguarda autorização para considerar o comportamento da planilha um defeito.

### ABERTO-09 · Indexador do Fungetur rotulado de dois jeitos

**Regra encontrada.** A aba `Linhas Fungetur` rotula `D16` como `INPC`; a
`Tabela de Encargos` rotula a mesma coluna como `Taxa SELIC (ao ano)`, com
13,75%. O valor salvo em `D16` é 10%.

**Observação técnica.** Nenhum dos dois rótulos corresponde ao valor salvo.

**Possível inconsistência.** Não se sabe qual indexador rege as linhas Fungetur.

**Sugestão.** Confirmar com a área gestora. O aplicativo exige o indexador
informado e registra qual foi usado. Aguarda autorização.

### ABERTO-10 · Cabeçalho do FCO diz `a.m.` sobre valores anuais

**Regra encontrada.** `O4` das abas de FCO diz `TAXA (a.m.)`, e os valores são
0,088992 e 0,106346 — anuais, como a `Tabela de Encargos` confirma, e como
`C23 = (D16+1)^(1/12) − 1` pressupõe.

**Observação técnica.** Só o rótulo está errado; o cálculo está coerente.

**Sugestão.** Corrigir o rótulo. Sem efeito sobre o cálculo. Aguarda
autorização.

### ABERTO-11 · Cálculo auxiliar sem rótulo na tabela de encargos

**Regra encontrada.** `C65:C68` calculam `C54−D54`, `C55−D55`, a média das
duas e a média menos 0,0025.

**Observação técnica.** Sem rótulo, sem uso por outra célula. Aparenta ser
estudo do spread entre taxa cheia e taxa com bônus do FCO Empresarial.

**Sugestão.** Confirmar se é rascunho. Não migrado. Aguarda autorização.

### ABERTO-12 · Fórmulas quebradas na seleção de taxa do FCO e do Produtor

**Regra encontrada.** `FCO Empresarial!C11` e `C12`, `FCO Rural!C11` e
`Produtor Empreendedor!C11` contêm `#REF!` no lugar das referências.

**Observação técnica.** A intenção é clara pelo padrão das células vizinhas —
selecionar a taxa das linhas 6 e 7 conforme `J4` e `K4` — mas o alvo foi
perdido, provavelmente por exclusão de linha ou coluna.

**Possível inconsistência.** Escolher a linha 6 ou 7 nessas abas devolve
`#REF!`.

**Sugestão.** Reconstruir a referência a partir da tabela `N:V` da própria aba.
Como o item 39 do escopo determina, a regra **não** foi implementada por
dedução. O aplicativo devolve `REGRA_EM_ABERTO`. Aguarda autorização.

### ABERTO-13 · A periodicidade do FCO chega ao cronograma pela metade

**Regra encontrada.** O FCO tem um seletor de periodicidade (`AN17`) com cinco
opções — mensal, bimestral, trimestral, semestral e anual — e duas famílias de
colunas que a implementam: `AN:AR` para os juros e `AU:AZ` para a amortização.

**Observação técnica.** A coluna de juros do cronograma consulta `AN:AR`, mas a
coluna de amortização **não consulta `AU:AZ`**: `D` divide sempre por mês, e
`AU:AZ` só é lida na primeira linha. Existe ainda um segundo seletor sem
rótulo, `AN18`: verdadeiro faz os juros serem periódicos na carência e mensais
depois; falso os mantém periódicos o tempo todo. No estado salvo `AN17` é 1,
de modo que todos os caminhos coincidem e nada disso aparece.

**Possível inconsistência.** Escolher pagamento semestral produziria juros
semestrais com amortização mensal — um cronograma que não corresponde a nenhum
contrato.

**Sugestão.** Ligar a amortização periódica à coluna `D` e eliminar `AN18`, ou
esclarecer o que ele representa. Enquanto isso, o motor implementa o modelo
coerente descrito na especificação — pagamento a cada `p` meses, contado desde
a liberação, com juros e amortização no mesmo ritmo — e as linhas de FCO são
simuladas com periodicidade mensal, que é o estado salvo e o único caminho que
a planilha exercita. Aguarda autorização.
