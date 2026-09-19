/**
 * A única porta de entrada dos dados.
 *
 * Nenhuma tela conhece IndexedDB. Elas conhecem «começar viagem», «guardar
 * amostra», «listar viagens», «ajustes». Trocar o driver — por um em memória
 * nos testes, por outra coisa depois — não toca em tela nenhuma.
 *
 * **A gravação de viagem é o caminho quente do aplicativo.** Acontece uma vez
 * por segundo, com o carro andando, enquanto a tela desenha ponteiros. Por isso
 * as amostras são acumuladas em memória e descarregadas em bloco: gravar uma a
 * uma abriria uma transação por segundo por nada. O preço é o último minuto, se
 * o aplicativo for fechado à força — e `encerrarViagem` descarrega o que sobrou
 * justamente para que o caso normal não pague esse preço.
 *
 * **Nada sai daqui.** Não há servidor, conta nem envio. O que o carro conta
 * fica no aparelho de quem dirige, e apagar é apagar.
 */

import { NOME, NOMES, NO_BACKUP, AMOSTRAS_POR_BLOCO } from './esquema.js';
import { criarViagem, resumir } from '../dominio/viagem.js';
import { COMBUSTIVEL_PADRAO } from '../dominio/leituras.js';
import { PADRAO_DO_PAINEL } from '../obd/pids.js';
import {
  LIMITE_DE_PAINEIS, normalizarTodos, painelPadrao, painelDeInstrumentos, converterEscolhaAntiga,
} from '../dominio/painel.js';
import { dia as diaDe } from '../dominio/datas.js';
import { PONTE_PADRAO } from '../obd/transporte-wifi.js';

export const CONFIGURACAO_PADRAO = {
  id: 'app',
  /** Quando este banco nasceu. Ver `configuracao()`: é âncora da avaliação. */
  criadoEm: null,
  tema: 'auto',
  combustivel: COMBUSTIVEL_PADRAO,
  /** Cilindrada em litros, só usada para estimar consumo em carro sem MAF. */
  cilindrada: null,
  /**
   * A escolha antiga: uma lista de PIDs, sem posição nem tamanho.
   *
   * Continua aqui só para ser convertida uma vez em quem já tinha o aplicativo
   * instalado. Depois da conversão quem manda é `paineis`.
   */
  painel: [...PADRAO_DO_PAINEL],
  /** Até cinco disposições salvas, com posição, tamanho e escala de cada item. */
  paineis: null,
  /** Qual delas está em uso. */
  painelAtivo: null,
  /** Intervalo entre amostras gravadas, em milissegundos. */
  intervaloDeGravacao: 1000,
  /** Manter a tela acesa durante a gravação. */
  manterTelaAcesa: true,

  /* ------------------------------------------------------- velocímetro */

  /**
   * De onde vem a velocidade: `obd`, `gps` ou `ambos`.
   *
   * O padrão é `obd` porque é o que funciona sem pedir mais nenhuma permissão
   * e sem gastar bateria de GPS. Quem quiser comparar liga `ambos`, e aí uma
   * fonte fica no ponteiro grande e a outra na linha menor embaixo do número.
   */
  velocimetro: 'obd',
  /** Qual das duas manda no ponteiro quando as duas estão ligadas. */
  velocimetroPrincipal: 'obd',

  /* ------------------------------------------------------------- vídeo */

  /** Gravar vídeo junto com a viagem. Desligado por padrão. */
  gravarVideo: false,
  /** Altura do quadro: 480 ou 720. */
  qualidadeDeVideo: 720,
  /**
   * Gravar o som junto.
   *
   * Desligado por padrão, e a decisão é deliberada: uma câmera apontada para a
   * estrada grava a estrada, mas o microfone grava a conversa de quem está no
   * carro — inclusive de quem não escolheu ser gravado. Ligar é um botão; ligar
   * por omissão seria gravar gente sem querer.
   */
  audioNoVideo: false,
  /** Teto de espaço para vídeo, em megabytes. */
  limiteDeVideoMB: 1024,

  /* -------------------------------------------------------------- Wi-Fi */

  /**
   * Onde a ponte do adaptador Wi-Fi atende.
   *
   * Fica guardado porque quem tem adaptador Wi-Fi vai conectar por ele todo
   * dia, e redigitar `ws://127.0.0.1:8127` a cada viagem, num celular preso ao
   * painel, é o tipo de atrito que faz desistir do aplicativo.
   */
  ponteWifi: PONTE_PADRAO,
};

export function novoId(prefixo = '') {
  const base = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return `${prefixo}${base}`;
}

/**
 * @param {object} driver
 * @param {object} [opcoes]
 * @param {() => number} [opcoes.agora]  o relógio, injetável para os testes da
 *   licença: é `criadoEm` que ancora a avaliação, e sem poder fingir a data de
 *   nascimento do banco não há como testar «apagar o navegador não reinicia a
 *   contagem» sem esperar trinta dias.
 */
export async function criarArmazenamento(driver, { agora = () => Date.now() } = {}) {
  /** O que ainda não foi para o banco, por viagem. */
  const pendentes = new Map();

  const armazenamento = {
    driver,
    persistente: driver.persistente,

    /* ------------------------------------------------------------ ajustes */

    /**
     * A configuração, sempre em forma.
     *
     * Os painéis passam pela normalização a cada leitura, e não só ao gravar: o
     * que está no banco pode ter sido escrito por uma versão anterior, ou por um
     * editor interrompido no meio. Um item com largura zero não aparece, e um
     * fora da grade empurra a linha inteira — conferir na leitura é o que
     * garante que o painel abre, aconteça o que tiver acontecido.
     */
    async configuracao() {
      const guardada = await driver.ler('configuracao', 'app');
      const junta = { ...CONFIGURACAO_PADRAO, ...(guardada ?? {}) };

      /*
       * Quando este banco nasceu.
       *
       * Gravado na primeira leitura e nunca mais tocado. É a segunda âncora da
       * avaliação: limpar o `localStorage` apaga a data de instalação e
       * pareceria recomeçar os trinta dias, mas o banco com as viagens continua
       * aqui e denuncia a data verdadeira. Quem apagar os dois recomeça a
       * contagem e perde as viagens junto — a essa altura não é mais atalho.
       */
      if (!junta.criadoEm) {
        junta.criadoEm = agora();
        await driver.gravar('configuracao', { ...junta, id: 'app' });
      }

      /*
       * De onde sai o painel, em três casos distintos:
       *
       * · Já existe disposição salva: usa-a, conferida.
       * · Existe configuração antiga, sem disposição: converte a escolha de
       *   PIDs em layout, para não perder o que a pessoa já tinha montado.
       * · Não existe configuração nenhuma — primeira abertura: o painel de
       *   fábrica, que é mais completo que a lista antiga.
       */
      const paineis = Array.isArray(junta.paineis) && junta.paineis.length > 0
        ? normalizarTodos(junta.paineis)
        // Instalação nova nasce com dois: o quadro de instrumentos, que é o que
        // se usa dirigindo, e o completo, para quem quer tudo na tela.
        : [guardada
          ? converterEscolhaAntiga(junta.painel)
          : painelDeInstrumentos(), ...(guardada ? [] : [painelPadrao('Completo')])];

      const ativo = paineis.some((p) => p.id === junta.painelAtivo) ? junta.painelAtivo : paineis[0].id;
      return { ...junta, paineis, painelAtivo: ativo };
    },

    /** O painel em uso agora. */
    async painelAtivo() {
      const { paineis, painelAtivo } = await armazenamento.configuracao();
      return paineis.find((p) => p.id === painelAtivo) ?? paineis[0];
    },

    /**
     * Grava as disposições.
     *
     * O corte em cinco acontece aqui, e não só na tela: a tela é uma barreira
     * de conveniência, e o banco é onde a regra precisa valer mesmo que a tela
     * mude ou que alguém importe uma configuração de outro lugar.
     */
    async salvarPaineis(paineis, ativo = null) {
      const emForma = normalizarTodos(paineis).slice(0, LIMITE_DE_PAINEIS);
      const escolhido = emForma.some((p) => p.id === ativo) ? ativo : emForma[0].id;
      return armazenamento.ajustar({ paineis: emForma, painelAtivo: escolhido });
    },

    /** Troca o painel em uso, sem mexer na disposição de nenhum. */
    async usarPainel(id) {
      const { paineis } = await armazenamento.configuracao();
      if (!paineis.some((p) => p.id === id)) return null;
      return armazenamento.ajustar({ painelAtivo: id });
    },

    /** Devolve os painéis ao de fábrica — o botão de socorro do editor. */
    async restaurarPaineis() {
      return armazenamento.ajustar({
        paineis: [painelDeInstrumentos(), painelPadrao('Completo')],
        painelAtivo: null,
      });
    },

    async ajustar(mudancas) {
      const atual = await armazenamento.configuracao();
      const nova = { ...atual, ...mudancas, id: 'app' };
      await driver.gravar('configuracao', nova);
      return nova;
    },

    /* ------------------------------------------------------------ veículo */

    /**
     * O que se sabe do carro conectado.
     *
     * Guardado por chassi quando o carro informa um, e sob `desconhecido`
     * quando não informa — que é o caso de muito carro nacional anterior a
     * 2015. Sem essa distinção, dois carros diferentes sem chassi virariam o
     * mesmo registro, e a lista de PIDs de um apareceria no outro.
     */
    async guardarVeiculo({ vin, pids, adaptador, protocolo }) {
      const id = vin || 'desconhecido';
      const anterior = (await driver.ler('veiculos', id)) ?? {};
      const registro = {
        ...anterior,
        id,
        vin: vin ?? null,
        pids: pids ?? anterior.pids ?? [],
        adaptador: adaptador ?? anterior.adaptador ?? null,
        protocolo: protocolo ?? anterior.protocolo ?? null,
        visto: Date.now(),
      };
      await driver.gravar('veiculos', registro);
      return registro;
    },

    /**
     * Guarda os máximos de sempre de um carro, sem nunca abaixá-los.
     *
     * O merge é por comparação, e não por substituição: a sessão manda o que
     * viu, e se o que está no banco for maior, o que está no banco fica. Sem
     * isso, conectar e desconectar sem andar — o que acontece toda vez que se
     * testa alguma coisa na garagem — sobrescreveria a máxima de 130 km/h pela
     * de 0 km/h daquela sessão parada.
     */
    /** Os carros que este aparelho já conheceu. */
    veiculos: () => driver.listar('veiculos'),

    async registrarRecordes(veiculoId, recordes) {
      const veiculo = (await driver.ler('veiculos', veiculoId)) ?? { id: veiculoId };
      const anteriores = veiculo.recordes ?? {};
      const juntos = { ...anteriores };

      for (const [chave, valor] of Object.entries(recordes ?? {})) {
        if (!Number.isFinite(valor)) continue;
        if (!Number.isFinite(juntos[chave]) || valor > juntos[chave]) juntos[chave] = valor;
      }

      const atualizado = { ...veiculo, recordes: juntos, recordesEm: Date.now() };
      await driver.gravar('veiculos', atualizado);
      return atualizado;
    },

    /** Zera os recordes de um carro — o «apagar» que a tela de ajustes oferece. */
    async zerarRecordes(veiculoId) {
      const veiculo = await driver.ler('veiculos', veiculoId);
      if (!veiculo) return null;
      const zerado = { ...veiculo, recordes: {}, recordesEm: Date.now() };
      await driver.gravar('veiculos', zerado);
      return zerado;
    },

    veiculos: () => driver.listar('veiculos'),
    veiculo: (id) => driver.ler('veiculos', id),

    /* ------------------------------------------------------------ viagens */

    async comecarViagem({ veiculo = null } = {}) {
      const viagem = { ...criarViagem(Date.now(), { veiculo }), dia: diaDe() };
      await driver.gravar('viagens', viagem);
      pendentes.set(viagem.id, []);
      return viagem;
    },

    /**
     * Guarda uma amostra. Descarrega sozinha quando o bloco enche.
     *
     * Devolve a viagem só quando gravou algo no banco — quem chama usa isso
     * para atualizar o contador da tela sem ler o banco a cada segundo.
     */
    async guardarAmostra(viagemId, amostra) {
      const fila = pendentes.get(viagemId) ?? [];
      fila.push(amostra);
      pendentes.set(viagemId, fila);
      if (fila.length >= AMOSTRAS_POR_BLOCO) return armazenamento.descarregar(viagemId);
      return null;
    },

    /** Escreve o que estiver pendente de uma viagem. */
    async descarregar(viagemId) {
      const fila = pendentes.get(viagemId);
      if (!fila || fila.length === 0) return null;
      pendentes.set(viagemId, []);

      const bloco = {
        id: `${viagemId}:${novoId()}`,
        viagem: viagemId,
        de: fila[0].t,
        ate: fila[fila.length - 1].t,
        pontos: fila,
      };
      await driver.gravar('amostras', bloco);

      const viagem = await driver.ler('viagens', viagemId);
      if (!viagem) return bloco;
      const atualizada = { ...viagem, amostras: (viagem.amostras ?? 0) + fila.length, fim: bloco.ate };
      await driver.gravar('viagens', atualizada);
      return bloco;
    },

    /**
     * Fecha a viagem e calcula o resumo de uma vez.
     *
     * O resumo é gravado junto, e não recalculado a cada abertura da lista: são
     * duas mil amostras por viagem, e a lista mostra dez viagens. Recalcular ao
     * abrir é meio segundo de tela parada para chegar sempre ao mesmo número.
     */
    async encerrarViagem(viagemId, opcoes = {}) {
      await armazenamento.descarregar(viagemId);
      pendentes.delete(viagemId);

      const viagem = await driver.ler('viagens', viagemId);
      if (!viagem) return null;

      const amostras = await armazenamento.amostrasDa(viagemId);
      const resumo = resumir(amostras, opcoes);
      const encerrada = { ...viagem, fim: resumo.fim ?? Date.now(), resumo, amostras: amostras.length };
      await driver.gravar('viagens', encerrada);
      return encerrada;
    },

    async viagens() {
      const lista = await driver.listar('viagens');
      return lista.sort((a, b) => b.inicio - a.inicio);
    },

    viagem: (id) => driver.ler('viagens', id),

    /** Todas as amostras de uma viagem, em ordem e já desempacotadas. */
    async amostrasDa(viagemId) {
      const blocos = await driver.listarPor('amostras', 'viagem', viagemId);
      return blocos
        .sort((a, b) => a.de - b.de)
        .flatMap((bloco) => bloco.pontos)
        .sort((a, b) => a.t - b.t);
    },

    async apagarViagem(viagemId) {
      const blocos = await driver.listarPor('amostras', 'viagem', viagemId);
      for (const bloco of blocos) await driver.apagar('amostras', bloco.id);
      // O vídeo sai junto: um trecho órfão ocuparia dezenas de megabytes sem
      // nenhuma tela que o mostrasse ou permitisse apagar.
      for (const trecho of await driver.listarPor('videos', 'viagem', viagemId)) {
        await driver.apagar('videos', trecho.id);
      }
      await driver.apagar('viagens', viagemId);
      pendentes.delete(viagemId);
    },

    /* -------------------------------------------------------------- vídeo */

    /**
     * Guarda um trecho de vídeo com a hora em que ele começou.
     *
     * `de` e `ate` são o que sincroniza a imagem com os dados depois: o
     * gráfico e o vídeo são duas séries no mesmo relógio, e sem o instante de
     * início do trecho não há como dizer que aquele pico de rotação é este
     * pedaço de estrada.
     */
    async guardarTrechoDeVideo(viagemId, { blob, de, ate, tipo }) {
      const trecho = {
        id: `${viagemId}:v${novoId()}`,
        viagem: viagemId,
        de,
        ate,
        tipo: tipo ?? blob.type ?? 'video/webm',
        bytes: blob.size,
        blob,
      };
      await driver.gravar('videos', trecho);
      return trecho;
    },

    /** Os trechos de uma viagem, em ordem de tempo. */
    async videosDa(viagemId) {
      const trechos = await driver.listarPor('videos', 'viagem', viagemId);
      return trechos.sort((a, b) => a.de - b.de);
    },

    /**
     * Quanto espaço o vídeo ocupa, e quanto o navegador ainda concede.
     *
     * `navigator.storage.estimate()` é a única fonte honesta do limite — ele
     * varia com o espaço livre do aparelho, e não é um número fixo. Onde não
     * existe, devolve-se `null` em vez de um palpite: o aplicativo então avisa
     * que não sabe, em vez de prometer um espaço que talvez não exista.
     */
    async ocupacaoDeVideo() {
      const trechos = await driver.listar('videos');
      const bytes = trechos.reduce((total, t) => total + (t.bytes ?? 0), 0);

      let cota = null;
      try {
        const estimativa = await navigator.storage?.estimate?.();
        if (estimativa) {
          cota = { usado: estimativa.usage ?? null, limite: estimativa.quota ?? null };
        }
      } catch { /* sem estimativa: o aplicativo diz que não sabe */ }

      return { trechos: trechos.length, bytes, cota };
    },

    /**
     * Quanto espaço as viagens ocupam, aproximado.
     *
     * Aproximado de propósito: o número exato exigiria medir o banco, e o que a
     * pessoa precisa saber é se são dois megabytes ou duzentos.
     */
    async ocupacao() {
      const viagens = await driver.listar('viagens');
      const amostras = viagens.reduce((total, v) => total + (v.amostras ?? 0), 0);
      return { viagens: viagens.length, amostras, bytes: amostras * 90 };
    },

    /* ------------------------------------------------------------- backup */

    /**
     * Tudo o que não se refaz, num objeto só, pronto para virar JSON.
     *
     * Antes de ler o banco, descarrega o que ainda está em memória: durante
     * uma gravação, o último minuto de amostras só existe na fila, e um backup
     * tirado nesse instante sairia com a viagem em curso incompleta sem que
     * nada avisasse.
     */
    async exportar() {
      for (const viagemId of pendentes.keys()) await armazenamento.descarregar(viagemId);
      const colecoes = {};
      for (const nome of NO_BACKUP) colecoes[nome] = await driver.listar(nome);
      return {
        aplicativo: NOME,
        formato: 1,
        geradoEm: new Date().toISOString(),
        colecoes,
      };
    },

    /**
     * Restaura um backup, substituindo o que existe.
     *
     * Os vídeos não viajam no backup (ver `NO_BACKUP`), mas os que já estão no
     * aparelho não ficam intocados: um trecho cuja viagem não veio no arquivo
     * viraria órfão — dezenas de megabytes sem nenhuma tela que o mostrasse ou
     * permitisse apagar. Os trechos de viagens que continuam existindo ficam.
     */
    async restaurar(backup) {
      if (!backup || backup.aplicativo !== NOME) {
        throw new Error('este arquivo não é um backup do Painel OBD-II');
      }
      for (const nome of NO_BACKUP) {
        const registros = backup.colecoes?.[nome] ?? [];
        if (!Array.isArray(registros)) throw new Error(`o backup está corrompido em «${nome}»`);
      }

      for (const nome of NO_BACKUP) {
        await driver.limpar(nome);
        const registros = backup.colecoes?.[nome] ?? [];
        if (registros.length) await driver.gravarVarios(nome, registros);
      }
      pendentes.clear();

      const viagens = new Set((await driver.listar('viagens')).map((v) => v.id));
      for (const trecho of await driver.listar('videos')) {
        if (!viagens.has(trecho.viagem)) await driver.apagar('videos', trecho.id);
      }

      return Object.fromEntries(NO_BACKUP.map((n) => [n, (backup.colecoes?.[n] ?? []).length]));
    },

    /**
     * Acrescenta viagens vindas de fora, sem apagar o que já existe.
     *
     * É o oposto de `restaurar`, e os dois têm razão de ser. Restaurar
     * substitui — é a mudança de casa, o aparelho novo que chega vazio.
     * Importar soma — é trazer para o celular as viagens que ficaram no
     * notebook, sem perder as do celular.
     *
     * **A repetição é recusada em silêncio, e isso é deliberado.** O arquivo
     * não traz identificador: os que existiam morreram com o banco de origem, e
     * inventar outros aqui faria a mesma viagem importada duas vezes virar duas
     * viagens, com a distância contada em dobro no total do aparelho. Duas
     * gravações distintas não começam e terminam no mesmo instante — começo e
     * fim identificam de forma boa o bastante, e errar para o lado de não
     * duplicar é o lado certo de errar.
     *
     * Devolve o que entrou e o que já estava lá, porque a tela precisa dizer as
     * duas coisas: «12 importadas» sem o «3 já existiam» faz parecer que sumiu
     * gravação.
     */
    async importarViagens(entrada) {
      const existentes = await driver.listar('viagens');
      const conhecidas = new Set(existentes.map((v) => `${v.inicio}|${v.fim}`));

      let importadas = 0;
      let repetidas = 0;
      let amostrasGravadas = 0;

      for (const bruta of entrada ?? []) {
        if (!Number.isFinite(bruta.inicio)) continue;
        const assinatura = `${bruta.inicio}|${bruta.fim}`;
        if (conhecidas.has(assinatura)) { repetidas += 1; continue; }
        conhecidas.add(assinatura);

        const pontos = [...(bruta.amostras ?? [])].sort((a, b) => a.t - b.t);
        const viagem = {
          ...criarViagem(bruta.inicio),
          dia: bruta.dia,
          inicio: bruta.inicio,
          fim: bruta.fim ?? bruta.inicio,
          amostras: pontos.length,
          resumo: bruta.resumo ?? {},
          importada: true,
        };
        await driver.gravar('viagens', viagem);

        // Em blocos, como a gravação ao vivo grava: uma viagem de uma hora num
        // registro só é um objeto de megabytes que o banco lê inteiro para
        // mostrar a lista.
        for (let i = 0; i < pontos.length; i += AMOSTRAS_POR_BLOCO) {
          const fatia = pontos.slice(i, i + AMOSTRAS_POR_BLOCO);
          await driver.gravar('amostras', {
            id: `${viagem.id}:${novoId()}`,
            viagem: viagem.id,
            de: fatia[0].t,
            ate: fatia[fatia.length - 1].t,
            pontos: fatia,
          });
          amostrasGravadas += fatia.length;
        }
        importadas += 1;
      }

      return { importadas, repetidas, amostras: amostrasGravadas };
    },

    async limparTudo() {
      for (const colecao of NOMES) await driver.limpar(colecao);
      pendentes.clear();
    },

    fechar: () => driver.fechar(),
  };

  return armazenamento;
}
