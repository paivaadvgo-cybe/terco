/**
 * O painel: o que o carro está fazendo agora.
 *
 * É a tela que fica aberta com o celular preso ao painel, e por isso quase tudo
 * aqui é decidido pela leitura de relance: dois ponteiros grandes no alto —
 * rotação e velocidade, os únicos que se olha andando —, o resto em mostradores
 * abaixo, e nada que mude de lugar enquanto se dirige.
 *
 * **A tela é montada uma vez e atualizada por dentro.** A sessão avisa várias
 * vezes por segundo; redesenhar a tela a cada aviso destruiria e recriaria
 * dezenas de elementos por segundo, o que no celular aparece como tremor nos
 * números e gasta bateria à toa. Os mostradores guardam o último valor e só
 * tocam no DOM quando o número muda de verdade.
 */

import { el, botao, cartao, vazio } from '../elementos.js';
import { criarMedidor, criarMostrador, criarCartaoDeValor } from '../medidor.js';
import { avisar } from '../avisos.js';
import { numero, consumo as formatarConsumo } from '../formatar.js';
import { duracao } from '../../dominio/datas.js';
import { diagnostico } from '../../obd/transportes.js';
import { ESTADOS } from '../../sessao.js';

/** Os dois que ganham ponteiro grande. O resto vira mostrador. */
const PRINCIPAIS = ['0C', '0D'];

export async function telaPainel(contexto) {
  const { sessao } = contexto;
  const configuracao = await contexto.armazenamento.configuracao();

  if (sessao.estado.situacao !== 'conectado' && sessao.estado.situacao !== 'erro') {
    return telaDesconectado(contexto);
  }

  const tela = el('div', { classe: 'tela' });

  /* ------------------------------------------------------------ situação */

  const situacao = el('p', { classe: 'situacao', texto: '' });
  const listaDeAlertas = el('div', { classe: 'alertas' });

  /* ------------------------------------------------------------ ponteiros */

  const medidores = PRINCIPAIS.map((pid) => criarMedidor(pid));
  tela.append(el('div', { classe: 'medidores' }, medidores.map((m) => m.no)));

  /* -------------------------------------------------------------- consumo */

  const cartaoConsumo = criarCartaoDeValor('Consumo', { unidade: '', dica: '' });
  const cartaoDistancia = criarCartaoDeValor('Gravação', { unidade: '' });

  /* ---------------------------------------------------------- mostradores */

  const escolhidos = (configuracao.painel ?? []).filter((pid) => !PRINCIPAIS.includes(pid));
  const mostradores = escolhidos.map((pid) => criarMostrador(pid));

  tela.append(cartao([
    situacao,
    listaDeAlertas,
    el('div', { classe: 'mostradores' }, [
      cartaoConsumo.no,
      cartaoDistancia.no,
      ...mostradores.map((m) => m.no),
    ]),
  ]));

  /* ------------------------------------------------------------- gravação */

  const botaoGravar = botao('Gravar viagem', alternarGravacao, { tipo: 'principal', classe: 'largo' });
  tela.append(cartao([
    botaoGravar,
    el('p', {
      classe: 'campo-dica',
      texto: 'A gravação guarda uma amostra por segundo no aparelho, para ver depois ou exportar em planilha.',
    }),
  ]));

  async function alternarGravacao() {
    try {
      if (sessao.estado.gravando) {
        const encerrada = await sessao.pararGravacao();
        avisar(encerrada?.resumo?.distancia
          ? `Viagem gravada: ${numero(encerrada.resumo.distancia, 1)} km`
          : 'Gravação encerrada');
      } else {
        await sessao.comecarGravacao();
        avisar('Gravando. A tela fica acesa enquanto durar.', 'ok', 3200);
      }
    } catch (erro) {
      avisar(`Não foi possível: ${erro.message}`, 'erro');
    }
  }

  /* ---------------------------------------------------------- atualização */

  let comecouEm = null;
  function desenharEstado(estado) {
    for (const medidor of medidores) medidor.atualizar(estado.valores[medidor.no.dataset.pid]);
    for (const mostrador of mostradores) mostrador.atualizar(estado.valores[mostrador.no.dataset.pid]);

    const { litrosPorHora, kmPorLitro, origem, parado } = estado.consumo ?? {};
    const fonte = origem === 'medido' ? 'medido pelo carro' : `estimado pelo ${origem}`;
    if (parado && Number.isFinite(litrosPorHora)) {
      // Parado, km/L seria infinito. Litro por hora é o número que faz sentido
      // com o motor girando e o carro sem andar.
      cartaoConsumo.atualizar(numero(litrosPorHora, 1), 'parado, motor ligado', 'L/h');
    } else if (Number.isFinite(kmPorLitro)) {
      cartaoConsumo.atualizar(formatarConsumo(kmPorLitro).replace(' km/L', ''), fonte, 'km/L');
    } else {
      cartaoConsumo.atualizar('—', origem ? fonte : 'este carro não informa', '');
    }

    if (estado.gravando) {
      comecouEm ??= estado.viagem?.inicio ?? Date.now();
      cartaoDistancia.atualizar(duracao(Date.now() - comecouEm), 'gravando', '');
    } else {
      comecouEm = null;
      cartaoDistancia.atualizar('—', 'não está gravando', '');
    }

    botaoGravar.textContent = estado.gravando ? 'Parar gravação' : 'Gravar viagem';
    botaoGravar.className = `botao botao-${estado.gravando ? 'perigo' : 'principal'} largo`;

    const taxa = estado.leiturasPorSegundo;
    situacao.textContent = estado.situacao === 'conectado'
      ? `${ESTADOS[estado.situacao]} · ${taxa ? `${numero(taxa, 1)} leituras/s` : 'lendo…'}`
      : `${ESTADOS[estado.situacao]}${estado.detalhe ? ` · ${estado.detalhe}` : ''}`;
    situacao.dataset.situacao = estado.situacao;

    listaDeAlertas.replaceChildren(...(estado.alertas ?? []).map((alerta) => el('p', {
      classe: `alerta alerta-${alerta.nivel}`,
      texto: alerta.texto,
    })));
  }

  contexto.aoSair(sessao.assinar(desenharEstado));

  // O relógio da gravação anda mesmo quando o carro não muda de estado — sem
  // ele o cronômetro congelaria num carro parado em semáforo.
  const relogio = setInterval(() => {
    if (sessao.estado.gravando) desenharEstado(sessao.estado);
  }, 1000);
  contexto.aoSair(() => clearInterval(relogio));

  return tela;
}

/**
 * A tela de quem ainda não conectou.
 *
 * Não é uma tela de erro: é a primeira coisa que a maioria vê. Por isso ela
 * oferece os dois caminhos — conectar e experimentar — e diz de cara o que este
 * navegador consegue fazer, em vez de deixar descobrir tocando.
 */
function telaDesconectado(contexto) {
  const aparelho = diagnostico();
  const tela = el('div', { classe: 'tela' });

  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'Nenhum adaptador conectado' }),
    el('p', {
      classe: 'campo-dica',
      texto: 'O painel mostra rotação, velocidade, temperatura e consumo lidos direto da central do carro, pelo conector OBD-II.',
    }),
    aparelho.algumDisponivel
      ? botao('Conectar adaptador', () => contexto.ir('conexao'), { tipo: 'principal', classe: 'largo' })
      : el('p', { classe: 'alerta alerta-atencao', texto: aparelho.ble.motivo ?? 'Este navegador não consegue conectar em adaptadores.' }),
    botao('Ver com carro simulado', () => contexto.ir('conexao?demo=1'), { tipo: 'fantasma', classe: 'largo' }),
  ]));

  tela.append(cartao([
    el('h2', { classe: 'secao-titulo', texto: 'O que é preciso' }),
    vazio(
      'Um adaptador ELM327 Bluetooth BLE',
      'Os adaptadores Bluetooth comuns (clássico) e os Wi-Fi não funcionam em navegador nenhum. A tela de conexão explica por quê.',
    ),
  ]));

  return tela;
}
