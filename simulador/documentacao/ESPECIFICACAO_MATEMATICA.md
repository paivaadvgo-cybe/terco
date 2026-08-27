# Especificação matemática

Referência arquitetural do motor financeiro. O `MAPA_DE_REGRAS_FINANCEIRAS.md`
descreve o que a planilha faz; este documento descreve como o motor
implementa isso, e com que contratos.

## 1. Princípios

1. **O motor não conhece a interface.** Recebe dados, devolve dados. Nenhuma
   função do motor toca no DOM, formata moeda ou lê campo de formulário.
2. **Toda taxa carrega a sua unidade.** Não existe número solto representando
   taxa em lugar nenhum do motor.
3. **Precisão total no cálculo, arredondamento só na apresentação.** É a regra
   que a planilha usa, e ela não é negociável sem quebrar a equivalência.
4. **Nenhuma regra financeira sem origem.** Cada constante vive nos parâmetros,
   com a célula da planilha de onde veio.
5. **Erro é resultado, não exceção silenciosa.** Nunca `NaN`, nunca `Infinity`,
   nunca um número plausível vindo de parâmetro ausente.

## 2. Tipos

### 2.1 Taxa

```js
{ valor: 0.0217, unidade: "mensal", tipo: "efetiva" }
```

`unidade` ∈ `mensal` | `bimestral` | `trimestral` | `semestral` | `anual` |
`diaria`. Converter uma taxa é produzir outra taxa, com a unidade nova — nunca
um número.

A planilha usa duas conversões, e elas **não são equivalentes**:

```
anualParaMensal(i)   = (1 + i)^(1/12)   − 1      FCO
anualParaPeriodo(i)  = (1 + i)^(22/252) − 1      Fungetur e FINEP
```

A segunda converte para um período de vinte e dois dias úteis num ano de
duzentos e cinquenta e dois. `22/252 = 0,087301…` e `1/12 = 0,083333…`, de
modo que a taxa do Fungetur sai cerca de 4,8% maior que a mensal composta da
mesma taxa anual. A diferença é regra da planilha, não erro de arredondamento,
e cada família de produto usa a sua.

### 2.2 Dinheiro

Número em precisão dupla, em reais. `roundMoney(x)` arredonda para dois
decimais e só é chamado na borda de apresentação e nas comparações de teste.

### 2.3 Parcela do cronograma

```js
{
  parcela: 7,
  regime: "amortizacao",          // "carencia" | "amortizacao"
  dataVencimento: "2026-09-10",
  diasPeriodo: 30,
  diasDesdeLiberacao: 210,
  saldoInicial: 103507.50,
  taxaAplicada: 0.0165,
  juros: 1707.87375,
  jurosIndexador: 0,              // só Fungetur e FINEP
  amortizacao: 1851.851851851852,
  encargos: 0,
  prestacao: 3559.725601851852,
  saldoFinal: 101655.64814814815,
  memoria: { baseAmortizacao: "valorSolicitado", formula: "…" }
}
```

`memoria` é o que responde «por que esta parcela tem este valor?». Cada parcela
guarda a base que usou e a fórmula aplicada, para que o item 41 do escopo seja
atendido sem recalcular nada.

## 3. Calendário

A planilha não usa calendário civil: as datas avançam de trinta em trinta dias
a partir da data da proposta.

```
dataVencimento(n)      = dataProposta + 30n
diasDesdeLiberacao(n)  = 30n
diasPeriodo(n)         = 30
```

O motor mantém isso como o modo padrão, `"30dias"`, e deixa a porta aberta para
um modo `"civil"` futuro. Trocar de modo muda o IOF, que é calculado por dias.

## 4. Motor SAC

```
amortizacao(n) = 0                                se n ≤ carencia
               = baseAmortizacao / (prazo − carencia)   caso contrário

juros(n)       = saldo(n−1) × taxaPeriodo
saldo(n)       = saldo(n−1) − amortizacao(n)
prestacao(n)   = amortizacao(n) + juros(n)
saldo(0)       = valorFinanciado
```

`baseAmortizacao` é um parâmetro do produto, não uma constante, justamente
porque a planilha usa as duas — ver ABERTO-07. Os valores possíveis são
`"valorFinanciado"`, `"valorSolicitado"` e `"planilha"`, este último
reproduzindo a troca de base na parcela 13.

Durante a carência, `tratamentoCarencia` decide:

| Valor | Juros na carência | Prestação na carência | Onde |
|---|---|---|---|
| `"pagos"` | Cobrados sobre o saldo, que fica constante | Igual ao juro do mês | Todas as abas, menos uma |
| `"capitalizados"` | Somados ao saldo, que cresce | Zero | `Produtor Empreendedor`, linha 2 |

Com juros capitalizados:

```
saldo(n)            = saldo(n−1) × (1 + taxaPeriodo)    para n ≤ carencia
saldoAoFimCarencia  = saldo(carencia)
amortizacao(n)      = saldoAoFimCarencia / (prazo − carencia)
prestacao(n)        = 0                                  para n ≤ carencia
```

### 4.1 SAC com periodicidade

Com período de `p` meses, o pagamento ocorre quando `(n − carencia) mod p = 0`:

```
juros(n)       = saldo(n−p) × ((1 + taxaMensal)^p − 1)
amortizacao(n) = baseAmortizacao / (prazo − carencia) × p
```

Nos demais meses, tudo zero. `p ∈ {1, 2, 3, 6, 12}`. Carência e prazo precisam
ser múltiplos inteiros de `p`; se não forem, é erro de parametrização.

### 4.2 SAC com indexador

```
jurosIndexador(n) = ((1 + indexador)^(22/252) − 1) × saldo(n−1)
jurosFixo(n)      = ((1 + taxaFixa)^(22/252) − 1) × (saldo(n−1) + jurosIndexador(n))
prestacao(n)      = jurosFixo(n) + jurosIndexador(n) + amortizacao(n)
saldo(n)          = saldo(n−1) − amortizacao(n)
```

O juro do indexador entra na base do juro fixo do mesmo período, e não é
somado ao saldo. É a regra da planilha, e está registrada como observação no
mapa de regras.

## 5. Motor PRICE

Não existe cronograma PRICE na planilha. O motor implementa o modelo canônico,
e ele é **extensão**, não migração:

```
PMT   = VP × [ i(1+i)^n ] / [ (1+i)^n − 1 ]
juros(k)       = saldo(k−1) × i
amortizacao(k) = PMT − juros(k)
saldo(k)       = saldo(k−1) − amortizacao(k)
```

Com carência de juros pagos, o PRICE começa a amortizar depois dela, e `n` é o
número de parcelas amortizantes. Com `i = 0`, a fórmula degenera: nesse caso
`PMT = VP / n`.

Com carência de juros pagos, o principal que a prestação amortiza é o valor
financiado; com juros capitalizados, é o saldo ao fim da carência. Nos dois
casos é o saldo que existirá quando a amortização começar.

Por ser extensão, este motor admite só o que tem sentido financeiro fechado, e
**recusa o resto em vez de inventar**:

- **Base de amortização diferente do saldo.** No SAC isso é ABERTO-07, e é
  reproduzido porque a planilha faz assim. No PRICE não haveria nem essa
  desculpa: a prestação seria calculada sobre um principal e o saldo correria
  sobre outro, deixando resíduo sem nenhum comportamento existente a imitar.
- **Indexador.** Um segundo componente variável tornaria a prestação não
  constante, e não há na planilha nenhum cronograma assim para dizer como.

Os dois casos devolvem `PARAMETRO_INCOMPATIVEL`.

A única âncora que a planilha oferece é `Linhas Investimento!AL18`, que calcula
`PMT(TIR do fluxo com bônus; prazo; −valorSolicitado)` e vale
2.729,6846378193432. A fórmula acima devolve 2.729,6846378193436 — quatro
décimos de bilionésimo de real acima, três quartos de um ULP. É a rotina
interna do Excel arredondando o último bit de outro jeito, não divergência de
regra, e persegui-la seria perseguir ruído binário. O teste usa tolerância de
1e-9, quatro ordens de grandeza acima da diferença.

O saldo final fecha sozinho: sem arredondamento intermediário, o erro
acumulado em 240 parcelas fica na casa de 10⁻⁹. Não há ajuste de última
parcela, porque não há o que ajustar.

## 6. Encargos

### 6.1 TAC

Escada parametrizada, sem constante no código:

```js
{ ate: 3000,   tipo: "fixo",       valor: 50 },
{ ate: 21000,  tipo: "percentual", taxa: 0.03, teto: 420 },
{ ate: 100000, tipo: "percentual", taxa: 0.02 },
{ ate: null,   tipo: "fixoMaisPercentual", fixo: 2000, taxa: 0.005 }
```

Duas variantes convivem: `"referencia"`, a escada limpa, e `"planilha"`, que
reproduz o fator `1,015` e a assimetria entre a base testada e a base cobrada
descrita no mapa de regras. O padrão do MVP é `"planilha"`, porque o objetivo
declarado é reproduzir o comportamento existente.

### 6.2 IOF

```
iofAdicional     = valorLiberado × 0,0038
iofDiario(n)     = min(diasDesdeLiberacao(n), 365) × aliquotaDiaria × amortizacaoBase(n)
iofTotal         = iofAdicional + Σ iofDiario(n)
iofTotal         = iofTotal × 1,03            se o IOF for financiado
```

`aliquotaDiaria` é `0,000041` no modo normal e `0,0000137` no modo simples; o
modo simples se aplica quando o valor solicitado é de até R$ 30.000. A base
`amortizacaoBase(n)` é o valor **solicitado** dividido pelas parcelas
amortizantes, não o financiado.

### 6.3 FGI

```
K   = fatorK(prazoTotal)          busca exata, sem interpolação
VL  = valorSolicitado + tac + iof
ECG = (K × VL × percentualGarantido × prazo) / (1 − K × percentualGarantido × prazo)
```

`fatorK` devolve erro de parametrização quando o prazo não está na tabela. A
tabela cobre 3 a 103 meses.

A base `VL` parte do valor **solicitado**, e não do financiado — a planilha
soma TAC e IOF ao valor pedido, independentemente de eles serem financiados
ou descontados. Quando ambos são financiados os dois números coincidem, e é
por isso que a distinção passa despercebida no estado salvo da planilha.

### 6.4 FAMPE e FUNDEQ

```
encargo = valorSolicitado × percentualGarantido × 0,001 × prazo
```

Fórmula idêntica para as duas na planilha. Ficam como modalidades distintas no
código porque são garantias distintas, e as tabelas podem divergir.

### 6.5 Renda para aval e alienação de imóvel

```
rendaParaAval   = max(maiorPrestacao × 3, pisoRenda)      pisoRenda = 2424,00
alienacaoImovel = (valorSolicitado − parteGarantidaFGI) × 1,5 / 0,7
```

`pisoRenda`, `1,5` e `0,7` vivem nos parâmetros.

## 7. Valor financiado

```
valorFinanciado = valorSolicitado
                + (tac      se tacFinanciada)
                + (iof      se iofFinanciado)
                + (garantia se garantiaFinanciada)
```

O motor usa esta composição regular. A tabela-verdade da planilha coincide com
ela em dez das doze combinações; a combinação faltante e a divergente estão em
ABERTO-01, e o modo `"planilha"` as reproduz para o teste de equivalência.

## 8. TIR

```
fluxo[0] = − valorSolicitado
fluxo[k] =   prestacao(k)
TIR      = raiz de  Σ fluxo[k] / (1 + r)^k = 0
```

Newton-Raphson com bisseção de reserva em `[−0,9999; 10]`. Sem troca de sinal
no fluxo, não há raiz: o resultado é erro, não `NaN`.

Duas TIRs: com bônus, sobre a prestação efetiva, e sem bônus, sobre a
prestação recalculada com a taxa cheia. **Nenhuma das duas é o CET** — o CET
exige incluir todos os encargos no fluxo, e a planilha não faz isso. A
nomenclatura da planilha foi preservada.

## 9. Erros

O motor devolve erro estruturado, nunca um número inválido:

| Código | Quando |
|---|---|
| `PRAZO_INVALIDO` | Prazo ausente, não inteiro, menor que 1 ou acima do teto da linha |
| `CARENCIA_INVALIDA` | Carência negativa, maior que o teto, ou maior ou igual ao prazo |
| `VALOR_ACIMA_DO_LIMITE` | Valor solicitado acima do limite da linha |
| `VALOR_ABAIXO_DO_MINIMO` | Abaixo do mínimo, onde a linha tiver um |
| `TAXA_NAO_PARAMETRIZADA` | A linha não tem taxa para a combinação escolhida |
| `FATOR_K_NAO_ENCONTRADO` | Prazo fora da tabela do FGI |
| `INDEXADOR_NAO_INFORMADO` | Linha indexada sem valor de indexador |
| `PERIODICIDADE_INCOMPATIVEL` | Prazo ou carência não múltiplos do período |
| `TIR_SEM_SOLUCAO` | Fluxo sem troca de sinal |
| `REGRA_EM_ABERTO` | A combinação cai num item ABERTO da matriz |

`REGRA_EM_ABERTO` é deliberado: onde a planilha quebra, o aplicativo diz que a
regra não está definida, em vez de inventar uma.

## 10. Versão

Todo resultado carrega `versaoParametros` e `versaoMotor`. Os parâmetros atuais
são de `2024-12-16`, a vigência declarada na aba `Tabela de Encargos`.
