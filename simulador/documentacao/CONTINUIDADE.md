# Continuidade do projeto — leia isto antes de tocar em qualquer coisa

Este documento existe para que outro assistente, sem nenhum contexto anterior,
possa continuar o desenvolvimento sem refazer descobertas e sem desfazer
decisões que custaram caro. Leia inteiro antes de propor mudanças.

Se você tem acesso ao repositório, leia também, nesta ordem:
`README.md`, `documentacao/MATRIZ_EXCEL_APLICATIVO.md` (a seção dos itens
ABERTO), `documentacao/ADMINISTRACAO.md` e
`documentacao/EQUIVALENCIA_EXCEL.md`.

---

## 1. O que é

Um simulador de financiamento da **GoiásFomento**, agência de fomento do Estado
de Goiás. Ele é a reengenharia de uma planilha — `Simulador_GoiasFomento
08-05-2025.xlsx`, versionada em `simulador/referencia/` — num aplicativo web
instalável.

**No ar:** https://paivaadvgo-cybe.github.io/terco/simulador/
**Painel de administração:** `.../simulador/admin.html`
**Repositório:** `paivaadvgo-cybe/terco`, pasta `simulador/`. Publica por GitHub
Pages a partir de `main`; cerca de um minuto entre o commit e o ar.

**Quem conduz:** Paulo Cesar de Paiva, servidor da GoiásFomento. Não é
programador. As instruções para ele precisam ser operacionais e sem jargão.

### Números que descrevem o estado

| | |
|---|---|
| Testes | 209, todos passando (`cd simulador && npm test`) |
| Linhas de JavaScript | ~11.600 |
| Dependências | nenhuma; sem etapa de compilação |
| Abas da planilha comparadas | 9 de 9 |
| Valores de cronograma conferidos | 1.872 |
| Idênticos ao último bit | 1.872 (100%) |

---

## 2. A regra que governa tudo

> **Reproduzir o comportamento existente, não melhorá-lo.**

A planilha tem defeitos. Vários mudam números em milhares de reais. **Eles estão
reproduzidos de propósito**, com o registro do que são, e aguardam decisão da
instituição.

Se você encontrar uma fórmula que parece matematicamente errada, **não conserte**.
Registre: regra encontrada, observação técnica, possível inconsistência,
sugestão — e espere autorização. São quatorze itens `ABERTO-01` a `ABERTO-14`,
todos descritos em `documentacao/MATRIZ_EXCEL_APLICATIVO.md`.

Os que mais mudam números:

- **ABERTO-02** — o teto de R$ 420 da TAC é testado sobre uma base e cobrado
  sobre outra, e o fator 1,015 de `Linhas Giro Puro` entra de forma irregular
  nas quatro faixas.
- **ABERTO-07** — a base da amortização troca na parcela 13 em cinco abas: as
  doze primeiras dividem o valor solicitado, as seguintes o financiado. O saldo
  **não fecha em zero** — sobram R$ 389,72 no exemplo salvo de `Linhas
  Investimento`, conferido ao centavo. Isso é correto; não "conserte".
- **ABERTO-08** — os totais somam faixas fixas de linhas, de modo que um prazo
  longo totaliza menos parcelas do que o contrato tem. Em `Linhas Giro Puro`
  isso chega à TIR, que sai **negativa** para um contrato que rende juros.
- **ABERTO-09** — «taxa base + indexador» **não existe** na planilha. O
  indexador é um segundo componente de juros, cobrado à parte e entrando na base
  do juro fixo do mesmo período. Somar as duas taxas daria milhares de reais de
  diferença já na primeira parcela.
- **ABERTO-12 e 14** — três linhas de crédito não têm taxa (células `#REF!` e
  uma tabela nunca preenchida). O aplicativo **recusa a simular** essas linhas em
  vez de produzir um número plausível.

### Quatro decisões pendentes da instituição

Nenhuma exige mudar o motor; todas entram pelo painel quando houver resposta.

1. O prazo 84 aparece duas vezes na tabela do fator K do FGI, com fatores
   diferentes — R$ 7.546 de diferença numa operação de R$ 1 milhão.
2. Oito linhas têm prazo além dos 103 meses que a tabela do FGI cobre.
3. Qual índice rege o Fungetur: a aba diz INPC e 10%, a tabela oficial diz Selic
   e 13,75%.
4. A taxa que falta ao `Microcrédito Produtivo — Capital de Giro`.

---

## 3. Como o cálculo funciona

**Todos os cronogramas da planilha são SAC.** O único `PMT` do arquivo está numa
célula solta (`Linhas Investimento!AL18`), fora de qualquer cronograma. O PRICE
existe no aplicativo como **comparação**, não como migração.

**Toda taxa carrega a unidade.** `{ valor, unidade, tipo }`. A conversão para o
período é do motor, e cada família converte de um jeito:

- `mensalComposta`: `(1+i)^(1/12) − 1` — FCO e as famílias mensais
- `diasUteis`: `(1+i)^(22/252) − 1` — Fungetur e FINEP

As duas diferem em cerca de **4,8%**. Ler uma taxa na unidade errada é o erro
mais fácil de cometer e o mais caro.

**Precisão dupla do começo ao fim.** A planilha não arredonda em etapa alguma, e
o motor também não. Arredondamento só na apresentação. É por isso que os 1.872
valores batem no último bit e a tolerância de R$ 0,01 do escopo nunca foi
necessária.

**Nunca devolver NaN, Infinity ou resultado silenciosamente inválido.** Onde a
regra não existe, o motor lança erro com código (`js/engine/erros.js`) e a
interface explica. Um número plausível e sem regra por trás é pior que um erro.

**A busca do fator K do FGI é exata.** Sem interpolação: um prazo ausente faz a
operação ser recusada, não aproximada.

---

## 4. Arquitetura

```
simulador/
  index.html            aplicativo
  admin.html            painel de administração
  sw.js                 service worker (leia a seção 6 antes de tocar)
  js/
    engine/             SAC, PRICE, juros, TIR, calendário, erros
    encargos/           IOF, TAC, FGI, FAMPE, garantias
    indexadores/        Selic, TR, INPC
    produtos/           perfis das famílias (base documentada)
    data/
      parametros.js           a planilha extraída — CONGELADO
      parametros-vigentes.js  o que está em vigor — escrito pelo painel
    admin/              esquema, validação, diferenças, serialização, senha
    ui/                 formulário, resultado, cronograma, comparador,
                        relatório, CSV, formatação
    storage/            simulações salvas (IndexedDB)
  dados/PARAMETROS_VIGENTES.json   o mesmo conjunto, para auditoria
  ferramentas/          extração, versionamento, conversão
  tests/                209 testes, `node --test`
  documentacao/
  referencia/           a planilha de origem
```

### Os dois conjuntos de parâmetros

Esta separação é deliberada e **não deve ser desfeita**:

| Arquivo | O que é |
|---|---|
| `js/data/parametros.js` | A planilha extraída. Congelado. |
| `js/data/parametros-vigentes.js` | O que está em vigor. Escrito pelo painel. |

O aplicativo calcula com o **vigente**. Os testes de equivalência provam o motor
contra a **base extraída**. Uma taxa alterada por norma não pode derrubar a
prova de que o motor reproduz a planilha — são coisas distintas. A diferença
entre os dois arquivos é, exatamente, tudo que a administração alterou.

### Um produto é dado, não código

Os perfis das nove famílias vivem no conjunto de parâmetros. Cada campo de
comportamento tem duas ou três opções, e a lista sai de
`js/admin/esquema.js → ESCOLHAS_DE_COMPORTAMENTO`:

| Campo | Opções |
|---|---|
| Convenção da taxa | mensal composta · dias úteis |
| Base da amortização | valor financiado · valor solicitado · como a planilha faz |
| Carência | juros pagos · juros capitalizados |
| Variante da TAC | escada padrão · variante de Giro Puro |
| Bônus | nenhum · fator sobre a cheia · tabelado |
| Indexador | nenhum · Selic · TR · INPC |

**Compor um produto novo com o que já existe é formulário. Inventar um
comportamento novo é desenvolvimento.** Ao acrescentar um comportamento ao
motor, acrescente a opção ao esquema — há teste que exige que o vocabulário
cubra tudo que os produtos publicados usam.

---

## 5. Administração sem desenvolvedor

`admin.html`. Administra: produtos (incluir, alterar, excluir), linhas de
crédito, prazos, carências, limites, taxas cheias e com bônus, fator K do FGI,
alíquotas do IOF, escada da TAC, fatores do FAMPE e FUNDEQ, renda para aval,
alienação, indexadores, e a senha do próprio painel.

**Fluxo:** editar → testar (roda a mesma simulação com os parâmetros no ar e com
os editados, lado a lado) → conferir (lista do que mudou por extenso, mais
validação) → baixar dois arquivos → substituí-los no repositório.

Três decisões de projeto que parecem detalhes e não são:

- **Nada é salvo automaticamente.** A edição vive na memória da aba. Guardar
  sozinho criaria um conjunto pela metade, invisível, ressurgindo semanas depois.
  Há botão de baixar rascunho. **Falta um aviso ao fechar a aba — é uma pendência
  conhecida.**
- **A validação impede só o que piorou.** Um defeito que já existe no conjunto
  publicado vira alerta marcado «já existia»; um defeito novo bloqueia. Sem isso,
  os defeitos herdados da planilha travariam toda publicação futura.
- **O ato normativo não é herdável.** Cada publicação registra a sua própria
  norma; a validação recusa repetir a anterior, e o painel abre com o campo vazio.

### A senha

Existe, e é **barreira contra engano, não contra intenção**. O código é público e
a verificação roda no navegador de quem abre a página: quem souber abrir as
ferramentas do desenvolvedor passa por ela. Isso está escrito na própria tela, e
deve continuar escrito — uma senha que aparente proteger mais do que protege é
pior que senha nenhuma.

Guardada como resumo PBKDF2-SHA-256, sal aleatório, 310 mil iterações, em
`acesso` no conjunto de parâmetros. **A senha em claro não está no repositório e
não deve entrar nele, nem em documento nenhum.** Trocá-la é pela aba Senha do
painel.

Controle de acesso de verdade exige servidor — ver seção 8.

---

## 6. O service worker: leia antes de tocar

Três defeitos graves saíram daqui, todos do mesmo formato: **nada quebrava, e a
versão publicada simplesmente não chegava.** Não havia erro apontando a causa.

1. **O nome do cache precisa mudar quando o conteúdo muda.** Depender de alguém
   lembrar de trocar `v1` por `v2` falhou duas entregas seguidas. O nome passou a
   ser o resumo do conteúdo, gerado por `ferramentas/versionar_casca.mjs`, e um
   teste acusa a divergência. **Rode `node ferramentas/versionar_casca.mjs
   --gravar` sempre que alterar um arquivo da casca.**
2. **`cache.addAll` é atendido pelo cache HTTP do navegador.** O cache novo
   nascia cheio dos arquivos velhos. Todo `fetch` do worker usa
   `cache: 'reload'`. Não remova.
3. **O conjunto de parâmetros é servido rede-primeiro e fica fora do resumo.**
   O painel gera os dois arquivos de parâmetro, não o `sw.js`; se o arquivo
   entrasse no resumo, publicar uma taxa exigiria um `sw.js` que ninguém geraria.
   Com internet vem o publicado; sem internet, o guardado.

E o worker só guarda e serve o que está na casca — guardar o painel o congelaria,
já que ele fica fora do resumo por decisão.

---

## 7. Como trabalhar aqui

- **`npm test` antes de qualquer commit.** 209 testes, sem dependências.
- **Abra no navegador.** A maioria dos defeitos desta lista não apareceu em
  teste nenhum: formulário apagando valores digitados, layout escorando a página
  no celular, botão de publicar que sumia, dois downloads de que só um chegava.
  Sirva com `python3 -m http.server` e use a tela.
- **Ao acrescentar um teste de regressão, desfaça a correção e veja o teste
  reprovar.** Um teste passou porque casava com o próprio comentário que
  explicava a correção — e continuou verde depois de a correção ser desfeita.
- **Sem etapa de compilação e sem dependências.** Módulos ES carregados pelo
  navegador. Não introduza empacotador nem framework.
- **Português em tudo**: código, comentários, mensagens, documentação, commits.
- **Comentários explicam por quê, não o quê.** Vários trechos parecem estranhos
  e reproduzem defeito de propósito; sem o porquê, alguém os "conserta".

---

## 8. O que vem a seguir

### Pendente de decisão da instituição

**Por onde publicar.** Hoje o painel gera dois arquivos que alguém sobe pelo
GitHub. As alternativas discutidas foram: manter assim; publicar direto do painel
com um token guardado no navegador; ou servidor próprio. A etapa foi mantida
isolada de propósito, para trocar sem refazer o resto. **Esta é também a decisão
que destrava controle de acesso de verdade.**

### Integração com o servidor da empresa

É o próximo passo declarado. Considerações que valem antes de desenhar:

- **O cálculo não precisa de servidor** e não deveria passar a precisar. Roda no
  navegador, sem enviar dados, e é isso que faz o simulador funcionar sem
  internet e sem custo. Se o servidor entrar, entre para **autenticar e publicar**,
  não para calcular.
- **A separação dos dois conjuntos de parâmetros deve sobreviver.** Um servidor
  que sirva o conjunto vigente é fácil de encaixar: o aplicativo já o busca
  rede-primeiro.
- **A prova de equivalência é o ativo mais valioso do projeto.** 1.872 valores
  idênticos ao último bit, com casos extraídos da própria planilha. Qualquer
  refatoração precisa mantê-la verde.

### Melhoria já identificada, não feita

**Um arquivo em vez de dois.** Publicar exige subir `parametros-vigentes.js` e
`PARAMETROS_VIGENTES.json` — mesmo conteúdo, dois formatos. Isso já causou: o
navegador barrando o segundo download; os dois saindo com carimbos diferentes; e
a necessidade de `ferramentas/gerar_modulo.mjs` para reconstruir um a partir do
outro. O aplicativo poderia buscar o JSON com `fetch` em vez de importar o
módulo — publicar viraria **um arquivo, um upload**. Torna o carregamento
assíncrono; é contido, mas mexe na inicialização.

### Pendências menores

- Aviso ao fechar a aba do painel com edição não publicada.
- Uma alteração de linhas de crédito estava em curso quando esta transferência
  começou; confirme com quem conduz se chegou a ser publicada.

---

## 9. O que não fazer

- Não "conserte" um item ABERTO sem autorização expressa da instituição.
- Não some taxa base com indexador.
- Não arredonde no meio do cálculo.
- Não interpole o fator K do FGI.
- Não introduza dependência, empacotador ou etapa de compilação.
- Não escreva a senha do painel em arquivo, commit ou documento.
- Não altere `js/data/parametros.js`: é a prova contra a planilha.
- Não descreva a senha como se fosse controle de acesso.
- Não presuma que passou nos testes é o mesmo que funciona — abra no navegador.
