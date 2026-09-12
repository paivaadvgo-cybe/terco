/**
 * Datas, sempre no fuso do aparelho.
 *
 * O dia do lava-rápido é o dia de quem está lá: uma lavagem das 22h de terça
 * pertence a terça, e não à quarta em UTC. Por isso nada aqui usa `toISOString`
 * — ele converte para UTC e, no Brasil, joga três horas de movimento noturno
 * para o dia seguinte, fazendo o fechamento não bater com a gaveta.
 */

const DOIS = (n) => String(n).padStart(2, '0');

/** O dia de um instante, como `AAAA-MM-DD` local. É a chave de agrupamento. */
export function dia(instante = Date.now()) {
  const d = new Date(instante);
  return `${d.getFullYear()}-${DOIS(d.getMonth() + 1)}-${DOIS(d.getDate())}`;
}

/** O primeiro instante de um dia `AAAA-MM-DD`. */
export function inicioDoDia(texto) {
  const [ano, mes, data] = String(texto).split('-').map(Number);
  return new Date(ano, mes - 1, data, 0, 0, 0, 0).getTime();
}

/** O primeiro instante do dia seguinte — o fim exclusivo de um intervalo. */
export function fimDoDia(texto) {
  const [ano, mes, data] = String(texto).split('-').map(Number);
  return new Date(ano, mes - 1, data + 1, 0, 0, 0, 0).getTime();
}

/** `12/09/2026` a partir de `2026-09-12`. */
export function exibirDia(texto) {
  if (!texto) return '—';
  const [ano, mes, data] = String(texto).split('-');
  return `${data}/${mes}/${ano}`;
}

/** `12/09` — o que cabe no cartão do histórico. */
export function exibirDiaCurto(texto) {
  if (!texto) return '—';
  const [, mes, data] = String(texto).split('-');
  return `${data}/${mes}`;
}

/** `14:35`. */
export function hora(instante) {
  if (!Number.isFinite(instante)) return '—';
  const d = new Date(instante);
  return `${DOIS(d.getHours())}:${DOIS(d.getMinutes())}`;
}

function deslocar(instante, dias) {
  const d = new Date(instante);
  d.setDate(d.getDate() + dias);
  return d.getTime();
}

/**
 * Os intervalos dos filtros, em instantes `[de, ate)`.
 *
 * O fim é exclusivo: usar `<=` no último milissegundo do dia deixa de fora a
 * lavagem registrada exatamente na virada, e esse é o tipo de erro que só
 * aparece no fechamento, quando já não dá para conferir.
 */
export function intervalo(nome, agora = Date.now(), personalizado = {}) {
  const hojeTexto = dia(agora);
  switch (nome) {
    case 'hoje':
      return { de: inicioDoDia(hojeTexto), ate: fimDoDia(hojeTexto), rotulo: 'Hoje' };
    case 'ontem': {
      const ontem = dia(deslocar(agora, -1));
      return { de: inicioDoDia(ontem), ate: fimDoDia(ontem), rotulo: 'Ontem' };
    }
    case '7dias': {
      const inicio = dia(deslocar(agora, -6));
      return { de: inicioDoDia(inicio), ate: fimDoDia(hojeTexto), rotulo: 'Últimos 7 dias' };
    }
    case 'mes': {
      const d = new Date(agora);
      const primeiro = `${d.getFullYear()}-${DOIS(d.getMonth() + 1)}-01`;
      return { de: inicioDoDia(primeiro), ate: fimDoDia(hojeTexto), rotulo: 'Este mês' };
    }
    case 'personalizado': {
      const de = personalizado.de || hojeTexto;
      const ate = personalizado.ate || de;
      return { de: inicioDoDia(de), ate: fimDoDia(ate), rotulo: `${exibirDia(de)} a ${exibirDia(ate)}` };
    }
    default:
      return { de: inicioDoDia(hojeTexto), ate: fimDoDia(hojeTexto), rotulo: 'Hoje' };
  }
}

/** Os dias de um intervalo, do mais antigo ao mais recente. */
export function diasDoIntervalo({ de, ate }) {
  const dias = [];
  for (let instante = de; instante < ate; instante = deslocar(instante, 1)) dias.push(dia(instante));
  return dias;
}
