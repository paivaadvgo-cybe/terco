/**
 * A tela de conexão — e, para quem chega de fora, a tela mais importante.
 *
 * Metade das perguntas sobre aplicativos OBD por navegador tem a mesma resposta:
 * o adaptador é do tipo errado. Em vez de esconder isso atrás de uma falha de
 * conexão genérica, esta tela mostra a tabela dos quatro tipos e diz quais dois
 * funcionam, antes de qualquer tentativa. Quem já comprou o errado descobre em
 * dez segundos, e não depois de meia hora tentando parear.
 *
 * A escolha do aparelho **tem de partir de um toque**: tanto o Web Bluetooth
 * quanto o Web Serial exigem gesto humano para abrir o seletor do sistema, e
 * chamá-los de qualquer outro lugar falha com um erro que não explica nada.
 */

import { el, botao, cartao, selecao, campo, entrada, linhaDeValor } from '../elementos.js';
import { avisar, confirmar } from '../avisos.js';
import { diagnostico, TIPOS_DE_ADAPTADOR } from '../../obd/transportes.js';
import { escolherDispositivo, criarTransporteBLE, dispositivosConhecidos } from '../../obd/transporte-ble.js';
import { escolherPorta, criarTransporteSerial, VELOCIDADES } from '../../obd/transporte-serial.js';
import { criarTransporteDemo } from '../../obd/transporte-demo.js';
import { criarTransporteWiFi, problemaNoEndereco, PONTE_PADRAO } from '../../obd/transporte-wifi.js';
import { ESTADOS } from '../../sessao.js';

/**
 * As três respostas da tabela de adaptadores.
 *
 * Eram duas — sim e não — enquanto o Wi-Fi era impossível. Com a ponte ele
 * passou a ser um terceiro caso, e amontoá-lo em qualquer um dos dois mentiria:
 * dizer «funciona» esconde que é preciso subir um programa, e dizer «não»
 * manda a pessoa comprar outro adaptador sem precisar.
 */
const CLASSE_DA_RESPOSTA = { true: 'funciona', false: 'nao-funciona', ponte: 'com-ponte' };
const ETIQUETA_DA_RESPOSTA = { true: 'etiqueta-pago', false: 'etiqueta-cancelado', ponte: 'etiqueta-aberto' };
const ROTULO_DA_RESPOSTA = { true: 'funciona', false: 'não', ponte: 'com a ponte' };

export async function telaConexao(contexto, parametros = {}) {
  const { sessao } = contexto;
  const aparelho = diagnostico();
  const configuracao = await contexto.armazenamento.configuracao();
  const tela = el('div', { classe: 'tela' });

  const situacao = el('p', { classe: 'situacao' });
  const detalhes = el('div', { classe: 'detalhe-linhas' });
  const acoes = el('div', { classe: 'coluna-botoes' });
  tela.append(cartao([situacao, detalhes, acoes]));

  let velocidadeSerial = VELOCIDADES[0];

  /*
   * Adaptadores já autorizados antes.
   *
   * Reconectar a um deles pula o seletor do sistema — que, num carro, é dois
   * toques e alguns segundos de lista carregando. Nem todo navegador expõe essa
   * lista; onde não expõe, ela vem vazia e a tela simplesmente não oferece o
   * atalho, em vez de mostrar um botão que falha.
   */
  const conhecidos = aparelho.ble.disponivel ? await dispositivosConhecidos() : [];

  /* ------------------------------------------------------------- conectar */

  async function conectarCom(criar, nomeDoPasso) {
    try {
      const transporte = await criar();
      if (!transporte) return;
      avisar(`${nomeDoPasso}…`, 'ok', 1600);
      await sessao.conectar(transporte);
      avisar('Conectado ao carro', 'ok');
      contexto.ir('painel');
    } catch (erro) {
      // Desistir do seletor do sistema não é falha: é a pessoa mudando de ideia.
      if (erro?.name === 'NotFoundError') return;
      avisar(erro.message ?? 'não foi possível conectar', 'erro', 6000);
      desenhar();
    }
  }

  const conectarBLE = (todos) => conectarCom(async () => {
    const dispositivo = await escolherDispositivo({ todos });
    return criarTransporteBLE(dispositivo);
  }, 'Abrindo o adaptador Bluetooth');

  const conectarSerial = () => conectarCom(async () => {
    const porta = await escolherPorta();
    return criarTransporteSerial(porta, { velocidade: Number(velocidadeSerial) });
  }, 'Abrindo a porta serial');

  /**
   * Conectar pelo Wi-Fi é conectar **na ponte**, e é ela que fala com o carro.
   *
   * O endereço é guardado antes de tentar, e de propósito: quem digitou certo e
   * esqueceu de subir a ponte não perde o que digitou junto com a falha.
   */
  const conectarWiFi = () => conectarCom(async () => {
    const endereco = campoDaPonte.value.trim() || PONTE_PADRAO;
    const problema = problemaNoEndereco(endereco);
    if (problema) throw new Error(problema);
    await contexto.armazenamento.ajustar({ ponteWifi: endereco });
    return criarTransporteWiFi(endereco);
  }, 'Procurando a ponte');

  const campoDaPonte = entrada({
    value: configuracao.ponteWifi ?? PONTE_PADRAO,
    placeholder: PONTE_PADRAO,
    inputMode: 'url',
    spellcheck: false,
    autocapitalize: 'off',
  });

  const conectarDemo = () => conectarCom(
    async () => criarTransporteDemo(),
    'Ligando o carro simulado',
  );

  /* -------------------------------------------------------------- desenho */

  function desenhar() {
    const estado = sessao.estado;
    situacao.dataset.situacao = estado.situacao;
    situacao.textContent = `${ESTADOS[estado.situacao]}${estado.detalhe ? ` · ${estado.detalhe}` : ''}`;

    detalhes.replaceChildren();
    acoes.replaceChildren();

    if (estado.situacao === 'conectado') {
      const veiculo = estado.veiculo ?? {};
      detalhes.append(
        linhaDeValor('Adaptador', veiculo.adaptador ?? '—'),
        linhaDeValor('Protocolo', veiculo.protocolo ?? '—'),
        linhaDeValor('Chassi (VIN)', veiculo.vin ?? 'não informado por este carro'),
        linhaDeValor('Leituras disponíveis', String(estado.pids.length)),
        linhaDeValor('Conexão', estado.transporte?.rotulo ?? '—'),
      );
      acoes.append(
        botao('Ir para o painel', () => contexto.ir('painel'), { tipo: 'principal', classe: 'largo' }),
        botao('Desconectar', async () => {
          if (estado.gravando && !await confirmar({
            titulo: 'Uma gravação está em andamento',
            texto: 'Desconectar encerra a gravação. O que já foi gravado é mantido.',
            acao: 'Desconectar',
            perigo: true,
          })) return;
          await sessao.desconectar();
          avisar('Desconectado');
        }, { tipo: 'perigo', classe: 'largo' }),
      );
      return;
    }

    if (estado.situacao === 'conectando') {
      acoes.append(el('p', { classe: 'campo-dica', texto: 'Aguarde: a primeira conexão procura o protocolo do carro e pode levar alguns segundos.' }));
      return;
    }

    if (aparelho.ble.disponivel) {
      for (const dispositivo of conhecidos) {
        acoes.append(botao(
          `Reconectar a ${dispositivo.name ?? 'adaptador conhecido'}`,
          () => conectarCom(async () => criarTransporteBLE(dispositivo), 'Reconectando'),
          { tipo: 'principal', classe: 'largo' },
        ));
      }
      acoes.append(
        botao('Procurar adaptador Bluetooth', () => conectarBLE(false), {
          tipo: conhecidos.length ? 'secundario' : 'principal',
          classe: 'largo',
        }),
        botao('Mostrar todos os aparelhos', () => conectarBLE(true), { tipo: 'fantasma', classe: 'largo' }),
      );
    } else {
      acoes.append(el('p', { classe: 'alerta alerta-atencao', texto: `Bluetooth: ${aparelho.ble.motivo}` }));
    }

    if (aparelho.serial.disponivel) {
      const escolha = selecao(
        VELOCIDADES.map((v) => ({ valor: String(v), nome: `${v} bauds` })),
        String(velocidadeSerial),
      );
      escolha.addEventListener('change', () => { velocidadeSerial = escolha.value; });
      acoes.append(
        botao('Conectar por cabo (USB)', conectarSerial, { tipo: 'secundario', classe: 'largo' }),
        campo('Velocidade da porta', escolha, 'O padrão de fábrica do ELM327 é 38400. Velocidade errada não dá erro: dá resposta embaralhada.'),
      );
    }

    if (aparelho.wifi.disponivel) {
      acoes.append(
        botao('Conectar pelo Wi-Fi (ponte)', conectarWiFi, { tipo: 'secundario', classe: 'largo' }),
        campo('Endereço da ponte', campoDaPonte,
          'Aqui vai o endereço da ponte, não o do adaptador. A ponte é quem fala TCP com ele.'),
      );
    }

    acoes.append(botao('Carro simulado', conectarDemo, { tipo: 'fantasma', classe: 'largo' }));
  }

  /* ------------------------------------------------------ tipos e ajuda */

  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Qual adaptador funciona' }),
    el('div', { classe: 'lista' }, TIPOS_DE_ADAPTADOR.map((tipo) => el('div', {
      classe: `item tipo-adaptador ${CLASSE_DA_RESPOSTA[String(tipo.funciona)]}`,
    }, [
      el('div', { classe: 'item-corpo' }, [
        el('span', { classe: 'item-nome', texto: tipo.tipo }),
        el('span', { classe: 'item-detalhe', texto: tipo.nota }),
      ]),
      el('span', {
        classe: `etiqueta ${ETIQUETA_DA_RESPOSTA[String(tipo.funciona)]}`,
        texto: ROTULO_DA_RESPOSTA[String(tipo.funciona)],
      }),
    ]))),
    el('p', { classe: 'campo-dica', texto: 'O conector fica sob o painel, do lado do motorista, em quase todo carro vendido no Brasil a partir de 2010.' }),
  ]));

  /* ---------------------------------------------------------- a ponte */

  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Adaptador Wi-Fi: como funciona' }),
    el('p', {
      classe: 'campo-dica',
      texto: 'O adaptador Wi-Fi fala TCP puro, e navegador nenhum abre soquete TCP — não é falta deste '
        + 'aplicativo, é decisão de segurança das plataformas. O que o navegador abre é WebSocket. A ponte '
        + 'é um programinha que atende WebSocket de um lado e abre o TCP do outro. Ela roda no próprio '
        + 'celular e não precisa de internet.',
    }),
    el('p', {
      classe: 'campo-dica campo-dica-forte',
      texto: 'Os dois primeiros passos precisam de internet, e a rede do adaptador não tem. '
        + 'Faça-os antes de trocar de rede — de casa, do escritório, dos dados móveis.',
    }),
    el('ol', { classe: 'passos' }, [
      el('li', { texto: 'Instale o Termux (pela F-Droid) e, dentro dele: pkg install nodejs' }),
      el('li', { texto: 'Baixe a ponte: curl -O https://paivaadvgo-cybe.github.io/terco/obd2/ferramentas/ponte-wifi.mjs' }),
      el('li', { texto: 'Ligue o adaptador no carro e conecte o celular na rede Wi-Fi dele. Se o Android perguntar se quer manter uma rede sem internet, mantenha.' }),
      el('li', { texto: 'No Termux: node ponte-wifi.mjs --testar — ele procura o adaptador, diz onde achou e escreve o comando certo.' }),
      el('li', { texto: 'Rode o comando que ele indicou, e deixe o Termux aberto.' }),
      el('li', { texto: 'Volte aqui e toque em «Conectar pelo Wi-Fi».' }),
    ]),
    el('p', {
      classe: 'campo-dica',
      texto: 'O endereço do campo acima é sempre o da ponte, nunca o do adaptador — o do adaptador se informa na ponte, '
        + 'com --obd, e o --testar descobre qual é. Se nada responder, desligue os dados móveis: o Android às vezes manda '
        + 'tudo pela operadora quando a Wi-Fi não tem internet. E feche outros aplicativos de OBD: esses clones só aceitam uma conexão por vez.',
    }),
  ]));

  if (aparelho.apple) {
    tela.append(cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Sobre iPhone e iPad' }),
      el('p', {
        classe: 'alerta alerta-atencao',
        texto: 'O Safari não tem Web Bluetooth nem Web Serial, e todos os navegadores do iPhone usam o motor do Safari. Nenhum aplicativo web — este ou outro — conecta a um adaptador OBD no iPhone. O carro simulado funciona, e serve para conhecer o aplicativo.',
      }),
    ]));
  }

  /* ------------------------------------------------------------- registro */

  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Conversa com o adaptador' }),
    el('p', { classe: 'campo-dica', texto: 'O que foi enviado e recebido, para diagnóstico. Só existe enquanto o aplicativo estiver aberto.' }),
    botao('Ver registro', () => contexto.ir('registro'), { tipo: 'fantasma', classe: 'largo' }),
  ]));

  contexto.aoSair(sessao.assinar(desenhar));

  // `#/conexao?demo=1` vem do painel: quem tocou «ver com carro simulado» já
  // disse o que quer, e pedir um segundo toque aqui seria burocracia.
  if (parametros.demo === '1' && sessao.estado.situacao === 'desligado') conectarDemo();

  return tela;
}

/**
 * O registro cru da conversa.
 *
 * Serve para uma coisa só, e é uma coisa que vale a tela: quando um adaptador
 * não funciona, é aqui que se vê se ele respondeu `?` (não entendeu), `NO DATA`
 * (o carro não respondeu) ou nada (não é um ELM327). Sem isso, todo problema
 * vira «não conectou».
 */
export async function telaRegistro(contexto) {
  const { sessao } = contexto;
  const tela = el('div', { classe: 'tela' });
  const linhas = el('div', { classe: 'registro' });

  function desenhar() {
    const entradas = sessao.estado.adaptador?.registro ?? [];
    if (entradas.length === 0) {
      linhas.replaceChildren(el('p', { classe: 'vazio-mensagem', texto: 'Nada ainda. Conecte um adaptador.' }));
      return;
    }
    linhas.replaceChildren(...entradas.slice().reverse().map((entrada) => el('p', {
      classe: `registro-linha registro-${entrada.direcao}`,
      texto: `${entrada.direcao === 'saida' ? '→' : '←'} ${entrada.texto.replace(/\r/g, ' ')}`,
    })));
  }

  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Conversa com o adaptador' }),
    linhas,
    botao('Voltar', () => contexto.ir('conexao'), { tipo: 'fantasma', classe: 'largo' }),
  ]));

  const relogio = setInterval(desenhar, 700);
  contexto.aoSair(() => clearInterval(relogio));
  desenhar();

  return tela;
}
