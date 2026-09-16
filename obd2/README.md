# Painel OBD-II

O motor do carro na tela do celular, pelo conector OBD-II, dentro do
navegador. Rotação, velocidade, temperatura, consumo estimado, códigos de
falha e gravação da viagem.

Tudo acontece dentro do aparelho: não há servidor, conta, nuvem nem envio.
Depois de instalado, funciona sem internet — que é o normal numa garagem
subterrânea ou numa estrada sem cobertura.

## Antes de tudo: o adaptador

É aqui que quase todo mundo tropeça. O que decide se funciona não é o carro
(qualquer um vendido no Brasil a partir de 2010 serve), é **o tipo de
adaptador**:

| Adaptador | Funciona? | Onde |
|---|---|---|
| **Bluetooth BLE 4.0** | ✅ | Android com Chrome; computador com Chrome ou Edge |
| **USB com cabo** | ✅ | Computador com Chrome ou Edge |
| **Wi-Fi** | ⚙️ com a ponte | Android com Termux; computador |
| Bluetooth clássico (SPP) | ❌ | Nenhum navegador |

O dongle azul de vinte reais é **Bluetooth clássico**, e navegador nenhum
abre porta serial clássica — a limitação é das plataformas, não deste
aplicativo, e não há biblioteca que a contorne.

Para comprar sem pensar, procure por «ELM327 BLE» ou «ELM327 4.0». Quem já tem
o de **Wi-Fi** não precisa trocar: veja abaixo.

## O adaptador Wi-Fi e a ponte

O adaptador Wi-Fi cria uma rede própria e fala **TCP puro**, quase sempre em
`192.168.0.10:35000`. **Navegador nenhum abre soquete TCP** — não há API, não
há bandeira para ligar, não há biblioteca que contorne. Vale para Chrome,
Safari e todos os outros.

O que o navegador abre é **WebSocket**. Então o que falta não é código de
navegador: é um tradutor rodando fora dele. Isso é `ferramentas/ponte-wifi.mjs`
— WebSocket de um lado, TCP do outro, sem dependência nenhuma, rodando no
próprio celular. Não precisa de internet: a rede do dongle não tem nenhuma, e o
painel já funciona sem ela.

```
pkg install nodejs                       # no Termux, ainda com internet
curl -O https://paivaadvgo-cybe.github.io/terco/obd2/ferramentas/ponte-wifi.mjs
node ponte-wifi.mjs --testar             # já na rede do adaptador: procura e diz o comando
node ponte-wifi.mjs                      # sobe a ponte
```

O `--testar` existe porque o primeiro teste real erra sempre no mesmo lugar: o
endereço. O manual diz `192.168.0.10`, cada lote de clone escolhe o seu, e
descobrir qual é — sentado no carro, sem ferramenta de rede — é onde se desiste.
Só que o celular já sabe: ele acabou de receber endereço por DHCP **daquela
rede**. O diagnóstico deduz os candidatos da própria interface, bate em cada um,
e distingue três respostas que parecem uma só: ninguém atendeu, atendeu e ficou
calado (outro aplicativo segurando a conexão — esses clones só aceitam uma), ou
atendeu e se apresentou.

Depois, em **Conexão**, toque em «Conectar pelo Wi-Fi». O endereço do campo é o
da **ponte** (`ws://127.0.0.1:8127`); o do adaptador se informa na ponte, com
`--obd 192.168.4.1:35000`.

Por que uma página `https` consegue falar com `ws://127.0.0.1`: a regra de
conteúdo misto abre exceção para origens confiáveis por natureza, e o que não
sai do aparelho é uma delas. É o mesmo mecanismo dos programas-ponte de
carteiras de criptomoeda e leitores de cartão. Verificado em Chromium, não
deduzido.

**A ponte confere a origem de quem conecta**, e isso não é paranoia: enquanto
ela está de pé, qualquer página aberta no celular poderia tentar falar com o
carro — inclusive mandar apagar código de falha. Só as origens conhecidas
passam; outras se acrescentam com `--origem`.

### iPhone e iPad

**Não conectam.** O Safari não tem Web Bluetooth nem Web Serial, e todos os
navegadores do iPhone são obrigados a usar o motor do Safari — então
nenhum aplicativo web, este ou outro, alcança um adaptador OBD no iPhone. O
carro simulado funciona, e serve para conhecer o aplicativo.

## O que ele faz

- **A tela não desliza** — o painel é exatamente do tamanho da janela, e o que
  não é instrumento saiu do caminho: os comandos viraram um trilho estreito na
  borda direita (gravar, vídeo, detalhes, modo cheio, editar) e o resto — estado
  da conexão, máximos, explicações — mora numa gaveta que abre quando se pede.
  Num carro, o número que exige rolar para aparecer é um número que não se lê.
- **Painel que você monta** — arraste para mover, puxe o canto para
  redimensionar, toque para escolher o que cada mostrador mostra e em que escala.
  Três formatos: ponteiro analógico (com escala numerada e o valor exato
  embaixo), número e barra. Até **cinco disposições salvas** — uma para a
  cidade, outra para a estrada, outra para a oficina. Começa de um modelo:
  **Instrumentos** (velocímetro grande no centro, conta-giros ao lado),
  **Completo** ou **Vazio**. O editor também cabe na janela, e com a mesma
  geometria do painel — o que se arrasta tem a forma do que se vê dirigindo.
- **Modo quadro de instrumentos** — esconde título, abas e o resto, e deixa só o
  painel, de ponta a ponta, sobre fundo preto. Toque em qualquer lugar para
  sair. É o modo para o celular preso ao painel do carro.
- **Escala por mostrador** — a tabela traz uma faixa genérica (rotação de 0 a
  8.000), e quem personaliza quer a do seu carro: num diesel que corta em 4.500,
  apertar a escala é a diferença entre um ponteiro que mexe e um que fica quase
  parado.
- **Velocidade do OBD, do GPS, ou as duas** — o velocímetro do carro marca para
  cima de fábrica: a norma permite indicar acima da velocidade real e proíbe
  indicar abaixo, e os fabricantes usam essa folga (5 a 10% é o comum). A
  velocidade do OBD traz a mesma folga; a do GPS mede o deslocamento no chão.
  Com as duas ligadas, uma fica no ponteiro e a outra menor sob o número — e dá
  para ver de quanto é a diferença no seu carro.
- **Pressão do turbo** — em bar, calculada como a pressão do coletor menos a
  atmosférica. É assim que um manômetro de turbo funciona: o PID do carro dá a
  pressão *absoluta*, que já inclui a atmosfera, e mostrá-lo cru faria um motor
  desligado marcar 1 bar de sopro. Em marcha lenta e em desaceleração marca
  negativo, porque ali é vácuo mesmo.
- **Máximos registrados** — velocidade, rotação, turbo e temperatura: o maior
  valor da conexão atual e o recorde de sempre daquele carro, guardado entre
  sessões. É o maior valor **lido**; entre duas leituras o carro pode ter
  passado disso.
- **Consumo, agora e médio** — o instantâneo pelo PID 5E quando o carro o
  informa; senão calculado pelo fluxo de ar; senão deduzido da pressão do
  coletor, se você informar a cilindrada. A tela sempre diz de onde veio o
  número, porque uma medição e uma dedução não valem a mesma coisa. A **média**
  acumula desde que se conectou — quilômetros somados sobre litros somados, e
  não a média dos km/L, que daria um consumo que não aconteceu em momento
  nenhum.
- **Falhas** — códigos confirmados, pendentes e permanentes, com descrição
  em português dos genéricos mais comuns. Dá para apagar, com o aviso de que
  apagar não conserta e zera os monitores de emissão.
- **Viagens** — grava uma amostra por segundo, calcula distância, tempo
  parado, máximos e consumo médio, desenha o gráfico de qualquer leitura e
  exporta em CSV que o Excel brasileiro abre certo.
- **Vídeo da estrada** — grava a câmera traseira junto com a viagem, em trechos
  de 30 segundos, e na tela da viagem o vídeo aparece com os dados do instante
  que está tocando. É o que transforma «4.300 rpm às 14h32» em ver a
  ultrapassagem acontecendo. Enquanto grava, a imagem ocupa a **lateral
  esquerda** da tela e os instrumentos ficam à direita, cada um com altura
  inteira. Opcional, desligado por padrão.
- **Simulação** — um ELM327 de mentira com um carro de mentira dentro (turbo,
  para exercitar o medidor), para conhecer o aplicativo sem adaptador e para
  testar a pilha inteira no `node --test`, sem carro.

## Como usar

O aplicativo é feito para a **tela deitada**: o manifesto pede paisagem, a grade
tem oito colunas e os modelos são desenhados para as três linhas que a altura de
um celular em paisagem comporta. O painel e o editor se prendem à janela — as
linhas dividem a altura disponível, e nenhuma das duas telas rola.

1. Abra o aplicativo em **https** (GitHub Pages serve), e instale na tela
   inicial se quiser.
2. Ligue o adaptador no conector OBD-II — sob o painel, do lado do
   motorista — e dê partida no carro (ou deixe a ignição em «ligado»).
3. Em **Conexão**, toque em «Procurar adaptador Bluetooth» e escolha-o na
   lista do sistema. A primeira conexão leva alguns segundos: o adaptador
   testa os protocolos até achar o do carro.
4. Volte ao **Painel**.

Opere com o carro parado, e use suporte para o celular.

## Arquivos

| Caminho | O que é |
|---|---|
| `index.html`, `css/`, `manifest.json` | A casca, o estilo e o atualizador. |
| `sw.js` | Service worker: guarda o aplicativo para uso sem internet. |
| `js/obd/` | Protocolo ELM327, tabela de PIDs, códigos de falha e os transportes (BLE, serial, Wi-Fi pela ponte, simulação). |
| `js/dominio/` | Consumo, resumo de viagem, datas. Sem navegador, testável no Node. |
| `js/armazenamento/` | IndexedDB, driver em memória e a fachada de dados. |
| `js/ui/` | Elementos, ponteiros, gráfico, CSV e as cinco telas. |
| `js/sessao.js` | A conexão viva e o laço de leitura. |
| `js/video.js` | A câmera: grava a estrada em trechos, com a hora de cada um. |
| `js/gps.js` | A velocidade pelo GPS, com precisão e idade da correção. |
| `js/dominio/painel.js` | A disposição: grade, colisão, escala, modelos e as cinco configurações. |
| `js/ui/grade.js` | Arrastar e redimensionar com o dedo, e a célula quadrada. |
| `tests/` | `npm test` — 199 testes, sem navegador e sem carro. |
| `ferramentas/` | Gera os ícones, carimba a versão do cache e a ponte do adaptador Wi-Fi. |

## Desenvolvimento

```
npm test      # roda os testes
npm run icones # regera os ícones
npm run versao # carimba a versão do cache depois de mudar algum arquivo
npm run servir # serve o repositório em http://localhost:8000/obd2/
npm run ponte  # sobe a ponte do adaptador Wi-Fi (--obd, --porta, --servir)
```

A versão do cache do service worker é o resumo do conteúdo da casca. Mudou
arquivo, tem de rodar `npm run versao` — e o teste `tests/pwa.test.js`
reprova se esquecer, porque esquecer significa que a versão publicada não
chega a quem já tem o aplicativo instalado.

### Como a atualização chega

Quem aplica a atualização é um trecho **escrito dentro do `index.html`**, e não
um módulo — e isso é a correção de um defeito real, não estilo. Os módulos são
servidos cache primeiro: enquanto o worker antigo estiver no comando, o
`js/app.js` que o aparelho executa é o do cache dele. Um erro no atualizador se
trancaria junto com a versão que o contém, e a correção nunca chegaria, porque
chegaria exatamente no arquivo que ninguém vai buscar. Já o documento é rede
primeiro e revalidado: o que está no `index.html` alcança o aparelho no primeiro
carregamento com internet.

Com o aplicativo parado, a versão nova entra sozinha e a tela recarrega —
esperar um toque num aviso é esperar um toque que ninguém dá. Com o carro
conectado ou uma viagem sendo gravada, não: aí aparece o aviso, e quem está
dirigindo decide quando. Quem responde essa pergunta é o `js/app.js`, na
`window.painelOcupado`.

## Limites, ditos na cara

- O consumo calculado pelo fluxo de ar assume mistura estequiométrica. É bom
  em velocidade constante e otimista em aceleração forte e no para-e-anda.
- Códigos de fabricante (`P1xxx`) aparecem sem descrição de propósito: o
  mesmo número significa coisas diferentes em marcas diferentes, e chutar
  seria pior que calar.
- Um clone BLE entrega de 4 a 10 leituras por segundo, somando todos os
  valores. O aplicativo prioriza rotação e velocidade e espaça o resto.
- Com a tela apagada o navegador congela a página. Durante a gravação o
  aplicativo pede para manter a tela acesa; se o sistema recusar, a gravação
  fica com buracos — que o resumo declara, em vez de inventar distância. Vale
  igual para o vídeo: em segundo plano a câmera para.
- Vídeo ocupa espaço de verdade — perto de 20 MB por minuto em 720p. Há um teto
  configurável, e ao batê-lo a gravação de vídeo para com aviso, em vez de ser
  cortada pelo navegador quando a cota estourar. Os dados da viagem continuam.
- O som vem desligado por padrão: a câmera grava a estrada, mas o microfone
  grava a conversa de quem está no carro — inclusive de quem não escolheu ser
  gravado.
- Sem o PID da pressão atmosférica (33), o turbo é calculado contra 101,3 kPa.
  Em Goiânia, a 750 m de altitude, isso desloca a leitura em cerca de 0,08 bar.
- A disposição é uma grade de oito colunas, e não posição livre em pixels: um
  mostrador em «x = 280 px» sumiria da tela de 360 px, e o painel montado no
  aparelho de casa chegaria torto no do carro.
- Arrastar um mostrador para cima de outro **do mesmo tamanho** troca os dois de
  lugar. Para cima de um de tamanho diferente, o aplicativo recusa e sacode:
  empurrar, encolher ou empilhar não têm resposta óbvia, e inventar uma seria
  pior que deixar escolher outro lugar.
- Do quadro de instrumentos que serviu de modelo, ficaram de fora quatro coisas,
  e cada uma por um motivo: a **bússola** precisa de magnetômetro, que o
  navegador expõe de forma irregular e com permissão à parte; o **limite de
  velocidade** exige dados de mapa, que este aplicativo não tem e não inventa; a
  **marcha engatada** não tem PID padronizado na maioria dos carros; e o
  **relógio** não é um número com unidade, que é a única coisa que os
  mostradores sabem desenhar hoje.
- O GPS perde o sinal em túnel, garagem e sob mata fechada. Quando a última
  correção fica velha ou imprecisa, a tela diz «sem sinal» em vez de mostrar o
  último número — que seria afirmar uma velocidade de meio minuto atrás. Ele
  também gasta bateria, e por isso vem desligado.
- A ponte do Wi-Fi é uma peça a mais para dar errado: se o Termux for fechado
  pelo sistema, a conexão cai no meio da viagem. O adaptador BLE não tem esse
  problema, e por isso continua sendo o que se recomenda comprar — a ponte é
  para quem já tem o Wi-Fi na mão.
- O aplicativo **lê**. Não regrava módulo, não altera parâmetro do motor e
  não faz remapeamento. As únicas escritas são o pedido de apagar falhas
  (serviço 04) e os ajustes do próprio adaptador.
