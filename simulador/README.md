# Simulador financeiro GoiásFomento

Reengenharia da planilha `Simulador_GoiasFomento 08-05-2025.xlsx` num
aplicativo web instalável. A planilha é a referência de comportamento; a
especificação matemática é a referência de arquitetura; os testes são a
referência de validação.

## Estado

**Fase 1 concluída — auditoria.** Nenhuma linha do motor foi escrita ainda, e
isso é deliberado: o escopo determina compreender e documentar antes de
implementar, e a auditoria encontrou doze pontos que não podem virar código sem
decisão. Estão em `documentacao/MATRIZ_EXCEL_APLICATIVO.md`, na seção 7.

| Fase | Entrega | Estado |
|---|---|---|
| 1 | Auditoria da planilha | concluída |
| 2 | Mapa de regras | concluída |
| 3 | Banco de parâmetros | concluída |
| 4–15 | Motor, encargos, produtos, interface, PWA, equivalência | aguardando |

## Onde está o quê

| Caminho | O que é |
|---|---|
| `documentacao/MAPA_DE_REGRAS_FINANCEIRAS.md` | O que a planilha faz, aba por aba |
| `documentacao/ESPECIFICACAO_MATEMATICA.md` | Como o motor implementa, com contratos e tipos |
| `documentacao/MATRIZ_EXCEL_APLICATIVO.md` | Cada regra, com origem, destino e status |
| `documentacao/PLANO_DE_TESTES.md` | Casos de teste e âncoras extraídas da planilha |
| `dados/PARAMETROS_FINANCEIROS.json` | Taxas, prazos, limites e fatores, com unidade explícita |
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
