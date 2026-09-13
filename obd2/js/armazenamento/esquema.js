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

/**
 * A versão do **banco**, não a do aplicativo.
 *
 * Só sobe quando o formato muda: coleção nova, índice novo. A 2 acrescentou
 * `videos`. Subir à toa dispara a migração do IndexedDB em todo aparelho sem
 * necessidade; não subir quando devia faz a coleção nova não nascer em quem já
 * tem o aplicativo instalado — e o defeito aparece só lá, nunca no aparelho de
 * quem programou.
 */
export const VERSAO = 2;

export const COLECOES = {
  /** Um registro só, de identificador `app`: tema, combustível, PIDs do painel. */
  configuracao: { chave: 'id', indices: [] },
  /** Uma por gravação: início, fim, resumo já calculado. */
  viagens: { chave: 'id', indices: ['dia'] },
  /** Um bloco de amostras por registro, referente a uma viagem. */
  amostras: { chave: 'id', indices: ['viagem'] },
  /** O que se descobriu do carro: chassi, PIDs, adaptador e os recordes. */
  veiculos: { chave: 'id', indices: [] },
  /**
   * Trechos de vídeo gravados junto com uma viagem.
   *
   * Um registro por trecho, com o `Blob` dentro. Guardar o vídeo inteiro num
   * registro só impediria de gravar mais de alguns minutos: o navegador teria
   * de manter tudo em memória até o fim para então escrever de uma vez.
   */
  videos: { chave: 'id', indices: ['viagem'] },
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

/**
 * Quanto tempo dura cada trecho de vídeo, em milissegundos.
 *
 * Trinta segundos. O `MediaRecorder` só produz um arquivo tocável sozinho
 * quando é parado — os pedaços intermediários não têm cabeçalho e não abrem em
 * lugar nenhum. Então o aplicativo para e recomeça a cada trecho, e o preço são
 * alguns milissegundos perdidos na emenda.
 *
 * Trechos curtos demais multiplicam as emendas; longos demais perdem mais
 * gravação se o aplicativo for fechado à força, e travam mais memória.
 */
export const DURACAO_DO_TRECHO = 30_000;
