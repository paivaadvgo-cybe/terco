/**
 * As coleções do banco local, e o que cada uma guarda.
 *
 * Uma declaração só, lida pelos dois drivers (IndexedDB e memória) e pelos
 * testes. Enquanto foi implícita — cada arquivo criando a sua `objectStore` —
 * acrescentar uma coleção exigia lembrar de três lugares, e esquecer um deles
 * só aparecia no aparelho de quem já tinha o aplicativo instalado, porque a
 * versão do banco não subia e a coleção nova não nascia.
 *
 * **Por que as amostras ficam separadas das viagens.** Uma viagem de meia hora
 * gravada a cada segundo tem quase dois mil pontos. Guardá-los dentro do
 * registro da viagem faria a lista de viagens carregar todos eles só para
 * mostrar «12/09, 23 km» — e a tela que abre mais vezes seria a mais pesada.
 * Separadas, a lista lê só os resumos, e os pontos só são lidos por quem abrir
 * o gráfico de uma viagem.
 */

export const NOME = 'obd2-painel';
export const VERSAO = 1;

export const COLECOES = {
  /** Um registro só, de identificador `app`: tema, combustível, PIDs do painel. */
  configuracao: { chave: 'id', indices: [] },
  /** Uma por gravação: início, fim, resumo já calculado. */
  viagens: { chave: 'id', indices: ['dia'] },
  /** Um bloco de amostras por registro, referente a uma viagem. */
  amostras: { chave: 'id', indices: ['viagem'] },
  /** O que se descobriu do carro: chassi, PIDs suportados, versão do adaptador. */
  veiculos: { chave: 'id', indices: [] },
};

export const NOMES = Object.keys(COLECOES);

/**
 * Quantas amostras vão em cada bloco gravado.
 *
 * Sessenta é um minuto de gravação a cada segundo. Blocos menores geram
 * transações demais; maiores perdem mais coisa se o aplicativo for fechado no
 * meio — e um minuto é o que dá para perder sem que faça diferença no resumo.
 */
export const AMOSTRAS_POR_BLOCO = 60;
