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
      await driver.apagar('viagens', viagemId);
      pendentes.delete(viagemId);
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
