# Prompt de diagnóstico do Lex — para dimensionar a DGX Spark

Cole o bloco abaixo na plataforma Lex Inteligência Estratégica, onde ela tem
acesso aos dados, aos agentes, aos conectores e aos fluxos. A resposta dela
alimenta o cálculo de quantos advogados a Spark aguenta em simultâneo e o
prazo de retorno do investimento.

**O que torna este prompt diferente de um relatório de uso comum:** ele exige
a separação entre *tokens de entrada* e *tokens de saída* por execução. Na
Spark o processamento de prompt roda a ~1.700 tok/s e a geração a ~40 tok/s —
uma diferença de 40×. Um total agregado de tokens não permite dimensionar
nada.

---

## O prompt

```
Você é o Lex Inteligência Estratégica. Preciso de um diagnóstico técnico
completo de você mesmo — dos seus agentes, fluxos, conectores e consumo real.

CONTEXTO DA DECISÃO
Vamos avaliar a compra de uma NVIDIA DGX Spark (128 GB de memória unificada,
banda de 273 GB/s, 4 TB NVMe) para rodar você inteiramente dentro do
escritório, na versão Lex Local. O motivo é o custo de token da API, que hoje
inviabiliza a escala do projeto. A arquitetura prevista separa a Biblioteca
(material público, na Spark) do Cofre (autos dos processos patrocinados,
apenas no notebook do advogado).

Com a sua resposta eu vou calcular:
(a) quantos advogados conseguem usar você simultaneamente na Spark;
(b) quais agentes e fluxos migram sem perda e quais não migram;
(c) em quantos meses a Spark se paga contra o custo atual de API.

REGRA DE OURO — leia antes de responder
Esta resposta vai sustentar uma decisão de compra. Portanto:
- Marque cada número com [MEDIDO], [ESTIMADO] ou [DESCONHECIDO].
- [MEDIDO] só para o que você consegue apurar de logs, telemetria,
  configuração ou histórico real. Diga a fonte e o período.
- Nunca preencha uma lacuna com um número plausível. "[DESCONHECIDO] — não
  há telemetria de tokens por agente" é uma resposta melhor e mais útil do
  que uma estimativa que parece precisa.
- Se algum dado exige instrumentação que você não tem, liste no fim o que
  precisa ser instrumentado e como.

===========================================================
BLOCO 1 — INVENTÁRIO DOS AGENTES
===========================================================
Para cada um dos seus agentes, uma linha de tabela com:
1. Nome e identificador interno
2. Função em uma frase
3. Modelo e provedor que ele usa hoje, e por que esse e não outro
4. Tamanho do system prompt, em tokens
5. Ferramentas / function calls que ele pode chamar
6. Se produz saída livre ou estruturada (JSON/schema)
7. Se depende de contexto longo — e qual a maior janela que ele já usou
8. Se ele chama outros agentes, e quais
9. Se ele toca dados de processos patrocinados (sim/não/às vezes)

Ao fim: o total de agentes, e se algum deles é hoje apenas um system prompt
sobre o mesmo modelo, em vez de um serviço separado.

===========================================================
BLOCO 2 — FLUXOS PONTA A PONTA
===========================================================
Liste os fluxos de trabalho reais que você executa (não os agentes isolados —
os fluxos que um advogado dispara). Para cada fluxo:
1. Nome e o que entrega ao advogado
2. Sequência de agentes acionados, indicando o que roda em paralelo e o que
   roda em série
3. Número total de chamadas ao modelo por execução
4. Duração de ponta a ponta hoje, medida (p50 e p95)
5. Quantas vezes é executado por dia, no total e por advogado
6. Se é interativo (o advogado espera na tela) ou em lote (pode rodar em fila)
7. Se toca o Cofre (autos, dados de cliente) ou só a Biblioteca

A distinção interativo × lote é decisiva: fluxo de lote pode rodar de
madrugada e não disputa capacidade no horário de pico.

===========================================================
BLOCO 3 — PERFIL DE TOKENS  ← o bloco mais importante
===========================================================
Para cada fluxo do Bloco 2, e se possível para cada agente do Bloco 1,
informe SEPARADAMENTE:

  A. Tokens de ENTRADA por execução (prompt + contexto recuperado + histórico)
     — mediana e percentil 95
  B. Tokens de SAÍDA por execução (o que o modelo gera)
     — mediana e percentil 95
  C. Taxa de acerto de cache de prompt, se você usa cache
  D. Quanto da entrada é prefixo estável (system prompt, instruções, few-shot)
     e quanto muda a cada chamada

Não agregue A e B num número só. Se a sua telemetria só guarda o total,
diga isso explicitamente e informe a proporção aproximada entre entrada e
saída, se souber.

===========================================================
BLOCO 4 — CONECTORES E INTEGRAÇÕES
===========================================================
Para cada conector configurado:
1. Nome e sistema externo (tribunal, DJEN, PJe, e-mail, Drive, ERP, agenda,
   base de jurisprudência, o que houver)
2. O que ele lê e o que ele escreve
3. Volume: chamadas por dia, dados trafegados
4. Se exige internet obrigatoriamente — e portanto continua exigindo mesmo
   depois que a LLM for local
5. Se ele traz dados sensíveis para dentro do fluxo
6. Se depende de algum recurso do provedor de LLM atual (busca web nativa,
   execução de código, visão, geração de imagem) que um modelo local não tem

O item 6 é onde os projetos de migração costumam quebrar. Seja rigoroso.

===========================================================
BLOCO 5 — BASE DE CONHECIMENTO E RAG
===========================================================
1. Volume total do acervo em GB e em número de documentos
2. Divisão entre material público (legislação, jurisprudência, doutrina,
   modelos) e material de processos patrocinados
3. Modelo de embedding usado hoje, dimensão dos vetores, banco vetorial
4. Estratégia de fragmentação: tamanho do trecho, sobreposição
5. Número de vetores indexados e tamanho do índice em disco
6. Quantos trechos são recuperados por consulta, e se há reranking
7. Quantos documentos entram por mês, e quantos são digitalizações que
   precisam de OCR
8. Quantas horas de áudio (audiências, reuniões) são transcritas por mês

===========================================================
BLOCO 6 — USO REAL E PICOS
===========================================================
1. Quantos advogados e quantos colaboradores usam você hoje
2. Quantos usam num dia típico
3. Distribuição das requisições ao longo do dia — em que faixa horária está
   o pico, e que fração do volume diário cai nesse pico
4. Máximo de sessões realmente simultâneas já observado
5. Quanto tempo o advogado tolera esperar, por tipo de fluxo
6. Projeção de crescimento para 12 e 24 meses

===========================================================
BLOCO 7 — CUSTO ATUAL   (a razão do projeto)
===========================================================
1. Gasto mensal com API de LLM nos últimos 6 meses, mês a mês
2. Tokens consumidos por mês, separando entrada e saída, por modelo
3. Custo médio por execução de cada fluxo do Bloco 2
4. Quais fluxos concentram o gasto — os três mais caros e a fração de cada um
5. Gasto com embeddings, transcrição e OCR, se separado
6. Qual funcionalidade você já teve de limitar, desligar ou racionar por
   causa do custo

O item 6 importa tanto quanto o gasto: mede o projeto reprimido, não só o
projeto pago.

===========================================================
BLOCO 8 — CLASSIFICAÇÃO DE SENSIBILIDADE
===========================================================
1. Como você distingue hoje material público de material de processo
   patrocinado — a regra é determinística (pasta, origem, marcação) ou
   inferida por modelo?
2. Quais fluxos e agentes nunca tocam dados sensíveis e poderiam rodar
   inteiramente na Spark
3. Quais tocam, e portanto exigem que a orquestração rode no notebook do
   advogado com a Spark servindo apenas inferência sem estado
4. Existe hoje algum processo de anonimização para promover documento de
   processo a modelo reutilizável na Biblioteca?
5. O que fica registrado em log hoje — conteúdo dos prompts, ou só metadados?

===========================================================
BLOCO 9 — DEPENDÊNCIAS QUE PODEM IMPEDIR A MIGRAÇÃO
===========================================================
Seja adversarial consigo mesmo. O que em você depende de capacidade que um
modelo aberto rodando em 128 GB pode não ter?
1. Algum agente precisa de janela acima de 128 mil tokens?
2. Algum depende de leitura de imagem, PDF nativo ou multimodalidade?
3. Algum depende de chamada de ferramenta com confiabilidade muito alta, em
   que uma falha de formato quebra o fluxo?
4. Algum depende de raciocínio jurídico de alta complexidade em que a queda
   de qualidade seria inaceitável — e como você mediria essa queda?
5. Existe hoje algum conjunto de avaliação, com casos e respostas de
   referência, que permita comparar um modelo local contra o atual? Se não
   existe, proponha um: quantos casos, de quais fluxos, e com qual critério
   de nota.

===========================================================
BLOCO 10 — DIMENSIONAMENTO: FAÇA VOCÊ MESMO A CONTA
===========================================================
Com os seus próprios números, calcule. Use estas premissas de hardware, que
valem para um modelo MoE de ~120 B parâmetros com ~5 B ativos rodando na
Spark de 128 GB:

  - Processamento de prompt (entrada):  ~1.700 tokens/s
  - Geração (saída), fluxo único:       ~40 tokens/s
  - Geração agregada, com lote de 8 a 16 requisições concorrentes:
       ~3× a 5× o valor de fluxo único, com a latência individual subindo
       na mesma proporção
  - Uma execução ocupa a máquina por:
       tempo ≈ (tokens_entrada ÷ 1.700) + (tokens_saída ÷ 40)

Calcule e apresente:
1. O tempo de uma execução de cada fluxo do Bloco 2 na Spark, com fluxo único
2. Quantos tokens de saída um advogado gera por dia, em média
3. A demanda de geração no horário de pico, em tokens por segundo, por
   advogado
4. Quantos advogados simultâneos a Spark comporta:
      N = capacidade agregada de geração ÷ demanda por advogado no pico
5. Qual fluxo é o gargalo, e por quê
6. Qual seria o efeito de mover os fluxos de lote para a madrugada
7. Prazo de retorno: gasto mensal atual de API ÷ custo total da Spark
   (equipamento + notebook do advogado + destino de backup)
8. Em que ponto de crescimento a Spark deixa de bastar — número de advogados
   ou volume — e qual seria o próximo passo

===========================================================
FORMATO DA RESPOSTA
===========================================================
- Tabelas onde couber tabela.
- Cada número com [MEDIDO], [ESTIMADO] ou [DESCONHECIDO] e a fonte.
- Ao fim, três seções curtas:
    (i)   O QUE EU SEI — os dados sólidos
    (ii)  O QUE EU NÃO SEI — as lacunas, e o que instrumentar para preencher
    (iii) O QUE ME PREOCUPA — os riscos técnicos reais da migração, na sua
          avaliação honesta, mesmo os que enfraquecem o projeto
- Não suavize a seção (iii). Uma decisão de compra baseada num diagnóstico
  otimista custa mais caro que a decisão de não comprar.
```

---

## Como ler a resposta

Os três números que decidem a compra:

1. **Tokens de saída por execução de fluxo.** É o que a Spark gera a
   ~40 tok/s. Se os fluxos do Lex geram peças longas, esse é o teto.
2. **Fração da demanda que cai no pico.** Fluxo de lote empurrado para a
   madrugada não disputa capacidade — pode multiplicar a simultaneidade útil.
3. **Gasto mensal de API.** Divide o custo da Spark e dá o prazo de retorno.

Se o Lex responder `[DESCONHECIDO]` no Bloco 3, a prioridade passa a ser
instrumentar a contagem de tokens por chamada antes de comprar qualquer
coisa. É uma semana de trabalho que evita um erro de dezenas de milhares de
reais.
