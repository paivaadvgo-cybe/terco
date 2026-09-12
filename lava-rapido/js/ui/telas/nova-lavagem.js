/**
 * Novo atendimento: da placa ao carro lavando.
 *
 * Quatro passos, um por tela, sem rolagem: placa, tipo, serviço, confirmação.
 * Cada passo mostra poucos botões grandes e nenhum campo que possa ser deixado
 * em branco por engano. O caminho inteiro cabe em quatro toques quando a placa
 * já é conhecida — e é assim que precisa ser, porque acontece com o cliente
 * esperando de pé ao lado.
 *
 * **Modo rápido** (`?rapido=1`) tira o passo de confirmação: escolher o serviço
 * já registra e já oferece o próximo veículo. É para o horário de pico, quando
 * três carros chegam juntos e conferir cada tela custa mais do que vale.
 *
 * **A placa nunca trava o atendimento.** Câmera que não lê, aparelho sem o
 * recurso, placa suja, carro sem placa: todos os caminhos terminam em uma
 * lavagem registrada. É a regra mais importante desta tela.
 */

import { el, botao, cartao, campo, entrada, selecao } from '../elementos.js';
import { moeda, moedaCurta, lerValor } from '../formatar.js';
import { avisar, abrirFolha } from '../avisos.js';
import { TIPOS, nomeDoTipo } from '../../dominio/veiculos.js';
import { normalizar, eValida, paraRegistro, exibir as exibirPlaca } from '../../dominio/placa.js';
import { exibirDia, dia as diaDe } from '../../dominio/datas.js';
import * as Reconhecimento from '../../servicos/reconhecimento-placa.js';
import * as Foto from '../../servicos/foto.js';

export async function telaNovaLavagem(contexto, parametros = {}) {
  const { armazenamento } = contexto;
  const configuracao = await armazenamento.configuracao();
  const funcionarios = configuracao.usarFuncionarios ? await armazenamento.funcionarios() : [];
  const modoRapido = parametros.rapido === '1' || configuracao.modoRapido === true;

  const tela = el('div', { classe: 'tela tela-nova' });

  /** O que já se sabe deste atendimento. Vive enquanto a tela vive. */
  const atendimento = {
    passo: 'placa',
    placa: null,
    ficha: null,
    tipo: null,
    modelo: '',
    servico: null,
    valor: null,
    funcionarioId: funcionarios[0]?.id ?? null,
    fotoId: null,
    fotoEndereco: null,
    digitando: false,
  };

  const ir = (passo) => { atendimento.passo = passo; desenhar(); };

  /* ------------------------------------------------------------------ placa */

  async function usarPlaca(texto) {
    const placa = paraRegistro(texto);
    atendimento.placa = placa;
    atendimento.ficha = placa ? await armazenamento.fichaDaPlaca(placa) : null;
    if (atendimento.ficha) {
      // Cliente conhecido: o tipo dele já vem preenchido, e o passo do tipo
      // deixa de ser uma pergunta para virar uma confirmação de um toque.
      atendimento.tipo = atendimento.ficha.tipo ?? null;
      atendimento.modelo = atendimento.ficha.modelo ?? '';
    }
    ir('tipo');
  }

  async function lerDaCamera(arquivo) {
    if (!arquivo) return;
    let blob = arquivo;
    try {
      ({ blob } = await Foto.otimizar(arquivo));
    } catch {
      // Segue com o arquivo original: otimizar é economia, não requisito.
    }

    const leitura = await Reconhecimento.reconhecer(blob);
    try {
      atendimento.fotoId = await armazenamento.salvarFoto(blob);
      atendimento.fotoEndereco = Foto.enderecoDe(blob);
    } catch {
      avisar('Não foi possível guardar a foto', 'atencao');
    }

    if (leitura.ok) {
      avisar(`Placa lida: ${leitura.placa}`, 'ok');
      await usarPlaca(leitura.placa);
      return;
    }
    atendimento.digitando = true;
    desenhar();
    avisar(`${leitura.motivo}. Digite a placa.`, 'atencao', 3400);
  }

  function passoPlaca() {
    const seletorDeFoto = el('input', {
      type: 'file',
      accept: 'image/*',
      classe: 'escondido',
      atributos: { capture: 'environment' },
      onchange: (evento) => lerDaCamera(evento.target.files?.[0]),
    });

    const campoPlaca = entrada({
      classe: 'entrada entrada-placa',
      placeholder: 'ABC1D23',
      maxLength: 8,
      autocomplete: 'off',
      autocapitalize: 'characters',
      spellcheck: false,
      oninput: (evento) => {
        const posicao = evento.target.selectionStart;
        evento.target.value = normalizar(evento.target.value);
        evento.target.setSelectionRange(posicao, posicao);
        dica.textContent = mensagemDaPlaca(evento.target.value);
      },
      onkeydown: (evento) => { if (evento.key === 'Enter') confirmarDigitada(); },
    });

    const dica = el('p', { classe: 'campo-dica', texto: '' });
    const confirmarDigitada = () => {
      const valor = normalizar(campoPlaca.value);
      if (!valor) { avisar('Digite a placa ou toque em SEM PLACA', 'atencao'); return; }
      usarPlaca(valor);
    };

    const digitacao = el('div', { classe: 'bloco-digitacao' }, [
      campo('Placa', campoPlaca),
      dica,
      botao('CONTINUAR', confirmarDigitada, { tipo: 'principal', classe: 'largo' }),
    ]);

    const meio = Reconhecimento.meioDisponivel();

    /*
     * Onde a leitura automática não existe — o iPhone inteiro, por exemplo —,
     * o botão grande é o de digitar.
     *
     * «LER PLACA» continua em primeiro lugar, porque a foto do veículo tem
     * valor por si só, mas deixar de destaque um caminho que naquele aparelho
     * nunca vai ler a placa é mandar o operador tentar duas vezes cada carro.
     */
    const destaqueNaCamera = Boolean(meio);

    return cartao([
      el('h2', { classe: 'passo-titulo', texto: 'Qual é a placa?' }),
      atendimento.digitando ? digitacao : el('div', { classe: 'coluna-botoes' }, [
        botao('📷 LER PLACA', () => seletorDeFoto.click(), {
          tipo: destaqueNaCamera ? 'principal' : 'secundario',
          classe: destaqueNaCamera ? 'gigante' : 'largo',
        }),
        botao('⌨️ DIGITAR PLACA', () => { atendimento.digitando = true; desenhar(); }, {
          tipo: destaqueNaCamera ? 'secundario' : 'principal',
          classe: destaqueNaCamera ? 'largo' : 'gigante',
        }),
        botao('SEM PLACA', () => usarPlaca(''), { tipo: 'fantasma', classe: 'largo' }),
      ]),
      atendimento.digitando
        ? botao('📷 Tentar pela câmera', () => seletorDeFoto.click(), { tipo: 'fantasma', classe: 'largo' })
        : null,
      el('p', {
        classe: 'observacao',
        texto: meio
          ? 'A câmera tenta ler a placa. Se não conseguir, é só digitar.'
          : 'Este aparelho não faz leitura automática — a foto é guardada e a placa é digitada.',
      }),
      seletorDeFoto,
    ]);
  }

  function mensagemDaPlaca(valor) {
    if (!valor) return '';
    if (eValida(valor)) return '✓ placa válida';
    return 'Fora do padrão ABC1D23 — dá para continuar assim mesmo.';
  }

  /* ------------------------------------------------------------------- tipo */

  function passoTipo() {
    const ficha = atendimento.ficha;
    const conhecido = ficha
      ? el('div', { classe: 'ficha-placa' }, [
        el('p', { classe: 'ficha-titulo', texto: exibirPlaca(atendimento.placa) }),
        el('p', {
          classe: 'ficha-detalhe',
          texto: `${ficha.lavagens} ${ficha.lavagens === 1 ? 'lavagem anterior' : 'lavagens anteriores'}`
            + (ficha.ultima ? ` · última em ${exibirDia(diaDe(ficha.ultima.criadaEm))}` : ''),
        }),
        ficha.modelo ? el('p', { classe: 'ficha-detalhe', texto: ficha.modelo }) : null,
      ])
      : el('p', { classe: 'ficha-titulo', texto: exibirPlaca(atendimento.placa) });

    return cartao([
      conhecido,
      el('h2', { classe: 'passo-titulo', texto: 'Tipo de veículo' }),
      el('div', { classe: 'grade-tipos' }, TIPOS.map((tipo) => el('button', {
        classe: `tipo ${atendimento.tipo === tipo.id ? 'escolhido' : ''}`.trim(),
        type: 'button',
        aoTocar: () => { atendimento.tipo = tipo.id; ir('servico'); },
      }, [
        el('span', { classe: 'tipo-icone', texto: tipo.icone }),
        el('span', { classe: 'tipo-nome', texto: tipo.nome }),
      ]))),
      botao('‹ Voltar', () => { atendimento.digitando = false; ir('placa'); }, { tipo: 'fantasma', classe: 'largo' }),
    ]);
  }

  /* ---------------------------------------------------------------- serviço */

  async function passoServico() {
    const opcoes = await armazenamento.opcoesDeServico(atendimento.tipo);
    const sugerido = atendimento.ficha?.ultimoServicoId;

    const escolher = (opcao, valor) => {
      atendimento.servico = opcao.servico;
      atendimento.valor = valor;
      if (modoRapido) registrar();
      else ir('confirmacao');
    };

    const pedirValor = (opcao) => {
      const campoValor = entrada({
        type: 'text', inputMode: 'decimal', placeholder: '0,00', classe: 'entrada entrada-valor',
      });
      const conteudo = el('div', { classe: 'coluna' }, [
        campo('Valor cobrado', campoValor, 'Só desta lavagem. A tabela de preços não muda.'),
        botao('CONFIRMAR', () => {
          const valor = lerValor(campoValor.value);
          if (!valor) { avisar('Informe o valor', 'atencao'); return; }
          folha.fechar();
          escolher(opcao, valor);
        }, { tipo: 'principal', classe: 'largo' }),
      ]);
      const folha = abrirFolha(opcao.servico.nome, conteudo);
      setTimeout(() => campoValor.focus(), 80);
    };

    return cartao([
      el('p', { classe: 'passo-contexto', texto: `${exibirPlaca(atendimento.placa)} · ${nomeDoTipo(atendimento.tipo)}` }),
      el('h2', { classe: 'passo-titulo', texto: 'Serviço' }),
      el('div', { classe: 'coluna-botoes' }, opcoes.map((opcao) => el('button', {
        classe: `servico ${opcao.servico.id === sugerido ? 'sugerido' : ''}`.trim(),
        type: 'button',
        aoTocar: () => (opcao.valor === null ? pedirValor(opcao) : escolher(opcao, opcao.valor)),
      }, [
        el('span', { classe: 'servico-nome', texto: opcao.servico.nome }),
        el('span', { classe: 'servico-valor', texto: opcao.valor === null ? 'definir' : moedaCurta(opcao.valor) }),
        opcao.servico.id === sugerido ? el('span', { classe: 'servico-marca', texto: 'de costume' }) : null,
      ]))),
      opcoes.length === 0
        ? el('p', { classe: 'observacao', texto: 'Nenhum preço cadastrado para este tipo. Use o serviço personalizado ou ajuste a tabela em Ajustes › Preços.' })
        : null,
      botao('‹ Voltar', () => ir('tipo'), { tipo: 'fantasma', classe: 'largo' }),
    ]);
  }

  /* ----------------------------------------------------------- confirmação */

  function passoConfirmacao() {
    const campoModelo = entrada({
      placeholder: 'Onix, HB20, Corolla…',
      value: atendimento.modelo ?? '',
      oninput: (evento) => { atendimento.modelo = evento.target.value; },
    });

    const seletorDeFoto = el('input', {
      type: 'file',
      accept: 'image/*',
      classe: 'escondido',
      atributos: { capture: 'environment' },
      onchange: async (evento) => {
        const arquivo = evento.target.files?.[0];
        if (!arquivo) return;
        try {
          const { blob } = await Foto.otimizar(arquivo);
          atendimento.fotoId = await armazenamento.salvarFoto(blob);
          atendimento.fotoEndereco = Foto.enderecoDe(blob);
          desenhar();
          avisar('Foto guardada', 'ok');
        } catch {
          avisar('Não foi possível preparar a foto', 'erro');
        }
      },
    });

    const equipe = funcionarios.length
      ? campo('Responsável', selecao(
        [{ valor: '', nome: '— sem responsável —' }, ...funcionarios.map((f) => ({ valor: f.id, nome: f.nome }))],
        atendimento.funcionarioId ?? '',
        { onchange: (evento) => { atendimento.funcionarioId = evento.target.value || null; } },
      ))
      : null;

    return cartao([
      el('h2', { classe: 'passo-titulo', texto: 'Confirmar' }),
      el('dl', { classe: 'resumo' }, [
        el('dt', { texto: 'Veículo' }),
        el('dd', { classe: 'resumo-forte', texto: exibirPlaca(atendimento.placa) }),
        el('dd', { texto: [nomeDoTipo(atendimento.tipo), atendimento.modelo].filter(Boolean).join(' · ') }),
        el('dt', { texto: 'Serviço' }),
        el('dd', { classe: 'resumo-forte', texto: atendimento.servico.nome }),
        el('dt', { texto: 'Valor' }),
        el('dd', { classe: 'resumo-valor', texto: moeda(atendimento.valor) }),
      ]),
      campo('Modelo (opcional)', campoModelo),
      equipe,
      atendimento.fotoEndereco
        ? el('img', { classe: 'foto-previa', src: atendimento.fotoEndereco, alt: 'Foto do veículo' })
        : null,
      botao(atendimento.fotoEndereco ? '📷 Trocar foto' : '📷 Foto do veículo (opcional)',
        () => seletorDeFoto.click(), { tipo: 'fantasma', classe: 'largo' }),
      botao('INICIAR LAVAGEM', registrar, { tipo: 'principal', classe: 'gigante' }),
      botao('‹ Voltar', () => ir('servico'), { tipo: 'fantasma', classe: 'largo' }),
      seletorDeFoto,
    ]);
  }

  /* ------------------------------------------------------------- registro */

  let registrando = false;
  async function registrar() {
    // Dois toques no mesmo botão registrariam duas lavagens. Num celular
    // molhado, dois toques no mesmo botão são a regra, não a exceção.
    if (registrando) return;
    registrando = true;
    try {
      const funcionario = funcionarios.find((f) => f.id === atendimento.funcionarioId) ?? null;
      const lavagem = await armazenamento.registrarLavagem({
        placa: atendimento.placa,
        tipo: atendimento.tipo,
        modelo: atendimento.modelo,
        servicoId: atendimento.servico.id,
        servicoNome: atendimento.servico.nome,
        valor: atendimento.valor,
        funcionarioId: funcionario?.id ?? null,
        funcionarioNome: funcionario?.nome ?? null,
        fotoId: atendimento.fotoId,
      });
      atendimento.registrada = lavagem;
      ir('pronto');
    } catch (erro) {
      avisar(erro.message, 'erro');
    } finally {
      registrando = false;
    }
  }

  function passoPronto() {
    const lavagem = atendimento.registrada;
    return cartao([
      el('p', { classe: 'comprovante-marca', texto: '✅' }),
      el('p', { classe: 'comprovante-titulo', texto: 'Veículo registrado' }),
      el('p', { classe: 'comprovante-valor', texto: exibirPlaca(lavagem.placa) }),
      el('p', { classe: 'comprovante-forma', texto: `${lavagem.servicoNome} · ${moeda(lavagem.valor)}` }),
      botao('+ PRÓXIMO VEÍCULO', () => contexto.ir(modoRapido ? 'nova?rapido=1' : 'nova'), { tipo: 'principal', classe: 'gigante' }),
      botao('Ver o pátio', () => contexto.ir('lavagens'), { tipo: 'secundario', classe: 'largo' }),
      botao('Início', () => contexto.ir('inicio'), { tipo: 'fantasma', classe: 'largo' }),
    ], 'pronto');
  }

  /* ------------------------------------------------------------- desenho */

  async function desenhar() {
    const passos = {
      placa: passoPlaca,
      tipo: passoTipo,
      servico: passoServico,
      confirmacao: passoConfirmacao,
      pronto: passoPronto,
    };
    const conteudo = await passos[atendimento.passo]();
    tela.replaceChildren(
      trilha(atendimento.passo, modoRapido),
      conteudo,
    );
  }

  await desenhar();
  return tela;
}

/** A trilha de quatro pontos: onde estou, quanto falta. */
function trilha(passoAtual, modoRapido) {
  const passos = ['placa', 'tipo', 'servico', modoRapido ? null : 'confirmacao'].filter(Boolean);
  const indice = passos.indexOf(passoAtual);
  return el('div', { classe: 'trilha', atributos: { 'aria-hidden': 'true' } },
    passos.map((_, i) => el('span', {
      classe: `trilha-ponto ${i <= indice && indice >= 0 ? 'feito' : ''}`.trim(),
    })));
}
