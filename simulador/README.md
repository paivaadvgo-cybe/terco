# Simulador financeiro GoiásFomento

Reengenharia da planilha `Simulador_GoiasFomento 08-05-2025.xlsx` num
aplicativo web instalável. A planilha é a referência de comportamento; a
especificação matemática é a referência de arquitetura; os testes são a
referência de validação.

## Estado

**Fases 1 a 10 concluídas — o motor está completo.** O motor SAC reproduz a planilha valor a valor nos
seis casos âncora — inclusive o resíduo de R$ 389,72 que a troca de base da
amortização provoca, e o ruído de ponto flutuante junto. O PRICE, que é
extensão e não migração, bate com a única âncora que a planilha oferece a menos
de um ULP. As nove famílias de crédito estão parametrizadas, e três linhas não
podem ser simuladas — duas porque a célula que escolheria a taxa contém `#REF!`
e uma porque a tabela oficial a lista sem preço. Quatorze pontos da planilha
não podem virar código sem decisão; estão em
`documentacao/MATRIZ_EXCEL_APLICATIVO.md`, na seção 7.

| Fase | Entrega | Estado |
|---|---|---|
| 1 | Auditoria da planilha | concluída |
| 2 | Mapa de regras | concluída |
| 3 | Banco de parâmetros | concluída |
| 4 | Motor SAC | concluída |
| 5 | Testes do SAC | concluída |
| 6 | Motor PRICE | concluída |
| 7 | Testes do PRICE | concluída |
| 8 | Encargos: TAC, IOF, FGI, FAMPE, FUNDEQ, garantias | concluída |
| 9 | Indexadores: INPC, TR, SELIC | concluída |
| 10 | Produtos: nove famílias, TIR e a simulação completa | concluída |
| 11 | Interface: nova simulação, resultado, cronograma, memória, salvas | concluída — 118 passando ao todo |
| 12–15 | Comparador, relatórios, PWA, equivalência | aguardando |

```
cd simulador && npm test
```

Para abrir o aplicativo, sirva a pasta e acesse `/simulador/`:

```
python3 -m http.server 8000
```

Não há etapa de compilação. Os módulos são carregados como ES modules pelo
próprio navegador, e por isso é preciso um servidor — abrir o `index.html`
direto do disco não funciona.

O comportamento da tela é verificado dirigindo o aplicativo num navegador de
verdade, com o Playwright, fora do repositório: preencher, calcular, conferir
os números na tela, o cronograma, a mensagem de erro e a largura no celular.
Isso não virou teste do repositório porque exigiria uma dependência de
instalação, e o simulador não tem nenhuma — `npm test` roda só com o Node.

## Onde está o quê

| Caminho | O que é |
|---|---|
| `documentacao/MAPA_DE_REGRAS_FINANCEIRAS.md` | O que a planilha faz, aba por aba |
| `documentacao/ESPECIFICACAO_MATEMATICA.md` | Como o motor implementa, com contratos e tipos |
| `documentacao/MATRIZ_EXCEL_APLICATIVO.md` | Cada regra, com origem, destino e status |
| `documentacao/PLANO_DE_TESTES.md` | Casos de teste e âncoras extraídas da planilha |
| `dados/PARAMETROS_FINANCEIROS.json` | Taxas, prazos, limites e fatores, com unidade explícita |
| `js/engine/` | Motor: SAC, PRICE, taxas, calendário, arredondamento, erros |
| `js/encargos/` | TAC, IOF, FGI, FAMPE, FUNDEQ e garantias |
| `js/indexadores/` | INPC, TR e SELIC, com a origem de cada referência |
| `js/produtos/` | As nove famílias de linha de crédito, e a simulação de ponta a ponta |
| `js/ui/` | Formulário, resultado, cronograma e formatação |
| `js/storage/` | Simulações salvas no próprio aparelho, em IndexedDB |
| `index.html`, `css/` | O aplicativo |
| `js/data/parametros.js` | Os mesmos parâmetros do JSON, como módulo — gerado |
| `tests/` | Testes automatizados, incluindo as âncoras da planilha |
| `ferramentas/auditar_planilha.py` | Gera o inventário completo da pasta de trabalho |
| `ferramentas/extrair_parametros.py` | Gera o JSON de parâmetros a partir da planilha |
| `referencia/` | A planilha, versionada |

## Reproduzir a auditoria

```
pip install openpyxl

python3 simulador/ferramentas/auditar_planilha.py \
    "simulador/referencia/Simulador_GoiasFomento 08-05-2025.xlsx" \
    /tmp/auditoria

python3 simulador/ferramentas/extrair_parametros.py \
    "simulador/referencia/Simulador_GoiasFomento 08-05-2025.xlsx" \
    simulador/dados/PARAMETROS_FINANCEIROS.json
```

A auditoria produz `inventario.json`, `celulas.tsv` e `formulas.txt`, que são
a base de tudo o que está documentado aqui.

## Os três achados que mudam números

1. **A base da amortização muda no meio da coluna** em cinco abas: as parcelas
   1 a 12 dividem o valor solicitado e as seguintes dividem o financiado. O
   saldo não fecha — sobram R$ 389,72 no exemplo salvo de `Linhas Investimento`.
2. **O teto de R$ 420,00 da TAC é testado sobre uma base e cobrado sobre
   outra**, e pode ser ultrapassado.
3. **As fórmulas do cronograma não foram arrastadas até o fim**, e os totais
   somam faixas fixas de linhas — de modo que um prazo longo produz um total
   com menos parcelas do que o contrato tem, sem sinal de erro.

Nenhum foi corrigido. O escopo é claro: reproduzir o comportamento existente,
registrar a divergência e aguardar autorização.
