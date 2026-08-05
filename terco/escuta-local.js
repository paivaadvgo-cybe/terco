/* ==========================================================================
   ESCUTA LOCAL — reconhecimento de fala dentro do próprio aparelho
   Fase 4 do aplicativo do Santo Terço.

   Este é o ÚNICO arquivo de código fora do terco.html, e existe por exceção
   explicitamente autorizada no briefing. Ele nunca é carregado sozinho: só
   entra em cena por import() dinâmico, depois que a pessoa liga a função e
   consente com o download do modelo. O terco.html abre e funciona por
   completo sem ele.

   Nenhum byte de áudio sai do aparelho. O microfone é capturado, recortado
   em janelas curtas e transcrito localmente. A única coisa que trafega pela
   rede é o download do modelo, uma vez, e depois nem isso.
   ========================================================================== */

"use strict";

export const VERSAO = "1.0.0";

/* Modelos oferecidos. Os tamanhos são aproximados e servem para avisar a
   pessoa antes de baixar; o número exato aparece na barra de progresso. */
export const MODELOS = Object.freeze({
  tiny: Object.freeze({
    id: "onnx-community/whisper-tiny",
    nome: "Pequeno",
    tamanhoAproximadoMB: 45,
    descricao: "Baixa rápido e roda em quase qualquer aparelho. Erra mais."
  }),
  base: Object.freeze({
    id: "onnx-community/whisper-base",
    nome: "Médio",
    tamanhoAproximadoMB: 90,
    descricao: "Acompanha melhor quem reza baixinho ou com sotaque. Exige um aparelho mais folgado."
  })
});

/* De onde vem a biblioteca. A primeira opção é do próprio servidor do
   aplicativo: quem hospedar uma cópia em ./transformers/ tem a Fase 4
   funcionando sem depender de rede de terceiros. A segunda é o CDN. */
export const FONTES_DA_BIBLIOTECA = Object.freeze([
  "./transformers/transformers.min.js",
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.min.js"
]);

const TAXA_ALVO = 16000;          // Whisper trabalha em 16 kHz
const JANELA_MAXIMA_S = 3.0;      // janelas curtas, como manda o briefing
const JANELA_MINIMA_S = 0.35;
const PRE_ROLO_S = 0.35;          // guarda o comecinho da fala, que se perderia
const SILENCIO_PARA_FECHAR_S = 0.45;
const FILA_MAXIMA = 2;            // segmentos represados; o resto é descartado
const LATENCIA_LIMITE_MS = 1500;  // acima disto o aparelho não dá conta
const AMOSTRAS_DE_LATENCIA = 4;   // quantas medições antes de desistir

/* --------------------------------------------------------------------------
   Código do detector de voz, que roda dentro do AudioWorklet.
   Só sai daqui o que for fala: silêncio nunca chega a ser processado.
   -------------------------------------------------------------------------- */
const CODIGO_DETECTOR = `
class DetectorDeVoz extends AudioWorkletProcessor {
  constructor(opcoes){
    super();
    const o = (opcoes && opcoes.processorOptions) || {};
    this.taxa = o.taxa || ${TAXA_ALVO};
    this.maxAmostras = Math.round(this.taxa * ${JANELA_MAXIMA_S});
    this.minAmostras = Math.round(this.taxa * ${JANELA_MINIMA_S});
    this.preRolo = Math.round(this.taxa * ${PRE_ROLO_S});
    this.blocosSilencioParaFechar = Math.ceil((this.taxa * ${SILENCIO_PARA_FECHAR_S}) / 128);
    this.blocosParaAbrir = 8;                 // ~64 ms acima do piso

    this.ruidoBase = 0.006;
    this.emFala = false;
    this.acima = 0;
    this.abaixo = 0;
    this.buffer = [];
    this.total = 0;
    this.anterior = [];
    this.totalAnterior = 0;
    this.ligado = true;

    this.port.onmessage = (e) => {
      if (e.data && e.data.tipo === 'parar') this.ligado = false;
      if (e.data && e.data.tipo === 'sensibilidade') this.fator = e.data.valor;
    };
    this.fator = 3.0;
  }

  guardarAnterior(bloco){
    this.anterior.push(bloco);
    this.totalAnterior += bloco.length;
    while (this.totalAnterior - this.anterior[0].length >= this.preRolo){
      this.totalAnterior -= this.anterior[0].length;
      this.anterior.shift();
    }
  }

  fechar(){
    if (this.total >= this.minAmostras){
      const junto = new Float32Array(this.total);
      let i = 0;
      for (const b of this.buffer){ junto.set(b, i); i += b.length; }
      this.port.postMessage({ tipo: 'segmento', amostras: junto, taxa: this.taxa }, [junto.buffer]);
    }
    this.buffer = []; this.total = 0;
    this.emFala = false; this.acima = 0; this.abaixo = 0;
  }

  process(entradas){
    if (!this.ligado) return false;
    const canal = entradas[0] && entradas[0][0];
    if (!canal || !canal.length) return true;

    let soma = 0;
    for (let i = 0; i < canal.length; i++) soma += canal[i] * canal[i];
    const rms = Math.sqrt(soma / canal.length);

    const limiar = Math.max(0.008, this.ruidoBase * this.fator);
    const bloco = new Float32Array(canal);

    if (!this.emFala){
      // Piso de ruído só se atualiza no silêncio, senão a fala o levanta.
      this.ruidoBase = this.ruidoBase * 0.995 + rms * 0.005;
      this.guardarAnterior(bloco);
      if (rms > limiar){
        this.acima++;
        if (this.acima >= this.blocosParaAbrir){
          this.emFala = true; this.abaixo = 0;
          for (const b of this.anterior){ this.buffer.push(b); this.total += b.length; }
          this.anterior = []; this.totalAnterior = 0;
        }
      } else {
        this.acima = 0;
      }
      return true;
    }

    this.buffer.push(bloco);
    this.total += bloco.length;
    if (rms > limiar) this.abaixo = 0; else this.abaixo++;

    if (this.abaixo >= this.blocosSilencioParaFechar || this.total >= this.maxAmostras){
      this.fechar();
    }
    return true;
  }
}
registerProcessor('detector-de-voz', DetectorDeVoz);
`;

/* --------------------------------------------------------------------------
   Código do Web Worker que carrega o modelo e transcreve.
   Fica fora da thread da interface para que o reconhecimento não engasgue
   nenhuma transição de tela.
   -------------------------------------------------------------------------- */
const CODIGO_WORKER = `
let transcritor = null;
let dispositivo = null;

async function preparar(dados){
  const { urls, modelo, preferirWebGPU } = dados;

  let lib = null;
  let ultimoErro = null;
  for (const url of urls){
    try { lib = await import(url); break; }
    catch (erro){ ultimoErro = erro; }
  }
  if (!lib) throw new Error('biblioteca indisponível: ' + (ultimoErro && ultimoErro.message));

  const { pipeline, env } = lib;
  if (env){
    env.allowLocalModels = false;
    env.useBrowserCache = true;      // baixa uma vez, fica guardado no aparelho
  }

  const tentativas = preferirWebGPU
    ? [{ device: 'webgpu', dtype: 'fp32' }, { device: 'wasm', dtype: 'q8' }]
    : [{ device: 'wasm', dtype: 'q8' }];

  let erroFinal = null;
  for (const t of tentativas){
    try {
      transcritor = await pipeline('automatic-speech-recognition', modelo, {
        device: t.device,
        dtype: t.dtype,
        progress_callback: (p) => { self.postMessage({ tipo: 'progresso', dados: p }); }
      });
      dispositivo = t.device;
      return dispositivo;
    } catch (erro){ erroFinal = erro; }
  }
  throw erroFinal || new Error('não foi possível preparar o modelo');
}

self.onmessage = async (evento) => {
  const msg = evento.data || {};
  try {
    if (msg.tipo === 'preparar'){
      const d = await preparar(msg);
      self.postMessage({ tipo: 'pronto', dispositivo: d });
      return;
    }
    if (msg.tipo === 'transcrever'){
      if (!transcritor){ self.postMessage({ tipo: 'texto', id: msg.id, texto: '', ms: 0 }); return; }
      const inicio = (self.performance || Date).now();
      const saida = await transcritor(msg.amostras, {
        language: 'portuguese',
        task: 'transcribe',
        return_timestamps: false
      });
      const ms = (self.performance || Date).now() - inicio;
      const texto = (saida && typeof saida.text === 'string') ? saida.text
                  : (Array.isArray(saida) && saida[0] ? saida[0].text : '');
      self.postMessage({ tipo: 'texto', id: msg.id, texto: texto || '', ms: ms });
      return;
    }
    if (msg.tipo === 'encerrar'){ transcritor = null; self.close(); return; }
  } catch (erro){
    self.postMessage({ tipo: 'falha', mensagem: String(erro && erro.message ? erro.message : erro) });
  }
};
`;

function urlDeBlob(codigo, tipo){
  return URL.createObjectURL(new Blob([codigo], { type: tipo || "text/javascript" }));
}

/* Reamostragem linear, para o caso de o aparelho não entregar 16 kHz. */
function reamostrar(amostras, taxaOrigem, taxaDestino){
  if (taxaOrigem === taxaDestino) return amostras;
  const proporcao = taxaOrigem / taxaDestino;
  const saida = new Float32Array(Math.floor(amostras.length / proporcao));
  for (let i = 0; i < saida.length; i++){
    const pos = i * proporcao;
    const a = Math.floor(pos);
    const b = Math.min(a + 1, amostras.length - 1);
    const f = pos - a;
    saida[i] = amostras[a] * (1 - f) + amostras[b] * f;
  }
  return saida;
}

function mediana(lista){
  if (!lista.length) return 0;
  const ordenada = lista.slice().sort(function(a, b){ return a - b; });
  const meio = Math.floor(ordenada.length / 2);
  return ordenada.length % 2 ? ordenada[meio] : (ordenada[meio - 1] + ordenada[meio]) / 2;
}

/* --------------------------------------------------------------------------
   Fábrica pública. O terco.html chama isto depois do import() dinâmico.
   -------------------------------------------------------------------------- */
export function criar(opcoes){
  opcoes = opcoes || {};

  const urls = opcoes.urlsDaBiblioteca || FONTES_DA_BIBLIOTECA;
  const modelo = opcoes.modelo || MODELOS.tiny.id;
  const aoTranscrever = opcoes.aoTranscrever || function(){};
  const aoProgresso = opcoes.aoProgresso || function(){};
  const aoFalhar = opcoes.aoFalhar || function(){};
  const aoEstado = opcoes.aoEstado || function(){};
  const limiteLatencia = typeof opcoes.limiteLatenciaMs === "number"
    ? opcoes.limiteLatenciaMs : LATENCIA_LIMITE_MS;

  let worker = null;
  let contexto = null;
  let no = null;
  let fluxo = null;
  let urlDetector = null;
  let urlWorker = null;

  let preparado = false;
  let capturando = false;
  let dispositivo = null;
  let proximoId = 1;
  let pendentes = 0;
  const latencias = [];
  let jaAvisouLatencia = false;

  function relatar(estado, extra){
    try { aoEstado(Object.assign({ estado: estado }, extra || {})); } catch (erro){ /* silencioso */ }
  }

  function falhar(motivo, detalhe){
    try { aoFalhar({ motivo: motivo, detalhe: detalhe || "" }); } catch (erro){ /* silencioso */ }
  }

  function aoMensagemDoWorker(evento){
    const msg = evento.data || {};
    if (msg.tipo === "progresso"){
      try { aoProgresso(msg.dados || {}); } catch (erro){ /* silencioso */ }
      return;
    }
    if (msg.tipo === "texto"){
      pendentes = Math.max(0, pendentes - 1);
      if (typeof msg.ms === "number" && msg.ms > 0){
        latencias.push(msg.ms);
        if (latencias.length > 12) latencias.shift();
        if (!jaAvisouLatencia && latencias.length >= AMOSTRAS_DE_LATENCIA &&
            mediana(latencias) > limiteLatencia){
          jaAvisouLatencia = true;
          falhar("lento", Math.round(mediana(latencias)) + " ms por trecho");
        }
      }
      const texto = String(msg.texto || "").trim();
      if (texto) { try { aoTranscrever(texto); } catch (erro){ /* silencioso */ } }
      return;
    }
    if (msg.tipo === "falha"){
      falhar("modelo", msg.mensagem || "");
    }
  }

  /* Baixa a biblioteca e o modelo. Só é chamado depois do consentimento. */
  function preparar(){
    if (preparado) return Promise.resolve(dispositivo);
    return new Promise(function(resolver, rejeitar){
      try {
        urlWorker = urlDeBlob(CODIGO_WORKER);
        worker = new Worker(urlWorker, { type: "module" });
      } catch (erro){
        rejeitar(new Error("sem suporte a Web Worker de módulo"));
        return;
      }

      const aoPronto = function(evento){
        const msg = evento.data || {};
        if (msg.tipo === "pronto"){
          worker.removeEventListener("message", aoPronto);
          worker.addEventListener("message", aoMensagemDoWorker);
          preparado = true;
          dispositivo = msg.dispositivo;
          relatar("preparado", { dispositivo: dispositivo });
          resolver(dispositivo);
          return;
        }
        if (msg.tipo === "progresso"){
          try { aoProgresso(msg.dados || {}); } catch (erro){ /* silencioso */ }
          return;
        }
        if (msg.tipo === "falha"){
          worker.removeEventListener("message", aoPronto);
          rejeitar(new Error(msg.mensagem || "falha ao preparar o modelo"));
        }
      };

      worker.addEventListener("message", aoPronto);
      worker.addEventListener("error", function(e){
        rejeitar(new Error("worker: " + (e && e.message ? e.message : "erro")));
      });

      relatar("baixando");
      worker.postMessage({
        tipo: "preparar",
        urls: urls,
        modelo: modelo,
        preferirWebGPU: !!(typeof navigator !== "undefined" && navigator.gpu)
      });
    });
  }

  /* Liga o microfone e começa a recortar em janelas de fala. */
  async function iniciar(){
    if (capturando) return true;
    if (!preparado) throw new Error("o modelo ainda não está pronto");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      throw new Error("este navegador não dá acesso ao microfone");
    }

    fluxo = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    const Contexto = window.AudioContext || window.webkitAudioContext;
    try { contexto = new Contexto({ sampleRate: TAXA_ALVO }); }
    catch (erro){ contexto = new Contexto(); }
    if (contexto.state === "suspended"){ try { await contexto.resume(); } catch (e){ /* silencioso */ } }

    urlDetector = urlDeBlob(CODIGO_DETECTOR);
    await contexto.audioWorklet.addModule(urlDetector);

    const origem = contexto.createMediaStreamSource(fluxo);
    no = new AudioWorkletNode(contexto, "detector-de-voz", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      processorOptions: { taxa: contexto.sampleRate }
    });

    no.port.onmessage = function(evento){
      const dados = evento.data || {};
      if (dados.tipo !== "segmento") return;
      if (pendentes >= FILA_MAXIMA) return;      // não deixa a fila crescer
      let amostras = dados.amostras;
      if (dados.taxa !== TAXA_ALVO) amostras = reamostrar(amostras, dados.taxa, TAXA_ALVO);
      pendentes++;
      try {
        worker.postMessage({ tipo: "transcrever", id: proximoId++, amostras: amostras },
                           [amostras.buffer]);
      } catch (erro){ pendentes = Math.max(0, pendentes - 1); }
    };

    origem.connect(no);
    capturando = true;
    relatar("escutando", { taxa: contexto.sampleRate, dispositivo: dispositivo });
    return true;
  }

  function parar(){
    capturando = false;
    try { if (no){ no.port.postMessage({ tipo: "parar" }); no.disconnect(); } } catch (e){ /* silencioso */ }
    no = null;
    try { if (fluxo) fluxo.getTracks().forEach(function(t){ t.stop(); }); } catch (e){ /* silencioso */ }
    fluxo = null;
    try { if (contexto) contexto.close(); } catch (e){ /* silencioso */ }
    contexto = null;
    if (urlDetector){ try { URL.revokeObjectURL(urlDetector); } catch (e){} urlDetector = null; }
    relatar("parado");
  }

  function encerrar(){
    parar();
    try { if (worker){ worker.postMessage({ tipo: "encerrar" }); worker.terminate(); } } catch (e){ /* silencioso */ }
    worker = null;
    preparado = false;
    if (urlWorker){ try { URL.revokeObjectURL(urlWorker); } catch (e){} urlWorker = null; }
  }

  return {
    preparar: preparar,
    iniciar: iniciar,
    parar: parar,
    encerrar: encerrar,
    estaPreparado: function(){ return preparado; },
    estaCapturando: function(){ return capturando; },
    dispositivo: function(){ return dispositivo; },
    latenciaMediana: function(){ return Math.round(mediana(latencias)); },
    diagnostico: function(){
      return {
        versao: VERSAO,
        modelo: modelo,
        dispositivo: dispositivo,
        preparado: preparado,
        capturando: capturando,
        pendentes: pendentes,
        latenciaMedianaMs: Math.round(mediana(latencias)),
        amostrasDeLatencia: latencias.length
      };
    }
  };
}
