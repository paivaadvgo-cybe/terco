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
import { PIDS, PADRAO_DO_PAINEL } from '../../obd/pids.js';
import { numero } from '../formatar.js';

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

  const escolhidos = new Set(configuracao.painel ?? PADRAO_DO_PAINEL);
  const marcadores = el('div', { classe: 'escolhas' });

  for (const [pid, definicao] of Object.entries(PIDS)) {
    const marcado = escolhidos.has(pid);
    const caixa = el('button', {
      type: 'button',
      classe: `escolha ${marcado ? 'marcada' : ''}`.trim(),
      dados: { pid },
      aoTocar: async () => {
        if (escolhidos.has(pid)) escolhidos.delete(pid);
        else escolhidos.add(pid);
        caixa.classList.toggle('marcada', escolhidos.has(pid));
        await salvar({ painel: [...escolhidos] });
      },
    }, [
      el('span', { classe: 'escolha-nome', texto: definicao.curto ?? definicao.nome }),
      el('span', { classe: 'escolha-unidade', texto: definicao.unidade }),
    ]);
    marcadores.append(caixa);
  }

  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'O que aparece no painel' }),
    el('p', {
      classe: 'campo-dica',
      texto: 'Rotação e velocidade têm sempre os ponteiros grandes. O que estiver marcado aqui vira mostrador, e o carro só é perguntado sobre o que está marcado — quanto menos, mais rápido o painel.',
    }),
    marcadores,
    botao('Voltar ao padrão', async () => {
      escolhidos.clear();
      for (const pid of PADRAO_DO_PAINEL) escolhidos.add(pid);
      for (const caixa of marcadores.querySelectorAll('.escolha')) {
        caixa.classList.toggle('marcada', escolhidos.has(caixa.dataset.pid));
      }
      await salvar({ painel: [...escolhidos] });
      avisar('Painel restaurado');
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

  const ocupacao = await armazenamento.ocupacao();
  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Dados no aparelho' }),
    el('div', { classe: 'detalhe-linhas' }, [
      linhaDeValor('Viagens gravadas', String(ocupacao.viagens)),
      linhaDeValor('Amostras', numero(ocupacao.amostras, 0)),
      linhaDeValor('Espaço aproximado', `${numero(ocupacao.bytes / 1_048_576, 1)} MB`),
      linhaDeValor('Armazenamento', armazenamento.persistente ? 'permanente' : 'só nesta sessão'),
    ]),
    botao('Apagar tudo', async () => {
      const confirmado = await confirmar({
        titulo: 'Apagar todos os dados?',
        texto: 'Viagens, ajustes e o que foi descoberto do carro. Nada disso está em outro lugar — não há cópia em nuvem.',
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
