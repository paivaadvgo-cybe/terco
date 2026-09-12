/**
 * A barra de baixo e o roteador.
 *
 * A barra fica embaixo porque o polegar chega lá, e o alto da tela de um
 * celular de seis polegadas não é alcançado com uma mão só — que é como este
 * aplicativo é usado, com a outra segurando a mangueira.
 *
 * As rotas vivem no `location.hash`. Sem hash, cada tela exigiria um servidor
 * que devolvesse o `index.html` para qualquer caminho, e o aplicativo precisa
 * funcionar como arquivo estático e sem internet. Com hash, o botão «voltar» do
 * Android também funciona sozinho — e é o botão que todo mundo usa.
 */

export const ABAS = [
  { rota: 'inicio', nome: 'Início', icone: '🏠' },
  { rota: 'lavagens', nome: 'Lavagens', icone: '🚗' },
  { rota: 'caixa', nome: 'Caixa', icone: '💰' },
  { rota: 'relatorios', nome: 'Relatórios', icone: '📊' },
  { rota: 'config', nome: 'Ajustes', icone: '⚙️' },
];

/** Em qual aba uma rota acende. As telas de dentro acendem a aba de origem. */
const ABA_DA_ROTA = {
  inicio: 'inicio',
  nova: 'inicio',
  pendentes: 'inicio',
  lavagens: 'lavagens',
  caixa: 'caixa',
  despesas: 'caixa',
  fechamento: 'caixa',
  relatorios: 'relatorios',
  config: 'config',
};

/** `#/nova?rapido=1` vira `{ rota: 'nova', parametros: { rapido: '1' } }`. */
export function lerRota(hash = location.hash) {
  const limpo = String(hash).replace(/^#\/?/, '');
  const [rota, consulta] = limpo.split('?');
  const parametros = Object.fromEntries(new URLSearchParams(consulta ?? ''));
  return { rota: rota || 'inicio', parametros };
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
