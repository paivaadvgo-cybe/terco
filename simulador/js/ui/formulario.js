/**
 * Formulário de nova simulação.
 *
 * Os campos aparecem conforme a linha escolhida, porque as famílias não pedem
 * as mesmas coisas: o FCO precisa saber se o município é prioritário, o FINEP
 * precisa do porte, Fungetur e FINEP precisam do indexador, e as demais não
 * precisam de nada disso. Mostrar tudo sempre faria o operador preencher
 * campos que não têm efeito, e esconder o que importa.
 *
 * O formulário não calcula. Ele monta a entrada e entrega ao motor.
 */

import { listarProdutos, listarLinhas, PRODUTOS } from './../produtos/produtos.js';
import { sugerirValor, obterIndexador } from './../indexadores/indexadores.js';
import { moeda, meses, taxa, lerValor, lerPercentual } from './formatar.js';

const criar = (tag, atributos = {}, filhos = []) => {
  const el = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (chave === 'class') el.className = valor;
    else if (chave === 'texto') el.textContent = valor;
    else if (chave.startsWith('on')) el.addEventListener(chave.slice(2).toLowerCase(), valor);
    else if (valor !== null && valor !== false) el.setAttribute(chave, valor === true ? '' : valor);
  }
  for (const filho of [].concat(filhos)) {
    if (filho) el.append(typeof filho === 'string' ? document.createTextNode(filho) : filho);
  }
  return el;
};

function campo(rotulo, controle, ajuda) {
  return criar('div', { class: 'campo' }, [
    criar('label', { texto: rotulo, for: controle.id }),
    controle,
    ajuda ? criar('small', { class: 'ajuda', texto: ajuda }) : null,
  ]);
}

function seletor(id, opcoes, aoMudar) {
  const el = criar('select', { id, onChange: aoMudar });
  for (const o of opcoes) {
    el.append(criar('option', {
      value: o.valor, texto: o.rotulo, disabled: o.desabilitada ?? false,
      selected: o.selecionada ?? false,
    }));
  }
  return el;
}

export class Formulario {
  constructor(raiz, aoCalcular) {
    this.raiz = raiz;
    this.aoCalcular = aoCalcular;
    this.estado = {
      produto: 'giro', linha: null, porte: 1, municipioPrioritario: true,
      sistemaAmortizacao: 'SAC',
    };
    // O formulário se redesenha sempre que uma escolha muda quais campos
    // existem — trocar a garantia, o produto, o município. Sem guardar o que
    // já foi digitado, escolher a garantia depois de preencher o valor
    // apagaria o valor, e o cálculo sairia com o padrão sem ninguém notar.
    this.valores = {};
    this.desenhar();
  }

  linhasDisponiveis() {
    const perfil = PRODUTOS[this.estado.produto];
    const opcoes = perfil.regras.exigePorte ? { porte: Number(this.estado.porte) } : {};
    return listarLinhas(this.estado.produto, opcoes);
  }

  linhaAtual() {
    const linhas = this.linhasDisponiveis();
    return linhas.find((l) => l.nome === this.estado.linha) ?? linhas.find((l) => !l.emAberto) ?? linhas[0];
  }

  /** Guarda o que está preenchido, para devolver depois de reconstruir. */
  capturar() {
    if (!this.form) return;
    for (const campo of this.form.querySelectorAll('input[id], select[id]')) {
      this.valores[campo.id] = campo.value;
    }
  }

  /**
   * Devolve os valores guardados aos campos que ainda existem.
   *
   * Prazo e carência são limitados ao teto da linha atual: trocar para uma
   * linha de prazo menor com 60 meses digitados deixaria o formulário num
   * estado que só falharia ao calcular. O valor solicitado não é mexido — se
   * passar do limite, a mensagem de erro diz exatamente isso.
   */
  restaurar(linha) {
    for (const campo of this.form.querySelectorAll('input[id], select[id]')) {
      const guardado = this.valores[campo.id];
      if (guardado === undefined || guardado === '') continue;
      if (campo.id === 'prazo' && linha) {
        campo.value = String(Math.min(Number(guardado), linha.prazoMaximo));
      } else if (campo.id === 'carencia' && linha) {
        campo.value = String(Math.min(Number(guardado), linha.carenciaMaxima ?? 0));
      } else if (campo.tagName === 'SELECT') {
        if ([...campo.options].some((o) => o.value === guardado)) campo.value = guardado;
      } else {
        campo.value = guardado;
      }
    }
    this.capturar();
  }

  desenhar() {
    this.capturar();
    const perfil = PRODUTOS[this.estado.produto];
    const linhas = this.linhasDisponiveis();
    const linha = this.linhaAtual();
    this.estado.linha = linha?.nome ?? null;

    this.raiz.replaceChildren();
    const form = criar('form', {
      class: 'formulario',
      onSubmit: (e) => { e.preventDefault(); this.calcular(); },
    });

    // ── 1. grupo e linha
    form.append(criar('h2', { texto: 'Crédito' }));
    form.append(campo('Grupo de crédito', seletor('produto',
      listarProdutos().map((p) => ({
        valor: p.codigo, rotulo: p.nome, selecionada: p.codigo === this.estado.produto,
      })),
      (e) => { this.estado.produto = e.target.value; this.estado.linha = null; this.desenhar(); })));

    if (perfil.regras.exigePorte) {
      form.append(campo('Porte da empresa', seletor('porte', [
        { valor: 1, rotulo: 'Porte I', selecionada: Number(this.estado.porte) === 1 },
        { valor: 2, rotulo: 'Porte II', selecionada: Number(this.estado.porte) === 2 },
        { valor: 3, rotulo: 'Porte III', selecionada: Number(this.estado.porte) === 3 },
      ], (e) => { this.estado.porte = Number(e.target.value); this.estado.linha = null; this.desenhar(); }),
      'Portes I e II usam uma tabela de taxas; o porte III usa outra.'));
    }

    form.append(campo('Linha de crédito', seletor('linha',
      linhas.map((l) => ({
        valor: l.nome,
        rotulo: l.emAberto ? `${l.nome} — indisponível` : l.nome,
        desabilitada: Boolean(l.emAberto),
        selecionada: l.nome === this.estado.linha,
      })),
      (e) => { this.estado.linha = e.target.value; this.desenhar(); })));

    if (linha?.emAberto) {
      form.append(criar('p', { class: 'aviso aviso-bloqueio' }, [
        criar('strong', { texto: 'Linha indisponível. ' }),
        linha.emAberto.motivo,
      ]));
    }

    if (linha && !linha.emAberto) {
      form.append(criar('p', { class: 'limites' }, [
        `Limite ${moeda(linha.limite)} · prazo até ${meses(linha.prazoMaximo)}`,
        ` · carência até ${meses(linha.carenciaMaxima)}`,
        linha.valorMinimo ? ` · mínimo ${moeda(linha.valorMinimo)}` : null,
      ]));
      if (linha.taxaCheia) {
        form.append(criar('p', { class: 'limites' }, [
          `Taxa cheia ${taxa(linha.taxaCheia)}`,
          linha.taxaBonus ? ` · com bônus ${taxa(linha.taxaBonus)}` : null,
        ]));
      }
    }

    if (perfil.regras.exigeMunicipio && linha?.porMunicipio) {
      const p = linha.porMunicipio;
      form.append(campo('Município', seletor('municipio', [
        {
          valor: 'prioritario',
          rotulo: `Prioritário — ${taxa(p.prioritario.taxaCheia)}`,
          selecionada: this.estado.municipioPrioritario,
        },
        {
          valor: 'naoPrioritario',
          rotulo: p.naoPrioritario?.taxaCheia
            ? `Não prioritário — ${taxa(p.naoPrioritario.taxaCheia)}`
            : 'Não prioritário — sem taxa nesta linha',
          desabilitada: !p.naoPrioritario?.taxaCheia,
          selecionada: !this.estado.municipioPrioritario,
        },
      ], (e) => { this.estado.municipioPrioritario = e.target.value === 'prioritario'; this.desenhar(); }),
      'A classificação do município muda a taxa das linhas do FCO.'));
    }

    // ── 2. operação
    form.append(criar('h2', { texto: 'Operação' }));
    form.append(campo('Valor solicitado',
      criar('input', {
        id: 'valor', type: 'text', inputmode: 'decimal', required: true,
        value: this.valorPadrao(linha), placeholder: '0,00',
      })));
    form.append(campo('Prazo total, em meses',
      criar('input', {
        id: 'prazo', type: 'number', min: 1, step: 1, required: true,
        max: linha?.prazoMaximo ?? 240, value: Math.min(linha?.prazoMaximo ?? 24, 24),
      }), 'Inclui a carência.'));
    form.append(campo('Carência, em meses',
      criar('input', {
        id: 'carencia', type: 'number', min: 0, step: 1, required: true,
        max: linha?.carenciaMaxima ?? 0, value: 0,
      })));

    if (perfil.regras.indexador) {
      const indexador = obterIndexador(perfil.regras.indexador);
      const sugestao = sugerirValor(perfil.regras.indexador);
      form.append(campo(`${indexador.nome} (${indexador.codigo}), % ao ano`,
        criar('input', {
          id: 'indexador', type: 'text', inputmode: 'decimal', required: true,
          value: sugestao ? (sugestao.valor * 100).toFixed(4).replace('.', ',') : '',
          placeholder: '0,0000',
        }),
        sugestao
          ? `Sugestão da tabela de ${sugestao.vigencia}, em ${sugestao.origem}. `
            + 'Confirme o valor vigente antes de simular.'
          : 'A planilha não traz valor de referência para este indexador.'));
    }

    // ── 3. taxa e encargos
    form.append(criar('h2', { texto: 'Taxa e encargos' }));
    form.append(campo('Taxa aplicada', seletor('bonus', [
      { valor: 'bonus', rotulo: 'Com bônus de adimplência', selecionada: true },
      { valor: 'cheia', rotulo: 'Taxa cheia, sem bônus' },
    ]), 'A taxa com bônus é a que remunera o contrato na planilha.'));

    form.append(campo('TAC', seletor('tac', [
      { valor: 'financiada', rotulo: 'Financiada', selecionada: true },
      { valor: 'descontada', rotulo: 'Descontada da liberação' },
    ])));
    form.append(campo('IOF', seletor('iof', [
      { valor: 'financiado', rotulo: 'Financiado', selecionada: true },
      { valor: 'descontado', rotulo: 'Descontado da liberação' },
      { valor: 'naoIncide', rotulo: 'Não incide' },
    ])));

    form.append(campo('Garantia', seletor('garantia', [
      { valor: '', rotulo: 'Sem encargo de garantia', selecionada: true },
      ...perfil.regras.modalidadesDeGarantia.map((m) => ({ valor: m, rotulo: m })),
    ], (e) => { this.estado.garantia = e.target.value; this.desenhar(); })));

    if (this.estado.garantia) {
      form.append(campo('Percentual garantido',
        criar('input', {
          id: 'percentualGarantido', type: 'number', step: '0.05',
          min: perfil.regras.percentualGarantidoMinimo, max: 1,
          value: perfil.regras.percentualGarantidoPadrao ?? 0.8,
        }), `Mínimo ${perfil.regras.percentualGarantidoMinimo}.`));
      form.append(campo('Cobrança da garantia', seletor('garantiaFinanciada', [
        { valor: 'descontada', rotulo: 'Descontada da liberação', selecionada: true },
        { valor: 'financiada', rotulo: 'Financiada' },
      ])));
    }

    // ── 4. sistema
    form.append(criar('h2', { texto: 'Sistema de amortização' }));
    form.append(campo('Sistema', seletor('sistema', [
      { valor: 'SAC', rotulo: 'SAC — o sistema da planilha', selecionada: this.estado.sistemaAmortizacao === 'SAC' },
      { valor: 'PRICE', rotulo: 'PRICE — prestação constante', selecionada: this.estado.sistemaAmortizacao === 'PRICE' },
    ], (e) => { this.estado.sistemaAmortizacao = e.target.value; }),
    'A planilha só implementa o SAC; o PRICE é extensão do aplicativo.'));

    form.append(campo('Data da proposta',
      criar('input', {
        id: 'dataProposta', type: 'date', required: true,
        value: new Date().toISOString().slice(0, 10),
      }), 'Os vencimentos avançam de trinta em trinta dias, como na planilha.'));

    form.append(criar('div', { class: 'acoes' }, [
      criar('button', {
        type: 'submit', class: 'principal',
        disabled: Boolean(linha?.emAberto),
      }, ['Calcular']),
    ]));

    this.raiz.append(form);
    this.form = form;
    this.restaurar(linha && !linha.emAberto ? linha : null);
  }

  valorPadrao(linha) {
    if (!linha) return '';
    const sugerido = Math.min(linha.limite ?? 50000, 50000);
    return sugerido.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  /** Monta a entrada do motor a partir dos campos. Não calcula nada. */
  montarEntrada() {
    const v = (id) => this.form.querySelector(`#${id}`)?.value;
    const perfil = PRODUTOS[this.estado.produto];
    const entrada = {
      produto: this.estado.produto,
      linha: this.estado.linha,
      valorSolicitado: lerValor(v('valor')),
      prazo: Number.parseInt(v('prazo'), 10),
      carencia: Number.parseInt(v('carencia'), 10),
      usarBonus: v('bonus') !== 'cheia',
      tacFinanciada: v('tac') === 'financiada',
      iofIncide: v('iof') !== 'naoIncide',
      iofFinanciado: v('iof') === 'financiado',
      sistemaAmortizacao: v('sistema'),
      dataProposta: v('dataProposta'),
    };
    if (perfil.regras.exigePorte) entrada.porte = Number(this.estado.porte);
    if (perfil.regras.exigeMunicipio) entrada.municipioPrioritario = this.estado.municipioPrioritario;
    if (perfil.regras.indexador) entrada.valorDoIndexador = lerPercentual(v('indexador'));
    if (this.estado.garantia) {
      entrada.modalidadeDeGarantia = this.estado.garantia;
      entrada.percentualGarantido = Number.parseFloat(v('percentualGarantido'));
      entrada.garantiaFinanciada = v('garantiaFinanciada') === 'financiada';
    }
    return entrada;
  }

  calcular() {
    this.aoCalcular(this.montarEntrada());
  }
}

export { criar };
