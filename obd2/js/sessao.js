/**
 * A sessão: a conexão viva com o carro, e o laço que a mantém.
 *
 * É o único objeto do aplicativo com estado de verdade. As telas não conversam
 * com o adaptador — elas assinam a sessão e desenham o que ela disser. Trocar
 * de tela não derruba a conexão nem interrompe a gravação, e é isso que permite
 * abrir a lista de falhas no meio de uma viagem sem perder o que já foi gravado.
 *
 * **O laço não tem intervalo fixo, e essa é a decisão central.** Um
 * `setInterval` de 200 ms parece razoável até o adaptador demorar 300 ms para
 * responder: as chamadas se empilham, a fila cresce, e o painel passa a mostrar
 * o carro de dez segundos atrás — sem nunca dar erro. Aqui a volta seguinte só
 * começa quando a anterior termina. O painel anda na velocidade real do
 * adaptador, que num clone BLE é de 4 a 10 leituras por segundo, e o número na
 * tela é sempre o mais novo que existe.
 *
 * **Ritmos.** Perguntar tudo a cada volta gastaria as leituras disponíveis com
 * dados que não mudam. Rotação e velocidade vão em toda volta; carga e tensão a
 * cada cinco; temperatura e nível de tanque a cada vinte e cinco. O resultado é
 * um conta-giros fluido no mesmo adaptador que, perguntando tudo, daria uma
 * leitura por segundo.
 */

import { criarELM327, ErroDoAdaptador } from './obd/elm327.js';
import {
  RITMOS, definicaoDe, conhecidosEntre, DERIVADOS, calcularDerivados, derivadosPossiveis,
} from './obd/pids.js';
import { criarAmostra, instantaneo } from './dominio/viagem.js';
import { alertas } from './dominio/leituras.js';
import { criarGravadorDeVideo, suportado as temVideo, explicarFalha } from './video.js';

/** Quantas falhas seguidas de comunicação derrubam a conexão. */
const LIMITE_DE_FALHAS = 6;

/**
 * O que se guarda como máximo da sessão e do veículo.
 *
 * Velocidade e rotação porque é o que se quer saber depois — «até quanto ele
 * foi» —, turbo porque é o número que interessa em quem tem turbo, e
 * temperatura porque um pico de 112 °C que aconteceu numa subida não aparece em
 * mais lugar nenhum: quando se olha o painel, já baixou.
 */
export const MAXIMOS_ACOMPANHADOS = ['0D', '0C', 'TURBO', '05'];

/** De quanto em quanto tempo os recordes vão para o banco. */
const INTERVALO_DE_GRAVACAO_DE_RECORDE = 10_000;

export const ESTADOS = {
  desligado: 'Desconectado',
  conectando: 'Conectando',
  conectado: 'Conectado',
  erro: 'Falha na conexão',
};

export function criarSessao({ armazenamento }) {
  const assinantes = new Set();

  const estado = {
    situacao: 'desligado',
    detalhe: '',
    transporte: null,
    adaptador: null,
    veiculo: null,
    /** O valor mais recente de cada PID, por PID. */
    valores: {},
    /** Quando cada PID foi lido pela última vez. */
    lidoEm: {},
    pids: [],
    /** Os derivados que este carro alimenta — turbo, hoje. */
    derivados: [],
    luz: null,
    consumo: { litrosPorHora: null, kmPorLitro: null, origem: null, parado: true },
    alertas: [],
    viagem: null,
    gravando: false,
    ultimoErro: null,
    voltas: 0,
    leiturasPorSegundo: 0,
    /** Os máximos desde que se conectou. */
    maximos: {},
    /** Os máximos de sempre deste carro, lidos do banco. */
    recordes: {},
    /** O estado da câmera, quando a viagem está sendo gravada com vídeo. */
    video: { gravando: false, trechos: 0, bytes: 0, erro: null },
  };

  let elm = null;
  let rodando = false;
  let laco = null;
  let travaDeTela = null;
  let configuracao = null;
  let ultimaGravacao = 0;
  let ultimaGravacaoDeRecorde = 0;
  let gravadorDeVideo = null;
  let falhasSeguidas = 0;
  let contagem = { desde: Date.now(), leituras: 0 };

  const avisar = () => {
    for (const assinante of assinantes) {
      try {
        assinante(estado);
      } catch (erro) {
        console.error('assinante da sessão falhou:', erro);
      }
    }
  };

  /**
   * Mantém a tela acesa enquanto se dirige.
   *
   * Sem isto o Android apaga a tela em trinta segundos, e apagada a página é
   * congelada: o laço para, a gravação para, e a viagem fica com um buraco que
   * ninguém pediu. A trava cai sozinha quando a aba sai de foco, então ela é
   * pedida de novo quando volta — o navegador não devolve sozinho.
   */
  async function pedirTravaDeTela() {
    if (!configuracao?.manterTelaAcesa) return;
    try {
      travaDeTela = await navigator.wakeLock?.request('screen');
    } catch { /* recusada (bateria fraca, aba em segundo plano): segue sem */ }
  }

  async function soltarTravaDeTela() {
    try {
      await travaDeTela?.release();
    } catch { /* já solta */ }
    travaDeTela = null;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && estado.gravando && !travaDeTela) pedirTravaDeTela();
    });
  }

  /**
   * Os PIDs que valem perguntar: os que este carro tem e este aplicativo entende.
   *
   * Um derivado escolhido no painel não é perguntado — não existe comando para
   * «pressão de turbo». O que entra no plano são os PIDs de que ele precisa;
   * sem essa tradução, marcar Turbo no painel faria o aplicativo perguntar
   * `01TURBO` ao carro, e o adaptador responderia `?` para sempre.
   */
  function planoDeLeitura() {
    const doPainel = configuracao?.painel ?? [];
    const necessarios = new Set(['0C', '0D', '10', '5E', '05', '42']);

    for (const escolhido of doPainel) {
      const derivado = DERIVADOS[escolhido];
      if (derivado) for (const pid of derivado.precisa) necessarios.add(pid);
      else necessarios.add(escolhido);
    }
    // O turbo é acompanhado como máximo mesmo sem estar no painel, e para isso
    // precisa da pressão do coletor.
    if (estado.derivados.includes('TURBO')) for (const pid of DERIVADOS.TURBO.precisa) necessarios.add(pid);

    return estado.pids.filter((pid) => necessarios.has(pid));
  }

  /**
   * Atualiza os máximos, e diz se algum subiu.
   *
   * O máximo é o maior valor **observado**, não o maior que o carro atingiu: um
   * clone entrega de 4 a 10 leituras por segundo, e o pico de uma arrancada pode
   * cair entre duas delas. A diferença é de alguns km/h, e a tela diz que é
   * leitura, não medição homologada.
   */
  function anotarMaximos() {
    let mudou = false;
    for (const chave of MAXIMOS_ACOMPANHADOS) {
      const valor = estado.valores[chave];
      if (!Number.isFinite(valor)) continue;
      if (!Number.isFinite(estado.maximos[chave]) || valor > estado.maximos[chave]) {
        estado.maximos[chave] = valor;
        mudou = true;
      }
      if (!Number.isFinite(estado.recordes[chave]) || valor > estado.recordes[chave]) {
        estado.recordes[chave] = valor;
        mudou = true;
      }
    }
    return mudou;
  }

  /** Este PID já «venceu» nesta volta? */
  function venceu(pid, volta) {
    const ritmo = definicaoDe(pid)?.ritmo ?? 'medio';
    return volta % (RITMOS[ritmo] ?? RITMOS.medio) === 0;
  }

  async function umaVolta(plano) {
    for (const pid of plano) {
      if (!rodando) return;
      if (!venceu(pid, estado.voltas)) continue;

      try {
        const leitura = await elm.consultar(pid);
        falhasSeguidas = 0;
        contagem.leituras += 1;
        if (leitura) {
          estado.valores[pid] = leitura.valor;
          estado.lidoEm[pid] = Date.now();
        } else {
          // Respondeu «não tenho»: sai do plano para não gastar a próxima volta
          // perguntando de novo o que o carro já disse que não mede.
          estado.pids = estado.pids.filter((p) => p !== pid);
        }
      } catch (erro) {
        falhasSeguidas += 1;
        estado.ultimoErro = erro.message;
        if (erro instanceof ErroDoAdaptador && erro.grave) throw erro;
        if (falhasSeguidas >= LIMITE_DE_FALHAS) throw erro;
      }
    }
  }

  /** Deriva o que não vem do carro: turbo, consumo, alertas, taxa de leitura. */
  function recalcular() {
    Object.assign(estado.valores, calcularDerivados(estado.valores));

    estado.consumo = instantaneo(estado.valores, {
      combustivel: configuracao?.combustivel,
      cilindrada: configuracao?.cilindrada,
    });
    estado.alertas = alertas(estado.valores, { luzAcesa: estado.luz?.luzAcesa ?? false });

    const decorrido = (Date.now() - contagem.desde) / 1000;
    if (decorrido >= 2) {
      estado.leiturasPorSegundo = contagem.leituras / decorrido;
      contagem = { desde: Date.now(), leituras: 0 };
    }
  }

  async function gravarSePreciso() {
    if (!estado.gravando || !estado.viagem) return;
    const intervalo = configuracao?.intervaloDeGravacao ?? 1000;
    if (Date.now() - ultimaGravacao < intervalo) return;
    ultimaGravacao = Date.now();
    await armazenamento.guardarAmostra(estado.viagem.id, criarAmostra(ultimaGravacao, estado.valores));
  }

  /**
   * Leva os recordes para o banco, de tempos em tempos.
   *
   * Numa arrancada a velocidade máxima sobe a cada leitura — gravar a cada
   * subida abriria dez transações por segundo justamente quando o aplicativo
   * está mais ocupado. De dez em dez segundos basta, e o `desconectar` grava o
   * que faltou: o pior caso é perder o recorde dos últimos dez segundos de uma
   * sessão encerrada à força.
   */
  async function gravarRecordesSePreciso({ agora = false } = {}) {
    if (!estado.veiculo) return;
    if (!agora && Date.now() - ultimaGravacaoDeRecorde < INTERVALO_DE_GRAVACAO_DE_RECORDE) return;
    ultimaGravacaoDeRecorde = Date.now();
    estado.veiculo = await armazenamento.registrarRecordes(estado.veiculo.id, estado.recordes);
  }

  /**
   * Abre a câmera e passa a guardar os trechos na viagem.
   *
   * O teto de espaço é conferido a cada trecho fechado, e não uma vez no
   * começo: 720p gasta perto de 20 MB por minuto, e uma viagem de uma hora
   * passaria de um gigabyte. Parar com aviso é melhor que ser cortado pelo
   * navegador quando a cota estourar — ali o último trecho se perde e a falha
   * aparece como um erro sem nome.
   */
  async function comecarVideo(viagemId) {
    if (!temVideo()) {
      estado.video.erro = 'este navegador não grava vídeo';
      return;
    }

    const limiteEmBytes = (configuracao?.limiteDeVideoMB ?? 1024) * 1024 * 1024;

    gravadorDeVideo = criarGravadorDeVideo({
      aoTrecho: async ({ blob, de, ate, tipo }) => {
        const trecho = await armazenamento.guardarTrechoDeVideo(viagemId, { blob, de, ate, tipo });
        estado.video.trechos += 1;
        estado.video.bytes += trecho.bytes;
        avisar();
        // `false` diz ao gravador para encerrar: o trecho recém-guardado fica.
        return estado.video.bytes < limiteEmBytes;
      },
      aoParar: (motivo) => {
        estado.video.gravando = false;
        estado.video.erro = motivo;
        avisar();
      },
    });

    try {
      await gravadorDeVideo.comecar({
        altura: configuracao?.qualidadeDeVideo ?? 720,
        audio: Boolean(configuracao?.audioNoVideo),
      });
      estado.video.gravando = true;
    } catch (erro) {
      gravadorDeVideo = null;
      estado.video.gravando = false;
      estado.video.erro = explicarFalha(erro);
    }
  }

  async function pararVideo() {
    if (!gravadorDeVideo) return;
    try {
      await gravadorDeVideo.parar();
    } catch { /* câmera já perdida: não há o que fechar */ }
    gravadorDeVideo = null;
    estado.video.gravando = false;
  }

  async function lacoPrincipal() {
    while (rodando) {
      try {
        // Refeito a cada volta porque ele encolhe sozinho: um PID que o carro
        // respondeu «não tenho» sai da lista, e a volta seguinte já não o
        // pergunta. Em carro simples isso tira um terço das consultas.
        await umaVolta(planoDeLeitura());
        estado.voltas += 1;
        recalcular();
        if (anotarMaximos()) await gravarRecordesSePreciso();
        await gravarSePreciso();
        avisar();
      } catch (erro) {
        estado.situacao = 'erro';
        estado.detalhe = erro.message;
        estado.ultimoErro = erro.message;
        rodando = false;
        avisar();
        await sessao.desconectar({ manterEstado: true });
        return;
      }
      // Um respiro por volta: sem ele o laço monopoliza a fila de tarefas e a
      // tela deixa de responder ao toque — o painel fica lindo e travado.
      await new Promise((pronto) => { setTimeout(pronto, 0); });
    }
  }

  const sessao = {
    estado,

    assinar(callback) {
      assinantes.add(callback);
      callback(estado);
      return () => assinantes.delete(callback);
    },

    async recarregarConfiguracao() {
      configuracao = await armazenamento.configuracao();
      return configuracao;
    },

    /**
     * Conecta a um transporte já escolhido e começa a ler.
     *
     * A descoberta do carro (chassi e PIDs) acontece uma vez, aqui, e é
     * guardada: são quinze comandos, e repeti-los a cada reconexão atrasaria em
     * três segundos a volta do painel depois de uma queda de Bluetooth — que
     * acontece num quebra-molas.
     */
    async conectar(transporte, { aoProgredir } = {}) {
      await sessao.desconectar();
      configuracao ??= await armazenamento.configuracao();

      estado.transporte = transporte;
      estado.situacao = 'conectando';
      estado.detalhe = 'abrindo o adaptador';
      estado.ultimoErro = null;
      avisar();

      elm = criarELM327(transporte);
      estado.adaptador = elm;

      transporte.aoDesconectar?.((erro) => {
        rodando = false;
        estado.situacao = 'erro';
        estado.detalhe = erro?.message ?? 'o adaptador se desconectou';
        avisar();
      });

      try {
        const identificacao = await elm.iniciar({
          aoProgredir: (passo) => {
            estado.detalhe = passo;
            aoProgredir?.(passo);
            avisar();
          },
        });

        estado.detalhe = 'perguntando o que o carro mede';
        avisar();
        const suportados = await elm.inventario();
        estado.pids = conhecidosEntre(suportados);
        estado.derivados = derivadosPossiveis(suportados);
        estado.luz = await elm.statusDaLuz();
        const vin = await elm.vin();

        estado.veiculo = await armazenamento.guardarVeiculo({
          vin,
          pids: suportados,
          adaptador: `ELM327 v${identificacao.versao}`,
          protocolo: identificacao.protocolo.nome,
        });

        /*
         * Os recordes começam onde o carro parou da última vez.
         *
         * Sem isto, «velocidade máxima» seria a máxima desta conexão — e uma
         * queda de Bluetooth num quebra-molas zeraria o número que a pessoa
         * queria justamente guardar. Os máximos da sessão continuam separados,
         * e esses sim recomeçam a cada conexão.
         */
        estado.recordes = { ...(estado.veiculo.recordes ?? {}) };
        estado.maximos = {};

        estado.situacao = 'conectado';
        estado.detalhe = '';
        falhasSeguidas = 0;
        contagem = { desde: Date.now(), leituras: 0 };
        avisar();

        rodando = true;
        laco = lacoPrincipal();
        return estado.veiculo;
      } catch (erro) {
        estado.situacao = 'erro';
        estado.detalhe = erro.message;
        estado.ultimoErro = erro.message;
        avisar();
        await sessao.desconectar({ manterEstado: true });
        throw erro;
      }
    },

    async desconectar({ manterEstado = false } = {}) {
      rodando = false;
      await laco?.catch(() => {});
      laco = null;

      // O que ainda não foi para o banco vai agora: é a última chance antes de
      // a sessão acabar.
      await gravarRecordesSePreciso({ agora: true }).catch(() => {});
      if (estado.gravando) await sessao.pararGravacao();
      await elm?.fechar();
      elm = null;

      if (!manterEstado) {
        estado.situacao = 'desligado';
        estado.detalhe = '';
        estado.valores = {};
        estado.lidoEm = {};
        estado.pids = [];
        estado.derivados = [];
        estado.luz = null;
      }
      estado.adaptador = null;
      estado.transporte = null;
      avisar();
    },

    /** Relê as falhas sem derrubar o painel: a fila de comandos cuida da ordem. */
    async lerFalhas() {
      if (!elm) throw new Error('sem adaptador conectado');
      const falhas = await elm.falhas();
      estado.luz = falhas.luz ?? estado.luz;
      avisar();
      return falhas;
    },

    async apagarFalhas() {
      if (!elm) throw new Error('sem adaptador conectado');
      await elm.apagarFalhas();
      estado.luz = await elm.statusDaLuz();
      avisar();
    },

    /**
     * Começa a gravar a viagem, com ou sem vídeo.
     *
     * **A câmera nunca impede a gravação dos dados.** Se a permissão for negada,
     * se a câmera estiver ocupada por outro aplicativo, se o navegador não
     * gravar vídeo — a viagem é gravada do mesmo jeito, e o motivo fica em
     * `estado.video.erro` para a tela mostrar. Perder a viagem inteira porque a
     * câmera falhou seria trocar o principal pelo acessório.
     */
    async comecarGravacao({ comVideo = false } = {}) {
      if (estado.gravando) return estado.viagem;
      estado.viagem = await armazenamento.comecarViagem({ veiculo: estado.veiculo?.id ?? null });
      estado.gravando = true;
      ultimaGravacao = 0;
      estado.video = { gravando: false, trechos: 0, bytes: 0, erro: null };
      await pedirTravaDeTela();

      if (comVideo) await comecarVideo(estado.viagem.id);
      avisar();
      return estado.viagem;
    },

    async pararGravacao() {
      if (!estado.gravando || !estado.viagem) return null;
      const id = estado.viagem.id;
      estado.gravando = false;

      // O vídeo para antes de a viagem ser encerrada: o trecho em curso ainda
      // pertence a ela, e fechá-lo depois o deixaria órfão.
      await pararVideo();
      await soltarTravaDeTela();

      const encerrada = await armazenamento.encerrarViagem(id, {
        combustivel: configuracao?.combustivel,
        cilindrada: configuracao?.cilindrada,
      });
      estado.viagem = null;
      avisar();
      return encerrada;
    },

    /** O fluxo da câmera, para a tela mostrar a prévia. Nulo sem gravação. */
    fluxoDeVideo: () => gravadorDeVideo?.fluxo ?? null,

    videoDisponivel: () => temVideo(),
  };

  return sessao;
}
