/**
 * Gera os ícones do aplicativo.
 *
 *     node ferramentas/gerar_icones.mjs
 *
 * Os ícones são desenhados por código, e não exportados de um editor, por um
 * motivo prático: o repositório não tem etapa de compilação nem dependências, e
 * um PNG binário que ninguém sabe regerar é um arquivo órfão — quando a cor
 * mudar, não haverá o que editar. Aqui a cor é uma constante.
 *
 * O desenho é um mostrador: o arco da escala, o ponteiro e o eixo. Feito com o
 * dobro da resolução e reduzido por média (4 amostras por pixel), porque sem
 * isso o arco fica serrilhado em 192 px — que é o tamanho que o Android mostra
 * na tela inicial.
 *
 * O ícone mascarável desenha o mesmo mostrador menor e sem canto arredondado: o
 * Android recorta o formato que quiser (círculo, quadrado, gota), e o que
 * estiver fora dos 80% centrais é perdido.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const FUNDO = [18, 58, 94];
const CLARO = [232, 238, 245];
const VERDE = [63, 211, 154];

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


/* -------------------------------------------------------------- desenho */

const dentroDoRetangulo = (x0, y0, x1, y1, raio) => (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + raio), x1 - raio);
  const cy = Math.min(Math.max(y, y0 + raio), y1 - raio);
  return (x - cx) ** 2 + (y - cy) ** 2 <= raio ** 2 || raio === 0;
};

const dentroDoCirculo = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/**
 * O arco da escala.
 *
 * Um anel cortado por ângulo. O ângulo cresce no sentido horário porque em
 * imagem o eixo vertical aponta para baixo — desenhar com a convenção da
 * matemática deixaria o mostrador de cabeça para baixo.
 */
const dentroDoArco = (cx, cy, raioInterno, raioExterno, deGrau, ateGrau) => (x, y) => {
  const dx = x - cx;
  const dy = y - cy;
  const distancia = Math.hypot(dx, dy);
  if (distancia < raioInterno || distancia > raioExterno) return false;
  let angulo = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angulo < 0) angulo += 360;
  return angulo >= deGrau && angulo <= ateGrau;
};

/** O ponteiro: um segmento grosso, com as pontas arredondadas. */
const dentroDoSegmento = (x1, y1, x2, y2, espessura) => (x, y) => {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const comprimento = vx * vx + vy * vy;
  const t = comprimento === 0 ? 0 : Math.min(1, Math.max(0, ((x - x1) * vx + (y - y1) * vy) / comprimento));
  return Math.hypot(x - (x1 + t * vx), y - (y1 + t * vy)) <= espessura / 2;
};

function desenhar(lado, { mascaravel = false } = {}) {
  const t = tela(lado);
  const u = (fracao) => fracao * lado;
  t.area(dentroDoRetangulo(0, 0, lado - 1, lado - 1, mascaravel ? 0 : u(0.22)), FUNDO);

  // No mascarável tudo encolhe para caber nos 80% centrais que o Android garante.
  const escala = mascaravel ? 0.78 : 1;
  const centro = lado / 2;
  const m = (fracao) => centro + (fracao - 0.5) * lado * escala;
  const eixo = { x: m(0.5), y: m(0.66) };

  // A escala: meia-volta, de 180° a 360°, que em imagem é a metade de cima.
  t.area(dentroDoArco(eixo.x, eixo.y, u(0.28 * escala), u(0.37 * escala), 180, 360), CLARO);

  // O ponteiro apontando para as duas horas — a posição de um motor em carga,
  // que é quando alguém olha para um conta-giros.
  const angulo = (-52 * Math.PI) / 180;
  t.area(dentroDoSegmento(
    eixo.x, eixo.y,
    eixo.x + Math.cos(angulo) * u(0.30 * escala),
    eixo.y + Math.sin(angulo) * u(0.30 * escala),
    u(0.055 * escala),
  ), VERDE);

  // O eixo, por cima: sem ele o ponteiro parece solto no meio do desenho.
  t.area(dentroDoCirculo(eixo.x, eixo.y, u(0.075 * escala)), CLARO);
  t.area(dentroDoCirculo(eixo.x, eixo.y, u(0.032 * escala)), FUNDO);

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
