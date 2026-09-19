/**
 * O velocímetro: a escala do mostrador, a velocidade do GPS e a média.
 *
 * Três contas que erram em silêncio. Uma escala mal dividida põe o «120» num
 * lugar que não é o dele; uma velocidade de GPS mal tratada mostra 3 km/h com o
 * carro parado, ou congela o último número dentro do túnel e continua parecendo
 * atual; e uma média feita como média das leituras devolve um consumo que não
 * aconteceu em momento nenhum da viagem.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { passoDaEscala, tracosDaEscala } from '../js/ui/medidor.js';
import { velocidadeDaCorrecao, distanciaEntre, PRECISAO_RUIM, IDADE_MAXIMA } from '../js/gps.js';
import { criarMediaDeConsumo } from '../js/dominio/viagem.js';

/* ------------------------------------------------------------------ escala */

test('a escala cabe em no máximo sete números', () => {
  for (const [min, max] of [[0, 240], [0, 8000], [-40, 130], [0, 100], [-1, 2]]) {
    const numerados = tracosDaEscala(min, max).filter((t) => t.numerado);
    assert.ok(numerados.length >= 3 && numerados.length <= 8,
      `de ${min} a ${max} gerou ${numerados.length} números na escala`);
  }
});

test('o velocímetro é numerado de 40 em 40', () => {
  assert.equal(passoDaEscala(0, 240), 40);
  const numerados = tracosDaEscala(0, 240).filter((t) => t.numerado).map((t) => t.valor);
  assert.deepEqual(numerados, [0, 40, 80, 120, 160, 200, 240]);
});

test('o conta-giros é numerado de 2000 em 2000, e a escala mostra 0 a 8', () => {
  // Com o divisor de mil, cada traço numerado vira um dígito só — que é como um
  // conta-giros de verdade se lê.
  assert.equal(passoDaEscala(0, 8000), 2000);
  const numerados = tracosDaEscala(0, 8000).filter((t) => t.numerado).map((t) => t.valor / 1000);
  assert.deepEqual(numerados, [0, 2, 4, 6, 8]);
});

test('entre dois números numerados há sempre um traço miúdo', () => {
  const traços = tracosDaEscala(0, 240);
  assert.equal(traços.length, 13, 'sete numerados e seis miúdos');
  assert.equal(traços.filter((t) => !t.numerado).length, 6);
});

/* --------------------------------------------------------------------- GPS */

/** Uma correção de GPS, como o navegador entrega. */
const correcao = ({ speed = null, lat = -16.6869, lon = -49.2648, accuracy = 8, t = 1_700_000_000_000 }) => ({
  coords: { speed, latitude: lat, longitude: lon, accuracy },
  timestamp: t,
});

test('a velocidade informada pelo aparelho vem em metros por segundo', () => {
  // 25 m/s são 90 km/h. Esquecer o fator 3,6 mostraria 25 km/h numa rodovia.
  assert.equal(velocidadeDaCorrecao(correcao({ speed: 25 })), 90);
});

test('parado, o ruído do GPS não vira velocidade', () => {
  // O erro de posição oscila e o aparelho relata 0,3 m/s — que viraria 1 km/h
  // no mostrador, com o carro parado no semáforo.
  assert.equal(velocidadeDaCorrecao(correcao({ speed: 0.3 })), 0);
  assert.equal(velocidadeDaCorrecao(correcao({ speed: 0 })), 0);
});

test('sem velocidade informada, ela sai da distância entre duas correções', () => {
  // Nem todo aparelho preenche `coords.speed`. Cem metros em 5 s são 72 km/h.
  const antes = correcao({ speed: null, lat: -16.6869, lon: -49.2648, t: 1_700_000_000_000 });
  const depois = correcao({ speed: null, lat: -16.68780, lon: -49.2648, t: 1_700_000_005_000 });

  const velocidade = velocidadeDaCorrecao(depois, antes);
  assert.ok(velocidade > 60 && velocidade < 85, `fora do esperado: ${velocidade}`);
});

test('sem correção anterior e sem velocidade informada, não há o que dizer', () => {
  assert.equal(velocidadeDaCorrecao(correcao({ speed: null })), null);
});

test('correções separadas demais não servem para calcular velocidade', () => {
  // Em dez segundos o carro faz uma curva inteira, e a reta entre os dois
  // pontos não é o caminho percorrido: a conta daria menos que a real.
  const antes = correcao({ speed: null, t: 1_700_000_000_000 });
  const depois = correcao({ speed: null, lat: -16.6879, t: 1_700_000_010_000 });
  assert.equal(velocidadeDaCorrecao(depois, antes), null);
});

test('distância entre dois pontos, em metros', () => {
  // Um centésimo de grau de latitude é perto de 1,11 km, em qualquer longitude.
  const metros = distanciaEntre(
    { latitude: -16.68, longitude: -49.26 },
    { latitude: -16.69, longitude: -49.26 },
  );
  assert.ok(Math.abs(metros - 1110) < 15, `esperado ~1110 m, veio ${Math.round(metros)}`);
});

test('os limiares de confiança existem e são razoáveis', () => {
  // Acima de 35 m de erro, o número não serve para velocidade; acima de 5 s sem
  // correção, ele é passado.
  assert.ok(PRECISAO_RUIM >= 20 && PRECISAO_RUIM <= 60);
  assert.ok(IDADE_MAXIMA >= 3000 && IDADE_MAXIMA <= 10_000);
});

/* ------------------------------------------------------------------- média */

test('a média é quilômetros sobre litros, não a média dos km/L', () => {
  // Meia hora a 100 km/h gastando 10 L/h, e meia hora a 20 km/h gastando 2 L/h.
  // Os trechos fazem 10 km/L cada um, e a média também é 10 — o que este teste
  // trava é a acumulação: 60 km e 6 L.
  const media = criarMediaDeConsumo();
  const inicio = 1_700_000_000_000;

  for (let s = 0; s <= 1800; s += 1) media.adicionar({ '0D': 100, '5E': 10 }, inicio + s * 1000);
  for (let s = 1801; s <= 3600; s += 1) media.adicionar({ '0D': 20, '5E': 2 }, inicio + s * 1000);

  const resultado = media.resultado();
  assert.ok(Math.abs(resultado.distancia - 60) < 0.1, `distância: ${resultado.distancia}`);
  assert.ok(Math.abs(resultado.litros - 6) < 0.05, `litros: ${resultado.litros}`);
  assert.ok(Math.abs(resultado.kmPorLitro - 10) < 0.1, `média: ${resultado.kmPorLitro}`);
});

test('a média pondera pelo tempo, e não pelas leituras', () => {
  // Um minuto subindo a serra a 6 km/L e uma hora na reta a 12 km/L: a média
  // tem de ficar quase colada nos 12, e não perto de 9.
  const media = criarMediaDeConsumo();
  const inicio = 1_700_000_000_000;

  for (let s = 0; s <= 60; s += 1) media.adicionar({ '0D': 30, '5E': 5 }, inicio + s * 1000);
  for (let s = 61; s <= 3660; s += 1) media.adicionar({ '0D': 120, '5E': 10 }, inicio + s * 1000);

  const { kmPorLitro } = media.resultado();
  assert.ok(kmPorLitro > 11.7 && kmPorLitro < 12, `esperado quase 12, veio ${kmPorLitro}`);
});

test('nos primeiros metros a média ainda não existe', () => {
  // Distância minúscula dividida por consumo minúsculo dá um número que salta
  // de 3 para 300 entre duas leituras. Nulo é a resposta honesta.
  const media = criarMediaDeConsumo();
  const inicio = 1_700_000_000_000;
  media.adicionar({ '0D': 10, '5E': 1 }, inicio);
  media.adicionar({ '0D': 10, '5E': 1 }, inicio + 1000);

  assert.equal(media.resultado().kmPorLitro, null);
});

test('um buraco na leitura não infla a média', () => {
  // Mesma regra do resumo de viagem: acima do limite, conta-se o limite.
  const media = criarMediaDeConsumo();
  const inicio = 1_700_000_000_000;
  media.adicionar({ '0D': 100, '5E': 10 }, inicio);
  media.adicionar({ '0D': 100, '5E': 10 }, inicio + 60_000);

  const { distancia } = media.resultado();
  assert.ok(distancia < 0.15, `contou a pausa inteira como estrada: ${distancia} km`);
});

test('zerar recomeça do zero', () => {
  const media = criarMediaDeConsumo();
  const inicio = 1_700_000_000_000;
  for (let s = 0; s <= 600; s += 1) media.adicionar({ '0D': 60, '5E': 6 }, inicio + s * 1000);
  assert.ok(media.resultado().distancia > 9);

  media.zerar();
  assert.equal(media.resultado().distancia, 0);
  assert.equal(media.resultado().kmPorLitro, null);
});

/* ------------------------------------------------------------- a posição */

/**
 * Um GPS de mentira, para dirigir o vigia sem sair do teste.
 *
 * Guardar o callback é o que permite entregar correções na ordem e no instante
 * que o teste quiser — inclusive duas no mesmo ponto, que é o carro parado.
 */
function gpsDeMentira() {
  let aoCorrigir = null;
  // `globalThis.navigator` no Node é só de leitura; `defineProperty` é o jeito
  // de pôr um no lugar sem que o teste esbarre no getter.
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: {
      geolocation: {
        watchPosition(ok) { aoCorrigir = ok; return 1; },
        clearWatch() {},
      },
    },
  });
  return {
    corrigir(latitude, longitude, { accuracy = 8, timestamp = Date.now() } = {}) {
      aoCorrigir?.({ coords: { latitude, longitude, accuracy, speed: null }, timestamp });
    },
  };
}

test('a posição é gravada mesmo quando a velocidade não dá para calcular', async () => {
  /*
   * O carro parado num semáforo entrega duas correções no mesmo ponto: a
   * velocidade sai zero ou nem sai, e antes disso a correção inteira era
   * descartada. O resultado era uma viagem cujas paradas não tinham lugar
   * nenhum gravado — justamente o trecho sobre o qual se pergunta «onde era?».
   */
  const { criarVelocimetroGPS } = await import('../js/gps.js');
  const falso = gpsDeMentira();
  const velocimetro = criarVelocimetroGPS({});
  velocimetro.comecar();

  // A primeira correção nunca tem velocidade: não há anterior para comparar.
  falso.corrigir(-16.68012, -49.25441);
  assert.equal(velocimetro.leitura.velocidade, null, 'a primeira correção não tem com que comparar');
  assert.equal(velocimetro.leitura.latitude, -16.68012);
  assert.equal(velocimetro.leitura.longitude, -49.25441);
  assert.equal(velocimetro.leitura.posicaoConfiavel, true,
    'sem velocidade, a posição ainda é boa — e é o que se quer gravar');
  assert.equal(velocimetro.leitura.confiavel, false,
    'a velocidade não pode ser dada como confiável quando não existe');
});

test('posição imprecisa não é dada como confiável', async () => {
  const { criarVelocimetroGPS } = await import('../js/gps.js');
  const falso = gpsDeMentira();
  const velocimetro = criarVelocimetroGPS({});
  velocimetro.comecar();

  falso.corrigir(-16.68012, -49.25441, { accuracy: PRECISAO_RUIM + 1 });
  assert.equal(velocimetro.leitura.posicaoConfiavel, false,
    'um erro de posição maior que o tolerado põe o carro noutra rua');
});

test('parar o GPS esquece onde se estava', async () => {
  // A posição é o dado mais sensível que o aplicativo guarda em memória.
  // Deixá-la na leitura depois de desligado é guardá-la sem motivo.
  const { criarVelocimetroGPS } = await import('../js/gps.js');
  const falso = gpsDeMentira();
  const velocimetro = criarVelocimetroGPS({});
  velocimetro.comecar();
  falso.corrigir(-16.68012, -49.25441);

  velocimetro.parar();
  assert.equal(velocimetro.leitura.latitude, null);
  assert.equal(velocimetro.leitura.longitude, null);
  assert.equal(velocimetro.leitura.posicaoConfiavel, false);
});
