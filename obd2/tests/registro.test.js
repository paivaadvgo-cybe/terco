/**
 * O registro da conversa com o adaptador sobrevive à falha de conexão.
 *
 * É a tela que existe para quando algo dá errado, e ela era limpa justamente
 * quando dava errado: `desconectar` solta o adaptador, inclusive no `catch` da
 * conexão, e a tela lia o registro de dentro dele. Quem tentava conectar e não
 * conseguia abria «Ver registro» e encontrava «Nada ainda. Conecte um
 * adaptador» — a tela de diagnóstico dizendo que não há o que diagnosticar,
 * logo depois de um diagnóstico ter falhado.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { criarSessao } from '../js/sessao.js';
import { criarArmazenamento } from '../js/armazenamento/storage.js';
import { criarDriverEmMemoria } from '../js/armazenamento/memoria.js';

/**
 * Um adaptador que abre e morre no primeiro comando.
 *
 * Falha na hora, em vez de calar por nove segundos até estourar o tempo: o
 * registro é escrito antes do envio, então os dois caminhos guardam a mesma
 * coisa — e este não segura a suíte de testes por nove segundos.
 */
function transporteQueMorre() {
  return {
    nome: 'quebrado',
    rotulo: 'adaptador que cai',
    simulado: false,
    conectado: false,
    async abrir() { this.conectado = true; },
    aoReceber() {},
    aoDesconectar() {},
    async enviar() { throw new Error('a ponte caiu'); },
    async fechar() { this.conectado = false; },
  };
}

test('a conversa continua legível depois de a conexão falhar', async () => {
  const armazenamento = await criarArmazenamento(criarDriverEmMemoria());
  const sessao = criarSessao({ armazenamento });

  await assert.rejects(sessao.conectar(transporteQueMorre()));

  assert.equal(sessao.estado.situacao, 'erro');
  assert.equal(sessao.estado.adaptador, null, 'o adaptador é solto, como sempre foi');
  assert.ok(sessao.estado.registro.length > 0,
    'mas o que foi enviado precisa continuar visível, ou a tela de diagnóstico não diagnostica nada');
  assert.ok(sessao.estado.registro.some((entrada) => entrada.texto.includes('ATZ')),
    'o primeiro comando da abertura tem de estar lá');
});
