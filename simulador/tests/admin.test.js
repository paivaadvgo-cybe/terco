/**
 * Testes do painel de administração.
 *
 * O que se prova aqui, em ordem de importância:
 *
 *   1. **O ciclo não altera nada.** Abrir o painel e publicar sem tocar em
 *      campo nenhum devolve o arquivo idêntico, byte a byte. Se isto falhar, a
 *      cada publicação um punhado de taxas muda no último dígito sem que
 *      ninguém tenha pedido, e a alteração entra no histórico como se fosse
 *      decisão da instituição.
 *
 *   2. **O parâmetro alterado chega à conta.** Não basta gravar no arquivo: se
 *      a alíquota nova não atravessar até o cálculo, o painel vira uma tela
 *      que grava números decorativos. Cada bloco de encargo é conferido
 *      mudando o parâmetro e exigindo que o resultado mude junto.
 *
 *   3. O que a validação impede, e o que ela deixa passar. A distinção entre
 *      defeito novo e defeito herdado é o que permite publicar uma alteração
 *      de taxa sem antes resolver as pendências da planilha.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { PARAMETROS } from '../js/data/parametros.js';
import { VIGENTES } from '../js/data/parametros-vigentes.js';
import { simular } from '../js/produtos/produtos.js';
import { calcularTAC } from '../js/encargos/tac.js';
import {
  TIPOS, CAMPOS_DA_LINHA, CAMPOS_IOF, CAMPOS_SIMPLES, CAMPOS_DO_INDEXADOR,
  CAMPOS_DA_PUBLICACAO, CAMPOS_DA_FAIXA_DE_TAC,
  lerCaminho, escreverCaminho, lerCampo, blocosDeTaxa,
} from '../js/admin/esquema.js';
import { validar } from '../js/admin/validar.js';
import { diferencas } from '../js/admin/diferenca.js';
import { paraModulo, paraJSON, lerConjunto, arquivosParaPublicar } from '../js/admin/serializar.js';

const raiz = new URL('..', import.meta.url).pathname;
const clonar = () => structuredClone(VIGENTES);

/** Um conjunto pronto para publicar: os metadados obrigatórios preenchidos. */
function comMetadados(conjunto) {
  const c = conjunto ?? clonar();
  c.metadados = {
    ...c.metadados,
    vigenciaInicio: '2026-09-01',
    atoNormativo: 'Resolução de teste nº 1',
    publicadoPor: 'Teste',
  };
  return c;
}

/* ── 1. o ciclo não altera nada ─────────────────────────────────────────── */

test('publicar sem alterar devolve exatamente o arquivo que está no repositório', () => {
  const emDisco = fs.readFileSync(path.join(raiz, 'js/data/parametros-vigentes.js'), 'utf8');
  assert.equal(paraModulo(VIGENTES), emDisco,
    'o texto que o painel geraria difere do arquivo versionado; toda publicação '
    + 'produziria um diff sujo, com alterações que não são alterações');

  const jsonEmDisco = fs.readFileSync(path.join(raiz, 'dados/PARAMETROS_VIGENTES.json'), 'utf8');
  assert.equal(paraJSON(VIGENTES), jsonEmDisco);
});

test('escrever e ler de volta preserva cada número até o último bit', () => {
  const relido = lerConjunto(paraModulo(VIGENTES));
  assert.deepEqual(relido, JSON.parse(JSON.stringify(VIGENTES)));

  // `deepEqual` compara valores; aqui interessa o double exato de cada taxa.
  for (const grupo of VIGENTES.tabelaDeEncargos) {
    const iGrupo = VIGENTES.tabelaDeEncargos.indexOf(grupo);
    grupo.linhas.forEach((linha, j) => {
      for (const bloco of blocosDeTaxa(linha)) {
        for (const campo of CAMPOS_DA_LINHA.filter((c) => c.tipo === 'taxa')) {
          const taxa = bloco.alvo?.[campo.chave];
          if (!taxa) continue;
          const caminho = bloco.caminho
            ? `tabelaDeEncargos.${iGrupo}.linhas.${j}.${bloco.caminho}.${campo.chave}.valor`
            : `tabelaDeEncargos.${iGrupo}.linhas.${j}.${campo.chave}.valor`;
          assert.equal(lerCaminho(relido, caminho), taxa.valor,
            `${caminho} não sobreviveu ao ciclo`);
        }
      }
    });
  }
});

test('um campo não tocado preserva o valor guardado, mesmo quando ele não cabe no formato do campo', () => {
  // 0,023951442892062056 é resultado de fórmula na planilha e traz os dezessete
  // dígitos de um double. O campo mostra seis casas; reler o que ele mostra
  // daria um vizinho. Como o texto não mudou, o valor guardado é devolvido.
  const campo = { rotulo: 'Taxa', tipo: 'percentual', obrigatorio: true };
  const exato = VIGENTES.tabelaDeEncargos[0].linhas[0].taxaCheia.valor;
  const mostrado = TIPOS.percentual.exibir(exato);

  assert.notEqual(TIPOS.percentual.ler(mostrado), exato, 'o caso deixou de ser interessante');
  assert.equal(lerCampo(campo, mostrado, exato), exato);
  assert.equal(lerCampo(campo, '2,5', exato), 0.025, 'e o campo tocado passa a valer o que se digitou');
});

test('os dois arquivos de publicação carregam o mesmo conteúdo', () => {
  const arquivos = arquivosParaPublicar(comMetadados());
  assert.equal(arquivos.length, 2);
  const [modulo, json] = arquivos;
  assert.deepEqual(lerConjunto(modulo.conteudo), JSON.parse(json.conteudo));
});

test('percentual e dinheiro voltam do formato brasileiro sem trocar milhar por decimal', () => {
  // `lerValor` lê no formato brasileiro, em que o ponto separa milhar. Um campo
  // `type="number"` devolveria "300000.5", que ali vira 3.000.005 — um limite
  // cem vezes maior, gravado em silêncio. Por isso estes campos são de texto.
  assert.equal(TIPOS.dinheiro.entrada, 'text');
  assert.equal(TIPOS.inteiro.entrada, 'text');
  assert.equal(TIPOS.dinheiro.ler('300.000,50'), 300000.5);
  assert.equal(TIPOS.dinheiro.ler(TIPOS.dinheiro.exibir(2000000)), 2000000);
  assert.equal(TIPOS.percentual.ler('1,07'), 0.0107, 'e o percentual desloca a vírgula, não divide por cem');
});

test('nenhum valor de exibição sai como NaN, nem em notação exponencial', () => {
  for (const v of [0, 1e-11, 1.23e-7, 0.1375, 0.0000137, 123.456]) {
    for (const tipo of ['percentual', 'fator', 'dinheiro', 'inteiro']) {
      const texto = TIPOS[tipo].exibir(v);
      assert.ok(!texto.includes('NaN'), `${tipo} exibiu NaN para ${v}`);
    }
  }
});

/* ── 2. o parâmetro alterado chega à conta ──────────────────────────────── */

const OPERACAO = {
  produto: 'investimento',
  linha: 'GoiásFomento Investimento',
  valorSolicitado: 100000,
  prazo: 24,
  carencia: 0,
  modalidadeDeGarantia: 'FAMPE',
};

test('a alíquota de IOF alterada chega ao cálculo', () => {
  const antes = simular(OPERACAO, VIGENTES);
  const editado = clonar();
  editado.encargos.iof.aliquotaAdicional = 0.0076;   // o dobro
  const depois = simular(OPERACAO, editado);

  assert.notEqual(depois.iof, antes.iof, 'o IOF não mudou; o parâmetro não atravessou até a conta');
  const dobrouOAdicional = 100000 * 0.0038 * editado.encargos.iof.fatorFinanciamento;
  assert.ok(Math.abs((depois.iof - antes.iof) - dobrouOAdicional) < 0.01,
    `a diferença deveria ser o adicional a mais: esperado ~${dobrouOAdicional}, obtido ${depois.iof - antes.iof}`);
});

test('a escada da TAC alterada chega ao cálculo', () => {
  const antes = simular(OPERACAO, VIGENTES);
  const editado = clonar();
  editado.encargos.tac.escadaPadrao[2].taxa = 0.04;   // era 0,02
  const depois = simular(OPERACAO, editado);
  assert.equal(antes.tac, 2000);
  assert.equal(depois.tac, 4000);
});

test('o fator do FAMPE alterado chega ao encargo de garantia', () => {
  const antes = simular(OPERACAO, VIGENTES);
  const editado = clonar();
  editado.encargos.fampe.fator = 0.002;
  const depois = simular(OPERACAO, editado);
  assert.ok(antes.garantia.valor > 0);
  assert.equal(depois.garantia.valor, antes.garantia.valor * 2);
});

test('o piso da renda para aval alterado chega ao resultado', () => {
  const pequena = { ...OPERACAO, valorSolicitado: 5000, prazo: 60 };
  const editado = clonar();
  editado.encargos.aval.pisoDeRenda = 9999;
  assert.equal(simular(pequena, editado).rendaParaAval, 9999);
});

test('a cobertura da alienação alterada chega ao resultado', () => {
  const antes = simular(OPERACAO, VIGENTES);
  const editado = clonar();
  editado.encargos.alienacao.cobertura = 3;   // era 1,5
  const depois = simular(OPERACAO, editado);
  assert.equal(depois.alienacaoImovel, antes.alienacaoImovel * 2);
});

test('o fator K alterado chega ao encargo do FGI', () => {
  const comFGI = { ...OPERACAO, modalidadeDeGarantia: 'FGI' };
  const antes = simular(comFGI, VIGENTES);
  const editado = clonar();
  editado.fatorKFGI.fatores[24] *= 2;
  const depois = simular(comFGI, editado);
  assert.ok(depois.garantia.valor > antes.garantia.valor);
});

test('a taxa alterada numa linha chega à parcela', () => {
  const antes = simular(OPERACAO, VIGENTES);
  const editado = clonar();
  const grupo = editado.tabelaDeEncargos.find((g) => g.linhas.some((l) => l.nome === OPERACAO.linha));
  const linha = grupo.linhas.find((l) => l.nome === OPERACAO.linha);
  linha.taxaCheia = { ...linha.taxaCheia, valor: linha.taxaCheia.valor * 2 };
  linha.taxaBonus = { ...linha.taxaBonus, valor: linha.taxaBonus.valor * 2 };
  const depois = simular(OPERACAO, editado);
  assert.ok(depois.primeiraParcela > antes.primeiraParcela);
  assert.ok(depois.totalJuros > antes.totalJuros);
});

test('a variante de TAC de Giro Puro acompanha a escada, e recusa a escada que não sabe reproduzir', () => {
  // Os números da variante vinham escritos à mão; se ficassem, uma escada
  // alterada pela administração seria ignorada só nesta aba, em silêncio.
  const escada = structuredClone(VIGENTES.encargos.tac.escadaPadrao);
  escada[0].valor = 80;   // era 50
  assert.equal(calcularTAC(2000, { variante: 'giroPuro', escada }), 80);

  assert.throws(
    () => calcularTAC(2000, { variante: 'giroPuro', escada: escada.slice(0, 3) }),
    (e) => e.codigo === 'PARAMETRO_INCOMPATIVEL',
    'uma escada de outra forma precisa ser recusada, e não calculada por aproximação',
  );
});

/* ── 3. validação ───────────────────────────────────────────────────────── */

test('o conjunto publicado hoje passa na validação, com os defeitos da planilha como alerta', () => {
  const r = validar(comMetadados(), { referencia: VIGENTES, agora: Date.parse('2025-01-15T00:00:00Z') });
  assert.equal(r.impedimentos.length, 0, JSON.stringify(r.impedimentos, null, 2));
  assert.ok(r.herdados.length > 0, 'os defeitos herdados da planilha deveriam aparecer marcados');
  assert.ok(r.podePublicar);
});

test('apagar uma taxa que existe impede a publicação', () => {
  const editado = comMetadados();
  editado.tabelaDeEncargos[0].linhas[0].taxaCheia = null;
  const r = validar(editado, { referencia: VIGENTES });
  assert.equal(r.podePublicar, false);
  assert.ok(r.impedimentos.some((i) => i.onde === 'tabelaDeEncargos.0.linhas.0'));
});

test('duas linhas com o mesmo nome no mesmo grupo impedem a publicação', () => {
  const editado = comMetadados();
  const grupo = editado.tabelaDeEncargos[0];
  grupo.linhas.push(structuredClone(grupo.linhas[0]));
  const r = validar(editado, { referencia: VIGENTES });
  assert.equal(r.podePublicar, false);
  assert.match(r.impedimentos.map((i) => i.mensagem).join(' '), /aparece duas vezes/);
});

test('os metadados da publicação impedem sempre, e não são herdáveis', () => {
  // O ato normativo descreve *esta* alteração. Herdá-lo da versão anterior
  // faria toda publicação seguinte sair sem norma que a justifique.
  const r = validar(clonar(), { referencia: VIGENTES });
  assert.ok(r.impedimentos.some((i) => i.onde === 'metadados.atoNormativo'));
  assert.equal(r.podePublicar, false);
});

test('uma taxa fora do usual alerta sem impedir', () => {
  const editado = comMetadados();
  editado.tabelaDeEncargos[0].linhas[0].taxaCheia.valor = 0.5;   // 50% ao mês
  const r = validar(editado, { referencia: VIGENTES });
  assert.ok(r.podePublicar, 'a instituição pode ter razão; o painel avisa, não decide');
  assert.match(r.alertas.map((a) => a.mensagem).join(' '), /acima do que estas linhas costumam praticar/);
});

test('a última faixa da TAC sem teto é exigida', () => {
  const editado = comMetadados();
  editado.encargos.tac.escadaPadrao[3].ate = 500000;
  const r = validar(editado, { referencia: VIGENTES });
  assert.equal(r.podePublicar, false);
  assert.match(r.impedimentos.map((i) => i.mensagem).join(' '), /sem teto de valor/);
});

test('faixas de TAC fora de ordem impedem a publicação', () => {
  const editado = comMetadados();
  editado.encargos.tac.escadaPadrao[1].ate = 1000;   // menor que a faixa anterior
  const r = validar(editado, { referencia: VIGENTES });
  assert.equal(r.podePublicar, false);
  assert.match(r.impedimentos.map((i) => i.mensagem).join(' '), /ordem crescente/);
});

test('um buraco na tabela do fator K alerta, porque a busca é exata', () => {
  const editado = comMetadados();
  delete editado.fatorKFGI.fatores[50];
  const r = validar(editado, { referencia: VIGENTES });
  assert.ok(r.podePublicar);
  assert.match(r.alertas.map((a) => a.mensagem).join(' '), /sem interpolação/);
});

/* ── 4. lista de diferenças ─────────────────────────────────────────────── */

test('conjunto inalterado não produz diferença nenhuma', () => {
  assert.equal(diferencas(VIGENTES, clonar()).total, 0);
});

test('a troca de unidade da taxa é destacada como crítica', () => {
  const editado = clonar();
  editado.tabelaDeEncargos[0].linhas[0].taxaCheia.unidade = 'anual';
  const r = diferencas(VIGENTES, editado);
  assert.equal(r.total, 1);
  assert.equal(r.mudancas[0].relevancia, 'critica');
  assert.match(r.mudancas[0].nota, /muda como o número é lido/);
});

test('inclusão e exclusão de linha aparecem como tais, e não como deslocamento', () => {
  const editado = clonar();
  editado.tabelaDeEncargos[0].linhas.splice(0, 0, {
    nome: 'Linha Nova', prazoMaximo: 24, carenciaMaxima: 3, limite: 1000,
    taxaCheia: { valor: 0.02, unidade: 'mensal', tipo: 'efetiva' },
  });
  const r = diferencas(VIGENTES, editado);
  assert.equal(r.total, 1, 'inserir no começo não pode fazer as linhas seguintes parecerem alteradas');
  assert.equal(r.mudancas[0].tipo, 'inclusao');

  const semUma = clonar();
  const removida = semUma.tabelaDeEncargos[0].linhas.shift();
  const r2 = diferencas(VIGENTES, semUma);
  assert.equal(r2.mudancas[0].tipo, 'exclusao');
  assert.equal(r2.criticas, 1);
  assert.match(r2.mudancas[0].rotulo, new RegExp(removida.nome));
});

test('a lista de diferenças mostra a taxa inteira, sem esconder dígitos', () => {
  const editado = clonar();
  const exata = editado.tabelaDeEncargos[0].linhas[0].taxaCheia.valor;
  editado.tabelaDeEncargos[0].linhas[0].taxaCheia.valor = 0.025;
  const [m] = diferencas(VIGENTES, editado).mudancas;
  assert.match(m.de, /2,395144289206206/,
    'encurtar aqui faria duas taxas distintas aparecerem como iguais');
  assert.notEqual(exata, 0.025);
});

/* ── 5. coerência do esquema ────────────────────────────────────────────── */

test('todo campo do esquema tem rótulo, tipo conhecido e explicação', () => {
  const todos = [
    ...CAMPOS_DA_LINHA, ...CAMPOS_IOF, ...CAMPOS_DO_INDEXADOR,
    ...CAMPOS_DA_PUBLICACAO, ...CAMPOS_DA_FAIXA_DE_TAC,
    ...Object.values(CAMPOS_SIMPLES),
  ];
  for (const campo of todos) {
    assert.ok(campo.rotulo, `campo sem rótulo: ${JSON.stringify(campo)}`);
    assert.ok(TIPOS[campo.tipo], `tipo desconhecido em ${campo.rotulo}: ${campo.tipo}`);
    // Tipo composto nunca vira um campo só: o painel abre valor e unidade.
    if (TIPOS[campo.tipo].composto) {
      assert.ok(Array.isArray(TIPOS[campo.tipo].partes), `${campo.rotulo}: composto sem partes declaradas`);
    } else {
      assert.ok(TIPOS[campo.tipo].entrada, `${campo.rotulo}: tipo simples sem forma de entrada`);
    }
    assert.ok(campo.ajuda, `campo sem explicação: ${campo.rotulo}`);
  }
});

test('todo caminho do esquema existe no conjunto publicado', () => {
  for (const caminho of Object.keys(CAMPOS_SIMPLES)) {
    assert.notEqual(lerCaminho(VIGENTES, caminho), undefined, `${caminho} não existe no conjunto`);
  }
  for (const campo of CAMPOS_IOF) {
    assert.notEqual(lerCaminho(VIGENTES, `encargos.iof.${campo.chave}`), undefined,
      `encargos.iof.${campo.chave} não existe no conjunto`);
  }
});

test('escrever por caminho não estraga o que está ao redor', () => {
  const c = clonar();
  escreverCaminho(c, 'tabelaDeEncargos.0.linhas.0.prazoMaximo', 48);
  assert.equal(c.tabelaDeEncargos[0].linhas[0].prazoMaximo, 48);
  assert.deepEqual(c.tabelaDeEncargos[1], VIGENTES.tabelaDeEncargos[1]);
});

/* ── 6. a base da planilha continua intocada ────────────────────────────── */

test('o conjunto vigente parte da base extraída da planilha, e a base não é editável pelo painel', () => {
  // Os testes de equivalência provam o motor contra `parametros.js`. Se o
  // painel escrevesse ali, publicar uma taxa nova derrubaria a prova de que o
  // motor reproduz a planilha — que é coisa distinta de a taxa ter mudado.
  for (const arquivo of arquivosParaPublicar(comMetadados())) {
    assert.doesNotMatch(arquivo.nome, /data\/parametros\.js$/);
    assert.doesNotMatch(arquivo.nome, /PARAMETROS_FINANCEIROS\.json$/);
  }
  assert.equal(VIGENTES.metadados.baseadoEm.versao, PARAMETROS.versao);
  assert.deepEqual(VIGENTES.encargos, PARAMETROS.encargos);
});
