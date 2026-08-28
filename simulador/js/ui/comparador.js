/**
 * Comparador SAC × PRICE.
 *
 * O item 30 do escopo pede a comparação e quatro gráficos. Vale lembrar de que
 * lado vem cada número: o SAC é o que a planilha implementa, e o PRICE é
 * extensão do aplicativo. A comparação não é entre duas coisas que a
 * instituição já pratica — é entre o que ela pratica e uma alternativa.
 *
 * Quando o perfil do produto reproduz a troca de base da planilha, o SAC
 * termina com saldo residual e o PRICE não. Os totais deixam de ser
 * estritamente comparáveis, e o comparador diz isso em vez de deixar a
 * diferença passar por mérito de um sistema sobre o outro.
 */

import { criar } from './formulario.js';
import { desenharGrafico } from './grafico.js';
import { moeda, numero, meses, percentual } from './formatar.js';
import { ehPraticamenteZero } from './../engine/arredondamento.js';

const SERIES = [
  { chave: 'sac', nome: 'SAC', classe: 'serie-1' },
  { chave: 'price', nome: 'PRICE', classe: 'serie-2' },
];

export const acumular = (valores) => {
  let total = 0;
  return valores.map((v) => { total += v; return total; });
};

const GRAFICOS = [
  {
    titulo: 'Evolução da prestação',
    ler: (s) => s.cronograma.map((p) => p.prestacao),
  },
  {
    titulo: 'Evolução do saldo devedor',
    ler: (s) => s.cronograma.map((p) => p.saldoFinal),
  },
  {
    titulo: 'Juros acumulados',
    ler: (s) => acumular(s.cronograma.map((p) => p.juros + p.jurosIndexador)),
  },
  {
    titulo: 'Amortização acumulada',
    ler: (s) => acumular(s.cronograma.map((p) => p.amortizacao)),
  },
];

const MEDIDAS = [
  ['Primeira parcela', (s) => s.primeiraParcela],
  ['Última parcela', (s) => s.ultimaParcela],
  ['Total de juros', (s) => s.totalJuros],
  ['Total pago', (s) => s.totalPago],
];

/**
 * O eixo abrevia porque as suas marcas já são números redondos: 3.000 vira
 * "3 mil" sem perder nada.
 */
export const noEixo = (v) => (Math.abs(v) >= 1000 ? `${numero(v / 1000, 0)} mil` : numero(v, 0));

/**
 * A ponta da linha, não. Abreviar ali faria R$ 2.887,35 e R$ 1.961,68 virarem
 * "3 mil" e "2 mil" — dois números a mil reais de distância parecendo o mesmo
 * valor arredondado, que é justamente a comparação que o gráfico existe para
 * mostrar. Sem centavos, que a leitura ao passar o dedo já traz.
 */
export const naPonta = (v) => numero(v, 0);

export function desenharComparador(raiz, sac, price) {
  raiz.replaceChildren();

  raiz.append(criar('header', { class: 'cabecalho-resultado' }, [
    criar('h1', { texto: 'SAC × PRICE' }),
    criar('p', { class: 'subtitulo' }, [
      `${sac.linha} · ${moeda(sac.valorSolicitado)} · ${meses(sac.prazo)}`,
      sac.carencia ? `, ${meses(sac.carencia)} de carência` : ', sem carência',
    ]),
  ]));

  raiz.append(criar('p', { class: 'nota' }, [
    'O SAC é o sistema que a planilha implementa. O PRICE é extensão do aplicativo: '
    + 'a planilha não monta nenhum cronograma de prestação constante.',
  ]));

  if (!ehPraticamenteZero(sac.saldoResidual)) {
    raiz.append(criar('p', { class: 'aviso' }, [
      criar('strong', { texto: 'Totais não estritamente comparáveis. ' }),
      `O SAC desta linha reproduz a planilha e termina com ${moeda(sac.saldoResidual)} de `
      + 'saldo devedor — ver ABERTO-07. Parte da diferença nos totais vem daí, e não do '
      + 'sistema de amortização.',
    ]));
  }

  raiz.append(tabelaDeDiferencas(sac, price));

  const galeria = criar('div', { class: 'galeria' });
  raiz.append(galeria);
  for (const g of GRAFICOS) {
    const pontos = { sac: g.ler(sac), price: g.ler(price) };
    desenharGrafico(galeria, {
      titulo: g.titulo,
      series: SERIES.map((s) => ({ nome: s.nome, classe: s.classe, pontos: pontos[s.chave] })),
      formatar: moeda,
      formatarEixo: noEixo,
      formatarPonta: naPonta,
    });
  }

  raiz.append(tabelaDeDados(sac, price));
}

function tabelaDeDiferencas(sac, price) {
  const linhas = MEDIDAS.map(([rotulo, ler]) => {
    const a = ler(sac);
    const b = ler(price);
    const diferenca = b - a;
    const relativa = a === 0 ? null : diferenca / a;
    return criar('tr', {}, [
      criar('th', { scope: 'row', texto: rotulo }),
      criar('td', { class: 'num', texto: moeda(a) }),
      criar('td', { class: 'num', texto: moeda(b) }),
      criar('td', { class: 'num', texto: `${diferenca > 0 ? '+' : ''}${moeda(diferenca)}` }),
      criar('td', { class: 'num', texto: relativa === null ? '—' : `${relativa > 0 ? '+' : ''}${percentual(relativa, 2, '')}` }),
    ]);
  });

  return criar('section', { class: 'bloco' }, [
    criar('h2', { texto: 'Diferenças' }),
    criar('div', { class: 'rolagem-tabela' }, [
      criar('table', { class: 'comparacao' }, [
        criar('thead', {}, [criar('tr', {}, [
          criar('th', { texto: '' }),
          criar('th', { class: 'num' }, [criar('span', { class: 'chave serie-1' }, [criar('span', { class: 'traco' })]), 'SAC']),
          criar('th', { class: 'num' }, [criar('span', { class: 'chave serie-2' }, [criar('span', { class: 'traco' })]), 'PRICE']),
          criar('th', { class: 'num', texto: 'Diferença' }),
          criar('th', { class: 'num', texto: '%' }),
        ])]),
        criar('tbody', {}, linhas),
      ]),
    ]),
    criar('p', { class: 'meta' }, [
      'A diferença é o PRICE menos o SAC: positivo quer dizer que o PRICE custa mais.',
    ]),
  ]);
}

/**
 * A tabela existe para que todo valor dos gráficos seja alcançável sem passar
 * o dedo em cima — quem lê por leitor de tela, quem imprime, e quem só quer o
 * número exato chegam nele do mesmo jeito.
 */
function tabelaDeDados(sac, price) {
  const dados = GRAFICOS.map((g) => ({ titulo: g.titulo, sac: g.ler(sac), price: g.ler(price) }));
  const detalhe = criar('details', { class: 'bloco dados-brutos' });
  detalhe.append(criar('summary', { texto: 'Ver os dados dos gráficos em tabela' }));

  detalhe.append(criar('div', { class: 'rolagem-tabela' }, [
    criar('table', { class: 'cronograma' }, [
      criar('thead', {}, [criar('tr', {}, [
        criar('th', { texto: '#' }),
        ...dados.flatMap((d) => [
          criar('th', { class: 'num', texto: `${d.titulo} · SAC` }),
          criar('th', { class: 'num', texto: `${d.titulo} · PRICE` }),
        ]),
      ])]),
      criar('tbody', {}, sac.cronograma.map((_, i) => criar('tr', {}, [
        criar('td', { texto: String(i + 1) }),
        ...dados.flatMap((d) => [
          criar('td', { class: 'num', texto: moeda(d.sac[i]) }),
          criar('td', { class: 'num', texto: moeda(d.price[i]) }),
        ]),
      ]))),
    ]),
  ]));
  return detalhe;
}
