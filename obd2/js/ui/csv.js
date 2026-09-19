/**
 * Exportação em CSV.
 *
 * O destino é o Excel brasileiro, e ele tem manias: separa colunas por ponto e
 * vírgula (não por vírgula, que aqui é decimal), quer o decimal com vírgula, e
 * sem o BOM abre o arquivo em Latin-1 — o que transforma «Rotação» em garatuja.
 * Os três detalhes estão aqui, e é por isso que este arquivo existe em vez de um
 * `join(',')` espalhado pelas telas.
 *
 * **Por que exportar.** O aplicativo mostra a viagem; quem quer investigar um
 * defeito intermitente precisa do dado bruto, alinhado no tempo, para cruzar
 * com o que sentiu ao volante. É também a garantia de que nada aqui é uma
 * jaula: a gravação é da pessoa, e sai em formato que qualquer planilha abre.
 */

import { horaCompleta, exibirDia } from '../dominio/datas.js';
import { definicaoDe, tudoQueSeMostra } from '../obd/pids.js';

/** O catálogo inteiro, para procurar uma chave pelo nome na importação. */
const TUDO_QUE_SE_MOSTRA = tudoQueSeMostra();
import { consumoInstantaneo } from '../dominio/leituras.js';
import { INTERVALO_MAXIMO } from '../dominio/viagem.js';

/** Um campo. Aspas dobradas, e aspas ao redor quando há separador ou quebra. */
export function campoCSV(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * Número como o Excel pt-BR entende: vírgula decimal, sem separador de milhar.
 *
 * Ausência vira célula vazia, nunca zero — e é preciso dizer isso explicitamente
 * porque `Number(null)` é `0`. Um PID que o carro não respondeu exportado como
 * `0,00` entra na média da planilha e a puxa para baixo, silenciosamente.
 */
export function numeroCSV(valor, casas = 2) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (!Number.isFinite(Number(valor))) return '';
  return Number(valor).toFixed(casas).replace('.', ',');
}

export function montarCSV(linhas) {
  // O BOM não é enfeite: sem ele o Excel abre como Latin-1 e come os acentos.
  return `﻿${linhas.map((linha) => linha.map(campoCSV).join(';')).join('\r\n')}\r\n`;
}

/**
 * As colunas de uma exportação.
 *
 * São os PIDs que **aparecem nas amostras**, e não a tabela inteira: exportar
 * quarenta colunas vazias porque o aplicativo conhece quarenta PIDs é o tipo de
 * planilha que ninguém abre duas vezes.
 */
export function colunasDe(amostras) {
  const presentes = new Set();
  for (const amostra of amostras) {
    for (const [pid, valor] of Object.entries(amostra.v ?? {})) {
      if (Number.isFinite(valor)) presentes.add(pid);
    }
  }
  return [...presentes].sort();
}

/**
 * O título de uma coluna de leitura: o nome, a unidade e a chave.
 *
 * A chave entre colchetes é o que torna a planilha **importável de volta**. Sem
 * ela, a volta teria de adivinhar o PID pelo nome — e nome é texto de tela, que
 * muda quando se acha uma palavra melhor. Um arquivo exportado hoje deixaria de
 * ser lido amanhã, sem erro nenhum: as colunas simplesmente sumiriam.
 *
 * Custa oito caracteres por coluna num cabeçalho que ninguém soma.
 */
export function tituloDeColuna(chave) {
  const definicao = definicaoDe(chave);
  return definicao ? `${definicao.nome} (${definicao.unidade}) [${chave}]` : `PID ${chave} [${chave}]`;
}

/** A chave de volta, do título. Aceita o formato antigo, sem colchetes. */
export function chaveDaColuna(titulo, procurar = definicaoDe) {
  const texto = String(titulo ?? '').trim();
  const marcada = texto.match(/\[([^\]]+)\]\s*$/);
  if (marcada) return marcada[1];

  /*
   * Planilha exportada antes de a chave existir: sobra procurar pelo nome. É
   * frágil de propósito — serve para não descartar o arquivo que alguém já
   * tinha, e não para ser o caminho normal.
   */
  const semUnidade = texto.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
  if (!semUnidade) return null;
  for (const chave of Object.keys(TUDO_QUE_SE_MOSTRA ?? {})) {
    if ((procurar(chave)?.nome ?? '').toLowerCase() === semUnidade) return chave;
  }
  return null;
}

/** Uma linha por amostra: hora, segundos desde o início e um PID por coluna. */
export function amostrasEmCSV(amostras, opcoes = {}) {
  const pontos = [...(amostras ?? [])].sort((a, b) => a.t - b.t);
  if (pontos.length === 0) return montarCSV([['Sem amostras']]);

  const colunas = colunasDe(pontos);
  const inicio = pontos[0].t;

  const cabecalho = ['Hora', 'Segundos', ...colunas.map(tituloDeColuna), 'Consumo (L/h)'];

  const linhas = [cabecalho];
  for (const ponto of pontos) {
    const { litrosPorHora } = consumoInstantaneo(ponto.v, opcoes);
    linhas.push([
      horaCompleta(ponto.t),
      numeroCSV((ponto.t - inicio) / 1000, 1),
      ...colunas.map((pid) => numeroCSV(ponto.v[pid], definicaoDe(pid)?.casas ?? 2)),
      numeroCSV(litrosPorHora, 2),
    ]);
  }
  return montarCSV(linhas);
}

/** O resumo no topo e o movimento embaixo — a planilha que se manda ao mecânico. */
export function viagemEmCSV(viagem, amostras, opcoes = {}) {
  const resumo = viagem.resumo ?? {};
  const cabecalho = [
    ['Viagem', exibirDia(viagem.dia ?? '')],
    ['Início', horaCompleta(viagem.inicio)],
    ['Fim', horaCompleta(viagem.fim)],
    ['Distância (km)', numeroCSV(resumo.distancia, 2)],
    ['Velocidade média (km/h)', numeroCSV(resumo.velocidadeMedia, 1)],
    ['Velocidade máxima (km/h)', numeroCSV(resumo.velocidadeMaxima, 0)],
    ['Rotação máxima (rpm)', numeroCSV(resumo.rotacaoMaxima, 0)],
    ['Temperatura máxima (°C)', numeroCSV(resumo.temperaturaMaxima, 0)],
    ['Combustível estimado (L)', numeroCSV(resumo.litros, 2)],
    ['Consumo médio (km/L)', numeroCSV(resumo.consumoMedio, 1)],
    ['Origem do consumo', resumo.origemDoConsumo ?? 'não calculado'],
    ['Amostras', viagem.amostras ?? 0],
    [],
  ];
  const movimento = amostrasEmCSV(amostras, opcoes).replace(/^﻿/, '');
  return montarCSV(cabecalho) + movimento;
}

/**
 * Todas as viagens num arquivo só.
 *
 * **Por que um arquivo e não um por viagem.** Baixar dez arquivos em sequência
 * faz o navegador perguntar se quer permitir vários downloads, e num celular
 * essa pergunta aparece uma vez e some — quem não a viu fica com uma viagem
 * exportada e nove perdidas, sem nada dizendo que faltou. Um arquivo desce uma
 * vez e não depende de permissão nenhuma.
 *
 * **A forma é duas tabelas.** Em cima, uma linha por viagem: é o que alguém lê.
 * Embaixo, todas as amostras de todas as viagens, com a coluna «Viagem»
 * identificando cada linha — é o que a planilha filtra e o que serve para
 * investigar. As colunas de PID são a união de tudo que apareceu: carros
 * diferentes, ou o mesmo carro com o GPS ligado em dias diferentes, não medem a
 * mesma coisa, e uma coluna que só existe em metade das viagens vem vazia na
 * outra metade em vez de desalinhar a tabela.
 *
 * `amostrasPorViagem` é um `Map` de id para amostras. Vem de fora porque ler o
 * banco é trabalho de quem tem o banco, e este arquivo não conhece armazenamento
 * nenhum — é o que deixa a exportação inteira testável sem navegador.
 */
export function viagensEmCSV(viagens, amostrasPorViagem, opcoes = {}) {
  const lista = [...(viagens ?? [])].sort((a, b) => (a.inicio ?? 0) - (b.inicio ?? 0));
  if (lista.length === 0) return montarCSV([['Nenhuma viagem gravada']]);

  /*
   * O nome que liga as duas tabelas, e que precisa ser único.
   *
   * Dia e hora e minuto parecem bastar, e não bastam: duas gravações iniciadas
   * no mesmo minuto — parar e recomeçar num semáforo é exatamente isso —
   * sairiam com o mesmo rótulo, e na planilha virariam uma viagem só. Quem
   * filtrasse por ela somaria dois trajetos achando que soma um. Por isso o
   * segundo entra, e o desempate numerado existe para o caso que sobra.
   */
  const nomes = new Map();
  const usados = new Set();
  for (const viagem of lista) {
    const base = `${exibirDia(viagem.dia ?? '')} ${horaCompleta(viagem.inicio)}`;
    let nome = base;
    for (let n = 2; usados.has(nome); n += 1) nome = `${base} (${n})`;
    usados.add(nome);
    nomes.set(viagem.id, nome);
  }
  const nomeDaViagem = (viagem) => nomes.get(viagem.id) ?? '';

  const resumos = [
    ['Viagem', 'Início', 'Fim', 'Duração (min)', 'Distância (km)',
      'Velocidade média (km/h)', 'Velocidade máxima (km/h)', 'Rotação máxima (rpm)',
      'Temperatura máxima (°C)', 'Combustível estimado (L)', 'Consumo médio (km/L)',
      'Origem do consumo', 'Amostras'],
  ];
  for (const viagem of lista) {
    const resumo = viagem.resumo ?? {};
    resumos.push([
      nomeDaViagem(viagem),
      horaCompleta(viagem.inicio),
      horaCompleta(viagem.fim),
      // Duas casas, e não uma: com uma, a resolução é de seis segundos, e na
      // volta duas gravações curtas de durações diferentes viravam a mesma.
      // Numa viagem de quarenta minutos ninguém repara na segunda casa.
      numeroCSV((resumo.duracao ?? 0) / 60000, 2),
      numeroCSV(resumo.distancia, 2),
      numeroCSV(resumo.velocidadeMedia, 1),
      numeroCSV(resumo.velocidadeMaxima, 0),
      numeroCSV(resumo.rotacaoMaxima, 0),
      numeroCSV(resumo.temperaturaMaxima, 0),
      numeroCSV(resumo.litros, 2),
      numeroCSV(resumo.consumoMedio, 1),
      resumo.origemDoConsumo ?? 'não calculado',
      viagem.amostras ?? 0,
    ]);
  }

  // A união das colunas, para que uma viagem sem GPS não empurre as colunas da
  // viagem seguinte uma casa para a esquerda.
  const todas = lista.flatMap((viagem) => [...(amostrasPorViagem.get(viagem.id) ?? [])]);
  const colunas = colunasDe(todas);

  const movimento = [['Viagem', 'Hora', 'Segundos', ...colunas.map(tituloDeColuna), 'Consumo (L/h)']];

  for (const viagem of lista) {
    const pontos = [...(amostrasPorViagem.get(viagem.id) ?? [])].sort((a, b) => a.t - b.t);
    if (pontos.length === 0) continue;
    const inicio = pontos[0].t;
    const nome = nomeDaViagem(viagem);

    for (const ponto of pontos) {
      const { litrosPorHora } = consumoInstantaneo(ponto.v, opcoes);
      movimento.push([
        nome,
        horaCompleta(ponto.t),
        numeroCSV((ponto.t - inicio) / 1000, 1),
        ...colunas.map((pid) => numeroCSV(ponto.v[pid], definicaoDe(pid)?.casas ?? 2)),
        numeroCSV(litrosPorHora, 2),
      ]);
    }
  }

  return montarCSV([...resumos, []]) + montarCSV(movimento).replace(/^\ufeff/, '');
}

/* ------------------------------------------------------------- a volta */

/**
 * Desmonta o texto do CSV em linhas de campos.
 *
 * Escrito à mão, e não `split(';')`, porque o mesmo arquivo que esta função lê
 * foi escrito por `campoCSV`, que põe aspas em volta de qualquer campo com
 * ponto e vírgula, aspas ou quebra de linha — uma observação digitada pelo
 * condutor chega aqui assim. Um `split` cortaria esse campo ao meio e
 * deslocaria a linha inteira, e o estrago sairia como número na coluna errada,
 * que é pior que erro.
 */
export function lerCSV(texto) {
  const limpo = String(texto ?? '').replace(/^﻿/, '');
  const linhas = [];
  let campos = [];
  let campo = '';
  let entreAspas = false;

  for (let i = 0; i < limpo.length; i += 1) {
    const c = limpo[i];

    if (entreAspas) {
      if (c === '"') {
        // Aspas dobradas dentro do campo são uma aspa literal.
        if (limpo[i + 1] === '"') { campo += '"'; i += 1; } else entreAspas = false;
      } else campo += c;
      continue;
    }

    if (c === '"') { entreAspas = true; continue; }
    if (c === ';') { campos.push(campo); campo = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { campos.push(campo); linhas.push(campos); campos = []; campo = ''; continue; }
    campo += c;
  }
  if (campo !== '' || campos.length) { campos.push(campo); linhas.push(campos); }
  return linhas;
}

/** Número do Excel pt-BR de volta: vírgula decimal, célula vazia é ausência. */
export function numeroDeCSV(texto) {
  const limpo = String(texto ?? '').trim().replace(/\./g, '').replace(',', '.');
  if (limpo === '') return null;
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : null;
}

/**
 * `DD/MM/AAAA HH:MM:SS` de volta a instante, na hora local.
 *
 * Hora local e não UTC porque foi assim que saiu: `exibirDia` e `horaCompleta`
 * escrevem o relógio de quem dirigia. Ler como UTC deslocaria toda viagem em
 * três horas, e um gráfico de madrugada apareceria à tarde.
 */
export function instanteDeCSV(dia, horario) {
  const d = String(dia ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const h = String(horario ?? '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!d || !h) return null;
  const instante = new Date(
    Number(d[3]), Number(d[2]) - 1, Number(d[1]),
    Number(h[1]), Number(h[2]), Number(h[3] ?? 0),
  ).getTime();
  return Number.isFinite(instante) ? instante : null;
}

/**
 * Lê de volta a planilha de todas as viagens.
 *
 * Devolve `{ viagens, avisos }`, onde cada viagem traz as amostras dentro e os
 * avisos contam o que não deu para ler — uma coluna cujo nome mudou, uma linha
 * sem viagem correspondente. **Avisar em vez de falhar**: um arquivo com uma
 * coluna estranha no fim ainda tem meses de viagens boas dentro, e recusá-lo
 * inteiro por causa dela seria perder tudo por causa de pouco.
 *
 * **O instante de cada amostra vem do início da viagem mais a coluna
 * «Segundos»**, e não do relógio de parede da coluna «Hora». Os dois
 * concordam, exceto numa viagem que atravessa a meia-noite: ali o relógio
 * volta para 00:00 e o dia é o do começo, então reconstruir pela hora jogaria a
 * segunda metade da viagem 24 horas para trás. Os segundos são contados desde
 * o início e não têm esse problema.
 *
 * O que não volta, e precisa ser dito: **os vídeos** (não estão na planilha) e
 * a **precisão além da casa decimal exportada** — a planilha guarda o que se
 * lia na tela, não o número cru. Para mudança de casa sem perda nenhuma, o
 * backup em JSON dos Ajustes é o caminho.
 */
export function lerViagensDeCSV(texto) {
  const linhas = lerCSV(texto);
  const avisos = [];

  const inicioDoMovimento = linhas.findIndex((l) => l[0] === 'Viagem' && l[1] === 'Hora');
  const cabecalhoDoResumo = linhas.findIndex((l) => l[0] === 'Viagem' && l[1] === 'Início');

  if (cabecalhoDoResumo < 0 || inicioDoMovimento < 0) {
    throw new Error('este arquivo não é uma exportação de viagens do Painel OBD-II');
  }

  /* ---------------------------------------------------------- o resumo */

  const porNome = new Map();
  for (let i = cabecalhoDoResumo + 1; i < inicioDoMovimento; i += 1) {
    const linha = linhas[i];
    if (!linha || !linha[0]) continue;

    const nome = linha[0];
    const dia = nome.slice(0, 10);
    const inicio = instanteDeCSV(dia, linha[1]);
    if (inicio === null) {
      avisos.push(`linha de resumo ignorada: «${nome}» não tem data legível`);
      continue;
    }

    /*
     * O fim pode ser menor que o início: viagem que atravessou a meia-noite. O
     * dia registrado é o do começo, então some um dia — sem isso a duração
     * ficaria negativa e o resumo, absurdo.
     */
    let fim = instanteDeCSV(dia, linha[2]);
    if (fim !== null && fim < inicio) fim += 86_400_000;

    porNome.set(nome, {
      nome,
      dia: `${dia.slice(6, 10)}-${dia.slice(3, 5)}-${dia.slice(0, 2)}`,
      inicio,
      fim: fim ?? inicio,
      resumo: {
        duracao: (numeroDeCSV(linha[3]) ?? 0) * 60_000,
        distancia: numeroDeCSV(linha[4]),
        velocidadeMedia: numeroDeCSV(linha[5]),
        velocidadeMaxima: numeroDeCSV(linha[6]),
        rotacaoMaxima: numeroDeCSV(linha[7]),
        temperaturaMaxima: numeroDeCSV(linha[8]),
        litros: numeroDeCSV(linha[9]),
        consumoMedio: numeroDeCSV(linha[10]),
        origemDoConsumo: linha[11] || 'não calculado',
      },
      amostras: [],
    });
  }

  /* ------------------------------------------------------- o movimento */

  const titulos = linhas[inicioDoMovimento];
  // A primeira coluna de leitura vem depois de Viagem, Hora e Segundos; a
  // última é o consumo calculado, que se refaz e não se importa.
  const chaves = titulos.slice(3, -1).map((titulo) => {
    const chave = chaveDaColuna(titulo);
    if (!chave) avisos.push(`coluna «${titulo}» não reconhecida e deixada de fora`);
    return chave;
  });

  const semDono = new Set();
  for (let i = inicioDoMovimento + 1; i < linhas.length; i += 1) {
    const linha = linhas[i];
    if (!linha || !linha[0]) continue;

    const viagem = porNome.get(linha[0]);
    if (!viagem) { semDono.add(linha[0]); continue; }

    const segundos = numeroDeCSV(linha[2]);
    if (segundos === null) continue;

    const v = {};
    for (const [coluna, chave] of chaves.entries()) {
      if (!chave) continue;
      const valor = numeroDeCSV(linha[coluna + 3]);
      if (valor !== null) v[chave] = valor;
    }
    viagem.amostras.push({ t: Math.round(viagem.inicio + segundos * 1000), v });
  }

  for (const nome of semDono) avisos.push(`amostras de «${nome}» sem viagem no resumo, ignoradas`);

  /*
   * A duração sai das amostras quando elas vieram, e não da coluna.
   *
   * A coluna é minutos com duas casas — legível para quem abre a planilha, e
   * com resolução de seis décimos de segundo. Isso não se nota numa viagem de
   * quarenta minutos e se nota numa de cinco segundos, dessas de parar e
   * recomeçar num semáforo: duas gravações de durações diferentes voltavam com
   * a mesma. As amostras trazem o instante de cada leitura, então a conta
   * refeita aqui é a mesma que a gravação faz, com a precisão que a coluna não
   * tem. Sem amostras, a coluna é tudo o que há, e serve.
   */
  for (const viagem of porNome.values()) {
    if (viagem.amostras.length < 2) continue;
    let duracao = 0;
    for (let i = 1; i < viagem.amostras.length; i += 1) {
      const bruto = viagem.amostras[i].t - viagem.amostras[i - 1].t;
      // A mesma regra de `resumir`: o intervalo entra **limitado**, não
      // descartado. Um buraco de meia hora — tela apagada, aplicativo em
      // segundo plano — conta como cinco segundos, e não como meia hora nem
      // como nada. Copiar a regra importa mais que escolher a melhor: se as
      // duas contas discordarem, a mesma viagem passa a ter duas durações
      // conforme tenha sido gravada aqui ou importada.
      if (bruto > 0) duracao += Math.min(bruto, INTERVALO_MAXIMO);
    }
    viagem.resumo.duracao = duracao;
  }

  return { viagens: [...porNome.values()], avisos };
}

/**
 * Entrega o arquivo.
 *
 * Sem servidor: o conteúdo vira um endereço temporário na memória do próprio
 * aparelho, e o navegador o salva. Funciona sem internet, que é o ponto.
 */
export function baixar(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const endereco = URL.createObjectURL(blob);
  const ligacao = document.createElement('a');
  ligacao.href = endereco;
  ligacao.download = nome;
  document.body.append(ligacao);
  ligacao.click();
  ligacao.remove();
  // Revogar na hora cancelaria o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(endereco), 4000);
}
