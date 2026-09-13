/**
 * A barra de baixo e o roteador.
 *
 * A barra fica embaixo porque é onde o polegar chega. Este aplicativo é usado
 * com o celular num suporte, no painel do carro, e às vezes com o carro andando
 * — cada toque a mais é um segundo a mais com o olho fora da estrada, e por isso
 * as cinco telas estão sempre a um toque de distância, sem menu e sem submenu.
 *
 * As rotas vivem no `location.hash`. Sem hash, cada tela exigiria um servidor
 * que devolvesse o `index.html` para qualquer caminho, e o aplicativo precisa
 * funcionar como arquivo estático e sem internet. Com hash, o botão «voltar» do
 * Android funciona sozinho.
 */

export const ABAS = [
  { rota: 'painel', nome: 'Painel', icone: '⏱' },
  { rota: 'conexao', nome: 'Conexão', icone: '🔌' },
  { rota: 'falhas', nome: 'Falhas', icone: '⚠️' },
  { rota: 'viagens', nome: 'Viagens', icone: '🛣' },
  { rota: 'ajustes', nome: 'Ajustes', icone: '⚙️' },
];

/** Em qual aba uma rota acende. As telas de dentro acendem a aba de origem. */
const ABA_DA_ROTA = {
  painel: 'painel',
  conexao: 'conexao',
  falhas: 'falhas',
  viagens: 'viagens',
  viagem: 'viagens',
  ajustes: 'ajustes',
  registro: 'conexao',
};

/** `#/viagem?id=v123` vira `{ rota: 'viagem', parametros: { id: 'v123' } }`. */
export function lerRota(hash = location.hash) {
  const limpo = String(hash).replace(/^#\/?/, '');
  const [rota, consulta] = limpo.split('?');
  const parametros = Object.fromEntries(new URLSearchParams(consulta ?? ''));
  return { rota: rota || 'painel', parametros };
}

export function montarBarra(irPara) {
  const barra = document.createElement('nav');
  barra.className = 'barra';
  barra.setAttribute('aria-label', 'Seções');

  for (const aba of ABAS) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'barra-item';
    botao.dataset.rota = aba.rota;
    const icone = document.createElement('span');
    icone.className = 'barra-icone';
    icone.textContent = aba.icone;
    const nome = document.createElement('span');
    nome.className = 'barra-nome';
    nome.textContent = aba.nome;
    botao.append(icone, nome);
    botao.addEventListener('click', () => irPara(aba.rota));
    barra.append(botao);
  }
  return barra;
}

export function acenderAba(barra, rota) {
  const ativa = ABA_DA_ROTA[rota] ?? rota;
  for (const item of barra.querySelectorAll('.barra-item')) {
    const acesa = item.dataset.rota === ativa;
    item.classList.toggle('ativa', acesa);
    item.setAttribute('aria-current', acesa ? 'page' : 'false');
  }
}

/**
 * A pastilha de aviso sobre uma aba — a luz de falha, por exemplo.
 *
 * Mostrar que há três falhas guardadas sem obrigar a abrir a tela de falhas é
 * o que justifica ela existir: quem dirige olha a barra, não a tela.
 */
export function marcarAba(barra, rota, texto) {
  const item = barra.querySelector(`.barra-item[data-rota="${rota}"]`);
  if (!item) return;
  let pastilha = item.querySelector('.barra-pastilha');
  if (!texto) {
    pastilha?.remove();
    return;
  }
  if (!pastilha) {
    pastilha = document.createElement('span');
    pastilha.className = 'barra-pastilha';
    item.append(pastilha);
  }
  pastilha.textContent = texto;
}
