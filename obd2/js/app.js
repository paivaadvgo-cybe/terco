/**
 * O aplicativo: abre o banco, cria a sessão e troca de tela.
 *
 * Ordem de abertura, e ela importa: banco primeiro, tema em seguida, tela
 * depois. O tema antes da tela evita o clarão branco de meio segundo em quem
 * escolheu o modo escuro — que aqui não é detalhe, porque a tela clara a meio
 * palmo do rosto, dirigindo à noite, ofusca.
 *
 * **A sessão vive fora das telas.** Ela é criada uma vez e sobrevive à troca de
 * aba: abrir a lista de falhas no meio de uma viagem não derruba a conexão nem
 * interrompe a gravação. Em troca, cada tela precisa devolver o que pegou
 * emprestado — assinaturas e cronômetros —, e é para isso que existe o
 * `aoSair`: sem ele, atravessar cinco abas deixaria cinco assinaturas vivas
 * desenhando em elementos que já saíram da tela.
 *
 * **Se o IndexedDB não abrir**, o aplicativo não mostra tela de erro: cai para
 * o armazenamento em memória e avisa, uma vez, que as viagens não vão
 * sobreviver ao fechamento. O painel — que é o que quase todo mundo vem ver —
 * funciona igual.
 */

import { criarDriverIndexedDB, disponivel as temIndexedDB } from './armazenamento/indexeddb.js';
import { criarDriverEmMemoria } from './armazenamento/memoria.js';
import { criarArmazenamento } from './armazenamento/storage.js';
import { criarSessao } from './sessao.js';
import { lerRota, montarBarra, acenderAba, marcarAba } from './ui/navegacao.js';
import { avisar } from './ui/avisos.js';
import { telaPainel } from './ui/telas/painel.js';
import { telaConexao, telaRegistro } from './ui/telas/conexao.js';
import { telaFalhas } from './ui/telas/falhas.js';
import { telaViagens, telaViagem } from './ui/telas/viagens.js';
import { telaAjustes } from './ui/telas/ajustes.js';

const TELAS = {
  painel: telaPainel,
  conexao: telaConexao,
  registro: telaRegistro,
  falhas: telaFalhas,
  viagens: telaViagens,
  viagem: telaViagem,
  ajustes: telaAjustes,
};

const TITULOS = {
  painel: 'Painel',
  conexao: 'Conexão',
  registro: 'Registro',
  falhas: 'Falhas',
  viagens: 'Viagens',
  viagem: 'Viagem',
  ajustes: 'Ajustes',
};

async function abrirArmazenamento() {
  if (temIndexedDB()) {
    try {
      return await criarArmazenamento(await criarDriverIndexedDB());
    } catch (erro) {
      console.warn('IndexedDB indisponível, seguindo em memória:', erro);
    }
  }
  const memoria = await criarArmazenamento(criarDriverEmMemoria());
  avisar('Este navegador não permite guardar dados. O painel funciona, mas as viagens gravadas somem ao fechar.', 'atencao', 8000);
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

  const sessao = criarSessao({ armazenamento });
  await sessao.recarregarConfiguracao();

  /** O que a tela atual precisa devolver quando sair. */
  let limpezas = [];

  const contexto = {
    armazenamento,
    sessao,
    aplicarTema,

    /** Registra algo a desfazer quando esta tela sair (assinatura, cronômetro). */
    aoSair(desfazer) {
      if (typeof desfazer === 'function') limpezas.push(desfazer);
    },

    /**
     * Vai para uma rota.
     *
     * Quando o endereço é o mesmo — tocar «Painel» já estando no painel — o
     * navegador não dispara `hashchange`, e sem o desenho explícito a tela
     * ficaria congelada. Quando muda, o desenho vem do evento: fazer os dois
     * sempre desenharia duas vezes a cada toque.
     */
    ir(destino) {
      const alvo = `#/${destino}`;
      if (location.hash === alvo) desenhar();
      else location.hash = alvo;
    },

    recarregar: () => desenhar(),
  };

  const barra = montarBarra((rota) => contexto.ir(rota));
  document.body.append(barra);

  // A pastilha na aba «Falhas» é o que permite dirigir olhando só a barra: a
  // luz acendeu agora, e não na próxima vez que alguém abrir aquela tela.
  sessao.assinar((estado) => {
    const falhas = estado.luz?.falhas ?? 0;
    marcarAba(barra, 'falhas', estado.luz?.luzAcesa && falhas > 0 ? String(falhas) : '');
  });

  let desenhando = null;
  async function desenhar() {
    const { rota, parametros } = lerRota();
    const tela = TELAS[rota] ?? telaPainel;
    tituloDoTopo.textContent = TITULOS[rota] ?? 'Painel OBD-II';
    acenderAba(barra, rota);

    for (const desfazer of limpezas) {
      try {
        desfazer();
      } catch (erro) {
        console.warn('limpeza de tela falhou:', erro);
      }
    }
    limpezas = [];

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

  /*
   * Fechar a aba com o carro conectado.
   *
   * O adaptador BLE fica com a conexão pendurada até estourar o tempo dele, e a
   * próxima abertura do aplicativo encontra o aparelho ocupado — que aparece
   * como «não foi possível conectar» num adaptador que está funcionando. Soltar
   * na saída custa um evento e evita esse falso defeito.
   */
  window.addEventListener('pagehide', () => {
    sessao.desconectar().catch(() => {});
  });

  document.body.classList.remove('carregando');
  registrarServiceWorker();
}

/**
 * Registra o service worker, que é o que faz o aplicativo abrir sem internet e
 * poder ser instalado.
 *
 * A atualização não é assumida sozinha: o aplicativo tem dezenas de módulos que
 * se importam entre si, e trocá-los no meio de uma sessão serviria módulos
 * novos a uma página que já carregou os antigos. Pior aqui que em outros
 * lugares — recarregar sozinho no meio de uma gravação perderia a viagem. Em
 * vez disso, avisa, e quem está usando decide quando.
 */
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  /*
   * Havia controlador antes de registrar?
   *
   * Na primeiríssima visita não há: o worker instala, chama `clients.claim()` e
   * o navegador dispara `controllerchange` — que não é atualização nenhuma.
   * Recarregar ali faria a página piscar e recomeçar sozinha logo depois de
   * abrir, sem nada ter mudado.
   */
  const tinhaControlador = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.register('sw.js').then((registro) => {
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
