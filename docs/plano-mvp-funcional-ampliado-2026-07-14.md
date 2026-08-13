# Plano para aprovação — SmartZap CF MVP funcional ampliado

**Status:** Proposto, aguardando aprovação  
**Data:** 14/07/2026  
**Decisor:** responsável pelo SmartZap  
**Código de referência:** `/Users/thaleslaray/Projetos/smartzap`  
**Aplicação-alvo:** `/Users/thaleslaray/Projetos/smartzap-cf`

## 1. Objetivo

Elevar o `smartzap-cf` do piloto técnico atual para um produto operacional mínimo,
recuperando cinco conjuntos de funcionalidades do SmartZap original:

1. Inbox completa: respostas rápidas, labels, mídia, handoff, agentes automáticos,
   RAG e memória.
2. Segmentação avançada: tags, custom fields, exportação e histórico de contatos.
3. Campanhas: variáveis dinâmicas e preview da mensagem final.
4. Operação de campanhas: agendamento, pastas, filtros e métricas por lote.
5. Base de conhecimento com somente um provedor de IA.

O fluxo real Meta já validado, sua idempotência, assinatura de webhook, ledger de
envio, retenção e travas de piloto não serão removidos ou enfraquecidos.

## 2. O que foi confirmado no código original

O plano não se baseia apenas em documentação. O código original contém contratos e
interfaces para:

- conversas `open/closed` e modos `bot/human`;
- handoff, retorno ao bot e pausa temporária da automação;
- labels e respostas rápidas com atalhos;
- mensagens internas, mídia e histórico paginado;
- tags de contatos, campos personalizados e atualização em massa;
- seleção de segmentos no wizard de campanhas;
- mapeamento de variáveis, valores fixos, preview e contatos ignorados;
- agendamento, pastas, tags de campanhas, traces e métricas por lote;
- arquivos de conhecimento, RAG e memória conversacional.

Esses contratos serão usados como referência comportamental. Componentes acoplados a
Next.js, Supabase, pgvector, Mem0, Gemini ou Upstash não serão copiados literalmente.

## 3. Decisão de arquitetura

### Decisão proposta

Manter o Worker único atual e acrescentar módulos com responsabilidades separadas:

| Responsabilidade | Tecnologia |
|---|---|
| Estado relacional, filtros, histórico e memória resumida | D1 |
| Arquivos e mídia privados | R2 |
| Busca semântica/híbrida da base de conhecimento | Cloudflare AI Search |
| Inferência | Workers AI, modelo 3B atualmente validado |
| Recepção de eventos Meta | Queue existente |
| Automação da Inbox | Queue/Workflow separado, nunca no request do webhook |
| Atualização do painel | RealtimeHub existente |
| Envios de campanha | CampaignSendWorkflow existente, ampliado por lotes |

Novas instâncias de AI Search possuem armazenamento e índice integrados e permitem
upload e busca por binding. A base não dependerá de pgvector, Mem0 ou de outro provedor.
R2 continuará responsável pela mídia operacional, separada dos documentos de RAG.

### Opções descartadas

#### Portar integralmente o backend Supabase

- Vantagem: maior semelhança de código com o original.
- Desvantagens: reintroduz Postgres, Realtime, pgvector e duas infraestruturas; invalida
  a decisão de operação integral na Cloudflare.

#### Implementar RAG manual com Vectorize

- Vantagem: controle de embeddings e chunking.
- Desvantagens: mais código, mais jobs e mais pontos de falha sem benefício necessário
  para a primeira base de conhecimento.

#### Agente dentro do consumer do webhook

- Vantagem: menos componentes.
- Desvantagem crítica: timeout, indisponibilidade ou custo da IA interfeririam no ACK
  do webhook e poderiam provocar reentregas da Meta.

## 4. Modelo funcional aprovado como mínimo

### 4.1 Contatos e segmentação

Entregas:

- CRUD de tags e associação individual/em massa.
- CRUD de definições de campos personalizados.
- Valores tipados: texto, número, data e booleano.
- Filtros por nome, telefone, consentimento, tags, campos e atividade.
- Segmentos salvos com regras `AND/OR` validadas; nenhuma expressão SQL do cliente.
- Preview da audiência e contagem antes de salvar ou usar um segmento.
- Exportação CSV respeitando os filtros atuais.
- Timeline por contato: mensagens, campanhas, opt-in/opt-out, tags, handoffs e notas.
- Toda mudança administrativa relevante registrada em `contact_history_events`.

Critérios de aceite:

- Um segmento retorna a mesma audiência no preview e no snapshot da campanha.
- Alterar um contato depois do disparo não muda o snapshot já criado.
- Exportação não contém campos internos, hashes, tokens ou segredos.
- Opt-out e supressão sempre prevalecem sobre qualquer segmento.

### 4.2 Campanhas completas

Entregas:

- Pastas de campanhas e filtros por pasta, status, template, período e busca.
- Segmento salvo ou seleção manual como audiência.
- Parser das variáveis dos componentes do template.
- Mapeamento para nome, telefone, custom field ou valor fixo.
- Fallback configurável e bloqueio quando uma variável obrigatória não puder ser
  resolvida.
- Preview com um contato real selecionado e payload exatamente igual ao que será
  enviado.
- Snapshot determinístico da audiência e dos valores renderizados.
- Agendamento com timezone explícito e opção de cancelar antes da execução.
- Lotes persistidos com início, fim, tentativas, aceitos, entregues, lidos e falhas.
- Trace operacional sem telefone, conteúdo integral ou credenciais.
- Custo estimado antes do disparo e custo observado separado por campanha.

Critérios de aceite:

- Preview, payload persistido e POST à Meta são derivados da mesma função pura.
- Retry do Workflow reutiliza o snapshot; nunca recalcula variáveis silenciosamente.
- Duas execuções concorrentes não reivindicam o mesmo destinatário.
- Campanha agendada não envia antes do horário e cancelamento impede novos lotes.
- Status fora de ordem não rebaixa métricas.

### 4.3 Inbox humana completa

Entregas:

- Lista com filtros por status, modo, label, prioridade e busca.
- Estados `open/closed`, prioridade e modos `human/bot`.
- Labels com cor e associação múltipla por conversa.
- Respostas rápidas com título, conteúdo e atalho único.
- Campo de mensagem editável; rascunho de IA nunca substitui o texto sem confirmação.
- Envio manual de texto, template e mídia permitida pela Cloud API.
- Recepção e visualização autenticada de imagem, documento, áudio e vídeo.
- Download imediato da mídia inbound da URL temporária da Meta para R2 privado.
- Handoff manual, motivo, resumo, pausa com expiração e retorno ao bot.
- Notas internas que nunca são enviadas ao WhatsApp.
- Paginação por cursor e status de entrega em tempo real.
- Retenção configurável para conteúdo e mídia, preservando apenas métricas necessárias.

Critérios de aceite:

- Arquivos são privados e só podem ser lidos por uma sessão autenticada.
- MIME, extensão, tamanho e assinatura do arquivo são validados antes de persistir.
- Handoff cancela qualquer automação ainda não enviada.
- Retorno ao bot não responde retroativamente a mensagens antigas.
- Cada ação de envio tem idempotência e estado ambíguo sem retry cego.

### 4.4 Base de conhecimento, RAG e memória

Entregas:

- Uma base de conhecimento operacional com upload, listagem, status, reindexação e
  exclusão de documentos.
- Formatos iniciais: PDF textual, TXT, Markdown e HTML limpo.
- Estado no D1: arquivo, versão, checksum, status de indexação e erro sanitizado.
- Conteúdo indexado no AI Search; busca híbrida com trechos e identificação da fonte.
- Prompt do agente recebe somente os trechos recuperados e o histórico necessário.
- Memória curta: últimas mensagens da conversa.
- Memória longa: resumo estruturado em D1, atualizado assincronamente e versionado.
- Tela no painel para visualizar, corrigir e apagar memórias do contato.
- Exclusão do documento remove sua disponibilidade para novas respostas.

Critérios de aceite:

- Sem resultado relevante, o agente admite que não sabe ou transfere para humano.
- Resposta não pode afirmar uma informação factual ausente nas fontes recuperadas.
- Fontes utilizadas ficam registradas no run da IA, sem expor o documento inteiro.
- Prompt injection presente em documento ou conversa permanece tratado como dado.
- Apagar memória ou documento impede seu uso em execuções futuras.

### 4.5 Agente automático com um provedor

Entregas:

- Um único provedor: Workers AI.
- Um agente configurável com nome, instrução, base, limites e critérios de handoff.
- Automação desligada globalmente e por conversa por padrão.
- Evento inbound persiste primeiro; depois cria um job idempotente separado.
- Debounce curto reúne mensagens consecutivas antes da resposta.
- Antes de enviar, o job revalida: modo bot, opt-in operacional, mensagem mais recente,
  janela da Meta, ausência de handoff e kill switch.
- Saída estruturada: mensagem, confiança, sentimento, handoff e motivo.
- Confiança baixa, pedido de humano, assunto sensível ou erro de RAG gera handoff.
- Limites por conversa/hora, globais/dia e máximo de respostas automáticas seguidas.
- Log de modelo, tokens, latência, fontes e decisão; conteúdo sensível fica fora dos
  logs operacionais da Cloudflare.

Critérios de aceite:

- Um inbound gera no máximo uma resposta automática.
- Handoff ocorrido durante o processamento impede o envio.
- Timeout ou falha do modelo não bloqueia webhook nem produz retry de mensagem.
- Automação não usa template fora da janela sem política específica e aprovada.
- O primeiro rollout automático permanece restrito ao destinatário piloto.

## 5. Alterações de dados previstas

As migrations serão aditivas e divididas por domínio, sem uma migration monolítica:

1. `0011_contacts_segmentation.sql`
   - `contact_custom_values`, `saved_segments`, `contact_history_events`;
   - completar índices de `tags` e `contact_tags` já existentes.
2. `0012_campaign_composition.sql`
   - `campaign_folders`, `campaign_tags`, `campaign_tag_assignments`;
   - mapeamento de variáveis, timezone e snapshot da campanha.
3. `0013_campaign_batches.sql`
   - `campaign_batches`, `campaign_trace_events` e payload renderizado por destinatário.
4. `0014_inbox_operations.sql`
   - modo, status, prioridade e pausa nas conversas;
   - `inbox_labels`, `conversation_labels`, `quick_replies`, notas internas.
5. `0015_inbox_media.sql`
   - metadados de mídia, chave R2, checksum, tamanho, MIME e expiração.
6. `0016_knowledge_and_memory.sql`
   - documentos, jobs de indexação, memórias, agente e runs da IA.

Cada migration terá teste de banco vazio, upgrade a partir da produção atual e rollback
operacional documentado. Rollback de código não apagará colunas ou dados recém-criados.

## 6. Sequência de implementação

### Marco 0 — Contratos e fundação

- Consolidar tipos do original e eliminar duplicidades/inconsistências.
- Criar ADR aceito, migrations 0011–0013 e feature flags desligadas.
- Criar funções puras de regras de segmento e variáveis.

**Gate:** schemas, upgrade local e testes de domínio aprovados.

### Marco 1 — Contatos e segmentos

- APIs, repositórios e UI de tags, campos, segmentos, exportação e timeline.
- Integrar segmentos ao preview de audiência, ainda sem disparo.

**Gate:** segmento reproduzível, exportação segura e E2E de contatos.

### Marco 2 — Composição e operação de campanhas

- Variáveis, preview real, snapshot, pastas, filtros e agendamento.
- Persistência e visualização de lotes/traces.
- Ampliar Workflow mantendo idempotência e throttle existentes.

**Gate:** campanha simulada completa; depois um envio real exclusivo ao piloto.

### Marco 3 — Inbox humana

- Labels, quick replies, status, prioridade, notas, handoff e editor de mensagem.
- Mídia inbound/outbound com R2 privado e retenção.

**Gate:** texto e cada tipo de mídia testados no sandbox; texto e uma imagem no piloto.

### Marco 4 — Conhecimento, RAG e memória

- Binding e instância de AI Search.
- Upload, indexação, busca, fontes, memórias e painel administrativo.
- Avaliação adversarial de recuperação e groundedness.

**Gate:** conjunto de perguntas com resposta esperada, recusa e exclusão verificadas.

### Marco 5 — Agente automático

- Queue/Workflow separado, debounce, locks, saída estruturada e handoff.
- Kill switches e limites de custo.
- Primeiro rollout somente no número piloto.

**Gate:** testes de corrida, handoff durante geração, timeout, duplicação, prompt
injection e um ciclo real controlado.

### Marco 6 — Consolidação de produção

- Auditoria de segurança, retenção, observabilidade e acessibilidade.
- Regressão completa, E2E, deploy gradual e runbook.
- Ativação de flags por módulo somente após seu gate.

**Gate final:** todas as cinco frentes utilizáveis no painel de produção.

## 7. Estratégia de testes

- Testes puros: regras de segmento, variáveis, fallback, horários e transições.
- D1 real no runtime de teste: constraints, concorrência, paginação e migrations.
- Meta mockada: payloads de texto, template e mídia, erros e timeouts.
- Webhook assinado: inbound multimídia, reentrega e status fora de ordem.
- Workers AI real controlado: qualidade, RAG, memória e ataques adversariais.
- E2E Playwright: contatos → segmento → campanha; Inbox humana; conhecimento → agente.
- Produção: somente destinatário piloto até aprovação explícita de ampliação.

Nenhum teste automatizado utilizará tokens operacionais ou enviará mensagem real.

## 8. Rollout e segurança

Flags independentes:

- `SEGMENTS_ENABLED`
- `CAMPAIGN_COMPOSER_V2_ENABLED`
- `INBOX_OPERATIONS_ENABLED`
- `INBOX_MEDIA_ENABLED`
- `KNOWLEDGE_BASE_ENABLED`
- `INBOX_AUTOMATION_ENABLED`

Cada flag nasce desligada em produção. Deploy de schema e código ocorre primeiro; a
ativação acontece após smoke test. O envio automático terá ainda um kill switch próprio,
allowlist piloto e orçamento diário separado do envio humano e das campanhas.

## 9. Fora do escopo deste plano

- Workflow Builder visual.
- WhatsApp Flows/MiniApps.
- Formulários públicos de captação.
- Google Calendar.
- Multiusuário, permissões por atendente e cobrança SaaS.
- Múltiplos provedores ou escolha de modelo pelo operador.
- Migração integral dos dados históricos do Supabase.

Esses itens não podem ser usados depois para declarar incompleto o mínimo aqui definido;
qualquer inclusão exige nova decisão de escopo.

## 10. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Duplicação de resposta automática | run único por mensagem + revalidação antes do POST |
| IA inventar informação | RAG com fontes, limiar de confiança e handoff |
| Handoff competir com agente | modo persistido + cancelamento/revalidação imediatamente antes do envio |
| Segmento mudar durante campanha | snapshot imutável no preflight |
| Variável produzir payload diferente do preview | mesma função pura para preview e envio |
| Mídia expor dados | R2 privado, rota autenticada, validação e retenção |
| Migration quebrar produção | migrations aditivas, flags desligadas e teste de upgrade |
| Custo de IA crescer | único modelo, cotas, debounce, métricas e kill switch |

## 11. Pontos de aprovação

Ao aprovar este documento, ficam aprovadas as seguintes decisões:

1. As cinco frentes descritas são o novo mínimo funcional.
2. Workers AI será o único provedor; o modelo 3B continua como padrão inicial.
3. AI Search será o mecanismo de RAG; D1 guardará metadados e memória estruturada.
4. Automação nasce desligada e o rollout real começa apenas no número piloto.
5. Implementação seguirá a ordem Marcos 0–6, com deploy gradual por feature flag.
6. Os itens da seção “Fora do escopo” permanecem excluídos.

**Resposta esperada para iniciar:** `Aprovado` ou uma lista objetiva de alterações.
