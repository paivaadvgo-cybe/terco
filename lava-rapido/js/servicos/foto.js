/**
 * A foto do veículo.
 *
 * É opcional e serve para uma coisa prática: registrar o estado em que o carro
 * chegou. A discussão sobre um risco que já estava lá é a briga mais cara de um
 * lava-rápido, e uma foto de dez segundos a encerra.
 *
 * **Toda foto é reduzida antes de ser guardada.** A câmera de um celular atual
 * entrega de três a oito megabytes por foto; trinta lavagens por dia encheriam
 * o armazenamento do navegador em pouco mais de uma semana — e o navegador, ao
 * encher, não avisa: ele apaga o banco inteiro, com o movimento junto. Reduzir
 * para o lado maior de 1024 px em JPEG deixa cada foto em algumas dezenas de
 * quilobytes, o que ainda mostra um risco na lataria e não ameaça o resto.
 */

export const LADO_MAXIMO = 1024;
export const QUALIDADE = 0.72;

/** Dá para reduzir imagem neste navegador? Sem isto, a foto é simplesmente recusada. */
export function podeOtimizar() {
  return typeof createImageBitmap === 'function' && typeof document !== 'undefined';
}

function medidas(largura, altura, ladoMaximo) {
  const maior = Math.max(largura, altura);
  if (maior <= ladoMaximo) return { largura, altura };
  const escala = ladoMaximo / maior;
  return { largura: Math.round(largura * escala), altura: Math.round(altura * escala) };
}

/**
 * Reduz e recomprime. Devolve `{ blob, largura, altura }`.
 *
 * Se algo falhar — formato que o navegador não decodifica, memória curta — o
 * erro sobe, e quem chamou segue sem foto. A foto é opcional em todo lugar,
 * inclusive aqui.
 */
export async function otimizar(arquivo, { ladoMaximo = LADO_MAXIMO, qualidade = QUALIDADE } = {}) {
  const bitmap = await createImageBitmap(arquivo);
  const { largura, altura } = medidas(bitmap.width, bitmap.height, ladoMaximo);

  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  tela.getContext('2d').drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close?.();

  const blob = await new Promise((resolver, recusar) => {
    tela.toBlob((b) => (b ? resolver(b) : recusar(new Error('não foi possível preparar a foto'))), 'image/jpeg', qualidade);
  });
  return { blob, largura, altura };
}

/** Endereço temporário para mostrar a foto. Quem cria, revoga. */
export function enderecoDe(blob) {
  return URL.createObjectURL(blob);
}

export function liberar(endereco) {
  if (endereco) URL.revokeObjectURL(endereco);
}
