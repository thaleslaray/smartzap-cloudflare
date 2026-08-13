# Acesso Meta e App Review — Conversões Click-to-WhatsApp

Atualizado em 06/08/2026. Este documento separa a homologação direta da WABA
própria de uma futura operação como parceiro, sem armazenar credenciais,
tokens, telefones completos ou identificadores pessoais.

## Decisão para a implantação atual

O SmartZap acessa somente a WABA da própria empresa. A página oficial viva de
App Review da Meta afirma que **Direct Developers usando a API para si mesmos
não precisam de Advanced Access nem de App Review**. Portanto, nesta primeira
versão:

- não será submetida uma revisão desnecessária;
- os dois escopos técnicos continuam obrigatórios no System User token;
- o Marketing API Access Tier continua em Full access;
- o Dataset, o `ctwa_clid` real e o canário aceito continuam obrigatórios;
- operar WABAs de clientes permanece fora do escopo e reabre este documento.

## Aplicativo e finalidade

- Aplicativo: **Escola de Automação** (`344941004274813`).
- Produto: SmartZap, integração própria com WhatsApp Cloud API.
- App Review na implantação atual: **não aplicável — Direct Developer/WABA própria**.
- Permissão a solicitar se o produto operar WABAs de clientes:
  `whatsapp_business_manage_events`.
- Escopo técnico adicional do token: `whatsapp_business_management`.
- Recurso já confirmado no painel: `Marketing API Access Tier — Full access`.
- Finalidade: registrar resultados comerciais ocorridos dentro de conversas
  iniciadas por anúncios Click-to-WhatsApp e enviá-los ao Dataset associado à
  WABA pela Conversions API for Business Messaging.

O SmartZap não usa essas permissões para ler ou alterar campanhas, analisar
conteúdo da conversa ou criar audiência. `whatsapp_business_management` é
usada para confirmar a WABA própria e o Dataset associado;
`whatsapp_business_manage_events` é usada para entregar os eventos ao Dataset.

## Texto sugerido para uma futura solicitação como parceiro

### English

> SmartZap is an internal customer communication application integrated with
> the WhatsApp Cloud API. When a person initiates a WhatsApp conversation from
> a Click-to-WhatsApp ad, SmartZap securely stores the referral `ctwa_clid` and
> associates it with that conversation. An authorized administrator can later
> record one of three outcomes that occurred in the same conversation:
> `LeadSubmitted`, `QualifiedLead`, or `Purchase`. SmartZap sends that event to
> the Dataset associated with the WhatsApp Business Account through the
> Conversions API for Business Messaging. We use the
> `whatsapp_business_management` scope solely to verify our own WhatsApp
> Business Account and its associated Dataset. We request advanced access to
> `whatsapp_business_manage_events` solely to deliver conversion events to
> that Dataset. We do not send message text, media, phone numbers, email
> addresses, or conversation transcripts to Meta through this integration.
> Events are idempotent, auditable, and disabled until the Dataset,
> permissions, and a controlled real event have been verified.

### Português de apoio

> O SmartZap é uma aplicação interna de atendimento integrada à WhatsApp Cloud
> API. Quando uma pessoa inicia uma conversa por um anúncio Click-to-WhatsApp,
> o SmartZap armazena com segurança o `ctwa_clid` do referral e o associa à
> conversa. Um administrador autorizado pode registrar `LeadSubmitted`,
> `QualifiedLead` ou `Purchase` quando esse resultado ocorre no mesmo fio de
> conversa. O evento é enviado ao Dataset associado à WABA pela Conversions
> API for Business Messaging. A permissão não é usada para conteúdo de
> mensagens, mídia, telefone, email ou transcrição.

## Passos para o revisor, somente no modo parceiro

1. Acessar o SmartZap com a credencial temporária fornecida no formulário da
   Meta; não registrar a senha neste arquivo.
2. Abrir **Configurações → Diagnóstico Meta**.
3. Localizar o cartão **Conversões de anúncios**.
4. Confirmar que o aplicativo verifica conexão, escopos e Dataset antes de
   permitir qualquer envio.
5. Abrir uma conversa identificada como **Origem: anúncio
   Click-to-WhatsApp** na Inbox.
6. Abrir **Contexto e memória** e observar que o identificador do clique está
   mascarado.
7. Usar uma ação de conversão autorizada: **Registrar lead**, **Qualificar** ou
   **Registrar compra**.
8. Para compra, preencher valor e moeda. O SmartZap recusa compra sem esses
   campos.
9. Confirmar o registro e abrir **Conversões de anúncios** no menu analítico.
10. Conferir a separação entre **Registrado pelo SmartZap**, **Aceito pela
    Meta**, **Matched pela Meta** e **Atribuído pela Meta**.

O ambiente de revisão deve conter uma conversa CTWA sintética ou autorizada e
um Dataset de teste controlado. Nenhum evento deve ser enviado antes de a Meta
conceder a permissão solicitada.

## Roteiro do screencast, somente no modo parceiro

O vídeo deve ter entre dois e quatro minutos, sem console, DevTools, tokens ou
telefones completos.

1. Mostrar o nome e a URL do SmartZap.
2. Abrir **Diagnóstico Meta** e mostrar:
   - Cloud API conectada;
   - Dataset verificado;
   - integração desativada enquanto os requisitos estão incompletos.
3. Abrir uma conversa CTWA e mostrar o badge de origem do anúncio.
4. Mostrar o click ID mascarado.
5. Registrar um `LeadSubmitted` controlado.
6. Abrir `/analytics/conversions` e mostrar o evento registrado e seu estado de
   entrega.
7. Explicar verbalmente que texto, mídia, telefone e email não são enviados à
   CAPI.
8. Mostrar que um clique repetido ou retry não cria um segundo fato comercial.
9. Encerrar mostrando onde o evento é conferido no Events Manager do Dataset.

## Evidências técnicas disponíveis

- Webhook assinado captura `messages[].referral.ctwa_clid` antes do roteamento.
- O click ID fica restrito ao banco operacional e é mascarado em todas as
  respostas de interface; o valor integral só é lido pelo entregador CAPI.
- Eventos suportados na primeira versão: `LeadSubmitted`, `QualifiedLead` e
  `Purchase`.
- `Purchase` exige valor e moeda.
- Eventos com mais de sete dias são rejeitados.
- Outbox transacional, Queue dedicada, retry classificado e DLQ.
- ID estável e unicidade local impedem duplicação.
- Timeout posterior ao envio vira resultado desconhecido; compras não são
  reenviadas cegamente.
- A ativação exige Dataset verificado e canário real aceito.
- A produção permanece com `capi_enabled=false` até a homologação.

## Minimização e privacidade

Dados enviados no evento:

- `event_name`;
- `event_time`;
- `action_source=business_messaging`;
- `messaging_channel=whatsapp`;
- WABA;
- `ctwa_clid` sem hash;
- valor e moeda somente para `Purchase`.

Dados não enviados:

- texto ou transcrição;
- imagem, áudio, vídeo ou documento;
- telefone ou email;
- nome do contato;
- prompt, resposta de IA ou notas do atendente.

## Checklist da implantação direta atual

- [x] App correto e modo Ao vivo confirmados.
- [x] Marketing API Access Tier em Full access.
- [x] Dataset associado à WABA e verificado.
- [x] Token contém os escopos técnicos necessários.
- [x] Integração implementada de forma fail-closed.
- [x] Produção publicada com o recurso desligado.
- [x] Modelo de operação confirmado como Direct Developer/WABA própria.
- [x] App Review e Advanced Access classificados como não aplicáveis ao modo
  direto segundo a página oficial viva.
- [x] Política de Privacidade pública e específica publicada em
  `https://smartzap-cf.thales2581.workers.dev/privacy`.
- [ ] Campo de Política de Privacidade do app Meta atualizado para essa URL.
  Em 06/08/2026 ele ainda apontava somente para a homepage
  `https://escoladeautomacao.com.br/`.
- [x] Instruções públicas de exclusão publicadas em
  `https://smartzap-cf.thales2581.workers.dev/data-deletion`.
- [ ] Campo de exclusão de dados do app Meta atualizado para essa URL. Em
  06/08/2026 ele ainda estava vazio.
- [ ] Conversa CTWA real autorizada capturada com `ctwa_clid` dos últimos sete dias.
- [ ] Canário `LeadSubmitted` aceito com `events_received=1`.
- [ ] `QualifiedLead` e `Purchase` reais confirmados no Dataset.

## Estado real do painel em 06/08/2026

- `Marketing API Access Tier`: **Full access granted**.
- `whatsapp_business_management`: **Standard access**, suficiente para a WABA
  própria nesta primeira versão; operar WABAs de terceiros continua fora do
  escopo e exigiria acesso avançado.
- `whatsapp_business_manage_events`: **Standard access**, suficiente para o
  modo direto quando o token da própria empresa contém o escopo; Advanced
  Access passa a ser necessário se outras empresas usarem o aplicativo.
- Empresa e acesso como provedora de tecnologia: verificados.
- A interface não expôs ação de acesso avançado na linha de
  `whatsapp_business_management`, consistente com o uso direto da WABA própria.
- Nenhuma solicitação foi submetida porque ela não é requisito da implantação
  direta atual. Nenhuma configuração externa foi alterada durante esta inspeção.

## Homologação direta após a confirmação no SmartZap

1. Confirmar no SmartZap que a integração acessa somente a WABA própria.
2. Confirmar o System User token com as permissões necessárias,
   sem expô-lo em logs.
3. Reexecutar o diagnóstico remoto.
4. Gerar um clique CTWA real no número autorizado terminado em `9966`.
5. Executar o canário `LeadSubmitted`.
6. Confirmar `events_received=1` e o evento no Events Manager.
7. Exercitar `QualifiedLead` e `Purchase` sem duplicidade.
8. Ativar primeiro para administradores e monitorar fila, DLQ e atribuição.

Se o SmartZap passar a operar WABAs de clientes, interromper a ativação para
essas contas, solicitar Advanced Access, preparar descrições e gravações
separadas por permissão e somente então concluir o App Review.

## Referências oficiais

- https://developers.facebook.com/documentation/ads-commerce/conversions-api/business-messaging
- https://developers.facebook.com/docs/permissions#whatsapp_business_manage_events
- https://developers.facebook.com/documentation/business-messaging/whatsapp/permissions
- https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review
- https://developers.facebook.com/docs/features-reference#marketing-api-access-tier
