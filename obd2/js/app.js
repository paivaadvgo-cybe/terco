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
import { telaEditor } from './ui/telas/editor.js';
import { telaConexao, telaRegistro } from './ui/telas/conexao.js';
import { telaFalhas } from './ui/telas/falhas.js';
import { telaViagens, telaViagem } from './ui/telas/viagens.js';
import { telaAjustes } from './ui/telas/ajustes.js';

const TELAS = {
  painel: telaPainel,
  editor: telaEditor,
  conexao: telaConexao,
  registro: telaRegistro,
  falhas: telaFalhas,
  viagens: telaViagens,
  viagem: telaViagem,
  ajustes: telaAjustes,
};

const TITULOS = {
  painel: 'Painel',
  editor: 'Personalizar painel',
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

/**
 * A altura da janela, medida, numa variável do CSS.
 *
 * O painel e o editor precisam saber exatamente quanto espaço existe, porque se
 * prendem à janela e não rolam. O CSS tem `100dvh` para isso, e no computador
 * ele funciona. **Num celular, não dá para confiar nele.** Com o corpo sem
 * rolagem, a barra de endereço do navegador não se recolhe nunca, e o `dvh`
 * ainda assim conta o espaço que ela ocupa como se estivesse livre — o painel
 * nasce mais alto que a tela e a última fileira de mostradores vai parar
 * embaixo da barra de abas, invisível e inalcançável. Foi o que aconteceu num
 * celular de verdade, depois de o mesmo painel ficar perfeito no notebook.
 *
 * `visualViewport` é a medida do que se vê de fato, e é o que o navegador usa
 * para desenhar. `innerHeight` fica de reserva para quem não a tiver.
 *
 * O ouvinte é passivo e barato: mede um número e escreve uma variável. Roda na
 * virada de tela, quando a barra do navegador aparece ou some, e quando o
 * teclado abre.
 */
function medirJanela() {
  const altura = Math.round(window.visualViewport?.height ?? window.innerHeight);
  if (altura > 0) document.documentElement.style.setProperty('--altura-janela', `${altura}px`);
}

function acompanharJanela() {
  medirJanela();
  window.addEventListener('resize', medirJanela);
  window.addEventListener('orientationchange', medirJanela);
  window.visualViewport?.addEventListener('resize', medirJanela);
}

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema === 'claro' || tema === 'escuro' ? tema : 'auto';
}

async function iniciar() {
  // Antes de qualquer tela: o painel nasce do tamanho da janela, e nascer com
  // a medida errada é nascer com a última fileira fora dela.
  acompanharJanela();

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

  /*
   * Quando trocar de código custa alguma coisa.
   *
   * Quem aplica a atualização é o trecho embutido no `index.html` — ele mora
   * fora dos módulos justamente para não ser servido de um cache antigo. Daqui
   * sai só a resposta que ele não teria como saber sozinho: com o carro
   * conectado, recarregar derruba a conexão; com uma viagem sendo gravada,
   * perde o trecho em curso. Fora isso não custa nada, e a versão nova entra
   * sem pedir licença.
   */
  window.painelOcupado = () => sessao.estado.situacao === 'conectado'
    || sessao.estado.situacao === 'conectando'
    || sessao.estado.gravando;
}

iniciar();
