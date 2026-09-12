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
│   ├── servicos/           leitura de placa, consulta de veículo, foto
│   └── ui/                 elementos, avisos, CSV e as telas
├── ferramentas/        geração de ícones e versionamento da casca
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

90 testes cobrem placa, tabela de preços, passagens de estado, datas, caixa,
fechamento, relatórios, o serviço de armazenamento inteiro (fluxo completo,
pendências, backup, demonstração, PIN), formatação, CSV e a coerência do PWA
(casca × arquivos em disco, manifesto, ícones, versão do cache, importações).

O comportamento da tela é verificado dirigindo o aplicativo num navegador de
verdade, com o Playwright, fora do repositório — atendimento completo, os cinco
pagamentos, offline, foto, backup, restauração, PIN e larguras de 320 a 1280 px.
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
