/**
 * Números para a tela.
 *
 * Duas regras valem em tudo aqui:
 *
 * · **Travessão em vez de zero.** Um valor que o carro não respondeu não é
 *   zero. Mostrar `0 °C` para um sensor ausente é a diferença entre «não sei» e
 *   «está congelando», e quem lê acredita no número.
 * · **Casas decimais pela grandeza, não pela precisão da conta.** A rotação vem
 *   com um quarto de RPM de resolução e ninguém dirige por isso: `2.418 rpm`
 *   inteiro. A tensão da bateria, ao contrário, se decide na primeira casa —
 *   13,9 e 14,2 V são situações diferentes.
 */

import { definicaoDe } from '../obd/pids.js';

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export function numero(valor, casas = 1) {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return '—';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(Number(valor));
}

export function inteiro(valor) {
  if (!Number.isFinite(Number(valor))) return '—';
  return INTEIRO.format(Math.round(Number(valor)));
}

/** O valor de um PID, com as casas que aquele PID merece. */
export function valorDePid(pid, valor) {
  const definicao = definicaoDe(pid);
  if (!definicao) return numero(valor, 1);
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return definicao.casas === 0 ? inteiro(valor) : numero(valor, definicao.casas);
}

export function unidadeDePid(pid) {
  return definicaoDe(pid)?.unidade ?? '';
}

/** Distância: `0,8 km` perto, `124 km` longe. Meia casa não ajuda a ninguém. */
export function distancia(km) {
  if (!Number.isFinite(km)) return '—';
  if (km < 10) return `${numero(km, 1)} km`;
  return `${inteiro(km)} km`;
}

export function litros(valor) {
  if (!Number.isFinite(valor)) return '—';
  return `${numero(valor, valor < 10 ? 2 : 1)} L`;
}

/**
 * Consumo em km/L.
 *
 * Sem valor não é `0,0 km/L` — é travessão. Consumo zero significaria um carro
 * que anda sem combustível, e o caso real é sempre «ainda não dá para dizer».
 */
export function consumo(kmPorLitro) {
  if (!Number.isFinite(kmPorLitro) || kmPorLitro <= 0) return '—';
  return `${numero(kmPorLitro, 1)} km/L`;
}

/** Texto curto de quanto tempo faz. A lista de viagens vive disso. */
export function desdeQuando(instante) {
  if (!Number.isFinite(instante)) return '';
  const minutos = Math.round((Date.now() - instante) / 60000);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'ontem' : `há ${dias} dias`;
}
