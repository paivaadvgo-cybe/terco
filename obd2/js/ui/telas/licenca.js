/**
 * A tela de licença.
 *
 * Três coisas, nesta ordem, porque é a ordem em que quem chegou aqui precisa
 * delas: em que pé está a licença, o código deste aparelho (que é o que o
 * desenvolvedor pede), e o botão que abre a conversa com a mensagem pronta.
 *
 * O código de instalação fica grande e com botão de copiar porque ele será
 * lido em voz alta ou colado num WhatsApp por alguém sentado no carro. Ele é
 * também o que amarra a licença a este aparelho: sem ele, o arquivo gerado
 * valeria em qualquer celular.
 */

import { el, botao, cartao, linhaDeValor } from '../elementos.js';
import { avisar, confirmar } from '../avisos.js';
import { ESTADOS } from '../../licenca/estado.js';
import { textoDaFaixa } from '../licenca-faixa.js';
import { exibirDia, dia as diaDe } from '../../dominio/datas.js';

const ROTULOS = {
  [ESTADOS.AVALIACAO]: ['atencao', 'Em avaliação'],
  [ESTADOS.AVALIACAO_ENCERRADA]: ['perigo', 'Avaliação encerrada'],
  [ESTADOS.ATIVA]: ['ok', 'Licença ativa'],
  [ESTADOS.VENCIDA]: ['perigo', 'Licença vencida'],
  [ESTADOS.MIGRACAO]: ['atencao', 'Outro aparelho'],
  [ESTADOS.RELOGIO]: ['perigo', 'Data inconsistente'],
  [ESTADOS.INVALIDA]: ['perigo', 'Licença inválida'],
};

export async function telaLicenca(contexto) {
  const { licenca } = contexto;
  const tela = el('div', { classe: 'tela tela-licenca' });

  async function desenhar() {
    const situacao = await licenca.reavaliar();
    const [tom, rotulo] = ROTULOS[situacao.estado] ?? ['atencao', situacao.estado];
    const { SUPORTE, temWhatsApp, temEmail, linkDoWhatsApp, linkDeEmail } = licenca.contato;

    const cabecalho = cartao([
      el('p', { classe: `etiqueta-licenca etiqueta-${tom}`, texto: rotulo }),
      el('p', {
        classe: 'licenca-numero',
        texto: situacao.estado === ESTADOS.ATIVA && !situacao.vencimento
          ? 'sem prazo'
          : (situacao.diasRestantes > 0 ? `${situacao.diasRestantes} ${situacao.diasRestantes === 1 ? 'dia' : 'dias'}` : '—'),
      }),
      el('p', {
        classe: 'observacao',
        texto: situacao.estado === ESTADOS.ATIVA
          ? (situacao.vencimento ? `restantes · vence em ${exibirDia(diaDe(situacao.vencimento))}` : 'licença sem vencimento')
          : (situacao.estado === ESTADOS.AVALIACAO ? `restantes · termina em ${exibirDia(diaDe(situacao.fimDaAvaliacao))}` : ''),
      }),
      el('p', { classe: 'licenca-explicacao', texto: textoDaFaixa(situacao) || 'Tudo em ordem.' }),
    ], 'destaque');

    const codigo = cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Código deste aparelho' }),
      el('p', { classe: 'codigo-instalacao', texto: licenca.instalacaoId }),
      botao('Copiar código', async () => {
        try {
          await navigator.clipboard.writeText(licenca.instalacaoId);
          avisar('Código copiado', 'ok');
        } catch {
          avisar('Não consegui copiar. Anote o código da tela.', 'atencao');
        }
      }, { tipo: 'secundario', classe: 'largo' }),
    ]);

    const mensagem = await licenca.mensagem();
    const falar = cartao([
      el('h2', { classe: 'secao-titulo', texto: `Falar com ${SUPORTE.nome}` }),
      temWhatsApp()
        ? botao('💬 Abrir conversa no WhatsApp', () => window.open(linkDoWhatsApp(mensagem), '_blank', 'noopener'), { tipo: 'principal', classe: 'gigante' })
        : null,
      temEmail()
        ? botao('✉️ Enviar e-mail', () => { window.location.href = linkDeEmail('Licença do Painel OBD-II', mensagem); }, { tipo: temWhatsApp() ? 'secundario' : 'principal', classe: 'largo' })
        : null,
      // Sem contato configurado, a tela não mente: mostra a mensagem pronta
      // para copiar, em vez de um botão que abre o nada.
      !temWhatsApp() && !temEmail()
        ? el('p', { classe: 'observacao', texto: 'O contato do desenvolvedor ainda não foi configurado neste aplicativo. Copie o código acima e envie por onde você combinou com ele.' })
        : null,
      botao('Copiar mensagem', async () => {
        try {
          await navigator.clipboard.writeText(mensagem);
          avisar('Mensagem copiada', 'ok');
        } catch {
          avisar('Não consegui copiar', 'atencao');
        }
      }, { tipo: 'fantasma', classe: 'largo' }),
    ]);

    const seletor = el('input', {
      type: 'file',
      accept: '.obd2,application/json,text/plain',
      hidden: true,
      onchange: async (evento) => {
        const arquivo = evento.target.files?.[0];
        evento.target.value = '';
        const resultado = await licenca.importarArquivo(arquivo);
        if (resultado.ok) {
          avisar('Licença ativada!', 'ok');
          contexto.recarregar();
        } else {
          avisar(resultado.motivo, 'erro');
        }
      },
    });

    const ativar = cartao([
      el('h2', { classe: 'secao-titulo', texto: 'Ativar' }),
      el('p', { classe: 'observacao', texto: 'Quando receber o arquivo de licença (.obd2), toque abaixo e escolha o arquivo. Funciona sem internet — é só um texto assinado.' }),
      botao('📂 Importar arquivo de licença', () => seletor.click(), { tipo: 'secundario', classe: 'largo' }),
      seletor,
    ]);

    const detalhes = situacao.licenca
      ? cartao([
        el('h2', { classe: 'secao-titulo', texto: 'Licença instalada' }),
        linhaDeValor('Número', String(situacao.licenca.numero ?? '—')),
        linhaDeValor('Cliente', String(situacao.licenca.cliente ?? '—')),
        linhaDeValor('Vencimento', situacao.licenca.vencimento ? exibirDia(diaDe(situacao.licenca.vencimento)) : 'sem prazo'),
        botao('Remover licença deste aparelho', async () => {
          if (!await confirmar({
            titulo: 'Remover a licença?',
            texto: 'O aplicativo volta ao estado de avaliação neste aparelho. Use isto ao trocar de celular, guardando o arquivo .obd2 para importar no novo.',
            acao: 'Remover',
            perigo: true,
          })) return;
          await licenca.remover();
          avisar('Licença removida', 'atencao');
          contexto.recarregar();
        }, { tipo: 'fantasma', classe: 'largo' }),
      ])
      : null;

    tela.replaceChildren(cabecalho, codigo, falar, ativar, detalhes);
  }

  await desenhar();
  return tela;
}

/**
 * O cartão que aparece na tela de conexão quando a licença não permite conectar.
 *
 * Fica no lugar dos botões de adaptador — e só ali. As viagens gravadas, os
 * gráficos, a exportação e o carro simulado continuam abertos, porque o dado é
 * de quem dirigiu. O simulado em especial: é como se mostra o aplicativo a
 * quem ainda está decidindo, e tirá-lo tiraria o argumento de venda junto.
 */
export function cartaoDeBloqueio(contexto, situacao) {
  return cartao([
    el('h2', { classe: 'secao-titulo', texto: situacao.estado === ESTADOS.VENCIDA ? '🔒 Licença vencida' : '🔒 Avaliação encerrada' }),
    el('p', {
      classe: 'observacao',
      texto: 'Para conectar num adaptador de verdade, ative a licença. As viagens gravadas, os gráficos, '
        + 'a exportação e o carro simulado continuam liberados.',
    }),
    botao('Ver licença e falar com o desenvolvedor', () => contexto.ir('licenca'), { tipo: 'principal', classe: 'largo' }),
    botao('Ver as viagens gravadas', () => contexto.ir('viagens'), { tipo: 'secundario', classe: 'largo' }),
  ]);
}
