# Simulador financeiro GoiásFomento

Reengenharia da planilha `Simulador_GoiasFomento 08-05-2025.xlsx` num
aplicativo web instalável. A planilha é a referência de comportamento; a
especificação matemática é a referência de arquitetura; os testes são a
referência de validação.

## Estado

**As quinze fases estão concluídas.** O motor SAC reproduz a planilha valor a valor nos
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
| 11 | Interface: nova simulação, resultado, cronograma, memória, salvas | concluída |
| 12 | Comparador SAC × PRICE, em tabela | concluída |
| 13 | Relatórios: impressão, PDF e exportação em CSV | concluída |
| 14 | PWA: funciona sem internet e instala | concluída |
| 15 | Relatório de equivalência | concluída — 162 passando ao todo |

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
| `documentacao/EQUIVALENCIA_EXCEL.md` | Comparação célula a célula: planilha × aplicativo |
| `documentacao/ADMINISTRACAO.md` | Manual de quem altera os parâmetros, sem mexer no código |
| `documentacao/CONTINUIDADE.md` | Passagem do projeto: o que saber antes de tocar em qualquer coisa |
| `dados/PARAMETROS_FINANCEIROS.json` | Taxas, prazos, limites e fatores, com unidade explícita |
| `js/engine/` | Motor: SAC, PRICE, taxas, calendário, arredondamento, erros |
| `js/encargos/` | TAC, IOF, FGI, FAMPE, FUNDEQ e garantias |
| `js/indexadores/` | INPC, TR e SELIC, com a origem de cada referência |
| `js/produtos/` | As nove famílias de linha de crédito, e a simulação de ponta a ponta |
| `js/ui/` | Formulário, resultado, cronograma, comparador, relatório, CSV e formatação |
| `js/storage/` | Simulações salvas no próprio aparelho, em IndexedDB |
| `index.html`, `css/` | O aplicativo |
| `sw.js`, `manifest.json`, `icones/` | Funcionamento sem internet e instalação |
| `js/data/parametros.js` | Os mesmos parâmetros do JSON, como módulo — gerado |
| `tests/` | Testes automatizados, incluindo as âncoras da planilha |
| `ferramentas/auditar_planilha.py` | Gera o inventário completo da pasta de trabalho |
| `ferramentas/extrair_parametros.py` | Gera o JSON de parâmetros a partir da planilha |
| `ferramentas/gerar_vigentes.mjs` | Recria o conjunto vigente a partir da base extraída |
| `ferramentas/versionar_casca.mjs` | Carimba na versão do cache o resumo dos arquivos guardados |
| `ferramentas/gerar_modulo.mjs` | Refaz o módulo de parâmetros a partir do JSON publicado |
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

python3 simulador/ferramentas/extrair_casos.py \
    "simulador/referencia/Simulador_GoiasFomento 08-05-2025.xlsx" \
    simulador/tests/casos-equivalencia.json

cd simulador && node ferramentas/gerar_equivalencia.mjs
```

A auditoria produz `inventario.json`, `celulas.tsv` e `formulas.txt`, que são
a base de tudo o que está documentado aqui.

## Administrar os parâmetros

Quando a política de crédito mudar — produto novo ou extinto, taxa, prazo,
carência, limite, linha nova ou linha extinta, alíquota, fator —, a alteração é
feita em `admin.html`, sem tocar em código. Um produto é uma combinação de
comportamentos que o motor já implementa, e por isso pode ser composto por
formulário; o que exige desenvolvimento é um comportamento que ainda não exista. O painel valida, mostra o que mudou por extenso, roda uma
simulação de teste com os valores novos ao lado dos atuais, e gera os dois
arquivos a publicar.

O manual está em `documentacao/ADMINISTRACAO.md`.

Dois conjuntos de parâmetros convivem, e a separação é deliberada:

| Arquivo | O que é |
|---|---|
| `js/data/parametros.js` | A planilha de origem, extraída. Congelado. |
| `js/data/parametros-vigentes.js` | O que está em vigor. Escrito pelo painel. |

O aplicativo calcula com o vigente. Os testes de equivalência provam o motor
contra a base extraída — uma taxa alterada por norma não pode derrubar a prova
de que o motor reproduz a planilha, porque são coisas distintas. A diferença
entre os dois arquivos é, exatamente, tudo que a administração alterou.

## Publicar uma versão nova

O service worker serve os arquivos **cache primeiro**, e por isso o nome do
cache precisa mudar sempre que qualquer arquivo guardado mudar — senão a versão
publicada não chega a quem já visitou o site. Isso deixou de depender de
memória: o nome é o resumo do próprio conteúdo, e o teste acusa a divergência.

```
node ferramentas/versionar_casca.mjs --gravar
```

Rode antes de publicar sempre que tiver mexido em algo da casca. Se esquecer,
`npm test` reprova com o comando a rodar.

## Sem internet

Depois da primeira visita o simulador funciona offline: o aplicativo inteiro —
os quarenta e quatro arquivos da casca — fica guardado no navegador, e as
simulações salvas ficam no próprio aparelho. Verificado desligando a rede e
usando: simular, comparar SAC com PRICE, abrir o relatório, salvar e recuperar.

A atualização não é automática. O aplicativo é feito de dezenas de módulos que
se importam entre si, e deixar uma versão nova assumir no meio de uma sessão
serviria arquivos novos a uma página que já carregou os antigos. A versão nova
espera, a página avisa, e quem está usando decide quando recarregar.

## Sobre o PDF

O escopo pede PDF «quando houver infraestrutura adequada». Ela existe e já está
no aparelho: a caixa de impressão de qualquer navegador moderno salva em PDF,
no computador e no celular, e o relatório é formatado para isso — cabeçalho de
tabela repetido a cada página, linhas que não se partem ao meio, e o conteúdo
da tela que não pertence ao documento removido na impressão.

Embutir uma biblioteca de PDF custaria um pacote por CDN, e o simulador precisa
funcionar sem internet; ou uma etapa de compilação, que ele não tem. Imprimir e
salvar em PDF entrega o mesmo arquivo sem nenhum dos dois custos.

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

## Critério de conclusão

O item 46 do escopo lista doze condições. Todas estão atendidas:

| Condição | Onde se verifica |
|---|---|
| Abas relevantes mapeadas | `MAPA_DE_REGRAS_FINANCEIRAS.md` — as doze abas |
| Regras documentadas | `MAPA_DE_REGRAS_FINANCEIRAS.md` e `MATRIZ_EXCEL_APLICATIVO.md` |
| SAC validado | 1.872 valores idênticos ao último bit, em nove abas |
| PRICE validado | contra a única âncora que a planilha tem, `AL18` |
| Encargos validados | TAC, IOF, FGI, FAMPE, FUNDEQ, aval e alienação |
| Parâmetros estruturados | `dados/PARAMETROS_FINANCEIROS.json`, gerado da planilha |
| Casos de teste aprovados | 162 testes, todos passando |
| Divergências documentadas | quatorze itens `ABERTO`, na seção 7 da matriz |
| Interface funcional | verificada dirigindo o aplicativo num navegador |
| PWA funcional | verificado com a rede desligada |
| Relatório funcional | verificado imprimindo em PDF: quatro páginas A4 |
| Reproduzir uma simulação do Excel | `EQUIVALENCIA_EXCEL.md` |

O que **não** está concluído, e não podia estar: as quatro decisões que
dependem da instituição — o fator K duplicado do prazo 84, o FGI acima de 103
meses, qual índice rege o Fungetur, e a taxa que falta ao Microcrédito de
capital de giro. Enquanto não houver resposta, o aplicativo reproduz o
comportamento atual onde ele existe e recusa a simular onde não existe.
