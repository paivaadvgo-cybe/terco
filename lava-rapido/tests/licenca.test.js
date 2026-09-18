/**
 * Testes da licença de uso.
 *
 * Duas coisas são verificadas aqui, e as duas erram calado:
 *
 * 1. **A contagem de dias.** Um aviso que começa cedo demais afugenta o
 *    cliente na primeira semana; um bloqueio que chega um dia antes do
 *    combinado para o lava-rápido no meio do sábado. As duas fronteiras — o
 *    sétimo dia e o trigésimo — têm teste em cima e em baixo delas.
 * 2. **A assinatura.** Se uma licença adulterada passasse, qualquer pessoa
 *    escreveria a sua num editor de texto. Se uma boa fosse recusada, o
 *    cliente que pagou ficaria travado — e é o pior dos dois.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  avaliar, permiteNovaLavagem, ESTADOS, DIA, AVALIACAO_DIAS, AVISO_APOS_DIAS,
} from '../js/licenca/estado.js';
import {
  canonico, assinarLicenca, envelopeConfere, escreverArquivo, lerArquivo, CHAVE_PUBLICA,
} from '../js/licenca/assinatura.js';
import { textoDaFaixa } from '../js/ui/licenca-faixa.js';
import { abrirLicenca } from '../js/licenca/licenca.js';
import { esquecerReserva } from '../js/licenca/dispositivo.js';
import { criarDriverEmMemoria } from '../js/armazenamento/memoria.js';
import { criarArmazenamento } from '../js/armazenamento/storage.js';

const INSTALACAO = new Date(2026, 8, 1, 9, 0).getTime();
/** O estado no enésimo dia de uso, sempre ao meio-dia. */
const noDia = (n, extras = {}) => avaliar({
  agora: INSTALACAO + n * DIA + 3 * 3600000,
  inicioDaAvaliacao: INSTALACAO,
  ...extras,
});

/* ------------------------------------------------------- os trinta dias */

test('a primeira semana é calada', () => {
  // Quem acabou de instalar está decidindo se o aplicativo serve. Cobrança no
  // primeiro atendimento responde essa pergunta pelo lado errado.
  for (const dia of [0, 1, 3, 6]) {
    const s = noDia(dia);
    assert.equal(s.estado, ESTADOS.AVALIACAO);
    assert.equal(s.avisar, false, `no dia ${dia} não pode haver aviso`);
    assert.equal(s.permiteNovaLavagem, true);
  }
});

test('o aviso começa no sétimo dia e não sai mais', () => {
  assert.equal(noDia(AVISO_APOS_DIAS - 1).avisar, false, 'véspera ainda é silêncio');
  for (const dia of [7, 8, 15, 25, 29]) {
    const s = noDia(dia);
    assert.equal(s.avisar, true, `no dia ${dia} o aviso precisa estar na tela`);
    assert.equal(s.permiteNovaLavagem, true, `no dia ${dia} nada pode estar bloqueado`);
  }
});

test('o trigésimo dia é o último, e o bloqueio é só da lavagem nova', () => {
  const ultimo = noDia(AVALIACAO_DIAS - 1);
  assert.equal(ultimo.estado, ESTADOS.AVALIACAO);
  assert.equal(ultimo.permiteNovaLavagem, true);
  assert.equal(ultimo.diasRestantes, 1);

  const depois = noDia(AVALIACAO_DIAS);
  assert.equal(depois.estado, ESTADOS.AVALIACAO_ENCERRADA);
  assert.equal(depois.permiteNovaLavagem, false);
  assert.equal(depois.avisar, true);
  assert.equal(depois.diasRestantes, 0);
});

test('a contagem regressiva bate com o calendário', () => {
  assert.equal(noDia(0).diasRestantes, 30);
  assert.equal(noDia(7).diasRestantes, 23);
  assert.equal(noDia(29).diasRestantes, 1);
});

test('a severidade aperta perto do fim, e o texto muda junto', () => {
  assert.equal(noDia(10).severidade, 'atencao');
  assert.equal(noDia(28).severidade, 'perigo');
  assert.match(textoDaFaixa(noDia(10)), /Avaliação: 20 dias restantes/);
  assert.match(textoDaFaixa(noDia(29)), /termina hoje/);
  assert.match(textoDaFaixa(noDia(31)), /novas lavagens bloqueadas/);
  // E o que continua liberado precisa estar escrito, senão o dono acha que
  // perdeu o movimento junto.
  assert.match(textoDaFaixa(noDia(31)), /caixa/i);
});

/* ------------------------------------------------------------ a licença */

test('licença com prazo vale até o vencimento, e avisa no último mês', () => {
  const agora = INSTALACAO + 40 * DIA;
  const comPrazo = (dias) => avaliar({
    agora,
    inicioDaAvaliacao: INSTALACAO,
    instalacaoId: 'ABC',
    licenca: { instalacaoId: 'ABC', vencimento: agora + dias * DIA },
  });

  const longe = comPrazo(200);
  assert.equal(longe.estado, ESTADOS.ATIVA);
  assert.equal(longe.avisar, false, 'licença nova não fica avisando');
  assert.equal(longe.permiteNovaLavagem, true);

  const perto = comPrazo(20);
  assert.equal(perto.estado, ESTADOS.ATIVA);
  assert.equal(perto.avisar, true, 'a renovação precisa de antecedência');
  assert.equal(perto.permiteNovaLavagem, true);

  const vencida = comPrazo(-1);
  assert.equal(vencida.estado, ESTADOS.VENCIDA);
  assert.equal(vencida.permiteNovaLavagem, false);
});

test('licença sem vencimento é perpétua e nunca avisa', () => {
  const s = avaliar({
    agora: INSTALACAO + 5000 * DIA,
    inicioDaAvaliacao: INSTALACAO,
    instalacaoId: 'ABC',
    licenca: { instalacaoId: 'ABC', vencimento: null },
  });
  assert.equal(s.estado, ESTADOS.ATIVA);
  assert.equal(s.avisar, false);
  assert.equal(s.permiteNovaLavagem, true);
});

test('licença de outro aparelho não destrava este', () => {
  const s = avaliar({
    agora: INSTALACAO + 40 * DIA,
    inicioDaAvaliacao: INSTALACAO,
    instalacaoId: 'DESTE-APARELHO',
    licenca: { instalacaoId: 'DE-OUTRO', vencimento: null },
  });
  assert.equal(s.estado, ESTADOS.MIGRACAO);
  assert.equal(s.permiteNovaLavagem, false);
});

test('relógio atrasado de propósito não estica a avaliação', () => {
  // O atalho óbvio: voltar a data do celular. A marca d'água é o maior
  // instante já visto; recuar mais de um dia dela denuncia.
  const s = avaliar({
    agora: INSTALACAO + 2 * DIA,
    inicioDaAvaliacao: INSTALACAO,
    marcaDagua: INSTALACAO + 25 * DIA,
  });
  assert.equal(s.estado, ESTADOS.RELOGIO);
  assert.equal(s.permiteNovaLavagem, false);

  // Um dia de folga existe para fuso e horário de verão, que movem o relógio
  // legitimamente e não podem travar o atendimento de ninguém.
  const folga = avaliar({
    agora: INSTALACAO + 10 * DIA - 3600000,
    inicioDaAvaliacao: INSTALACAO,
    marcaDagua: INSTALACAO + 10 * DIA,
  });
  assert.equal(folga.estado, ESTADOS.AVALIACAO);
});

test('arquivo de licença adulterado deixa o aplicativo em «inválida»', () => {
  const s = avaliar({ agora: INSTALACAO + DIA, inicioDaAvaliacao: INSTALACAO, licencaInvalida: true });
  assert.equal(s.estado, ESTADOS.INVALIDA);
  assert.equal(s.permiteNovaLavagem, false);
  assert.equal(permiteNovaLavagem(ESTADOS.INVALIDA), false);
});

/* ---------------------------------------------------------- assinatura */

async function parDeChaves() {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return {
    privada: await crypto.subtle.exportKey('jwk', par.privateKey),
    publica: await crypto.subtle.exportKey('jwk', par.publicKey),
  };
}

const licencaDeTeste = (extras = {}) => ({
  numero: '2026-0001', cliente: 'Lava-Rápido do Zé', instalacaoId: 'ABCDE-FGHIJ',
  emissao: Date.now(), vencimento: null, ...extras,
});

test('uma licença assinada é aceita, e a mesma com um campo trocado não é', async () => {
  const { privada, publica } = await parDeChaves();
  const envelope = await assinarLicenca(licencaDeTeste(), privada);

  assert.equal(await envelopeConfere(envelope, publica), true);

  // O ataque que importa: mudar o aparelho de destino depois de assinada.
  const adulterada = { ...envelope, licenca: { ...envelope.licenca, instalacaoId: 'OUTRO-APARELHO' } };
  assert.equal(await envelopeConfere(adulterada, publica), false);

  // E esticar o vencimento.
  const esticada = { ...envelope, licenca: { ...envelope.licenca, vencimento: Date.now() + 9e10 } };
  assert.equal(await envelopeConfere(esticada, publica), false);
});

test('licença assinada com outra chave não vale', async () => {
  const { privada } = await parDeChaves();
  const outra = await parDeChaves();
  const envelope = await assinarLicenca(licencaDeTeste(), privada);
  assert.equal(await envelopeConfere(envelope, outra.publica), false);
  // E a chave pública embutida no aplicativo também recusa.
  assert.equal(await envelopeConfere(envelope), false);
});

test('envelope de outro produto é recusado antes de qualquer conta', async () => {
  const { privada, publica } = await parDeChaves();
  const envelope = await assinarLicenca(licencaDeTeste(), privada);
  assert.equal(await envelopeConfere({ ...envelope, app: 'ParkControl' }, publica), false);
  assert.equal(await envelopeConfere({ ...envelope, tipo: 'backup' }, publica), false);
  assert.equal(await envelopeConfere(null, publica), false);
  assert.equal(await envelopeConfere({ app: 'LavaRapidoLite', tipo: 'licenca' }, publica), false);
});

test('o texto assinado não depende da ordem em que as chaves foram escritas', async () => {
  // Sem canonicalização, a mesma licença montada noutra ordem geraria outra
  // assinatura — e uma licença boa seria recusada num navegador e aceita
  // noutro, defeito que só apareceria no aparelho do cliente.
  assert.equal(canonico({ b: 1, a: 2 }), canonico({ a: 2, b: 1 }));
  const { privada, publica } = await parDeChaves();
  const envelope = await assinarLicenca({ numero: '1', cliente: 'Zé', vencimento: null }, privada);
  const remontada = { ...envelope, licenca: { vencimento: null, cliente: 'Zé', numero: '1' } };
  assert.equal(await envelopeConfere(remontada, publica), true);
});

test('o arquivo .lava vai e volta inteiro', async () => {
  const { privada, publica } = await parDeChaves();
  const envelope = await assinarLicenca(licencaDeTeste(), privada);
  const texto = escreverArquivo(envelope);
  assert.ok(!texto.includes('{'), 'o arquivo é base64, e cabe numa mensagem');
  const voltou = lerArquivo(texto);
  assert.deepEqual(voltou, envelope);
  assert.equal(await envelopeConfere(voltou, publica), true);
  // E o JSON cru também é aceito, para quem abrir e colar o conteúdo.
  assert.deepEqual(lerArquivo(JSON.stringify(envelope)), envelope);
  assert.equal(lerArquivo('isto não é licença'), null);
});

test('a chave pública embutida é só pública', () => {
  // Um `d` aqui seria a chave privada publicada junto do aplicativo, e
  // qualquer pessoa poderia emitir licenças.
  assert.ok(!('d' in CHAVE_PUBLICA), 'a chave privada não pode estar no aplicativo');
  assert.equal(CHAVE_PUBLICA.crv, 'P-256');
});

/* ------------------------------------------------------------- serviço */

async function servicoDeLicenca(agora) {
  // Sem esquecer a reserva, o aparelho «deste» cenário seria o do anterior —
  // com a marca d'água dele, e portanto com o relógio parecendo atrasado.
  esquecerReserva();
  const armazenamento = await criarArmazenamento(criarDriverEmMemoria(), { agora });
  return { armazenamento, licenca: await abrirLicenca(armazenamento, agora) };
}

test('o serviço abre em avaliação, com código de instalação próprio', async () => {
  const { licenca } = await servicoDeLicenca(() => INSTALACAO);
  assert.equal(licenca.situacao.estado, ESTADOS.AVALIACAO);
  assert.equal(licenca.permiteNovaLavagem(), true);
  assert.match(licenca.instalacaoId, /^[0-9A-Z-]{10,}$/);
});

test('a avaliação conta da data mais antiga: apagar o navegador não a reinicia', async () => {
  // O banco de dados nasce junto com a instalação e não some quando se limpa
  // o `localStorage`. É ele que lembra a data verdadeira.
  esquecerReserva();
  const agora = () => INSTALACAO + 40 * DIA;
  const armazenamento = await criarArmazenamento(criarDriverEmMemoria(), { agora: () => INSTALACAO });
  const licenca = await abrirLicenca(armazenamento, agora);
  assert.equal(licenca.situacao.estado, ESTADOS.AVALIACAO_ENCERRADA,
    'o dispositivo é novo, mas o banco tem quarenta dias');
});

test('o serviço recusa arquivo que não é licença, e não grava nada', async () => {
  const { licenca } = await servicoDeLicenca(() => INSTALACAO);
  for (const lixo of ['', 'qualquer coisa', JSON.stringify({ app: 'ParkControl' })]) {
    const r = await licenca.importar(lixo);
    assert.equal(r.ok, false);
    assert.ok(r.motivo.length > 10, 'a recusa precisa dizer o que fazer');
  }
  const { privada } = await parDeChaves();
  const forjada = await assinarLicenca(licencaDeTeste(), privada);
  const r = await licenca.importar(escreverArquivo(forjada));
  assert.equal(r.ok, false);
  assert.match(r.motivo, /assinatura/i);
  assert.equal(licenca.situacao.estado, ESTADOS.AVALIACAO, 'e o estado não muda');
});

test('a mensagem para o desenvolvedor leva o código e o nome do lava-rápido', async () => {
  const { armazenamento, licenca } = await servicoDeLicenca(() => INSTALACAO);
  await armazenamento.salvarConfiguracao({ nome: 'Lava-Rápido do Zé' });
  const mensagem = await licenca.mensagem();
  assert.match(mensagem, /ativar a licença/i);
  assert.match(mensagem, /Lava-Rápido do Zé/);
  assert.ok(mensagem.includes(licenca.instalacaoId), 'sem o código, o desenvolvedor não gera nada');
});

test('uma segunda aba não apaga a licença ativada na primeira', async () => {
  // Cada aba guarda a sua cópia do registro do aparelho. Gravando essa cópia
  // por cima, a aba que só anotou a passagem do tempo devolvia o registro sem
  // a licença que a outra tinha acabado de ativar — e o cliente que pagou via
  // o aviso voltar sozinho.
  esquecerReserva();
  const agora = () => INSTALACAO;
  const armazenamento = await criarArmazenamento(criarDriverEmMemoria(), { agora });

  const aba1 = await abrirLicenca(armazenamento, agora);
  const aba2 = await abrirLicenca(armazenamento, agora);   // aberta antes da ativação

  const { privada } = await parDeChaves();
  const envelope = await assinarLicenca(
    licencaDeTeste({ instalacaoId: aba1.instalacaoId }), privada,
  );
  // A ativação em si é recusada (chave de teste), mas o que importa aqui é o
  // registro: gravamos direto e conferimos que a outra aba não o desfaz.
  await aba1.importar(escreverArquivo(envelope));
  const { atualizarDispositivo, carregarDispositivo } = await import('../js/licenca/dispositivo.js');
  atualizarDispositivo(() => ({ licenca: envelope }), INSTALACAO);

  await aba2.reavaliar();                                   // a aba velha anota o tempo

  assert.deepEqual(carregarDispositivo(INSTALACAO).licenca, envelope,
    'a licença precisa continuar gravada depois de a outra aba escrever');
});
