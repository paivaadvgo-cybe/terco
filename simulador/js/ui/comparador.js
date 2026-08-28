/**
 * Comparador SAC × PRICE.
 *
 * Vale lembrar de que lado vem cada número: o SAC é o que a planilha
 * implementa, e o PRICE é extensão do aplicativo. A comparação não é entre
 * duas coisas que a instituição já pratica — é entre o que ela pratica e uma
 * alternativa.
 *
 * A comparação é toda em tabela. Os gráficos que existiam aqui foram retirados:
 * as mesmas quatro séries estão na tabela de dados, parcela a parcela e com o
 * valor exato, que é o que se confere contra um contrato.
 *
 * Quando o perfil do produto reproduz a troca de base da planilha, o SAC
 * termina com saldo residual e o PRICE não. Os totais deixam de ser
 * estritamente comparáveis, e o comparador diz isso em vez de deixar a
 * diferença passar por mérito de um sistema sobre o outro.
 */

import { criar } from './formulario.js';
import { moeda, meses, percentual } from './formatar.js';
import { ehPraticamenteZero } from './../engine/arredondamento.js';

export const acumular = (valores) => {
  let total = 0;
  return valores.map((v) => { total += v; return total; });
};

/** As séries que a tabela de dados abre, parcela a parcela. */
const SERIES_POR_PARCELA = [
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
          criar('th', { class: 'num', texto: 'SAC' }),
          criar('th', { class: 'num', texto: 'PRICE' }),
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
 * A tabela existe para que todo valor das quatro séries seja alcançável sem passar
 * o dedo em cima — quem lê por leitor de tela, quem imprime, e quem só quer o
 * número exato chegam nele do mesmo jeito.
 */
function tabelaDeDados(sac, price) {
  const dados = SERIES_POR_PARCELA.map((g) => ({ titulo: g.titulo, sac: g.ler(sac), price: g.ler(price) }));
  const detalhe = criar('details', { class: 'bloco dados-brutos' });
  detalhe.append(criar('summary', { texto: 'Ver as quatro séries, parcela a parcela' }));

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
