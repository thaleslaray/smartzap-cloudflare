# Relatório final — auditoria real Meta WhatsApp

Data: 14/07/2026  
Escopo: SmartZap CF, Meta WhatsApp Cloud API, Cloudflare Worker, Workflow, Queue e D1.

## Veredito

O SmartZap está **aprovado para piloto controlado**, com transporte real da Meta,
status outbound, persistência inbound, Inbox e geração assistiva de rascunhos validados
contra os recursos reais. A IA está habilitada globalmente em produção, mas depende de
opt-in por conversa e revisão humana. Apenas um rascunho explicitamente aprovado pode
ser enviado manualmente, dentro da janela de atendimento e ao destinatário piloto.

Foi comprovado em ambiente real o ciclo:

```text
SmartZap → Workflow → Meta → aparelho
                         ↓
                 webhook assinado
                         ↓
                 Worker → Queue → D1
```

O teste real produziu `sent`, `delivered` e `read`, sem falha, com atualização
monotônica do contato e dos contadores da campanha. Uma nova mensagem inbound real
atravessou callback assinado, Queue e D1 na versão atual, criando exatamente uma
conversa e uma mensagem. Recebê-la não criou consentimento de marketing.

Sobre essa conversa real, o modelo mais barato foi testado e rejeitado por qualidade.
O modelo imediatamente seguinte passou no caso real e em cinco ataques adversariais.
Os primeiros rascunhos reais foram descartados. Na fase final, um novo rascunho do
modelo aprovado foi revisado, aprovado e enviado manualmente ao número piloto. A Meta
aceitou a mensagem e os callbacks avançaram por `sent` até `delivered`, sem falha nem
duplicação. A opção de IA da conversa voltou a ficar desativada depois do teste.

Não existe resposta automática. Aprovar e enviar são ações separadas; o envio exige
uma segunda confirmação explícita na interface.

## Evidências consolidadas

- Worker final publicado: `19629554-07b8-4dd2-90d1-f613add6d72e`.
- `/api/health`: HTTP 200 com `{ "ok": true }`.
- Callback efetivo do telefone, WABA e App apontando para o Worker.
- GET de verificação da Meta aceito.
- POSTs reais da Meta aceitos com assinatura válida e HTTP 200.
- Workflow de envio concluído com sucesso.
- Queue `meta-webhooks` consumiu os eventos sem exceção.
- Inbox persistiu em produção uma conversa e uma mensagem inbound reais, além de
  limitar tamanho/lote e deduplicar reentregas nos testes.
- D1 reconciliou `sent`, `delivered` e `read`; zero falhas no teste final.
- Eventos fora de ordem não rebaixaram o estado já alcançado.
- Retenção automática remove status antigos e mensagens inbound após 90 dias.
- Gateway de IA dedicado `smartzap`, com cache e logs desligados e limite próprio.
- IA global ligada com `@cf/meta/llama-3.2-3b-instruct`, opt-in por conversa e
  envio automático inexistente. A conversa auditada terminou com opt-in desligado.
- Um envio manual de rascunho aprovado foi aceito e materializado na Inbox; os
  callbacks reais confirmaram `sent` e `delivered`, sem erro.
- O ledger da Inbox bloqueia duplicação por rascunho e chave de idempotência, reserva
  antes do POST e usa `biz_opaque_callback_data` para recuperar resultado ambíguo.
- Duas gerações reais controladas foram registradas e descartadas; a primeira serviu
  para reprovar o modelo de 1B, e a segunda aprovou o modelo de 3B.
- Cinco gerações adversariais adicionais usaram banco local isolado e o binding remoto
  real de Workers AI; nenhuma criou mensagem outbound.
- Kill switch de envio desligado ao término.
- Nenhuma migration remota pendente.

## Validação automatizada final

- 174 testes Vitest em 21 arquivos.
- 4 jornadas Playwright E2E.
- TypeScript sem erros.
- Build de produção aprovado.
- `npm audit`: zero vulnerabilidades conhecidas.
- `git diff --check`: sem erros de whitespace.
- Teste de regressão garante que credenciais não são serializadas nos resultados das
  etapas duráveis do Workflow.
- Testes adversariais cobrem assinatura inválida, payload excessivo, schemas estritos,
  deduplicação inbound, prompt injection, idempotência de rascunho, opt-in da IA,
  limites de custo, janela de 24 horas, corrida concorrente, rejeição explícita,
  resultado ambíguo e promoção monotônica de callbacks.
- Jornadas móveis cobrem 390 px e 320 px, menu lateral, foco restaurado, modal com
  isolamento do fundo e ausência de corte horizontal.
- Vitest e Playwright usam runtime, banco e credenciais fictícias isolados em
  `config/wrangler.test.jsonc`; nenhum deles carrega o `.dev.vars` operacional.

## Incidentes encontrados e corrigidos

### Override de webhook do telefone

O telefone possuía override próprio apontando para outro callback. Como esse nível tem
precedência sobre WABA e App, os primeiros status reais não chegavam ao Worker. O
override foi corrigido e o health-check agora valida o callback efetivo, além da relação
Phone ID ↔ WABA.

### Credenciais no histórico do Workflow

A etapa `load-config` retornava o objeto de credenciais, fazendo a Cloudflare persistir
esse objeto no histórico da instância. O Workflow agora retorna somente `rate` e
`total`; as credenciais são carregadas e usadas apenas dentro da execução da etapa de
envio. Uma instância sem destinatários confirmou o novo formato em produção.

### Ingestão inbound e reentregas

O webhook agora aceita somente o subconjunto necessário do payload, limita o corpo a
1 MB e o lote a 100 mensagens, valida assinatura, WABA e telefone, e persiste cada
mensagem uma única vez. O preview da conversa não regride quando a Meta reentrega um
evento antigo.

O limite de 1 MB é aplicado durante a leitura do stream, mesmo sem `Content-Length`,
impedindo que um corpo fragmentado seja materializado inteiro antes da rejeição.

### Retenção, CSV e concorrência

A limpeza de 90 dias agora reconcilia o contador de não lidas após excluir mensagens.
O importador CSV interrompe arquivos acima de 20 mil linhas totais e rejeita arquivos
malformados ou mapeamentos inexistentes sem importação parcial. A cota da IA reserva a
tentativa antes da chamada ao provider, fechando a corrida entre gerações simultâneas.
Reservas de IA abandonadas por interrupção do Worker expiram após dez minutos, sem
repetir silenciosamente a chamada paga; uma nova tentativa explícita permanece possível.

### Integridade de status, assinatura e origem

O status `read` agora promove também `delivered` na mesma transação quando o callback
intermediário não chega, preservando `read <= delivered <= sent` sem depender do cron.
A assinatura HMAC é calculada sobre os bytes exatos e limitados do corpo antes de
qualquer decodificação UTF-8; formato e comprimento do cabeçalho também são estritos.
A validação de origem compara esquema e host, bloqueando downgrade entre HTTP e HTTPS.
O envelope do webhook limita entradas, mudanças, erros e o total agregado a 100 eventos,
sem enfileiramento parcial quando o teto é excedido.

### Recuperação do Workflow e consentimento

No piloto, uma rejeição transitória da Meta não contorna o ledger com um segundo POST
automático: a campanha para para revisão humana. Se a Meta já aceitou a mensagem e o
Worker cai antes de atualizar o contato, o `message_id` confirmado no ledger recupera
o estado sem novo envio. Antes do fechamento, os contadores são recalculados a partir
dos destinatários, eliminando a janela em que uma campanha poderia aparecer concluída
com contador atrasado.

Um evento `user_preferences=resume` isolado agora também revoga qualquer evidência
antiga ainda ativa e move o contato para `unknown`. Novo envio exige confirmação de
consentimento no painel, mesmo se o evento `stop` anterior não tiver sido recebido.

### Inicialização local e interface

O servidor local aplica migrações D1 pendentes antes de iniciar. Isso elimina o erro
500 que ocorria quando o código da Inbox era executado sobre uma base persistida sem
as tabelas novas. A interface ganhou estados explícitos de carregamento, erro e nova
tentativa, navegação móvel, cartões responsivos e modais com Escape, foco inicial,
contenção de foco e restauração ao elemento que abriu o diálogo.
O `postbuild` remove e verifica a ausência de qualquer `.dev.vars*` no artefato; tokens
de exemplo presentes no corpus documental versionado foram substituídos por marcadores.

### IA assistiva com bloqueio seguro

O motor de IA só pode gerar rascunhos quando o kill switch global e a opção da conversa
estiverem ativos. Contexto, saída, frequência e modelo são limitados. Conteúdo do
cliente é delimitado como não confiável, nenhuma ferramenta é oferecida e erros do
provider são reduzidos a códigos genéricos. O gateway dedicado não guarda logs nem
cache.

O modelo `@cf/meta/llama-3.2-1b-instruct`, apesar de ser o mais barato, foi reprovado
porque afirmou sem base que uma tarefa estava concluída. O modelo
`@cf/meta/llama-3.2-3b-instruct` foi adotado após responder de forma neutra no caso real
e bloquear cinco cenários: extração de prompt/segredo, falsa confirmação financeira,
fuga do delimitador, ação sem autorização e confirmação curta sem contexto. O prompt
foi versionado como `draft-v2`.

As chamadas ficaram dentro da franquia gratuita diária do Workers AI. Não houve
recarga, compra de créditos ou alteração de cobrança.

### Envio manual da Inbox

O envio de texto livre foi implementado conforme a janela oficial de atendimento de
24 horas. O endpoint exige rascunho aprovado, origem igual à mensagem inbound mais
recente, opção de IA ativa na conversa, número remetente coerente, destinatário piloto,
confirmação literal e cota diária de no máximo três tentativas.

A reserva é persistida antes do POST. Resposta de rede ambígua bloqueia qualquer retry
automático; um callback posterior pode recuperar a aceitação pelo identificador opaco.
Os estados `accepted`, `sent`, `delivered`, `read` e `failed` aparecem na Inbox, e
`read` promove também `delivered` quando a Meta omite o callback intermediário.

O teste real final gerou um rascunho com o modelo 3B, registrou aprovação humana,
executou um único POST e recebeu `sent` e `delivered`. O D1 contém uma única mensagem
outbound correspondente e nenhum erro para essa tentativa.

## Estado das travas

- Destinatário único mantido em secret.
- Templates reais limitados à allowlist.
- Throttle de 1 mensagem por segundo durante a auditoria.
- Kill switch de campanhas atualmente desligado; envio manual da Inbox ativo somente
  para o destinatário protegido e sempre dependente de confirmação.
- O ledger preserva cinco tentativas reais legadas. O orçamento agora é isolado por
  rodada explícita, com no máximo três tentativas por rodada e somente uma rodada ativa.
  O histórico não precisa ser apagado para liberar uma rodada futura.

## Decisões explícitas do responsável

- As credenciais atuais são chaves de teste e serão mantidas; nenhuma rotação ou
  revogação foi executada nesta etapa.
- Turnstile permanece adiado e `TURNSTILE_ENABLED=false`.
- O uso controlado de Workers AI foi autorizado. Nenhuma recarga, ativação de cobrança
  ou alteração de credencial foi necessária.

## Próxima fase

1. Usar a Inbox para ativar IA apenas nas conversas em que um operador desejar apoio.
2. Revisar, aprovar ou descartar cada rascunho; quando aprovado, confirmar o envio em
   uma ação separada e acompanhar o status na própria conversa.
3. Manter qualquer envio real restrito ao destinatário e ao orçamento do piloto.
4. Monitorar consumo de Workers AI; os limites atuais são 20 rascunhos por conversa
   por hora e 200 por dia, muito abaixo da franquia diária no perfil medido.
