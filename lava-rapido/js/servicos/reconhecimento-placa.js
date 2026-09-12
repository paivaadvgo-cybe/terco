/**
 * PlateRecognitionService — leitura da placa pela câmera.
 *
 * **A regra que manda neste arquivo:** a leitura pode falhar, e falhar é
 * normal. Sol na lataria, placa suja, mão tremida, aparelho que não tem o
 * recurso — em qualquer desses casos o atendimento segue, com a placa digitada.
 * Nenhum carro deixa de ser lavado porque a câmera não leu.
 *
 * **Não há OCR embarcado.** Um reconhecedor de verdade é um modelo de alguns
 * megabytes; embarcá-lo faria o aplicativo levar meio minuto para abrir da
 * primeira vez e ocupar espaço num aparelho modesto, para acertar a placa que o
 * operador digita em quatro segundos. Fica para depois, e este módulo existe
 * para que «depois» seja registrar um provedor, e não reescrever a tela.
 *
 * O que existe hoje é o `TextDetector`, que alguns navegadores oferecem de
 * graça (Chrome no Android, sobretudo). Quando ele está lá, é usado; quando não
 * está — e no iPhone não está —, a tela abre o teclado imediatamente. Nenhuma
 * API inventada, nenhum endereço fictício: ou o aparelho tem o recurso, ou não
 * tem, e o aplicativo diz qual dos dois.
 */

import { normalizar, eValida } from '../dominio/placa.js';

/** Provedor externo, registrado por quem quiser plugar um OCR de verdade. */
let provedorExterno = null;

/**
 * Registra um reconhecedor.
 *
 * A função recebe um `Blob` ou `ImageBitmap` e devolve
 * `{ placa, confianca }` — ou nada, se não reconheceu.
 */
export function registrarProvedor(funcao, nome = 'externo') {
  provedorExterno = funcao ? { funcao, nome } : null;
}

const temTextDetector = () => typeof globalThis.TextDetector === 'function';

/** Como o aplicativo lê a placa neste aparelho, agora. */
export function meioDisponivel() {
  if (provedorExterno) return provedorExterno.nome;
  if (temTextDetector()) return 'texto-do-navegador';
  return null;
}

export function disponivel() {
  return meioDisponivel() !== null;
}

/**
 * Procura uma placa no meio do texto reconhecido.
 *
 * O `TextDetector` devolve tudo que enxerga: adesivo, nome de concessionária,
 * o «BRASIL» da placa Mercosul. A placa é escolhida pelo formato, e só ela.
 * Uma leitura que não casa com o formato vale como leitura falhada — chutar
 * uma placa errada é pior que não ler, porque vai para o histórico calada.
 */
export function extrairPlaca(textos) {
  for (const bruto of textos) {
    const limpo = String(bruto).toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (let inicio = 0; inicio + 7 <= limpo.length; inicio += 1) {
      const pedaco = limpo.slice(inicio, inicio + 7);
      if (eValida(pedaco)) return normalizar(pedaco);
    }
  }
  return null;
}

/**
 * Tenta reconhecer a placa numa imagem.
 *
 * Devolve sempre o mesmo formato, inclusive quando não dá certo, e sempre com
 * um motivo em português — porque o motivo vai para a tela, e quem lê está
 * atendendo, não depurando.
 */
export async function reconhecer(imagem) {
  if (provedorExterno) {
    try {
      const resultado = await provedorExterno.funcao(imagem);
      const placa = normalizar(resultado?.placa ?? '');
      if (placa) return { ok: true, placa, confianca: resultado.confianca ?? null, meio: provedorExterno.nome };
      return { ok: false, motivo: 'não foi possível ler a placa na foto' };
    } catch {
      return { ok: false, motivo: 'a leitura automática falhou' };
    }
  }

  if (!temTextDetector()) {
    return { ok: false, motivo: 'este aparelho não faz leitura automática de placa', semRecurso: true };
  }

  try {
    const detector = new globalThis.TextDetector();
    const blocos = await detector.detect(imagem);
    const placa = extrairPlaca(blocos.map((b) => b.rawValue ?? ''));
    if (placa) return { ok: true, placa, confianca: null, meio: 'texto-do-navegador' };
    return { ok: false, motivo: 'não foi possível ler a placa na foto' };
  } catch {
    return { ok: false, motivo: 'a leitura automática falhou' };
  }
}
