/**
 * A ponte para o adaptador ELM327 **Wi-Fi**.
 *
 * ## Por que ela precisa existir
 *
 * O adaptador Wi-Fi cria uma rede própria e fala **TCP puro** — tipicamente
 * `192.168.0.10:35000`. Navegador nenhum abre soquete TCP: não há API, não há
 * bandeira para ligar e não há biblioteca que contorne. É uma decisão de
 * segurança das plataformas, e vale para Chrome, Safari e todos os outros.
 *
 * O que o navegador abre é **WebSocket**. Então o que falta é um tradutor: de
 * um lado um servidor WebSocket que o painel alcança, do outro um soquete TCP
 * até o adaptador. Isso é esta ponte — noventa linhas de protocolo e um cano.
 *
 * Ela roda **no próprio celular**, dentro do Termux, na mesma rede do
 * adaptador. Não precisa de internet: a rede do dongle não tem nenhuma, e o
 * painel já funciona sem ela.
 *
 * ## Sem dependências, de propósito
 *
 * `npm install` numa rede sem internet, dentro de um carro, não acontece. O
 * aperto de mão do WebSocket é um SHA-1 e um base64; a moldura dos quadros são
 * dois bytes e uma máscara. Está tudo aqui, e o `node --test` prova que está
 * certo.
 *
 * ## A origem é conferida, e isso não é paranoia
 *
 * Enquanto a ponte está de pé, **qualquer página aberta no celular** pode tentar
 * `ws://127.0.0.1:8127` e conversar com o carro — ler o que o motor está
 * fazendo, e mandar apagar código de falha. Por isso o aperto de mão recusa
 * quem não vier de uma origem conhecida. `--origem` acrescenta outras, para
 * quem serve o painel de outro lugar.
 *
 *     node ferramentas/ponte-wifi.mjs
 *     node ferramentas/ponte-wifi.mjs --obd 192.168.4.1:35000 --porta 8127
 */

import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** O que o RFC 6455 manda concatenar antes do SHA-1. Não é segredo, é sal fixo. */
const SAL = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** Onde os clones ELM327 Wi-Fi costumam atender. */
export const OBD_PADRAO = { servidor: '192.168.0.10', porta: 35000 };

/** A porta da ponte. Alta e sem uso conhecido, para não brigar com nada. */
export const PORTA_PADRAO = 8127;

/** As origens que podem falar com o carro sem ser perguntado. */
export const ORIGENS_PADRAO = [
  'https://paivaadvgo-cybe.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

/** A resposta do aperto de mão: SHA-1 da chave do cliente com o sal, em base64. */
export function chaveDeResposta(chaveDoCliente) {
  return crypto.createHash('sha1').update(chaveDoCliente + SAL).digest('base64');
}

/** Nomes que significam «este mesmo aparelho». */
const LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * A origem tem permissão?
 *
 * Compara esquema e nome — `https://exemplo.com/pagina` e `https://exemplo.com`
 * são a mesma origem, e comparar o texto inteiro recusaria a segunda.
 *
 * **A porta só conta para origem remota.** Numa origem local ela não separa
 * nada: quem já consegue abrir uma página em `localhost` já está dentro do
 * aparelho, e alcança o adaptador com ou sem a ponte. Exigir a porta aqui só
 * criava armadilha — a própria ponte serve o painel em `localhost:8127` quando
 * se usa `--servir`, e recusava a si mesma, porque `http://127.0.0.1` da lista
 * quer dizer porta 80. Para origem remota é o contrário: a porta faz parte da
 * identidade, e ignorá-la abriria a ponte para qualquer serviço do mesmo
 * domínio.
 *
 * Sem `Origin` é pedido que não veio de página nenhuma (um programa de linha de
 * comando), e isso se permite pelo mesmo motivo: quem já está no aparelho não
 * precisa da ponte.
 */
export function origemPermitida(origem, permitidas = ORIGENS_PADRAO) {
  if (!origem) return true;
  let alvo;
  try {
    alvo = new URL(origem);
  } catch {
    return false;
  }
  return permitidas.some((texto) => {
    try {
      const uma = new URL(texto);
      if (uma.protocol !== alvo.protocol || uma.hostname !== alvo.hostname) return false;
      if (LOCAIS.has(alvo.hostname)) return true;
      return (uma.port || '') === (alvo.port || '');
    } catch {
      return false;
    }
  });
}

/**
 * Monta um quadro de texto do servidor para o cliente.
 *
 * Sem máscara: o RFC manda o cliente mascarar e proíbe o servidor de fazê-lo.
 * Três formas de tamanho, e as três acontecem — uma resposta de PID cabe em
 * dois bytes, a lista de códigos de falha de um carro doente não cabe.
 */
export function montarQuadro(texto) {
  const dados = Buffer.from(texto, 'utf8');
  const tamanho = dados.length;

  let cabecalho;
  if (tamanho < 126) {
    cabecalho = Buffer.from([0x81, tamanho]);
  } else if (tamanho < 65536) {
    cabecalho = Buffer.alloc(4);
    cabecalho[0] = 0x81;
    cabecalho[1] = 126;
    cabecalho.writeUInt16BE(tamanho, 2);
  } else {
    cabecalho = Buffer.alloc(10);
    cabecalho[0] = 0x81;
    cabecalho[1] = 127;
    cabecalho.writeBigUInt64BE(BigInt(tamanho), 2);
  }
  return Buffer.concat([cabecalho, dados]);
}

/**
 * Lê os quadros completos que já chegaram, e devolve o que sobrou.
 *
 * TCP não entrega mensagens, entrega bytes: um quadro pode vir partido em três
 * pedaços e três quadros podem vir num pedaço só. Quem não guarda o resto
 * funciona na bancada e falha no carro, onde a rede é pior.
 */
export function lerQuadros(acumulado) {
  const quadros = [];
  let resto = acumulado;

  for (;;) {
    if (resto.length < 2) break;
    const opcode = resto[0] & 0x0f;
    const mascarado = (resto[1] & 0x80) !== 0;
    let tamanho = resto[1] & 0x7f;
    let inicio = 2;

    if (tamanho === 126) {
      if (resto.length < 4) break;
      tamanho = resto.readUInt16BE(2);
      inicio = 4;
    } else if (tamanho === 127) {
      if (resto.length < 10) break;
      const grande = resto.readBigUInt64BE(2);
      // Um quadro de mais de 4 GB não é ELM327: é defeito ou ataque.
      if (grande > 0x7fffffffn) return { quadros, resto: Buffer.alloc(0), erro: 'quadro absurdo' };
      tamanho = Number(grande);
      inicio = 10;
    }

    const mascara = mascarado ? resto.subarray(inicio, inicio + 4) : null;
    if (mascarado) inicio += 4;
    if (resto.length < inicio + tamanho) break;

    const corpo = Buffer.from(resto.subarray(inicio, inicio + tamanho));
    if (mascara) for (let i = 0; i < corpo.length; i += 1) corpo[i] ^= mascara[i % 4];

    quadros.push({ opcode, corpo });
    resto = resto.subarray(inicio + tamanho);
  }

  return { quadros, resto };
}

/** O quadro de fechamento, com o código dentro. */
export function quadroDeFechamento(codigo = 1000) {
  const corpo = Buffer.alloc(2);
  corpo.writeUInt16BE(codigo, 0);
  return Buffer.concat([Buffer.from([0x88, 2]), corpo]);
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/**
 * Sobe a ponte.
 *
 * O mesmo servidor atende dois pedidos diferentes: o `Upgrade` vira túnel até o
 * adaptador, e o `GET` comum serve o painel do disco. O segundo existe para o
 * caso de o navegador recusar `ws://` vindo de uma página `https` — servindo o
 * painel daqui, tudo fica em `http://localhost`, que é contexto seguro e
 * permite WebSocket sem criptografia.
 */
export function subirPonte({
  porta = PORTA_PADRAO,
  obd = OBD_PADRAO,
  origens = ORIGENS_PADRAO,
  raiz = null,
  todas = false,
  registrar = console.log,
} = {}) {
  const servidor = http.createServer((pedido, resposta) => {
    if (!raiz) {
      resposta.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      resposta.end(`ponte de pé · adaptador ${obd.servidor}:${obd.porta}\n`);
      return;
    }
    const caminho = decodeURIComponent(new URL(pedido.url, 'http://x').pathname);
    const alvo = path.join(raiz, caminho.endsWith('/') ? `${caminho}index.html` : caminho);
    // Nunca servir fora da raiz: `../../etc/passwd` é o pedido mais velho do
    // mundo, e a ponte roda numa rede que não é a sua.
    if (!path.resolve(alvo).startsWith(path.resolve(raiz))) {
      resposta.writeHead(403).end('fora da raiz');
      return;
    }
    fs.readFile(alvo, (erro, conteudo) => {
      if (erro) {
        resposta.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('não encontrado');
        return;
      }
      resposta.writeHead(200, { 'content-type': TIPOS[path.extname(alvo)] ?? 'application/octet-stream' });
      resposta.end(conteudo);
    });
  });

  servidor.on('upgrade', (pedido, soquete) => {
    const chave = pedido.headers['sec-websocket-key'];
    const origem = pedido.headers.origin;

    if (!chave) {
      soquete.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    if (!origemPermitida(origem, origens)) {
      registrar(`recusada a origem ${origem}`);
      soquete.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }

    soquete.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${chaveDeResposta(chave)}`,
      '', '',
    ].join('\r\n'));

    registrar(`painel conectado (${origem ?? 'sem origem'}) · abrindo ${obd.servidor}:${obd.porta}`);
    const carro = net.createConnection({ host: obd.servidor, port: obd.porta });
    // Sem Nagle: o ELM327 conversa por comandos curtos, e juntar dois comandos
    // num pacote para economizar rede troca resposta em 40 ms por resposta em
    // 200 ms — que num painel é a diferença entre ponteiro e slide-show.
    carro.setNoDelay(true);

    let acumulado = Buffer.alloc(0);
    let vivo = true;

    const encerrar = (motivo) => {
      if (!vivo) return;
      vivo = false;
      registrar(`ponte encerrada: ${motivo}`);
      try { soquete.write(quadroDeFechamento()); } catch { /* já foi */ }
      soquete.destroy();
      carro.destroy();
    };

    carro.on('connect', () => registrar('adaptador respondeu'));
    carro.on('data', (bytes) => {
      if (vivo) soquete.write(montarQuadro(bytes.toString('latin1')));
    });
    carro.on('error', (erro) => encerrar(`adaptador: ${erro.message}`));
    carro.on('close', () => encerrar('adaptador fechou'));

    soquete.on('data', (bytes) => {
      acumulado = Buffer.concat([acumulado, bytes]);
      const { quadros, resto, erro } = lerQuadros(acumulado);
      acumulado = resto;
      if (erro) {
        encerrar(erro);
        return;
      }
      for (const { opcode, corpo } of quadros) {
        if (opcode === 0x8) {
          encerrar('painel fechou');
          return;
        }
        if (opcode === 0x9) {
          soquete.write(Buffer.concat([Buffer.from([0x8a, corpo.length]), corpo]));
          continue;
        }
        if (opcode === 0x1 || opcode === 0x2) carro.write(Buffer.from(corpo.toString('utf8'), 'latin1'));
      }
    });
    soquete.on('error', () => encerrar('painel caiu'));
    soquete.on('close', () => encerrar('painel saiu'));
  });

  servidor.listen(porta, todas ? '0.0.0.0' : '127.0.0.1', () => {
    registrar(`ponte em ws://${todas ? '0.0.0.0' : '127.0.0.1'}:${porta} → ${obd.servidor}:${obd.porta}`);
    if (raiz) registrar(`painel em http://127.0.0.1:${porta}/`);
  });

  return servidor;
}

/* --------------------------------------------------------------- comando */

function lerArgumentos(lista) {
  const opcoes = { porta: PORTA_PADRAO, obd: { ...OBD_PADRAO }, origens: [...ORIGENS_PADRAO], raiz: null, todas: false };
  for (let i = 0; i < lista.length; i += 1) {
    const chave = lista[i];
    const valor = lista[i + 1];
    if (chave === '--porta') { opcoes.porta = Number(valor); i += 1; }
    else if (chave === '--obd') {
      const [servidor, porta] = String(valor).split(':');
      opcoes.obd = { servidor, porta: Number(porta ?? OBD_PADRAO.porta) };
      i += 1;
    } else if (chave === '--origem') { opcoes.origens.push(valor); i += 1; }
    else if (chave === '--servir') {
      // `--servir` sozinho serve o diretório atual. Sem esta conferência,
      // `--servir --todas` tomaria «--todas» como caminho e serviria o nada.
      const temCaminho = valor && !valor.startsWith('--');
      opcoes.raiz = temCaminho ? valor : '.';
      if (temCaminho) i += 1;
    }
    else if (chave === '--todas') opcoes.todas = true;
  }
  return opcoes;
}

if (process.argv[1] && process.argv[1].endsWith('ponte-wifi.mjs')) {
  subirPonte(lerArgumentos(process.argv.slice(2)));
}
