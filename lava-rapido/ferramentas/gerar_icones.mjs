/**
 * Gera os ícones do aplicativo.
 *
 *     node ferramentas/gerar_icones.mjs
 *
 * Os ícones são desenhados por código, e não exportados de um editor, por um
 * motivo prático: o repositório não tem etapa de compilação nem dependências, e
 * um PNG binário que ninguém sabe regerar é um arquivo órfão — quando a cor da
 * marca mudar, não haverá o que editar. Aqui a cor é uma constante.
 *
 * O desenho é feito com dobro de resolução e reduzido por média (4 amostras por
 * pixel). Sem isso, a borda arredondada e as rodas ficam serrilhadas no tamanho
 * de 192 px, que é justamente o que o Android mostra na tela inicial.
 *
 * O ícone mascarável desenha o mesmo carro menor e sem canto arredondado: o
 * Android recorta o formato que quiser (círculo, quadrado, gota), e o que
 * estiver fora dos 80% centrais é perdido.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const AZUL = [11, 107, 203];
const BRANCO = [255, 255, 255];
const AZUL_CLARO = [191, 227, 255];

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const destino = path.join(raiz, 'icones');

/* ------------------------------------------------------------------ PNG */

function png(largura, altura, rgba) {
  const linhas = Buffer.alloc((largura * 4 + 1) * altura);
  for (let y = 0; y < altura; y += 1) {
    linhas[y * (largura * 4 + 1)] = 0;                       // filtro «nenhum»
    rgba.copy(linhas, y * (largura * 4 + 1) + 1, y * largura * 4, (y + 1) * largura * 4);
  }

  const pedaco = (tipo, dados) => {
    const cabeca = Buffer.alloc(8);
    cabeca.writeUInt32BE(dados.length, 0);
    cabeca.write(tipo, 4, 'ascii');
    const fim = Buffer.alloc(4);
    fim.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(tipo, 'ascii'), dados])), 0);
    return Buffer.concat([cabeca, dados, fim]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;      // 8 bits por canal
  ihdr[9] = 6;      // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco('IHDR', ihdr),
    pedaco('IDAT', zlib.deflateSync(linhas, { level: 9 })),
    pedaco('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------- desenho */

function tela(lado) {
  const pixels = new Float64Array(lado * lado * 4);
  const pintar = (x, y, cor, alfa = 1) => {
    if (x < 0 || y < 0 || x >= lado || y >= lado || alfa <= 0) return;
    const i = (y * lado + x) * 4;
    for (let c = 0; c < 3; c += 1) pixels[i + c] = pixels[i + c] * (1 - alfa) + cor[c] * alfa;
    pixels[i + 3] = pixels[i + 3] * (1 - alfa) + 255 * alfa;
  };

  const area = (teste, cor) => {
    for (let y = 0; y < lado; y += 1) {
      for (let x = 0; x < lado; x += 1) {
        if (teste(x + 0.5, y + 0.5)) pintar(x, y, cor, 1);
      }
    }
  };

  return { pixels, lado, area };
}

const dentroDoRetangulo = (x0, y0, x1, y1, raio) => (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + raio), x1 - raio);
  const cy = Math.min(Math.max(y, y0 + raio), y1 - raio);
  return (x - cx) ** 2 + (y - cy) ** 2 <= raio ** 2 || raio === 0;
};

const dentroDoCirculo = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

const dentroDoPoligono = (pontos) => (x, y) => {
  let dentro = false;
  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i, i += 1) {
    const [xi, yi] = pontos[i];
    const [xj, yj] = pontos[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
};

/** O carro visto de lado, mais a gota d'água. Tudo em fração do lado. */
function desenhar(lado, { mascaravel = false } = {}) {
  const t = tela(lado);
  const u = (fracao) => fracao * lado;
  const raioDoFundo = mascaravel ? 0 : u(0.22);
  t.area(dentroDoRetangulo(0, 0, lado - 1, lado - 1, raioDoFundo), AZUL);

  // No mascarável tudo encolhe para caber nos 80% centrais que o Android garante.
  const escala = mascaravel ? 0.78 : 1;
  const centro = lado / 2;
  const m = (fracao) => centro + (fracao - 0.5) * lado * escala;

  // Gota d'água.
  t.area(dentroDoCirculo(m(0.5), m(0.25), u(0.075 * escala)), AZUL_CLARO);
  // A base do triângulo cabe dentro do círculo: encostada por fora, ela
  // deixaria duas orelhas nas laterais da gota.
  t.area(dentroDoPoligono([[m(0.5), m(0.125)], [m(0.562), m(0.252)], [m(0.438), m(0.252)]]), AZUL_CLARO);

  // Carroceria e cabine.
  t.area(dentroDoPoligono([
    [m(0.30), m(0.53)], [m(0.395), m(0.375)], [m(0.625), m(0.375)], [m(0.72), m(0.53)],
  ]), BRANCO);
  t.area(dentroDoRetangulo(m(0.14), m(0.52), m(0.86), m(0.70), u(0.055 * escala)), BRANCO);

  // Rodas: branco por fora, azul por dentro — o vão é o próprio fundo.
  for (const cx of [m(0.315), m(0.685)]) {
    t.area(dentroDoCirculo(cx, m(0.715), u(0.098 * escala)), BRANCO);
    t.area(dentroDoCirculo(cx, m(0.715), u(0.045 * escala)), AZUL);
  }
  return t.pixels;
}

/** Reduz por média: quatro amostras viram um pixel, e a borda deixa de serrilhar. */
function reduzir(pixels, ladoGrande) {
  const lado = ladoGrande / 2;
  const saida = Buffer.alloc(lado * lado * 4);
  for (let y = 0; y < lado; y += 1) {
    for (let x = 0; x < lado; x += 1) {
      for (let c = 0; c < 4; c += 1) {
        const soma = [[0, 0], [1, 0], [0, 1], [1, 1]].reduce((total, [dx, dy]) => (
          total + pixels[(((y * 2 + dy) * ladoGrande) + (x * 2 + dx)) * 4 + c]
        ), 0);
        saida[(y * lado + x) * 4 + c] = Math.round(soma / 4);
      }
    }
  }
  return { lado, dados: saida };
}

function gerar(nome, lado, opcoes) {
  const { lado: ladoFinal, dados } = reduzir(desenhar(lado * 2, opcoes), lado * 2);
  const arquivo = path.join(destino, nome);
  fs.writeFileSync(arquivo, png(ladoFinal, ladoFinal, dados));
  console.log(`${nome}: ${ladoFinal}×${ladoFinal}, ${fs.statSync(arquivo).size} bytes`);
}

fs.mkdirSync(destino, { recursive: true });
gerar('icone-192.png', 192);
gerar('icone-512.png', 512);
gerar('icone-mascara-512.png', 512, { mascaravel: true });
