# Plano de auditoria real — SmartZap + Meta WhatsApp

> **Plano histórico já executado.** Não execute novamente as etapas de rotação ou
> revogação: o responsável determinou explicitamente que as credenciais atuais são
> chaves de teste e devem ser mantidas. O estado efetivo está no relatório final de
> 14/07/2026.

Data de elaboração: 14/07/2026  
Status: auditoria real concluída; transporte aprovado para piloto controlado.  
Referência Meta: Graph API v25.0.

> Resultado final e evidências atualizadas: [relatorio-final-auditoria-real-meta-2026-07-14.md](./relatorio-final-auditoria-real-meta-2026-07-14.md).

## Registro de execução — 14/07/2026

Resultado consolidado:

- Allowlist do único destinatário aplicada na API e repetida no Workflow; o telefone ficou somente em secret.
- Kill switch exato, ledger D1 atômico, teto global de três tentativas, prefixo `[PILOT REAL]`, allowlist de templates e throttle de 1 msg/s foram publicados.
- Preflight passou a exigir App/WABA/Phone IDs exatos, `CONNECTED`, `CLOUD_API`, `LIVE`, app correto inscrito e callback específico do WABA igual ao Worker.
- Headers dinâmicos, placeholders e botões que exigem parâmetros continuam bloqueados.
- Validação local final: 120 testes em 17 arquivos, TypeScript, build, `git diff --check` e 2 E2E aprovados.
- Migrations remotas `0002` a `0005` aplicadas; nenhuma migration ficou pendente.
- 53 templates sincronizados, dos quais 52 aprovados.
- Callback global e override específico do WABA apontam para `https://smartzap-cf.thales2581.workers.dev/webhook`; GET challenge respondeu 200.
- Um webhook sintético com HMAC válido atravessou Worker, Queue e consumer e foi persistido no D1; a evidência sintética foi removida depois.
- Deploy funcional: `cae1b883-f19e-48e7-8259-0ee691b17c41`. Versão final após desligar o secret de envio: `56e81dda-bc6e-40c5-ad7d-9f1505b85c4a`.
- Turnstile foi explicitamente adiado pelo responsável e permaneceu em `TURNSTILE_ENABLED=false`.

### Resultado dos envios reais

| Caso | Campaign ID | Resultado Graph/Workflow | Webhook real |
|---|---|---|---|
| C01 utilitário imediato | `25321791-73a4-43c4-889d-b060eb88fba6` | aceito; 1 enviado; 0 falhas | não observado |
| C02 utilitário agendado | `733156ea-691b-4422-ad74-4357ac6b10e3` | agendamento executado; aceito; 1 enviado; 0 falhas | não observado |
| C03 marketing estático | `cef94a1c-0fe4-4b8c-8073-307dfa3e2928` | aceito; 1 enviado; 0 falhas | não observado |

Uma campanha anterior (`fd2f6c9c-4b7b-491a-b5ad-fbf19c8f34a3`) foi bloqueada pelo kill switch durante propagação de secret. Ela não chamou a Meta, não recebeu `message_id` e não consumiu o orçamento do ledger.

O ledger terminou com exatamente três linhas `accepted`, todas com `message_id`; não houve retry automático nem quarto envio. O kill switch foi desligado ao final, `readyForPilot=false` por contenção e não restou sessão administrativa ativa.

### Diagnóstico definitivo do webhook

Nenhum status real `sent`, `delivered`, `read` ou `failed` dos três `message_id` foi recebido no `status_events`. A causa foi identificada em 14/07/2026: o número possuía um override próprio de webhook apontando para outro callback. Pela precedência oficial da Meta, o override do telefone vence o override da WABA e o callback do app; por isso nenhum POST chegava ao Worker apesar de WABA e app estarem corretos.

O override do telefone foi atualizado para o Worker. A Meta refez o GET de verificação e recebeu HTTP 200; a releitura Graph confirmou `phoneBelongsToWaba=true`, `effectiveWebhookCallbackMatches=true` e saúde Meta operacional. O health check agora valida permanentemente tanto a relação Phone ID ↔ WABA quanto o callback efetivo do telefone, impedindo que esse desvio volte a ser declarado saudável.

Diagnóstico Graph adicional executado após a rodada:

- `debug_token`: token válido, tipo `SYSTEM_USER`, sem expiração e emitido pelo App esperado.
- Escopos obrigatórios `whatsapp_business_management` e `whatsapp_business_messaging`: presentes.
- Assinatura global do objeto `whatsapp_business_account`: ativa.
- Campos ativos: `messages`, `calls`, `user_preferences` e `message_template_status_update`.
- Callback global, override específico do WABA e callback efetivo do telefone: iguais ao endpoint do Worker após a correção.
- Logs históricos Cloudflare: os GETs de challenge e POSTs sintéticos aparecem; não existe POST da Meta depois dos envios reais.

Assim, a ausência dos status não foi causada por rejeição HMAC, parser, Queue, D1 ou deploy da Cloudflare: os eventos eram desviados pelo override do telefone. O teste decisivo seguinte é uma mensagem inbound após a correção, para reconciliar o primeiro evento real no D1.

O token atual também contém permissões muito além das necessárias (Ads, Instagram, Pages e Commerce). Isso não explica a falha do webhook, mas viola menor privilégio e reforça a necessidade de substituí-lo por um System User token dedicado ao WhatsApp.

As credenciais anteriormente expostas foram usadas por autorização expressa do responsável nesta rodada. A rotação do token e do App Secret continua sendo pendência de segurança antes de qualquer operação contínua.

## 1. Decisão de escopo

Ativo real escolhido:

- App Meta: `344941004274813`.
- WABA: `159711717233997`.
- Phone Number ID: `177462062115446`.
- Origem: `+55 11 4200-0377`.
- Estado observado: `CONNECTED`, `CLOUD_API`, `LIVE`, nome aprovado e qualidade `GREEN`.

Destinatário:

- Somente o número pessoal autorizado pelo responsável.
- O número completo não será gravado no Git; será instalado como secret `PILOT_RECIPIENT_E164`.
- Qualquer audiência diferente de exatamente um destinatário deve bloquear a campanha.

Orçamento máximo desta rodada:

- Até **3 novos envios reais**.
- No máximo uma mensagem por caso de teste.
- Sem retry automático depois de timeout, falha de rede ou resultado ambíguo.
- Sem carga, blast, múltiplos destinatários ou teste de throughput em produção.

O envio direto de `hello_world` realizado antes deste plano é apenas evidência preliminar de que a Meta aceita mensagens pelo ativo. Ele não substitui o E2E via SmartZap, pois o webhook ainda não estava conectado.

## 2. Estado de partida confirmado

### Meta

- Token utilizado na auditoria é `SYSTEM_USER`, válido e sem expiração, porém foi exposto e precisa ser revogado.
- App Secret também foi exposto e precisa ser rotacionado.
- A WABA não possui app inscrito em `subscribed_apps`.
- O callback do app aponta para um Supabase antigo e inativo do NossoCRM.
- O app assina somente `messages` e `calls`; faltam eventos necessários ao SmartZap.
- Há 53 templates: 52 aprovados e 1 rejeitado.
- Templates estáticos adequados à rodada:
  - `hello_world`, `en_US`, `UTILITY`, somente texto.
  - `template_20260125_1739`, `pt_BR`, `MARKETING`, somente corpo estático (`Olha isso`).
- Templates com header de documento, vídeo, GIF ou localização não são elegíveis enquanto o SmartZap não enviar os componentes obrigatórios.

### Cloudflare

- Produção ainda executa a versão de 08/07/2026.
- Secrets presentes: `MASTER_PASSWORD`, `META_VERIFY_TOKEN`, `SMARTZAP_API_KEY`.
- Secrets ausentes: `META_APP_SECRET`, `WHATSAPP_TOKEN`, `TURNSTILE_SECRET`, `TURNSTILE_SITE_KEY`.
- D1 remoto não contém `whatsapp_phone_id` nem `whatsapp_waba_id`.
- Migrations remotas pendentes: `0002`, `0003` e `0004`.
- Workflow `campaign-send` existe.
- Queue `meta-webhooks` possui produtor e consumidor.
- DLQ `meta-webhooks-dlq` existe, sem consumidor, como esperado para inspeção manual.
- `/api/health` responde, mas é apenas liveness; prontidão deve ser verificada em `/api/settings/health` autenticado.

### Código e testes

- A suíte local possui 104 testes, build, TypeScript e dois E2E aprovados na última validação.
- O E2E atual testa o bloqueio quando faltam credenciais; ainda não cobre um envio real.
- Não existe allowlist de destinatário nem kill switch de envio.
- O health-check aceita qualquer app inscrito na WABA e não valida `status`/`platform_type` do telefone.
- A detecção de template parametrizado verifica `{{n}}`, mas não bloqueia header dinâmico de mídia/localização.
- O webhook processa status, preferências, erro de plataforma e estado de template. Mensagens recebidas comuns não viram conversas; inbox é fora do escopo atual.

## 3. Invariantes de segurança

Nenhum teste real começa antes de estas regras existirem no código e terem testes automatizados:

1. `PILOT_SEND_ENABLED=false` por padrão. Envio real exige valor explícito `true`.
2. `PILOT_RECIPIENT_E164` fica somente em secret Cloudflare.
3. A API de dispatch bloqueia se a audiência não tiver exatamente um contato ou se o telefone normalizado divergir da allowlist.
4. O Workflow repete a mesma verificação imediatamente antes de chamar a Meta. A API não é a única barreira.
5. O cliente de WhatsApp recebe o destinatário já validado e nunca faz fallback para outro número.
6. `PILOT_MAX_REAL_SENDS=3`; um ledger atômico em D1 impede ultrapassar o orçamento mesmo com concorrência/replay.
7. `throttle_mps=1` durante toda a auditoria.
8. Toda campanha real recebe prefixo `[PILOT REAL]`.
9. Nenhum token, App Secret, verify token ou número completo aparece em logs, screenshots do relatório ou Git.
10. Resultado ambíguo bloqueia a campanha e consome a tentativa do orçamento; nunca é reenviado automaticamente.

## 4. Correções obrigatórias antes do ambiente real

### G0.1 — Credenciais

- Revogar todos os tokens expostos.
- Rotacionar o App Secret.
- Criar System User/token exclusivo do SmartZap com apenas:
  - `whatsapp_business_management`;
  - `whatsapp_business_messaging`.
- Validar o token novo com `debug_token` sem imprimir seu valor.
- Não reutilizar tokens com permissões de Ads, Instagram, Pages ou Commerce.

### G0.2 — Health-check

O preflight deve exigir simultaneamente:

- App ID esperado igual a `344941004274813`.
- WABA igual a `159711717233997`.
- Phone Number ID igual a `177462062115446`.
- `status=CONNECTED`.
- `platform_type=CLOUD_API`.
- `account_mode=LIVE`.
- qualidade diferente de `RED`.
- app esperado presente em `subscribed_apps`; não basta qualquer app.
- webhook e secrets configurados.
- pelo menos um template aprovado e elegível.

### G0.3 — Templates

- Bloquear templates com variáveis `{{n}}`.
- Bloquear headers `IMAGE`, `VIDEO`, `DOCUMENT`, `GIF` e `LOCATION` até o produto modelar componentes por envio.
- Bloquear templates `REJECTED`, `PAUSED`, `DISABLED`, `FLAGGED`, `PENDING` ou qualidade `RED`.
- Para esta rodada, allowlist de templates reais:
  - `hello_world`;
  - `template_20260125_1739`.

### G0.4 — Deploy reproduzível

- Não implantar diretamente da `main` suja.
- Revisar e separar as alterações já existentes, preservando `DS/` e qualquer arquivo do usuário.
- Criar branch `codex/pilot-meta-real` após o checkpoint.
- Exigir `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run e2e` e `git diff --check` verdes.
- Adicionar E2E específico para allowlist, kill switch e orçamento de três envios usando fetch Meta simulado.

## 5. Preparação do ambiente real

Ordem obrigatória:

1. Fazer backup/export lógico do D1 remoto ou registrar bookmark de recuperação.
2. Aplicar migrations `0002`, `0003`, `0004` e a migration do ledger de piloto.
3. Instalar secrets novos na Cloudflare:
   - `WHATSAPP_TOKEN`;
   - `META_APP_SECRET`;
   - novo `META_VERIFY_TOKEN`;
   - `TURNSTILE_SECRET`;
   - `TURNSTILE_SITE_KEY`;
   - `PILOT_RECIPIENT_E164`;
   - `PILOT_SEND_ENABLED=false` inicialmente.
4. Publicar a versão aprovada.
5. Configurar no D1:
   - `whatsapp_phone_id=177462062115446`;
   - `whatsapp_waba_id=159711717233997`;
   - `throttle_mps=1`.
6. Sincronizar templates e confirmar 53 registros/52 aprovados.
7. Criar um único contato de piloto com consentimento individual e finalidade `marketing` documentados.
8. Configurar no app Meta o callback:
   - `https://smartzap-cf.thales2581.workers.dev/webhook`.
9. Validar o GET challenge com o verify token novo.
10. Assinar os campos necessários:
    - `messages`;
    - `user_preferences`;
    - `message_template_status_update`.
11. Inscrever o app correto na WABA e confirmar pelo endpoint `subscribed_apps`.
12. Conferir `/api/settings/health` autenticado.
13. Somente depois de todos os gates, definir `PILOT_SEND_ENABLED=true`.

Mudar callback, inscrever/desinscrever app na WABA, rotacionar segredo e publicar código alteram estado externo. A execução desses itens deve ser anunciada antes e registrada no relatório.

## 6. Matriz de testes

### Fase A — Automatizados, nenhum envio real

| ID | Caso | Camada | Resultado esperado |
|---|---|---|---|
| A01 | Kill switch ausente ou `false` | API + Workflow | Dispatch bloqueado antes de criar Workflow |
| A02 | Destinatário fora da allowlist | API | HTTP 403/409; zero linhas reivindicadas |
| A03 | Bypass chamando Workflow diretamente | Workflow | Bloqueio novamente; zero fetch Meta |
| A04 | Audiência com dois contatos | Domínio/API | Bloqueio; nenhuma mensagem |
| A05 | Concorrência no orçamento | D1 integração | No máximo três reservas atômicas |
| A06 | Template com `{{1}}` | Template preflight | Bloqueado |
| A07 | Header de vídeo/documento/GIF/localização | Template preflight | Bloqueado |
| A08 | Template rejeitado/pausado/RED | API + Workflow | Bloqueado |
| A09 | Número `PENDING` ou plataforma diferente de Cloud API | Health | `readyForPilot=false` |
| A10 | Outro app inscrito na WABA | Health | `readyForPilot=false` |
| A11 | Timeout ao enviar | Cliente/Workflow | Resultado ambíguo, campanha falha, nenhum retry |
| A12 | HTTP 429 estruturado | Cliente/Workflow | Retry controlado, respeitando `Retry-After` permitido |
| A13 | Crash após aceite e antes de persistir | Workflow/D1 | Linha vira `SEND_OUTCOME_UNKNOWN`; sem reenvio |
| A14 | Status duplicado | Webhook/Queue/D1 | Um único evento técnico e contador único |
| A15 | `read` antes de `delivered` | Webhook/D1 | Estado não regride |
| A16 | Erro `131050` | Webhook/consentimento | Contato `opt_out`; consentimento revogado |
| A17 | `user_preferences resume` | Webhook/consentimento | Contato `unknown`; opt-in não recriado |
| A18 | Template `PAUSED`/`DISABLED` | Webhook/templates | Estado local atualizado e dispatch bloqueado |
| A19 | Assinatura HMAC inválida | Webhook | HTTP 401, nada na Queue |
| A20 | Evento reconhecido malformado | Webhook | HTTP 400, nada confirmado silenciosamente |
| A21 | Erro de plataforma com PII | Logs/D1 | Código/trace preservados e PII redigida |
| A22 | Falha de um item do batch | Queue | Apenas esse item recebe retry |
| A23 | Sessão, CSRF e Origin | Segurança HTTP | Mutação não autenticada/cross-site bloqueada |
| A24 | Segredos em bundle/log/diff | Segurança | Nenhuma ocorrência |

### Fase B — Smoke remoto, nenhum envio real

| ID | Caso | Evidência | Gate |
|---|---|---|---|
| B01 | Deployment e versão | Version ID + timestamp | Versão nova em 100% |
| B02 | Migrations | `wrangler d1 migrations list` | Nenhuma pendente |
| B03 | Secrets | Lista apenas de nomes | Todos os obrigatórios presentes |
| B04 | Liveness | `/api/health` | HTTP 200 |
| B05 | Readiness autenticada | `/api/settings/health` | `readyForPilot=true` |
| B06 | Verify token errado | GET `/webhook` | HTTP 403 |
| B07 | Verify token correto | Challenge Meta | HTTP 200 com challenge literal |
| B08 | POST sem HMAC | `/webhook` | HTTP 401 |
| B09 | POST sintético assinado e válido | Queue + D1 | HTTP 200, evento persistido uma vez |
| B10 | WABA subscription | Graph `subscribed_apps` | App `344941004274813` presente |
| B11 | Campos de webhook | App subscription | Três campos necessários ativos |
| B12 | Template sync | D1/UI | Contagem e status conferem com Meta |
| B13 | Audiência de piloto | Preview | Exatamente um contato, número mascarado |
| B14 | Queue/DLQ | Cloudflare | Consumer ativo e DLQ vazia |

### Fase C — Três envios reais no máximo

#### C01 — Utilitário imediato

- Criar campanha `[PILOT REAL] utility-immediate`.
- Template: `hello_world`, idioma `en_US`.
- Audiência prevista: exatamente 1.
- Enviar pela UI/API do SmartZap, nunca por script direto.
- Evidências esperadas:
  - Workflow criado;
  - resposta Meta com `wamid`;
  - aceitação persistida;
  - webhook `sent`/`delivered`;
  - após o responsável abrir a mensagem, webhook `read` quando disponibilizado;
  - contadores e realtime iguais ao D1;
  - nenhuma duplicata.

Gate C01: se não houver status assíncrono no intervalo operacional de 10 minutos definido para o teste, parar a rodada e investigar webhook. Não reenviar.

#### C02 — Agendamento e controle

- Criar uma campanha agendada de `hello_world` para o mesmo contato.
- Antes do envio, executar separadamente um cenário de cancelamento com outra campanha agendada e confirmar zero mensagem/zero `wamid`.
- Na campanha válida, observar `sleepUntil`, disparo único no horário e lifecycle completo.
- Pausar/retomar somente antes de qualquer chamada Meta.

Gate C02: qualquer envio da campanha cancelada ou duas mensagens da campanha válida interrompe toda a auditoria.

#### C03 — Marketing estático

- Exigir consentimento de marketing ainda ativo.
- Template: `template_20260125_1739`, `pt_BR`, corpo estático.
- Confirmar categoria `MARKETING`, status `APPROVED` e ausência de componentes dinâmicos imediatamente antes do dispatch.
- Enviar uma vez e registrar aceite, entrega/leitura, template status e custo retornado/observável sem estimar cobrança apenas pelo HTTP 200.

Gate C03: qualidade `YELLOW`/`RED`, account alert, template pausado ou preferência `stop` bloqueiam o envio.

### Fase D — Webhook e consentimento em ambiente real/sintético

Depois dos três envios, desligar `PILOT_SEND_ENABLED` antes desta fase.

| ID | Caso | Forma | Resultado esperado |
|---|---|---|---|
| D01 | Duplicata do mesmo status | Webhook assinado sintético | Deduplicação; contador não duplica |
| D02 | Status fora de ordem | Webhook assinado sintético | Sem regressão |
| D03 | `failed` com erro técnico | Webhook assinado sintético | Código, detalhe redigido e trace persistidos |
| D04 | Opt-out `131050` | Webhook assinado sintético | Contato inelegível e consentimento revogado |
| D05 | Tentativa de campanha após opt-out | Preview/dispatch, sem envio | Audiência vazia/bloqueada |
| D06 | `resume` | Webhook assinado sintético | Estado `unknown`, ainda inelegível |
| D07 | Novo consentimento manual | UI/API | Novo evento individual; volta ao opt-in somente após ação explícita |
| D08 | Template pausado e reinstalado | Webhook sintético | Bloqueia e depois restaura estado local conforme evento |
| D09 | Evento malformado com HMAC correto | Webhook sintético | HTTP 400, sem lixo no D1 |
| D10 | HMAC inválido | Webhook sintético | HTTP 401 |

Eventos sintéticos devem usar IDs com prefixo `pilot-test-`, nunca reutilizar `wamid` real e nunca conter telefone completo no payload salvo.

## 7. Testes que não serão feitos em produção

- Timeout induzido depois do POST real à Meta.
- Derrubar Worker no instante entre aceite e persistência.
- Carga, throughput, lotes de 50 ou múltiplos destinatários.
- Poison message deliberada na Queue/DLQ real.
- Templates de mídia, localização, autenticação ou com variáveis.
- Exclusão/pausa real de template.
- Remoção de número, mudança de billing ou migração de WABA.
- Testes de mensagens recebidas como inbox: o SmartZap atual é disparador de campanhas, não CRM conversacional.
- Testes de IA: não há motor de IA no caminho atual de envio.

Esses casos ficam em testes unitários, integração com fetch stubado ou ambiente isolado.

## 8. Evidências por teste

Registrar sem segredos/PII:

- Test ID e horário UTC/São Paulo.
- Version ID do Worker.
- Campaign ID e Workflow instance ID.
- Template, idioma e categoria.
- Hash do destinatário, nunca o telefone completo.
- `wamid` técnico ou hash dele.
- HTTP status, código Graph, `fbtrace_id`, `Retry-After` quando houver.
- Estado da campanha e do `campaign_contact`.
- Eventos `sent`, `delivered`, `read` ou `failed`.
- Quantidade de mensagens na Queue/DLQ.
- Screenshot do aparelho apenas quando necessário, com dados pessoais mascarados.
- Resultado `pass`, `fail`, `blocked` ou `not-run`.

O relatório final deve reconciliar Meta, Workflow, D1, Queue, realtime e aparelho. `HTTP 200/accepted` sozinho nunca significa entrega.

## 9. Condições de parada imediata

Desligar `PILOT_SEND_ENABLED` e não executar o próximo teste se ocorrer qualquer um:

- audiência diferente de 1;
- destinatário diferente da allowlist;
- mensagem duplicada;
- resultado de envio ambíguo;
- campanha cancelada envia mensagem;
- callback retorna 5xx/timeout;
- assinatura HMAC legítima é rejeitada;
- app/WABA/Phone ID divergentes;
- número deixa `CONNECTED/CLOUD_API/LIVE`;
- qualidade `YELLOW` ou `RED`;
- template `PAUSED`, `DISABLED`, `REJECTED` ou `FLAGGED`;
- account alert/enforcement;
- DLQ recebe mensagem sem causa explicada;
- token/secret/telefone aparece em log ou bundle;
- contador D1 diverge do lifecycle Meta;
- limite de três envios é atingido.

## 10. Rollback

Ordem de contenção:

1. Definir `PILOT_SEND_ENABLED=false`.
2. Cancelar Workflows ainda não enviados.
3. Confirmar que nenhuma linha `pending/sending` permanece sem decisão.
4. Pausar a campanha na aplicação.
5. Se o webhook estiver causando erro sistêmico, desinscrever temporariamente o app da WABA mediante confirmação explícita.
6. Fazer rollback da versão do Worker se o problema for código.
7. Não tentar desfazer migrations aditivas; elas devem permanecer compatíveis com a versão anterior.
8. Revogar o token se houver suspeita de vazamento.
9. Nunca restaurar o callback morto do Supabase; o fallback seguro é deixar a WABA sem inscrição até corrigir o SmartZap.

## 11. Critérios de aprovação final

A rodada só recebe `APROVADO PARA PILOTO CONTROLADO` quando:

- todos os testes A obrigatórios estão verdes;
- todos os gates B estão verdes;
- C01, C02 e C03 produziram no máximo uma mensagem cada para o único destinatário;
- cancelamento produziu zero mensagem;
- status assíncronos reconciliaram com D1 e UI;
- duplicatas e eventos fora de ordem não corromperam contadores;
- opt-out removeu elegibilidade e resume não recriou consentimento;
- Queue terminou sem backlog inesperado e DLQ vazia;
- logs e bundle não vazaram credenciais/PII;
- `readyForPilot=true` após revalidação final;
- token e App Secret expostos foram revogados.

Mesmo aprovado, o sistema permanece com allowlist e limite de três envios até uma decisão explícita de ampliar o piloto.

## 12. Sequência operacional resumida

```text
Corrigir controles → testes locais → rotacionar credenciais → migrations → deploy
→ configurar callback → inscrever app/WABA → smoke sem envio
→ ativar kill switch → C01 → gate → C02 → gate → C03
→ desativar envios → adversarial de webhook → reconciliar evidências → relatório
```

## 13. Fontes oficiais

- Meta — Send Messages: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages
- Meta — Webhooks: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview
- Meta — Access Tokens: https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens
- Meta — Getting Opt-in: https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in
- Meta — Error Codes: https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes
- Cloudflare Workflows: https://developers.cloudflare.com/workflows/
- Cloudflare Queues: https://developers.cloudflare.com/queues/
- Cloudflare D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/
