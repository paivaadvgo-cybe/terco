/**
 * Transporte por Bluetooth de baixa energia (BLE), via Web Bluetooth.
 *
 * **É o único Bluetooth que um navegador alcança**, e esse é o fato que decide
 * qual adaptador comprar. Os ELM327 azuis de vinte reais são Bluetooth
 * *clássico* (perfil SPP), e nenhum navegador — em nenhum sistema — abre uma
 * porta serial clássica: é uma decisão de segurança das plataformas, não uma
 * falta que dê para contornar com biblioteca. Adaptador Wi-Fi também não serve,
 * porque fala TCP cru, e uma página https não abre soquete TCP nem conteúdo
 * sem criptografia. Sobra o BLE 4.0, que custa pouco mais e funciona.
 *
 * O adaptador BLE não tem serviço padronizado: cada fabricante de clone
 * escolheu o seu. Em vez de uma lista de modelos que envelhece, aqui se procura
 * pela *forma* — um serviço que tenha uma característica que notifica e uma que
 * escreve. É serial sobre GATT, e serial sobre GATT tem sempre essa cara.
 *
 * O que não dá para adivinhar é a lista de serviços a pedir permissão: o
 * navegador só entrega os serviços declarados antes de conectar. Por isso a
 * lista de UUIDs conhecidos existe — ela não escolhe o serviço, só destranca a
 * porta para que a procura possa acontecer.
 */

/**
 * Os serviços usados pelos clones ELM327 BLE que existem no mercado.
 *
 * `FFE0` e `FFF0` cobrem a maioria (módulos HM-10 e derivados). `18F0` aparece
 * nos Vgate iCar. O UUID longo é dos LELink. Pedir todos de uma vez não custa
 * nada: o navegador só concede os que o aparelho tiver.
 */
export const SERVICOS_CONHECIDOS = [
  0xfff0,
  0xffe0,
  0xffe5,
  0x18f0,
  0xfd00,
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '00000001-0000-1000-8000-00805f9b34fb',
];

/** Nomes que os adaptadores costumam anunciar. Serve para filtrar a lista. */
const NOMES_COMUNS = ['OBD', 'OBDII', 'ELM', 'IOS-Vlink', 'Vgate', 'VEEPEAK', 'vLinker', 'V-LINK', 'Konnwei', 'LELink'];

export function suportado() {
  return typeof navigator !== 'undefined' && Boolean(navigator.bluetooth);
}

/**
 * Abre a lista de aparelhos do sistema.
 *
 * Tem de ser chamada de dentro de um toque — o navegador exige gesto humano
 * para abrir o seletor, e chamá-la de um `setTimeout` falha com um erro que não
 * explica nada.
 *
 * `todos` troca o filtro por «mostrar tudo que estiver por perto». A lista fica
 * cheia de fones e relógios, mas é a saída para o adaptador que anuncia um nome
 * esquisito e um serviço fora da lista — e esse caso existe.
 */
export function escolherDispositivo({ todos = false } = {}) {
  if (!suportado()) throw new Error('este navegador não tem Web Bluetooth');

  const opcoes = todos
    ? { acceptAllDevices: true, optionalServices: SERVICOS_CONHECIDOS }
    : {
      filters: [
        ...SERVICOS_CONHECIDOS.map((servico) => ({ services: [servico] })),
        ...NOMES_COMUNS.map((prefixo) => ({ namePrefix: prefixo })),
      ],
      optionalServices: SERVICOS_CONHECIDOS,
    };

  return navigator.bluetooth.requestDevice(opcoes);
}

/**
 * Aparelhos já autorizados antes, para reconectar sem abrir a lista de novo.
 *
 * Nem todo navegador tem `getDevices` — e onde não tem, o preço é um toque a
 * mais, não uma falha. Daí o `catch` silencioso.
 */
export async function dispositivosConhecidos() {
  try {
    return await navigator.bluetooth.getDevices();
  } catch {
    return [];
  }
}

/**
 * Procura, entre os serviços concedidos, o par que forma uma porta serial.
 *
 * Uma característica que notifica (por onde o adaptador fala) e uma que escreve
 * (por onde se fala com ele). Em muitos módulos é a mesma característica para
 * as duas coisas — o HM-10 é assim —, e por isso a escrita é procurada no mesmo
 * serviço da notificação, e não no aparelho inteiro.
 */
async function acharPorta(servidor) {
  const servicos = await servidor.getPrimaryServices();

  for (const servico of servicos) {
    let caracteristicas;
    try {
      caracteristicas = await servico.getCharacteristics();
    } catch {
      continue;
    }

    const leitura = caracteristicas.find((c) => c.properties.notify || c.properties.indicate);
    const escrita = caracteristicas.find((c) => c.properties.writeWithoutResponse)
      ?? caracteristicas.find((c) => c.properties.write);

    if (leitura && escrita) return { servico, leitura, escrita };
  }
  return null;
}

export function criarTransporteBLE(dispositivo) {
  const decodificador = new TextDecoder();
  let porta = null;
  let receber = () => {};
  let aoCair = () => {};

  const transporte = {
    nome: 'ble',
    rotulo: dispositivo.name ? `${dispositivo.name} (Bluetooth)` : 'Adaptador Bluetooth',
    simulado: false,
    conectado: false,
    dispositivo,

    async abrir() {
      const servidor = await dispositivo.gatt.connect();

      /*
       * Uma segunda tentativa, e não por superstição.
       *
       * No Android é comum a descoberta de serviços terminar antes do aparelho
       * ter publicado todos: `getPrimaryServices` devolve lista curta ou vazia
       * na primeira chamada, e completa meio segundo depois. Falhar ali manda
       * para a tela «adaptador incompatível» um adaptador que funciona — e a
       * pessoa devolve o produto por causa de uma corrida de temporização.
       */
      porta = await acharPorta(servidor);
      if (!porta) {
        await new Promise((pronto) => { setTimeout(pronto, 600); });
        porta = await acharPorta(servidor);
      }
      if (!porta) {
        throw new Error('este aparelho não expõe uma porta serial — provavelmente não é um ELM327 BLE');
      }

      porta.leitura.addEventListener('characteristicvaluechanged', (evento) => {
        receber(decodificador.decode(evento.target.value));
      });
      await porta.leitura.startNotifications();

      dispositivo.addEventListener('gattserverdisconnected', () => {
        transporte.conectado = false;
        aoCair(new Error('o adaptador se desconectou'));
      }, { once: true });

      transporte.conectado = true;
    },

    aoReceber(callback) { receber = callback; },
    aoDesconectar(callback) { aoCair = callback; },

    /**
     * Escreve o comando, em pedaços de vinte bytes.
     *
     * O BLE padrão carrega vinte bytes úteis por pacote. Um comando de OBD não
     * chega perto disso, mas o corte fica aqui de qualquer forma: a alternativa
     * é descobrir o limite no dia em que alguém mandar um comando `AT` longo, e
     * a falha aparece como silêncio, não como erro.
     *
     * Escrita sem resposta quando o módulo aceita — o HM-10 é bem mais rápido
     * assim, e num painel a diferença aparece.
     */
    async enviar(texto) {
      if (!porta) throw new Error('adaptador não está aberto');
      const bytes = new TextEncoder().encode(texto);
      for (let i = 0; i < bytes.length; i += 20) {
        const pedaco = bytes.slice(i, i + 20);
        if (porta.escrita.properties.writeWithoutResponse) {
          await porta.escrita.writeValueWithoutResponse(pedaco);
        } else {
          await porta.escrita.writeValue(pedaco);
        }
      }
    },

    async fechar() {
      transporte.conectado = false;
      try {
        await porta?.leitura.stopNotifications();
      } catch { /* característica já morta com o aparelho desligado */ }
      if (dispositivo.gatt.connected) dispositivo.gatt.disconnect();
      porta = null;
    },
  };

  return transporte;
}
