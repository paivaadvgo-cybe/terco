/**
 * Ajustes.
 *
 * Poucos, e cada um existe porque muda um número na tela:
 *
 * · **Combustível** muda o consumo em mais de 30% num carro flex — a proporção
 *   ar/combustível do etanol é bem diferente da gasolina, e o aplicativo não
 *   tem como adivinhar o que está no tanque.
 * · **Cilindrada** só é usada em carro sem sensor de fluxo de ar, para deduzir
 *   o consumo pela pressão do coletor. Sem ela, esse carro simplesmente não
 *   mostra consumo — o que é melhor que mostrar um número inventado.
 * · **Intervalo de gravação** troca detalhe por espaço, e é a diferença entre
 *   uma viagem de meia hora ocupar meio megabyte ou cinco.
 */

import { el, botao, cartao, campo, selecao, entrada, linhaDeValor } from '../elementos.js';
import { avisar, confirmar } from '../avisos.js';
import { COMBUSTIVEIS } from '../../dominio/leituras.js';
import { definicaoDe } from '../../obd/pids.js';
import { LIMITE_DE_PAINEIS } from '../../dominio/painel.js';
import { MAXIMOS_ACOMPANHADOS } from '../../sessao.js';
import { numero, valorDePid, unidadeDePid } from '../formatar.js';
import { baixar, lerViagensDeCSV } from '../csv.js';
import { dia as diaDe } from '../../dominio/datas.js';

const INTERVALOS = [
  { valor: '500', nome: '2 por segundo — detalhe fino' },
  { valor: '1000', nome: '1 por segundo — recomendado' },
  { valor: '2000', nome: '1 a cada 2 segundos' },
  { valor: '5000', nome: '1 a cada 5 segundos — viagens longas' },
];

export async function telaAjustes(contexto) {
  const { armazenamento, sessao } = contexto;
  const configuracao = await armazenamento.configuracao();
  const tela = el('div', { classe: 'tela' });

  const salvar = async (mudancas) => {
    await armazenamento.ajustar(mudancas);
    await sessao.recarregarConfiguracao();
  };

  /* ---------------------------------------------------------------- carro */

  const combustivel = selecao(
    Object.entries(COMBUSTIVEIS).map(([chave, tipo]) => ({ valor: chave, nome: tipo.nome })),
    configuracao.combustivel,
  );
  combustivel.addEventListener('change', async () => {
    await salvar({ combustivel: combustivel.value });
    avisar('Combustível atualizado');
  });

  const cilindrada = entrada({
    type: 'number',
    inputmode: 'decimal',
    step: '0.1',
    min: '0.5',
    max: '8',
    value: configuracao.cilindrada ?? '',
    placeholder: 'ex.: 1.6',
  });
  cilindrada.addEventListener('change', async () => {
    const valor = Number.parseFloat(cilindrada.value.replace(',', '.'));
    await salvar({ cilindrada: Number.isFinite(valor) && valor > 0 ? valor : null });
    avisar('Cilindrada atualizada');
  });

  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'O carro' }),
    campo('Combustível no tanque', combustivel,
      'Num carro flex, escolher errado erra o consumo em mais de 30% — e para um lado que parece plausível.'),
    campo('Cilindrada (litros)', cilindrada,
      'Só usada quando o carro não tem sensor de fluxo de ar. Em branco, esse carro não mostra consumo em vez de mostrar um número duvidoso.'),
  ]));

  /* --------------------------------------------------------------- painel */

  /*
   * Aqui só se escolhe qual painel usar e se entra no editor.
   *
   * A disposição não se monta numa lista de caixinhas: ela se monta arrastando,
   * vendo o resultado. Duplicar a escolha em dois lugares criaria duas verdades
   * sobre o mesmo painel, e um dia elas discordariam.
   */
  const listaDePaineis = el('div', { classe: 'escolhas' }, configuracao.paineis.map((painel) => el('button', {
    type: 'button',
    classe: `escolha ${painel.id === configuracao.painelAtivo ? 'marcada' : ''}`.trim(),
    aoTocar: async () => {
      await armazenamento.usarPainel(painel.id);
      await sessao.recarregarConfiguracao();
      avisar(`Usando «${painel.nome}»`);
      contexto.recarregar();
    },
  }, [
    el('span', { classe: 'escolha-nome', texto: painel.nome }),
    el('span', { classe: 'escolha-unidade', texto: `${painel.itens.length} mostrador(es)` }),
  ])));

  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Painel' }),
    el('p', {
      classe: 'campo-dica',
      texto: `Até ${LIMITE_DE_PAINEIS} disposições diferentes — uma para a cidade, outra para a estrada, outra para a oficina. Toque em uma para usá-la.`,
    }),
    listaDePaineis,
    botao('Personalizar painéis', () => contexto.ir('editor'), { tipo: 'principal', classe: 'largo' }),
    botao('Voltar ao painel de fábrica', async () => {
      const confirmado = await confirmar({
        titulo: 'Voltar ao painel de fábrica?',
        texto: 'Todas as disposições montadas são perdidas, e sobra só a padrão.',
        acao: 'Voltar ao padrão',
        perigo: true,
      });
      if (!confirmado) return;
      await armazenamento.restaurarPaineis();
      await sessao.recarregarConfiguracao();
      avisar('Painéis restaurados');
      contexto.recarregar();
    }, { tipo: 'fantasma', classe: 'largo' }),
  ]));

  /* ------------------------------------------------------------- gravação */

  const intervalo = selecao(INTERVALOS, String(configuracao.intervaloDeGravacao));
  intervalo.addEventListener('change', async () => {
    await salvar({ intervaloDeGravacao: Number(intervalo.value) });
    avisar('Intervalo atualizado');
  });

  const telaAcesa = selecao(
    [{ valor: 'sim', nome: 'Manter a tela acesa' }, { valor: 'nao', nome: 'Deixar apagar' }],
    configuracao.manterTelaAcesa ? 'sim' : 'nao',
  );
  telaAcesa.addEventListener('change', async () => {
    await salvar({ manterTelaAcesa: telaAcesa.value === 'sim' });
  });

  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Gravação' }),
    campo('Amostras por segundo', intervalo, 'Mais amostras dão gráfico mais detalhado e ocupam mais espaço.'),
    campo('Durante a gravação', telaAcesa,
      'Com a tela apagada o navegador congela a página: o painel para e a gravação fica com buracos.'),
  ]));

  /* ---------------------------------------------------------- velocímetro */

  const fonte = selecao(
    [
      { valor: 'obd', nome: 'Só o OBD (do carro)' },
      { valor: 'gps', nome: 'Só o GPS (do celular)' },
      { valor: 'ambos', nome: 'As duas ao mesmo tempo' },
    ],
    configuracao.velocimetro ?? 'obd',
  );

  const principal = selecao(
    [{ valor: 'obd', nome: 'OBD no ponteiro, GPS embaixo' }, { valor: 'gps', nome: 'GPS no ponteiro, OBD embaixo' }],
    configuracao.velocimetroPrincipal ?? 'obd',
  );

  const campoPrincipal = campo('Qual manda no ponteiro', principal,
    'A outra aparece menor, sob o número, com o nome da origem ao lado.');
  campoPrincipal.hidden = (configuracao.velocimetro ?? 'obd') !== 'ambos';

  fonte.addEventListener('change', async () => {
    await salvar({ velocimetro: fonte.value });
    // Escolher qual manda no ponteiro só faz sentido quando há duas.
    campoPrincipal.hidden = fonte.value !== 'ambos';
    avisar(fonte.value === 'obd' ? 'GPS desligado' : 'GPS ligado — o navegador vai pedir a localização');
  });

  principal.addEventListener('change', async () => {
    await salvar({ velocimetroPrincipal: principal.value });
  });

  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Velocímetro' }),
    el('p', {
      classe: 'campo-dica',
      texto: 'O velocímetro do carro marca para cima de fábrica: a norma permite indicar acima da velocidade real e proíbe indicar abaixo, e os fabricantes usam essa folga — 5 a 10% a mais é o comum. A velocidade do OBD costuma trazer a mesma folga. O GPS mede o deslocamento no chão e fica mais perto do real.',
    }),
    campo('De onde vem a velocidade', fonte,
      'O GPS pede permissão de localização e gasta bateria. Em túnel e garagem ele perde o sinal, e a tela avisa em vez de mostrar um número velho.'),
    campoPrincipal,
  ]));

  /* ---------------------------------------------------------------- vídeo */

  const qualidade = selecao(
    [{ valor: '720', nome: '720p — cerca de 20 MB por minuto' }, { valor: '480', nome: '480p — cerca de 9 MB por minuto' }],
    String(configuracao.qualidadeDeVideo),
  );
  qualidade.addEventListener('change', async () => {
    await salvar({ qualidadeDeVideo: Number(qualidade.value) });
    avisar('Qualidade atualizada');
  });

  const audio = selecao(
    [{ valor: 'nao', nome: 'Sem som' }, { valor: 'sim', nome: 'Com som do microfone' }],
    configuracao.audioNoVideo ? 'sim' : 'nao',
  );
  audio.addEventListener('change', async () => {
    await salvar({ audioNoVideo: audio.value === 'sim' });
  });

  const limite = selecao(
    [
      { valor: '512', nome: '512 MB' },
      { valor: '1024', nome: '1 GB' },
      { valor: '2048', nome: '2 GB' },
      { valor: '4096', nome: '4 GB' },
    ],
    String(configuracao.limiteDeVideoMB),
  );
  limite.addEventListener('change', async () => {
    await salvar({ limiteDeVideoMB: Number(limite.value) });
  });

  const padraoDeVideo = selecao(
    [{ valor: 'nao', nome: 'Desligado' }, { valor: 'sim', nome: 'Ligado' }],
    configuracao.gravarVideo ? 'sim' : 'nao',
  );
  padraoDeVideo.addEventListener('change', async () => {
    await salvar({ gravarVideo: padraoDeVideo.value === 'sim' });
  });

  const videoOcupado = await armazenamento.ocupacaoDeVideo();
  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Vídeo da estrada' }),
    el('p', {
      classe: 'campo-dica',
      texto: 'Grava a câmera traseira junto com a viagem, em trechos de 30 segundos, para ver depois qual trecho de estrada corresponde a cada número.',
    }),
    campo('Ao começar uma gravação', padraoDeVideo, 'Só o estado inicial do interruptor: a escolha final é feita no painel, a cada viagem.'),
    campo('Qualidade', qualidade, 'Em 480p cabe mais que o dobro de viagem no mesmo espaço.'),
    campo('Som', audio,
      'Desligado por padrão: a câmera grava a estrada, mas o microfone grava a conversa de quem está no carro — inclusive de quem não escolheu ser gravado.'),
    campo('Parar ao chegar em', limite, 'A gravação para com aviso ao bater no teto, em vez de ser cortada pelo navegador quando a cota estourar.'),
    el('div', { classe: 'detalhe-linhas' }, [
      linhaDeValor('Trechos guardados', String(videoOcupado.trechos)),
      linhaDeValor('Espaço em vídeo', `${numero(videoOcupado.bytes / 1_048_576, 1)} MB`),
      linhaDeValor(
        'Espaço concedido pelo navegador',
        // Sem `storage.estimate` não há como saber, e um palpite aqui viraria
        // uma promessa de espaço que talvez não exista.
        videoOcupado.cota?.limite
          ? `${numero(videoOcupado.cota.limite / 1_073_741_824, 1)} GB`
          : 'este navegador não informa',
      ),
    ]),
    el('p', {
      classe: 'campo-dica',
      texto: 'O vídeo de uma viagem é apagado junto com ela, na tela da viagem.',
    }),
  ]));

  /* -------------------------------------------------------------- recordes */

  const veiculos = await armazenamento.veiculos();
  const comRecordes = veiculos.filter((v) => Object.keys(v.recordes ?? {}).length > 0);

  if (comRecordes.length > 0) {
    tela.append(cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Máximos registrados' }),
      ...comRecordes.map((veiculo) => el('div', { classe: 'detalhe-linhas' }, [
        el('p', { classe: 'campo-dica', texto: veiculo.vin ? `Chassi ${veiculo.vin}` : 'Carro sem chassi informado' }),
        ...MAXIMOS_ACOMPANHADOS
          .filter((chave) => Number.isFinite(veiculo.recordes[chave]))
          .map((chave) => linhaDeValor(
            definicaoDe(chave)?.nome ?? chave,
            `${valorDePid(chave, veiculo.recordes[chave])} ${unidadeDePid(chave)}`,
          )),
      ])),
      botao('Zerar os máximos', async () => {
        const confirmado = await confirmar({
          titulo: 'Zerar os máximos?',
          texto: 'A velocidade e a rotação máximas registradas voltam a zero, e recomeçam a contar na próxima conexão.',
          acao: 'Zerar',
          perigo: true,
        });
        if (!confirmado) return;
        for (const veiculo of comRecordes) await armazenamento.zerarRecordes(veiculo.id);
        avisar('Máximos zerados');
        contexto.recarregar();
      }, { tipo: 'perigo', classe: 'largo' }),
    ]));
  }

  /* ----------------------------------------------------------------- tema */

  const tema = selecao(
    [{ valor: 'auto', nome: 'Seguir o aparelho' }, { valor: 'claro', nome: 'Claro' }, { valor: 'escuro', nome: 'Escuro' }],
    configuracao.tema,
  );
  tema.addEventListener('change', async () => {
    await salvar({ tema: tema.value });
    contexto.aplicarTema(tema.value);
  });

  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Aparência' }),
    campo('Tema', tema, 'O escuro é o que se usa dirigindo à noite: a tela clara no painel ofusca.'),
  ]));

  /* ---------------------------------------------------------------- dados */

  /*
   * O backup é um arquivo JSON que vai e volta inteiro. É o único caminho para
   * levar as viagens de um aparelho a outro — ou de um endereço a outro: o
   * banco local pertence à origem da página, e o aplicativo mudando de
   * domínio nasce vazio no novo, com tudo o que foi gravado preso no antigo.
   */
  const seletorDeBackup = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    onchange: async (evento) => {
      const arquivo = evento.target.files?.[0];
      evento.target.value = '';
      if (!arquivo) return;
      // Restaurar no meio de uma gravação apagaria a viagem em curso debaixo
      // da sessão, que continuaria mandando amostras para um registro que não
      // existe mais.
      if (sessao.estado.gravando) {
        avisar('Pare a gravação antes de restaurar um backup', 'erro');
        return;
      }
      try {
        const backup = JSON.parse(await arquivo.text());
        const viagens = backup.colecoes?.viagens?.length ?? 0;
        const confirmado = await confirmar({
          titulo: 'Restaurar backup?',
          texto: `As viagens, os ajustes e os carros deste aparelho serão substituídos pelo conteúdo do arquivo (${viagens} viagem(ns)). Vídeos de viagens que não estão no arquivo são apagados. Não dá para desfazer.`,
          acao: 'Restaurar',
          perigo: true,
        });
        if (!confirmado) return;
        const contagem = await armazenamento.restaurar(backup);
        const restaurada = await sessao.recarregarConfiguracao();
        contexto.aplicarTema(restaurada.tema);
        avisar(`Backup restaurado: ${contagem.viagens} viagem(ns)`);
        contexto.recarregar();
      } catch (erro) {
        avisar(erro.message || 'Arquivo inválido', 'erro');
      }
    },
  });

  /**
   * A importação da planilha.
   *
   * Recusa no meio de uma gravação pelo mesmo motivo que a restauração recusa:
   * a sessão está escrevendo amostras, e mexer no banco embaixo dela é o tipo
   * de corrida que sai como viagem truncada sem nada avisando.
   */
  const seletorDeCSV = el('input', {
    type: 'file',
    accept: '.csv,text/csv',
    hidden: true,
    onchange: async (evento) => {
      const arquivo = evento.target.files?.[0];
      evento.target.value = '';
      if (!arquivo) return;

      if (sessao.estado.gravando) {
        avisar('Pare a gravação antes de importar viagens', 'erro');
        return;
      }

      try {
        const { viagens, avisos } = lerViagensDeCSV(await arquivo.text());
        if (viagens.length === 0) {
          avisar('Nenhuma viagem encontrada neste arquivo', 'atencao', 5000);
          return;
        }

        const comAmostras = viagens.filter((v) => v.amostras.length > 0).length;
        const confirmado = await confirmar({
          titulo: `Importar ${viagens.length} viagem(ns)?`,
          texto: `Elas serão acrescentadas às que já estão no aparelho, sem apagar nada. `
            + `${comAmostras} com amostras. Vídeos não voltam pela planilha.`,
          acao: 'Importar',
        });
        if (!confirmado) return;

        const conta = await armazenamento.importarViagens(viagens);
        // O que já existia é dito junto, e não escondido: «12 importadas» sem o
        // «3 já estavam aqui» faz parecer que três gravações sumiram.
        const repetidas = conta.repetidas ? `, ${conta.repetidas} já estava(m) aqui` : '';
        avisar(`${conta.importadas} viagem(ns) importada(s)${repetidas}`, 'ok', 6000);
        for (const aviso of avisos.slice(0, 3)) avisar(aviso, 'atencao', 7000);
        contexto.recarregar();
      } catch (erro) {
        avisar(erro.message || 'Não foi possível ler o arquivo', 'erro', 6000);
      }
    },
  });

  const ocupacao = await armazenamento.ocupacao();
  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Dados no aparelho' }),
    el('div', { classe: 'detalhe-linhas' }, [
      linhaDeValor('Viagens gravadas', String(ocupacao.viagens)),
      linhaDeValor('Amostras', numero(ocupacao.amostras, 0)),
      linhaDeValor('Espaço aproximado', `${numero(ocupacao.bytes / 1_048_576, 1)} MB`),
      linhaDeValor('Armazenamento', armazenamento.persistente ? 'permanente' : 'só nesta sessão'),
    ]),
    el('p', {
      classe: 'campo-dica',
      texto: 'O backup é um arquivo JSON com as viagens, as amostras, os carros e seus máximos, e os ajustes. Guarde-o fora do aparelho. Os vídeos não entram — ocupam espaço demais para um arquivo que precisa caber num compartilhamento.',
    }),
    botao('Exportar backup', async () => {
      const dados = await armazenamento.exportar();
      baixar(`obd2-painel-backup-${diaDe()}.json`,
        new Blob([JSON.stringify(dados)], { type: 'application/json' }));
      avisar('Backup gerado');
    }, { tipo: 'principal', classe: 'largo' }),
    botao('Restaurar backup', () => seletorDeBackup.click(), { tipo: 'secundario', classe: 'largo' }),
    seletorDeBackup,
    botao('Importar viagens (CSV)', () => seletorDeCSV.click(), { tipo: 'secundario', classe: 'largo' }),
    seletorDeCSV,
    el('p', {
      classe: 'campo-dica',
      texto: 'Importar soma: as viagens do arquivo entram sem apagar as que já estão aqui, e as repetidas '
        + 'são reconhecidas pelo começo e pelo fim. Serve para juntar num aparelho só o que foi gravado em '
        + 'dois. Restaurar, ao contrário, substitui tudo. Da planilha não voltam os vídeos nem as casas '
        + 'decimais além do que aparecia na tela — para mudança de casa sem perda nenhuma, use o backup.',
    }),
    botao('Apagar tudo', async () => {
      const confirmado = await confirmar({
        titulo: 'Apagar todos os dados?',
        texto: 'Viagens, ajustes e o que foi descoberto do carro. Nada disso está em outro lugar — não há cópia em nuvem. Exporte um backup antes.',
        acao: 'Apagar tudo',
        perigo: true,
      });
      if (!confirmado) return;
      await armazenamento.limparTudo();
      await sessao.recarregarConfiguracao();
      avisar('Tudo apagado');
      contexto.recarregar();
    }, { tipo: 'perigo', classe: 'largo' }),
  ]));

  /* ---------------------------------------------------------------- sobre */

  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Sobre' }),
    el('p', {
      classe: 'campo-dica',
      texto: 'Tudo acontece dentro do aparelho: não há servidor, conta nem envio. O que o carro conta fica com quem dirige, e apagar é apagar.',
    }),
    el('p', {
      classe: 'campo-dica',
      texto: 'O aplicativo lê. Ele não regrava módulo, não altera parâmetro do motor e não faz remapeamento — as únicas escritas que envia são o pedido de apagar falhas (serviço 04) e os ajustes do próprio adaptador.',
    }),
    el('p', {
      classe: 'alerta alerta-atencao',
      texto: 'Opere o aplicativo com o carro parado. O celular deve ficar em suporte, e a leitura de falhas interrompe o painel por alguns segundos.',
    }),
  ]));

  return tela;
}
