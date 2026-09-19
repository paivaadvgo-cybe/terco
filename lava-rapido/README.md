# Lava-Rápido Lite

Gestão de lava-rápido de rua num aplicativo de celular. O funcionário registra
o veículo, escolhe a lavagem, recebe o pagamento e finaliza — em poucos toques,
de pé, no meio do movimento.

Tudo acontece dentro do aparelho: não há servidor, conta, nuvem nem envio de
dado nenhum. Depois de instalado, funciona sem internet.

## O que ele faz

| Tela | O que resolve |
|---|---|
| **Início** | Os números do dia, o botão de nova lavagem, o pátio e as pendências. |
| **Nova lavagem** | Placa → tipo → serviço → confirmação. Em modo rápido, três toques. |
| **Lavagens** | O pátio agora, e o histórico com filtros e pesquisa por placa. |
| **Caixa** | Faturamento, recebido por forma de pagamento, pendente e resultado. |
| **Despesas** | Produto, água, energia, manutenção, aluguel e outros. |
| **Fechamento** | O dia fechado, exportável em CSV e imprimível (ou em PDF pelo navegador). |
| **Relatórios** | Dia, semana e mês: lavagens, faturamento, ticket médio e média diária. |
| **Ajustes** | Serviços, preços, funcionários, PIN, backup, tema e demonstração. |
| **Licença** | Situação da licença, código deste aparelho, contato do desenvolvedor e ativação. |

A placa é o cliente: não há cadastro. Quando uma placa já passou por aqui, o
atendimento seguinte já mostra quantas lavagens ela tem, quando foi a última e
qual serviço costuma pedir — e o tipo de veículo já vem escolhido.

## Como executar

Não há compilação, nem dependência para instalar. Os módulos são carregados
como ES modules pelo próprio navegador, e por isso é preciso um servidor —
abrir o `index.html` do disco não funciona.

```
python3 -m http.server 8000     # na raiz do repositório
```

e abra `http://localhost:8000/lava-rapido/`.

Os testes rodam só com o Node:

```
cd lava-rapido && npm test
```

## Como instalar no celular

- **Android (Chrome)** — abra o endereço, toque no menu (⋮) e em **Instalar
  aplicativo** ou **Adicionar à tela inicial**.
- **iPhone (Safari)** — abra o endereço, toque em **Compartilhar** e em
  **Adicionar à Tela de Início**.

Depois de instalado, ele abre como aplicativo, sem barra de endereço, e
funciona sem internet. A instalação exige **https** (ou `localhost`).

## Estrutura

```
lava-rapido/
├── index.html          casca da página: cabeçalho, área de conteúdo, avisos
├── manifest.json       nome, ícones, atalhos — o que o navegador precisa para instalar
├── sw.js               service worker: guarda a casca e serve sem internet
├── css/app.css         estilo inteiro, claro e escuro
├── icones/             gerados por código (ferramentas/gerar_icones.mjs)
├── js/
│   ├── app.js              abre o banco, monta a casca, troca de tela
│   ├── dominio/            regras puras: placa, preços, estados, datas, contas
│   ├── armazenamento/      StorageService, drivers (IndexedDB e memória), PIN
│   ├── licenca/            avaliação de 30 dias, assinatura e registro do aparelho
│   ├── servicos/           leitura de placa, consulta de veículo, foto
│   └── ui/                 elementos, avisos, CSV e as telas
├── ferramentas/        ícones, versionamento da casca e o gerador de licenças
└── tests/              90 testes, `node --test`, sem dependências
```

As camadas não se atravessam: a tela fala com o `StorageService`, que fala com
um driver. Nenhuma tela conhece IndexedDB, e nenhuma regra de negócio conhece
a tela. É essa fronteira que permite, mais tarde, pôr um banco remoto atrás
sem reescrever a interface — e é ela que torna as contas testáveis sem
navegador.

### Decisões que explicam o resto

- **Dinheiro em centavos inteiros.** Em reais fracionários, somar trinta
  lavagens devolve um fechamento que erra centavos, e um fechamento que erra
  centavos não é usado.
- **Faturamento e recebido são números diferentes.** Quando alguém sai devendo,
  os dois se separam. Juntá-los num só é como um caixa deixa de fechar.
- **O pagamento mora dentro da lavagem**, e não numa coleção à parte. Duas
  cópias do mesmo dinheiro é a forma clássica de as contas discordarem sem que
  ninguém saiba qual das duas está certa. `pagamentos()` monta a lista a partir
  das lavagens pagas.
- **Preço nunca fica fixo no código.** A tabela inicial é semeada no banco na
  primeira abertura; a partir daí quem manda é o banco, e reabrir o aplicativo
  não devolve os preços de fábrica a quem já reajustou.
- **O que foi cobrado fica copiado na lavagem.** Mudar a tabela hoje não pode
  reescrever o que se cobrou ontem.
- **O PIN é uma tranca de operação, não segurança.** Ele impede que quem atende
  mude preço ou apague registro; contra quem tem o aparelho e sabe o que faz,
  um aplicativo sem servidor não protege nada — e o resumo gravado no lugar do
  número evita só o caso comum, o de alguém ler o PIN do patrão no banco.
- **Não há OCR embarcado nem consulta a base de veículos.** Onde o navegador
  oferece leitura de texto (`TextDetector`, Chrome no Android), ela é usada;
  onde não oferece, o teclado abre na hora. Nenhum endereço de API fictício foi
  escrito neste repositório: consulta de placa é base regulada, e fingir que ela
  existe seria pior que não ter.

## Como se anda entre as telas

Três caminhos, e cada um para uma coisa:

- **A barra de baixo** leva às cinco seções principais. Fica embaixo porque é
  onde o polegar chega com uma mão só.
- **«‹» no alto, à esquerda** volta uma tela — ou, dentro do atendimento, um
  passo. Aparece em toda tela de dentro e em nenhuma das cinco abas: voltar de
  uma aba seria sair do aplicativo.
- **«✕» no alto, à direita** abandona o que está em curso. Hoje só o
  atendimento o mostra; sair por ali não registra nada e apaga a foto que
  tivesse sido tirada, para não deixar imagem órfã ocupando o aparelho.

O lugar dos dois botões não muda de tela para tela — cada tela diz o que eles
fazem, nenhuma decide onde eles ficam. O «voltar» usa o histórico de verdade
quando há: devolve a tela de onde a pessoa veio, e não um palpite. Quem abriu o
aplicativo direto numa tela de dentro (pelo atalho do aplicativo instalado)
sobe para a tela de cima em vez de sair. O botão de voltar do próprio aparelho
continua funcionando como sempre.

## Licença de uso

O aplicativo funciona **trinta dias** sem nada a fazer. Do **sétimo** ao
trigésimo, uma faixa fica no alto de toda tela lembrando de falar com o
desenvolvedor. Passados os trinta, **só o registro de lavagem nova é
bloqueado**: o carro que está no pátio pode ser finalizado e recebido, e o
histórico, o caixa, os relatórios e o backup seguem liberados.

Os sete primeiros dias são calados de propósito — quem acabou de instalar está
decidindo se o aplicativo serve, e cobrança no primeiro atendimento responde
essa pergunta pelo lado errado. E o bloqueio nunca alcança o dinheiro já
registrado: trancar o dono do lado de fora do próprio movimento seria usá-lo
como refém.

### Como ativar um cliente

1. O cliente abre **Ajustes › Licença de uso** e manda o **código deste
   aparelho** (ou toca no botão do WhatsApp, que já leva o código na mensagem).
2. Você abre `ferramentas/gerador-de-licencas.html` **no seu computador** (dois
   cliques; não precisa de internet), carrega a chave privada, cola o código,
   escolhe a validade e gera o arquivo `.lava`.
3. O cliente recebe o arquivo, toca em **Importar arquivo de licença** e
   escolhe. A ativação é conferida no próprio aparelho, sem servidor.

### As chaves

A licença é assinada com **ECDSA P-256**. O aplicativo carrega só a **chave
pública** (`js/licenca/assinatura.js`), que confere assinaturas e não emite
nenhuma. A **chave privada** fica com você, fora deste repositório — que é
público. Quem a tiver emite licenças válidas para qualquer aparelho.

Para girar as chaves: `node ferramentas/gerar_chaves.mjs <pasta segura>` (ou o
botão no próprio gerador), cole a linha da chave pública em
`js/licenca/assinatura.js`, publique e emita arquivos novos para os clientes
ativos — os antigos deixam de valer.

### O contato

`js/licenca/suporte.js` é o único arquivo a editar: o WhatsApp vai **só com
números** (país, DDD e número, sem `+`, espaço ou traço). Vazio, a tela não
mostra botão nenhum e explica que o contato não foi configurado — um botão que
abre o nada é pior que um botão que não existe.

### O que a licença protege, e o que não

Impede que alguém escreva um arquivo de licença à mão, que uma licença de um
aparelho valha em outro, e que voltar a data do celular estique a avaliação (o
aplicativo guarda o maior instante que já viu). A contagem começa na data mais
antiga entre o registro do aparelho e o nascimento do banco de dados, de modo
que limpar o navegador não reinicia os trinta dias.

Não impede que alguém edite o JavaScript servido e tire a verificação inteira.
Num aplicativo que roda no navegador do cliente, nada impede — e prometer o
contrário seria mentira. Isto é um combinado comercial com uma porta trancada,
não um cofre.

O registro do aparelho (código de instalação e licença) vive no `localStorage`
e **fica fora do backup**: restaurar o backup num celular novo leva o movimento
e não leva a licença.

## Leitura de placa e consulta de veículo

`js/servicos/reconhecimento-placa.js` e `js/servicos/consulta-veiculo.js` têm
cada um um `registrarProvedor(...)`. É por ali que entram, no futuro, um OCR de
verdade e uma consulta autorizada — sem que nada na interface mude. Enquanto
ninguém registra nada, o aplicativo usa o que o navegador oferece e o que está
gravado neste aparelho, e diz qual dos dois está usando.

## Testes

```
npm test
```

114 testes cobrem placa, tabela de preços, passagens de estado, datas, caixa,
fechamento, relatórios, o serviço de armazenamento inteiro (fluxo completo,
pendências, backup, demonstração, PIN), a licença (as duas fronteiras — sétimo
e trigésimo dia —, assinatura, adulteração, relógio atrasado), a navegação
(toda tela de dentro tem para onde voltar), formatação, CSV
e a coerência do PWA (casca × arquivos em disco, manifesto, ícones, versão do
cache, importações).

O comportamento da tela é verificado dirigindo o aplicativo num navegador de
verdade, com o Playwright, fora do repositório — atendimento completo, os cinco
pagamentos, offline, foto, backup, restauração, PIN, o ciclo inteiro da licença
(do primeiro dia ao bloqueio e à ativação) e larguras de 320 a 1280 px. A
acessibilidade é auditada com o axe-core nas treze telas, nos dois temas.
Isso não virou teste do repositório porque exigiria uma dependência de
instalação, e este projeto não tem nenhuma.

## Manutenção

Ao acrescentar ou renomear qualquer arquivo do aplicativo:

```
node ferramentas/versionar_casca.mjs --gravar
```

Sem isso, o navegador continua servindo a versão antiga do cache para quem já
abriu o aplicativo — e `npm test` acusa a diferença antes da publicação.

Os ícones são gerados por código:

```
node ferramentas/gerar_icones.mjs
```

## Privacidade

Não se pede CPF, endereço, e-mail nem telefone do cliente, e não se usa
localização. A placa é o único identificador, e serve só para agrupar as
lavagens do mesmo veículo. Nada sai do aparelho: o backup é um arquivo que
quem administra exporta e guarda onde quiser.
