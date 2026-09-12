/**
 * As coleções do banco local, e o que cada uma guarda.
 *
 * Uma declaração só, lida pelos dois drivers (IndexedDB e memória), pelo
 * backup e pelos testes. Enquanto foi implícita — cada arquivo criando a sua
 * `objectStore` — acrescentar uma coleção exigia lembrar de três lugares, e
 * esquecer um deles só aparecia no aparelho de quem já tinha o aplicativo
 * instalado, porque a versão do banco não subia e a coleção nova não nascia.
 *
 * `VERSAO` é a versão do **banco**, não a do aplicativo. Só sobe quando o
 * formato muda: coleção nova, índice novo. Subir à toa dispara a migração do
 * IndexedDB em todo aparelho, sem necessidade.
 */

export const NOME = 'lava-rapido-lite';
export const VERSAO = 1;

export const COLECOES = {
  /** Um registro só, de identificador `app`: nome, telefone, PIN, tema, opções. */
  configuracao: { chave: 'id', indices: [] },
  servicos: { chave: 'id', indices: [] },
  /** Uma célula da tabela por registro, com identificador `tipo:servico`. */
  precos: { chave: 'id', indices: [] },
  /** A placa é a chave. Não há cadastro de cliente: a placa é o cliente. */
  veiculos: { chave: 'placa', indices: ['ultimaEm'] },
  lavagens: { chave: 'id', indices: ['dia', 'placa', 'estado'] },
  funcionarios: { chave: 'id', indices: [] },
  despesas: { chave: 'id', indices: ['dia'] },
  /** Fotos otimizadas, guardadas fora da lavagem para não pesar toda leitura. */
  fotos: { chave: 'id', indices: [] },
  /** O dia é a chave: um fechamento por dia, e refazer o dia sobrescreve. */
  fechamentos: { chave: 'dia', indices: [] },
};

export const NOMES = Object.keys(COLECOES);

/** As coleções que entram no backup, na ordem em que são restauradas. */
export const NO_BACKUP = [
  'configuracao', 'servicos', 'precos', 'funcionarios',
  'veiculos', 'lavagens', 'despesas', 'fechamentos',
];
