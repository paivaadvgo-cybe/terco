/**
 * O serviço de licença: junta aparelho, assinatura e contagem de dias.
 *
 * É o que as telas usam. Elas perguntam duas coisas — «posso registrar uma
 * lavagem?» e «o que eu mostro na faixa de aviso?» — e nunca falam com o
 * `localStorage` nem com a criptografia.
 *
 * **O começo da avaliação é o mais antigo entre dois registros**: a data de
 * instalação guardada no aparelho e a data em que o banco de dados nasceu.
 * Isso fecha o atalho óbvio — limpar o `localStorage` do navegador para
 * recomeçar os trinta dias —, porque o banco com o movimento continua lá e
 * denuncia a data verdadeira. Quem apagar os dois recomeça a avaliação e perde
 * o movimento inteiro junto; a essa altura não é mais um atalho, é desistir.
 *
 * Restaurar um backup de outro aparelho traz a data antiga junto, e isso é
 * proposital: a avaliação é do cliente, não do aparelho.
 */

import { envelopeConfere, lerArquivo } from './assinatura.js';
import { avaliar, ESTADOS } from './estado.js';
import { carregarDispositivo, atualizarDispositivo, marcarPassagemDoTempo, anotar } from './dispositivo.js';
import { SUPORTE, temWhatsApp, temEmail, linkDoWhatsApp, linkDeEmail } from './suporte.js';

export { ESTADOS };

/**
 * Abre o serviço.
 *
 * @param {object} armazenamento  o StorageService, para ler a data do banco
 * @param {() => number} [agora]
 */
export async function abrirLicenca(armazenamento, agora = () => Date.now()) {
  let dispositivo = carregarDispositivo(agora());
  let situacao = null;

  async function reavaliar() {
    const instante = agora();
    dispositivo = marcarPassagemDoTempo(dispositivo, instante);

    const configuracao = await armazenamento.configuracao();
    const nascimentoDoBanco = Number(configuracao?.criadoEm) || Infinity;
    const inicioDaAvaliacao = Math.min(dispositivo.instalacaoEm ?? instante, nascimentoDoBanco);

    let licenca = null;
    let licencaInvalida = false;
    if (dispositivo.licenca) {
      if (await envelopeConfere(dispositivo.licenca)) licenca = dispositivo.licenca.licenca;
      else licencaInvalida = true;
    }

    situacao = avaliar({
      agora: instante,
      inicioDaAvaliacao,
      marcaDagua: dispositivo.marcaDagua,
      licenca,
      licencaInvalida,
      instalacaoId: dispositivo.instalacaoId,
    });
    return situacao;
  }

  const servico = {
    get instalacaoId() { return dispositivo.instalacaoId; },
    get dispositivo() { return dispositivo; },
    get situacao() { return situacao; },
    reavaliar,

    permiteNovaLavagem: () => Boolean(situacao?.permiteNovaLavagem),

    /**
     * Importa um arquivo de licença.
     *
     * Devolve `{ ok, motivo }` — nunca lança, e nunca aceita pela metade: ou a
     * assinatura fecha e a licença é deste aparelho, ou nada é gravado.
     */
    async importar(texto) {
      const envelope = lerArquivo(texto);
      if (!envelope) return { ok: false, motivo: 'Não consegui ler o arquivo. Ele precisa ser o .lava que você recebeu.' };
      if (envelope.app !== 'LavaRapidoLite') return { ok: false, motivo: 'Este arquivo é de outro aplicativo.' };
      if (!await envelopeConfere(envelope)) {
        dispositivo = anotar(dispositivo, 'licenca_recusada', agora());
        return { ok: false, motivo: 'A assinatura não confere. Peça o arquivo de novo ao desenvolvedor.' };
      }
      const licenca = envelope.licenca;
      if (licenca.instalacaoId && licenca.instalacaoId !== dispositivo.instalacaoId) {
        return {
          ok: false,
          motivo: 'Esta licença é de outro aparelho. Mande o código deste aqui para o desenvolvedor gerar a sua.',
        };
      }
      dispositivo = atualizarDispositivo(() => ({ licenca: envelope }), agora());
      dispositivo = anotar(dispositivo, `licenca_ativada ${licenca.numero ?? ''}`.trim(), agora());
      await reavaliar();
      return { ok: true, licenca };
    },

    async importarArquivo(arquivo) {
      if (!arquivo) return { ok: false, motivo: 'Nenhum arquivo escolhido.' };
      return servico.importar(await arquivo.text());
    },

    /** Tira a licença deste aparelho — para quando o cliente trocar de celular. */
    async remover() {
      dispositivo = atualizarDispositivo(() => ({ licenca: null }), agora());
      dispositivo = anotar(dispositivo, 'licenca_removida', agora());
      return reavaliar();
    },

    /** A mensagem pronta que o cliente manda ao desenvolvedor. */
    async mensagem() {
      const configuracao = await armazenamento.configuracao();
      const s = situacao ?? await reavaliar();
      const assunto = s.estado === ESTADOS.ATIVA || s.estado === ESTADOS.VENCIDA
        ? 'Quero renovar a licença do Lava-Rápido Lite.'
        : 'Quero ativar a licença do Lava-Rápido Lite.';
      return [
        assunto,
        '',
        `Lava-rápido: ${configuracao?.nome || '(sem nome)'}`,
        configuracao?.telefone ? `Telefone: ${configuracao.telefone}` : null,
        `Código de instalação: ${dispositivo.instalacaoId}`,
        `Situação: ${s.estado}`,
        s.licenca?.numero ? `Licença nº ${s.licenca.numero}` : null,
      ].filter(Boolean).join('\n');
    },

    contato: { SUPORTE, temWhatsApp, temEmail, linkDoWhatsApp, linkDeEmail },
  };

  await reavaliar();
  return servico;
}
