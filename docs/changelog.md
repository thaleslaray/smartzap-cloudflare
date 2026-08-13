# Changelog (Dev)

## 26/01/2026
- Wizard: evita abort do provision no StrictMode e mantem stream ativo.
# Changelog (Dev)

## 25/01/2026
- Ajuste do installer: pooler shared como primario e conexao direta como fallback.
- Protecao extra nas migrations para erros de resolucao/DNS e fallback seguro.
- Correcoes de UX: cleanup de SSE, clamp de progresso e validacoes no wizard.
- Storage skip condicionado via SMARTZAP_SKIP_STORAGE para reduzir tempo no provision.
- Installer: storage wait agora so ocorre com SMARTZAP_WAIT_STORAGE=true.
- Installer: endpoint /api/installer/run para fallback sem SSE.
- Installer: rollback do INSTALLER_ENABLED se o redeploy falhar.
- Provision: pooler agora usa usuario postgres quando dbPass existe (evita permission denied).
- Provision: heartbeat de progresso durante criacao do projeto Supabase.
# Changelog

## 15/01/2026

### Corrigido
- **Espaços na mensagem de confirmação**: O editor agora preserva espaços digitados em título/rodapé; `trim()` ficou apenas para detectar campo vazio.
- **Espaços nos rótulos do resumo**: Os rótulos customizados do resumo agora preservam espaços digitados; só usam `trim()` para validação de vazio.
- **Edição de serviços sem perder foco**: A lista de serviços usa chave estável para não perder o foco ao editar o id/título.
- **Opções com espaços/underscore**: O campo de ID das opções não normaliza mais a cada tecla, preservando espaços e “_” durante a edição.
- **Texto do botão com espaços**: O label do CTA agora preserva espaços digitados; `trim()` fica só para detectar vazio.
- **CTA sem trim no normalize**: `normalizeAction` não remove mais espaços do `label` do botão.
- **Confirmação sem duplicação**: Quando o template já retorna a mensagem completa, o webhook não reempilha os campos do resumo.
- **Confirmação respeita tela Finalizar**: O webhook usa `confirmation_*` do Flow JSON para montar o texto conforme a seleção do usuário.
- **Fallback de confirmação por nome**: Quando o flow_token não chega no webhook, o Flow JSON é buscado pelo nome do flow para aplicar a confirmação.
- **Fallback por message_id**: O envio agora grava `flow_token` em `flow_submissions` e o webhook recupera por `message_id` quando a Meta não envia token.
- **Diagnóstico do envio**: Loga erro do `flow_submissions` quando o seed falha para destravar a confirmação.
- **Seed de submissões para teste**: Salva `response_json_raw` mínimo ao enviar, evitando falha de NOT NULL.
- **Fallback por telefone**: Quando não há `flow_token`, o webhook tenta o último envio por `from_phone`.
- **Flow JSON carregado no lookup**: Busca `flow_json` junto do flow para aplicar confirmação corretamente.
- **Confirmação via spec**: Se o Flow JSON não tiver `confirmation_*`, usa a configuração salva no `spec`.
- **Leitura direta do spec**: O webhook aplica `confirmation_*` do `spec` mesmo quando o Flow JSON está incompleto.
- **Prioridade do token**: Webhook usa `meta_flow_id` do token para lookup quando há divergência com o `flow_id`.
- **Webhook estável**: Corrigida falha do `isPlainObject` no parser do `spec` da confirmação.
- **Confirmação com data**: Fallback de `selected_date` usando chave de data no payload e rótulos customizados no resumo.
- **Quebras de linha na confirmação**: Espaço entre título, resumo e rodapé no WhatsApp.
- **Acentos no template**: Textos do agendamento dinâmico com acentuação correta.
- **Acentos no fluxo de agendamento**: Ajustes em textos de horário e observações.

## 17/01/2026

### Corrigido
- **Serviços do flow de agendamento não apareciam**: Os serviços (Tipo de Atendimento) não eram carregados porque estavam apenas em `flow_json.__example__`, mas o código tentava ler de `spec.dynamicFlow.services`. Agora o sistema extrai serviços de ambos os locais: spec E flow_json.
- **Sincronização de serviços na criação do flow**: Quando um flow de agendamento é criado a partir do template, os serviços agora são automaticamente salvos em `settingsDb.booking_services` para que o endpoint possa carregá-los.
- **Envio de Flow dinâmico no teste (Meta)**: Removido `flow_action_payload` quando `flow_action` é `data_exchange`, conforme exigência da Meta (erro 131009).
- **Mensagem de confirmação centralizada no template**: Removidos `confirmationTitle` e `confirmationFooter` das configurações de agendamento e a confirmação passa a usar o texto do template (`confirmation_title` no payload do Flow).
- **Detecção automática de ngrok no publish**: Ao publicar um flow dinâmico em ambiente de dev, o sistema agora detecta automaticamente se há um túnel ngrok ativo e usa essa URL como `endpoint_uri` para a Meta, em vez de usar a URL de produção salva no banco.
- **Build errors corrigidos**: Corrigidos 6 erros de TypeScript que impediam o build (duplex typing, FlowTemplateDTO.isDynamic, onClick handler, Zod error.issues, screenInfo typing, handleBack arguments). (docs)

## 17/01/2026 - Validação Zod para serviços de agendamento

- **✅ Schemas Zod para validação de serviços**
  - `lib/dynamic-flow.ts` - adicionado `BookingServiceSchema` e `BookingServicesArraySchema`
  - Função `validateBookingServices()` para validação tipada
  - `normalizeServices()` agora usa Zod com fallback manual
  - Logs de warning quando serviços inválidos são detectados
- **🔍 Instrumentação da sincronização de serviços**
  - `app/api/flows/[id]/route.ts` - logs para rastrear quando serviços são salvos no settingsDb

## 17/01/2026 - Fix payload do complete action em telas terminais

- **🔧 Complete action usa apenas campos da própria tela**
  - `lib/dynamic-flow.ts` - `generateDynamicFlowJson` agora usa `screenFieldNames` (campos da tela atual) ao invés de `allFieldNames` (todos os campos de todas as telas)
  - Corrige erro "Missing Form component ${form.*} for screen 'SUCCESS'" ao publicar flows dinâmicos

## 17/01/2026 - Fix publicação Flow com propriedades customizadas

- **🔧 stripEditorMetadata remove todas as propriedades `__*`**
  - `app/api/flows/[id]/meta/publish/route.ts` - agora remove qualquer chave `__*` exceto `__example__`
  - Corrige erro 139001 "Erro ao processar o WELJ" ao publicar flows com `__editor_label`

## 15/01/2026 - Campo de erro com label explicativo

- **📝 Mensagem de erro visível e editável no editor**
  - `lib/flow-templates-dynamic.ts` - `error_message` agora tem `__example__` com texto padrão
  - `lib/dynamic-flow.ts` - TextCaption de erro inclui `__editor_label` explicativo
  - `UnifiedFlowEditor.tsx` - usa `__editor_label` quando disponível em blocos de texto

## 15/01/2026 - Remoção de texto duplicado na tela de sucesso

- **🧹 TextHeading duplicado removido dos templates de agendamento**
  - `lib/flow-templates-dynamic.ts` - removido TextHeading hardcoded "Agendamento Confirmado" da tela SUCCESS
  - `lib/dynamic-flow.ts` - `generateBookingDynamicFlowJson` agora gera apenas TextBody (sem TextHeading duplicado)
  - Mantida função `dedupeSuccessTextBlocks` em `normalizeDynamicFlowSpec` para casos legados

## 15/01/2026 - Estabilidade do editor unificado

- **♻️ Loop de render e ordem de hooks corrigidos**
  - `UnifiedFlowEditor` passa a emitir preview apenas com dependências estáveis (remove `props` do efeito)
  - `FlowBuilderEditorPage` estabiliza `onPreviewChange` via `useCallback` e `refs` para evitar re-render em cascata
  - `editorSpecOverride` agora é guardado para não reiniciar o editor a cada preview

## 15/01/2026 - Labels reais na confirmação do Flow

- **🏷️ Confirmação usa o texto da pergunta**
  - `app/api/webhook/route.ts` agora extrai labels do `flow_json` e substitui `topics/notes/...` pelo texto da pergunta
  - Fallback mantém o comportamento antigo quando não há `flow_json` disponível

## 15/01/2026 - Rótulos customizáveis na confirmação

- **✏️ Campos do resumo com nome editável**
  - `app/(dashboard)/flows/builder/[id]/page.tsx` permite editar o rótulo de cada pergunta na etapa Finalizar
  - `app/api/webhook/route.ts` usa `confirmation_labels` enviados no payload para renderizar o resumo

## 15/01/2026 - Edição inline de rótulos

- **📝 Rótulo editável direto no campo**
  - `app/(dashboard)/flows/builder/[id]/page.tsx` passa a permitir editar o texto no próprio campo do resumo (sem input separado)

## 15/01/2026 - Reset de rótulo no resumo

- **↩️ Reset rápido do rótulo**
  - `app/(dashboard)/flows/builder/[id]/page.tsx` adiciona botão “Resetar” para voltar ao rótulo padrão do campo

## 15/01/2026 - Atalho ngrok em dev

- **🧪 Iniciar ngrok dentro do app**
  - `components/features/settings/NgrokDevPanel.tsx` adiciona painel de webhook local no modo dev
  - `app/api/debug/ngrok/route.ts` permite iniciar/parar ngrok e ler a URL pública

## 15/01/2026 - Diagnóstico do ngrok em dev

- **🔍 Erro quando a API local não responde**
  - `app/api/debug/ngrok/route.ts` retorna `apiError` quando o painel do ngrok não responde
  - `components/features/settings/NgrokDevPanel.tsx` mostra aviso com instrução local

## 15/01/2026 - URL do ngrok sem depender do painel local

- **🔗 Captura da URL via logs**
  - `app/api/debug/ngrok/route.ts` agora extrai o `public_url` do stdout do ngrok (log-format=json)

## 15/01/2026 - Status do ngrok mais estável

- **🟢 Detecta ngrok ativo via URL**
  - `app/api/debug/ngrok/route.ts` considera o ngrok ativo quando há URL pública disponível
  - `components/features/settings/NgrokDevPanel.tsx` exibe status “Ativo” mesmo sem processo local

## 15/01/2026 - Painel ngrok com Agent API

- **🔌 Controle confiável de túneis em dev**
  - `app/api/debug/ngrok/route.ts` migra para Agent API (`/api/tunnels`) com start/stop real e URL estável
  - `components/features/settings/NgrokDevPanel.tsx` exibe status, botão de copiar URL e instruções de setup
  - Fallback informativo com comando do Cloudflare Quick Tunnel

## 15/01/2026 - Detecção de binários em dev

- **🧰 Instruções baseadas em binários instalados**
  - `app/api/debug/ngrok/route.ts` detecta `ngrok` e `cloudflared` no PATH
  - `components/features/settings/NgrokDevPanel.tsx` ajusta mensagens conforme o binário disponível

## 15/01/2026 - Dev com ngrok automático

- **▶️ Script para iniciar ngrok + Next.js**
  - `scripts/dev-with-ngrok.mjs` inicia o ngrok e o `npm run dev` juntos
  - `package.json` adiciona o script `dev:with-ngrok`

## 15/01/2026 - Ngrok auto-start no painel

- **⚡ Auto-início via Configurações (dev)**
  - `app/api/debug/ngrok/route.ts` inicia o ngrok se a API local estiver indisponível
  - `components/features/settings/NgrokDevPanel.tsx` dispara autostart ao abrir e simplifica botões

## 15/01/2026 - URL do webhook com ngrok (dev)

- **🔁 Atualização automática da URL**
  - `components/features/settings/SettingsView.tsx` usa a URL pública do ngrok no bloco de Webhooks
  - Atualiza periodicamente para refletir o túnel ativo

## 15/01/2026 - MiniApp com URL dev

- **🔗 Endpoint do MiniApp usando ngrok**
  - `components/features/settings/FlowEndpointPanel.tsx` exibe URL do endpoint com base no ngrok em dev
  - `components/features/settings/SettingsView.tsx` compartilha a base pública com os blocos

## 15/01/2026 - Teste de URL do webhook

- **✅ Validação direta do ngrok**
  - `app/api/debug/webhook/test/route.ts` testa a URL com `hub.verify_token`
  - `components/features/settings/webhook/WebhookUrlConfig.tsx` adiciona botão de teste em dev

## 15/01/2026 - Espaçamento da confirmação

- **✉️ Mensagem mais legível**
  - `app/api/webhook/route.ts` adiciona linha em branco entre título, respostas e rodapé

## 15/01/2026 - Badges Simples/Dinâmico

- **🏷️ Templates sem jargão**
  - `lib/flow-templates.ts` remove “(sem endpoint)” dos nomes
  - `app/(dashboard)/flows/builder/[id]/page.tsx` mostra badge “Simples”/“Dinâmico”
  - `components/features/flows/builder/form-builder/TemplateImportDialog.tsx` adiciona badges
  - `components/features/flows/builder/CreateFlowFromTemplateDialog.tsx` ajusta texto auxiliar
  - Badge “Dinâmico” usa verde para manter o padrão visual
  - Remove badge “Selecionado” nos cards iniciais

## 15/01/2026 - Títulos dinâmicos amigáveis

- **🧩 Resolve placeholders no editor**
  - `components/features/flows/builder/UnifiedFlowEditor.tsx` mostra `__example__` em telas e textos
  - Edição do título/texto com `${data.*}` atualiza o `__example__`

## 15/01/2026 - Opções dinâmicas no editor

- **✅ Auditoria do template de agendamento**
  - `components/features/flows/builder/UnifiedFlowEditor.tsx` mostra opções reais via `__example__`
  - Permite editar opções dinâmicas atualizando o `__example__`

## 15/01/2026 - Serviços reais no agendamento

- **🔗 Editor sincroniza serviços com endpoint**
  - `app/api/flows/[id]/route.ts` salva a lista editada em `settings`
  - `lib/whatsapp/flow-endpoint-handlers.ts` usa `booking_services`

## 15/01/2026 - Endpoint dinâmico do template

- **🔁 Contrato do template passa a ser fonte da verdade**
  - `lib/whatsapp/flow-endpoint-handlers.ts` lê `flow_json` via `flow_token`
  - Campos, títulos e listas seguem o que foi editado no template

## 15/01/2026 - Texto duplicado no sucesso

- **🧹 Evita repetir o mesmo texto**
  - `lib/dynamic-flow.ts` só renderiza título quando for diferente da mensagem

## 15/01/2026 - Deduplicação na tela de sucesso

- **🧼 Remove blocos repetidos**
  - `lib/dynamic-flow.ts` elimina `TextHeading` quando for igual ao `TextBody` em telas de sucesso

## 15/01/2026 - Token do webhook em dev

- **🧠 Fallback in-memory**
  - `lib/verify-token.ts` mantém token em memória quando o banco não responde
  - Evita `Forbidden` no teste do webhook local

## 15/01/2026 - QStash no dev com ngrok

- **🚚 Disparo local sem quebrar**
  - `app/api/campaign/dispatch/route.ts` usa ngrok quando há QSTASH_TOKEN
  - Em dev sem token, faz chamada direta ao workflow
  - `lib/builder/workflow-schedule.ts` resolve baseUrl via ngrok no dev

## 15/01/2026 - Build fix do editor

- **🛠️ Ajuste de tipagem no editor unificado**
  - `app/(dashboard)/flows/builder/[id]/page.tsx` tipa corretamente o `prev` do `setEditorSpecOverride`, evitando erro TS no build

## 15/01/2026 - Build fix no reset de meta

- **🛠️ Ajuste de tipagem no PATCH de flows**
  - `app/api/flows/[id]/route.ts` tipa `metaRow`/`metaErr` para evitar erro TS no build

## 17/01/2026 - Confirmação pós-finalização no editor unificado

- **✅ Confirmação voltou a funcionar em telas finais**
  - `lib/dynamic-flow.ts` volta a permitir `payload` em ações `complete` (mantém bloqueio em `navigate` para evitar erro da Meta)
  - **UX melhor**: a seção **Confirmação** foi movida para o passo **3 (Finalizar)** em `app/(dashboard)/flows/builder/[id]/page.tsx`
  - Agora é possível **escolher quais campos aparecem** no resumo via `confirmation_fields` (persistido no `complete.payload`)
- **💬 Mensagem pós-flow com resumo do que o usuário respondeu**
  - `lib/dynamic-flow.ts` agora garante `payload` completo no `complete` com mapeamento `${form.*}` de todos os campos do flow
  - `app/api/webhook/route.ts` já envia automaticamente uma mensagem de resumo (best-effort) quando `send_confirmation` não é `false`

## 16/01/2026 - Editor unificado (“Tela Viva”)

- **🧠 Um único editor (sem “modo Formulário vs Dinâmico”)**
  - `app/(dashboard)/flows/builder/[id]/page.tsx` agora usa apenas `UnifiedFlowEditor` e removeu o toggle de modos
  - Preview continua como “verdade” e passa a suportar **seleção** (highlight) para editar via painel contextual

- **📦 Modelo canônico em `DynamicFlowSpecV1` (migração automática)**
  - `lib/dynamic-flow.ts` ganhou conversores `formSpecToDynamicSpec` e `bookingConfigToDynamicSpec`
  - `UnifiedFlowEditor` persiste `spec.dynamicFlow` em background quando o flow vem de `spec.form`, `spec.booking` ou `flow_json` legado

- **🧭 Geração de Flow JSON mais “Meta-like”**
  - `lib/dynamic-flow.ts` agora gera navegação com `navigate.next` como padrão
  - `data_api_version: "3.0"` e `routing_model` só entram quando existe `data_exchange` (sem expor routing em flows “form-like”)
  - Injeção de chaves `__editor_key`/`__editor_title_key` para seleção/edição no preview (formato `screen:*`)

- **🧩 Painel contextual + Assistente de Agendamento**
  - `components/features/flows/builder/InspectorPanel.tsx` edita título/texto/pergunta/CTA do elemento selecionado
  - Assistente de agendamento permite ajustar **serviços** e alternar **Calendário vs Dropdown** sem telas separadas

- **🧹 Limpeza e robustez no publish**
  - `app/api/flows/[id]/meta/publish/route.ts` removeu logs internos e evita validar `spec.form` quando o Flow é dinâmico

- **✅ Regras de navegação mais “óbvias”**
  - Telas com próxima etapa não podem ficar como “Tela final”; o CTA vira **Continuar** automaticamente

- **🧭 Caminhos (Mapa do fluxo) — ramificação sem JSON**
  - `lib/dynamic-flow.ts` ganhou `defaultNextByScreen` e `branchesByScreen` no `DynamicFlowSpecV1` + validações
  - `generateDynamicFlowJson` inclui `routing_model` automaticamente quando houver ramificações (mesmo sem `data_exchange`)
  - `components/features/flows/builder/UnifiedFlowEditor.tsx` adiciona seção **Caminhos** com destino padrão + regras por campo
  - `components/ui/MetaFlowPreview.tsx` simula ramificação no clique do CTA usando os “Caminhos” do editor (sem expor JSON)
  - `components/features/flows/builder/dynamic-flow/AdvancedFlowPanel.tsx` vira modo de manutenção (remove edição de routing JSON)

- **📡 Publish na Meta: compatibilidade com `routing_model`**
  - `lib/dynamic-flow.ts` normaliza IDs de telas para o padrão aceito pela Meta no `routing_model` (somente letras/underscore), migrando `SCREEN_1/2/3...` → `SCREEN_A/B/C...`
  - `app/api/flows/[id]/meta/publish/route.ts` passa a exigir `endpoint_uri` também quando houver `data_api_version: "3.0"`/`routing_model` (mesmo sem `data_exchange`), com mensagem explícita de que **localhost não publica**
  - `app/api/flows/[id]/meta/publish/route.ts` remove metadados internos do editor (`__editor_key`, `__editor_title_key`) do JSON enviado à Meta (evita validation errors 139002)
  - `app/api/flows/[id]/meta/publish/route.ts` também remove `__builder_id` (Meta rejeita esse campo em componentes)
  - `UnifiedFlowEditor`: destinos definidos em **Caminhos** passam a ser “finais” por padrão (evita “cascata” para próximas telas automáticas)
  - `UnifiedFlowEditor`: em campos de opções, o destino do Caminho é inferido automaticamente quando existe uma tela com o mesmo título da opção (sem exigir clique extra; destino segue editável direto)
  - Renomear um Flow já **PUBLISHED** reseta `meta_flow_id` automaticamente (próximo publish cria um novo Flow na Meta), e UI ganhou botão “Resetar publicação”

## 15/01/2026 - Builder dinâmico estilo “Formulário”

- **🧱 Novo builder dinâmico com UX de formulário**
  - `components/features/flows/builder/dynamic-flow/DynamicFlowBuilder.tsx` traz abas por tela + lista de “blocos” com mover/duplicar/excluir
  - CTA virou editor simples: **texto do botão**, **tipo de ação** e **“Ir para (próxima tela)”** (sem expor JSON)

- **🧭 Integração no editor principal**
  - `app/(dashboard)/flows/builder/[id]/page.tsx` usa o `DynamicFlowBuilder` quando o modo for **Dinâmico** (para templates não-agendamento)
  - Alternar **Formulário/Dinâmico** também sincroniza a prévia (evita precisar “sair e entrar”)
  - Alternar **“Fluxo real / Formulário”** na prévia também troca o editor (evita confusão e garante atualização imediata)
  - Simplificação: removidos botões “Fluxo real / Formulário” da prévia (a fonte agora segue o modo do editor)
  - Simplificação: removidos botões/indicadores de prévia; a área mostra apenas o preview **Meta (oficial)**, sempre
  - Simplificação: ações do builder (salvar/telas/avançado) foram movidas para um menu “⋯” com **auto-salvar**

- **🧩 JSON mais parecido com o Flow Builder da Meta**
  - `lib/dynamic-flow.ts` agora prefere aplicar o `Footer` dentro do primeiro `Form` (quando existir)
  - Extração de ação do `Footer` ficou recursiva (funciona mesmo com `Footer` aninhado)

## 15/01/2026 - Formulário com múltiplas telas (etapas)

- **🧩 Form builder agora suporta etapas**
  - `lib/flow-form.ts` ganhou `steps` (retrocompatível) e gera `screens[]` com `navigate.next` entre etapas e `complete` no final
  - Validação agora considera limite de \(50\) componentes **por etapa** e nomes únicos entre etapas

- **🧭 UI de etapas no modo Formulário**
  - `components/features/flows/builder/FlowFormBuilder.tsx` adiciona abas de **Etapas** + menu “⋯” para adicionar/remover etapa
  - Cada etapa tem **título** e botão “Continuar” configurável (a última usa “Enviar”)

- **📱 Preview suporta navegação oficial**
  - `components/ui/MetaFlowPreview.tsx` agora entende `on-click-action.next.name` (além do fallback antigo via `payload.screen`)

## 15/01/2026 - Wizard de agendamento

- **🧭 UI simplificada no editor de agendamento**
  - `components/features/flows/builder/dynamic-flow/BookingDynamicEditor.tsx` agora usa wizard com 4 passos
  - Oculta o routing model por padrao e exibe em "Avancado"

- **📱 Preview dinâmico com dados reais**
  - `components/ui/MetaFlowPreview.tsx` resolve bindings `${data.*}` usando `__example__`
  - Melhora a leitura da tela inicial no modo dinâmico

- **🖱️ Edicao rapida direto no preview**
  - `lib/dynamic-flow.ts` adiciona chaves de editor no JSON de agendamento
  - `components/ui/MetaFlowPreview.tsx` permite clicar nos textos para editar

- **🧊 Modo minimalista no editor**
  - `components/features/flows/builder/dynamic-flow/BookingDynamicEditor.tsx` agora mostra apenas o botao "Editar textos"
  - Configuracoes de servicos/data e routing ficam em "Avancado"

- **🪟 Editor inline sem prompt**
  - `app/(dashboard)/flows/builder/[id]/page.tsx` usa modal nativo do app para editar textos
  - Evita erro de `prompt()` no ambiente do app

- **🧹 Preview e avancado alinhados**
  - `components/ui/MetaFlowPreview.tsx` agora reflete servicos do agendamento corretamente
  - `components/features/flows/builder/dynamic-flow/BookingDynamicEditor.tsx` remove routing model do modo simples

## 15/01/2026 - Ajuste de CTA no preview

- **✅ CTA respeita campos obrigatorios**
  - `components/ui/MetaFlowPreview.tsx` volta a bloquear o botao ate preencher

- **🧼 Agendamento sem modo tecnico**
  - `app/(dashboard)/flows/builder/[id]/page.tsx` oculta o editor tecnico no template de agendamento
  - Mantem apenas o painel simples + preview clicavel

- **🔗 Painel acompanha o preview**
  - `components/features/flows/builder/dynamic-flow/BookingDynamicEditor.tsx` mostra campos da tela atual
  - `components/ui/MetaFlowPreview.tsx` notifica a tela ativa no preview

- **🖼️ Preview sempre visivel no modo dinamico**
  - `app/(dashboard)/flows/builder/[id]/page.tsx` mostra o preview mesmo sem perguntas do formulario

- **👀 Preview forçado no agendamento**
  - `app/(dashboard)/flows/builder/[id]/page.tsx` mantém preview dinâmico sempre ativo no template de agendamento

## 15/01/2026 - Spec dinâmico e geração dedicada

- **🧩 Spec V1 para flows dinâmicos**
  - `lib/dynamic-flow.ts` adiciona `DynamicFlowSpecV1`, normalização e geração de JSON dinâmico
  - Garante ações por tela (data_exchange/navigate/complete) preservando payload e CTA

- **🧭 Builder salva spec e regenera JSON**
  - `app/(dashboard)/flows/builder/[id]/page.tsx` passa a persistir o spec dinâmico e gerar o JSON no preview/salvamento
  - Mantém compatibilidade com flows dinâmicos legados salvos como `flowJson`

- **🚀 Publish usa spec dinâmico atualizado**
  - `app/api/flows/[id]/meta/publish/route.ts` gera o JSON a partir do spec dinâmico quando disponível
  - Continua priorizando o config de agendamento para o template `agendamento_dinamico_v1`

## 15/01/2026 - UX redesign completo (Progressive Disclosure)

- **✨ Preview editável inline**
  - Clique direto no preview para editar títulos, subtítulos, labels e botões
  - `components/ui/MetaFlowPreview.tsx` resolve `${data.*}` e permite edição inline
  - `components/ui/InlineEditableText.tsx` para edição contentEditable com hover states

- **🎯 Menu de contexto**
  - Botão direito no preview para ações rápidas (editar texto)
  - `components/ui/ContextMenu.tsx` com design minimalista
  - Preparado para adicionar/remover/duplicar campos no futuro

- **🔧 Modo Avançado (Progressive Disclosure)**
  - Botão discreto "Modo Avançado →" só aparece quando necessário
  - `components/features/flows/builder/dynamic-flow/AdvancedFlowPanel.tsx` painel lateral para telas/routing
  - Interface simples por padrão, complexidade escondida até ser necessária

- **📱 Preview sempre visível**
  - Preview dinâmico aparece automaticamente (sem exigir perguntas)
  - Botão verde só habilita quando campos obrigatórios preenchidos
  - Navegação entre telas funciona como app real

- **🧹 Cleanup de UI confusa**
  - `BookingDynamicEditor` agora tem apenas "Edição rápida" + "Configurações" colapsável
  - Removido wizard com 4 passos (era redundante com preview)
  - Removido "Tela atual" que duplicava informação

- **🧩 Spec dinâmico V1**
  - `lib/dynamic-flow.ts`: `DynamicFlowSpecV1`, normalização, validação e geração de JSON
  - `generateDynamicFlowJson()` para flows genéricos
  - `dynamicFlowSpecFromJson()` para converter JSON existente em spec

- **🚀 Publish usa spec dinâmico**
  - `app/api/flows/[id]/meta/publish/route.ts` prioriza `spec.dynamicFlow` e `spec.booking`
  - Mantém compatibilidade com flows legados

## 15/01/2026 - MiniApps dinâmicos (agendamento)

- **🔐 Health check (ping) agora retorna resposta CRIPTOGRAFADA**
  - `app/api/flows/endpoint/route.ts` corrigido para criptografar resposta do ping
  - Segundo documentação oficial da Meta, TODAS as respostas devem ser criptografadas
  - Isso estava causando erro "Endpoint Not Available" na publicação

- **📚 Documentação consolidada de WhatsApp Flows**
  - Criado `docs/whatsapp-flows-complete-reference.md` com toda a documentação oficial
  - Inclui checklist de implementação, códigos de erro, e exemplos de código

- **🐛 Fix: Parser da chave pública da Meta**
  - `lib/meta-flows-api.ts` agora lê corretamente `data.data[0]` em vez de `data` direto
  - A Meta retorna `{ data: [{ business_public_key, ... }] }` e não `{ business_public_key }`

- **✅ Publicação preserva Flow JSON dinâmico**
  - `app/api/flows/[id]/meta/publish/route.ts` agora mantém o `flow_json` salvo quando `data_api_version=3.0`
  - Evita regenerar a partir do `spec.form` e perder `data_exchange` no agendamento com Google Calendar

- **🧭 Builder não sobrescreve Flow dinâmico**
  - `app/(dashboard)/flows/builder/[id]/page.tsx` mantém `flow_json` dinâmico ao salvar/publicar
  - Garante que o template de agendamento continue com `data_exchange` após ajustes no formulário

- **🧩 Validação local aceita componente Form**
  - `lib/meta-flow-json-validator.ts` agora permite `Form` e valida filhos internos
  - Desbloqueia publish de MiniApps dinâmicos com `data_exchange`

- **🔗 Endpoint URL resolvido para MiniApps dinâmicos**
  - `app/api/flows/endpoint/keys/route.ts` passa a usar origin dos headers e salvar URL no settings
  - `app/api/flows/[id]/meta/publish/route.ts` utiliza URL salva quando envs não estão setadas

- **🧰 Endpoint keys com runtime Node e sem cache**
  - `app/api/flows/endpoint/keys/route.ts` força `nodejs` + `force-dynamic`
  - Evita resposta stale e garante headers disponíveis para montar URL

- **🛰️ Endpoint URL sem cache no painel**
  - `components/features/settings/FlowEndpointPanel.tsx` força `no-store`
  - `app/api/flows/endpoint/keys/route.ts` retorna `Cache-Control: no-store`

- **🧯 Evita sobrescrever URL com localhost**
  - `app/api/flows/endpoint/keys/route.ts` não grava URL local no settings
  - Prioriza URL salva/ambiente quando o request não é localhost

- **🧪 Debug de origem do endpoint**
  - `app/api/flows/endpoint/keys/route.ts` expõe origem da URL para diagnóstico
  - `components/features/settings/FlowEndpointPanel.tsx` loga `header/env/stored`

- **🧾 Debug seguro do publish**
  - `app/api/flows/[id]/meta/publish/route.ts` retorna detalhes da Meta com `x-debug-client=1`
  - `services/flowsService.ts` envia o header e registra o erro localmente

- **🔧 Build corrigido no publish**
  - Ajuste de escopo em `app/api/flows/[id]/meta/publish/route.ts` para `wantsDebug`

- **🏷️ Nome único ao publicar Flow**
  - `app/api/flows/[id]/meta/publish/route.ts` adiciona sufixo com ID para evitar colisão na Meta

- **🧾 Erro da Meta exibido no publish**
  - `services/flowsService.ts` agora expõe `error_user_title` e `error_user_msg` quando disponíveis

- **🔐 Registro automático da chave pública**
  - `app/api/flows/[id]/meta/publish/route.ts` agora registra a chave pública na Meta antes de publicar flows dinâmicos

- **📞 Registro de chave usa Phone Number ID**
  - `lib/meta-flows-api.ts` agora usa `phone_number_id` no endpoint `whatsapp_business_encryption`

- **🧾 Registro de chave com form-url-encoded**
  - `lib/meta-flows-api.ts` envia `business_public_key` como `application/x-www-form-urlencoded`, conforme documentação da Meta

- **✅ Endpoint reconhece notificações de erro**
  - `lib/whatsapp/flow-endpoint-handlers.ts` responde `{ data: { acknowledged: true } }` quando recebe `data.error` do client

- **🏷️ Retry automático em nome não único**
  - `app/api/flows/[id]/meta/publish/route.ts` tenta um nome alternativo quando a Meta retorna erro 4016019

- **🔍 Debug avançado de chave pública**
  - `app/api/flows/[id]/meta/publish/route.ts` agora expõe hash da chave local/meta e status de assinatura

- **🧯 Bloqueio quando chave não registra**
  - `app/api/flows/[id]/meta/publish/route.ts` interrompe o publish se a chave não persistir na Meta

## 15/01/2026 - Agendamento (Settings + Flow)

- **🧾 Persistência de regras de agendamento**
  - `app/api/settings/calendar-booking/route.ts` agora salva e normaliza `minAdvanceHours`, `maxAdvanceDays`, `allowSimultaneous` e `slots`
  - Garante que a UI e o Flow usem as regras corretas

- **📅 Datas do Flow em formato simples**
  - `lib/whatsapp/flow-endpoint-handlers.ts` passa a fornecer datas no formato `DD/MM/YYYY`
  - Mantém `id` em `YYYY-MM-DD` para compatibilidade interna

- **🗓️ CalendarPicker no Flow de agendamento**
  - `scripts/test-booking-flow.mjs` troca dropdown por `CalendarPicker` (calendário visual)
  - Flow JSON atualizado para `7.3` (recomendado pela Meta) e campos `min/max/include-days`
  - Datas não trabalhadas agora aparecem desabilitadas via `unavailable-dates`

- **🗓️ Data com dia da semana no Flow**
  - `lib/whatsapp/flow-endpoint-handlers.ts` exibe `DD/MM/YYYY (Quinta)` no título da seleção de horários
  - Mensagem de erro também destaca a data como `Quinta - 22/01`

- **🌐 Webhook externo para agendamentos**
  - `app/api/settings/calendar-booking/route.ts` passa a salvar `externalWebhookUrl` no config
  - `components/features/settings/calendar/BookingConfigSection.tsx` adiciona campo para URL externa
  - `app/api/webhook/route.ts` envia payload JSON para o webhook no `nfm_reply`

- **✅ Confirmação detalhada no WhatsApp**
  - `app/api/webhook/route.ts` inclui nome, telefone e observações na mensagem de confirmação
  - Data exibida com dia da semana quando disponível
  - `lib/whatsapp/flow-endpoint-handlers.ts` inclui dados do formulário no close response para o webhook

- **🧾 Confirmação configurável no Form Builder**
  - `lib/flow-form.ts` adiciona `sendConfirmation` e envia `send_confirmation` no payload quando desativado
  - `components/features/flows/builder/FlowFormBuilder.tsx` inclui toggle "Enviar confirmação ao usuário"
  - `app/api/webhook/route.ts` respeita `send_confirmation` e gera resumo genérico quando aplicável
  - `lib/flow-form.ts` permite definir `confirmation_title` e `confirmation_footer` por Flow

- **✍️ Mensagem de confirmação personalizável**
  - `components/features/settings/calendar/BookingConfigSection.tsx` permite editar título e rodapé
  - `app/api/webhook/route.ts` usa os textos configurados para a confirmação

- **✅ Confirmação automática pós‑Flow**
  - `app/api/webhook/route.ts` envia mensagem de confirmação quando recebe `nfm_reply` do Flow
  - Mensagem inclui serviço, data e horário quando disponíveis

## 15/01/2026 - Campanhas

- **🧩 Clone de campanha usa rota correta**
  - `services/campaignService.ts` agora chama `/api/campaigns/:id/clone` (em vez de `/duplicate`)
  - `services/campaignService.test.ts` atualizado para refletir a rota

## 15/01/2026 - Flow Builder

- **👀 Preview do template dinâmico de agendamento**
  - `components/ui/MetaFlowPreview.tsx` passa a renderizar componentes dentro de `Form`
  - Corrige preview vazio ao selecionar "Agendamento (Google Calendar)"

- **🧭 Preview alinhado ao editor**
  - `app/(dashboard)/flows/builder/[id]/page.tsx` usa o form spec no preview
  - Evita mostrar a tela dinâmica (BOOKING_START) quando o usuário edita as perguntas

- **🔀 Alternância de prévia (dinâmico vs formulário)**
  - `app/(dashboard)/flows/builder/[id]/page.tsx` permite alternar entre "Fluxo real" e "Formulário"
  - Ajuda a comparar o passo inicial do agendamento com os campos finais

- **🧪 Simulação local no preview Meta**
  - `components/ui/MetaFlowPreview.tsx` agora permite navegar entre telas via routing_model
  - CTA avança e o botão de fechar volta quando existe histórico

## 25/12/2025 - Debug (Run/Trace para campanhas)

- **🔎 Timeline estruturada por `trace_id` (sem caçar logs)**
  - Nova migration: `supabase/migrations/0026_add_campaign_trace_events.sql` cria `campaign_trace_events`
  - Eventos relevantes do workflow/webhook passam a ser persistidos (best-effort) para inspeção no Supabase
  - Persistência é filtrada para evitar alto volume (erros + fases-chave como `batch_start`/`batch_end`/`complete`)

- **🧷 Correlação ponta-a-ponta (precheck → workflow → webhook)**
  - `traceId` agora é gerado cedo no `dispatch` e gravado em `campaign_contacts` já no precheck (pending/skipped)
  - Webhook emite eventos “positivos” (`delivered`/`read`) na timeline quando o update é aplicado

- **🖥️ Interface de Debug (Trace View) na tela de campanha**
  - Adicionado painel “Debug • Execuções (Trace)” nos detalhes da campanha para listar `trace_id` e navegar na timeline (`campaign_trace_events`)
  - Endpoints novos: `GET /api/campaigns/:id/trace` e `GET /api/campaigns/:id/trace-events`
  - O painel agora **auto-seleciona o último run automaticamente** (sem precisar clicar em `trace_id`), com fallback via métricas quando disponível

## 25/12/2025 - Segurança (Sentinel)

- **🛡️ Hardening de headers HTTP (Next.js)**
  - Adicionados headers defensivos (ex: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`)
  - `Strict-Transport-Security` habilitado somente em produção
  - Desativado `X-Powered-By` para reduzir fingerprinting

- **🔒 Proteção de endpoint sensível de setup**
  - `GET /api/setup/auto-migrate` agora exige `SMARTZAP_ADMIN_KEY` (ou `SMARTZAP_API_KEY`) via `Authorization: Bearer ...` ou `?key=...`
  - Detalhes de erro agora são omitidos em produção para reduzir vazamento de informações

- **🧱 Blindagem pós-instalação + logs só em dev**
  - `POST /api/setup/migrate` agora é **desativado** quando `SETUP_COMPLETE=true` (evita uso após instalação)
  - `console.log` em rotas de setup/auth passam a rodar somente fora de produção (reduz ruído e risco de info leak)

- **🚨 Proteção crítica de PII (defesa em profundidade)**
  - Rotas `app/api/contacts/**` agora exigem **sessão válida** ou **API key** (`Authorization: Bearer ...`)

- **🔐 Webhook Meta (anti-spoof)**
  - `POST /api/webhook` valida `X-Hub-Signature-256` quando `META_APP_SECRET` está configurado (modo compatível: sem secret não bloqueia)

## 25/12/2025 - Parte 4 (Polish Final)

- **✨ Refinamento de Focus States**
  - Substituído `outline` por `ring` para focus indicators mais elegantes
  - Adicionado `ring-offset` para melhor separação visual
  - Usado opacidade (`/50`) para sutileza
  - Ajustado `ring-offset-color` para combinar com fundo escuro
  
  **Mudança Visual:**
  - Antes: Contorno grosso e mal posicionado
  - Depois: Ring fino, elegante e bem posicionado
  - Resultado: Focus state mais profissional e menos intrusivo

## 25/12/2025 - Parte 3 (Padronização Completa)

- **🎯 Padronização Total do Sistema**
  - Auditoria completa de **TODOS** os componentes principais
  - Adicionados **Tooltips** em ContactListView (editar, excluir, paginação)
  - Padronizados **Hover effects** em todas as tabelas (glow verde + 200ms)
  - Verificados **Focus states** em todos os botões interativos
  - Confirmado **Loading states** consistentes em todo o sistema
  
  **Componentes Auditados e Padronizados:**
  - ✅ CampaignListView: 100% padronizado
  - ✅ ContactListView: 100% padronizado
  - ✅ TemplateListView: 100% padronizado
  - ✅ DashboardView: 100% padronizado
  - ✅ DashboardShell: 100% padronizado
  - ✅ SettingsView: 100% padronizado
  
  **Padrões Garantidos:**
  - 🎯 Tooltips em TODOS os botões icon-only
  - ✨ Hover effects consistentes (shadow + glow)
  - ⏱️ Transições uniformes (200ms)
  - 🎨 Focus-visible em TODOS os elementos interativos
  - 🔄 Loading skeletons com animação escalonada

## 25/12/2025 - Parte 2

- **✨ Melhorias Visuais e Interativas (Opção C)**
  - Adicionados **Tooltips** em todos os botões icon-only (hover para ver descrição)
  - Criado componente **ConfirmationDialog** reutilizável para ações destrutivas
  - Melhorados **Loading Skeletons** com animações escalonadas (staggered)
  - Adicionados **Hover Effects** com glow sutil em cards e linhas de tabela
  - Melhoradas **transições** de 200ms para interações mais suaves
  
  **Componentes com melhorias visuais:**
  - ✨ CampaignListView: Tooltips em todos os botões de ação
  - ✨ DashboardView: Hover effects e loading skeletons melhorados
  - ✨ ConfirmationDialog: Novo componente para confirmações
  
  **Impacto Visual:**
  - 🎯 Tooltips aparecem ao passar o mouse (300ms delay)
  - ✨ Glow sutil verde ao passar sobre linhas de tabela
  - 🔄 Loading skeletons com animação em cascata
  - 🎨 Transições suaves em todas as interações

## 25/12/2025 - Parte 1

- **🎨 Melhorias de UX e Acessibilidade (100+ micro-melhorias)**
  - Adicionados **ARIA labels** em todos os botões icon-only para melhor acessibilidade com leitores de tela
  - Implementados **estilos focus-visible** consistentes em toda a aplicação para navegação por teclado
  - Melhorado **estado vazio** em CampaignListView com mensagens contextuais e orientações
  - Adicionados **aria-live** regions para feedback dinâmico (paginação, contadores)
  - Implementado **aria-current** em navegação e paginação para indicar página/item ativo
  - Adicionados **aria-hidden** em ícones decorativos para evitar poluição em leitores de tela
  - Melhorada **navegação por teclado** com suporte a Escape e Enter em overlays
  - Adicionados **aria-pressed** em botões de filtro para indicar estado ativo
  - Implementados **aria-expanded** em botões de toggle para indicar estado de expansão
  - Melhorados **breadcrumbs** com navegação ARIA apropriada
  - Adicionados **role="status"** em spinners de loading para feedback de estado
  - Melhorados **labels descritivos** em todos os inputs e selects
  - Implementado **aria-label** contextual em notificações com contadores
  - Adicionados **focus trap** em modais para melhor navegação por teclado
  
  **Componentes melhorados:**
  - ✅ CampaignListView: 10+ melhorias (ARIA, focus, empty state, pagination)
  - ✅ DashboardShell: 20+ melhorias (navegação, sidebar, mobile menu, breadcrumbs)
  - ✅ ContactListView: 10+ melhorias (botões de ação, filtros, busca)
  - ✅ TemplateListView: 10+ melhorias (filtros, botões de ação, busca)
  - ✅ DashboardView: Melhorias em CTAs e focus states
  
  **Impacto:**
  - 📱 Melhor experiência para usuários de teclado
  - ♿ Compatibilidade com leitores de tela (NVDA, JAWS, VoiceOver)
  - 🎯 Navegação mais intuitiva e previsível
  - ✨ Feedback visual e sonoro consistente

## 24/12/2025

- **Contexto compacto para IA (WhatsApp docs)**
  - Adicionado script `npm run whatsapp:context` para gerar `docs/whatsapp.context.md` a partir de `docs/whatsapp.json`.
  - Objetivo: permitir passar **um único arquivo menor** como contexto, evitando enviar ~17MB para a IA.

