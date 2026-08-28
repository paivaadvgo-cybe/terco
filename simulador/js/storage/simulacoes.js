/**
 * Simulações salvas, em IndexedDB.
 *
 * Tudo fica no aparelho: não há servidor, conta nem envio. Cada simulação
 * guarda, além do resultado, a versão dos parâmetros e a do motor que a
 * produziram — sem isso, uma simulação recuperada meses depois seria um
 * número sem procedência, impossível de conferir contra a tabela que valia
 * na época.
 */

const BANCO = 'simulador-goiasfomento';
const VERSAO = 1;
const LOJA = 'simulacoes';

let conexao = null;

function abrir() {
  if (conexao) return Promise.resolve(conexao);
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador não tem IndexedDB; as simulações não podem ser salvas.'));
      return;
    }
    const pedido = indexedDB.open(BANCO, VERSAO);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains(LOJA)) {
        const loja = db.createObjectStore(LOJA, { keyPath: 'id' });
        loja.createIndex('dataSimulacao', 'dataSimulacao');
        loja.createIndex('produto', 'produto');
      }
    };
    pedido.onsuccess = () => { conexao = pedido.result; resolve(conexao); };
    pedido.onerror = () => reject(pedido.error);
  });
}

function transacao(modo, acao) {
  return abrir().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(LOJA, modo);
    const pedido = acao(tx.objectStore(LOJA));
    tx.oncomplete = () => resolve(pedido?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

function novoId() {
  return `sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Salva, atribuindo id e apelido quando não vierem. */
export async function salvar(simulacao, apelido) {
  const registro = {
    ...simulacao,
    id: simulacao.id ?? novoId(),
    apelido: apelido ?? simulacao.apelido ?? `${simulacao.nomeDoProduto} — ${simulacao.linha}`,
    salvaEm: new Date().toISOString(),
  };
  await transacao('readwrite', (loja) => loja.put(registro));
  return registro;
}

export async function listar() {
  const todas = await transacao('readonly', (loja) => loja.getAll());
  return (todas ?? []).sort((a, b) => (a.salvaEm < b.salvaEm ? 1 : -1));
}

export function recuperar(id) {
  return transacao('readonly', (loja) => loja.get(id));
}

export function excluir(id) {
  return transacao('readwrite', (loja) => loja.delete(id));
}

export async function renomear(id, apelido) {
  const registro = await recuperar(id);
  if (!registro) return null;
  return salvar({ ...registro }, apelido);
}

/** Duplicar cria um registro novo, com id próprio e a data de agora. */
export async function duplicar(id) {
  const registro = await recuperar(id);
  if (!registro) return null;
  return salvar({ ...registro, id: null }, `${registro.apelido} (cópia)`);
}

/** Se o IndexedDB não estiver disponível, a interface avisa em vez de fingir. */
export async function disponivel() {
  try {
    await abrir();
    return true;
  } catch {
    return false;
  }
}
