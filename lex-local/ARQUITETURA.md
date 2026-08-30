# Lex Local — arquitetura de implantação em DGX Spark 128 GB

Análise de viabilidade e desenho de referência para rodar a plataforma **Lex
Inteligência Estratégica** inteiramente dentro do escritório, com separação
rígida entre a biblioteca de conhecimento e os autos dos processos.

> Documento de decisão. As afirmações sobre desempenho vêm de medições
> públicas de terceiros (referências no fim) e devem ser reconfirmadas com
> uma prova de conceito antes da compra.

---

## 1. O veredito curto

A DGX Spark de 128 GB **serve** para o Lex Local, com uma condição que muda
tudo no projeto: **a plataforma tem de ser construída sobre modelos MoE**
(*mixture of experts*), não sobre modelos densos grandes.

Quem decide o desempenho da Spark não são os 128 GB. É a **banda de memória:
273 GB/s**. Como a geração de token é limitada por banda, a conta é direta —
velocidade ≈ banda ÷ bytes de peso lidos por token:

| Modelo | Peso em memória | Parâmetros ativos | Velocidade esperada |
|---|---|---|---|
| gpt-oss-120b (MXFP4) | ~63 GB | 5,1 B | **~38 tok/s** (llama.cpp) a **~55 tok/s** (SGLang/vLLM) |
| Llama 4 Scout (109B MoE, Q4) | ~60 GB | 17 B | ~12–15 tok/s |
| Denso 70B (Q4) | ~40 GB | 70 B | **~6 tok/s — inviável para agentes** |
| Denso 32B (Q4) | ~20 GB | 32 B | ~12 tok/s |
| Qwen3-30B-A3B (Q4) | ~18 GB | 3 B | ~60–90 tok/s |

Ou seja: os 128 GB permitem carregar um modelo de 120 B, e ele roda rápido
**porque só 5 B de parâmetros são ativados por token**. Um modelo denso de
70 B cabe com folga na memória e mesmo assim é lento demais para orquestrar
doze agentes. Essa é a armadilha número um da Spark, e é a primeira decisão
de arquitetura do Lex Local.

Em compensação, a Spark é **muito forte no processamento de prompt**
(~1.700 tok/s), porque essa fase é limitada por cálculo e não por banda —
e ela tem 1 PFLOP em FP4. Isso é exatamente o perfil de carga do jurídico:
prompts enormes (autos, jurisprudência) e respostas relativamente curtas.
Digerir 40 mil tokens de um processo leva na ordem de 25 segundos.

**Conclusão:** o formato de carga do Lex casa bem com a máquina. O que não
casa é qualquer plano que dependa de um modelo denso de ponta.

---

## 2. O princípio central da segregação

Você descreveu a regra certa: biblioteca e material não sensível na Spark;
autos dos processos patrocinados pelo escritório apenas no notebook do
advogado. O modo de tornar isso verdadeiro na prática, e não apenas no
papel, cabe em uma frase:

> **A Spark é músculo sem memória. O notebook é memória com custódia.**

A Spark **não recebe estado**. Ela expõe apenas serviços sem persistência:
`/v1/chat/completions`, `/embed`, `/rerank` e a busca na biblioteca pública.
Todo o histórico de conversa, todo o rascunho de raciocínio dos agentes,
todo o resultado sobre um caso concreto nasce e morre no notebook, dentro do
volume cifrado.

Isso inverte uma escolha que quase todo projeto desse tipo faz errado:
**o orquestrador dos agentes roda no cliente, não no servidor**. Se o
orquestrador morar na Spark, o "bloco de rascunho" de cada agente — que
contém trechos literais dos autos — passa a viver no servidor, e a
segregação vira ficção. Rodando no notebook, os autos só existem na Spark
como bytes em RAM durante a inferência.

### Os dois enclaves

**Enclave A — Biblioteca (na Spark, 4 TB NVMe)**
Legislação, jurisprudência pública, doutrina, súmulas, enunciados, modelos
de peças anonimizados, teses do escritório, base de conhecimento interna,
pareceres despersonalizados. Índice vetorial completo. É o conhecimento que
não pertence a nenhum cliente.

**Enclave B — Cofre (no notebook do advogado)**
Autos, provas, documentos de clientes, dados pessoais, estratégia
processual, minutas em elaboração, anotações de reunião. Volume cifrado
(LUKS, BitLocker com TPM ou FileVault), índice vetorial local e leve, e
todo o estado de trabalho dos agentes.

### Como uma consulta sensível corre

1. O advogado pergunta no cliente Lex, no notebook.
2. O **Guardião de Sigilo** classifica o escopo. Precisa de contexto do
   Cofre? Sim.
3. A **recuperação acontece no notebook**. O corpus nunca sobe; sobem apenas
   os *k* trechos necessários para responder aquela pergunta.
4. O notebook monta o prompt e abre um canal **mTLS na rede local** com a
   Spark, que não tem rota para a internet.
5. A Spark responde em **modo efêmero**: sem log de conteúdo, cache de
   prompt em `tmpfs`, sem swap (ou swap cifrado), sem persistir KV cache.
6. A resposta é gravada **apenas no notebook**, dentro do volume cifrado.

O resultado jurídico é que os autos permanecem sob custódia exclusiva do
advogado. A Spark é um processador que não retém.

### A regra que não pode ser negociada

**A classificação de sensibilidade tem de ser determinística por origem, não
inferida por modelo.** Tudo que entra pela pasta de processos é sensível por
padrão, sem exceção e sem julgamento de LLM. A promoção de um documento para
a Biblioteca exige anonimização automatizada **mais** revisão humana
registrada. Um classificador probabilístico decidindo o que é sigiloso é uma
questão de tempo até o primeiro vazamento — e o erro seria de quem desenhou.

### Endurecimento técnico da Spark

- VLAN isolada, sem rota padrão para a internet; atualizações por janela.
- Swap desligado ou cifrado — sem isso, trechos de autos podem cair em disco.
- Serviço de inferência sob `systemd` com `PrivateTmp`, logs em `tmpfs`.
- Registro de auditoria só com metadados: quem, quando, quais IDs de
  documento foram recuperados. Nunca o conteúdo do prompt.
- Cifra de sistema de arquivos na Biblioteca também (o SSD da Spark é
  autocifrante, mas isso protege contra furto do aparelho, não contra
  acesso lógico).

### O backup que resolve a tensão

Se os autos existem apenas no notebook, um notebook furtado é perda de acervo.
A solução compatível com o modelo: **o notebook cifra antes de enviar** e a
Spark (ou um NAS) guarda blobs opacos. O servidor custodia sem conseguir ler.
Regra 3-2-1, com uma cópia fora do escritório, sempre cifrada na origem.

### Duas variantes

**Variante B — cofre na Spark com chave no notebook.** Volume LUKS na Spark,
destravado por sessão com chave entregue pelo notebook, desmontado ao final.
Ganha desempenho (indexação pesada roda na Spark), mas o dado passa a existir
em repouso fora da custódia direta do advogado. Juridicamente mais morno.
Use se o volume de autos inviabilizar a indexação no notebook.

**Variante C — contingência offline.** Modelo pequeno no próprio notebook
(Qwen3-8B ou Gemma 3 12B) para consultar o Cofre em viagem, sem a Spark.
Qualidade menor, continuidade preservada.

---

## 3. Orçamento de memória dos 128 GB

Doze agentes **não** significam doze modelos. Significam um modelo-base
servindo todos, diferenciados por *system prompt* e, quando valer a pena, por
adaptador LoRA (~100–300 MB cada, com troca a quente no vLLM).

Isso não é economia: é desempenho. Como o gargalo é banda, servir doze
sequências em lote sobre o **mesmo** modelo lê os pesos uma vez e atende
todas. Doze modelos diferentes multiplicariam a leitura por doze.

| Componente | Memória |
|---|---|
| Cérebro: gpt-oss-120b MXFP4 | ~63 GB |
| Rápido: Qwen3-30B-A3B Q4 (roteamento, extração, classificação) | ~18 GB |
| KV cache, ~8 sessões concorrentes | ~12–20 GB |
| Embeddings: BGE-M3 | ~2 GB |
| Reranker: BGE-reranker-v2-m3 | ~1,2 GB |
| SO, Qdrant, Postgres, aplicação | ~8–10 GB |
| **Residente** | **~105–115 GB** |
| OCR (VLM), Whisper, fine-tuning | sob demanda / fila noturna |

Fica apertado. O OCR de digitalizações e a transcrição de audiências devem
rodar em fila fora do horário de atendimento, não concorrendo com os agentes.

---

## 4. Quais LLMs usar

| Função | Modelo | Por quê |
|---|---|---|
| **Cérebro** — análise, redação, estratégia | **gpt-oss-120b** (MXFP4, Apache 2.0) | Melhor relação qualidade/velocidade dentro dos 128 GB; MoE com 5,1 B ativos |
| Alternativa de contexto muito longo | Llama 4 Scout (109B/17B) | Janela enorme, porém ~3× mais lento |
| **Rápido** — roteador, triagem, extração, sumarização de trecho | **Qwen3-30B-A3B** | 60–90 tok/s, PT-BR forte, ideal para as tarefas de alto volume |
| Revisão fina em passes curtos | Qwen3-32B denso | Qualidade por token maior; use com parcimônia |
| **Embeddings** | **BGE-M3** | Denso + esparso + multivetor no mesmo modelo. O componente esparso é decisivo no jurídico, onde número CNJ, artigo e termo exato importam mais que similaridade semântica |
| Reranking | BGE-reranker-v2-m3 ou Qwen3-Reranker-4B | Ganho grande de precisão a custo baixo |
| OCR de autos digitalizados | Docling, ou Qwen2.5-VL para páginas difíceis | PDFs de processo são o pior caso de extração |
| Áudio de audiências e reuniões | Whisper large-v3 / faster-whisper | Roda em fila |

**Regra dura:** o **mesmo modelo de embedding** nos dois enclaves. BGE-M3
tem 568 M de parâmetros e roda em qualquer notebook. Se a Biblioteca e o
Cofre usarem embeddings diferentes, os espaços vetoriais não conversam e a
recuperação híbrida quebra.

**Sobre modelo jurídico em português:** não existe hoje um open-weights
jurídico brasileiro que supere um bom modelo geral bem alimentado por RAG.
O caminho é **LoRA/QLoRA sobre o modelo geral**, treinado no acervo do
escritório — peças, pareceres, teses vencedoras. E aqui está a maior
vantagem da Spark sobre as alternativas: ela treina. CUDA completo e 128 GB
coerentes entre CPU e GPU cabem um fine-tuning de LoRA em 30B-A3B ou em um
denso de 32B sem ginástica.

---

## 5. O que o local ainda não substitui

Sendo direto, porque a decisão é de compra:

**O local cobre bem** — triagem e classificação de documentos, resumo e
cronologia de autos, extração de fatos e datas, busca em jurisprudência,
comparação de teses, primeira minuta de peça, checagem de citações, roteiro
de perguntas para oitiva, respostas sobre a base de conhecimento.

**O modelo de fronteira ainda ganha** — síntese estratégica de longo alcance
sobre centenas de páginas com raciocínio contraintuitivo, redação final em
nível de sócio, e raciocínio jurídico original de múltiplos passos.

Estimativa honesta: **70 % a 85 % do volume de trabalho do Lex migra para o
local sem perda perceptível.** O topo da curva de dificuldade, não.

**Válvula de escape:** para material público ou já anonimizado, o roteador
pode chamar um modelo de nuvem. Para material do Cofre, nunca — e isso deve
ser garantido por rede, não por disciplina: a única saída para a internet é
um proxy que só aceita carga marcada como pública pelo Guardião de Sigilo.

**Sem avaliação, "substituir a LLM" não é uma decisão, é uma aposta.**
Antes de trocar qualquer coisa, monte um conjunto de 60 a 100 tarefas reais
do Lex com respostas de referência e meça. Serve para escolher o modelo e,
depois, como prova de diligência do escritório.

---

## 6. Orquestração dos doze agentes

O roster real do Lex não está neste repositório — o desenho abaixo é o
esqueleto que a segregação exige, com os papéis que uma plataforma de
inteligência estratégica jurídica precisa ter. **Confirme a sua lista para
eu mapear agente a agente.**

Padrão: **supervisor com portão de política**, nunca malha livre entre
agentes. Cada agente tem contrato de entrada e saída tipado (JSON/pydantic).

```
                       ┌──── NOTEBOOK (custódia) ────────────────┐
  Advogado ──▶ Cliente Lex                                       │
                       │                                          │
                  ┌────▼─────────────────┐                        │
                  │ 0. Guardião de Sigilo│  classificação          │
                  │    (determinístico)  │  determinística         │
                  └────┬─────────────┬───┘                        │
                       │ sensível    │ público                    │
                  ┌────▼──────────┐  │                            │
                  │ 1. Orquestrador│ │  estado, memória de caso   │
                  └────┬──────────┘  │  e rascunhos ficam aqui    │
                       │              │                           │
       ┌───────────────┼──────────────┼────────────┐              │
       │ 2. Ingestão/OCR              │            │              │
       │ 3. Curador do Cofre (RAG local)           │              │
       └───────────────┼──────────────┼────────────┘              │
                       │              │                           │
   ════════════════ mTLS, rede isolada ═══════════════════════════│
                       ▼              ▼                            
        ┌──────── DGX SPARK (músculo sem memória) ─────────┐
        │  4. Curador da Biblioteca (RAG público)          │
        │  5. Pesquisador de jurisprudência                │
        │  6. Analista de risco e prognóstico              │
        │  7. Redator de peças                             │
        │  8. Estrategista (cenários e teses)              │
        │  9. Revisor adversarial                          │
        │ 10. Verificador de citações  ◀── obrigatório     │
        │ 11. Anonimizador (promove ao acervo público)     │
        │ 12. Auditor / registro de conformidade           │
        └──────────────────────────────────────────────────┘
```

Três observações que valem mais que o diagrama:

**O verificador de citações roda sempre, sem exceção.** Alucinação de
jurisprudência é o risco número um de uma IA jurídica, e já rendeu sanções a
advogados. Toda referência produzida por qualquer agente deve ser conferida
contra a base real antes de chegar ao advogado, com a marcação explícita do
que não foi possível confirmar.

**O Anonimizador é um agente de primeira classe**, não um utilitário. É ele
que permite ao escritório converter experiência real em biblioteca reusável
— o ativo mais valioso do Lex a longo prazo. Detectores de CPF, CNPJ,
inscrição na OAB e numeração CNJ, mais revisão humana registrada.

**Framework:** LangGraph resolve grafo com estado, ponto de retomada e
intervenção humana. Mas se o Lex já tem os doze agentes definidos, um
orquestrador próprio em Python tende a ser melhor — o valor está nos
contratos entre agentes e no portão de sigilo, não no framework.

---

## 7. Alternativas de hardware

| Máquina | Banda | Memória | Observação |
|---|---|---|---|
| **DGX Spark 128 GB** | 273 GB/s | 128 GB unificados | Maior capacidade por real, CUDA completo, **treina**, 240 W, silenciosa |
| RTX PRO 6000 Blackwell 96 GB | ~1,79 TB/s | 96 GB | **6–7× mais tok/s**; melhor para servir muitos advogados; ~600 W, workstation cara |
| Mac Studio M3 Ultra | ~819 GB/s | verificar níveis atuais | ~3,4× a banda da Spark; excelente consumo; fraco em fine-tuning |
| 2× DGX Spark (ConnectX-7) | 273 GB/s | 256 GB | Dobra a capacidade, **não** a velocidade por token |

**Recomendação.** Se o Lex Local é sobretudo RAG e redação assistida para um
escritório pequeno ou médio, a Spark é a escolha certa: melhor relação
custo/capacidade/consumo, e ela também é a máquina de fine-tuning que os
concorrentes não são. Se houver dez ou mais advogados consultando ao mesmo
tempo com expectativa de resposta instantânea, uma workstation com RTX PRO
6000 entrega mais.

Caminho de menor risco: **Spark agora**. Se o uso crescer, acrescente uma
GPU de servir depois — a Spark não vira sucata, vira o nó de treino e
desenvolvimento. Há inclusive o desenho avançado de inferência desagregada,
com a Spark fazendo o processamento de prompt (onde ela é forte) e a GPU
fazendo a geração.

**Custo no Brasil:** o preço internacional da Spark parte de US$ 3.999. Com
importação e tributos, planeje uma faixa bem acima disso e confirme com
canal nacional — há versões OEM (ASUS, Dell, HP, Lenovo) que às vezes têm
distribuição local. Some ao orçamento: notebook do advogado com 32–64 GB e
SSD cifrado, e o destino do backup cifrado.

---

## 8. Implantação em fases

| Fase | Entrega | Por que nessa ordem |
|---|---|---|
| **0** | Taxonomia de sensibilidade e estrutura de pastas | Sem isso, nada mais importa. É a fundação jurídica |
| **1** | Spark + Biblioteca: ingestão, embeddings, Qdrant, interface | Só material público. Risco zero enquanto se aprende a máquina |
| **2** | Cofre no notebook + cliente com recuperação local + canal mTLS | Primeiro caso sensível ponta a ponta |
| **3** | Portar os doze agentes, **um a um**, medindo contra o conjunto de referência | Migração comparável, reversível |
| **4** | LoRA sobre o acervo + anonimização automatizada | Onde o Lex Local passa a ser melhor que o genérico |
| **5** | Auditoria, backup cifrado, plano de continuidade | Conformidade demonstrável |

---

## 9. Conformidade

O processamento local é a postura mais forte disponível para um escritório:
nenhum dado de cliente sai do perímetro, o que atende de forma direta à
minimização e à segurança exigidas pela **LGPD** (Lei 13.709/2018, arts. 6º
e 46) e ao dever de sigilo profissional do **Estatuto da Advocacia**
(Lei 8.906/1994, art. 7º) e do Código de Ética da OAB.

Registre como política escrita: quais dados ficam em cada enclave, quem
autoriza a promoção de documento para a Biblioteca, o que é registrado em
auditoria, e a obrigação de revisão humana de toda peça antes do
protocolo. A verificação obrigatória de citações e o registro de auditoria
não são só higiene técnica — são a evidência de diligência do escritório.

*Não sou advogado e isto não é parecer jurídico; a validação das obrigações
profissionais é sua.*

---

## 10. O que preciso de você

1. **A lista real dos doze agentes do Lex**, com o que cada um faz. Sem
   isso, o mapeamento acima é um esqueleto plausível, não o seu sistema.
2. **Volume do acervo** — quantos GB de biblioteca, quantos processos
   ativos, quantas páginas por processo em média.
3. **Quantos advogados** usam ao mesmo tempo, e qual latência é aceitável.
4. **O notebook do advogado** — modelo, memória, sistema. Define se a
   Variante A (recuperação local) é viável ou se será preciso a Variante B.
5. **Como o Lex chama a LLM hoje** — se já é uma interface compatível com a
   API OpenAI, a troca por um endpoint local é quase mecânica.

---

## Referências

Medições e comparações de terceiros, a reconfirmar em prova de conceito:

- [Performance of llama.cpp on NVIDIA DGX Spark — discussão ggml-org](https://github.com/ggml-org/llama.cpp/discussions/16578)
- [DGX Spark: benchmarks reais e limites](https://ete.ua/en/nvidia-dgx-spark-realni-testy/)
- [DGX Spark concurrency benchmark](https://dendro-logic.com/engineering/nvidia-dgx-spark-concurrency-benchmark/)
- [DGX Spark vs Mac Studio e alternativas](https://aimultiple.com/dgx-spark-alternatives)
- [DGX Spark + RTX 6000 Pro — inferência desagregada (fórum NVIDIA)](https://forums.developer.nvidia.com/t/dgx-spark-rtx-6000-pro-blackwell-disaggregated-inference/368860)
- [Melhores modelos de embedding para RAG em 2026](https://www.stackai.com/insights/best-embedding-models-for-rag-in-2026-a-comparison-guide)
