/**
 * A velocidade e a posição pelo GPS do celular.
 *
 * **Por que ela existe ao lado da do OBD.** O velocímetro do carro marca para
 * cima de fábrica: a norma permite indicar acima da velocidade real e proíbe
 * indicar abaixo, e os fabricantes usam essa folga — cinco a dez por cento a
 * mais é o comum. A velocidade que o OBD entrega costuma ser a mesma do painel,
 * com a mesma folga embutida. O GPS mede deslocamento no chão, e é o mais perto
 * do real que um celular alcança. Ver as duas ao mesmo tempo é o que responde
 * «de quanto é a diferença no meu carro».
 *
 * **Onde ela falha, e por isso a leitura carrega precisão e idade:**
 *
 * · Túnel, viaduto, garagem, mata fechada: o sinal degrada ou some. Sem marcar
 *   a idade da última correção, o número congela na tela e continua parecendo
 *   atual — que é pior que não mostrar nada.
 * · Parado, o GPS «anda»: o erro de posição oscila e vira velocidade fantasma
 *   de 1 a 3 km/h. Abaixo do limiar, é zero.
 * · Nem todo aparelho preenche `coords.speed`. Onde não preenche, a velocidade
 *   sai da distância entre duas correções — o que exige duas correções e é mais
 *   ruidoso, mas é melhor que um mostrador vazio.
 */

/** Raio médio da Terra, em metros. */
const RAIO_DA_TERRA = 6_371_000;

/** Abaixo disso, é ruído de posição e não movimento. */
const LIMIAR_DE_PARADO = 2;

/** Acima deste erro de posição, a leitura não merece confiança. */
export const PRECISAO_RUIM = 35;

/** Sem correção nova por este tempo, a leitura está velha. */
export const IDADE_MAXIMA = 5000;

export function suportado() {
  return typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
}

/**
 * Distância entre duas coordenadas, em metros (fórmula de haversine).
 *
 * Usada só quando o aparelho não informa a velocidade. Em distâncias curtas —
 * metros, entre duas correções — a curvatura não importa e uma conta plana
 * bastaria; haversine custa o mesmo e não erra perto dos polos nem cruzando o
 * meridiano.
 */
export function distanciaEntre(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const lat1 = a.latitude * rad;
  const lat2 = b.latitude * rad;

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_DA_TERRA * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A velocidade de uma correção, em km/h — ou `null` quando não dá para dizer.
 *
 * `anterior` é a correção passada, e só é usada quando o aparelho não informa
 * a velocidade. Um intervalo grande demais entre correções torna a conta
 * inútil: em dez segundos o carro pode ter feito uma curva inteira, e a reta
 * entre os dois pontos não é o caminho percorrido.
 */
export function velocidadeDaCorrecao(correcao, anterior = null) {
  const informada = correcao?.coords?.speed;
  if (Number.isFinite(informada) && informada >= 0) {
    const kmh = informada * 3.6;
    return kmh < LIMIAR_DE_PARADO ? 0 : kmh;
  }

  if (!anterior) return null;
  const intervalo = (correcao.timestamp - anterior.timestamp) / 1000;
  if (!(intervalo > 0.2) || intervalo > 6) return null;

  const metros = distanciaEntre(anterior.coords, correcao.coords);
  const kmh = (metros / intervalo) * 3.6;
  if (!Number.isFinite(kmh) || kmh > 400) return null;
  return kmh < LIMIAR_DE_PARADO ? 0 : kmh;
}

/**
 * Por que o GPS não abriu, em português.
 *
 * «User denied Geolocation» na tela não diz onde reverter, e no Android a
 * causa mais comum nem é o navegador: é a localização do aparelho desligada.
 */
export function explicarFalha(erro) {
  if (erro?.code === 1) {
    return 'A permissão de localização foi negada. Toque no cadeado ao lado do endereço e libere a localização.';
  }
  if (erro?.code === 2) {
    return 'Sem sinal de GPS. Verifique se a localização do aparelho está ligada.';
  }
  if (erro?.code === 3) return 'O GPS demorou demais para responder.';
  return erro?.message ?? 'não foi possível ler o GPS';
}

/**
 * Acompanha a velocidade e a posição pelo GPS.
 *
 * `aoMudar` recebe `{ velocidade, latitude, longitude, precisao, quando,
 * confiavel, posicaoConfiavel }` a cada correção. As duas confianças são
 * separadas porque as duas grandezas falham por motivos diferentes, e juntá-las
 * apagaria a posição em situações em que ela está perfeita.
 *
 * `confiavel` vale para a **velocidade**: junta erro de posição grande e
 * correção velha, para que a tela não repita essa regra em cada lugar.
 *
 * `posicaoConfiavel` vale para as **coordenadas**, e não exige velocidade. O
 * carro parado num semáforo não tem velocidade calculável — duas correções no
 * mesmo ponto —, e ainda assim está num lugar perfeitamente conhecido. Exigir
 * velocidade para gravar a posição faria sumir exatamente o trecho parado, que
 * é onde se costuma querer saber onde se estava.
 */
export function criarVelocimetroGPS({ aoMudar, aoFalhar } = {}) {
  let vigia = null;
  let anterior = null;

  const leitura = {
    velocidade: null,
    latitude: null,
    longitude: null,
    precisao: null,
    quando: null,
    confiavel: false,
    posicaoConfiavel: false,
    erro: null,
    ativo: false,
  };

  /** A leitura envelhece sozinha: quem pergunta sempre recebe o estado de agora. */
  function atualizarConfianca() {
    const idade = leitura.quando ? Date.now() - leitura.quando : Infinity;
    const recenteEPrecisa = idade <= IDADE_MAXIMA
      && (leitura.precisao === null || leitura.precisao <= PRECISAO_RUIM);

    leitura.confiavel = Number.isFinite(leitura.velocidade) && recenteEPrecisa;
    leitura.posicaoConfiavel = Number.isFinite(leitura.latitude)
      && Number.isFinite(leitura.longitude)
      && recenteEPrecisa;
    return leitura;
  }

  return {
    leitura,
    atualizarConfianca,

    comecar() {
      if (!suportado()) {
        leitura.erro = 'este navegador não tem GPS';
        return false;
      }
      if (vigia !== null) return true;

      vigia = navigator.geolocation.watchPosition(
        (correcao) => {
          const velocidade = velocidadeDaCorrecao(correcao, anterior);
          anterior = correcao;

          /*
           * A posição entra em toda correção; a velocidade, só quando dá para
           * calculá-la.
           *
           * Antes a correção inteira era descartada quando a velocidade não
           * saía — e ela não sai na primeira correção (não há anterior para
           * comparar) nem quando o carro está parado. O resultado era uma
           * viagem cujo começo e cujas paradas não tinham lugar nenhum
           * gravado, que são justamente os momentos que se procura depois.
           */
          leitura.latitude = correcao.coords?.latitude ?? null;
          leitura.longitude = correcao.coords?.longitude ?? null;
          leitura.precisao = correcao.coords?.accuracy ?? null;
          leitura.quando = correcao.timestamp ?? Date.now();
          leitura.erro = null;
          if (velocidade !== null) leitura.velocidade = velocidade;

          atualizarConfianca();
          aoMudar?.(leitura);
        },
        (erro) => {
          leitura.erro = explicarFalha(erro);
          leitura.confiavel = false;
          aoFalhar?.(leitura.erro);
        },
        {
          // Precisão alta é o modo que usa o receptor de verdade em vez de
          // triangular pela rede — sem ela, a velocidade num carro é inútil.
          enableHighAccuracy: true,
          // Nunca aceitar uma correção guardada: num carro, posição de trinta
          // segundos atrás é outro bairro.
          maximumAge: 0,
          timeout: 15000,
        },
      );

      leitura.ativo = true;
      return true;
    },

    parar() {
      if (vigia !== null) navigator.geolocation.clearWatch(vigia);
      vigia = null;
      anterior = null;
      leitura.ativo = false;
      leitura.velocidade = null;
      leitura.latitude = null;
      leitura.longitude = null;
      leitura.confiavel = false;
      leitura.posicaoConfiavel = false;
    },
  };
}
