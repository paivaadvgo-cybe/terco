# AirDrums AI

Bateria virtual tocada no ar. A câmera do celular enxerga as mãos, e cada
movimento sobre uma peça invisível dispara o som correspondente.

Tudo acontece dentro do aparelho: não há servidor, conta, nuvem nem envio de
imagem. Depois de instalado, funciona sem internet.

## Arquivos

| Arquivo      | O que é |
|--------------|---------|
| `index.html` | O aplicativo inteiro — interface, áudio, visão computacional, manifesto e ícones. |
| `sw.js`      | Service worker: guarda o app e o modelo de mãos para uso sem internet. |
| `terco/`     | O aplicativo **Santo Terço**, que antes ocupava a raiz. Continua funcionando, agora em `/terco/`. |

O aplicativo é um arquivo só, como pedido. O `sw.js` existe porque os
navegadores exigem que um service worker seja um `.js` servido pelo mesmo
domínio — não pode morar dentro do HTML. Sem ele o app funciona igual; só não
fica disponível offline. O manifesto e o ícone não são arquivos: são gerados
em tempo de execução (ou servidos pelo próprio service worker).

## Como publicar

Os dois arquivos são estáticos. Coloque-os em qualquer endereço **https://**
— por exemplo o GitHub Pages deste repositório. A câmera só funciona em
conexão segura (https ou `localhost`).

Para testar na sua máquina:

```
python3 -m http.server 8000
```

e abra `http://localhost:8000/`.

## Como usar

1. Apoie o celular a cerca de 1,5 m, na altura do peito, com a câmera
   traseira apontada para você.
2. Toque em **Iniciar câmera** e libere a permissão.
3. Bata no ar, para baixo e com firmeza. Movimentos lentos não tocam — é
   proposital.
4. Em **Calibrar**, arraste cada peça para onde o seu braço alcança. As
   posições são salvas sozinhas, e cada orientação da tela guarda a sua.

Sem câmera disponível, o **Demo** mostra o funcionamento e é possível tocar
encostando o dedo nas peças (ou pelo teclado: `Q W A S D F J` e espaço).

## O que tem dentro

- **Detecção** — MediaPipe Hands (Tasks Vision), duas mãos, com posição,
  velocidade, direção e aceleração. GPU quando disponível, CPU como reserva.
- **Golpe** — cruzamento exato entre o trajeto da mão e a região da peça, com
  rearme por histerese, intervalo mínimo configurável e uma peça por mão a
  cada quadro. A força do som vem da velocidade do movimento.
- **Áudio** — WebAudio puro, sintetizado na hora (nenhum arquivo de som),
  mixer por peça com panorama estéreo, compressor e limitador.
- **Kits** — Rock, Jazz, Metal, Pop e Eletrônica.
- **Treino** — metrônomo de 40 a 240 BPM, compasso ajustável, contagem antes
  de começar e marcação manual de andamento.
- **Gravação** — grava as batidas, reproduz e exporta em WAV (PCM 16 bits,
  estéreo, 44,1 kHz), renderizado no próprio aparelho.
- **Acessibilidade** — alto contraste, modo daltônico (a forma do traço
  também distingue as peças), texto redimensionável, alvos grandes, retorno
  visual, sonoro e por vibração.
