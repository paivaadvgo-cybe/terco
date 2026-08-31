/**
 * Cria o conjunto vigente a partir da base extraída da planilha.
 *
 *     node ferramentas/gerar_vigentes.mjs
 *
 * Roda uma vez, para dar o ponto de partida. Depois disso quem escreve este
 * arquivo é o painel de administração, pela mesma função de serialização — e é
 * por isso que a ferramenta usa `arquivosParaPublicar` em vez de escrever o
 * texto do seu jeito: o formato precisa ser um só.
 *
 * Rodá-la de novo devolve o conjunto ao que a planilha diz, descartando o que a
 * administração tiver alterado. É a saída de emergência, não a rotina.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PARAMETROS } from '../js/data/parametros.js';
import { PRODUTOS } from '../js/produtos/produtos.js';
import { arquivosParaPublicar } from '../js/admin/serializar.js';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const conjunto = {
  metadados: {
    versao: PARAMETROS.versao,
    vigenciaInicio: PARAMETROS.vigenciaInicio,
    atoNormativo: '',
    publicadoPor: '',
    publicadoEm: null,
    observacoes:
      'Conjunto inicial, igual ao que a planilha de referência traz. '
      + 'Nenhuma alteração da administração foi aplicada ainda.',
    sucedeVersao: null,
    baseadoEm: { versao: PARAMETROS.versao, origem: PARAMETROS.origem },
  },
  observacaoDeUnidade: PARAMETROS.observacaoDeUnidade,
  tabelaDeEncargos: PARAMETROS.tabelaDeEncargos,
  fatorKFGI: PARAMETROS.fatorKFGI,
  linhasPorAba: PARAMETROS.linhasPorAba,
  encargos: PARAMETROS.encargos,
  indexadores: PARAMETROS.indexadores,
  // Os perfis de produto entram como dado. Nos módulos de `js/produtos/` fica
  // a base, com o comentário que explica por que cada família é como é; aqui
  // fica a cópia que o aplicativo usa e que o painel edita. Um produto é uma
  // combinação de comportamentos que o motor já implementa, e por isso pode
  // ser composto sem código.
  produtos: PRODUTOS,
};

for (const { nome, conteudo } of arquivosParaPublicar(conjunto)) {
  const destino = path.join(raiz, nome);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, conteudo, 'utf8');
  console.log(`${nome} — ${conteudo.length.toLocaleString('pt-BR')} caracteres`);
}

const linhas = Object.values(conjunto.linhasPorAba).reduce((n, a) => n + a.linhas.length, 0);
console.log(`linhas de crédito: ${linhas}`);
console.log(`prazos com fator K: ${Object.keys(conjunto.fatorKFGI.fatores).length}`);
console.log(`produtos: ${Object.keys(conjunto.produtos).length}`);
