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
import { RITMOS, definicaoDe, conhecidosEntre } from './obd/pids.js';
import { criarAmostra, instantaneo } from './dominio/viagem.js';
import { alertas } from './dominio/leituras.js';

/** Quantas falhas seguidas de comunicação derrubam a conexão. */
const LIMITE_DE_FALHAS = 6;

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
    luz: null,
    consumo: { litrosPorHora: null, kmPorLitro: null, origem: null, parado: true },
    alertas: [],
    viagem: null,
    gravando: false,
    ultimoErro: null,
    voltas: 0,
    leiturasPorSegundo: 0,
  };

  let elm = null;
  let rodando = false;
  let laco = null;
  let travaDeTela = null;
  let configuracao = null;
  let ultimaGravacao = 0;
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

  /** Os PIDs que valem perguntar: os que este carro tem e este aplicativo entende. */
  function planoDeLeitura() {
    const doPainel = configuracao?.painel ?? [];
    const necessarios = new Set([...doPainel, '0C', '0D', '10', '5E', '05', '42']);
    return estado.pids.filter((pid) => necessarios.has(pid) || doPainel.includes(pid));
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

  /** Deriva o que não vem do carro: consumo, alertas, taxa de leitura. */
  function recalcular() {
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

  async function lacoPrincipal() {
    while (rodando) {
      try {
        // Refeito a cada volta porque ele encolhe sozinho: um PID que o carro
        // respondeu «não tenho» sai da lista, e a volta seguinte já não o
        // pergunta. Em carro simples isso tira um terço das consultas.
        await umaVolta(planoDeLeitura());
        estado.voltas += 1;
        recalcular();
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
        estado.luz = await elm.statusDaLuz();
        const vin = await elm.vin();

        estado.veiculo = await armazenamento.guardarVeiculo({
          vin,
          pids: suportados,
          adaptador: `ELM327 v${identificacao.versao}`,
          protocolo: identificacao.protocolo.nome,
        });

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

      if (estado.gravando) await sessao.pararGravacao();
      await elm?.fechar();
      elm = null;

      if (!manterEstado) {
        estado.situacao = 'desligado';
        estado.detalhe = '';
        estado.valores = {};
        estado.lidoEm = {};
        estado.pids = [];
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

    async comecarGravacao() {
      if (estado.gravando) return estado.viagem;
      estado.viagem = await armazenamento.comecarViagem({ veiculo: estado.veiculo?.id ?? null });
      estado.gravando = true;
      ultimaGravacao = 0;
      await pedirTravaDeTela();
      avisar();
      return estado.viagem;
    },

    async pararGravacao() {
      if (!estado.gravando || !estado.viagem) return null;
      const id = estado.viagem.id;
      estado.gravando = false;
      await soltarTravaDeTela();
      const encerrada = await armazenamento.encerrarViagem(id, {
        combustivel: configuracao?.combustivel,
        cilindrada: configuracao?.cilindrada,
      });
      estado.viagem = null;
      avisar();
      return encerrada;
    },
  };

  return sessao;
}
