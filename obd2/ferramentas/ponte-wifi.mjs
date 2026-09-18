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
import os from 'node:os';
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

/**
 * As origens que podem falar com o carro sem ser perguntado.
 *
 * A primeira é onde o painel é publicado. A do GitHub Pages fica enquanto o
 * endereço antigo estiver no ar, para quem ainda o tem instalado; sai quando
 * ele for aposentado. Só o subdomínio do painel entra — o do Lava-Rápido, no
 * mesmo domínio, é outra origem e não tem por que falar com o carro.
 */
export const ORIGENS_PADRAO = [
  'https://obd2.lexinteligencia.com',
  'https://paivaadvgo-cybe.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

/** A resposta do aperto de mão: SHA-1 da chave do cliente com o sal, em base64. */
export function chaveDeResposta(chaveDoCliente) {
  return crypto.createHash('sha1').update(chaveDoCliente + SAL).digest('base64');
}

/**
 * O endereço é de rede privada?
 *
 * Esta conferência apareceu por um motivo concreto, numa saída real: um
 * notebook tinha uma interface virtual (driver de mesa de assinatura) com o
 * endereço **público** `54.232.189.113`. Sem esta guarda, o diagnóstico deduzia
 * dali os candidatos `54.232.189.1` e `54.232.189.10` — e saía **batendo em
 * servidores de terceiros na internet** procurando um ELM327. Isso é errado por
 * dois motivos independentes: não tem chance nenhuma de achar o adaptador, que
 * por definição está na rede local; e conexões não solicitadas a máquinas
 * alheias não são coisa que um programa deste tamanho deva fazer sem ninguém
 * pedir.
 *
 * As faixas são as do RFC 1918, mais a de autoconfiguração (169.254), que é
 * onde o aparelho cai quando o adaptador não entrega endereço por DHCP.
 */
export function ehPrivado(endereco) {
  const partes = String(endereco ?? '').split('.').map(Number);
  if (partes.length !== 4 || partes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = partes;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
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

/* ------------------------------------------------------------ diagnóstico */

/**
 * As portas em que os clones ELM327 Wi-Fi atendem.
 *
 * 35000 é a de quase todos. 23 aparece nos que se anunciam como telnet, e 6000
 * em alguns modelos chineses mais antigos.
 */
export const PORTAS_CONHECIDAS = [35000, 23, 6000];

/**
 * Onde o adaptador provavelmente está, deduzido de onde **o celular** está.
 *
 * Esta é a parte que resolve o problema de verdade. O manual diz
 * `192.168.0.10`, mas cada lote de clone escolhe o seu, e descobrir qual é,
 * sentado no carro, sem ferramenta de rede, é onde a maioria desiste.
 *
 * Só que o celular já sabe: ele acabou de receber um endereço por DHCP **dessa
 * rede**. Se ele está em `192.168.4.2`, o adaptador está na mesma faixa — e o
 * que serve DHCP é quase sempre o `.1`. Então em vez de adivinhar, deduz-se da
 * própria interface: `.1` e `.10` de cada rede em que o aparelho está, mais os
 * endereços conhecidos, sem repetir.
 *
 * Interfaces internas (`lo`) ficam de fora: o adaptador não está dentro do
 * celular.
 */
export function enderecosProvaveis(interfaces = os.networkInterfaces()) {
  const candidatos = [];
  const visto = new Set();
  const juntar = (endereco) => {
    if (endereco && !visto.has(endereco)) {
      visto.add(endereco);
      candidatos.push(endereco);
    }
  };

  for (const enderecos of Object.values(interfaces ?? {})) {
    for (const { address, family, internal } of enderecos ?? []) {
      if (internal || (family !== 'IPv4' && family !== 4)) continue;
      // Só rede privada. Ver `ehPrivado` para o porquê — e ele é sério.
      if (!ehPrivado(address)) continue;
      const partes = String(address).split('.');
      if (partes.length !== 4) continue;
      const rede = partes.slice(0, 3).join('.');
      juntar(`${rede}.1`);
      juntar(`${rede}.10`);
    }
  }

  // Os conhecidos entram depois: o deduzido da rede em que o aparelho está
  // agora tem mais chance que o do manual de um lote qualquer.
  juntar(OBD_PADRAO.servidor);
  juntar('192.168.4.1');
  return candidatos.filter((endereco) => endereco !== '127.0.0.1');
}

/**
 * Bate na porta e conta o que respondeu.
 *
 * Três respostas distintas, e a diferença entre elas é o diagnóstico inteiro:
 * ninguém atendeu (endereço errado, ou o celular não está na rede do
 * adaptador); atendeu e ficou calado (alguma coisa está ali, mas não é um
 * ELM327 — ou outro aplicativo está segurando a conexão, que esses clones só
 * aceitam uma); atendeu e se apresentou.
 */
export function testarAdaptador({ servidor, porta, espera = 2500 }) {
  return new Promise((resolver) => {
    const soquete = net.createConnection({ host: servidor, port: porta });
    soquete.setNoDelay(true);
    soquete.setTimeout(espera);

    let recebido = '';
    let respondido = false;
    /*
     * Conectou de verdade, ou só estourou o tempo tentando?
     *
     * A diferença é o diagnóstico inteiro, e eu errei isto na primeira versão:
     * o tempo estourava, e o relatório dizia «atendeu e ficou calado» para um
     * endereço onde **nada** atendia. Num estacionamento isso manda procurar
     * aplicativo concorrente segurando a conexão quando o problema é que o
     * celular não está na rede do adaptador.
     */
    let conectou = false;
    const terminar = (resultado) => {
      if (respondido) return;
      respondido = true;
      soquete.destroy();
      resolver({ servidor, porta, ...resultado });
    };

    soquete.on('connect', () => {
      conectou = true;
      // `ATZ` reinicia e faz o ELM327 se apresentar. Um aparelho que não é
      // ELM327 ou não responde nada deixa isso passar em branco, que é
      // exatamente o que se quer distinguir.
      soquete.write('ATZ\r');
    });
    soquete.on('data', (bytes) => {
      recebido += bytes.toString('latin1');
      if (recebido.includes('>')) {
        const banner = recebido.replace(/[\r\n>]+/g, ' ').trim();
        terminar({ ok: true, banner: banner || '(respondeu, sem texto)' });
      }
    });
    soquete.on('timeout', () => {
      if (!conectou) {
        terminar({ ok: false, erro: 'ninguém atendeu a tempo', atendeu: false });
        return;
      }
      terminar({
        ok: false,
        erro: recebido
          ? 'atendeu, mas não terminou a resposta'
          : 'atendeu e ficou calado — outro aplicativo pode estar segurando a conexão',
        atendeu: true,
      });
    });
    soquete.on('error', (erro) => terminar({ ok: false, erro: erro.code ?? erro.message, atendeu: false }));
  });
}

/**
 * Procura o adaptador e diz o que fazer com o que achou.
 *
 * Existe para separar as duas perguntas que o primeiro teste mistura: «o
 * adaptador está alcançável?» e «o navegador está falando com a ponte?». Sem
 * essa separação, um endereço errado aparece na tela do painel como «a ponte
 * não respondeu», e o tempo vai todo para o lugar errado.
 */
export async function procurarAdaptador({
  candidatos = enderecosProvaveis(),
  portas = PORTAS_CONHECIDAS,
  registrar = console.log,
} = {}) {
  registrar('procurando o adaptador…');
  registrar(`o celular está em: ${enderecosDoAparelho().join(', ') || '(nenhuma rede)'}`);
  registrar('');

  for (const servidor of candidatos) {
    for (const porta of portas) {
      const resultado = await testarAdaptador({ servidor, porta });
      if (resultado.ok) {
        registrar(`✓ ${servidor}:${porta} — ${resultado.banner}`);
        registrar('');
        registrar('É esse. Agora suba a ponte:');
        registrar(`   node ponte-wifi.mjs${servidor === OBD_PADRAO.servidor && porta === OBD_PADRAO.porta ? '' : ` --obd ${servidor}:${porta}`}`);
        return resultado;
      }
      // Só vale contar o que atendeu: uma lista de «recusou» em vinte
      // endereços é ruído, e quem está no carro não quer ler ruído.
      if (resultado.atendeu) registrar(`· ${servidor}:${porta} — ${resultado.erro}`);
    }
  }

  registrar('');
  registrar('Não achei o adaptador. As três causas, em ordem de frequência:');
  registrar('  1. O aparelho não está na rede Wi-Fi do adaptador. Confira na lista de redes.');
  registrar('  2. Os dados móveis estão mandando tudo pela operadora. Desligue-os e tente de novo.');
  registrar('  3. Outro aplicativo de OBD está aberto segurando a conexão — esses clones só aceitam uma.');

  /*
   * A dica que vale por todo o resto do relatório.
   *
   * A rede de um ELM327 Wi-Fi entrega endereço em 192.168.0.x ou 192.168.4.x,
   * praticamente sem exceção. Estar em 10.x ou em 172.x é sinal de rede comum
   * de internet — e dizer isso em uma linha poupa quem está no carro de sair
   * procurando defeito no adaptador quando só falta trocar de rede.
   */
  const pareceDongle = enderecosDoAparelho().some((linha) => /\b192\.168\.(0|4)\./.test(linha));
  if (!pareceDongle) {
    registrar('');
    registrar('E um sinal forte: a rede de um ELM327 Wi-Fi dá endereço 192.168.0.x ou 192.168.4.x.');
    registrar('Nenhuma das suas está nessa faixa — pelo jeito o aparelho continua na rede de internet.');
  }
  return null;
}

/** Os endereços IPv4 que este aparelho tem agora, para o relatório. */
export function enderecosDoAparelho(interfaces = os.networkInterfaces()) {
  const lista = [];
  for (const [nome, enderecos] of Object.entries(interfaces ?? {})) {
    for (const { address, family, internal } of enderecos ?? []) {
      if (internal || (family !== 'IPv4' && family !== 4)) continue;
      lista.push(`${nome} ${address}`);
    }
  }
  return lista;
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
  const argumentos = process.argv.slice(2);
  if (argumentos.includes('--testar')) {
    const opcoes = lerArgumentos(argumentos);
    // Com `--obd`, testa só o que foi pedido: quem já sabe o endereço não quer
    // esperar uma varredura.
    const pediuEndereco = argumentos.includes('--obd');
    const achado = await procurarAdaptador(pediuEndereco
      ? { candidatos: [opcoes.obd.servidor], portas: [opcoes.obd.porta] }
      : {});
    process.exit(achado ? 0 : 1);
  }
  subirPonte(lerArgumentos(argumentos));
}
