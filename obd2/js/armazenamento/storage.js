/**
 * A única porta de entrada dos dados.
 *
 * Nenhuma tela conhece IndexedDB. Elas conhecem «começar viagem», «guardar
 * amostra», «listar viagens», «ajustes». Trocar o driver — por um em memória
 * nos testes, por outra coisa depois — não toca em tela nenhuma.
 *
 * **A gravação de viagem é o caminho quente do aplicativo.** Acontece uma vez
 * por segundo, com o carro andando, enquanto a tela desenha ponteiros. Por isso
 * as amostras são acumuladas em memória e descarregadas em bloco: gravar uma a
 * uma abriria uma transação por segundo por nada. O preço é o último minuto, se
 * o aplicativo for fechado à força — e `encerrarViagem` descarrega o que sobrou
 * justamente para que o caso normal não pague esse preço.
 *
 * **Nada sai daqui.** Não há servidor, conta nem envio. O que o carro conta
 * fica no aparelho de quem dirige, e apagar é apagar.
 */

import { NOMES, AMOSTRAS_POR_BLOCO } from './esquema.js';
import { criarViagem, resumir } from '../dominio/viagem.js';
import { COMBUSTIVEL_PADRAO } from '../dominio/leituras.js';
import { PADRAO_DO_PAINEL } from '../obd/pids.js';
import { dia as diaDe } from '../dominio/datas.js';

export const CONFIGURACAO_PADRAO = {
  id: 'app',
  tema: 'auto',
  combustivel: COMBUSTIVEL_PADRAO,
  /** Cilindrada em litros, só usada para estimar consumo em carro sem MAF. */
  cilindrada: null,
  painel: [...PADRAO_DO_PAINEL],
  /** Intervalo entre amostras gravadas, em milissegundos. */
  intervaloDeGravacao: 1000,
  /** Manter a tela acesa durante a gravação. */
  manterTelaAcesa: true,

  /* ------------------------------------------------------- velocímetro */

  /**
   * De onde vem a velocidade: `obd`, `gps` ou `ambos`.
   *
   * O padrão é `obd` porque é o que funciona sem pedir mais nenhuma permissão
   * e sem gastar bateria de GPS. Quem quiser comparar liga `ambos`, e aí uma
   * fonte fica no ponteiro grande e a outra na linha menor embaixo do número.
   */
  velocimetro: 'obd',
  /** Qual das duas manda no ponteiro quando as duas estão ligadas. */
  velocimetroPrincipal: 'obd',

  /* ------------------------------------------------------------- vídeo */

  /** Gravar vídeo junto com a viagem. Desligado por padrão. */
  gravarVideo: false,
  /** Altura do quadro: 480 ou 720. */
  qualidadeDeVideo: 720,
  /**
   * Gravar o som junto.
   *
   * Desligado por padrão, e a decisão é deliberada: uma câmera apontada para a
   * estrada grava a estrada, mas o microfone grava a conversa de quem está no
   * carro — inclusive de quem não escolheu ser gravado. Ligar é um botão; ligar
   * por omissão seria gravar gente sem querer.
   */
  audioNoVideo: false,
  /** Teto de espaço para vídeo, em megabytes. */
  limiteDeVideoMB: 1024,
};

export function novoId(prefixo = '') {
  const base = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return `${prefixo}${base}`;
}

export async function criarArmazenamento(driver) {
  /** O que ainda não foi para o banco, por viagem. */
  const pendentes = new Map();

  const armazenamento = {
    driver,
    persistente: driver.persistente,

    /* ------------------------------------------------------------ ajustes */

    async configuracao() {
      const guardada = await driver.ler('configuracao', 'app');
      return { ...CONFIGURACAO_PADRAO, ...(guardada ?? {}) };
    },

    async ajustar(mudancas) {
      const atual = await armazenamento.configuracao();
      const nova = { ...atual, ...mudancas, id: 'app' };
      await driver.gravar('configuracao', nova);
      return nova;
    },

    /* ------------------------------------------------------------ veículo */

    /**
     * O que se sabe do carro conectado.
     *
     * Guardado por chassi quando o carro informa um, e sob `desconhecido`
     * quando não informa — que é o caso de muito carro nacional anterior a
     * 2015. Sem essa distinção, dois carros diferentes sem chassi virariam o
     * mesmo registro, e a lista de PIDs de um apareceria no outro.
     */
    async guardarVeiculo({ vin, pids, adaptador, protocolo }) {
      const id = vin || 'desconhecido';
      const anterior = (await driver.ler('veiculos', id)) ?? {};
      const registro = {
        ...anterior,
        id,
        vin: vin ?? null,
        pids: pids ?? anterior.pids ?? [],
        adaptador: adaptador ?? anterior.adaptador ?? null,
        protocolo: protocolo ?? anterior.protocolo ?? null,
        visto: Date.now(),
      };
      await driver.gravar('veiculos', registro);
      return registro;
    },

    /**
     * Guarda os máximos de sempre de um carro, sem nunca abaixá-los.
     *
     * O merge é por comparação, e não por substituição: a sessão manda o que
     * viu, e se o que está no banco for maior, o que está no banco fica. Sem
     * isso, conectar e desconectar sem andar — o que acontece toda vez que se
     * testa alguma coisa na garagem — sobrescreveria a máxima de 130 km/h pela
     * de 0 km/h daquela sessão parada.
     */
    async registrarRecordes(veiculoId, recordes) {
      const veiculo = (await driver.ler('veiculos', veiculoId)) ?? { id: veiculoId };
      const anteriores = veiculo.recordes ?? {};
      const juntos = { ...anteriores };

      for (const [chave, valor] of Object.entries(recordes ?? {})) {
        if (!Number.isFinite(valor)) continue;
        if (!Number.isFinite(juntos[chave]) || valor > juntos[chave]) juntos[chave] = valor;
      }

      const atualizado = { ...veiculo, recordes: juntos, recordesEm: Date.now() };
      await driver.gravar('veiculos', atualizado);
      return atualizado;
    },

    /** Zera os recordes de um carro — o «apagar» que a tela de ajustes oferece. */
    async zerarRecordes(veiculoId) {
      const veiculo = await driver.ler('veiculos', veiculoId);
      if (!veiculo) return null;
      const zerado = { ...veiculo, recordes: {}, recordesEm: Date.now() };
      await driver.gravar('veiculos', zerado);
      return zerado;
    },

    veiculos: () => driver.listar('veiculos'),
    veiculo: (id) => driver.ler('veiculos', id),

    /* ------------------------------------------------------------ viagens */

    async comecarViagem({ veiculo = null } = {}) {
      const viagem = { ...criarViagem(Date.now(), { veiculo }), dia: diaDe() };
      await driver.gravar('viagens', viagem);
      pendentes.set(viagem.id, []);
      return viagem;
    },

    /**
     * Guarda uma amostra. Descarrega sozinha quando o bloco enche.
     *
     * Devolve a viagem só quando gravou algo no banco — quem chama usa isso
     * para atualizar o contador da tela sem ler o banco a cada segundo.
     */
    async guardarAmostra(viagemId, amostra) {
      const fila = pendentes.get(viagemId) ?? [];
      fila.push(amostra);
      pendentes.set(viagemId, fila);
      if (fila.length >= AMOSTRAS_POR_BLOCO) return armazenamento.descarregar(viagemId);
      return null;
    },

    /** Escreve o que estiver pendente de uma viagem. */
    async descarregar(viagemId) {
      const fila = pendentes.get(viagemId);
      if (!fila || fila.length === 0) return null;
      pendentes.set(viagemId, []);

      const bloco = {
        id: `${viagemId}:${novoId()}`,
        viagem: viagemId,
        de: fila[0].t,
        ate: fila[fila.length - 1].t,
        pontos: fila,
      };
      await driver.gravar('amostras', bloco);

      const viagem = await driver.ler('viagens', viagemId);
      if (!viagem) return bloco;
      const atualizada = { ...viagem, amostras: (viagem.amostras ?? 0) + fila.length, fim: bloco.ate };
      await driver.gravar('viagens', atualizada);
      return bloco;
    },

    /**
     * Fecha a viagem e calcula o resumo de uma vez.
     *
     * O resumo é gravado junto, e não recalculado a cada abertura da lista: são
     * duas mil amostras por viagem, e a lista mostra dez viagens. Recalcular ao
     * abrir é meio segundo de tela parada para chegar sempre ao mesmo número.
     */
    async encerrarViagem(viagemId, opcoes = {}) {
      await armazenamento.descarregar(viagemId);
      pendentes.delete(viagemId);

      const viagem = await driver.ler('viagens', viagemId);
      if (!viagem) return null;

      const amostras = await armazenamento.amostrasDa(viagemId);
      const resumo = resumir(amostras, opcoes);
      const encerrada = { ...viagem, fim: resumo.fim ?? Date.now(), resumo, amostras: amostras.length };
      await driver.gravar('viagens', encerrada);
      return encerrada;
    },

    async viagens() {
      const lista = await driver.listar('viagens');
      return lista.sort((a, b) => b.inicio - a.inicio);
    },

    viagem: (id) => driver.ler('viagens', id),

    /** Todas as amostras de uma viagem, em ordem e já desempacotadas. */
    async amostrasDa(viagemId) {
      const blocos = await driver.listarPor('amostras', 'viagem', viagemId);
      return blocos
        .sort((a, b) => a.de - b.de)
        .flatMap((bloco) => bloco.pontos)
        .sort((a, b) => a.t - b.t);
    },

    async apagarViagem(viagemId) {
      const blocos = await driver.listarPor('amostras', 'viagem', viagemId);
      for (const bloco of blocos) await driver.apagar('amostras', bloco.id);
      // O vídeo sai junto: um trecho órfão ocuparia dezenas de megabytes sem
      // nenhuma tela que o mostrasse ou permitisse apagar.
      for (const trecho of await driver.listarPor('videos', 'viagem', viagemId)) {
        await driver.apagar('videos', trecho.id);
      }
      await driver.apagar('viagens', viagemId);
      pendentes.delete(viagemId);
    },

    /* -------------------------------------------------------------- vídeo */

    /**
     * Guarda um trecho de vídeo com a hora em que ele começou.
     *
     * `de` e `ate` são o que sincroniza a imagem com os dados depois: o
     * gráfico e o vídeo são duas séries no mesmo relógio, e sem o instante de
     * início do trecho não há como dizer que aquele pico de rotação é este
     * pedaço de estrada.
     */
    async guardarTrechoDeVideo(viagemId, { blob, de, ate, tipo }) {
      const trecho = {
        id: `${viagemId}:v${novoId()}`,
        viagem: viagemId,
        de,
        ate,
        tipo: tipo ?? blob.type ?? 'video/webm',
        bytes: blob.size,
        blob,
      };
      await driver.gravar('videos', trecho);
      return trecho;
    },

    /** Os trechos de uma viagem, em ordem de tempo. */
    async videosDa(viagemId) {
      const trechos = await driver.listarPor('videos', 'viagem', viagemId);
      return trechos.sort((a, b) => a.de - b.de);
    },

    /**
     * Quanto espaço o vídeo ocupa, e quanto o navegador ainda concede.
     *
     * `navigator.storage.estimate()` é a única fonte honesta do limite — ele
     * varia com o espaço livre do aparelho, e não é um número fixo. Onde não
     * existe, devolve-se `null` em vez de um palpite: o aplicativo então avisa
     * que não sabe, em vez de prometer um espaço que talvez não exista.
     */
    async ocupacaoDeVideo() {
      const trechos = await driver.listar('videos');
      const bytes = trechos.reduce((total, t) => total + (t.bytes ?? 0), 0);

      let cota = null;
      try {
        const estimativa = await navigator.storage?.estimate?.();
        if (estimativa) {
          cota = { usado: estimativa.usage ?? null, limite: estimativa.quota ?? null };
        }
      } catch { /* sem estimativa: o aplicativo diz que não sabe */ }

      return { trechos: trechos.length, bytes, cota };
    },

    /**
     * Quanto espaço as viagens ocupam, aproximado.
     *
     * Aproximado de propósito: o número exato exigiria medir o banco, e o que a
     * pessoa precisa saber é se são dois megabytes ou duzentos.
     */
    async ocupacao() {
      const viagens = await driver.listar('viagens');
      const amostras = viagens.reduce((total, v) => total + (v.amostras ?? 0), 0);
      return { viagens: viagens.length, amostras, bytes: amostras * 90 };
    },

    async limparTudo() {
      for (const colecao of NOMES) await driver.limpar(colecao);
      pendentes.clear();
    },

    fechar: () => driver.fechar(),
  };

  return armazenamento;
}
