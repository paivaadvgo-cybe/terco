/**
 * StorageService — a única porta de entrada dos dados.
 *
 * Nenhuma tela conhece IndexedDB. Elas conhecem «registrar lavagem», «fila»,
 * «pendentes», «fechar o dia». Essa fronteira é o que torna possível, mais
 * tarde, pôr um banco remoto atrás sem reescrever a interface: troca-se o
 * driver, e o resto continua igual. O MVP não tem servidor nenhum, e é por
 * isso que a fronteira precisa ser desenhada agora — depois seria escavação.
 *
 * Três regras valem em todo o arquivo:
 *
 * · **Dinheiro em centavos, inteiro.** Sempre.
 * · **A passagem de estado é do domínio.** Este arquivo lê, chama a função de
 *   `dominio/lavagem.js` e grava o que ela devolver. Mudar `estado` na mão aqui
 *   criaria um segundo conjunto de regras, e o dia em que os dois discordassem
 *   ninguém saberia qual era o certo.
 * · **Nada é apagado sozinho.** A restauração e o modo demonstração apagam, mas
 *   só depois de alguém confirmar, de dedo em cima.
 *
 * **Sobre pagamentos.** Não há coleção de pagamentos: o pagamento mora dentro da
 * lavagem que ele quita. Duas cópias do mesmo dinheiro — uma na lavagem, outra
 * num livro à parte — é a forma clássica de um caixa deixar de fechar, e nenhuma
 * das duas seria obviamente a errada. `pagamentos()` monta a lista a partir das
 * lavagens pagas, que é a mesma informação sem a segunda verdade.
 */

import { SERVICOS_PADRAO } from '../dominio/servicos.js';
import { tabelaPadrao, chave as chaveDoPreco, servicosDisponiveis } from '../dominio/precos.js';
import * as Lavagem from '../dominio/lavagem.js';
import { ESTADOS } from '../dominio/lavagem.js';
import { dia as diaDe, intervalo as intervaloDe } from '../dominio/datas.js';
import { NO_BACKUP, NOMES } from './esquema.js';
import { resumoDoPin, conferirPin } from './pin.js';
import {
  lavagensDeDemonstracao, despesasDeDemonstracao, veiculosDeDemonstracao, FUNCIONARIOS_DEMO,
} from '../dominio/demonstracao.js';

export const CONFIGURACAO_PADRAO = {
  id: 'app',
  nome: 'Meu Lava-Rápido',
  telefone: '',
  endereco: '',
  pin: null,
  tema: 'auto',
  usarFuncionarios: true,
  modoRapido: false,
  demonstracao: false,
};

export const CATEGORIAS_DE_DESPESA = [
  { id: 'produto', nome: 'Produto' },
  { id: 'agua', nome: 'Água' },
  { id: 'energia', nome: 'Energia' },
  { id: 'manutencao', nome: 'Manutenção' },
  { id: 'aluguel', nome: 'Aluguel' },
  { id: 'outros', nome: 'Outros' },
];

export function novoId(prefixo = '') {
  const base = globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefixo ? `${prefixo}_${base}` : base;
}

/**
 * Abre o serviço sobre um driver já pronto.
 *
 * `agora` é injetável porque o aplicativo inteiro gira em torno de «hoje»:
 * sem poder mover o relógio, testar o fechamento de ontem exigiria esperar
 * até amanhã.
 */
export async function criarArmazenamento(driver, { agora = () => Date.now() } = {}) {
  const servico = {
    driver,
    agora,

    /* ----------------------------------------------------------- configuração */

    async configuracao() {
      return (await driver.ler('configuracao', 'app')) ?? { ...CONFIGURACAO_PADRAO };
    },

    async salvarConfiguracao(parcial) {
      const atual = await servico.configuracao();
      const nova = { ...atual, ...parcial, id: 'app' };
      await driver.gravar('configuracao', nova);
      return nova;
    },

    async definirPin(pin) {
      return servico.salvarConfiguracao({ pin: pin ? await resumoDoPin(pin) : null });
    },

    async temPin() {
      return Boolean((await servico.configuracao()).pin);
    },

    async conferirPin(pin) {
      return conferirPin(pin, (await servico.configuracao()).pin);
    },

    /* -------------------------------------------------------------- serviços */

    async servicos() {
      const lista = await driver.listar('servicos');
      return lista.sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
    },

    async salvarServico(servicoNovo) {
      const registro = {
        personalizado: false,
        ativo: true,
        ordem: (await driver.listar('servicos')).length + 1,
        ...servicoNovo,
        id: servicoNovo.id ?? novoId('srv'),
      };
      await driver.gravar('servicos', registro);
      return registro;
    },

    /**
     * Remover um serviço não apaga as lavagens que o usaram.
     *
     * O nome e o valor ficam copiados dentro de cada lavagem justamente para
     * isto: mexer na tabela hoje não pode reescrever o que foi cobrado ontem.
     */
    async removerServico(id) {
      await driver.apagar('servicos', id);
      for (const preco of await driver.listar('precos')) {
        if (preco.servicoId === id) await driver.apagar('precos', preco.id);
      }
    },

    /* ---------------------------------------------------------------- preços */

    precos: () => driver.listar('precos'),

    async salvarPreco({ tipo, servicoId, valor }) {
      const id = chaveDoPreco(tipo, servicoId);
      if (valor === null || valor === undefined || valor === '') {
        await driver.apagar('precos', id);
        return null;
      }
      const registro = { id, tipo, servicoId, valor: Math.round(Number(valor)) };
      await driver.gravar('precos', registro);
      return registro;
    },

    /** O que pode ser vendido para este tipo de veículo, com preço. */
    async opcoesDeServico(tipo) {
      return servicosDisponiveis(await servico.servicos(), await driver.listar('precos'), tipo);
    },

    /* ----------------------------------------------------------- funcionários */

    async funcionarios({ incluirInativos = false } = {}) {
      const lista = await driver.listar('funcionarios');
      return lista
        .filter((f) => incluirInativos || f.ativo !== false)
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    },

    async salvarFuncionario(funcionario) {
      const registro = { ativo: true, ...funcionario, id: funcionario.id ?? novoId('func') };
      await driver.gravar('funcionarios', registro);
      return registro;
    },

    removerFuncionario: (id) => driver.apagar('funcionarios', id),

    /* --------------------------------------------------------------- veículos */

    veiculo: (placa) => (placa ? driver.ler('veiculos', placa) : Promise.resolve(null)),

    veiculos: () => driver.listar('veiculos'),

    /**
     * O que se sabe de uma placa antes de atender.
     *
     * É o «reconhecimento de cliente» inteiro: quantas vezes veio, quando foi a
     * última e o que costuma pedir. Sem cadastro, sem telefone, sem ficha — e
     * sem nada que o cliente não tenha mostrado ao estacionar.
     */
    async fichaDaPlaca(placa) {
      if (!placa) return null;
      const veiculo = await driver.ler('veiculos', placa);
      const lavagens = (await driver.listarPor('lavagens', 'placa', placa))
        .filter((l) => l.estado !== ESTADOS.CANCELADO)
        .sort((a, b) => b.criadaEm - a.criadaEm);
      if (!veiculo && lavagens.length === 0) return null;
      return {
        placa,
        tipo: veiculo?.tipo ?? lavagens[0]?.tipo ?? null,
        modelo: veiculo?.modelo ?? lavagens[0]?.modelo ?? '',
        lavagens: lavagens.length,
        ultima: lavagens[0] ?? null,
        ultimoServicoId: lavagens[0]?.servicoId ?? null,
        historico: lavagens,
      };
    },

    /* --------------------------------------------------------------- lavagens */

    /**
     * Registra uma lavagem.
     *
     * `iniciarAgora` é o normal: quem toca em «INICIAR LAVAGEM» está com o carro
     * na frente e a mangueira na mão. «Aguardando» existe para a fila de espera
     * em horário de pico, quando o carro chega e ninguém pode começar ainda.
     */
    async registrarLavagem(dados, { iniciarAgora = true } = {}) {
      const instante = agora();
      const lavagem = {
        id: novoId('lav'),
        placa: dados.placa ?? null,
        tipo: dados.tipo ?? 'outro',
        modelo: (dados.modelo ?? '').trim(),
        servicoId: dados.servicoId,
        servicoNome: dados.servicoNome,
        valor: Math.round(Number(dados.valor) || 0),
        funcionarioId: dados.funcionarioId ?? null,
        funcionarioNome: dados.funcionarioNome ?? null,
        fotoId: dados.fotoId ?? null,
        observacao: (dados.observacao ?? '').trim(),
        estado: ESTADOS.AGUARDANDO,
        criadaEm: instante,
        dia: diaDe(instante),
      };

      const gravar = iniciarAgora ? Lavagem.iniciar(lavagem, instante) : lavagem;
      await driver.gravar('lavagens', gravar);
      if (gravar.placa) await servico.anotarVeiculo(gravar);
      return gravar;
    },

    /** Mantém a ficha da placa em dia. A contagem é a soma das lavagens válidas. */
    async anotarVeiculo(lavagem) {
      const anterior = (await driver.ler('veiculos', lavagem.placa)) ?? {
        placa: lavagem.placa, criadoEm: lavagem.criadaEm, lavagens: 0,
      };
      await driver.gravar('veiculos', {
        ...anterior,
        tipo: lavagem.tipo,
        modelo: lavagem.modelo || anterior.modelo || '',
        lavagens: (anterior.lavagens ?? 0) + 1,
        ultimaEm: lavagem.criadaEm,
      });
    },

    lavagem: (id) => driver.ler('lavagens', id),

    /** Aplica uma passagem de estado e grava. O domínio decide se ela é legal. */
    async passar(id, transformar) {
      const lavagem = await driver.ler('lavagens', id);
      if (!lavagem) throw new Error(`lavagem não encontrada: ${id}`);
      const nova = transformar(lavagem, agora());
      await driver.gravar('lavagens', nova);
      return nova;
    },

    iniciar: (id) => servico.passar(id, Lavagem.iniciar),
    finalizar: (id) => servico.passar(id, Lavagem.finalizar),
    receber: (id, forma) => servico.passar(id, (l, quando) => Lavagem.receber(l, forma, quando)),
    deixarPendente: (id) => servico.passar(id, Lavagem.marcarPendente),
    cancelar: (id, motivo = '') => servico.passar(id, (l, quando) => Lavagem.cancelar(l, motivo, quando)),

    /**
     * Apaga a lavagem de vez.
     *
     * Existe, e quase nunca deve ser usado: cancelar preserva o rastro, apagar
     * não. Fica para o registro criado por engano em duplicidade, que ninguém
     * quer ver no histórico. A contagem da placa é acertada junto, senão o
     * «5 lavagens anteriores» passa a contar uma lavagem que não existe mais.
     */
    async apagarLavagem(id) {
      const lavagem = await driver.ler('lavagens', id);
      if (!lavagem) return;
      await driver.apagar('lavagens', id);
      if (lavagem.fotoId) await driver.apagar('fotos', lavagem.fotoId);
      if (lavagem.placa) {
        const veiculo = await driver.ler('veiculos', lavagem.placa);
        if (veiculo) {
          await driver.gravar('veiculos', { ...veiculo, lavagens: Math.max(0, (veiculo.lavagens ?? 1) - 1) });
        }
      }
    },

    lavagensDoDia: (diaTexto) => driver.listarPor('lavagens', 'dia', diaTexto),

    async lavagensNoIntervalo({ de, ate }) {
      const todas = await driver.listar('lavagens');
      return todas
        .filter((l) => l.criadaEm >= de && l.criadaEm < ate)
        .sort((a, b) => b.criadaEm - a.criadaEm);
    },

    /** O pátio agora: aguardando e em lavagem, do mais antigo para o mais novo. */
    async fila() {
      const todas = await driver.listar('lavagens');
      return todas.filter(Lavagem.emAtendimento).sort((a, b) => a.criadaEm - b.criadaEm);
    },

    /**
     * Quem saiu devendo.
     *
     * Entra também o que está `finalizado` sem pagamento: é a lavagem entregue
     * em que ninguém tocou em botão nenhum. Deixá-la de fora esconderia a
     * dívida justamente no caso em que o registro foi esquecido no meio do
     * movimento, que é quando ela mais some.
     */
    async pendentes() {
      const todas = await driver.listar('lavagens');
      return todas.filter(Lavagem.devendo).sort((a, b) => a.criadaEm - b.criadaEm);
    },

    async movimentoDoDia(diaTexto = diaDe(agora())) {
      const doDia = await servico.lavagensDoDia(diaTexto);
      return doDia.sort((a, b) => b.criadaEm - a.criadaEm);
    },

    /** Os números da tela inicial, numa leitura só. */
    async resumoDeHoje() {
      const hoje = diaDe(agora());
      const doDia = await servico.lavagensDoDia(hoje);
      const validas = doDia.filter((l) => l.estado !== ESTADOS.CANCELADO);
      const pendentes = await servico.pendentes();
      return {
        dia: hoje,
        lavagens: validas.length,
        recebido: validas.filter(Lavagem.recebida)
          .reduce((soma, l) => soma + (Number(l.pagamento?.valor ?? l.valor) || 0), 0),
        emLavagem: doDia.filter((l) => l.estado === ESTADOS.LAVANDO).length,
        naFila: (await servico.fila()).length,
        pendentes: pendentes.length,
        valorPendente: pendentes.reduce((soma, l) => soma + (Number(l.valor) || 0), 0),
        movimento: validas.sort((a, b) => b.criadaEm - a.criadaEm),
      };
    },

    /** Lista de pagamentos, montada a partir das lavagens pagas. */
    async pagamentos(intervalo = intervaloDe('hoje', agora())) {
      const lavagens = await servico.lavagensNoIntervalo(intervalo);
      return lavagens
        .filter((l) => l.estado === ESTADOS.PAGO && l.pagamento)
        .map((l) => ({
          lavagemId: l.id,
          placa: l.placa,
          valor: l.pagamento.valor ?? l.valor,
          forma: l.pagamento.forma,
          em: l.pagamento.em,
          dia: diaDe(l.pagamento.em),
        }));
    },

    /* --------------------------------------------------------------- despesas */

    async despesas(intervalo = null) {
      const todas = await driver.listar('despesas');
      const filtradas = intervalo
        ? todas.filter((d) => d.em >= intervalo.de && d.em < intervalo.ate)
        : todas;
      return filtradas.sort((a, b) => b.em - a.em);
    },

    async salvarDespesa(despesa) {
      const instante = despesa.em ?? agora();
      const registro = {
        id: despesa.id ?? novoId('desp'),
        descricao: (despesa.descricao ?? '').trim(),
        valor: Math.round(Number(despesa.valor) || 0),
        categoria: despesa.categoria ?? 'outros',
        em: instante,
        dia: despesa.dia ?? diaDe(instante),
      };
      await driver.gravar('despesas', registro);
      return registro;
    },

    removerDespesa: (id) => driver.apagar('despesas', id),

    /* ------------------------------------------------------------------ fotos */

    async salvarFoto(blob) {
      const id = novoId('foto');
      await driver.gravar('fotos', { id, blob, em: agora() });
      return id;
    },

    foto: (id) => (id ? driver.ler('fotos', id) : Promise.resolve(null)),
    removerFoto: (id) => driver.apagar('fotos', id),

    /* ------------------------------------------------------------ fechamentos */

    /**
     * Guarda o fechamento de um dia.
     *
     * Não trava o dia nem impede lançamentos depois: é uma fotografia, para
     * quem quiser guardar o que foi conferido. Refazer o fechamento sobrescreve.
     */
    async guardarFechamento(resumo) {
      const registro = { ...resumo, fechadoEm: agora() };
      await driver.gravar('fechamentos', registro);
      return registro;
    },

    fechamento: (diaTexto) => driver.ler('fechamentos', diaTexto),
    fechamentos: () => driver.listar('fechamentos'),

    /* --------------------------------------------------------- demonstração */

    /**
     * Instala os registros de demonstração.
     *
     * Cada um leva `demo: true`, e é só por isso que dá para experimentar o
     * aplicativo de manhã e começar a usar de verdade à tarde, no mesmo
     * aparelho: apagar a demonstração apaga exatamente o que ela criou.
     */
    async instalarDemonstracao() {
      const instante = agora();
      const lavagens = lavagensDeDemonstracao(instante, novoId);
      await driver.gravarVarios('funcionarios', FUNCIONARIOS_DEMO.map((f) => ({ ...f })));
      await driver.gravarVarios('lavagens', lavagens);
      await driver.gravarVarios('veiculos', veiculosDeDemonstracao(lavagens));
      await driver.gravarVarios('despesas', despesasDeDemonstracao(instante, novoId));
      await servico.salvarConfiguracao({ demonstracao: true });
      return lavagens.length;
    },

    /**
     * Tira a demonstração e devolve as contagens das placas ao que é real.
     *
     * Recontar importa: uma placa da demonstração pode ter voltado de verdade,
     * e apagar o veículo inteiro levaria junto a lavagem que aconteceu mesmo.
     */
    async apagarDemonstracao() {
      for (const colecao of ['lavagens', 'despesas', 'funcionarios']) {
        for (const registro of await driver.listar(colecao)) {
          if (registro.demo) await driver.apagar(colecao, registro[colecao === 'lavagens' ? 'id' : 'id']);
        }
      }
      const restantes = await driver.listar('lavagens');
      for (const veiculo of await driver.listar('veiculos')) {
        const dele = restantes.filter((l) => l.placa === veiculo.placa);
        if (dele.length === 0 && veiculo.demo) {
          await driver.apagar('veiculos', veiculo.placa);
        } else if (dele.length !== veiculo.lavagens) {
          await driver.gravar('veiculos', {
            ...veiculo,
            demo: false,
            lavagens: dele.length,
            ultimaEm: dele.reduce((maior, l) => Math.max(maior, l.criadaEm), 0),
          });
        }
      }
      await servico.salvarConfiguracao({ demonstracao: false });
    },

    /* ----------------------------------------------------------------- backup */

    async exportar() {
      const colecoes = {};
      for (const nome of NO_BACKUP) colecoes[nome] = await driver.listar(nome);
      return {
        aplicativo: 'lava-rapido-lite',
        formato: 1,
        geradoEm: new Date(agora()).toISOString(),
        colecoes,
      };
    },

    /**
     * Restaura um backup, substituindo o que existe.
     *
     * Fotos não viajam no backup: são o grosso do espaço e não são dado de
     * gestão. Um arquivo de dez megabytes que o celular se recusa a compartilhar
     * é um backup que ninguém faz, e backup que ninguém faz não existe.
     */
    async restaurar(backup) {
      if (!backup || backup.aplicativo !== 'lava-rapido-lite') {
        throw new Error('este arquivo não é um backup do Lava-Rápido Lite');
      }
      for (const nome of NO_BACKUP) {
        await driver.limpar(nome);
        const registros = backup.colecoes?.[nome] ?? [];
        if (registros.length) await driver.gravarVarios(nome, registros);
      }
      return Object.fromEntries(NO_BACKUP.map((n) => [n, (backup.colecoes?.[n] ?? []).length]));
    },

    /** Apaga tudo e semeia de novo. Só a pedido explícito, e com PIN quando há. */
    async apagarTudo() {
      for (const nome of NOMES) await driver.limpar(nome);
      await semear(driver);
      return servico.configuracao();
    },

    /** Apaga só movimento — serviços, preços e configurações ficam. */
    async apagarMovimento() {
      for (const nome of ['lavagens', 'veiculos', 'despesas', 'fotos', 'fechamentos']) {
        await driver.limpar(nome);
      }
    },
  };

  await semear(driver);
  return servico;
}

/**
 * A primeira abertura.
 *
 * Semeia serviços, preços e configuração se ainda não houver nada. Nunca
 * sobrescreve: rodar de novo num banco já usado devolveria os preços de fábrica
 * a quem já reajustou os seus, e isso apareceria como «o aplicativo baixou meus
 * preços sozinho».
 */
async function semear(driver) {
  if (!(await driver.ler('configuracao', 'app'))) {
    await driver.gravar('configuracao', { ...CONFIGURACAO_PADRAO, criadoEm: Date.now() });
  }
  if ((await driver.listar('servicos')).length === 0) {
    await driver.gravarVarios('servicos', SERVICOS_PADRAO.map((s) => ({ ...s })));
  }
  if ((await driver.listar('precos')).length === 0) {
    await driver.gravarVarios('precos', tabelaPadrao());
  }
}
