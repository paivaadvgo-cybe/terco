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
| Bluetooth clássico (SPP) | ❌ | Nenhum navegador |
| Wi-Fi | ❌ | Nenhum navegador |

O dongle azul de vinte reais é **Bluetooth clássico**, e navegador nenhum
abre porta serial clássica — a limitação é das plataformas, não deste
aplicativo, e não há biblioteca que a contorne. O de Wi-Fi fala TCP puro, e
uma página `https` não abre soquete TCP nem conteúdo sem criptografia.

Procure por «ELM327 BLE» ou «ELM327 4.0».

### iPhone e iPad

**Não conectam.** O Safari não tem Web Bluetooth nem Web Serial, e todos os
navegadores do iPhone são obrigados a usar o motor do Safari — então
nenhum aplicativo web, este ou outro, alcança um adaptador OBD no iPhone. O
carro simulado funciona, e serve para conhecer o aplicativo.

## O que ele faz

- **Painel ao vivo** — dois ponteiros grandes (rotação e velocidade) e
  mostradores para o que você escolher: temperatura do motor, acelerador,
  carga, tensão da bateria, fluxo de ar, nível do tanque.
- **Consumo** — pelo PID 5E quando o carro o informa; senão calculado pelo
  fluxo de ar; senão deduzido da pressão do coletor, se você informar a
  cilindrada. A tela sempre diz de onde veio o número, porque uma medição e
  uma dedução não valem a mesma coisa.
- **Falhas** — códigos confirmados, pendentes e permanentes, com descrição
  em português dos genéricos mais comuns. Dá para apagar, com o aviso de que
  apagar não conserta e zera os monitores de emissão.
- **Viagens** — grava uma amostra por segundo, calcula distância, tempo
  parado, máximos e consumo médio, desenha o gráfico de qualquer leitura e
  exporta em CSV que o Excel brasileiro abre certo.
- **Simulação** — um ELM327 de mentira com um carro de mentira dentro, para
  conhecer o aplicativo sem adaptador (e para testar a pilha inteira no
  `node --test`, sem carro).

## Como usar

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
| `index.html`, `css/`, `manifest.json` | A casca e o estilo. |
| `sw.js` | Service worker: guarda o aplicativo para uso sem internet. |
| `js/obd/` | Protocolo ELM327, tabela de PIDs, códigos de falha e os transportes (BLE, serial, simulação). |
| `js/dominio/` | Consumo, resumo de viagem, datas. Sem navegador, testável no Node. |
| `js/armazenamento/` | IndexedDB, driver em memória e a fachada de dados. |
| `js/ui/` | Elementos, ponteiros, gráfico, CSV e as cinco telas. |
| `js/sessao.js` | A conexão viva e o laço de leitura. |
| `tests/` | `npm test` — 94 testes, sem navegador e sem carro. |
| `ferramentas/` | Gera os ícones e carimba a versão do cache. |

## Desenvolvimento

```
npm test      # roda os testes
npm run icones # regera os ícones
npm run versao # carimba a versão do cache depois de mudar algum arquivo
npm run servir # serve o repositório em http://localhost:8000/obd2/
```

A versão do cache do service worker é o resumo do conteúdo da casca. Mudou
arquivo, tem de rodar `npm run versao` — e o teste `tests/pwa.test.js`
reprova se esquecer, porque esquecer significa que a versão publicada não
chega a quem já tem o aplicativo instalado.

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
  fica com buracos — que o resumo declara, em vez de inventar distância.
- O aplicativo **lê**. Não regrava módulo, não altera parâmetro do motor e
  não faz remapeamento. As únicas escritas são o pedido de apagar falhas
  (serviço 04) e os ajustes do próprio adaptador.
