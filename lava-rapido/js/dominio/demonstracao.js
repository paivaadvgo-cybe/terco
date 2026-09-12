/**
 * Modo demonstração.
 *
 * Serve para duas coisas: mostrar o aplicativo a quem ainda não confia nele, e
 * dar conteúdo às telas de caixa, histórico e relatório, que vazias não contam
 * nada sobre o que fazem.
 *
 * Todo registro criado aqui leva `demo: true`. É o que permite apagar a
 * demonstração sem tocar no que é de verdade — e é importante, porque o dono
 * vai experimentar primeiro e começar a usar em seguida, no mesmo aparelho e
 * provavelmente no mesmo dia. Apagar por data, ou apagar tudo, levaria junto as
 * primeiras lavagens reais.
 */

import { ESTADOS } from './lavagem.js';
import { dia as diaDe } from './datas.js';

/** Os quatro veículos do enunciado, mais movimento de dias anteriores. */
const HOJE = [
  { placa: 'ABC1D23', modelo: 'Onix', tipo: 'hatch', servicoId: 'externa-interna', servicoNome: 'Lavagem Externa + Interna', valor: 4000, hora: 8.6, estado: 'pago', forma: 'pix' },
  { placa: 'DEF2E34', modelo: 'HB20', tipo: 'hatch', servicoId: 'externa', servicoNome: 'Lavagem Externa', valor: 2500, hora: 9.4, estado: 'pago', forma: 'dinheiro' },
  { placa: 'GHI3F45', modelo: 'Corolla', tipo: 'sedan', servicoId: 'externa-interna', servicoNome: 'Lavagem Externa + Interna', valor: 4500, hora: 10.2, estado: 'pago', forma: 'debito' },
  { placa: 'JKL4G56', modelo: 'T-Cross', tipo: 'suv', servicoId: 'completa', servicoNome: 'Lavagem Externa + Interna + Caixa de Roda', valor: 7000, hora: 11.0, estado: 'pendente' },
  { placa: 'MNO5H67', modelo: 'Strada', tipo: 'picape', servicoId: 'externa', servicoNome: 'Lavagem Externa', valor: 4000, hora: 13.5, estado: 'pago', forma: 'credito' },
  { placa: 'PQR6I78', modelo: 'Biz', tipo: 'moto', servicoId: 'moto', servicoNome: 'Lavagem de Moto', valor: 1500, hora: 14.2, estado: 'lavando' },
  { placa: 'STU7J89', modelo: 'Kwid', tipo: 'hatch', servicoId: 'externa-caixa', servicoNome: 'Lavagem Externa + Caixa de Roda', valor: 5000, hora: 14.6, estado: 'lavando' },
];

/** Dias anteriores, para o histórico e os relatórios terem o que mostrar. */
const ANTES = [
  { atras: 1, placa: 'ABC1D23', modelo: 'Onix', tipo: 'hatch', servicoId: 'externa', servicoNome: 'Lavagem Externa', valor: 2500, hora: 9, forma: 'pix' },
  { atras: 1, placa: 'XYZ2K44', modelo: 'HB20', tipo: 'hatch', servicoId: 'externa-interna', servicoNome: 'Lavagem Externa + Interna', valor: 4000, hora: 10.5, forma: 'dinheiro' },
  { atras: 2, placa: 'GHI3F45', modelo: 'Corolla', tipo: 'sedan', servicoId: 'completa', servicoNome: 'Lavagem Externa + Interna + Caixa de Roda', valor: 6000, hora: 15, forma: 'pix' },
  { atras: 3, placa: 'ABC1D23', modelo: 'Onix', tipo: 'hatch', servicoId: 'externa-interna', servicoNome: 'Lavagem Externa + Interna', valor: 4000, hora: 11, forma: 'debito' },
  { atras: 4, placa: 'JKL4G56', modelo: 'T-Cross', tipo: 'suv', servicoId: 'externa', servicoNome: 'Lavagem Externa', valor: 3500, hora: 16, forma: 'pix' },
  { atras: 6, placa: 'VWX8L90', modelo: 'Saveiro', tipo: 'picape', servicoId: 'externa-interna', servicoNome: 'Lavagem Externa + Interna', valor: 6000, hora: 8.5, forma: 'dinheiro' },
];

export const FUNCIONARIOS_DEMO = [
  { id: 'demo-joao', nome: 'João', ativo: true, demo: true },
  { id: 'demo-pedro', nome: 'Pedro', ativo: true, demo: true },
  { id: 'demo-carlos', nome: 'Carlos', ativo: true, demo: true },
];

export const DESPESAS_DEMO = [
  { descricao: 'Shampoo automotivo e cera', valor: 18000, categoria: 'produto', atras: 0 },
  { descricao: 'Conta de água', valor: 9500, categoria: 'agua', atras: 2 },
  { descricao: 'Conta de luz', valor: 7000, categoria: 'energia', atras: 3 },
];

function instante(agora, diasAtras, hora) {
  const d = new Date(agora);
  d.setDate(d.getDate() - diasAtras);
  d.setHours(Math.floor(hora), Math.round((hora % 1) * 60), 0, 0);
  return d.getTime();
}

/**
 * Monta as lavagens da demonstração.
 *
 * O funcionário é distribuído em rodízio: o relatório por funcionário precisa
 * de mais de um nome para mostrar do que é capaz.
 */
export function lavagensDeDemonstracao(agora, novoId) {
  const registros = [];
  const equipe = FUNCIONARIOS_DEMO;
  let conta = 0;

  const montar = (base, quando) => {
    const funcionario = equipe[conta++ % equipe.length];
    return {
      id: novoId('lav'),
      demo: true,
      placa: base.placa,
      tipo: base.tipo,
      modelo: base.modelo,
      servicoId: base.servicoId,
      servicoNome: base.servicoNome,
      valor: base.valor,
      funcionarioId: funcionario.id,
      funcionarioNome: funcionario.nome,
      fotoId: null,
      observacao: '',
      criadaEm: quando,
      dia: diaDe(quando),
    };
  };

  for (const base of ANTES) {
    const quando = instante(agora, base.atras, base.hora);
    registros.push({
      ...montar(base, quando),
      estado: ESTADOS.PAGO,
      iniciadaEm: quando,
      finalizadaEm: quando + 25 * 60000,
      pagaEm: quando + 27 * 60000,
      pagamento: { forma: base.forma, valor: base.valor, em: quando + 27 * 60000 },
    });
  }

  for (const base of HOJE) {
    const quando = instante(agora, 0, base.hora);
    const registro = { ...montar(base, quando), estado: ESTADOS.LAVANDO, iniciadaEm: quando };
    if (base.estado === 'pago') {
      Object.assign(registro, {
        estado: ESTADOS.PAGO,
        finalizadaEm: quando + 30 * 60000,
        pagaEm: quando + 32 * 60000,
        pagamento: { forma: base.forma, valor: base.valor, em: quando + 32 * 60000 },
      });
    } else if (base.estado === 'pendente') {
      Object.assign(registro, {
        estado: ESTADOS.PENDENTE,
        finalizadaEm: quando + 35 * 60000,
        pendenteDesde: quando + 35 * 60000,
      });
    }
    registros.push(registro);
  }

  return registros;
}

export function despesasDeDemonstracao(agora, novoId) {
  return DESPESAS_DEMO.map((d) => {
    const quando = instante(agora, d.atras, 8);
    return {
      id: novoId('desp'), demo: true, descricao: d.descricao, valor: d.valor,
      categoria: d.categoria, em: quando, dia: diaDe(quando),
    };
  });
}

/** Os veículos que a demonstração cria, com a contagem certa de lavagens. */
export function veiculosDeDemonstracao(lavagens) {
  const mapa = new Map();
  for (const l of lavagens) {
    const atual = mapa.get(l.placa) ?? { placa: l.placa, demo: true, lavagens: 0, criadoEm: l.criadaEm, ultimaEm: 0 };
    atual.lavagens += 1;
    atual.tipo = l.tipo;
    atual.modelo = l.modelo;
    atual.ultimaEm = Math.max(atual.ultimaEm, l.criadaEm);
    mapa.set(l.placa, atual);
  }
  return [...mapa.values()];
}
