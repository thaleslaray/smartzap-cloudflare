# Auditoria adversarial e estabilização — SmartZap CF

> **Registro histórico, superado em 14/07/2026.** O estado remoto, a contagem de
> testes e a ausência de Inbox/IA descritos abaixo não representam o runtime atual.
> Consulte `relatorio-final-auditoria-real-meta-2026-07-14.md` antes de operar.

Data: 13 de julho de 2026

## Veredito

O código do MVP está em estado de **release candidate para piloto controlado**. A
produção atualmente publicada ainda **não está pronta para o piloto**, porque o Worker
remoto não possui quatro configurações obrigatórias e o D1 remoto tem duas migrações
pendentes.

O escopo estabilizado é: autenticação administrativa, contatos e importação CSV com
consentimento, sincronização de templates, estimativa e envio de campanhas, webhook de
status, dashboard e configurações. Inbox, Flows e IA não pertencem ao MVP congelado.

## Falhas adversariais corrigidas

### Envio e Workflows

- Duplo disparo concorrente agora reivindica a campanha atomicamente no D1.
- O ID do Workflow é determinístico e persistido antes da criação da instância.
- Resposta ambígua de criação é reconciliada com o estado real do Workflow.
- Falha terminal do Workflow marca contatos inacabados e a campanha como falha.
- Claims concorrentes de destinatários retornam lotes disjuntos.
- Pause e resume compensam a mudança no Workflow se a persistência D1 falhar.
- Cancelamento é uma transição condicional terminal e não pode ser sobrescrito por
  pause ou resume concorrente que tenha lido um estado antigo.
- Erros transitórios são repetidos; erros críticos encerram o lote sem deixar pendências.
- Templates com variáveis são bloqueados até existir modelagem por destinatário.
- Credenciais Meta são validadas antes de reivindicar a campanha.

### Status, fila e contadores

- Cada mensagem da Queue recebe `ack` ou `retry` individual com backoff.
- Eventos de status são deduplicados por mensagem e status e expiram após 90 dias.
- Status atrasado não rebaixa `delivered` ou `read` para um estado anterior.
- Mudança do destinatário e contador da campanha agora são uma única transação D1.
- Um cron reconcilia contadores como rede de segurança e remove dados expirados.

### Consentimento e contatos

- Cadastro manual, importação e reativação exigem declaração explícita de opt-in.
- Contato opt-in e evidência de consentimento são gravados na mesma transação.
- Testes forçam falha da evidência e confirmam rollback nos três caminhos.
- Duplicatas não geram uma segunda evidência de consentimento.
- Importação tem teto de 20 mil contatos válidos e 5 MB por requisição.
- Paginação, telefones, nomes, mapeamentos e listas de IDs têm limites de fronteira.

### Autenticação e segredos

- Sessões revogáveis ficam no D1 com apenas o hash do token.
- Mutações autenticadas por cookie exigem mesma origem.
- Turnstile falha fechado em produção, valida `action=login` e hostname e tem timeout.
- Falhas do Siteverify geram logs estruturados sem expor token.
- Todos os sete valores operacionais são obrigatórios no deploy.
- O token WhatsApp existe apenas como secret do Worker; o valor legado no D1 é removido.

### Integração Meta

- Sincronização percorre todas as páginas e remove templates que não existem mais.
- Um lock impede duas sincronizações simultâneas.
- Chamadas têm timeout de 15 segundos.
- A paginação é limitada a 100 páginas e não pode redirecionar o token para outra origem.
- Apenas os quatro status oficiais usados pelo app entram na Queue.
- O custo acumulado é rotulado como estimativa pela tarifa de lista; o app não o chama
  mais de custo real, pois níveis de volume e janelas gratuitas alteram a fatura.

## Como simular sem enviar mensagens

Execute `npm run e2e`. O roteiro usa um D1 local isolado, aplica migrações, insere um
template aprovado fictício e percorre:

1. login;
2. dashboard;
3. importação de um contato com declaração de opt-in;
4. criação de campanha;
5. cálculo de audiência e custo;
6. tentativa de confirmação com o Phone ID deliberadamente ausente;
7. bloqueio no preflight antes de criar Workflow ou chamar a Meta.

A estimativa é a simulação segura: ela não chama a Meta. O E2E também comprova a
mensagem de erro do preflight em ambiente incapaz de enviar. Em produção configurada,
clicar em **Disparar agora** inicia mensagens reais e só deve ocorrer com uma lista interna.

## Evidências de validação

- 16 arquivos e 87 testes Vitest aprovados.
- 2 jornadas Playwright aprovadas.
- O Playwright passou a ser gate obrigatório antes das migrações e do deploy na CI.
- TypeScript sem erros.
- Build de produção aprovado.
- Dry-run do deploy aprovado com D1, R2, Queue, Workflow, Durable Objects e rate limit.
- Auditoria npm: zero vulnerabilidades conhecidas.
- `git diff --check`: sem erros de whitespace.

O plugin Cloudflare pode gerar `dist/smartzap_cf/.dev.vars` durante a compilação para
preview local. O gate `postbuild` agora remove essa cópia e falha se qualquer arquivo
`.dev.vars*` permanecer em `dist`, impedindo que credenciais locais entrem no artefato.

## Estado remoto observado em 13/07/2026

Secrets presentes:

- `MASTER_PASSWORD`
- `META_VERIFY_TOKEN`
- `SMARTZAP_API_KEY`

Secrets/configurações ausentes:

- `META_APP_SECRET`
- `WHATSAPP_TOKEN`
- `TURNSTILE_SECRET`
- `TURNSTILE_SITE_KEY`

Migrações D1 pendentes:

- `0002_sessions.sql`
- `0003_status_events_retention.sql`

Nenhuma alteração remota, migração ou deploy foi executado durante a auditoria.

## Ordem segura para ativação

1. Configurar os quatro valores ausentes.
2. Aplicar as migrações remotas.
3. Executar `npm run deploy`, que recompila antes de chamar o Wrangler.
4. Confirmar `/api/health`, login com Turnstile e health da tela Configurações.
5. Sincronizar templates.
6. Rodar estimativa com uma lista interna.
7. Disparar para poucos números controlados e observar `sent`, `delivered` e `read`.
8. Só então abrir o piloto.

## Riscos residuais aceitos para o piloto

- Entrega é at-least-once: um crash raro entre a aceitação da Meta e a persistência do
  `message_id` pode repetir uma mensagem. O código recupera os demais estados.
- O hub realtime é singleton. É adequado ao single-tenant/piloto, mas deve ser
  particionado antes de escala multi-tenant relevante.
- O rate limiter nativo do login é distribuído por localidade Cloudflare, não global;
  Turnstile e senha continuam sendo camadas obrigatórias.
- Cancelar durante um batch já iniciado não recupera mensagens aceitas pela Meta.
- Ainda falta o teste real de ponta a ponta com uma conta Meta e números controlados.

## IA

Não existe execução de IA no runtime deste MVP. Documentos antigos sobre Gemini,
OpenAI, Mem0, Inbox ou Flows são referências de ondas futuras, não funcionalidades
entregues. A próxima fase de IA só deve começar depois do piloto Meta comprovar o fluxo
determinístico de consentimento, custo, envio, webhook e reconciliação.

## Fontes Cloudflare e fórum

A revisão foi confrontada com as regras atuais de D1 batch transacional, Workflows,
Turnstile, secrets obrigatórios, Queue e Durable Objects. O fact-check independente
confirmou os achados de maior severidade, que foram corrigidos nesta rodada.

A busca no fórum da Cloudflare não retornou evidência aplicável e verificável para
alterar as conclusões; portanto, nenhuma afirmação desta auditoria dependeu de relato
anedótico do fórum.
