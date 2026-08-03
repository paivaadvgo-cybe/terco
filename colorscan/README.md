# ColorScan Auto

PWA de identificação de cores de pintura automotiva pela câmera do celular,
feito para funileiros e pintores. Funciona **100% offline**: nenhuma imagem ou
dado sai do aparelho — não há servidor, conta ou login.

> ⚠️ **Limite físico honesto:** câmera de celular não substitui
> espectrofotômetro. Sem calibração, a leitura varia facilmente 10–30% em ΔE
> só por causa da luz ambiente e do balanço de branco automático. Por isso a
> **calibração de luz é etapa obrigatória** do fluxo (ou explicitamente
> pulada, com confiança reduzida). Use o resultado como ponto de partida e
> confirme sempre pela etiqueta do veículo ou catálogo do fabricante.

## Como funciona o fluxo

1. **Calibração de luz (etapa 0)** — o app mede a luminância da cena
   processando o próprio feed de vídeo (`Y = 0.2126·R + 0.7152·G + 0.0722·B`)
   e mostra um semáforo em tempo real: Muito escuro / Escuro / Ideal / Claro /
   Excesso de luz / Reflexo direto. A API `AmbientLightSensor` não é usada de
   propósito: não tem suporte confiável em Chrome nem Safari.
2. **Cartão de referência (recomendado)** — aponte a câmera por 2 s para o
   cartão cinza neutro (ou uma folha branca). O app calcula os ganhos de white
   balance por canal e o ganho de luminância, e aplica esses fatores medidos em
   todas as leituras seguintes.
3. **Captura** — congele um frame do veículo e desenhe um quadrado **somente
   sobre a pintura** (evite vidros, plásticos e reflexos).
4. **Análise** — reflexos especulares e sombras profundas são descartados
   pixel a pixel; a cor dominante é extraída por quantização e comparada ao
   banco por **ΔE2000 no espaço CIE Lab** (distância RGB aparece só como dado
   auxiliar de diagnóstico).
5. **Resultado** — nome, montadora, código aproximado, acabamento detectado
   (sólida/metálica/perolizada/fosca), confiança e **qualidade da calibração
   daquela leitura** (Boa / Regular / Pulada). Abaixo de 80% de confiança, o
   app mostra "Possíveis correspondências" ordenadas.
6. **Aprendizado** — errou? Toque em "A cor correta era outra…". A correção é
   guardada localmente junto com as condições de luz e passa a valer nas
   próximas leituras.

Se a luz ambiente mudar muito entre leituras (Δ luminância > 45/255), o app
avisa e pede recalibração.

## Instalação

O app é um PWA estático — basta servir esta pasta por HTTPS (a câmera exige
contexto seguro):

- **GitHub Pages**: publique o repositório e acesse
  `https://SEU-USUARIO.github.io/NOME-DO-REPO/colorscan/`.
- **Teste local**: `python3 -m http.server 8000` dentro desta pasta e acesse
  `http://localhost:8000` (localhost é considerado seguro).

No celular, abra o endereço no Chrome/Safari e use **"Adicionar à tela
inicial"** (ou o botão "Instalar aplicativo" na tela inicial do app). Após a
primeira visita, tudo funciona sem internet.

## Cartão de calibração

Imprima [`assets/reference-card.pdf`](assets/reference-card.pdf) em papel
fosco, escala 100%. O retângulo é cinza neutro ~18% (sRGB 124). Observações:

- Impressoras variam; para máxima precisão use um cartão cinza fotográfico
  comercial (venda em lojas de foto, custo baixo).
- Uma folha branca comum também serve: o app detecta automaticamente se a
  referência é branca (média > 170) ou cinza e ajusta o alvo.
- Evite sombra sobre o cartão e reflexo direto de lâmpadas durante os 2 s.

## Banco de cores (`database/colors.json`)

Base **curada e realista** para o MVP: ~150 cores das montadoras prioritárias
no Brasil (GM/Chevrolet, VW, Fiat, Ford, Toyota, Honda, Hyundai, Renault,
Peugeot, Citroën, Jeep, e algumas secundárias). Os hex são aproximações da cor
sob luz difusa; os códigos são aproximados e servem de ponto de partida para a
tabela oficial.

### Como expandir a base

Cada cor é um objeto:

```json
{
  "id": "gm-001",
  "nome": "Prata Switchblade",
  "montadora": "Chevrolet (GM)",
  "codigo": "GAN / WA636R",
  "familia": "Prata",
  "tipo": "metalica",
  "anos": "2012-2024",
  "hex": "#B9BDC0"
}
```

Adicione objetos ao array `cores` e incremente `VERSAO` em
`service-worker.js` para invalidar o cache dos usuários. O Lab é calculado em
tempo de execução a partir do hex — não precisa informar.

Alternativamente, cadastre cores direto no app ("A cor correta era outra… →
cadastrar nova"): elas ficam no `localStorage` do aparelho.

## Arquitetura

Tudo em `app.js`, separado nos módulos da especificação:

| Módulo | Responsabilidade |
|---|---|
| `ColorMath` | Conversões RGB/HSV/XYZ/Lab e ΔE2000 (CIEDE2000, Sharma 2005) |
| `Storage` | Camada sobre `localStorage` |
| `Database` | Catálogo + cores aprendidas, matching por ΔE2000 |
| `CameraManager` | Câmera traseira, congelamento de frame |
| `CalibrationManager` | Luminância pelo vídeo, cartão de referência, fatores de correção, recalibração automática |
| `ImageProcessor` | White balance/ganho medidos, máscaras de reflexo/sombra, estatísticas, equalização (diagnóstico) |
| `ColorAnalyzer` | Acabamento, desbotamento/repintura, confiança |
| `History` | Histórico com foto, pesquisa, poda automática |
| `OfflineManager` | Service worker + prompt de instalação |
| `UIController` | Telas e eventos |

Limiares empíricos (luz, reflexo, máscaras, confiança) estão documentados nos
comentários dos próprios módulos.

### Por que não OpenCV.js?

As operações necessárias (média/histograma de luminância, ganho por canal,
equalização) são triviais em Canvas 2D. OpenCV.js custaria ~8 MB de cache — 
inaceitável para um PWA offline voltado a celulares intermediários.
TensorFlow.js fica como evolução futura (exigiria dataset rotulado próprio).

## Privacidade

- Nenhuma imagem é enviada a servidores (não existe backend).
- Histórico, calibração e cores aprendidas ficam no `localStorage` do
  aparelho e podem ser apagados limpando os dados do site.

## Evolução recomendada

1. **OCR da etiqueta do veículo** — mais confiável que matching por câmera;
   priorizar logo após o MVP.
2. **Espectrofotômetro Bluetooth** assistido pelo app.
3. **Catálogos de fabricantes de tinta** (PPG, BASF, Lazzuril, Sherwin-
   Williams, Axalta…), sujeito a autorização dos dados.
