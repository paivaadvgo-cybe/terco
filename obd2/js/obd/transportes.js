/**
 * O que este navegador consegue, e por quê.
 *
 * A pergunta que decide tudo neste aplicativo não é «o carro é compatível?» —
 * qualquer carro vendido no Brasil depois de 2010 é. É «este celular, neste
 * navegador, com este adaptador, consegue conversar?». As três respostas
 * possíveis são conhecidas de antemão, e o aplicativo prefere dizê-las na cara
 * a deixar alguém tocando «conectar» num aparelho que nunca vai conectar.
 *
 * O caso mais duro é o iPhone: Safari não tem Web Bluetooth nem Web Serial, e
 * isso não é bandeira que se ligue nem biblioteca que se instale. Um aplicativo
 * web no iPhone **não conecta em adaptador OBD nenhum**. Dizer isso na primeira
 * tela é menos frustrante que descobrir depois de comprar o adaptador.
 */

import { suportado as temBLE } from './transporte-ble.js';
import { suportado as temSerial } from './transporte-serial.js';
import { suportado as temWebSocket } from './transporte-wifi.js';

/** O aparelho é um iPhone ou iPad? O iPad moderno se anuncia como Mac. */
function ehApple() {
  if (typeof navigator === 'undefined') return false;
  const agente = navigator.userAgent ?? '';
  if (/iPad|iPhone|iPod/.test(agente)) return true;
  return /Macintosh/.test(agente) && (navigator.maxTouchPoints ?? 0) > 1;
}

/**
 * Página segura?
 *
 * Web Bluetooth e Web Serial só existem em `https` ou `localhost`. Publicar em
 * `http` faz as duas sumirem do navegador sem aviso, e o aplicativo pareceria
 * incompatível com o aparelho quando o problema é o endereço.
 */
function contextoSeguro() {
  return typeof window === 'undefined' ? true : window.isSecureContext !== false;
}

export function diagnostico() {
  const seguro = contextoSeguro();
  const apple = ehApple();

  const ble = {
    chave: 'ble',
    nome: 'Adaptador Bluetooth BLE',
    disponivel: temBLE() && seguro,
    motivo: null,
  };
  if (!seguro) ble.motivo = 'o Bluetooth do navegador só funciona em endereço https.';
  else if (!temBLE() && apple) {
    ble.motivo = 'o Safari do iPhone e do iPad não tem Web Bluetooth, e nenhum aplicativo web contorna isso.';
  } else if (!temBLE()) ble.motivo = 'este navegador não tem Web Bluetooth. No Android, use o Chrome.';

  const serial = {
    chave: 'serial',
    nome: 'Adaptador por cabo (USB)',
    disponivel: temSerial() && seguro,
    motivo: null,
  };
  if (!seguro) serial.motivo = 'a porta serial do navegador só funciona em endereço https.';
  else if (!temSerial()) {
    serial.motivo = 'Web Serial existe no Chrome e no Edge de computador. No celular, use o adaptador BLE.';
  }

  /*
   * O Wi-Fi é o único que não depende de API de hardware nenhuma.
   *
   * Ele não fala com o adaptador: fala com uma ponte que roda no aparelho, e
   * WebSocket todo navegador tem — inclusive o do iPhone. O que ele depende é
   * de alguém subir a ponte, e isso o aplicativo não tem como verificar antes
   * de tentar. Por isso «disponível» aqui quer dizer «o caminho existe», e não
   * «vai conectar agora»; a tela diz o que falta fazer.
   */
  const wifi = {
    chave: 'wifi',
    nome: 'Adaptador Wi-Fi (pela ponte)',
    disponivel: temWebSocket(),
    motivo: temWebSocket() ? null : 'este navegador não tem WebSocket.',
    precisaDePonte: true,
  };

  return {
    seguro,
    apple,
    ble,
    serial,
    wifi,
    algumDisponivel: ble.disponivel || serial.disponivel || wifi.disponivel,
  };
}

/**
 * Os tipos de adaptador que existem, e o que esperar de cada um.
 *
 * Esta tabela é mostrada na tela de conexão. Ela é o conteúdo mais útil do
 * aplicativo inteiro para quem ainda vai comprar, e tem três respostas, não
 * duas: os dois primeiros funcionam sozinhos; o Wi-Fi funciona com a ponte
 * rodando no aparelho, porque o navegador não abre TCP e alguém precisa abrir
 * por ele; e o Bluetooth clássico não funciona de jeito nenhum, porque ali não
 * falta um tradutor — falta uma API que o sistema não dá a navegador algum.
 */
export const TIPOS_DE_ADAPTADOR = [
  {
    tipo: 'Bluetooth BLE 4.0',
    funciona: true,
    onde: 'Android com Chrome, e computador com Chrome ou Edge',
    nota: 'É o que comprar. Procure por «BLE» ou «4.0» na descrição.',
  },
  {
    tipo: 'USB com cabo',
    funciona: true,
    onde: 'Computador com Chrome ou Edge',
    nota: 'O mais estável. No celular Android não funciona: não há Web Serial.',
  },
  {
    tipo: 'Bluetooth clássico (SPP)',
    funciona: false,
    onde: 'Nenhum navegador',
    nota: 'É o dongle azul mais barato. Navegador nenhum abre porta serial clássica — a limitação é do sistema, não do aplicativo.',
  },
  {
    tipo: 'Wi-Fi',
    funciona: 'ponte',
    onde: 'Android com Termux, e computador',
    nota: 'Fala TCP puro, e navegador nenhum abre soquete TCP. Funciona com a ponte deste aplicativo rodando no aparelho — um tradutor de WebSocket para TCP, sem internet.',
  },
];
