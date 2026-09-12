/**
 * Driver IndexedDB.
 *
 * É o banco de verdade: sobrevive a fechar o aplicativo, a reiniciar o
 * aparelho e a ficar uma semana sem internet — que é exatamente o que se
 * espera de um caderno de movimento. `localStorage` não serviria: é síncrono
 * (trava a tela no meio do atendimento), limitado a alguns megabytes e só
 * guarda texto, o que deixaria as fotos de fora.
 *
 * Este arquivo não conhece lavagem, preço nem caixa. Ele conhece coleções,
 * chaves e índices, e é essa fronteira que permite trocar o armazenamento
 * depois — por um banco remoto, por exemplo — sem tocar em nada mais.
 */

import { NOME, VERSAO, COLECOES } from './esquema.js';

function promessa(requisicao) {
  return new Promise((resolver, recusar) => {
    requisicao.onsuccess = () => resolver(requisicao.result);
    requisicao.onerror = () => recusar(requisicao.error);
  });
}

/** O IndexedDB está disponível e aceita abrir? Janela anônima costuma recusar. */
export function disponivel() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

export function abrirBanco(nome = NOME, versao = VERSAO) {
  return new Promise((resolver, recusar) => {
    const pedido = indexedDB.open(nome, versao);

    pedido.onupgradeneeded = () => {
      const banco = pedido.result;
      for (const [colecao, { chave, indices }] of Object.entries(COLECOES)) {
        const loja = banco.objectStoreNames.contains(colecao)
          ? pedido.transaction.objectStore(colecao)
          : banco.createObjectStore(colecao, { keyPath: chave });
        for (const indice of indices ?? []) {
          if (!loja.indexNames.contains(indice)) loja.createIndex(indice, indice, { unique: false });
        }
      }
    };

    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => recusar(pedido.error);
    // Outra aba com versão antiga segurando o banco. Recusar é melhor que
    // esperar para sempre por uma aba que ninguém vai fechar.
    pedido.onblocked = () => recusar(new Error('outra aba do aplicativo está aberta com uma versão antiga'));
  });
}

export async function criarDriverIndexedDB(nome = NOME, versao = VERSAO) {
  const banco = await abrirBanco(nome, versao);

  const transacao = (colecao, modo) => banco.transaction(colecao, modo).objectStore(colecao);

  return {
    tipo: 'indexeddb',
    persistente: true,

    async ler(colecao, chave) {
      return (await promessa(transacao(colecao, 'readonly').get(chave))) ?? null;
    },

    async listar(colecao) {
      return promessa(transacao(colecao, 'readonly').getAll());
    },

    async listarPor(colecao, indice, valor) {
      const loja = transacao(colecao, 'readonly');
      if (!loja.indexNames.contains(indice)) {
        return (await promessa(loja.getAll())).filter((r) => r[indice] === valor);
      }
      return promessa(loja.index(indice).getAll(valor));
    },

    async gravar(colecao, registro) {
      await promessa(transacao(colecao, 'readwrite').put(registro));
      return registro;
    },

    /**
     * Vários registros numa transação só.
     *
     * Importa na restauração de backup: gravar milhares de lavagens uma a uma
     * abre milhares de transações e leva minutos num celular modesto. E, se
     * cair no meio, o banco fica pela metade — aqui, ou entra tudo, ou nada.
     */
    gravarVarios(colecao, registros) {
      if (registros.length === 0) return Promise.resolve(0);
      return new Promise((resolver, recusar) => {
        const tx = banco.transaction(colecao, 'readwrite');
        const loja = tx.objectStore(colecao);
        for (const registro of registros) loja.put(registro);
        tx.oncomplete = () => resolver(registros.length);
        tx.onerror = () => recusar(tx.error);
        tx.onabort = () => recusar(tx.error ?? new Error('gravação interrompida'));
      });
    },

    async apagar(colecao, chave) {
      await promessa(transacao(colecao, 'readwrite').delete(chave));
    },

    async limpar(colecao) {
      await promessa(transacao(colecao, 'readwrite').clear());
    },

    async fechar() {
      banco.close();
    },
  };
}
