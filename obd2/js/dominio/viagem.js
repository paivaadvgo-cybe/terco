/**
 * A viagem: o que aconteceu entre ligar e desligar a gravação.
 *
 * As amostras são pontos no tempo — velocidade, rotação, temperatura a cada
 * segundo. Tudo o que interessa depois (quanto rodou, quanto gastou, quanto
 * ficou parado) é integral, e integral de amostra tem duas armadilhas que este
 * arquivo existe para evitar.
 *
 * **A primeira é o buraco.** O celular bloqueia a tela, o Bluetooth cai por
 * trinta segundos, o aplicativo fica em segundo plano. Duas amostras vizinhas
 * ficam separadas por meio minuto, e multiplicar 80 km/h por 30 segundos
 * inventa 660 metros que o carro pode não ter andado. Por isso o intervalo
 * entre amostras é limitado: acima do limite, conta-se o limite e o resto vira
 * buraco declarado, não distância inventada.
 *
 * **A segunda é a média.** Velocidade média não é a média das velocidades: é
 * distância dividida por tempo. Num carro que passou metade da viagem parado no
 * semáforo, a diferença entre as duas contas é enorme, e a errada é sempre a
 * que parece mais razoável.
 */

import { consumoInstantaneo, kmPorLitro } from './leituras.js';

/**
 * O intervalo máximo que conta como continuidade, em milissegundos.
 *
 * Cinco segundos: mais que qualquer atraso normal de adaptador lento, menos que
 * qualquer pausa de verdade.
 */
export const INTERVALO_MAXIMO = 5000;

const numero = (valor) => (Number.isFinite(valor) ? valor : null);

/** Uma amostra, do jeito que é gravada: instante e os valores daquele instante. */
export function criarAmostra(instante, valores) {
  return { t: instante, v: { ...valores } };
}

/**
 * O resumo de uma viagem.
 *
 * Devolve sempre a mesma forma, mesmo sem amostra nenhuma — telas que precisam
 * tratar `null` acabam mostrando «—» em lugares diferentes a cada vez.
 */
export function resumir(amostras, opcoes = {}) {
  const pontos = [...(amostras ?? [])].sort((a, b) => a.t - b.t);

  const resumo = {
    amostras: pontos.length,
    inicio: pontos[0]?.t ?? null,
    fim: pontos[pontos.length - 1]?.t ?? null,
    duracao: 0,
    tempoAndando: 0,
    tempoParado: 0,
    buracos: 0,
    distancia: 0,
    litros: 0,
    velocidadeMedia: null,
    velocidadeMaxima: null,
    rotacaoMaxima: null,
    temperaturaMaxima: null,
    consumoMedio: null,
    origemDoConsumo: null,
    temConsumo: false,
  };

  if (pontos.length === 0) return resumo;

  for (const ponto of pontos) {
    const velocidade = numero(ponto.v['0D']);
    const rotacao = numero(ponto.v['0C']);
    const temperatura = numero(ponto.v['05']);
    if (velocidade !== null) resumo.velocidadeMaxima = Math.max(resumo.velocidadeMaxima ?? 0, velocidade);
    if (rotacao !== null) resumo.rotacaoMaxima = Math.max(resumo.rotacaoMaxima ?? 0, rotacao);
    if (temperatura !== null) {
      resumo.temperaturaMaxima = Math.max(resumo.temperaturaMaxima ?? -273, temperatura);
    }
  }

  for (let i = 1; i < pontos.length; i += 1) {
    const anterior = pontos[i - 1];
    const atual = pontos[i];
    const bruto = atual.t - anterior.t;
    if (bruto <= 0) continue;

    const intervalo = Math.min(bruto, INTERVALO_MAXIMO);
    if (bruto > INTERVALO_MAXIMO) resumo.buracos += bruto - INTERVALO_MAXIMO;
    const horas = intervalo / 3_600_000;
    resumo.duracao += intervalo;

    const v1 = numero(anterior.v['0D']);
    const v2 = numero(atual.v['0D']);
    if (v1 !== null && v2 !== null) {
      const media = (v1 + v2) / 2;
      resumo.distancia += media * horas;
      if (media < 2) resumo.tempoParado += intervalo;
      else resumo.tempoAndando += intervalo;
    }

    const c1 = consumoInstantaneo(anterior.v, opcoes).litrosPorHora;
    const c2 = consumoInstantaneo(atual.v, opcoes);
    if (Number.isFinite(c1) && Number.isFinite(c2.litrosPorHora)) {
      resumo.litros += ((c1 + c2.litrosPorHora) / 2) * horas;
      resumo.temConsumo = true;
      resumo.origemDoConsumo = c2.origem;
    }
  }

  if (resumo.duracao > 0 && resumo.distancia > 0) {
    resumo.velocidadeMedia = resumo.distancia / (resumo.duracao / 3_600_000);
  }
  if (resumo.temConsumo && resumo.litros > 0.01 && resumo.distancia > 0.1) {
    resumo.consumoMedio = resumo.distancia / resumo.litros;
  }

  return resumo;
}

/**
 * O consumo do momento, para o painel.
 *
 * Separado de `resumir` porque responde outra pergunta: ali é «como foi a
 * viagem», aqui é «como está o pé agora». Os dois números discordam o tempo
 * todo, e é assim que tem de ser.
 */
export function instantaneo(valores, opcoes = {}) {
  const { litrosPorHora, origem } = consumoInstantaneo(valores, opcoes);
  return {
    litrosPorHora,
    origem,
    kmPorLitro: kmPorLitro(valores['0D'], litrosPorHora),
    parado: Number.isFinite(valores['0D']) && valores['0D'] < 3,
  };
}

/**
 * Uma viagem nova, ainda sem amostra.
 *
 * O identificador tem um sufixo sorteado além do instante, e não é enfeite:
 * `Date.now()` tem resolução de milissegundo, e duas viagens criadas no mesmo
 * milissegundo nasciam com o mesmo identificador. Como as amostras e os trechos
 * de vídeo são ligados à viagem por esse identificador, a segunda viagem
 * herdava o vídeo e os pontos da primeira — sem erro nenhum, só dados no lugar
 * errado. Apareceu num teste; num aparelho apareceria como «o vídeo da viagem
 * de ontem está na viagem de hoje».
 */
export function criarViagem(instante = Date.now(), { veiculo = null } = {}) {
  const sufixo = Math.random().toString(36).slice(2, 6);
  return {
    id: `v${instante.toString(36)}${sufixo}`,
    inicio: instante,
    fim: null,
    veiculo,
    amostras: 0,
    resumo: null,
  };
}

/** A série de um PID ao longo da viagem, para o gráfico. */
export function serieDe(amostras, pid) {
  return (amostras ?? [])
    .filter((a) => Number.isFinite(a.v[pid]))
    .map((a) => ({ t: a.t, valor: a.v[pid] }));
}
