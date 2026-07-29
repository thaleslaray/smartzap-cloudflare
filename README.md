# SmartZap CF

Automação de campanhas WhatsApp pela API oficial da Meta, executada em Cloudflare Workers.

O app cobre contatos com consentimento, importação CSV, sincronização de templates,
estimativa e envio de campanhas, webhook de status, dashboard, configurações e Inbox
de mensagens recebidas. A IA oferece rascunhos assistivos revisáveis e, quando o
piloto está explicitamente habilitado, automação controlada pela Inbox com agente,
base de conhecimento, handoff e kill switch global.

## Pré-requisitos de produção

- Node.js 22 e uma sessão autenticada do Wrangler.
- Conta WhatsApp Business com `Phone Number ID` e `WABA ID`.
- App Meta com System User token, App Secret e webhook habilitado.
- Turnstile opcional; habilite somente quando houver widget configurado.
- Créditos e autenticação válidos no AI Gateway da Cloudflare são necessários somente
  para habilitar os rascunhos de IA.

## Provisionamento

Os nomes abaixo precisam coincidir com os bindings de `wrangler.jsonc`:

```sh
npx wrangler d1 create smartzap
npx wrangler r2 bucket create smartzap-media
npx wrangler queues create meta-webhooks
npx wrangler queues create meta-webhooks-dlq
```

Depois de criar o D1, confirme o `database_id` em `wrangler.jsonc`. Durable Objects e
Workflow são publicados pelo próprio deploy; este projeto não usa KV. O binding `AI`
usa o gateway dedicado `smartzap`, com logs e cache desligados, e faturamento unificado,
sem chave de provedor externo no Worker.

Configure todos os valores exigidos antes do primeiro deploy:

```sh
npx wrangler secret put MASTER_PASSWORD
npx wrangler secret put SMARTZAP_API_KEY
npx wrangler secret put META_APP_SECRET
npx wrangler secret put META_VERIFY_TOKEN
npx wrangler secret put WHATSAPP_TOKEN
npx wrangler secret put PILOT_SEND_ENABLED
npx wrangler secret put PILOT_RECIPIENT_E164
```

`META_VERIFY_TOKEN` é um valor criado por você e informado também no painel da Meta.
Ele é diferente de `META_APP_SECRET`, usado para validar a assinatura HMAC. Embora
Turnstile fica desativado enquanto `TURNSTILE_ENABLED=false`. Para habilitá-lo, mude
a flag para `true` e instale `TURNSTILE_SECRET` e `TURNSTILE_SITE_KEY`; com a flag
ativa e configuração incompleta, o login falha fechado.
Durante a preparação use `PILOT_SEND_ENABLED=false`. O destinatário autorizado fica
somente em `PILOT_RECIPIENT_E164`; nunca grave o número completo no repositório.

Mantenha `AI_ENABLED=false` até uma sondagem do AI Gateway retornar sucesso e existirem
créditos e limite de gasto configurados na conta. Ativar essa flag não habilita envio
por si só: a automação também exige `INBOX_AUTOMATION_ENABLED=true`, Atendimento IA
global ligado, conversa aberta em modo IA, agente ativo, documentos vinculados,
destinatário permitido no piloto e janela Meta válida. O modo assistivo continua
gerando rascunhos para revisão humana.

As vars versionadas fixam o App ID, Phone Number ID, WABA, teto global de três
tentativas e a allowlist de templates desta auditoria. Em produção, valores do D1 que
divergirem desses ativos bloqueiam o carregamento das credenciais.

## Migração, validação e deploy

As migrações devem ser aplicadas antes de publicar o código que depende delas:

```sh
npx wrangler d1 migrations apply smartzap --remote
npm test
npx tsc --noEmit
npm run build
npm run deploy
```

O bloco `secrets.required` de `wrangler.jsonc` interrompe o deploy se algum valor
obrigatório estiver ausente. O login de produção também falha de forma fechada se o
Turnstile não estiver completamente configurado.

No painel do app Meta, configure:

- URL de callback: `https://SEU-DOMINIO/webhook`.
- Token de verificação: exatamente o valor de `META_VERIFY_TOKEN`.
- Graph API: `v25.0` (binding `META_GRAPH_VERSION`; altere somente com teste de contrato).
- Campos assinados: `messages`, `user_preferences` e `message_template_status_update`.
- Confirme que o app aparece em `WABA_ID/subscribed_apps`; o health-check valida essa
  assinatura ao vivo e não considera apenas a presença dos secrets.

No SmartZap, abra **Configurações** e informe apenas `Phone Number ID`, `WABA ID` e o
throttle desejado. O token oficial permanece exclusivamente no secret
`WHATSAPP_TOKEN`. Em seguida, sincronize os templates aprovados pela Meta.

## Checklist do piloto

- [ ] `GET https://SEU-DOMINIO/api/health` retorna `{ "ok": true }`.
- [ ] A tela Configurações indica Meta, webhook e banco prontos.
- [ ] A verificação GET do webhook é aceita pela Meta.
- [ ] A tela confirma que existe app inscrito nos webhooks da WABA.
- [ ] A tela confirma `CONNECTED`, `CLOUD_API`, `LIVE` e o App ID esperado.
- [ ] Kill switch desligado durante a preparação; allowlist de destinatário e ledger validados.
- [ ] Um evento assinado da Meta é aceito e um evento com assinatura inválida é rejeitado.
- [ ] Um CSV pequeno importa somente após a declaração de opt-in.
- [ ] Uma campanha pequena mostra audiência e custo antes de permitir o disparo.
- [ ] Pausar, retomar e cancelar uma campanha de teste respeitam o estado exibido.
- [ ] Status `sent`, `delivered`, `read` e falha aparecem sem regressão de estado.
- [ ] `user_preferences=stop` retira o contato da audiência e revoga o consentimento ativo.
- [ ] Template pausado/desativado bloqueia a campanha antes de percorrer a audiência.
- [ ] Inbox persiste mensagens inbound, deduplica pelo ID Meta e não concede opt-in.
- [ ] IA assistiva gera somente rascunhos revisáveis; a automação autônoma só é exercitada
      em conversa de piloto explicitamente autorizada e com todas as travas registradas.

Nesta auditoria, cada campanha real deve começar com `[PILOT REAL]`, conter exatamente
o destinatário autorizado e usar um template da allowlist. O Workflow força 1 msg/s e
o ledger conta aceites, rejeições e resultados ambíguos no mesmo teto de três tentativas.
A estimativa não faz chamadas à Meta e é a simulação segura do funil; o botão
**Disparar agora** inicia envios reais somente quando o kill switch estiver habilitado.

O rate limiter nativo do login atua por localidade da Cloudflare, não como um contador
global. Se o Turnstile for habilitado para uma implantação, a configuração incompleta
bloqueia o login em vez de degradar silenciosamente.

## Desenvolvimento e testes

```sh
cp .dev.vars.example .dev.vars
npm install
npm run dev
```

Validações disponíveis:

```sh
npm test
npx tsc --noEmit
npm run build
npm run e2e
```

O servidor local aplica migrações pendentes automaticamente antes de iniciar. Vitest
e E2E usam `config/wrangler.test.jsonc`, sem carregar o `.dev.vars` real. O E2E mantém
um D1 isolado em `.wrangler/e2e-state`, aplica as migrações e insere um template
aprovado de teste automaticamente. Ele simula login, importação com
consentimento e estimativa de campanha. Ao confirmar, o seed sem Phone ID prova que o
preflight bloqueia a operação antes de criar Workflow ou chamar a Meta.

Turnstile é controlado por feature flag. Quando desabilitado, o login continua
protegido pela senha mestra, rate limiter e política de mesma origem. Quando habilitado,
a ausência de `TURNSTILE_SECRET` ou `TURNSTILE_SITE_KEY` bloqueia o login.

## Workflows e PostgreSQL

Os workflows operacionais são executados pela Queue `AUTOMATION_QUEUE`, com ledger
por etapa e retomada durável. A ação **Database Query** preserva o contrato PostgreSQL
do SmartZap original por meio de um binding Cloudflare Hyperdrive chamado
`HYPERDRIVE`. Sem esse binding, a etapa falha explicitamente e nenhuma execução SQL é
simulada no D1.

Depois de criar a configuração Hyperdrive para o PostgreSQL de destino, adicione o ID
ao `wrangler.jsonc`:

```json
"hyperdrive": [
  { "binding": "HYPERDRIVE", "id": "ID_DA_CONFIGURACAO" }
]
```

No desenvolvimento local, defina a conexão fora do repositório:

```sh
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgres://..."
```

Consultas têm timeout de 15 segundos; a saída persistida é limitada a 1.000 linhas.
Uma etapa cujo resultado remoto ficou incerto não é repetida automaticamente.

## IA

A IA é fail-closed e possui dois caminhos explícitos:

- `AI_ENABLED` é o kill switch global e nasce desligado;
- cada conversa nasce com IA desligada e exige ativação explícita do operador;
- o contexto é limitado a mensagens de texto, sem telefone ou nome no prompt;
- conteúdo do cliente é tratado como não confiável e não há ferramentas disponíveis;
- cache e persistência do conteúdo nos logs do AI Gateway ficam desligados;
- há limites por conversa/hora e globais/dia;
- no modo assistivo, toda saída vira `pending_review` e exige revisão humana;
- no modo de automação controlada, a saída é aprovada automaticamente somente depois
  das revalidações de conversa, agente, base, limites, destinatário e kill switch;
  o envio continua sujeito ao ledger idempotente e ao piloto autorizado;
- erros do provider são reduzidos a códigos técnicos e não persistem mensagens sensíveis.

O único provedor configurado é o Workers AI, via binding `AI` e AI Gateway, usando
`@cf/meta/llama-3.2-3b-instruct` nos testes e no piloto. Se créditos, modelo ou binding
estiverem indisponíveis, a API retorna indisponibilidade e não cria resposta parcial
nem tenta outro provedor.
