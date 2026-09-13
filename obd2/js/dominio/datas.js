/**
 * Datas, sempre no fuso do aparelho.
 *
 * Uma viagem das 22h de terça pertence a terça, e não à quarta em UTC. Por isso
 * nada aqui usa `toISOString`: ele converte para UTC e, no Brasil, joga três
 * horas de viagem noturna para o dia seguinte — a lista de viagens mostraria
 * duas datas para um mesmo trajeto.
 */

const DOIS = (n) => String(n).padStart(2, '0');

/** O dia de um instante, como `AAAA-MM-DD` local. É a chave de agrupamento. */
export function dia(instante = Date.now()) {
  const d = new Date(instante);
  return `${d.getFullYear()}-${DOIS(d.getMonth() + 1)}-${DOIS(d.getDate())}`;
}

/** `12/09/2026` a partir de `2026-09-12`. */
export function exibirDia(texto) {
  if (!texto) return '—';
  const [ano, mes, data] = String(texto).split('-');
  return `${data}/${mes}/${ano}`;
}

/** `14:35`. */
export function hora(instante) {
  if (!Number.isFinite(instante)) return '—';
  const d = new Date(instante);
  return `${DOIS(d.getHours())}:${DOIS(d.getMinutes())}`;
}

/** `14:35:02` — a precisão que a exportação de uma viagem precisa. */
export function horaCompleta(instante) {
  if (!Number.isFinite(instante)) return '—';
  const d = new Date(instante);
  return `${DOIS(d.getHours())}:${DOIS(d.getMinutes())}:${DOIS(d.getSeconds())}`;
}

/**
 * Uma duração em milissegundos, legível.
 *
 * `1h 04min` e `3min 20s`: a unidade menor só aparece quando ainda importa.
 * Segundos numa viagem de uma hora são ruído.
 */
export function duracao(milissegundos) {
  if (!Number.isFinite(milissegundos) || milissegundos < 0) return '—';
  const total = Math.round(milissegundos / 1000);
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;
  if (horas > 0) return `${horas}h ${DOIS(minutos)}min`;
  if (minutos > 0) return `${minutos}min ${DOIS(segundos)}s`;
  return `${segundos}s`;
}
