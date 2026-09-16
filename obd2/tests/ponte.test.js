/**
 * A ponte do adaptador Wi-Fi.
 *
 * Aqui se testa o que não dá para conferir olhando: a moldura binária do
 * WebSocket. São dois bytes de cabeçalho, três formas de declarar tamanho e uma
 * máscara de quatro bytes aplicada byte a byte — e errar qualquer um desses
 * detalhes não dá erro, dá texto embaralhado, que o aplicativo leria como
 * resposta corrompida do adaptador.
 *
 * O caso que mais importa é o do TCP partido: a rede não entrega mensagens,
 * entrega bytes, e um quadro pode chegar em três pedaços. Quem não guarda o
 * resto funciona na bancada e falha no carro.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  chaveDeResposta, origemPermitida, montarQuadro, lerQuadros, quadroDeFechamento,
  ORIGENS_PADRAO, enderecosProvaveis, enderecosDoAparelho, testarAdaptador, OBD_PADRAO,
} from '../ferramentas/ponte-wifi.mjs';
import net from 'node:net';
import { problemaNoEndereco, PONTE_PADRAO } from '../js/obd/transporte-wifi.js';

/** Monta um quadro de cliente, que é sempre mascarado. */
function quadroDoCliente(texto, mascara = Buffer.from([0x37, 0xfa, 0x21, 0x3d])) {
  const dados = Buffer.from(texto, 'utf8');
  const corpo = Buffer.from(dados);
  for (let i = 0; i < corpo.length; i += 1) corpo[i] ^= mascara[i % 4];

  let cabecalho;
  if (dados.length < 126) {
    cabecalho = Buffer.from([0x81, 0x80 | dados.length]);
  } else {
    cabecalho = Buffer.alloc(4);
    cabecalho[0] = 0x81;
    cabecalho[1] = 0x80 | 126;
    cabecalho.writeUInt16BE(dados.length, 2);
  }
  return Buffer.concat([cabecalho, mascara, corpo]);
}

test('o aperto de mão responde o que o RFC 6455 manda', () => {
  // O exemplo do próprio RFC: se esta conta estiver errada, nenhum navegador
  // do mundo aceita a ponte, e o erro que aparece na tela não diz por quê.
  assert.equal(chaveDeResposta('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
});

test('um quadro curto vai e volta inteiro', () => {
  const { quadros, resto } = lerQuadros(quadroDoCliente('ATZ\r'));
  assert.equal(quadros.length, 1);
  assert.equal(quadros[0].corpo.toString('utf8'), 'ATZ\r');
  assert.equal(resto.length, 0);
});

test('a máscara do cliente é desfeita', () => {
  // Sem desmascarar, o adaptador receberia lixo e responderia `?` a tudo — o
  // que na tela parece «adaptador incompatível».
  const texto = '0100\r';
  const quadro = quadroDoCliente(texto, Buffer.from([0x01, 0x02, 0x03, 0x04]));
  assert.notEqual(quadro.subarray(6).toString('utf8'), texto, 'o teste precisa mascarar de verdade');
  assert.equal(lerQuadros(quadro).quadros[0].corpo.toString('utf8'), texto);
});

test('dois quadros num pedaço só saem os dois', () => {
  const junto = Buffer.concat([quadroDoCliente('ATE0\r'), quadroDoCliente('ATL0\r')]);
  const { quadros, resto } = lerQuadros(junto);
  assert.deepEqual(quadros.map((q) => q.corpo.toString('utf8')), ['ATE0\r', 'ATL0\r']);
  assert.equal(resto.length, 0);
});

test('um quadro partido espera o resto, sem inventar', () => {
  const inteiro = quadroDoCliente('010C1\r');
  const corte = 5;

  const primeira = lerQuadros(inteiro.subarray(0, corte));
  assert.deepEqual(primeira.quadros, [], 'não pode entregar meia mensagem');
  assert.equal(primeira.resto.length, corte, 'e não pode jogar fora o que chegou');

  const segunda = lerQuadros(Buffer.concat([primeira.resto, inteiro.subarray(corte)]));
  assert.equal(segunda.quadros[0].corpo.toString('utf8'), '010C1\r');
});

test('um cabeçalho partido ao meio também espera', () => {
  // O pior corte possível: um byte só. Se o leitor tentar ler o tamanho aqui,
  // lê lixo e pede um quadro de tamanho absurdo.
  const inteiro = quadroDoCliente('0100\r');
  const { quadros, resto } = lerQuadros(inteiro.subarray(0, 1));
  assert.deepEqual(quadros, []);
  assert.equal(resto.length, 1);
});

test('quadro de mais de 125 bytes usa o tamanho de 16 bits', () => {
  // A lista de códigos de falha de um carro doente passa de 125 bytes com
  // folga, e é justamente quando o aplicativo mais precisa estar certo.
  const longo = '41 00 BE 3E B8 11 '.repeat(20);
  const quadro = quadroDoCliente(longo);
  assert.equal(quadro[1] & 0x7f, 126, 'o teste precisa exercitar o caminho de 16 bits');
  assert.equal(lerQuadros(quadro).quadros[0].corpo.toString('utf8'), longo);
});

test('o que a ponte monta, o navegador consegue ler', () => {
  // O servidor não mascara — o RFC proíbe. Um bit de máscara aqui faz o Chrome
  // derrubar a conexão sem explicar.
  const quadro = montarQuadro('41 0C 1A F8\r\r>');
  assert.equal(quadro[0], 0x81, 'quadro de texto, final');
  assert.equal(quadro[1] & 0x80, 0, 'servidor não pode mascarar');
  assert.equal(quadro.subarray(2).toString('utf8'), '41 0C 1A F8\r\r>');
});

test('o quadro de fechamento leva o código dentro', () => {
  const quadro = quadroDeFechamento(1000);
  assert.equal(quadro[0], 0x88);
  assert.equal(quadro.readUInt16BE(2), 1000);
});

test('um tamanho absurdo é recusado, não alocado', () => {
  // 64 bits de tamanho vindos de fora são um pedido de alocar 16 exabytes. A
  // ponte roda no celular de quem está dirigindo.
  const cabecalho = Buffer.alloc(14);
  cabecalho[0] = 0x81;
  cabecalho[1] = 0x80 | 127;
  cabecalho.writeBigUInt64BE(0xffffffffffn, 2);
  const { erro } = lerQuadros(cabecalho);
  assert.ok(erro, 'a ponte precisa recusar em vez de tentar');
});

/* ------------------------------------------------------------- a origem */

test('a ponte só aceita origens conhecidas', () => {
  // Enquanto a ponte está de pé, qualquer página aberta no celular pode tentar
  // falar com o carro — inclusive mandar apagar código de falha.
  assert.ok(origemPermitida('https://paivaadvgo-cybe.github.io'));
  assert.ok(origemPermitida('https://paivaadvgo-cybe.github.io/terco/obd2/'));
  assert.ok(!origemPermitida('https://sitio-qualquer.example'));
  assert.ok(!origemPermitida('http://paivaadvgo-cybe.github.io'), 'esquema diferente é origem diferente');
});

test('origem ausente é programa, não página', () => {
  // `curl` e afins não mandam `Origin`. Quem já está dentro do aparelho alcança
  // o adaptador sem a ponte de qualquer jeito: recusar aqui não protegeria nada.
  assert.ok(origemPermitida(undefined));
  assert.ok(origemPermitida(''));
});

test('origem que nem é endereço é recusada', () => {
  assert.ok(!origemPermitida('null'));
  assert.ok(!origemPermitida('isto não é uma origem'));
});

test('em origem remota, a porta faz parte da identidade', () => {
  // Ignorar a porta aqui abriria a ponte para qualquer serviço hospedado no
  // mesmo domínio — e num domínio de páginas de usuário isso é qualquer um.
  const lista = ['https://exemplo.test:443', 'https://exemplo.test'];
  assert.ok(origemPermitida('https://exemplo.test', lista));
  assert.ok(!origemPermitida('https://exemplo.test:8443', lista));
});

test('em origem local, a porta não separa nada', () => {
  /*
   * Este foi um defeito de verdade nos padrões: `http://127.0.0.1` da lista
   * quer dizer porta 80, e a própria ponte serve o painel em `localhost:8127`
   * quando se usa `--servir`. Ela recusava a si mesma.
   *
   * E exigir a porta não protegia nada: quem consegue abrir uma página em
   * `localhost` já está dentro do aparelho, e alcança o adaptador com ou sem
   * ponte.
   */
  assert.ok(origemPermitida('http://localhost', ORIGENS_PADRAO));
  assert.ok(origemPermitida('http://localhost:8127', ORIGENS_PADRAO), 'é a própria ponte servindo o painel');
  assert.ok(origemPermitida('http://127.0.0.1:8124', ORIGENS_PADRAO));
  assert.ok(!origemPermitida('https://localhost:8127', ORIGENS_PADRAO), 'esquema continua contando');
});

/* -------------------------------------------------- o endereço da ponte */

test('o endereço padrão da ponte é aceito', () => {
  assert.equal(problemaNoEndereco(PONTE_PADRAO), null);
  assert.equal(problemaNoEndereco('ws://192.168.1.50:8127'), null);
  assert.equal(problemaNoEndereco('wss://ponte.example'), null);
});

test('digitar o endereço do adaptador é o engano provável, e tem resposta própria', () => {
  /*
   * Sem isto, quem digita `ws://192.168.0.10:35000` fica com a conexão pendurada
   * até estourar o tempo e recebe «não respondeu» — que manda procurar defeito
   * na ponte, que está certa.
   */
  const aviso = problemaNoEndereco('ws://192.168.0.10:35000');
  assert.match(aviso, /adaptador/);
  assert.match(aviso, /--obd/);
});

test('http no lugar de ws tem resposta própria', () => {
  assert.match(problemaNoEndereco('http://127.0.0.1:8127'), /ws:\/\//);
});

test('endereço vazio ou sem sentido é recusado antes de tentar', () => {
  assert.ok(problemaNoEndereco(''));
  assert.ok(problemaNoEndereco('   '));
  assert.ok(problemaNoEndereco('127.0.0.1:8127'), 'sem esquema não é endereço');
});

/* ------------------------------------------------------- achar o adaptador */

/** Interfaces como o Node as devolve, para não depender da rede real. */
const NA_REDE_DO_DONGLE = {
  lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
  wlan0: [{ address: '192.168.4.37', family: 'IPv4', internal: false }],
};

test('o endereço do adaptador é deduzido da rede em que o celular está', () => {
  /*
   * É o que resolve o problema de verdade: o manual diz 192.168.0.10, mas cada
   * lote de clone escolhe o seu, e descobrir qual é sentado no carro, sem
   * ferramenta de rede, é onde a maioria desiste. O celular já sabe — acabou de
   * receber endereço por DHCP dessa mesma rede.
   */
  const provaveis = enderecosProvaveis(NA_REDE_DO_DONGLE);
  assert.ok(provaveis.indexOf('192.168.4.1') >= 0, 'o que serve DHCP é quase sempre o .1');
  assert.ok(provaveis.indexOf('192.168.4.10') >= 0);
  assert.ok(provaveis.indexOf('192.168.4.1') < provaveis.indexOf(OBD_PADRAO.servidor),
    'o deduzido da rede atual vem antes do endereço de manual');
});

test('os conhecidos entram mesmo sem rede nenhuma', () => {
  // Sem Wi-Fi ligada a lista não pode vir vazia: a varredura ainda precisa ter
  // o que tentar, nem que seja para dizer «não achei» com fundamento.
  const provaveis = enderecosProvaveis({ lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] });
  assert.deepEqual(provaveis, [OBD_PADRAO.servidor, '192.168.4.1']);
});

test('o próprio celular nunca entra na lista', () => {
  // Bater em 127.0.0.1 acharia a própria ponte e diria que é o adaptador.
  const provaveis = enderecosProvaveis({ lo: [{ address: '127.0.0.1', family: 'IPv4', internal: false }] });
  assert.ok(!provaveis.includes('127.0.0.1'));
});

test('o relatório diz onde o celular está', () => {
  assert.deepEqual(enderecosDoAparelho(NA_REDE_DO_DONGLE), ['wlan0 192.168.4.37']);
});

test('quem atende e se apresenta é reconhecido', async () => {
  const falso = net.createServer((s) => {
    s.on('data', () => s.write('ELM327 v1.5\r\r>'));
  });
  await new Promise((pronto) => falso.listen(0, '127.0.0.1', pronto));

  const resultado = await testarAdaptador({ servidor: '127.0.0.1', porta: falso.address().port });
  falso.close();

  assert.equal(resultado.ok, true);
  assert.match(resultado.banner, /ELM327/);
});

test('quem atende e fica calado não é confundido com quem não atende', async () => {
  /*
   * Este foi um defeito real, encontrado no primeiro uso do diagnóstico: o
   * tempo estourava e o relatório dizia «atendeu e ficou calado» para um
   * endereço onde nada atendia. Num estacionamento, isso manda procurar
   * aplicativo concorrente segurando a conexão quando o problema é que o
   * celular não está na rede do adaptador — duas causas opostas.
   */
  const mudo = net.createServer(() => { /* aceita e não diz nada */ });
  await new Promise((pronto) => mudo.listen(0, '127.0.0.1', pronto));

  const calado = await testarAdaptador({ servidor: '127.0.0.1', porta: mudo.address().port, espera: 300 });
  mudo.close();
  assert.equal(calado.ok, false);
  assert.equal(calado.atendeu, true, 'este atendeu de verdade');
  assert.match(calado.erro, /calado/);
});

test('porta fechada é recusa, e não silêncio', async () => {
  const efemero = net.createServer();
  await new Promise((pronto) => efemero.listen(0, '127.0.0.1', pronto));
  const porta = efemero.address().port;
  await new Promise((pronto) => efemero.close(pronto));

  const recusado = await testarAdaptador({ servidor: '127.0.0.1', porta, espera: 400 });
  assert.equal(recusado.ok, false);
  assert.equal(recusado.atendeu, false);
});
