/**
 * O estado da licença — só aritmética de datas, sem banco e sem tela.
 *
 * O combinado é este:
 *
 *     dia 0 ── 7 ────────────────── 30 ──▶
 *     [ silêncio ][ aviso em toda tela ][ novas lavagens bloqueadas ]
 *
 * Os sete primeiros dias são calados de propósito: quem acabou de instalar
 * está decidindo se o aplicativo serve, e um aviso de cobrança no primeiro
 * atendimento responde a pergunta pelo lado errado. Do sétimo ao trigésimo o
 * aviso fica em todas as telas, sem botão de fechar — é o período em que o
 * dono precisa lembrar de procurar o desenvolvedor, e um aviso que se fecha
 * vira um aviso que nunca foi lido.
 *
 * Passados os trinta dias, **só o registro de lavagem nova é bloqueado**. O
 * carro que está no pátio pode ser finalizado e recebido, o histórico e o
 * caixa continuam à vista e o backup continua saindo. Trancar o dono do lado
 * de fora do próprio movimento seria usar o dinheiro dele como refém, e ainda
 * por cima destruiria o argumento de venda: o aplicativo que guarda o que é
 * seu não pode ser o que te impede de olhar.
 *
 * Este arquivo não decide se a assinatura da licença é boa — isso é de
 * `assinatura.js`. Aqui a licença chega já conferida (ou não), e o que se faz
 * é contar dias.
 */

export const DIA = 86400000;

/** Trinta dias de avaliação; o aviso começa depois de sete dias de uso. */
export const AVALIACAO_DIAS = 30;
export const AVISO_APOS_DIAS = 7;

export const ESTADOS = {
  AVALIACAO: 'avaliacao',
  AVALIACAO_ENCERRADA: 'avaliacao_encerrada',
  ATIVA: 'ativa',
  VENCIDA: 'vencida',
  MIGRACAO: 'migracao',
  RELOGIO: 'relogio',
  INVALIDA: 'invalida',
};

/** Quem pode registrar carro novo. O resto do aplicativo nunca é bloqueado. */
export function permiteNovaLavagem(estado) {
  return estado === ESTADOS.ATIVA || estado === ESTADOS.AVALIACAO;
}

const dias = (milissegundos) => Math.ceil(milissegundos / DIA);

/**
 * Avalia a situação.
 *
 * @param {object} entrada
 * @param {number} entrada.agora
 * @param {number} entrada.inicioDaAvaliacao  quando este cliente instalou
 * @param {number} [entrada.marcaDagua]       maior instante já visto neste aparelho
 * @param {object|null} [entrada.licenca]     a licença já conferida, ou null
 * @param {boolean} [entrada.licencaInvalida] havia arquivo, e a assinatura não fechou
 * @param {string} [entrada.instalacaoId]
 */
export function avaliar({
  agora, inicioDaAvaliacao, marcaDagua = 0, licenca = null, licencaInvalida = false, instalacaoId = '',
}) {
  /*
   * Relógio recuado.
   *
   * O caminho óbvio para esticar uma avaliação é atrasar a data do aparelho.
   * A marca d'água é o maior instante que o aplicativo já viu; se o relógio
   * volta mais de um dia atrás dela, alguma coisa está errada — ou é fraude,
   * ou é o aparelho que perdeu a hora, e nos dois casos contar dias a partir
   * dali daria um número inventado. Um dia de folga existe porque fuso e
   * horário de verão movem o relógio legitimamente.
   */
  if (marcaDagua && agora < marcaDagua - DIA) {
    return montar(ESTADOS.RELOGIO, { agora, inicioDaAvaliacao, licenca });
  }

  if (licencaInvalida) return montar(ESTADOS.INVALIDA, { agora, inicioDaAvaliacao, licenca: null });

  if (licenca) {
    if (licenca.instalacaoId && instalacaoId && licenca.instalacaoId !== instalacaoId) {
      return montar(ESTADOS.MIGRACAO, { agora, inicioDaAvaliacao, licenca });
    }
    // Licença sem vencimento é perpétua: quem pagou uma vez não volta à fila.
    if (!licenca.vencimento) return montar(ESTADOS.ATIVA, { agora, inicioDaAvaliacao, licenca });
    if (agora > licenca.vencimento) return montar(ESTADOS.VENCIDA, { agora, inicioDaAvaliacao, licenca });
    return montar(ESTADOS.ATIVA, { agora, inicioDaAvaliacao, licenca });
  }

  const fim = inicioDaAvaliacao + AVALIACAO_DIAS * DIA;
  return montar(agora > fim ? ESTADOS.AVALIACAO_ENCERRADA : ESTADOS.AVALIACAO, { agora, inicioDaAvaliacao, licenca: null });
}

function montar(estado, { agora, inicioDaAvaliacao, licenca }) {
  const fimDaAvaliacao = inicioDaAvaliacao + AVALIACAO_DIAS * DIA;
  const diasDeUso = Math.max(0, Math.floor((agora - inicioDaAvaliacao) / DIA));
  const diasRestantes = licenca && licenca.vencimento
    ? Math.max(0, dias(licenca.vencimento - agora))
    : Math.max(0, dias(fimDaAvaliacao - agora));

  const situacao = {
    estado,
    diasDeUso,
    diasRestantes,
    fimDaAvaliacao,
    vencimento: licenca?.vencimento ?? null,
    licenca,
    permiteNovaLavagem: permiteNovaLavagem(estado),
  };
  situacao.avisar = precisaAvisar(situacao);
  situacao.severidade = severidadeDe(situacao);
  return situacao;
}

/**
 * O aviso aparece?
 *
 * Na avaliação, a partir do sétimo dia de uso. Com licença ativa, no último
 * mês antes do vencimento — a renovação precisa de antecedência, senão a
 * cobrança chega junto com a interrupção. Nos estados de defeito, sempre.
 */
function precisaAvisar({ estado, diasDeUso, diasRestantes, licenca }) {
  if (estado === ESTADOS.AVALIACAO) return diasDeUso >= AVISO_APOS_DIAS;
  if (estado === ESTADOS.ATIVA) return Boolean(licenca?.vencimento) && diasRestantes <= 30;
  return true;
}

function severidadeDe({ estado, diasRestantes, avisar }) {
  if (!avisar) return null;
  if (!permiteNovaLavagem(estado)) return 'perigo';
  return diasRestantes <= 3 ? 'perigo' : 'atencao';
}
