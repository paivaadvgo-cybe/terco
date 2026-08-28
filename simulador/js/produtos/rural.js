/**
 * Rural — abas `FCO Rural` e `Produtor Empreendedor`.
 *
 * Duas abas distintas, mantidas como perfis separados porque as regras não são
 * as mesmas. O item 19 do escopo pede explicitamente que FCO Rural e FCO
 * Empresarial não virem uma função só, e a razão fica clara aqui: o Rural só
 * tem coluna de município prioritário, e o Produtor Empreendedor tem um motor
 * de carência inteiramente diferente.
 */

/**
 * FCO Rural: Desenvolvimento Rural e FCO Verde. Taxa anual, só prioritário —
 * as colunas de não prioritário estão vazias nesta faixa da tabela.
 *
 * `FCO Verde` vai a 240 meses de prazo, muito além dos 103 que a tabela do
 * fator K cobre: escolher FGI nessa linha com prazo longo não tem fator
 * (ABERTO-05).
 */
export const PERFIL_FCO_RURAL = Object.freeze({
  codigo: 'fcoRural',
  nome: 'FCO Rural e Verde',
  abaDeOrigem: 'FCO Rural',
  gruposDeEncargos: ['Linhas FCO Rural e Verde'],
  regras: Object.freeze({
    convencaoTaxa: 'mensalComposta',
    varianteTAC: 'padrao',
    baseAmortizacao: 'valorFinanciado',
    tratamentoCarencia: 'pagos',
    bonus: Object.freeze({ tipo: 'tabelado' }),
    alienacao: Object.freeze({ descontaParteGarantida: false }),
    indexador: null,
    periodicidades: Object.freeze([1]),
    exigeMunicipio: false,
    modalidadesDeGarantia: Object.freeze(['FAMPE', 'FGI', 'FUNDEQ']),
    percentualGarantidoMinimo: 0.2,
  }),
  // A aba `FCO Rural` também tem um #REF! em C11, na linha
  // `FCO Mini e Micro Geração de Energia`. Ela não aparece aqui porque, na
  // `Tabela de Encargos`, que é a fonte oficial, essa linha pertence ao grupo
  // do FCO Empresarial — e lá ela está bloqueada. A tabela interna da aba é
  // uma cópia local que repete linhas de outra família.
  linhasEmAberto: Object.freeze([]),
});

/**
 * Produtor Empreendedor: duas linhas, e a segunda — `Fruticultura` — aciona o
 * único motor de carência capitalizada do arquivo. Nela o saldo cresce durante
 * a carência e nada é pago; nas outras onze abas os juros da carência são
 * cobrados mês a mês.
 *
 * O encargo de garantia também é diferente: `valor × prazo × 0,001`, sem o
 * percentual garantido que as demais famílias aplicam. E a alienação de imóvel
 * só é exigida acima de R$ 50.000.
 *
 * A célula `C11` desta aba também tem `#REF!`, mas ela seleciona a linha de
 * índice 6, e a aba tem duas linhas. É `#REF!` inalcançável: não há o que
 * bloquear.
 */
export const PERFIL_PRODUTOR = Object.freeze({
  codigo: 'produtorEmpreendedor',
  nome: 'Produtor Empreendedor',
  abaDeOrigem: 'Produtor Empreendedor',
  gruposDeEncargos: Object.freeze([]),
  linhasDaAba: 'Produtor Empreendedor',
  regras: Object.freeze({
    convencaoTaxa: 'mensalComposta',
    varianteTAC: 'padrao',
    baseAmortizacao: 'valorFinanciado',
    tratamentoCarencia: 'pagos',
    tratamentoCarenciaPorLinha: Object.freeze({
      'Produtor Empreendedor Fruticultura': 'capitalizados',
    }),
    bonus: Object.freeze({ tipo: 'tabelado' }),
    alienacao: Object.freeze({ descontaParteGarantida: false, valorMinimo: 50000 }),
    indexador: null,
    periodicidades: Object.freeze([1]),
    modalidadesDeGarantia: Object.freeze(['FAMPE', 'FGI', 'FUNDEQ']),
    percentualGarantidoMinimo: 0.2,
    percentualGarantidoPadrao: 1,
  }),
  linhasEmAberto: Object.freeze([]),
});

export default PERFIL_FCO_RURAL;
