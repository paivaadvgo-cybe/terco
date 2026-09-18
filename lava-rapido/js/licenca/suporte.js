/**
 * O contato do desenvolvedor.
 *
 * É o único arquivo que precisa ser editado para trocar de número ou de
 * e-mail. Está separado por isso: quem mexe aqui não precisa entender nada do
 * resto da licença, e quem mexe no resto não corre o risco de apagar o
 * contato sem perceber.
 *
 * O WhatsApp vai **só com números**, no formato do `wa.me`: código do país,
 * DDD e número, sem `+`, sem espaço, sem parênteses e sem traço. Um número
 * escrito como `(62) 99999-0000` gera um link que abre a conversa com
 * ninguém — e o cliente conclui que o aplicativo está quebrado, não que falta
 * um dígito.
 *
 * Campo vazio não vira link quebrado: a tela de licença mostra as instruções
 * sem o botão, e o Installation ID continua podendo ser copiado. Um botão que
 * abre o nada é pior que um botão que não existe.
 */

export const SUPORTE = {
  /** Ex.: '5562999990000' — país (55), DDD e número, sem símbolos. */
  whatsapp: '',
  /** Opcional. Aparece como segundo caminho quando preenchido. */
  email: '',
  nome: 'o desenvolvedor',
};

export const temWhatsApp = () => /^\d{10,15}$/.test(SUPORTE.whatsapp);
export const temEmail = () => /.+@.+\..+/.test(SUPORTE.email);
export const temContato = () => temWhatsApp() || temEmail();

export function linkDoWhatsApp(mensagem) {
  return `https://wa.me/${SUPORTE.whatsapp}?text=${encodeURIComponent(mensagem)}`;
}

export function linkDeEmail(assunto, mensagem) {
  return `mailto:${SUPORTE.email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(mensagem)}`;
}
