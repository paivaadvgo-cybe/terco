/**
 * O detalhe de uma lavagem.
 *
 * Abre em folha, por cima da tela em que se estava, e fecha voltando para ela.
 * É onde ficam as ações raras — corrigir, cancelar, apagar, ver a foto — que
 * não podem disputar espaço com «FINALIZAR» na tela do pátio.
 *
 * Cancelar preserva o registro e tira da conta; apagar remove de vez. Os dois
 * pedem PIN, quando há PIN, porque é por aqui que o movimento de um dia poderia
 * ser reescrito sem ninguém ver.
 */

import { el, botao } from './elementos.js';
import { moeda } from './formatar.js';
import { avisar, confirmar, abrirFolha } from './avisos.js';
import { hora, exibirDia } from '../dominio/datas.js';
import { rotulo, nomeDaForma, ESTADOS } from '../dominio/lavagem.js';
import { nomeDoTipo } from '../dominio/veiculos.js';
import { exibir as exibirPlaca } from '../dominio/placa.js';
import { finalizarEReceber } from './receber.js';
import * as Foto from '../servicos/foto.js';

export async function abrirDetalhe(contexto, lavagem) {
  const { armazenamento } = contexto;
  const atual = (await armazenamento.lavagem(lavagem.id)) ?? lavagem;
  const estado = rotulo(atual.estado);
  const ficha = atual.placa ? await armazenamento.fichaDaPlaca(atual.placa) : null;

  let enderecoDaFoto = null;
  const registroDaFoto = await armazenamento.foto(atual.fotoId);
  if (registroDaFoto?.blob) enderecoDaFoto = Foto.enderecoDe(registroDaFoto.blob);

  const linha = (nome, valor) => (valor
    ? el('div', { classe: 'linha-valor' }, [
      el('span', { classe: 'linha-rotulo', texto: nome }),
      el('span', { classe: 'linha-numero', texto: valor }),
    ])
    : null);

  const acoes = [];
  if (atual.estado === ESTADOS.AGUARDANDO) {
    acoes.push(botao('INICIAR LAVAGEM', async () => {
      await armazenamento.iniciar(atual.id);
      folha.fechar();
      contexto.recarregar();
    }, { tipo: 'principal', classe: 'largo' }));
  }
  if (atual.estado === ESTADOS.LAVANDO || atual.estado === ESTADOS.FINALIZADO || atual.estado === ESTADOS.PENDENTE) {
    acoes.push(botao(atual.estado === ESTADOS.PENDENTE ? 'RECEBER AGORA' : 'FINALIZAR', async () => {
      folha.fechar();
      await finalizarEReceber(armazenamento, atual);
      contexto.recarregar();
    }, { tipo: 'principal', classe: 'largo' }));
  }

  acoes.push(botao('Cancelar lavagem', async () => {
    if (!await contexto.autorizar('Cancelar lavagem')) return;
    if (!await confirmar({
      titulo: 'Cancelar esta lavagem?',
      texto: 'Ela sai das contas do dia e fica marcada como cancelada no histórico.',
      acao: 'Cancelar lavagem',
      perigo: true,
    })) return;
    try {
      await armazenamento.cancelar(atual.id);
      avisar('Lavagem cancelada', 'atencao');
      folha.fechar();
      contexto.recarregar();
    } catch (erro) {
      avisar(erro.message, 'erro');
    }
  }, { tipo: 'fantasma', classe: 'largo' }));

  acoes.push(botao('Apagar registro', async () => {
    if (!await contexto.autorizar('Apagar registro')) return;
    if (!await confirmar({
      titulo: 'Apagar o registro?',
      texto: 'Some do histórico e das contas, sem deixar rastro. Para manter o rastro, cancele em vez de apagar.',
      acao: 'Apagar',
      perigo: true,
    })) return;
    await armazenamento.apagarLavagem(atual.id);
    avisar('Registro apagado', 'atencao');
    folha.fechar();
    contexto.recarregar();
  }, { tipo: 'perigo', classe: 'largo' }));

  const conteudo = el('div', { classe: 'detalhe' }, [
    el('p', { classe: 'detalhe-placa', texto: exibirPlaca(atual.placa) }),
    el('p', { classe: `etiqueta etiqueta-${atual.estado}`, texto: `${estado.marca} ${estado.texto}` }),
    enderecoDaFoto ? el('img', { classe: 'foto-previa', src: enderecoDaFoto, alt: 'Foto do veículo' }) : null,
    el('div', { classe: 'detalhe-linhas' }, [
      linha('Veículo', [nomeDoTipo(atual.tipo), atual.modelo].filter(Boolean).join(' · ')),
      linha('Serviço', atual.servicoNome),
      linha('Valor', moeda(atual.valor)),
      linha('Registrada', `${exibirDia(atual.dia)} às ${hora(atual.criadaEm)}`),
      linha('Finalizada', atual.finalizadaEm ? hora(atual.finalizadaEm) : ''),
      linha('Pagamento', atual.pagamento ? `${nomeDaForma(atual.pagamento.forma)} · ${hora(atual.pagamento.em)}` : ''),
      linha('Responsável', atual.funcionarioNome),
      ficha && ficha.lavagens > 1 ? linha('Histórico da placa', `${ficha.lavagens} lavagens`) : null,
    ]),
    el('div', { classe: 'coluna-botoes' }, acoes),
  ]);

  const folha = abrirFolha('Lavagem', conteudo, {
    aoFechar: () => Foto.liberar(enderecoDaFoto),
  });
  return folha;
}
