/**
 * O aplicativo: abre o banco, monta a casca e troca de tela.
 *
 * Ordem de abertura, e ela importa: banco primeiro, tema em seguida, tela
 * depois. O tema antes da tela evita o clarão branco de meio segundo em quem
 * escolheu o modo escuro, e o banco antes de tudo porque toda tela começa
 * lendo alguma coisa.
 *
 * **Se o IndexedDB não abrir**, o aplicativo não mostra tela de erro: cai para
 * o armazenamento em memória e avisa, uma vez, que os dados não vão sobreviver
 * ao fechamento. Janela anônima e armazenamento bloqueado são os casos comuns,
 * e nos dois o carro que está no pátio continua precisando ser registrado.
 */

import { criarDriverIndexedDB, disponivel as temIndexedDB } from './armazenamento/indexeddb.js';
import { criarDriverEmMemoria } from './armazenamento/memoria.js';
import { criarArmazenamento } from './armazenamento/storage.js';
import { lerRota, montarBarra, acenderAba } from './ui/navegacao.js';
import { avisar, pedirPin } from './ui/avisos.js';
import { abrirDetalhe } from './ui/detalhe-lavagem.js';
import { telaInicio } from './ui/telas/inicio.js';
import { telaNovaLavagem } from './ui/telas/nova-lavagem.js';
import { telaLavagens } from './ui/telas/lavagens.js';
import { telaPendentes } from './ui/telas/pendentes.js';
import { telaCaixa } from './ui/telas/caixa.js';
import { telaDespesas } from './ui/telas/despesas.js';
import { telaFechamento } from './ui/telas/fechamento.js';
import { telaRelatorios } from './ui/telas/relatorios.js';
import { telaConfiguracoes } from './ui/telas/configuracoes.js';

const TELAS = {
  inicio: telaInicio,
  nova: telaNovaLavagem,
  lavagens: telaLavagens,
  pendentes: telaPendentes,
  caixa: telaCaixa,
  despesas: telaDespesas,
  fechamento: telaFechamento,
  relatorios: telaRelatorios,
  config: telaConfiguracoes,
};

const TITULOS = {
  inicio: 'Lava-Rápido Lite',
  nova: 'Nova lavagem',
  lavagens: 'Lavagens',
  pendentes: 'Pendentes',
  caixa: 'Caixa',
  despesas: 'Despesas',
  fechamento: 'Fechamento',
  relatorios: 'Relatórios',
  config: 'Ajustes',
};

/** Quanto tempo um PIN conferido continua valendo. */
const VALIDADE_DA_AUTORIZACAO = 5 * 60 * 1000;

async function abrirArmazenamento() {
  if (temIndexedDB()) {
    try {
      return await criarArmazenamento(await criarDriverIndexedDB());
    } catch (erro) {
      console.warn('IndexedDB indisponível, seguindo em memória:', erro);
    }
  }
  const memoria = await criarArmazenamento(criarDriverEmMemoria());
  avisar('Este navegador não permite guardar dados. O aplicativo funciona, mas o movimento some ao fechar.', 'erro', 8000);
  return memoria;
}

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema === 'claro' || tema === 'escuro' ? tema : 'auto';
}

async function iniciar() {
  const armazenamento = await abrirArmazenamento();
  const conteudo = document.getElementById('conteudo');
  const tituloDoTopo = document.getElementById('titulo');

  aplicarTema((await armazenamento.configuracao()).tema);

  let autorizadoAte = 0;

  const contexto = {
    armazenamento,
    aplicarTema,

    /**
     * Vai para uma rota.
     *
     * Quando o endereço é o mesmo — tocar «Início» já estando no início — o
     * navegador não dispara `hashchange`, e sem o desenho explícito a tela
     * ficaria congelada com dados velhos. Quando muda, o desenho vem do evento:
     * fazer os dois sempre desenharia duas vezes a cada toque.
     */
    ir(destino) {
      const alvo = `#/${destino}`;
      if (location.hash === alvo) desenhar();
      else location.hash = alvo;
    },

    recarregar: () => desenhar(),

    abrirLavagem: (lavagem) => abrirDetalhe(contexto, lavagem),

    /**
     * Pede o PIN, quando há PIN, e lembra por alguns minutos.
     *
     * Sem a lembrança, editar a tabela de preços — vinte e cinco células —
     * pediria o PIN vinte e cinco vezes, e a tranca viraria motivo para
     * desligar a tranca.
     */
    async autorizar(motivo) {
      if (!await armazenamento.temPin()) return true;
      if (Date.now() < autorizadoAte) return true;
      const pin = await pedirPin({ titulo: motivo, texto: 'Digite o PIN administrativo' });
      if (pin === null) return false;
      if (!await armazenamento.conferirPin(pin)) {
        avisar('PIN incorreto', 'erro');
        return false;
      }
      autorizadoAte = Date.now() + VALIDADE_DA_AUTORIZACAO;
      return true;
    },
  };

  const barra = montarBarra((rota) => contexto.ir(rota));
  document.body.append(barra);

  let desenhando = null;
  async function desenhar() {
    const { rota, parametros } = lerRota();
    const tela = TELAS[rota] ?? telaInicio;
    tituloDoTopo.textContent = TITULOS[rota] ?? 'Lava-Rápido Lite';
    acenderAba(barra, rota);

    // Duas chamadas quase simultâneas (toque duplo, `hashchange` + `ir`)
    // desenhariam duas telas por cima uma da outra, a última nem sempre a certa.
    const minha = Symbol('desenho');
    desenhando = minha;
    try {
      const no = await tela(contexto, parametros);
      if (desenhando !== minha) return;
      conteudo.replaceChildren(no);
      window.scrollTo({ top: 0 });
    } catch (erro) {
      console.error(erro);
      if (desenhando !== minha) return;
      conteudo.replaceChildren(Object.assign(document.createElement('p'), {
        className: 'erro',
        textContent: `Não foi possível abrir esta tela: ${erro.message}`,
      }));
    }
  }

  window.addEventListener('hashchange', desenhar);
  await desenhar();

  document.body.classList.remove('carregando');
  registrarServiceWorker();
}

/**
 * Registra o service worker, que é o que faz o aplicativo abrir sem internet e
 * poder ser instalado.
 *
 * A atualização não é assumida sozinha: o aplicativo tem dezenas de módulos que
 * se importam entre si, e trocá-los no meio de uma sessão serviria módulos
 * novos a uma página que já carregou os antigos. Em vez disso, avisa — e quem
 * está usando decide quando recarregar, o que nunca é no meio de um atendimento.
 */
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  /*
   * Havia controlador antes de registrar?
   *
   * Na primeiríssima visita não há: o worker instala, chama `clients.claim()` e
   * o navegador dispara `controllerchange` — que não é atualização nenhuma.
   * Recarregar ali fazia a página piscar e recomeçar sozinha logo depois de
   * abrir, sem nada ter mudado. Medido no navegador: primeira abertura do
   * aplicativo, recarga imediata. Só a troca de um controlador por outro é
   * atualização de verdade.
   */
  const tinhaControlador = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.register('sw.js').then((registro) => {
    /*
     * O aviso depende de `tinhaControlador`, e não do controlador de agora.
     *
     * Na primeira visita o worker instala e chama `clients.claim()`. Entre o
     * estado «instalado» e a execução deste retorno, o claim já pode ter
     * acontecido — e o aplicativo anunciava «há uma versão nova» para quem
     * tinha acabado de abri-lo pela primeira vez. A corrida é intermitente, que
     * é o pior tipo: apareceu em uma captura de tela e não na seguinte. Só faz
     * sentido avisar de versão nova quando havia uma versão velha no comando.
     */
    const vigiar = (trabalhador) => {
      if (!trabalhador) return;
      trabalhador.addEventListener('statechange', () => {
        if (trabalhador.state === 'installed' && tinhaControlador) mostrarAtualizacao(trabalhador);
      });
    };
    if (registro.waiting && tinhaControlador) mostrarAtualizacao(registro.waiting);
    registro.addEventListener('updatefound', () => vigiar(registro.installing));
  }).catch((erro) => console.warn('service worker não registrado:', erro));

  let recarregando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaControlador || recarregando) return;
    recarregando = true;
    location.reload();
  });
}

function mostrarAtualizacao(trabalhador) {
  const aviso = document.getElementById('atualizacao');
  if (!aviso) return;
  aviso.hidden = false;
  aviso.querySelector('button').addEventListener('click', () => {
    trabalhador.postMessage('assumir-controle');
    aviso.hidden = true;
  }, { once: true });
}

iniciar();
