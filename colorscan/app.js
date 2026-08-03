/* ==========================================================================
 * ColorScan Auto — app.js
 * --------------------------------------------------------------------------
 * PWA de identificação de cores de pintura automotiva pela câmera.
 *
 * TODO o processamento acontece no dispositivo (Canvas 2D). Nenhuma imagem
 * ou dado é enviado a servidores.
 *
 * Módulos (na ordem em que aparecem neste arquivo):
 *   ColorMath          — conversões RGB/HSV/Lab e ΔE2000 (CIEDE2000)
 *   Storage            — camada fina sobre localStorage
 *   Database           — banco de cores (colors.json + cores aprendidas)
 *   CameraManager      — acesso à câmera traseira e congelamento de frame
 *   CalibrationManager — luminância pelo próprio feed de vídeo, cartão de
 *                        referência neutro, fatores de correção, feedback
 *   ImageProcessor     — correções de iluminação e estatísticas de pixels
 *   ColorAnalyzer      — extração de cor, acabamento, matching por ΔE2000,
 *                        cálculo de confiança
 *   History            — histórico de leituras com foto e pesquisa
 *   OfflineManager     — service worker + instalação PWA
 *   UIController       — telas, eventos e renderização
 *
 * Nota sobre bibliotecas: a especificação sugeria OpenCV.js. As operações
 * necessárias aqui (média/histograma de luminância, white balance por ganho
 * de canal, equalização) são triviais em Canvas 2D puro; OpenCV.js custaria
 * ~8 MB de download/cache — inaceitável para um PWA offline voltado a
 * celulares intermediários. Por isso tudo é implementado em JS puro.
 * TensorFlow.js fica como evolução futura (exige dataset rotulado próprio).
 * ========================================================================== */

'use strict';

/* ==========================================================================
 * ColorMath — conversões de espaço de cor e distância perceptual
 * Referência: sRGB D65; fórmulas CIE padrão.
 * ========================================================================== */
const ColorMath = {

  /** Componente sRGB (0–255) → linear (0–1). */
  srgbParaLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  },

  /** Luminância relativa (0–255) de um pixel sRGB — Rec.709.
   *  Usada como estimativa da luz que chega ao sensor da câmera. */
  luminancia(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  },

  /** RGB (0–255) → XYZ (D65, 0–100). */
  rgbParaXyz(r, g, b) {
    const R = this.srgbParaLinear(r), G = this.srgbParaLinear(g), B = this.srgbParaLinear(b);
    return {
      x: (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) * 100,
      y: (R * 0.2126729 + G * 0.7151522 + B * 0.0721750) * 100,
      z: (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) * 100
    };
  },

  /** XYZ → CIE L*a*b* (iluminante D65). */
  xyzParaLab({ x, y, z }) {
    // Branco de referência D65
    const Xn = 95.047, Yn = 100.0, Zn = 108.883;
    const f = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
    const fx = f(x / Xn), fy = f(y / Yn), fz = f(z / Zn);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  },

  rgbParaLab(r, g, b) { return this.xyzParaLab(this.rgbParaXyz(r, g, b)); },

  /** RGB (0–255) → HSV (h em graus 0–360, s/v em 0–1). */
  rgbParaHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
  },

  hexParaRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  },

  rgbParaHex(r, g, b) {
    const h = v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
    return '#' + h(r) + h(g) + h(b);
  },

  /** Distância euclidiana em RGB — mantida SOMENTE como dado auxiliar de
   *  diagnóstico; a métrica de decisão é sempre o ΔE2000. */
  distanciaRgb(c1, c2) {
    return Math.sqrt((c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2);
  },

  /**
   * ΔE2000 (CIEDE2000) — diferença de cor perceptualmente uniforme.
   * Implementação da fórmula de Sharma, Wu & Dalal (2005).
   * Interpretação prática: <1 imperceptível; 1–2 perceptível lado a lado;
   * 2–5 diferença clara; >10 cores distintas.
   */
  deltaE2000(lab1, lab2) {
    const rad = Math.PI / 180, deg = 180 / Math.PI;
    const { L: L1, a: a1, b: b1 } = lab1;
    const { L: L2, a: a2, b: b2 } = lab2;

    const C1 = Math.sqrt(a1 * a1 + b1 * b1);
    const C2 = Math.sqrt(a2 * a2 + b2 * b2);
    const Cm = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cm, 7) / (Math.pow(Cm, 7) + Math.pow(25, 7))));
    const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
    const C1p = Math.sqrt(a1p * a1p + b1 * b1);
    const C2p = Math.sqrt(a2p * a2p + b2 * b2);

    let h1p = Math.atan2(b1, a1p) * deg; if (h1p < 0) h1p += 360;
    let h2p = Math.atan2(b2, a2p) * deg; if (h2p < 0) h2p += 360;

    const dLp = L2 - L1;
    const dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360;
      else if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp / 2 * rad);

    const Lmp = (L1 + L2) / 2;
    const Cmp = (C1p + C2p) / 2;
    let hmp = h1p + h2p;
    if (C1p * C2p !== 0) {
      if (Math.abs(h1p - h2p) > 180) hmp += (hmp < 360 ? 360 : -360);
      hmp /= 2;
    }

    const T = 1 - 0.17 * Math.cos((hmp - 30) * rad) + 0.24 * Math.cos(2 * hmp * rad)
      + 0.32 * Math.cos((3 * hmp + 6) * rad) - 0.20 * Math.cos((4 * hmp - 63) * rad);
    const dTheta = 30 * Math.exp(-Math.pow((hmp - 275) / 25, 2));
    const Rc = 2 * Math.sqrt(Math.pow(Cmp, 7) / (Math.pow(Cmp, 7) + Math.pow(25, 7)));
    const Sl = 1 + 0.015 * Math.pow(Lmp - 50, 2) / Math.sqrt(20 + Math.pow(Lmp - 50, 2));
    const Sc = 1 + 0.045 * Cmp;
    const Sh = 1 + 0.015 * Cmp * T;
    const Rt = -Math.sin(2 * dTheta * rad) * Rc;

    return Math.sqrt(
      Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2)
      + Rt * (dCp / Sc) * (dHp / Sh)
    );
  }
};

/* ==========================================================================
 * Storage — camada fina sobre localStorage (tudo local, nada remoto)
 * ========================================================================== */
const Storage = {
  CHAVES: {
    HISTORICO: 'csa_historico',
    APRENDIDAS: 'csa_cores_aprendidas',
    CALIBRACAO: 'csa_ultima_calibracao'
  },

  ler(chave, padrao) {
    try {
      const v = localStorage.getItem(chave);
      return v === null ? padrao : JSON.parse(v);
    } catch { return padrao; }
  },

  gravar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
      return true;
    } catch (e) {
      // localStorage cheio (fotos do histórico). O chamador decide o que podar.
      console.warn('Storage cheio ou indisponível:', e);
      return false;
    }
  }
};

/* ==========================================================================
 * Database — banco de cores offline
 * Carrega database/colors.json (pré-cacheado pelo service worker) e mescla
 * as cores aprendidas pelo usuário (item 9 da especificação).
 * ========================================================================== */
const Database = {
  cores: [],        // catálogo + aprendidas, com .lab pré-calculado
  prontas: false,

  async iniciar() {
    let base = { cores: [] };
    try {
      const resp = await fetch('database/colors.json');
      base = await resp.json();
    } catch (e) {
      console.error('Falha ao carregar colors.json', e);
    }
    const aprendidas = Storage.ler(Storage.CHAVES.APRENDIDAS, []);
    this.cores = [...base.cores, ...aprendidas].map(c => {
      const rgb = ColorMath.hexParaRgb(c.hex);
      return { ...c, rgb, lab: ColorMath.rgbParaLab(rgb.r, rgb.g, rgb.b) };
    });
    this.prontas = true;
  },

  /** Ordena todo o catálogo pela distância ΔE2000 até a cor lida. */
  maisProximas(lab, limite = 8) {
    return this.cores
      .map(c => ({ cor: c, deltaE: ColorMath.deltaE2000(lab, c.lab) }))
      .sort((a, b) => a.deltaE - b.deltaE)
      .slice(0, limite);
  },

  /** Busca textual simples (nome, código, montadora, família). */
  buscar(termo) {
    const t = termo.trim().toLowerCase();
    if (!t) return this.cores.slice(0, 30);
    return this.cores.filter(c =>
      [c.nome, c.codigo, c.montadora, c.familia].join(' ').toLowerCase().includes(t)
    ).slice(0, 30);
  },

  /** Registra uma cor aprendida (correção do usuário) e a incorpora ao banco. */
  aprender({ nome, montadora, codigo, hex, condicoes }) {
    const aprendidas = Storage.ler(Storage.CHAVES.APRENDIDAS, []);
    const nova = {
      id: 'apr-' + Date.now(),
      nome, montadora: montadora || '—', codigo: codigo || '—',
      familia: 'Aprendida', tipo: 'aprendida', anos: '—',
      hex,
      origem: 'aprendida',
      condicoes // luz no momento da leitura — permite refino futuro
    };
    aprendidas.push(nova);
    Storage.gravar(Storage.CHAVES.APRENDIDAS, aprendidas);
    const rgb = ColorMath.hexParaRgb(hex);
    this.cores.push({ ...nova, rgb, lab: ColorMath.rgbParaLab(rgb.r, rgb.g, rgb.b) });
    return nova;
  },

  /** Reforço: quando o usuário confirma uma cor já catalogada, guarda a
   *  amostra lida como "apelido aprendido" — na prática, um segundo ponto
   *  Lab para a mesma cor, capturado nas condições de luz reais do usuário. */
  reforcar(corCatalogo, hexLido, condicoes) {
    return this.aprender({
      nome: corCatalogo.nome + ' (amostra local)',
      montadora: corCatalogo.montadora,
      codigo: corCatalogo.codigo,
      hex: hexLido,
      condicoes
    });
  }
};

/* ==========================================================================
 * CameraManager — câmera traseira + congelamento de frame
 * ========================================================================== */
const CameraManager = {
  stream: null,
  videoAtivo: null,

  async iniciar() {
    if (this.stream) return this.stream;
    // Câmera traseira; resolução moderada para rodar bem em aparelhos
    // intermediários (1280px é suficiente para amostragem de cor).
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 }, height: { ideal: 960 }
      },
      audio: false
    });
    return this.stream;
  },

  conectar(videoEl) {
    if (!this.stream) return;
    if (videoEl.srcObject !== this.stream) videoEl.srcObject = this.stream;
    this.videoAtivo = videoEl;
  },

  parar() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  },

  /** Congela o frame atual do vídeo em um canvas (resolução nativa). */
  congelar(videoEl, canvas) {
    canvas.width = videoEl.videoWidth || 640;
    canvas.height = videoEl.videoHeight || 480;
    canvas.getContext('2d').drawImage(videoEl, 0, 0);
  }
};

/* ==========================================================================
 * CalibrationManager — etapa 0 (obrigatória ou explicitamente pulada)
 * --------------------------------------------------------------------------
 * A AmbientLightSensor API não tem suporte confiável (removida no Chrome
 * Android, ausente no Safari). Por isso a luminância é estimada processando
 * o PRÓPRIO feed de vídeo — o que mede exatamente a luz que afeta a captura.
 *
 * Limiares de luminância média (escala 0–255), calibrados empiricamente em
 * testes com câmeras de celular com exposição automática:
 *   < 35   → "muito-escuro"  (ruído do sensor domina; leitura inviável)
 *   35–69  → "escuro"        (possível, mas com desvio de cor)
 *   70–179 → "ideal"         (faixa em que o AWB dos celulares é estável)
 *   180–214→ "claro"         (aceitável; risco de dessaturação)
 *   ≥ 215  → "excesso"       (highlights estourados)
 * Reflexo direto: além da média, se ≥ 2% dos pixels estão ≥ 250 há um
 * brilho especular forte na cena (sol/lâmpada refletida na lataria).
 * ========================================================================== */
const CalibrationManager = {
  // --- limiares documentados acima ---
  LIMIARES: { MUITO_ESCURO: 35, ESCURO: 70, CLARO: 180, EXCESSO: 215 },
  FRACAO_REFLEXO: 0.02,     // 2% de pixels quase saturados ⇒ reflexo direto
  PIXEL_REFLEXO: 250,

  // Alvos do cartão de referência em sRGB:
  //   cinza 18% ⇒ L*=50 ⇒ ~124/255 ; papel branco comum ⇒ ~240/255.
  // Se a amostra média do cartão for > 170 assumimos que o usuário usou
  // papel branco em vez do cartão cinza.
  ALVO_CINZA: 124,
  ALVO_BRANCO: 240,
  LIMIAR_CARTAO_BRANCO: 170,

  // Variação de luz que exige recalibração (item 6 da etapa 0):
  // se a luminância média mudar mais que isso desde a calibração, o fator
  // de correção deixou de valer.
  DELTA_RECALIBRACAO: 45,

  estado: {
    medindo: false,
    lumaAtual: null,        // média móvel da luminância da cena
    classe: null,           // muito-escuro | escuro | ideal | claro | excesso | reflexo
    fatores: null,          // { ganhoR, ganhoG, ganhoB, ganhoLuma } do cartão
    usouCartao: false,
    qualidade: 'nenhuma',   // 'boa' | 'regular' | 'pulada' | 'nenhuma'
    lumaNaCalibracao: null, // luz no momento em que a calibração foi feita
    amostrasEstaveis: 0
  },
  _timer: null,
  _aoAmostrar: null,        // callback da UI

  /** Inicia o laço de medição (4x/s) lendo o vídeo em um canvas reduzido.
   *  64×48 px são suficientes para média e histograma, e mantêm o custo
   *  desprezível em aparelhos modestos. */
  iniciarMonitoramento(videoEl, canvasTrabalho, aoAmostrar) {
    this._aoAmostrar = aoAmostrar;
    this.estado.medindo = true;
    clearInterval(this._timer);
    this._timer = setInterval(() => this._amostrar(videoEl, canvasTrabalho), 250);
  },

  pararMonitoramento() {
    clearInterval(this._timer);
    this._timer = null;
    this.estado.medindo = false;
  },

  _amostrar(videoEl, canvas) {
    if (!videoEl.videoWidth) return;
    canvas.width = 64; canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(videoEl, 0, 0, 64, 48);
    const { data } = ctx.getImageData(0, 0, 64, 48);

    // Luminância média + histograma + fração de pixels estourados
    let soma = 0, estourados = 0;
    const histograma = new Array(16).fill(0); // 16 faixas p/ diagnóstico
    const total = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const y = ColorMath.luminancia(data[i], data[i + 1], data[i + 2]);
      soma += y;
      histograma[Math.min(15, y >> 4)]++;
      if (y >= this.PIXEL_REFLEXO) estourados++;
    }
    const media = soma / total;

    // Média móvel exponencial: suaviza a oscilação do auto-exposição
    this.estado.lumaAtual = this.estado.lumaAtual === null
      ? media : this.estado.lumaAtual * 0.7 + media * 0.3;

    this.estado.classe = this._classificar(this.estado.lumaAtual, estourados / total);
    this.estado.amostrasEstaveis =
      (this.estado.classe === 'ideal' || this.estado.classe === 'claro' || this.estado.classe === 'escuro')
        ? this.estado.amostrasEstaveis + 1 : 0;

    if (this._aoAmostrar) this._aoAmostrar(this.estado, histograma);
  },

  _classificar(luma, fracaoEstourada) {
    if (fracaoEstourada >= this.FRACAO_REFLEXO) return 'reflexo';
    const L = this.LIMIARES;
    if (luma < L.MUITO_ESCURO) return 'muito-escuro';
    if (luma < L.ESCURO) return 'escuro';
    if (luma < L.CLARO) return 'ideal';
    if (luma < L.EXCESSO) return 'claro';
    return 'excesso';
  },

  MENSAGENS: {
    'muito-escuro': '🌑 Muito escuro — aproxime-se de uma fonte de luz',
    'escuro': '🌒 Escuro — mais luz melhora a leitura',
    'ideal': '✅ Luz ideal para leitura',
    'claro': '🌤 Claro — aceitável, evite sol direto',
    'excesso': '☀️ Excesso de luz — procure sombra',
    'reflexo': '✨ Reflexo direto detectado — mude o ângulo'
  },

  /**
   * Calibra com o cartão de referência neutro: amostra a região central do
   * vídeo por ~2 s (8 amostras de 250 ms) e calcula:
   *   • ganho de white balance por canal (neutraliza a dominante de cor da
   *     iluminação: ganhoR = média/R, etc.)
   *   • ganho de luminância (leva o cartão ao valor sRGB esperado)
   * Retorna uma Promise que resolve com os fatores; `aoProgredir(0..1)`
   * alimenta a barra de progresso da UI.
   */
  calibrarComCartao(videoEl, canvas, aoProgredir) {
    return new Promise(resolve => {
      const amostras = [];
      const TOTAL = 8;
      const timer = setInterval(() => {
        if (!videoEl.videoWidth) return;
        // Região central (30% do quadro) — onde o círculo-guia orienta o usuário
        const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
        const w = Math.floor(vw * 0.3), h = Math.floor(vh * 0.3);
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(videoEl, (vw - w) / 2, (vh - h) / 2, w, h, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        let r = 0, g = 0, b = 0;
        const n = data.length / 4;
        for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
        amostras.push({ r: r / n, g: g / n, b: b / n });
        aoProgredir(amostras.length / TOTAL);

        if (amostras.length >= TOTAL) {
          clearInterval(timer);
          const med = amostras.reduce((a, s) => ({ r: a.r + s.r, g: a.g + s.g, b: a.b + s.b }),
            { r: 0, g: 0, b: 0 });
          med.r /= TOTAL; med.g /= TOTAL; med.b /= TOTAL;

          const cinza = (med.r + med.g + med.b) / 3;
          // Papel branco ou cartão cinza 18%? (ver LIMIAR_CARTAO_BRANCO)
          const alvo = cinza > this.LIMIAR_CARTAO_BRANCO ? this.ALVO_BRANCO : this.ALVO_CINZA;

          const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
          this.estado.fatores = {
            // White balance: iguala os três canais à média (remove dominante)
            ganhoR: clamp(cinza / Math.max(1, med.r), 0.5, 2.0),
            ganhoG: clamp(cinza / Math.max(1, med.g), 0.5, 2.0),
            ganhoB: clamp(cinza / Math.max(1, med.b), 0.5, 2.0),
            // Ganho de luminância: leva o cartão ao valor esperado
            ganhoLuma: clamp(alvo / Math.max(1, cinza), 0.6, 1.7),
            cartaoDetectado: alvo === this.ALVO_BRANCO ? 'branco' : 'cinza-18'
          };
          this.estado.usouCartao = true;
          this.estado.lumaNaCalibracao = this.estado.lumaAtual;
          this._definirQualidade();
          this._persistir();
          resolve(this.estado.fatores);
        }
      }, 250);
    });
  },

  /** Conclui a calibração SEM cartão (só a checagem de luz ambiente). */
  concluirSemCartao() {
    this.estado.fatores = null;
    this.estado.usouCartao = false;
    this.estado.lumaNaCalibracao = this.estado.lumaAtual;
    this._definirQualidade();
    this._persistir();
  },

  /** Usuário optou por pular a etapa (item 7 da etapa 0). */
  pular() {
    this.estado.fatores = null;
    this.estado.usouCartao = false;
    this.estado.lumaNaCalibracao = this.estado.lumaAtual;
    this.estado.qualidade = 'pulada';
    this._persistir();
  },

  /** Qualidade: 'boa' exige cartão + luz na faixa ideal; caso contrário
   *  'regular'. 'pulada' só via pular(). */
  _definirQualidade() {
    this.estado.qualidade =
      (this.estado.usouCartao && this.estado.classe === 'ideal') ? 'boa' : 'regular';
  },

  /** A luz mudou o bastante desde a calibração para exigir refazer?
   *  (usuário trocou de ambiente, nuvem cobriu o sol, etc.) */
  precisaRecalibrar() {
    if (this.estado.lumaNaCalibracao === null || this.estado.lumaAtual === null) return false;
    return Math.abs(this.estado.lumaAtual - this.estado.lumaNaCalibracao) > this.DELTA_RECALIBRACAO;
  },

  calibracaoFeita() {
    return this.estado.qualidade !== 'nenhuma';
  },

  _persistir() {
    Storage.gravar(Storage.CHAVES.CALIBRACAO, {
      quando: Date.now(),
      qualidade: this.estado.qualidade,
      usouCartao: this.estado.usouCartao,
      fatores: this.estado.fatores,
      luma: this.estado.lumaNaCalibracao
    });
  }
};

/* ==========================================================================
 * ImageProcessor — correção de iluminação e estatísticas da região
 * --------------------------------------------------------------------------
 * Ordem de processamento (etapa 3 da especificação):
 *   1. White balance + ganho de luminância usando os fatores do cartão
 *      (quando existem) — correção MEDIDA, não "cega".
 *   2. Máscaras de exclusão: reflexos especulares (quase brancos e sem
 *      saturação) e sombras profundas — esses pixels NÃO entram na
 *      estatística de cor.
 *   3. Estatísticas robustas (a "redução de sombras/reflexos" da cor final
 *      vem de medir apenas os pixels válidos e usar mediana/moda em vez de
 *      média simples).
 *   4. Equalização de histograma: usada apenas para diagnóstico/contraste
 *      visual — NUNCA na estimativa colorimétrica, pois equalizar distorce
 *      a cor real (decisão de engenharia documentada aqui).
 * ========================================================================== */
const ImageProcessor = {
  // Limiares das máscaras (empíricos, documentados):
  //   especular: V > 0.96 e S < 0.18 → brilho de luz refletida, não tinta
  //   sombra profunda: Y < 20/255   → sem informação de cor confiável
  LIMIAR_ESPECULAR_V: 0.96,
  LIMIAR_ESPECULAR_S: 0.18,
  LIMIAR_SOMBRA: 20,

  /** Aplica os fatores de calibração a um ImageData (in place). */
  aplicarCalibracao(imageData, fatores) {
    if (!fatores) return imageData;
    const d = imageData.data;
    const { ganhoR, ganhoG, ganhoB, ganhoLuma } = fatores;
    for (let i = 0; i < d.length; i += 4) {
      d[i]     = Math.min(255, d[i]     * ganhoR * ganhoLuma);
      d[i + 1] = Math.min(255, d[i + 1] * ganhoG * ganhoLuma);
      d[i + 2] = Math.min(255, d[i + 2] * ganhoB * ganhoLuma);
    }
    return imageData;
  },

  /**
   * Calcula todas as estatísticas da região selecionada.
   * Retorna médias/moda RGB, HSV, Lab, histograma de Y, métricas de textura
   * (para detecção de acabamento) e as frações mascaradas.
   */
  analisarRegiao(imageData) {
    const d = imageData.data;
    const w = imageData.width, h = imageData.height;
    const total = w * h;

    let somaR = 0, somaG = 0, somaB = 0, somaY = 0, somaY2 = 0;
    let somaS = 0, validos = 0, especulares = 0, sombras = 0;
    const histY = new Array(32).fill(0);
    // Quantização 16 níveis/canal (4096 células) p/ achar a cor dominante
    const celulas = new Map();
    const matizes = [];
    const Ys = new Float32Array(total);

    for (let p = 0, i = 0; p < total; p++, i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const y = ColorMath.luminancia(r, g, b);
      Ys[p] = y;
      histY[Math.min(31, y >> 3)]++;

      const hsv = ColorMath.rgbParaHsv(r, g, b);
      // Máscara de reflexo especular
      if (hsv.v > this.LIMIAR_ESPECULAR_V && hsv.s < this.LIMIAR_ESPECULAR_S) { especulares++; continue; }
      // Máscara de sombra profunda
      if (y < this.LIMIAR_SOMBRA) { sombras++; continue; }

      validos++;
      somaR += r; somaG += g; somaB += b;
      somaY += y; somaY2 += y * y;
      somaS += hsv.s;
      if (hsv.s > 0.12) matizes.push(hsv.h); // matiz só é significativo com saturação

      const chave = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const cel = celulas.get(chave);
      if (cel) { cel.n++; cel.r += r; cel.g += g; cel.b += b; }
      else celulas.set(chave, { n: 1, r, g, b });
    }

    // Fallback: região toda mascarada (ex.: quadrado só no reflexo) —
    // relaxa as máscaras usando todos os pixels.
    if (validos === 0) {
      for (let p = 0, i = 0; p < total; p++, i += 4) {
        somaR += d[i]; somaG += d[i + 1]; somaB += d[i + 2];
        somaY += Ys[p]; somaY2 += Ys[p] * Ys[p];
      }
      validos = total;
    }

    const media = { r: somaR / validos, g: somaG / validos, b: somaB / validos };

    // Cor dominante = célula modal da quantização (média dos pixels dela).
    // Mais robusta que a média global contra sombras/reflexos residuais.
    let dominante = media, melhorN = 0;
    for (const cel of celulas.values()) {
      if (cel.n > melhorN) {
        melhorN = cel.n;
        dominante = { r: cel.r / cel.n, g: cel.g / cel.n, b: cel.b / cel.n };
      }
    }

    // Métricas de textura para detecção de acabamento:
    const mediaY = somaY / validos;
    const varY = Math.max(0, somaY2 / validos - mediaY * mediaY);
    const desvioY = Math.sqrt(varY);

    // "Sparkle": pixels bem mais claros que a vizinhança média — típico das
    // partículas de alumínio de pinturas metálicas.
    let brilhosPontuais = 0;
    for (let p = 0; p < total; p++) {
      if (Ys[p] > mediaY + 2.2 * desvioY && Ys[p] > mediaY + 25) brilhosPontuais++;
    }

    // Desvio circular do matiz (perolizadas mudam o matiz pelo ângulo)
    let desvioMatiz = 0;
    if (matizes.length > 8) {
      let sx = 0, sy = 0;
      for (const hh of matizes) { sx += Math.cos(hh * Math.PI / 180); sy += Math.sin(hh * Math.PI / 180); }
      const R = Math.sqrt(sx * sx + sy * sy) / matizes.length;
      desvioMatiz = Math.sqrt(-2 * Math.log(Math.max(1e-6, R))) * 180 / Math.PI;
    }

    const hsvDom = ColorMath.rgbParaHsv(dominante.r, dominante.g, dominante.b);
    return {
      media, dominante,
      hsv: hsvDom,
      lab: ColorMath.rgbParaLab(dominante.r, dominante.g, dominante.b),
      labMedia: ColorMath.rgbParaLab(media.r, media.g, media.b),
      histogramaY: histY,
      luminanciaMedia: mediaY,
      desvioLuminancia: desvioY,
      saturacaoMedia: somaS / validos,
      desvioMatiz,
      fracaoEspecular: especulares / total,
      fracaoSombra: sombras / total,
      densidadeBrilhos: brilhosPontuais / total,
      pixels: total
    };
  },

  /**
   * Equalização de histograma da luminância — SOMENTE para visualização/
   * diagnóstico (ver nota no cabeçalho do módulo). Devolve um novo ImageData.
   */
  equalizarHistograma(imageData) {
    const d = imageData.data;
    const n = d.length / 4;
    const hist = new Array(256).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      hist[Math.round(ColorMath.luminancia(d[i], d[i + 1], d[i + 2]))]++;
    }
    const cdf = new Array(256); let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; cdf[v] = acc / n; }
    const saida = new ImageData(new Uint8ClampedArray(d), imageData.width, imageData.height);
    const s = saida.data;
    for (let i = 0; i < s.length; i += 4) {
      const y = Math.max(1, ColorMath.luminancia(s[i], s[i + 1], s[i + 2]));
      const fator = (cdf[Math.round(y)] * 255) / y;
      s[i] = Math.min(255, s[i] * fator);
      s[i + 1] = Math.min(255, s[i + 1] * fator);
      s[i + 2] = Math.min(255, s[i + 2] * fator);
    }
    return saida;
  },

  /** Divide a região em 4 quadrantes e devolve o Lab dominante de cada um —
   *  usado na heurística de repintura (diferença entre áreas do mesmo painel). */
  labPorQuadrante(ctx, x, y, lado) {
    const meio = Math.floor(lado / 2);
    const labs = [];
    for (const [qx, qy] of [[0, 0], [meio, 0], [0, meio], [meio, meio]]) {
      const img = ctx.getImageData(x + qx, y + qy, meio || 1, meio || 1);
      const st = this.analisarRegiao(img);
      labs.push(st.lab);
    }
    return labs;
  }
};

/* ==========================================================================
 * ColorAnalyzer — interpretação: acabamento, matching ΔE2000 e confiança
 * ========================================================================== */
const ColorAnalyzer = {
  /**
   * Detecta o acabamento da pintura por heurísticas de textura (empíricas):
   *   metálica:   partículas brilhantes visíveis (densidade de "sparkle")
   *   perolizada: variação de matiz alta com base clara/saturada
   *   fosca:      quase nenhum brilho especular e textura muito uniforme
   *   sólida:     caso restante
   */
  detectarAcabamento(st) {
    if (st.densidadeBrilhos > 0.015 && st.desvioLuminancia > 16) return 'Metálica';
    if (st.desvioMatiz > 28 && st.hsv.v > 0.35 && st.fracaoEspecular > 0.005) return 'Perolizada';
    if (st.fracaoEspecular < 0.002 && st.desvioLuminancia < 10) return 'Fosca';
    return 'Sólida';
  },

  /**
   * Heurísticas de estado da pintura:
   *   desbotamento: L* e croma bem abaixo da cor de catálogo mais próxima
   *   repintura:    quadrantes do mesmo painel com ΔE alto entre si
   * Retorna uma lista de avisos em texto (pode ser vazia).
   */
  diagnosticarEstado(st, melhor, labsQuadrantes) {
    const avisos = [];
    if (melhor) {
      const dL = st.lab.L - melhor.cor.lab.L;
      const cCap = Math.hypot(st.lab.a, st.lab.b);
      const cCat = Math.hypot(melhor.cor.lab.a, melhor.cor.lab.b);
      if (dL < -7 && (cCat - cCap) > 5) {
        avisos.push('Pintura mais escura e menos saturada que o padrão — possível desbotamento/envelhecimento. A cor original estimada é a do catálogo.');
      }
    }
    if (labsQuadrantes && labsQuadrantes.length === 4) {
      let maxDE = 0;
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        maxDE = Math.max(maxDE, ColorMath.deltaE2000(labsQuadrantes[i], labsQuadrantes[j]));
      }
      if (maxDE > 7) {
        avisos.push(`Variação de cor dentro da área marcada (ΔE ${maxDE.toFixed(1)}) — possível repintura parcial, sujeira ou sombra. Marque uma área mais uniforme.`);
      }
    }
    return avisos;
  },

  /**
   * Confiança da leitura = f(ΔE2000 do melhor match) × fator de calibração.
   *
   *   base = 100 − ΔE·4.5   (ΔE 1 → ~95%; ΔE 4 → 82%; ΔE 8 → 64%)
   *
   * Fatores de calibração (transparência exigida pela especificação):
   *   boa 1.00 · regular 0.88 · pulada 0.72
   * Penalidade extra de 0.92 se a luz no momento da captura estava fora da
   * faixa ideal. Teto de 98% — leitura por câmera nunca é certeza absoluta.
   */
  FATOR_CALIBRACAO: { 'boa': 1.0, 'regular': 0.88, 'pulada': 0.72, 'nenhuma': 0.72 },

  calcularConfianca(deltaE, qualidadeCalibracao, luzIdealNaCaptura) {
    let conf = (100 - deltaE * 4.5) * (this.FATOR_CALIBRACAO[qualidadeCalibracao] ?? 0.72);
    if (!luzIdealNaCaptura) conf *= 0.92;
    return Math.round(Math.max(5, Math.min(98, conf)));
  },

  /** Pipeline completo sobre a região selecionada (ImageData já recortado). */
  analisar(imageData, ctxCongelado, selecao, calibracao) {
    // 1) Correção de iluminação com fatores medidos (quando existem)
    ImageProcessor.aplicarCalibracao(imageData, calibracao.fatores);

    // 2) Estatísticas robustas da região
    const st = ImageProcessor.analisarRegiao(imageData);

    // 3) Matching por ΔE2000 contra todo o banco
    const proximas = Database.maisProximas(st.lab, 8);
    const melhor = proximas[0] || null;

    // 4) Acabamento + diagnóstico de estado da pintura
    const acabamento = this.detectarAcabamento(st);
    let labsQuadrantes = null;
    try {
      labsQuadrantes = ImageProcessor.labPorQuadrante(ctxCongelado, selecao.x, selecao.y, selecao.lado);
    } catch { /* região pequena demais — heurística opcional */ }
    const avisos = this.diagnosticarEstado(st, melhor, labsQuadrantes);

    // 5) Confiança
    const luzIdeal = calibracao.classe === 'ideal' || calibracao.classe === 'claro';
    const confianca = melhor
      ? this.calcularConfianca(melhor.deltaE, calibracao.qualidade, luzIdeal) : 0;

    return { st, proximas, melhor, acabamento, avisos, confianca };
  }
};

/* ==========================================================================
 * History — histórico de leituras (item 10)
 * Guarda por leitura: miniatura da foto, data/hora, resultado, código,
 * confiança e qualidade da calibração (com luminância e uso do cartão).
 * ========================================================================== */
const History = {
  MAXIMO: 60, // miniaturas em base64 ocupam espaço; poda as mais antigas

  listar() { return Storage.ler(Storage.CHAVES.HISTORICO, []); },

  salvar(entrada) {
    const lista = this.listar();
    lista.unshift(entrada);
    while (lista.length > this.MAXIMO) lista.pop();
    // Se o localStorage estourar, poda até caber
    while (!Storage.gravar(Storage.CHAVES.HISTORICO, lista) && lista.length > 1) lista.pop();
  },

  apagar(id) {
    Storage.gravar(Storage.CHAVES.HISTORICO, this.listar().filter(e => e.id !== id));
  },

  pesquisar(termo) {
    const t = termo.trim().toLowerCase();
    const lista = this.listar();
    if (!t) return lista;
    return lista.filter(e =>
      [e.resultado.nome, e.resultado.codigo, e.resultado.montadora, e.dataHora]
        .join(' ').toLowerCase().includes(t));
  },

  /** Miniatura JPEG pequena (96 px) da área analisada, para o histórico. */
  miniatura(canvasOrigem, selecao) {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 96;
    c.getContext('2d').drawImage(canvasOrigem,
      selecao.x, selecao.y, selecao.lado, selecao.lado, 0, 0, 96, 96);
    return c.toDataURL('image/jpeg', 0.6);
  }
};

/* ==========================================================================
 * OfflineManager — service worker, cache e instalação
 * ========================================================================== */
const OfflineManager = {
  eventoInstalacao: null,

  iniciar() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(e =>
        console.warn('Service worker não registrado:', e));
    }
    // Guarda o prompt de instalação para oferecê-lo na tela inicial
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this.eventoInstalacao = e;
      const st = document.getElementById('status-instalacao');
      st.innerHTML = '';
      const btn = document.createElement('button');
      btn.className = 'btn btn-secundario';
      btn.textContent = '⬇️ Instalar aplicativo';
      btn.onclick = async () => { this.eventoInstalacao.prompt(); };
      st.appendChild(btn);
    });
  }
};

/* ==========================================================================
 * UIController — telas, eventos e renderização
 * ========================================================================== */
const UIController = {
  el: {},          // cache de elementos
  selecao: null,   // { x, y, lado } em pixels do canvas congelado
  ultimaAnalise: null,
  corComparada: null,

  iniciar() {
    // Cache de todos os elementos usados
    const ids = ['tela-inicio', 'tela-calibracao', 'tela-camera', 'tela-resultado',
      'tela-aprendizado', 'tela-historico', 'tela-comparar',
      'indicador-calibracao', 'calib-texto', 'calib-icone',
      'video-calib', 'video-captura', 'canvas-trabalho', 'canvas-congelado',
      'canvas-selecao', 'barra-luz-preenchimento', 'mensagem-luz',
      'btn-comecar', 'btn-calibrar-cartao', 'btn-calibracao-ok', 'btn-pular-calibracao',
      'progresso-cartao', 'progresso-cartao-barra',
      'btn-congelar', 'btn-analisar', 'btn-recapturar', 'controles-selecao',
      'instrucao-captura', 'aviso-luz-captura',
      'amostra-capturada', 'amostra-banco', 'res-nome', 'res-montadora', 'res-codigo',
      'res-familia', 'res-acabamento', 'res-confianca', 'res-calibracao', 'res-deltae',
      'res-avisos', 'titulo-variacoes', 'lista-variacoes', 'dados-diagnostico',
      'btn-salvar-leitura', 'btn-corrigir', 'btn-nova-leitura',
      'busca-cor-correta', 'lista-cor-correta', 'nova-cor-nome', 'nova-cor-montadora',
      'nova-cor-codigo', 'btn-salvar-cor-nova', 'btn-cancelar-aprendizado',
      'btn-ver-historico', 'busca-historico', 'lista-historico', 'historico-vazio',
      'btn-voltar-historico',
      'btn-ver-comparar', 'comparar-capturada', 'comparar-catalogo', 'comparar-deltae',
      'comparar-lab-cap', 'comparar-lab-cat', 'comparar-rgb', 'busca-comparar',
      'lista-comparar', 'btn-voltar-comparar', 'toast'];
    for (const id of ids) this.el[id] = document.getElementById(id);

    this._ligarEventos();
    this.atualizarIndicadorCalibracao();
  },

  /* ---------------- navegação entre telas ---------------- */
  mostrarTela(id) {
    document.querySelectorAll('.tela').forEach(t => t.classList.remove('ativa'));
    document.getElementById(id).classList.add('ativa');
    window.scrollTo(0, 0);
  },

  toast(msg, ms = 2600) {
    const t = this.el['toast'];
    t.textContent = msg;
    t.classList.remove('oculto');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.add('oculto'), ms);
  },

  /* ---------------- indicador de calibração (sempre no topo) ---------------- */
  atualizarIndicadorCalibracao() {
    const ind = this.el['indicador-calibracao'];
    const q = CalibrationManager.estado.qualidade;
    ind.className = '';
    const mapa = {
      'boa': ['calib-boa', '🟢', 'Calibração: boa'],
      'regular': ['calib-regular', '🟡', 'Calibração: regular'],
      'pulada': ['calib-pulada', '🔴', 'Calibração: pulada'],
      'nenhuma': ['calib-desconhecida', '💡', 'Sem calibração']
    };
    const [cls, ico, txt] = mapa[q] || mapa['nenhuma'];
    ind.classList.add(cls);
    this.el['calib-icone'].textContent = ico;
    this.el['calib-texto'].textContent = txt;
  },

  /* ---------------- eventos ---------------- */
  _ligarEventos() {
    const E = this.el;

    E['btn-comecar'].onclick = () => this.abrirCalibracao();
    E['btn-ver-historico'].onclick = () => this.abrirHistorico();
    E['btn-ver-comparar'].onclick = () => this.abrirComparar();

    // --- calibração ---
    E['btn-calibrar-cartao'].onclick = () => this.calibrarComCartao();
    E['btn-calibracao-ok'].onclick = () => {
      if (!CalibrationManager.estado.usouCartao) CalibrationManager.concluirSemCartao();
      this.atualizarIndicadorCalibracao();
      this.abrirCamera();
    };
    E['btn-pular-calibracao'].onclick = () => {
      CalibrationManager.pular();
      this.atualizarIndicadorCalibracao();
      this.toast('Calibração pulada — a confiança das leituras será reduzida.');
      this.abrirCamera();
    };

    // --- captura ---
    E['btn-congelar'].onclick = () => this.congelarFrame();
    E['btn-recapturar'].onclick = () => this.voltarAoVivo();
    E['btn-analisar'].onclick = () => this.analisarSelecao();

    // --- resultado ---
    E['btn-salvar-leitura'].onclick = () => this.salvarLeitura();
    E['btn-corrigir'].onclick = () => this.abrirAprendizado();
    E['btn-nova-leitura'].onclick = () => this.abrirCamera();

    // --- aprendizado ---
    E['busca-cor-correta'].oninput = () => this.renderListaCorreta();
    E['btn-salvar-cor-nova'].onclick = () => this.salvarCorNova();
    E['btn-cancelar-aprendizado'].onclick = () => this.mostrarTela('tela-resultado');

    // --- histórico ---
    E['busca-historico'].oninput = () => this.renderHistorico();
    E['btn-voltar-historico'].onclick = () => this.mostrarTela('tela-inicio');

    // --- comparar ---
    E['busca-comparar'].oninput = () => this.renderListaComparar();
    E['btn-voltar-comparar'].onclick = () => this.mostrarTela('tela-inicio');

    this._ligarSelecaoDeArea();
  },

  /* ---------------- fluxo: calibração ---------------- */
  async abrirCalibracao() {
    try {
      await CameraManager.iniciar();
    } catch (e) {
      this.toast('Não foi possível acessar a câmera. Verifique a permissão.');
      console.error(e);
      return;
    }
    CameraManager.conectar(this.el['video-calib']);
    this.mostrarTela('tela-calibracao');

    // Laço de medição de luz alimenta a barra/semáforo em tempo real
    CalibrationManager.iniciarMonitoramento(
      this.el['video-calib'], this.el['canvas-trabalho'],
      estado => this.renderLuz(estado));
  },

  renderLuz(estado) {
    // Posição do cursor na barra (0–255 → 0–100%)
    const pct = Math.min(100, Math.max(0, (estado.lumaAtual / 255) * 100));
    this.el['barra-luz-preenchimento'].style.left = `calc(${pct}% - 2px)`;
    this.el['mensagem-luz'].textContent =
      CalibrationManager.MENSAGENS[estado.classe] || 'Analisando luz…';

    // "Continuar" habilita quando há leitura estável e minimamente utilizável
    // (≥1 s em faixa aceitável). Muito-escuro/excesso/reflexo bloqueiam.
    this.el['btn-calibracao-ok'].disabled = estado.amostrasEstaveis < 4;

    // Aviso de luz também durante a captura
    const aviso = this.el['aviso-luz-captura'];
    if (estado.classe && estado.classe !== 'ideal' && estado.classe !== 'claro') {
      aviso.textContent = CalibrationManager.MENSAGENS[estado.classe];
      aviso.classList.remove('oculto');
    } else {
      aviso.classList.add('oculto');
    }
  },

  async calibrarComCartao() {
    const E = this.el;
    E['btn-calibrar-cartao'].disabled = true;
    E['progresso-cartao'].classList.remove('oculto');
    await CalibrationManager.calibrarComCartao(
      E['video-calib'], E['canvas-trabalho'],
      p => { E['progresso-cartao-barra'].style.width = (p * 100) + '%'; });
    E['btn-calibrar-cartao'].disabled = false;
    E['progresso-cartao'].classList.add('oculto');
    E['progresso-cartao-barra'].style.width = '0%';
    const f = CalibrationManager.estado.fatores;
    this.atualizarIndicadorCalibracao();
    this.toast(`Cartão ${f.cartaoDetectado === 'branco' ? 'branco' : 'cinza 18%'} calibrado ✓`);
    E['btn-calibracao-ok'].disabled = false;
  },

  /* ---------------- fluxo: captura ---------------- */
  async abrirCamera() {
    try {
      await CameraManager.iniciar(); // religa se a câmera foi liberada
    } catch (e) {
      this.toast('Não foi possível acessar a câmera. Verifique a permissão.');
      return;
    }
    CameraManager.conectar(this.el['video-captura']);
    this.mostrarTela('tela-camera');
    this.voltarAoVivo();
    // Continua monitorando a luz durante a captura (para o aviso e para a
    // detecção de mudança de ambiente → recalibração)
    CalibrationManager.iniciarMonitoramento(
      this.el['video-captura'], this.el['canvas-trabalho'],
      estado => this.renderLuz(estado));
  },

  voltarAoVivo() {
    const E = this.el;
    E['canvas-congelado'].classList.add('oculto');
    E['canvas-selecao'].classList.add('oculto');
    E['controles-selecao'].classList.add('oculto');
    E['btn-congelar'].classList.remove('oculto');
    E['instrucao-captura'].classList.remove('oculto');
    E['video-captura'].classList.remove('oculto');
    this.selecao = null;
    E['btn-analisar'].disabled = true;
  },

  congelarFrame() {
    const E = this.el;
    const video = E['video-captura'];
    if (!video.videoWidth) { this.toast('Câmera ainda carregando…'); return; }

    // Recalibração automática: a luz mudou demais desde a calibração?
    if (CalibrationManager.calibracaoFeita() && CalibrationManager.precisaRecalibrar()) {
      this.toast('⚠️ A luz mudou desde a calibração. Recalibre para manter a precisão.', 4000);
      // Não bloqueia, mas rebaixa a qualidade desta leitura para "regular"
      if (CalibrationManager.estado.qualidade === 'boa') {
        CalibrationManager.estado.qualidade = 'regular';
        this.atualizarIndicadorCalibracao();
      }
    }

    CameraManager.congelar(video, E['canvas-congelado']);
    E['canvas-congelado'].classList.remove('oculto');
    E['video-captura'].classList.add('oculto');

    // Prepara o canvas de seleção no tamanho exibido (coordenadas de tela)
    const sel = E['canvas-selecao'];
    const rect = sel.parentElement.getBoundingClientRect();
    sel.width = rect.width * devicePixelRatio;
    sel.height = rect.height * devicePixelRatio;
    sel.classList.remove('oculto');
    sel.getContext('2d').clearRect(0, 0, sel.width, sel.height);

    E['btn-congelar'].classList.add('oculto');
    E['instrucao-captura'].classList.add('oculto');
    E['controles-selecao'].classList.remove('oculto');
  },

  /* Desenho do quadrado de seleção por toque/arrasto.
   * O vídeo/canvas é exibido com object-fit: cover, então é preciso mapear
   * as coordenadas de tela para pixels do frame congelado. */
  _ligarSelecaoDeArea() {
    const sel = this.el['canvas-selecao'];
    let inicio = null;

    const pos = ev => {
      const r = sel.getBoundingClientRect();
      const p = ev.touches ? ev.touches[0] : ev;
      return { x: p.clientX - r.left, y: p.clientY - r.top, r };
    };

    const desenhar = (a, b) => {
      const ctx = sel.getContext('2d');
      const dpr = devicePixelRatio;
      ctx.clearRect(0, 0, sel.width, sel.height);
      const lado = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      const x = b.x >= a.x ? a.x : a.x - lado;
      const y = b.y >= a.y ? a.y : a.y - lado;
      ctx.strokeStyle = '#2f81f7';
      ctx.lineWidth = 3 * dpr;
      ctx.setLineDash([8 * dpr, 6 * dpr]);
      ctx.strokeRect(x * dpr, y * dpr, lado * dpr, lado * dpr);
      return { x, y, lado };
    };

    const converterParaFrame = (quadTela, r) => {
      // object-fit: cover — fator de escala e deslocamento do recorte
      const cong = this.el['canvas-congelado'];
      const s = Math.max(r.width / cong.width, r.height / cong.height);
      const offX = (cong.width * s - r.width) / 2;
      const offY = (cong.height * s - r.height) / 2;
      const x = Math.round((quadTela.x + offX) / s);
      const y = Math.round((quadTela.y + offY) / s);
      const lado = Math.round(quadTela.lado / s);
      // Garante que o quadrado fica dentro do frame
      return {
        x: Math.max(0, Math.min(cong.width - 4, x)),
        y: Math.max(0, Math.min(cong.height - 4, y)),
        lado: Math.max(4, Math.min(lado, cong.width - x, cong.height - y))
      };
    };

    const aoMover = ev => {
      if (!inicio) return;
      ev.preventDefault();
      const p = pos(ev);
      const quad = desenhar(inicio, p);
      if (quad.lado > 14) {
        this.selecao = converterParaFrame(quad, p.r);
        this.el['btn-analisar'].disabled = false;
      }
    };

    sel.addEventListener('pointerdown', ev => { inicio = pos(ev); });
    sel.addEventListener('pointermove', aoMover);
    sel.addEventListener('pointerup', () => { inicio = null; });
    sel.addEventListener('pointercancel', () => { inicio = null; });
  },

  /* ---------------- fluxo: análise e resultado ---------------- */
  analisarSelecao() {
    if (!this.selecao) return;
    const cong = this.el['canvas-congelado'];
    const ctx = cong.getContext('2d', { willReadFrequently: true });
    const { x, y, lado } = this.selecao;
    const imageData = ctx.getImageData(x, y, lado, lado);

    const resultado = ColorAnalyzer.analisar(
      imageData, ctx, this.selecao, CalibrationManager.estado);
    this.ultimaAnalise = {
      ...resultado,
      selecao: this.selecao,
      calibracao: {
        qualidade: CalibrationManager.estado.qualidade,
        luminancia: Math.round(CalibrationManager.estado.lumaAtual ?? 0),
        usouCartao: CalibrationManager.estado.usouCartao
      },
      miniatura: History.miniatura(cong, this.selecao)
    };
    this.renderResultado();
    this.mostrarTela('tela-resultado');
  },

  renderResultado() {
    const E = this.el;
    const a = this.ultimaAnalise;
    const st = a.st;
    const hexCapturada = ColorMath.rgbParaHex(st.dominante.r, st.dominante.g, st.dominante.b);

    E['amostra-capturada'].style.background = hexCapturada;

    if (a.melhor) {
      const c = a.melhor.cor;
      E['amostra-banco'].style.background = c.hex;
      E['res-nome'].textContent = c.nome;
      E['res-montadora'].textContent = c.montadora;
      E['res-codigo'].textContent = c.codigo;
      E['res-familia'].textContent = `${c.familia} · ${c.anos}`;
      E['res-deltae'].textContent = a.melhor.deltaE.toFixed(1);
    } else {
      E['res-nome'].textContent = 'Sem correspondência';
    }
    E['res-acabamento'].textContent = a.acabamento;

    const rotuloCalib = { boa: 'Boa', regular: 'Regular', pulada: 'Pulada', nenhuma: '—' };
    E['res-confianca'].textContent =
      `${a.confianca}%` + (a.calibracao.qualidade === 'pulada' ? ' (reduzida)' : '');
    E['res-calibracao'].textContent =
      `${rotuloCalib[a.calibracao.qualidade]} · luz ${a.calibracao.luminancia}/255` +
      (a.calibracao.usouCartao ? ' · com cartão' : '');

    const avisos = [...a.avisos];
    if (a.calibracao.qualidade === 'pulada') {
      avisos.unshift('Confiança reduzida — calibração não realizada.');
    }
    E['res-avisos'].textContent = avisos.join(' ');

    // Modo Inteligente: confiança < 80% → lista vira "Possíveis correspondências"
    E['titulo-variacoes'].textContent =
      a.confianca < 80 ? 'Possíveis correspondências (confiança baixa)' : 'Variações semelhantes';

    const lista = E['lista-variacoes'];
    lista.innerHTML = '';
    for (const { cor, deltaE } of a.proximas.slice(1, 6)) {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="bolinha-cor" style="background:${cor.hex}"></div>
        <div class="var-info">
          <div class="var-nome">${cor.nome}</div>
          <div class="var-detalhe">${cor.montadora} · ${cor.codigo}</div>
        </div>
        <div class="var-deltae">ΔE ${deltaE.toFixed(1)}</div>`;
      lista.appendChild(li);
    }

    // Diagnóstico técnico (inclui a distância RGB auxiliar)
    const diag = E['dados-diagnostico'];
    const rgbAux = a.melhor
      ? ColorMath.distanciaRgb(st.dominante, a.melhor.cor.rgb).toFixed(0) : '—';
    const linhas = [
      ['Cor capturada (hex)', hexCapturada],
      ['CIE Lab', `L ${st.lab.L.toFixed(1)} · a ${st.lab.a.toFixed(1)} · b ${st.lab.b.toFixed(1)}`],
      ['HSV', `${st.hsv.h.toFixed(0)}° · ${(st.hsv.s * 100).toFixed(0)}% · ${(st.hsv.v * 100).toFixed(0)}%`],
      ['Distância RGB (auxiliar)', rgbAux],
      ['Reflexos descartados', (st.fracaoEspecular * 100).toFixed(1) + '%'],
      ['Sombras descartadas', (st.fracaoSombra * 100).toFixed(1) + '%'],
      ['Luminância da região', st.luminanciaMedia.toFixed(0) + '/255'],
      ['Saturação média', (st.saturacaoMedia * 100).toFixed(0) + '%']
    ];
    diag.innerHTML = linhas.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  },

  salvarLeitura() {
    const a = this.ultimaAnalise;
    if (!a) return;
    const agora = new Date();
    History.salvar({
      id: 'h-' + Date.now(),
      dataHora: agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR').slice(0, 5),
      thumb: a.miniatura,
      resultado: a.melhor ? {
        nome: a.melhor.cor.nome, codigo: a.melhor.cor.codigo, montadora: a.melhor.cor.montadora
      } : { nome: 'Sem correspondência', codigo: '—', montadora: '—' },
      hexCapturada: ColorMath.rgbParaHex(a.st.dominante.r, a.st.dominante.g, a.st.dominante.b),
      lab: a.st.lab,
      confianca: a.confianca,
      calibracao: a.calibracao
    });
    this.toast('Leitura salva no histórico ✓');
  },

  /* ---------------- fluxo: aprendizado ---------------- */
  abrirAprendizado() {
    this.el['busca-cor-correta'].value = '';
    this.renderListaCorreta();
    this.mostrarTela('tela-aprendizado');
  },

  renderListaCorreta() {
    const lista = this.el['lista-cor-correta'];
    const cores = Database.buscar(this.el['busca-cor-correta'].value);
    lista.innerHTML = '';
    for (const c of cores) {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="bolinha-cor" style="background:${c.hex}"></div>
        <div class="var-info">
          <div class="var-nome">${c.nome}</div>
          <div class="var-detalhe">${c.montadora} · ${c.codigo}</div>
        </div>`;
      li.onclick = () => this.confirmarCorCorreta(c);
      lista.appendChild(li);
    }
  },

  confirmarCorCorreta(cor) {
    const a = this.ultimaAnalise;
    if (!a) return;
    // Reforço: guarda a amostra lida como ponto extra dessa cor, com as
    // condições de luz — o matching futuro passa a reconhecer essa cor
    // também sob a iluminação típica do usuário.
    Database.reforcar(cor,
      ColorMath.rgbParaHex(a.st.dominante.r, a.st.dominante.g, a.st.dominante.b),
      a.calibracao);
    this.toast(`Corrigido para ${cor.nome} — o app aprendeu essa amostra ✓`);
    this.mostrarTela('tela-resultado');
  },

  salvarCorNova() {
    const a = this.ultimaAnalise;
    const nome = this.el['nova-cor-nome'].value.trim();
    if (!nome) { this.toast('Informe o nome da cor.'); return; }
    Database.aprender({
      nome,
      montadora: this.el['nova-cor-montadora'].value.trim(),
      codigo: this.el['nova-cor-codigo'].value.trim(),
      hex: a ? ColorMath.rgbParaHex(a.st.dominante.r, a.st.dominante.g, a.st.dominante.b) : '#808080',
      condicoes: a ? a.calibracao : null
    });
    this.toast(`Cor "${nome}" cadastrada ✓`);
    this.mostrarTela('tela-resultado');
  },

  /* ---------------- fluxo: histórico ---------------- */
  abrirHistorico() {
    this.el['busca-historico'].value = '';
    this.renderHistorico();
    this.mostrarTela('tela-historico');
  },

  renderHistorico() {
    const lista = this.el['lista-historico'];
    const itens = History.pesquisar(this.el['busca-historico'].value);
    lista.innerHTML = '';
    this.el['historico-vazio'].classList.toggle('oculto', itens.length > 0);
    const rotuloCalib = { boa: 'boa', regular: 'regular', pulada: 'pulada', nenhuma: '—' };
    for (const e of itens) {
      const li = document.createElement('li');
      li.innerHTML = `
        <img class="hist-foto" src="${e.thumb}" alt="">
        <div class="hist-info">
          <div class="hist-nome">${e.resultado.nome}</div>
          <div class="hist-detalhe">${e.resultado.montadora} · ${e.resultado.codigo}</div>
          <div class="hist-detalhe">${e.dataHora} · ${e.confianca}% · calibração ${rotuloCalib[e.calibracao?.qualidade] || '—'}</div>
        </div>
        <button class="hist-apagar" title="Apagar">🗑</button>`;
      li.querySelector('.hist-apagar').onclick = () => {
        History.apagar(e.id);
        this.renderHistorico();
      };
      lista.appendChild(li);
    }
  },

  /* ---------------- fluxo: comparar ---------------- */
  abrirComparar() {
    const a = this.ultimaAnalise;
    const E = this.el;
    if (a) {
      const hex = ColorMath.rgbParaHex(a.st.dominante.r, a.st.dominante.g, a.st.dominante.b);
      E['comparar-capturada'].style.background = hex;
    } else {
      E['comparar-capturada'].style.background = '#333';
    }
    E['busca-comparar'].value = '';
    this.renderListaComparar();
    this.renderComparacao();
    this.mostrarTela('tela-comparar');
  },

  renderListaComparar() {
    const lista = this.el['lista-comparar'];
    const cores = Database.buscar(this.el['busca-comparar'].value);
    lista.innerHTML = '';
    for (const c of cores) {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="bolinha-cor" style="background:${c.hex}"></div>
        <div class="var-info">
          <div class="var-nome">${c.nome}</div>
          <div class="var-detalhe">${c.montadora} · ${c.codigo}</div>
        </div>`;
      li.onclick = () => { this.corComparada = c; this.renderComparacao(); window.scrollTo(0, 0); };
      lista.appendChild(li);
    }
  },

  renderComparacao() {
    const E = this.el;
    const a = this.ultimaAnalise;
    const c = this.corComparada;
    E['comparar-catalogo'].style.background = c ? c.hex : '#333';
    if (a && c) {
      const de = ColorMath.deltaE2000(a.st.lab, c.lab);
      E['comparar-deltae'].textContent = de.toFixed(2);
      E['comparar-lab-cap'].textContent =
        `L ${a.st.lab.L.toFixed(1)} · a ${a.st.lab.a.toFixed(1)} · b ${a.st.lab.b.toFixed(1)}`;
      E['comparar-lab-cat'].textContent =
        `L ${c.lab.L.toFixed(1)} · a ${c.lab.a.toFixed(1)} · b ${c.lab.b.toFixed(1)}`;
      E['comparar-rgb'].textContent = ColorMath.distanciaRgb(a.st.dominante, c.rgb).toFixed(0);
    } else {
      E['comparar-deltae'].textContent = a ? 'Escolha uma cor abaixo' : 'Faça uma leitura primeiro';
      E['comparar-lab-cap'].textContent = a
        ? `L ${a.st.lab.L.toFixed(1)} · a ${a.st.lab.a.toFixed(1)} · b ${a.st.lab.b.toFixed(1)}` : '—';
      E['comparar-lab-cat'].textContent = '—';
      E['comparar-rgb'].textContent = '—';
    }
  }
};

/* ==========================================================================
 * Inicialização
 * ========================================================================== */
window.addEventListener('DOMContentLoaded', async () => {
  OfflineManager.iniciar();
  UIController.iniciar();
  await Database.iniciar();
});

// Libera a câmera quando o app vai para segundo plano (economia de bateria)
// e religa automaticamente quando o usuário volta a uma tela de câmera.
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    CalibrationManager.pararMonitoramento();
    CameraManager.parar();
    return;
  }
  const telaAtiva = document.querySelector('.tela.ativa')?.id;
  if (telaAtiva === 'tela-calibracao') UIController.abrirCalibracao();
  else if (telaAtiva === 'tela-camera') {
    try {
      await CameraManager.iniciar();
      UIController.abrirCamera();
    } catch { /* usuário decide quando reabrir */ }
  }
});
