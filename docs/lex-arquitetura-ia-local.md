# Lex — Arquitetura de referência e requisitos para seleção de IA local

**Versão:** 1.0
**Data:** 28 de julho de 2026
**Finalidade:** servir de base técnica para a pesquisa e a escolha do modelo de
inteligência artificial que rodará localmente, em infraestrutura própria, sob
controle exclusivo do escritório.

---

## Aviso de escopo — leia antes de tudo

Este documento foi escrito **sem acesso ao código da Lex nem à VPS onde ela
roda**. Ele mistura, deliberadamente e de forma sinalizada, três tipos de
conteúdo:

| Marca | Significado |
|---|---|
| ✅ **Confirmado** | Informação fornecida por você ou verificada em fonte pública citada. |
| 🔷 **Proposto** | Decisão de arquitetura que eu recomendo, mas que ainda não existe. |
| ❓ **A levantar** | Ponto que só se resolve olhando a VPS ou o código. A seção 13 traz os comandos exatos. |

O que está ✅ confirmado sobre a Lex, hoje, é apenas isto:

- Roda em uma **VPS**. ❓ Especificações, sistema operacional e stack a levantar.
- Faz quatro coisas: **análise de documentos jurídicos**, **redação de peças**,
  **busca em base própria (RAG)** e **atendimento/triagem de clientes**.
- A IA deve rodar em **servidor local / on-premise**, não em nuvem de terceiros.
- O hardware **ainda será definido** — a recomendação faz parte do que se pede aqui.

Todo o resto é proposta fundamentada. Trate as seções 4 a 12 como um projeto a
ser confrontado com a realidade da Lex, não como descrição dela.

---

## 1. Sumário executivo — a resposta curta

Se você só ler uma página, leia esta.

**1. O erro mais caro nesta decisão é escolher um único modelo.** Os quatro
trabalhos da Lex têm perfis tecnicamente opostos. A triagem de clientes precisa
de respostas em 1–2 segundos para muitas conversas ao mesmo tempo, e o texto não
precisa ser bonito. A redação de uma inicial pode demorar dois minutos, atende
uma pessoa por vez, e cada frase importa. Servir os dois com o mesmo modelo
significa ou pagar hardware de peça para responder "bom dia", ou entregar peça
com qualidade de chatbot. 🔷 **Recomendação: dois modelos, um roteador na
frente.** Detalhe na seção 5.

**2. No jurídico, o RAG decide mais do que o modelo.** Um modelo de 30 bilhões
de parâmetros com recuperação bem feita e citação obrigatória da fonte produz
trabalho mais confiável que um de 120 bilhões respondendo de memória. A memória
do modelo alucina jurisprudência com uma fluência assustadora — inventa número
de acórdão, relator e ementa em português impecável. A fonte recuperada, não.
Orçamento e atenção devem ir para a camada de recuperação (seção 11) antes de
irem para VRAM.

**3. O gargalo real não é o modelo, é o tamanho dos autos.** Um processo de 500
páginas tem por volta de **250 a 400 mil tokens**. Nenhum modelo local roda isso
de uma vez com qualidade útil, e os que aceitam a janela degradam no meio dela.
A arquitetura precisa de sumarização hierárquica e recuperação seletiva desde o
primeiro dia — isso é requisito de projeto, não otimização posterior. Seção 6.

**4. A VPS atual quase certamente não serve.** ❓ A confirmar, mas VPS comum é
CPU-only. Sem GPU, um modelo de 7–8 B quantizado roda a algo como 5–15 tokens por
segundo para **um** usuário. Uma petição de 3.000 palavras levaria de 5 a 15
minutos. Serve para triagem e classificação; não serve para redação nem para
atendimento simultâneo.

**5. Ponto de partida recomendado para o hardware.** 🔷 Uma máquina com **RTX PRO
6000 Blackwell (96 GB de VRAM, memória ECC)** é a escolha de menor arrependimento
para um servidor 24/7 de escritório: roda a classe de 70 B em 4 bits com folga,
ou a classe de 30 B com contexto longo e boa concorrência, e tem ECC — que as
GeForce 4090/5090 não têm e que importa numa máquina que fica ligada o tempo
todo. Se o orçamento não alcançar, **1× RTX 5090 (32 GB)** é o degrau de melhor
relação custo/benefício, com a ressalva de que sem ECC ela é adequada a uso
intenso, não a missão crítica ininterrupta. Matriz completa na seção 9.

**6. Runtime: vLLM.** Para vários usuários simultâneos, vLLM entrega da ordem de
**6× a 20× o throughput do Ollama** sob concorrência, por causa de PagedAttention
e batching contínuo. Ollama é excelente para testar na sua mesa; não é o que
serve um escritório em produção. Seção 7.

**7. Não escolha por benchmark publicado.** Nenhum ranking global mede o que
você precisa: português jurídico brasileiro, com as suas teses, os seus modelos
de peça, o seu foro. A seção 12 traz um protocolo de avaliação com casos reais do
escritório. É trabalhoso e é o que efetivamente decide.

---

## 2. Objetivo do documento

Permitir que a pesquisa de seleção de modelo seja feita contra **requisitos
escritos**, e não contra impressões. Ao final da leitura, quem pesquisar deve
conseguir responder, para cada modelo candidato:

1. Ele cabe no hardware que vamos comprar, com a janela de contexto que
   precisamos e a concorrência que precisamos?
2. Ele escreve português jurídico brasileiro em nível aceitável para revisão
   humana, ou em nível de reescrita completa?
3. Ele obedece a instrução de citar apenas o que foi recuperado, ou inventa
   quando não sabe?
4. A licença permite uso comercial em escritório de advocacia?
5. Quanto custa, somando hardware, energia, e horas de quem vai manter?

---

## 3. O que a Lex faz — os quatro workloads

✅ Confirmado por você. O detalhamento de cada perfil é 🔷 proposto e precisa ser
corrigido onde não corresponder à realidade.

### 3.1 Análise de documentos jurídicos

Ler petições, contratos, decisões e processos inteiros; extrair partes, prazos,
valores e pedidos; resumir; apontar riscos e teses.

| Característica | Valor estimado 🔷 |
|---|---|
| Entrada típica | 10 a 500 páginas (≈ 5 mil a 400 mil tokens) |
| Saída típica | 500 a 3.000 tokens |
| Latência tolerável | 30 s a 5 min (o advogado sai da tela e volta) |
| Concorrência | Baixa — 1 a 3 análises simultâneas |
| Custo de alucinação | **Alto.** Um prazo lido errado perde o processo. |
| Exige contexto longo | **Sim, criticamente** |

### 3.2 Redação de peças

Gerar iniciais, contestações, recursos, contratos e pareceres a partir dos dados
do caso e do acervo do escritório.

| Característica | Valor estimado 🔷 |
|---|---|
| Entrada típica | 5 mil a 50 mil tokens (fatos + trechos recuperados + modelo de peça) |
| Saída típica | 2.000 a 8.000 tokens (peça longa) |
| Latência tolerável | 1 a 5 min |
| Concorrência | Baixa — 1 a 3 |
| Custo de alucinação | **Máximo.** Jurisprudência inventada em peça protocolada é dano reputacional e risco disciplinar. |
| Exige contexto longo | Sim |

Este é o workload que define o **piso de qualidade** do modelo. É aqui que
modelos pequenos falham de forma visível: o texto sai gramaticalmente correto e
juridicamente raso, com estrutura de peça mas sem argumento.

### 3.3 Busca em base própria (RAG)

Pesquisar no acervo de jurisprudência, doutrina e processos do escritório,
respondendo **com citação da fonte**.

| Característica | Valor estimado 🔷 |
|---|---|
| Entrada típica | Pergunta curta + 3 a 15 trechos recuperados (2 mil a 20 mil tokens) |
| Saída típica | 300 a 1.500 tokens |
| Latência tolerável | 3 a 15 s |
| Concorrência | Média — 3 a 10 |
| Custo de alucinação | **Alto**, mas mitigável: a resposta deve ser recusada quando a fonte não sustenta. |
| Exige contexto longo | Moderado |

Aqui a qualidade depende mais do **recuperador** que do gerador. Um modelo médio
com bons trechos acerta; o melhor modelo do mundo com trechos errados erra com
confiança.

### 3.4 Atendimento / triagem de clientes

Conversar com cliente ou equipe, coletar dados do caso, classificar a matéria e
encaminhar.

| Característica | Valor estimado 🔷 |
|---|---|
| Entrada típica | 200 a 2.000 tokens (histórico da conversa) |
| Saída típica | 50 a 300 tokens |
| Latência tolerável | **1 a 3 s** — é conversa; acima disso a pessoa desiste |
| Concorrência | **Alta** — 10 a 50 simultâneos em pico |
| Custo de alucinação | Médio. **Mas há risco jurídico próprio:** se soar como orientação jurídica, cria expectativa e possível responsabilidade. |
| Exige contexto longo | Não |

**Observação não-técnica que vale mais que qualquer escolha de modelo:** este
workload precisa de um aviso explícito de que não constitui consulta jurídica, e
de regras duras impedindo o modelo de emitir opinião sobre mérito. Isso é
configuração de sistema e de produto, não de modelo.

### 3.5 O quadro que decide a arquitetura

| | Latência | Concorrência | Contexto | Qualidade exigida |
|---|---|---|---|---|
| Análise | tolerante | baixa | **enorme** | alta |
| Redação | tolerante | baixa | grande | **máxima** |
| RAG | média | média | média | alta |
| Triagem | **crítica** | **alta** | pequeno | média |

As colunas se contradizem entre a primeira e a última linha. Daí a recomendação
de dois modelos.

---

## 4. Arquitetura de referência proposta

🔷 Tudo nesta seção é proposta.

```
┌──────────────────────────────────────────────────────────────────┐
│  CLIENTES                                                        │
│  Navegador do advogado · Canal de atendimento · Integrações      │
└───────────────────────────┬──────────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼──────────────────────────────────────┐
│  APLICAÇÃO LEX  (VPS atual)                          ❓ stack     │
│  Autenticação · Autorização por caso · Regras de negócio         │
│  Registro de auditoria · Fila de trabalhos longos                │
└───────────────────────────┬──────────────────────────────────────┘
                            │ HTTP interno (API compatível com OpenAI)
                            │ ⚠ rede privada / VPN — nunca internet aberta
┌───────────────────────────▼──────────────────────────────────────┐
│  CAMADA DE ORQUESTRAÇÃO DE IA                                    │
│                                                                  │
│  ┌────────────┐   ┌──────────────┐   ┌───────────────────────┐   │
│  │ ROTEADOR   │──▶│  MONTAGEM    │──▶│  GUARDA-CORPOS        │   │
│  │ escolhe o  │   │  DO PROMPT   │   │  · citação obrigatória│   │
│  │ modelo por │   │  + RAG       │   │  · recusa sem fonte   │   │
│  │ tarefa     │   │              │   │  · dados pessoais     │   │
│  └────────────┘   └──────┬───────┘   └───────────┬───────────┘   │
└──────────────────────────┼───────────────────────┼───────────────┘
                           │                       │
        ┌──────────────────┴───────┐               │
        │                          │               │
┌───────▼─────────┐      ┌─────────▼────────┐      │
│ MODELO GRANDE   │      │ MODELO PEQUENO   │      │
│ 30–70 B         │      │ 4–8 B            │      │
│ análise·redação │      │ triagem·extração │      │
│ vLLM            │      │ vLLM             │      │
└─────────────────┘      └──────────────────┘      │
                                                   │
┌──────────────────────────────────────────────────▼───────────────┐
│  CAMADA DE CONHECIMENTO                                          │
│  Ingestão (OCR → limpeza → fatiamento)                           │
│  Embeddings  ·  Banco vetorial  ·  Índice léxico (BM25)          │
│  Reordenador (cross-encoder)                                     │
└──────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│  ARMAZENAMENTO — disco cifrado, backup cifrado, on-premise       │
│  Documentos · Índices · Trilha de auditoria                      │
└──────────────────────────────────────────────────────────────────┘
```

### Decisões de arquitetura que sustentam o desenho

**D1. A IA fala com a Lex por API HTTP compatível com OpenAI.** É o formato que
vLLM, Ollama, llama.cpp e praticamente todo runtime expõem. Consequência
prática: **a Lex fica independente do modelo escolhido.** Trocar de modelo vira
mudar uma variável de ambiente, não reescrever a aplicação. Como sua stack está
❓ em aberto, esta decisão é também o que torna este documento útil qualquer que
seja ela — Python, Node, PHP, tanto faz.

**D2. A aplicação e a inferência ficam em máquinas diferentes.** A VPS continua
servindo a Lex; a GPU fica na máquina nova. Elas conversam por rede privada. Isso
evita ter que migrar a aplicação inteira e permite dimensionar as duas coisas de
forma independente.

**D3. Trabalhos longos vão para fila, não para requisição HTTP.** Analisar 400
páginas leva minutos. Se isso for uma chamada HTTP síncrona, o navegador expira,
o proxy corta, e o usuário reenvia — dobrando a carga. Fila com estado
consultável.

**D4. Toda saída que cita norma ou julgado carrega o identificador da fonte
recuperada.** Não é enfeite de interface: é o único mecanismo que transforma
alucinação de erro invisível em erro detectável. Sem isso, nenhum modelo é
seguro o bastante para o uso pretendido.

**D5. Nada de tráfego para fora.** Nenhum componente da camada de IA pode falar
com a internet em tempo de execução. Downloads de modelo acontecem em janela de
manutenção, conscientemente. Isso é o que faz "IA local" significar alguma coisa.

---

## 5. Por que dois modelos, e como o roteador decide

🔷 Proposta.

Voltando ao quadro da seção 3.5: triagem quer resposta em 1–3 s para até 50
pessoas ao mesmo tempo; redação quer a melhor prosa possível para uma pessoa e
tolera minutos. Um modelo de 70 B servindo triagem gasta VRAM e tempo à toa e
ainda assim pode ficar lento sob 50 conexões. Um modelo de 7 B redigindo
contestação entrega texto que dá mais trabalho corrigir do que escrever.

| Rota | Modelo | Workloads |
|---|---|---|
| **Pesada** | 30–70 B, quantizado, contexto longo | Análise, redação, RAG complexo |
| **Leve** | 4–8 B | Triagem, classificação, extração de campos, reescrita curta, roteamento |

O roteador decide por **tipo de tarefa declarado pela aplicação**, não por
adivinhação sobre o texto. A Lex sabe se o usuário clicou em "gerar contestação"
ou está numa conversa de atendimento — essa informação deve descer junto com a
requisição. Roteamento por classificação automática do conteúdo é uma fonte
desnecessária de erro quando a informação já existe na origem.

**Onde Jurema-7B entra.** O
[Jurema-7B](https://huggingface.co/Jurema-br/Jurema-7B), da NeuralMind com o
Escavador, é fine-tune do Qwen2.5-7B-Instruct especializado em direito
brasileiro, aberto no Hugging Face. Pelo tamanho, ele é candidato **natural à
rota leve** — triagem, classificação de matéria, extração — onde conhecimento do
vocabulário e da estrutura jurídica brasileira vale mais que capacidade bruta de
raciocínio. Como modelo único de um escritório, 7 B é pouco para redação de peça.
Vale medir nas duas funções no protocolo da seção 12; a documentação do próprio
modelo alerta que ele pode alucinar informação jurídica e interpretar normas
incorretamente, e não substitui revisão profissional.

**Custo desta decisão:** dois modelos carregados consomem VRAM somados. Um 7 B em
4 bits ocupa por volta de 5–6 GB. Numa placa de 96 GB isso é irrelevante; numa de
32 GB, aperta. É um dos argumentos a favor de subir de faixa de hardware.

---

## 6. A restrição que mais dói: o tamanho dos autos

Esta seção existe porque é o ponto onde projetos de IA jurídica costumam
descobrir tarde demais que a conta não fecha.

**Conversão aproximada para português jurídico:** 1 página ≈ 350–500 palavras ≈
**500 a 800 tokens**.

| Documento | Páginas | Tokens estimados |
|---|---|---|
| Petição inicial | 20 | 10 a 16 mil |
| Contrato robusto | 40 | 20 a 32 mil |
| Processo mediano | 200 | 100 a 160 mil |
| Processo volumoso | 500 | 250 a 400 mil |

Modelos locais de 30–70 B tipicamente anunciam janelas de 32 mil a 256 mil
tokens. Três problemas, todos práticos:

1. **Janela anunciada ≠ janela útil.** A qualidade de recuperação de informação
   no meio de contextos muito longos degrada bem antes do limite nominal.
2. **KV cache come VRAM.** O custo de memória cresce com o contexto. Contexto de
   128 mil tokens num modelo de 30 B pode exigir dezenas de GB **só de cache**,
   além do peso do modelo — e multiplicado por requisição simultânea.
3. **Latência cresce com o contexto.** Processar 300 mil tokens de entrada leva
   minutos antes de o primeiro token de saída aparecer.

🔷 **Consequência de projeto — obrigatória, não opcional:**

- **Sumarização hierárquica.** Documento grande é fatiado, cada bloco é resumido
  com preservação de dados duros (datas, valores, nomes, números de peça), e os
  resumos são consolidados. O modelo nunca vê os autos inteiros de uma vez.
- **Recuperação seletiva.** Para perguntas específicas ("qual o valor da causa?",
  "quais os pedidos?"), recuperar as passagens relevantes bate ler tudo — em
  custo e em acerto.
- **Extração determinística onde couber.** Número de processo, CPF, CNPJ, valores
  e datas devem ser extraídos por expressão regular e validação, não por modelo.
  O modelo é para o que exige interpretação. Isto elimina uma classe inteira de
  alucinação, de graça.

**Implicação direta na escolha do modelo:** contexto útil de 32 mil tokens com
boa sumarização hierárquica é mais valioso que 256 mil tokens nominais mal
aproveitados. Ao pesquisar, priorize evidência de qualidade em contexto longo
sobre o número anunciado.

---

## 7. Camada de inferência: qual runtime

| Runtime | Papel recomendado | Observações |
|---|---|---|
| **vLLM** | 🔷 **Produção** | PagedAttention e batching contínuo; sob 50 usuários simultâneos, medições públicas apontam ~920 tok/s contra ~41 tok/s do Ollama no mesmo cenário — uma diferença de ordem de grandeza, não de ajuste fino. Exposição de API compatível com OpenAI. Exige GPU NVIDIA ou AMD. |
| **Ollama** | Desenvolvimento e testes na mesa | Instalação trivial, troca de modelo trivial. Em usuário único chega perto do vLLM (~62 vs ~67 tok/s em Llama 3.1 8B). Sob concorrência, colapsa: aloca KV cache de forma contígua por requisição e a fragmentação mata a capacidade. |
| **llama.cpp** | CPU-only, ou controle de baixo nível | É a escolha certa **se** a decisão for ficar sem GPU. Também é a base sobre a qual o Ollama roda. |
| **LM Studio** | Avaliação manual pelos advogados | Interface gráfica; útil para a fase de avaliação cega da seção 12, em que quem julga não é técnico. |
| **TGI / SGLang / TensorRT-LLM** | Alternativas a considerar | Vale incluir na pesquisa; vLLM é o padrão de mercado mais seguro para um primeiro deploy. |

🔷 **Recomendação:** Ollama para prototipar, **vLLM para produção**, llama.cpp
apenas se o cenário CPU-only for confirmado como definitivo.

---

## 8. Quantização — o que é e por que decide o orçamento

Quantizar é guardar os pesos do modelo com menos bits. Reduz VRAM e aumenta
velocidade, ao custo de alguma qualidade.

| Precisão | Memória por bilhão de parâmetros | Perda de qualidade |
|---|---|---|
| FP16 / BF16 | ~2,0 GB | nenhuma (referência) |
| INT8 / Q8 | ~1,0 GB | mínima |
| **INT4 / Q4 (AWQ, GPTQ, GGUF Q4_K_M)** | **~0,5 GB** | **pequena — o padrão prático** |
| Q3 e abaixo | ~0,4 GB | perceptível; evitar em texto jurídico |

**Regra de bolso para dimensionar VRAM:**

```
VRAM ≈ (parâmetros em bilhões × GB por bilhão) × 1,2  +  KV cache
```

O fator 1,2 cobre ativações e overhead do runtime. O KV cache depende de
contexto e de quantas requisições rodam ao mesmo tempo — e é o termo que as
pessoas esquecem e que estoura a placa em produção.

Exemplos:

- 8 B em Q4 → ~4,8 GB + cache
- 30 B em Q4 → ~18 GB + cache
- 70 B em Q4 → ~42 GB + cache
- 70 B em FP16 → ~168 GB — fora de alcance de uma placa só

**A conclusão que importa:** INT4 é o que torna a classe de 70 B viável em uma
única GPU. Toda a matriz da seção 9 pressupõe Q4/INT4. E **sempre deixe folga
para o KV cache** — dimensionar a placa pelo peso do modelo é o erro clássico.

---

## 9. Matriz de hardware

🔷 Proposta. Preços são ordens de grandeza para orientar orçamento e **precisam
de cotação local**; hardware de GPU no Brasil tem variação grande de câmbio e
tributação.

| Faixa | Hardware | VRAM | Modelos viáveis (Q4) | Usuários simultâneos | Adequação à Lex |
|---|---|---|---|---|---|
| **0 — atual** | VPS CPU-only ❓ | — | 7–8 B, lento | 1 | **Insuficiente.** Serve para triagem simples. Redação inviável. |
| **1 — entrada** | 1× RTX 4090 (24 GB) | 24 GB | até 30–32 B | 3–8 | Viável com aperto. Sem ECC. |
| **2 — recomendada** | 1× RTX 5090 (32 GB) | 32 GB | 30–32 B confortável, 70 B não cabe | 5–12 | **Melhor custo/benefício.** Sem ECC — ressalva para 24/7. |
| **3 — de menor arrependimento** | 1× RTX PRO 6000 Blackwell (96 GB) | 96 GB | **70 B com folga**, ou 30 B com contexto longo e alta concorrência | 15–40 | 🔷 **Recomendada se o orçamento permitir.** ECC, drivers profissionais, feita para servidor ligado o tempo todo. Aproximadamente 3,7× o throughput da 4090. |
| **4 — excesso** | 2× 96 GB, ou H100/H200 | 160 GB+ | classe 120 B+ | 50+ | Difícil justificar para um escritório. |

**Notas que mudam a decisão:**

- **ECC não é detalhe.** RTX 4090 e 5090 não têm memória com correção de erro.
  Numa máquina de jogos, tanto faz. Num servidor que fica meses ligado
  processando documento de cliente, um bit invertido silenciosamente vira um
  valor errado numa análise — sem nenhum sinal de que algo deu errado. A PRO 6000
  tem ECC.
- **A faixa 2 é o joelho da curva de preço.** Da 0 para a 2, o ganho é enorme. Da
  2 para a 3, o ganho é real mas o preço sobe muito. A pergunta que decide é: **a
  classe de 70 B é necessária para a qualidade de redação que você exige?** Só o
  protocolo da seção 12 responde isso, e ele pode ser rodado com GPU alugada por
  hora antes de qualquer compra.
- **Custos além da placa:** fonte robusta, refrigeração, no-break, e energia
  contínua. Uma GPU dessas em carga puxa centenas de watts o dia inteiro.
- **Considere alugar antes de comprar.** Rodar a avaliação numa GPU alugada por
  algumas horas custa uma fração da compra e responde a pergunta acima com dados
  em vez de opinião.

---

## 10. Modelos candidatos

⚠ **O cenário de modelos abertos muda em semanas.** Os nomes abaixo são pontos de
partida verificados em julho de 2026; **reconfira versões e licenças na data em
que a pesquisa for feita.** O valor desta seção está nos *critérios*, que não
mudam.

### 10.1 Critérios de eliminação — aplicar antes de testar qualquer coisa

1. **Licença permite uso comercial?** Alguns pesos abertos têm restrição de uso
   ou de porte da empresa. Ler a licença, não o post de blog.
2. **Pesos realmente baixáveis?** "Aberto" às vezes significa API barata. Se não
   dá para baixar e rodar sem rede, não serve ao requisito de IA local.
3. **Português é primeira classe?** Modelo forte em inglês pode ser medíocre em
   português jurídico. Testar, não presumir.
4. **Cabe na VRAM da faixa escolhida, com KV cache?** Seção 8.
5. **Tem suporte no vLLM?** Arquitetura muito nova às vezes demora a ser
   suportada pelos runtimes.

### 10.2 Candidatos a investigar

**Rota pesada (30–70 B) — análise, redação, RAG**

| Família | Por que investigar | Ressalvas |
|---|---|---|
| **Qwen3** (14 B, 30B-A3B MoE, 32 B, e acima) | Tornou-se a resposta padrão para "o que rodar localmente"; forte multilíngue, cobertura boa de português. A variante MoE de 30 B ativa poucos parâmetros por token — muito eficiente para servir. | Confirmar licença da versão específica. |
| **Llama** (linha 3.x / 4) | Ecossistema imenso, muito fine-tune em português disponível, suporte universal em runtimes. | Licença tem cláusulas próprias; ler. |
| **GLM-4.x-Flash** (~30 B MoE) | Boa eficiência de serving, desempenho agêntico forte. | Menos histórico em português jurídico. |
| **Mistral / Magistral** | Origem europeia, tradicionalmente bom em línguas latinas. | Verificar tamanhos e licenças atuais. |
| **Gemma 3** | Boa qualidade por parâmetro nas faixas menores. | Faixa alta mais limitada. |
| **DeepSeek** | Forte em raciocínio estruturado. | Modelos maiores fogem da faixa de uma GPU. |

**Rota leve (4–8 B) — triagem, classificação, extração**

| Família | Por que investigar |
|---|---|
| **Jurema-7B** | Único candidato **treinado especificamente para o direito brasileiro** com dados nacionais; fine-tune de Qwen2.5-7B-Instruct, aberto no Hugging Face. Deve ser o **baseline obrigatório** da rota leve. |
| **Qwen3 8B** | Referência geral multilíngue nesta faixa. |
| **Llama 3.1 8B Instruct** | Amplamente recomendado para português; muitíssimo suportado. |
| **Gemma 3 (4 B)** | Se a prioridade for latência mínima na triagem. |

### 10.3 A pergunta do fine-tune

Vale ajustar um modelo com as peças do próprio escritório? 🔷 **Não na primeira
fase.** Fine-tune ensina *estilo e formato* muito bem, e *fatos* muito mal — e o
que dói no jurídico é fato errado, que é problema de RAG. Ordem correta:

1. Modelo bom + RAG bom + instruções bem escritas.
2. Medir o que ainda falha.
3. **Só então** avaliar fine-tune, e provavelmente só para forjar o estilo das
   peças do escritório.

Fazer fine-tune antes de ter RAG é gastar meses para ensinar o modelo a errar
com a sua cara.

---

## 11. A camada de RAG — onde a qualidade jurídica é ganha ou perdida

🔷 Proposta. Esta seção merece mais atenção de projeto que a escolha do LLM.

### 11.1 Ingestão

1. **OCR** para PDFs digitalizados — a maioria dos processos antigos. ❓ Verificar
   o que a Lex já faz. OCR ruim contamina tudo o que vem depois, e nenhum modelo
   recupera informação que o OCR perdeu.
2. **Limpeza** de cabeçalhos, rodapés, numeração e carimbos, que poluem os
   trechos recuperados.
3. **Fatiamento consciente da estrutura.** Fatiar a cada N caracteres é o padrão
   e é ruim para texto jurídico. Corte por **artigo, parágrafo, inciso, cláusula,
   ementa, dispositivo** — as unidades que o direito já usa. Ganho grande, custo
   baixo.
4. **Metadados em cada trecho:** tribunal, órgão julgador, data, tipo de peça,
   número do processo, cliente, matéria. Servem para filtrar antes de buscar —
   pesquisar só no TJ-GO, só em matéria tributária, só depois de tal data.
   **Filtro por metadado é o que separa RAG que serve advogado de RAG de
   demonstração.**

### 11.2 Recuperação

🔷 **Busca híbrida, sempre.**

- **Vetorial (semântica):** encontra o conceito quando o termo é outro.
- **Léxica (BM25):** encontra o termo exato. **Indispensável no jurídico** — quem
  procura "art. 373, II, do CPC" quer aquilo, e não algo parecido. Busca
  puramente vetorial erra feio em citações e números.
- **Fusão** dos dois resultados, seguida de **reordenação**.

**Embeddings:** [BGE-M3](https://github.com/flagopen/flagembedding) é o padrão
prático para self-hosting multilíngue — mais de 100 idiomas, entrada de até 8.192
tokens, e suporte a recuperação densa, léxica e multivetorial no mesmo modelo.
Alternativa a comparar: Jina Embeddings v3. **Meça no seu acervo**; não existe
resultado publicado que valha mais que teste no seu corpus.

**Reordenador:** um cross-encoder como `bge-reranker-v2-m3` pontua o par
(pergunta, trecho) conjuntamente, em vez de comparar vetores independentes.
Custa mais por candidato, então roda só sobre os 20–50 melhores. **É o melhor
retorno por real gasto de toda a camada de RAG.**

### 11.3 Geração com fonte

Regras que a camada de guarda-corpos deve impor:

- Responder **apenas** com base nos trechos recuperados.
- **Citar o identificador** de cada trecho usado.
- **Recusar explicitamente** quando os trechos não sustentam a resposta. "Não
  encontrei base no acervo para responder" é resposta certa e precisa ser
  recompensada, não tratada como falha.
- **Nunca** produzir número de processo, acórdão ou dispositivo que não esteja
  literalmente na fonte recuperada. Isto é verificável por conferência
  automática do texto gerado contra os trechos — e deve ser verificado, não
  confiado.

### 11.4 O acervo é a peça mais valiosa

O modelo é substituível: sai um, entra outro em uma tarde. O acervo indexado,
limpo e com metadados corretos é trabalho de meses e é o que diferencia a Lex.
🔷 **Orçamento e atenção deveriam refletir isso.**

---

## 12. Protocolo de avaliação — como decidir de verdade

🔷 Proposta. **Esta é a seção operacional do documento.** Nenhum ranking público
mede português jurídico brasileiro no recorte do seu escritório.

### 12.1 Montar o conjunto de referência

Reunir **50 a 100 casos reais**, anonimizados, distribuídos entre os quatro
workloads e as matérias que o escritório de fato pratica. Para cada caso:
entrada, e o que uma **boa resposta** teria. Onde houver peça real aprovada, ela
é o padrão-ouro.

Isto dá trabalho. É o único investimento desta lista que continua valendo quando
todos os modelos de hoje estiverem obsoletos.

### 12.2 Rubrica de julgamento

Cada resposta recebe nota de 1 a 5 em:

| Critério | Pergunta | Peso |
|---|---|---|
| **Correção jurídica** | O que afirma sobre a lei está certo? | **3×** |
| **Fidelidade à fonte** | Toda citação existe e diz o que ele diz que diz? | **3×** |
| **Completude** | Cobriu o que precisava? | 2× |
| **Linguagem forense** | Soa a peça, ou a redação escolar? | 2× |
| **Estrutura** | Segue a forma processual esperada? | 1× |
| **Recusa apropriada** | Diz que não sabe quando não sabe? | **3×** |

Peso 3 em fidelidade à fonte e em recusa apropriada é deliberado: **um modelo
que erra menos mas mente com confiança é pior que um modelo mediano e honesto**,
porque o erro do primeiro passa pela revisão.

### 12.3 Teste específico de alucinação

Separe de 10 a 20 perguntas cuja resposta **não está** no acervo. O comportamento
correto é recusar. Meça a taxa de invenção. 🔷 **Sugestão de corte: acima de 10%
de invenção, o modelo é reprovado**, por melhor que sejam as outras notas.

### 12.4 Avaliação cega

Quem julga são advogados do escritório, **sem saber qual modelo produziu qual
resposta**. Isto elimina a preferência inconsciente pelo modelo mais caro ou mais
falado — que é real e é forte. LM Studio serve bem para gerar as saídas nesta
fase.

### 12.5 Medidas técnicas, em paralelo

Para cada candidato, com carga sintética:

- Tokens por segundo, com 1 usuário e com N usuários (N = pico esperado).
- Tempo até o primeiro token — é o que a triagem sente.
- Pico de VRAM no contexto máximo pretendido.
- Estabilidade em 24 h de carga contínua.

### 12.6 A decisão

O modelo escolhido é o **mais barato de rodar entre os que passam no corte de
qualidade** — não o de maior nota. Se um 30 B passa, não compre a placa do 70 B.

---

## 13. O que levantar na VPS ❓

Sem estes dados, as seções 4, 9 e 12 continuam sendo hipótese. Rodar na VPS:

```bash
# Sistema e recursos
cat /etc/os-release
nproc && lscpu | grep -E 'Model name|Thread|Core|Socket|MHz'
free -h
df -h
uptime

# GPU (se não retornar nada, é CPU-only — confirma a faixa 0 da seção 9)
nvidia-smi || echo "sem GPU NVIDIA"
lspci | grep -i -E 'vga|3d|display'

# Stack da aplicação
docker --version && docker compose version && docker ps
python3 --version; node --version; php --version
systemctl list-units --type=service --state=running | head -40

# Rede e exposição
ss -tulpn | grep LISTEN
```

E, no código da Lex, responder:

| Pergunta | Por que importa |
|---|---|
| Já existe alguma chamada a IA hoje? Para onde? | Define se é migração ou construção do zero — e se há dado saindo para fora hoje. |
| Qual banco de dados? | Se for PostgreSQL, `pgvector` evita introduzir um banco vetorial novo. |
| Onde ficam os documentos, e cifrados? | Requisito de sigilo (seção 14). |
| Existe fila de trabalhos assíncronos? | Decisão D3. |
| Quantos usuários simultâneos no pico, hoje? | Dimensiona a concorrência real em vez de estimada. |
| Qual o volume do acervo a indexar? | Dimensiona o banco vetorial e o tempo de ingestão. |
| Há trilha de auditoria? | Requisito de governança. |

**Compartilhar este levantamento junto com o documento faz a pesquisa de modelo
render muito mais** — quem for pesquisar deixa de chutar as restrições.

---

## 14. Restrições que não se negociam

Não são preferências técnicas; são condições de licitude e de responsabilidade
profissional.

**Sigilo profissional.** Dado de cliente é coberto por sigilo. Enviá-lo a API de
terceiro sem base adequada é problema ético e contratual, além de jurídico. **É
esta a razão de ser da IA local** — e é o que torna o requisito, aqui, uma
decisão acertada e não um capricho de engenharia.

**LGPD.** Processos contêm dado pessoal e frequentemente dado sensível (saúde,
biometria, opinião política, dado de criança e adolescente). Consequências de
projeto: base legal definida por finalidade, minimização, retenção com prazo,
trilha de auditoria de quem acessou o quê, e capacidade de eliminar dado a
pedido — inclusive dos índices vetoriais, o que é fácil de esquecer e difícil de
consertar depois.

**Segredo de justiça.** Processos sob segredo precisam de controle de acesso
próprio. Se o RAG indexar tudo num índice só, um usuário pode recuperar trecho
de processo a que não tem acesso, **através da resposta do modelo**. 🔷 A
filtragem por permissão precisa acontecer **na recuperação, antes da geração** —
nunca depois.

**Revisão humana obrigatória.** Nenhuma saída vai a protocolo sem revisão de
advogado. Isto deve estar na interface, no registro de auditoria e na política
interna. A própria documentação do Jurema-7B faz essa ressalva; ela vale para
qualquer modelo.

**Não constitui consulta jurídica.** No atendimento ao cliente (seção 3.4),
aviso explícito e regras impedindo opinião sobre mérito.

**Operacional:** disco cifrado em repouso; backup cifrado e testado; camada de
IA sem rota para a internet; acesso administrativo com segundo fator; registro
de toda requisição feita ao modelo — para auditoria e para reconstruir o que
aconteceu quando algo der errado.

---

## 15. Riscos principais

| Risco | Impacto | Mitigação |
|---|---|---|
| Jurisprudência inventada chega a peça protocolada | **Grave** — reputacional e disciplinar | Citação obrigatória + conferência automática do texto gerado contra as fontes + revisão humana |
| Comprar GPU errada | Alto — capital imobilizado | Rodar a seção 12 em GPU alugada **antes** de comprar |
| Escolher pelo benchmark de blog | Alto — meses perdidos | Conjunto de referência próprio (12.1) |
| RAG recupera trecho de processo em segredo de justiça | **Grave** | Filtro por permissão na recuperação, antes da geração |
| CPU-only não dar conta | Médio | Confirmar seção 13 cedo; é o dado que trava tudo |
| Modelo obsoleto em 6 meses | Baixo | Decisão D1 — API compatível com OpenAI torna a troca barata |
| OCR ruim contamina o acervo | Alto e silencioso | Amostrar e conferir a qualidade do OCR antes de indexar em massa |
| Fine-tune prematuro | Médio | Ordem da seção 10.3 |

---

## 16. Roteiro sugerido

| Fase | O quê | Entrega |
|---|---|---|
| **0** | Levantamento da seção 13 | Este documento com os ❓ preenchidos |
| **1** | Montar o conjunto de referência (12.1) | 50–100 casos com resposta esperada |
| **2** | Testar 3–5 candidatos em **GPU alugada** | Notas pela rubrica 12.2 + medidas 12.5 |
| **3** | **Decidir o hardware com os dados da fase 2** | Faixa da seção 9 justificada por evidência |
| **4** | Construir a camada de RAG (seção 11) | Ingestão + híbrida + reordenador, medidos |
| **5** | Piloto com 2–3 advogados, um workload só | Taxa de aproveitamento real das saídas |
| **6** | Produção gradual, workload a workload | Auditoria e métricas ligadas desde o primeiro dia |

**A ordem importa: a fase 3 vem depois da 2.** Escolher o hardware antes de medir
é o erro mais caro e mais comum deste tipo de projeto.

---

## 17. Glossário

| Termo | Significado |
|---|---|
| **Token** | Pedaço de palavra. Em português, ~1,5 token por palavra. |
| **Contexto / janela** | Quanto o modelo consegue "ver" de uma vez, em tokens. |
| **KV cache** | Memória temporária por requisição em andamento. Cresce com o contexto e com a concorrência; consome VRAM. |
| **Quantização** | Guardar os pesos com menos bits para caber em menos memória. |
| **VRAM** | Memória da placa de vídeo. É o limite duro de qual modelo cabe. |
| **RAG** | Recuperar trechos do acervo e dar ao modelo, em vez de confiar na memória dele. |
| **Embedding** | Representação numérica de um texto, que permite busca por significado. |
| **BM25** | Busca clássica por palavra exata. Complementa a busca semântica. |
| **Reordenador / reranker** | Modelo que reavalia os trechos recuperados e os coloca em ordem de relevância real. |
| **MoE** | *Mixture of Experts* — o modelo é grande mas ativa só uma fração por token; barato de servir. |
| **ECC** | Memória com correção de erro. Presente em GPU profissional, ausente em GeForce. |
| **tok/s** | Tokens por segundo. A medida de velocidade. |
| **Throughput** | Vazão total somando todos os usuários simultâneos. |

---

## 18. Fontes consultadas

Levantadas em julho de 2026. **Reconferir na data da pesquisa** — o cenário se
move rápido.

- [Jurema-7B — Hugging Face](https://huggingface.co/Jurema-br/Jurema-7B)
- [Jurema 7B: o primeiro LLM jurídico brasileiro de código aberto treinado com dados nacionais — Blog do Escavador](https://blog.escavador.com/jurema-7b-o-primeiro-llm-juridico-brasileiro-de-codigo-aberto-treinado-com-dados-nacionais)
- [NeuralMind lança modelo de IA focado no ambiente jurídico brasileiro — Parque Científico e Tecnológico da Unicamp](https://parque.inova.unicamp.br/neuralmind-ai-residente-no-parque-da-unicamp-lanca-modelo-de-ia-focado-no-ambiente-juridico-brasileiro/)
- [Best Local LLMs in 2026: Which Model Should You Run Locally? — WhatLLM](https://whatllm.org/best-local-llm)
- [Best Open-Source LLMs to Self-Host in 2026: VRAM Tier Guide — Spheron](https://www.spheron.network/blog/best-open-source-llms-self-host-2026-vram-guide/)
- [Best Open-Source LLMs: July 2026 Leaderboard — Techsy](https://techsy.io/en/blog/best-open-source-llms-2026)
- [Ollama vs vLLM: Performance Benchmark 2026 — SitePoint](https://www.sitepoint.com/ollama-vs-vllm-performance-benchmark-2026/)
- [Ollama vs vLLM vs llama.cpp: Local Inference Server Comparison (2026) — d-central](https://d-central.tech/ollama-vs-vllm-vs-llama-cpp/)
- [llama.cpp vs Ollama vs vLLM: One User vs Many (2026) — InsiderLLM](https://insiderllm.com/guides/llamacpp-vs-ollama-vs-vllm/)
- [FlagEmbedding / BGE-M3 — GitHub](https://github.com/flagopen/flagembedding)
- [The Best Open-Source Embedding Models in 2026 — BentoML](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models)
- [Best Embedding Model for RAG 2026: 10 Models Compared — Milvus](https://milvus.io/blog/choose-embedding-model-rag-2026.md)
- [RTX 5090 vs RTX PRO 6000 Blackwell: Consumer vs Pro GPU for AI (2026) — Spheron](https://www.spheron.network/blog/rtx-5090-vs-rtx-pro-6000-blackwell-comparison/)
- [RTX 4090 vs 5090 vs PRO 6000: LLM Inference Benchmark — CloudRift](https://www.cloudrift.ai/blog/benchmarking-rtx-gpus-for-llm-inference)
- [Best GPUs for AI Inference 2026: Complete Buying Guide — SLYD](https://slyd.com/guides/inference-gpu-guide)
- [LLM local para Direito Brasileiro: modelos, RAG, LGPD e performance — X-Apps](https://x-apps.com.br/llm-local-direito-brasileiro-mac-apple-silicon/)

---

## Como este documento deve ser usado

Ele não escolhe o modelo — nenhum documento escrito sem os seus dados pode fazer
isso com honestidade. Ele define **contra o que medir**, e a seção 12 é o que
efetivamente decide.

O caminho mais curto para uma resposta confiável é: preencher a seção 13, montar
o conjunto de referência da seção 12.1, e rodar três candidatos numa GPU alugada.
Isso custa alguns dias e algumas centenas de reais, e substitui meses de
especulação — e uma possível compra errada de hardware.
