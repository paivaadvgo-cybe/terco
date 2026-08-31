# Administração dos parâmetros

Este documento é para quem responde pelos parâmetros do simulador na
GoiásFomento. Não exige saber programar, e não há nada aqui que dependa de
abrir código.

O endereço do painel é o do simulador com `/admin.html` no fim:

    https://paivaadvgo-cybe.github.io/terco/simulador/admin.html

---

## O que se administra pelo painel, e o que não

**Pelo painel:** produtos — incluir, alterar e excluir família inteira —, com o
comportamento de cálculo de cada um; linhas de crédito — incluir, alterar e
excluir —, prazos máximos, carências máximas, limites, valores mínimos, taxas
cheias e taxas com bônus; a tabela do fator K do FGI; as alíquotas do IOF; a
escada da TAC; os fatores do FAMPE e do FUNDEQ; a renda exigida para aval; a
cobertura da alienação de imóvel; e os valores de referência dos indexadores.

**Não pelo painel:** um comportamento de cálculo que ainda não exista. Um
sistema de amortização que não seja SAC nem PRICE, uma convenção de taxa que
não seja nenhuma das duas, um encargo que a planilha nunca teve. Isso é
desenvolvimento.

A distinção importa e é simples: **compor um produto novo com o que já existe
não é código; inventar um comportamento novo, é.** Cada campo de comportamento
no painel é uma escolha entre dois ou três valores, e a lista deles é a lista
do que o motor sabe executar — não há como escolher um que ele não conheça,
porque o painel só oferece os que existem.

---

## A senha do painel

Na aba **Senha** você define, troca ou remove a senha que o painel pede ao
abrir. Ela só passa a valer depois de publicada, como qualquer outro parâmetro.

**Leia isto antes de confiar nela.** O simulador não tem servidor: tudo roda no
navegador de quem abre a página, e o código é público. Uma senha conferida ali
**não é controle de acesso**. Quem souber abrir as ferramentas do desenvolvedor
passa por ela, e os parâmetros continuam legíveis no repositório de qualquer
jeito — eles não são segredo, são a tabela de crédito que o simulador usa à
vista de todos.

O que ela faz, e faz bem: impede o acesso **acidental**. O clique errado, o
visitante curioso, a aba esquecida aberta numa máquina compartilhada. E deixa
explícito que a página não é para qualquer um. Publicar uma alteração de taxa
por engano é dano real, e é contra esse engano que ela protege.

Para impedir alteração de fato seria preciso um servidor que autentique de
verdade — a mesma decisão que está pendente com o administrador de rede sobre
por onde publicar.

A senha nunca é guardada: fica um resumo dela, calculado com sal e trezentas e
dez mil iterações, de modo que cada tentativa de adivinhação custa cerca de
sessenta milésimos de segundo. Adivinhar uma senha de doze caracteres assim é
inviável; uma senha curta ou óbvia, não — por isso o mínimo de doze caracteres é
exigido.

A liberação vale pela aba: fechou, pede de novo. Numa máquina compartilhada,
deixar o painel aberto para sempre seria pior do que não ter senha.

---

## O caminho de uma alteração

### 1. Abrir o painel

Ele abre já com os parâmetros que estão no ar. A faixa no alto diz «Nenhuma
alteração ainda» e mostra a vigência em vigor.

Se você estiver retomando um trabalho de outro dia, use **Abrir arquivo** e
escolha o rascunho que tinha baixado.

### 2. Alterar

#### Produtos

Um produto é uma família de linhas que compartilham a forma de calcular —
Capital de Giro, Investimento, FCO Empresarial, e assim por diante. Na aba
**Produtos** você inclui, renomeia e exclui famílias, e escolhe:

- **quais grupos de linhas** o produto oferece, marcando as caixas. Um produto
  sem grupo nenhum não tem o que oferecer, e a conferência avisa;
- **o comportamento de cálculo**, num bloco marcado com ⚙: convenção da taxa,
  base da amortização, tratamento da carência, variante da TAC, tipo de bônus e
  indexador.

Cada um desses campos tem duas ou três opções, com a explicação do que cada uma
faz embaixo. **Elas mudam o cálculo de todas as linhas da família de uma vez** —
por isso aparecem em vermelho na conferência, e por isso a aba Testar existe.

Para criar uma família nova: **Incluir produto**, dê o nome, marque os grupos de
linhas que ela oferece, ajuste o comportamento, e teste. O produto novo aparece
na aba Testar assim que for criado.

Cada campo traz embaixo a explicação do que ele faz. Campos alterados ficam com
a borda alaranjada, e a faixa do alto passa a contar quantas alterações há
pendentes.

Sobre as **taxas**: o valor é digitado em pontos percentuais — para 2,4% ao mês
escreve-se `2,4`. Ao lado de cada taxa há a unidade, ao mês ou ao ano. **A
unidade não converte o número.** Trocar «ao ano» por «ao mês» num campo faz o
motor ler o mesmo número por um período diferente, e uma taxa anual lida como
mensal cobra cerca de doze vezes mais. Por isso a lista de conferência destaca
toda troca de unidade em vermelho.

Sobre **valores**: escrevem-se no formato brasileiro, com ponto de milhar e
vírgula decimal — `300.000,00`.

Algumas taxas aparecem com muitas casas, como `2,395144`. Elas vêm de fórmula
na planilha de origem e são assim mesmo. Não precisam ser «arrumadas»: um campo
que você não tocar mantém o valor exato que está guardado, com todos os dígitos.

### 3. Testar — a etapa que não se pula

Na aba **Testar**, escolha uma linha e um valor, e o painel roda a mesma
simulação duas vezes: com os parâmetros que estão no ar e com os seus. As duas
colunas aparecem lado a lado, e o que diferir fica destacado.

Vale conferir duas coisas:

- a linha que você alterou mudou como se esperava;
- uma linha que você **não** alterou continua com as duas colunas iguais.

A segunda pega o engano mais comum: mexer num encargo — IOF, TAC, fator K —
achando que afeta um produto só, quando ele vale para todos.

### 4. Conferir

A aba **Conferir e publicar** pede quatro informações e mostra duas listas.

As informações são a **data de vigência**, o **ato normativo** que determinou a
alteração, **quem publicou** e observações. As três primeiras são obrigatórias:
elas ficam gravadas junto dos parâmetros e são o que permite, meses depois,
saber sob que regra uma simulação foi feita. Toda simulação guarda a vigência e
o ato normativo que a produziram.

A primeira lista é **o que mudou**, escrito por extenso: «FCO MEI · Taxa cheia
(município prioritário): 8,8992% ao ano → 9,15% ao ano». É essa lista que se
confere contra a norma. Exclusões de linha e trocas de unidade aparecem
marcadas em vermelho.

A segunda é a **conferência**, com duas severidades:

- **Impedimento** (vermelho) — bloqueia a publicação. É um valor que não tem
  leitura possível: uma taxa em branco que existia, duas linhas com o mesmo
  nome, faixas da TAC fora de ordem.
- **Alerta** (laranja) — não bloqueia. É um valor incomum, e você pode ter
  razão: uma taxa de 20% ao mês, uma carência maior que o prazo, um indexador
  com referência antiga.

Alguns alertas vêm marcados **«já existia»**. São defeitos da planilha de
origem que ainda aguardam decisão da instituição — linhas sem taxa, herdadas de
células com erro. Eles não impedem publicar: seria injusto exigir que você
resolvesse pendências antigas para alterar uma taxa hoje. Mas se você
*introduzir* um defeito desses, aí impede.

### 5. Publicar

Com os impedimentos zerados, aparece o botão **Baixar os arquivos para
publicar**. Ele baixa dois:

- `parametros-vigentes.js`
- `PARAMETROS_VIGENTES.json`

Os dois têm o mesmo conteúdo. O primeiro é o que o simulador carrega; o segundo
é a versão legível, para auditoria.

No repositório, substitua:

    simulador/js/data/parametros-vigentes.js
    simulador/dados/PARAMETROS_VIGENTES.json

pelos arquivos baixados, descrevendo o ato normativo na confirmação. A
publicação leva cerca de um minuto. Quem já estiver com o simulador aberto verá
o aviso de atualização.

Antes de sair da tela, use **Imprimir o relatório de alterações**: sai a lista
do que mudou, com a norma e a data, para juntar ao processo.

---

## Perguntas que aparecem

**Perdi o que estava editando.**
A edição vive só na aba aberta, de propósito: guardar sozinho criaria um
conjunto pela metade, invisível, que reapareceria semanas depois sem ninguém
lembrar do que era. Use **Baixar rascunho** ao interromper o trabalho.

**Alterei e quero desfazer.**
**Descartar alterações** volta ao que está publicado. Um campo só pode ser
desfeito individualmente digitando o valor antigo — a lista de conferência
mostra qual era.

**Excluí uma linha sem querer.**
Enquanto não publicar, **Descartar alterações** resolve. Depois de publicada, a
exclusão vale: simulações antigas que usavam a linha continuam guardadas, mas
não poderão ser refeitas.

**Uma aba aparece como «registro de auditoria» e não deixa editar.**
São as abas da planilha de origem que nenhum produto consulta. Elas ficam
guardadas para conferência, mas alterá-las não mudaria cálculo nenhum, e um
campo editável que não faz nada é pior do que campo nenhum. As linhas que valem
estão na tabela de encargos, no alto da mesma tela.

**Preciso incluir uma linha de crédito nova.**
Use **Incluir linha neste grupo**, no grupo a que ela pertence — o grupo
determina qual produto vai oferecê-la, e a tela diz quais produtos leem de
cada um. Preencha nome, prazo, carência, limite e taxas, e teste antes de
publicar.

**Uma taxa que preciso publicar é bem diferente das outras.**
Publique. O painel vai alertar, e o alerta não impede. O simulador reproduz o
que a instituição decidir.

---

## O que fica guardado, e onde

| Arquivo | O que é | Quem altera |
|---|---|---|
| `js/data/parametros.js` | A planilha de origem, extraída. Não muda. | Ninguém — só a reextração da planilha |
| `js/data/parametros-vigentes.js` | O que está em vigor. | O painel |
| `dados/PARAMETROS_VIGENTES.json` | O mesmo, para auditoria. | O painel |

A base extraída da planilha **não** é alterada pelo painel, e isso é
proposital: é contra ela que os testes provam que o motor reproduz o arquivo
original. Uma taxa que mudou por norma não pode derrubar essa prova — são
coisas distintas. A diferença entre os dois arquivos é, exatamente, tudo que a
administração alterou desde a planilha.
