/**
 * Driver em memória.
 *
 * Existe por dois motivos, e o segundo é o que o mantém honesto:
 *
 * 1. Os testes rodam no Node, que não tem IndexedDB. Sem este driver, a única
 *    forma de testar o armazenamento seria com navegador — isto é, não testá-lo.
 * 2. Um navegador em janela anônima, ou com o armazenamento bloqueado, recusa o
 *    IndexedDB. Cair aqui deixa o aplicativo **funcionando** na sessão: o painel
 *    mostra o carro, e só a gravação da viagem é que não sobrevive ao
 *    fechamento. O aplicativo avisa; ver os dados do motor é o que a pessoa
 *    veio fazer.
 *
 * Ele copia o que entra e o que sai, como o IndexedDB faz. Devolver a mesma
 * referência guardada faria o teste passar com um driver que grava sozinho —
 * alterar o objeto lido alteraria o «banco» sem nenhuma gravação.
 */

import { COLECOES } from './esquema.js';

const copiar = (v) => (v === undefined ? undefined : structuredClone(v));

export function criarDriverEmMemoria(inicial = {}) {
  const dados = new Map();
  for (const nome of Object.keys(COLECOES)) {
    dados.set(nome, new Map((inicial[nome] ?? []).map((r) => [r[COLECOES[nome].chave], copiar(r)])));
  }

  const tabela = (nome) => {
    const t = dados.get(nome);
    if (!t) throw new Error(`coleção desconhecida: ${nome}`);
    return t;
  };

  return {
    tipo: 'memoria',
    persistente: false,

    async ler(colecao, chave) {
      return copiar(tabela(colecao).get(chave)) ?? null;
    },

    async listar(colecao) {
      return [...tabela(colecao).values()].map(copiar);
    },

    async listarPor(colecao, indice, valor) {
      return (await this.listar(colecao)).filter((r) => r[indice] === valor);
    },

    async gravar(colecao, registro) {
      const chave = registro[COLECOES[colecao].chave];
      if (chave === undefined || chave === null) throw new Error(`registro sem chave em ${colecao}`);
      tabela(colecao).set(chave, copiar(registro));
      return copiar(registro);
    },

    async gravarVarios(colecao, registros) {
      for (const r of registros) await this.gravar(colecao, r);
      return registros.length;
    },

    async apagar(colecao, chave) {
      tabela(colecao).delete(chave);
    },

    async limpar(colecao) {
      tabela(colecao).clear();
    },

    async fechar() {},
  };
}
