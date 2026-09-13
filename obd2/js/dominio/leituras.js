/**
 * Consumo: o número que ninguém mede e todo mundo quer.
 *
 * Poucos carros no Brasil respondem o PID 5E (vazão de combustível). O resto
 * mede quanto **ar** entra, e o resto se calcula: motor de ciclo Otto queima
 * uma massa de combustível proporcional à massa de ar, na proporção
 * estequiométrica do combustível. Daí sai litro por hora, e com a velocidade,
 * quilômetro por litro.
 *
 * **A conta é boa, não é exata.** Ela assume mistura estequiométrica, que é
 * verdade em velocidade constante e mentira em aceleração forte (o motor
 * enriquece) e em desaceleração (corta a injeção). Num trecho de estrada dá uma
 * diferença de poucos por cento contra o consumo real; no trânsito para-e-anda,
 * mais. O aplicativo mostra o resultado como estimativa, e nomeia a origem: uma
 * leitura pelo PID 5E e uma conta pelo fluxo de ar não valem a mesma coisa.
 *
 * O carro flex é o motivo de o combustível ser escolhido nos ajustes: gasolina
 * e etanol têm proporções bem diferentes (14,7 contra 9,0), e usar a do errado
 * erra o consumo em mais de 30% — para um lado plausível, que é o pior tipo de
 * erro.
 */

/**
 * Proporção ar/combustível e densidade, por combustível.
 *
 * A densidade é em gramas por litro a 20 °C, e é ela que transforma massa
 * queimada em litro no bico da bomba. Os valores são os da gasolina comum
 * brasileira (com etanol anidro na mistura) e do etanol hidratado de posto.
 */
export const COMBUSTIVEIS = {
  gasolina: { nome: 'Gasolina', proporcao: 14.7, densidade: 745 },
  etanol: { nome: 'Etanol', proporcao: 9.0, densidade: 809 },
  diesel: { nome: 'Diesel', proporcao: 14.5, densidade: 832 },
  gnv: { nome: 'GNV', proporcao: 17.2, densidade: 1000, unidade: 'm³' },
};

export const COMBUSTIVEL_PADRAO = 'gasolina';

/**
 * Litros por hora a partir do fluxo de ar, em gramas por segundo.
 *
 * ar (g/s) ÷ proporção = combustível (g/s); × 3600 = g/h; ÷ densidade = L/h.
 */
export function litrosPorHoraDoFluxo(fluxoDeAr, combustivel = COMBUSTIVEL_PADRAO) {
  const tipo = COMBUSTIVEIS[combustivel] ?? COMBUSTIVEIS[COMBUSTIVEL_PADRAO];
  if (!Number.isFinite(fluxoDeAr) || fluxoDeAr < 0) return null;
  return (fluxoDeAr / tipo.proporcao) * 3600 / tipo.densidade;
}

/**
 * O fluxo de ar deduzido da pressão do coletor, para carro sem sensor MAF.
 *
 * É a conta de «densidade-velocidade»: o motor é uma bomba de volume conhecido,
 * a pressão e a temperatura do coletor dão a densidade do ar, e a rotação diz
 * quantas vezes por minuto ele aspira. O motor de quatro tempos admite a cada
 * duas voltas — é de onde vem o 120 no lugar de 60.
 *
 * A eficiência volumétrica varia com a rotação e com a carga; aqui é uma
 * constante, e é a principal fonte de erro deste caminho. Por isso ele só entra
 * quando não há MAF nem PID 5E, e a tela diz que o número é estimado.
 */
export function fluxoDeArEstimado({ rotacao, coletor, arAdmitido, cilindrada, eficiencia = 0.8 }) {
  if (![rotacao, coletor, cilindrada].every(Number.isFinite)) return null;
  if (rotacao <= 0 || cilindrada <= 0) return null;
  const kelvin = (Number.isFinite(arAdmitido) ? arAdmitido : 30) + 273.15;
  const volumePorSegundo = (rotacao / 120) * cilindrada * eficiencia; // litros de ar por segundo
  const densidade = (coletor * 1000) / (287.05 * kelvin);             // kg/m³, que é g/L
  return volumePorSegundo * densidade;
}

/**
 * O consumo instantâneo, pela melhor fonte disponível.
 *
 * A ordem é a da confiança: o que o carro mede, depois o que o carro mede
 * indiretamente, depois o que o aplicativo deduz. `origem` acompanha o número
 * para que a tela nunca apresente uma dedução como medição.
 */
export function consumoInstantaneo(valores, { combustivel = COMBUSTIVEL_PADRAO, cilindrada = null } = {}) {
  const taxa = valores['5E'];
  if (Number.isFinite(taxa)) return { litrosPorHora: taxa, origem: 'medido' };

  const fluxo = valores['10'];
  if (Number.isFinite(fluxo)) {
    return { litrosPorHora: litrosPorHoraDoFluxo(fluxo, combustivel), origem: 'fluxo de ar' };
  }

  if (cilindrada) {
    const estimado = fluxoDeArEstimado({
      rotacao: valores['0C'],
      coletor: valores['0B'],
      arAdmitido: valores['0F'],
      cilindrada,
    });
    if (estimado !== null) {
      return { litrosPorHora: litrosPorHoraDoFluxo(estimado, combustivel), origem: 'estimado' };
    }
  }

  return { litrosPorHora: null, origem: null };
}

/**
 * Quilômetros por litro agora.
 *
 * Parado com o motor ligado, o consumo por quilômetro é infinito — e mostrar
 * «∞ km/L» ou um número gigante é pior que mostrar nada. Devolve `null`, e a
 * tela mostra o gasto em litros por hora, que é o número que faz sentido
 * parado.
 */
export function kmPorLitro(velocidade, litrosPorHora) {
  if (!Number.isFinite(velocidade) || !Number.isFinite(litrosPorHora)) return null;
  if (velocidade < 3 || litrosPorHora < 0.05) return null;
  return velocidade / litrosPorHora;
}

/**
 * Sinais de que algo não está bem, lidos dos valores do momento.
 *
 * Nenhum deles é diagnóstico — são as três coisas que dão para afirmar olhando
 * só um instante, e que um painel de carro esconde: a temperatura já subiu
 * demais, o alternador não está carregando, o motor está girando alto parado.
 */
export function alertas(valores, { luzAcesa = false } = {}) {
  const lista = [];
  const temperatura = valores['05'];
  const tensao = valores['42'];
  const rotacao = valores['0C'];
  const velocidade = valores['0D'];

  if (luzAcesa) {
    lista.push({ nivel: 'perigo', texto: 'A luz de anomalia está acesa. Veja a tela de falhas.' });
  }
  if (Number.isFinite(temperatura) && temperatura >= 110) {
    lista.push({ nivel: 'perigo', texto: `Motor a ${Math.round(temperatura)} °C — pare e deixe esfriar.` });
  } else if (Number.isFinite(temperatura) && temperatura >= 103) {
    lista.push({ nivel: 'atencao', texto: `Motor a ${Math.round(temperatura)} °C, acima do normal.` });
  }
  if (Number.isFinite(tensao) && rotacao > 500 && tensao < 13) {
    lista.push({ nivel: 'atencao', texto: `Tensão em ${tensao.toFixed(1)} V com o motor ligado — o alternador pode não estar carregando.` });
  }
  if (Number.isFinite(rotacao) && Number.isFinite(velocidade) && velocidade < 2 && rotacao > 1300) {
    lista.push({ nivel: 'atencao', texto: 'Marcha lenta alta.' });
  }
  return lista;
}
