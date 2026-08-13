# Inventário de Componentes UI - SmartZap

**Última atualização:** 08/02/2026

## Resumo Executivo

| Categoria | Quantidade | Localização |
|-----------|------------|-------------|
| **Total de Componentes** | **460+** | - |
| Primitivos UI (shadcn/ui) | 59 | `components/ui/` |
| Componentes de Feature | 228 | `components/features/` |
| Componentes do Builder | 106 | `components/builder/` |
| Componentes de Padrão | 9 | `components/patterns/` |
| Providers | 5 | `components/providers/` |
| Wizard de Instalação | 21 | `components/install/` |
| Layout | 1 | `components/` |
| Páginas do Dashboard | 27 | `app/(dashboard)/` |

## 1. Primitivos UI (components/ui/) - 59 arquivos

Baseados em shadcn/ui (estilo new-york, RSC-enabled) com Radix UI como base.

### 1.1 Controles de Formulário

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| Input | `input.tsx` | Campo de texto básico |
| Textarea | `textarea.tsx` | Campo de texto multilinha |
| Select | `select.tsx` | Seletor dropdown |
| Checkbox | `checkbox.tsx` | Caixa de seleção |
| Switch | `switch.tsx` | Toggle on/off |
| Slider | `slider.tsx` | Controle deslizante |
| Calendar | `calendar.tsx` | Seletor de data |
| DateTimePicker | `date-time-picker.tsx` | Seletor de data e hora combinado |
| InternationalPhoneInput | `international-phone-input.tsx` | Input de telefone com código de país |
| InputGroup | `input-group.tsx` | Agrupamento de inputs com prefixo/sufixo |

### 1.2 Botões e Toggles

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| Button | `button.tsx` | Botão com variantes (default, destructive, outline, ghost, link) |
| Toggle | `toggle.tsx` | Botão toggle simples |
| ToggleGroup | `toggle-group.tsx` | Grupo de toggles mutuamente exclusivos |

### 1.3 Navegação

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| Tabs | `tabs.tsx` | Sistema de abas |
| Sidebar | `sidebar.tsx` | Menu lateral colapsável |
| Command | `command.tsx` | Paleta de comandos (cmdk) |

### 1.4 Overlays e Modais

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| Dialog | `dialog.tsx` | Modal de diálogo genérico |
| AlertDialog | `alert-dialog.tsx` | Diálogo de confirmação |
| Sheet | `sheet.tsx` | Painel lateral deslizante |
| Popover | `popover.tsx` | Popup posicionado |
| Tooltip | `tooltip.tsx` | Dica de ferramenta |
| DropdownMenu | `dropdown-menu.tsx` | Menu dropdown contextual |

### 1.5 Feedback Visual

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| Alert | `alert.tsx` | Banner de alerta contextual |
| Badge | `badge.tsx` | Etiqueta de status genérica |
| StatusBadge | `status-badge.tsx` | Badge específica para status de campanha |
| Progress | `progress.tsx` | Barra de progresso |
| Skeleton | `skeleton.tsx` | Placeholder de carregamento |
| ThemedToaster | `themed-toaster.tsx` | Sistema de notificações toast (Sonner) |

### 1.6 Layout e Containers

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| Card | `card.tsx` | Container de conteúdo com header/footer |
| Container | `container.tsx` | Container responsivo centralizado |
| Page | `page.tsx` | Layout de página (PageHeader, PageTitle, PageDescription, PageActions) |
| SectionHeader | `section-header.tsx` | Cabeçalho de seção |
| Separator | `separator.tsx` | Divisor horizontal/vertical |
| ScrollArea | `scroll-area.tsx` | Área de scroll customizada |
| Resizable | `resizable.tsx` | Painéis redimensionáveis |
| Collapsible | `collapsible.tsx` | Seção colapsável |
| Accordion | `accordion.tsx` | Acordeão de múltiplas seções |

### 1.7 Exibição de Dados

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| Avatar | `avatar.tsx` | Imagem de perfil circular |
| StatCard | `stat-card.tsx` | Card de estatística com ícone |
| Label | `label.tsx` | Rótulo de formulário |

### 1.8 Componentes Customizados

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| WhatsAppText | `whatsapp-text.tsx` | Renderizador de formatação WhatsApp (*negrito*, _itálico_) |
| PrefetchLink | `prefetch-link.tsx` | Link com prefetch otimizado |
| TemplatePreviewCard | `template-preview-card.tsx` | Card de preview de template |
| FlowPhonePreview | `flow-phone-preview.tsx` | Simulador de tela de celular para fluxos |
| AccountAlertBanner | `account-alert-banner.tsx` | Banner de alerta de conta |
| RealtimeIndicator | `realtime-indicator.tsx` | Indicador de status realtime |
| LimitWarning | `limit-warning.tsx` | Aviso de limite atingido |
| Modal | `modal.tsx` | Modal base customizado |
| ConfirmDeleteModal | `confirm-delete-modal.tsx` | Modal de confirmação de exclusão |
| Form | `form.tsx` | Wrapper para react-hook-form + Zod |
| ErrorBoundary | `error-boundary.tsx` | Boundary de erro React |
| LazyCharts | `lazy-charts.tsx` | Componentes Recharts lazy-loaded |
| ThemeToggle | `theme-toggle.tsx` | Alternador de tema claro/escuro |
| DevModeToggle | `dev-mode-toggle.tsx` | Toggle de modo desenvolvedor |
| ConfirmationDialog | `confirmation-dialog.tsx` | Diálogo de confirmação genérico |

## 2. Providers (components/providers/) - 5 arquivos

| Provider | Arquivo | Responsabilidade |
|----------|---------|------------------|
| DevModeProvider | `dev-mode-provider.tsx` | Gerencia estado de modo desenvolvedor (localStorage) |
| RealtimeProvider | `realtime-provider.tsx` | Heartbeat de conexão Supabase Realtime |
| CentralizedRealtimeProvider | `centralized-realtime-provider.tsx` | Canal único para subscriptions de tabelas (campaigns, contacts, templates, flows, inbox), invalidações debounced |
| PageLayoutProvider | `page-layout-provider.tsx` | Controle dinâmico de layout de página (width, overflow, padding) |
| PWAProvider | `pwa-provider.tsx` | Service Worker, prompts de instalação, notificações push |

## 3. Componentes de Feature (components/features/) - 228 arquivos

### 3.1 Campanhas (49 arquivos)

#### 3.1.1 Componentes Principais (23 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| CampaignListView | `campaigns/CampaignListView.tsx` | View principal da listagem |
| CampaignDetailsView | `campaigns/CampaignDetailsView.tsx` | View de detalhes da campanha |
| CampaignWizardView | `campaigns/wizard/CampaignWizardView.tsx` | View do wizard de criação |
| CampaignCard | `campaigns/CampaignCard.tsx` | Card de campanha individual |
| CampaignFolderFilter | `campaigns/CampaignFolderFilter.tsx` | Filtro por pasta |
| CampaignFolderSidebar | `campaigns/CampaignFolderSidebar.tsx` | Sidebar de pastas |
| CampaignTagFilter | `campaigns/CampaignTagFilter.tsx` | Filtro por tags |
| CampaignTagBadge | `campaigns/CampaignTagBadge.tsx` | Badge de tag |
| CampaignTracePanel | `campaigns/CampaignTracePanel.tsx` | Painel de rastreamento de mensagens |
| CampaignsSkeleton | `campaigns/CampaignsSkeleton.tsx` | Skeleton de carregamento |

#### 3.1.2 Wizard (26 sub-componentes)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| WizardHeader | `campaigns/wizard/WizardHeader.tsx` | Cabeçalho do wizard |
| WizardStepper | `campaigns/wizard/WizardStepper.tsx` | Indicador de passos |
| WizardNavigation | `campaigns/wizard/WizardNavigation.tsx` | Botões de navegação |
| WizardPreviewPanel | `campaigns/wizard/WizardPreviewPanel.tsx` | Painel de preview lateral |
| StepTemplateConfig | `campaigns/wizard/steps/StepTemplateConfig.tsx` | Passo 1: configuração de template |
| StepAudienceSelection | `campaigns/wizard/steps/StepAudienceSelection.tsx` | Passo 2: seleção de audiência |
| StepReviewLaunch | `campaigns/wizard/steps/StepReviewLaunch.tsx` | Passo 3: revisão e lançamento |
| **Review sub-componentes** | `campaigns/wizard/steps/review/*` | ReviewHeader, ReviewTemplateSection, ReviewAudienceSection, ReviewScheduleSection, ReviewSummary |
| **Audience sub-componentes** | `campaigns/wizard/steps/audience/*` | AudienceHeader, AudienceSourceSelector, ContactListSelector, TagSelector, SegmentBuilder, AudienceSummary, ExclusionRules |

#### 3.1.3 Detalhes (26 sub-componentes)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| CampaignHeader | `campaigns/details/CampaignHeader.tsx` | Cabeçalho com ações |
| CampaignStatsGrid | `campaigns/details/CampaignStatsGrid.tsx` | Grid de estatísticas |
| CampaignPerformancePanel | `campaigns/details/CampaignPerformancePanel.tsx` | Gráficos de performance |
| MessageLogTable | `campaigns/details/MessageLogTable.tsx` | Tabela de log de mensagens |

### 3.2 Contatos (21 arquivos)

#### 3.2.1 Componentes Principais (12 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| ContactListView | `contacts/ContactListView.tsx` | View principal da listagem |
| ContactFormView | `contacts/ContactFormView.tsx` | Formulário de criação/edição |
| ContactQuickEditModal | `contacts/ContactQuickEditModal.tsx` | Modal de edição rápida |
| CustomFieldsSheet | `contacts/CustomFieldsSheet.tsx` | Sheet de gerenciamento de campos customizados |
| CustomFieldsManager | `contacts/CustomFieldsManager.tsx` | Interface de gerenciamento |
| ContactsSkeleton | `contacts/ContactsSkeleton.tsx` | Skeleton de carregamento |

#### 3.2.2 List Sub-componentes (9 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| ContactTable | `contacts/list/ContactTable.tsx` | Tabela de contatos |
| ContactCard | `contacts/list/ContactCard.tsx` | Card mobile de contato |
| ContactStats | `contacts/list/ContactStats.tsx` | Estatísticas de contatos |
| ContactFilters | `contacts/list/ContactFilters.tsx` | Barra de filtros |
| ContactAddModal | `contacts/list/ContactAddModal.tsx` | Modal de adição |
| ContactEditModal | `contacts/list/ContactEditModal.tsx` | Modal de edição |
| ContactDeleteModal | `contacts/list/ContactDeleteModal.tsx` | Modal de exclusão |
| ContactImportModal | `contacts/list/ContactImportModal.tsx` | Modal de importação CSV |

### 3.3 Templates (45 arquivos)

#### 3.3.1 Componentes Principais (24 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| TemplateListView | `templates/TemplateListView.tsx` | View principal da listagem |
| ManualTemplateBuilder | `templates/manual/ManualTemplateBuilder.tsx` | Builder manual de template |
| ManualDraftsView | `templates/manual/ManualDraftsView.tsx` | Listagem de rascunhos |
| TemplatePreviewRenderer | `templates/TemplatePreviewRenderer.tsx` | Renderizador de preview |
| AIGeneratorModal | `templates/ai/AIGeneratorModal.tsx` | Modal de geração AI individual |
| BulkGenerationModal | `templates/ai/BulkGenerationModal.tsx` | Modal de geração em lote |
| BatchSubmissionList | `templates/ai/BatchSubmissionList.tsx` | Lista de submissões em lote |

#### 3.3.2 List Sub-componentes (21 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| TemplateListHeader | `templates/list/TemplateListHeader.tsx` | Cabeçalho com ações |
| TemplateTable | `templates/list/TemplateTable.tsx` | Tabela de templates |
| TemplateTableRow | `templates/list/TemplateTableRow.tsx` | Linha individual |
| TemplateFilters | `templates/list/TemplateFilters.tsx` | Filtros de categoria/status |
| StatusBadge | `templates/list/StatusBadge.tsx` | Badge de status |
| SelectionActionBar | `templates/list/SelectionActionBar.tsx` | Barra de ações em lote |
| TemplateHoverPreview | `templates/list/TemplateHoverPreview.tsx` | Preview ao hover |

#### 3.3.3 Builder Sub-componentes

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| StepConfig | `templates/manual/steps/StepConfig.tsx` | Passo 1: configuração básica |
| StepContent | `templates/manual/steps/StepContent.tsx` | Passo 2: conteúdo (header/body/footer) |
| StepButtons | `templates/manual/steps/StepButtons.tsx` | Passo 3: botões de ação |
| StepNavigation | `templates/manual/builder/StepNavigation.tsx` | Navegação entre passos |
| TemplatePreview | `templates/manual/builder/TemplatePreview.tsx` | Preview em tempo real |
| **Button sub-componentes** | `templates/manual/builder/buttons/*` | ButtonList, ButtonForm, ButtonPreview |

### 3.4 Inbox (12 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| InboxView | `inbox/InboxView.tsx` | View principal do inbox |
| ConversationList | `inbox/ConversationList.tsx` | Lista de conversas |
| ConversationItem | `inbox/ConversationItem.tsx` | Item individual de conversa |
| ConversationHeader | `inbox/ConversationHeader.tsx` | Cabeçalho da conversa ativa |
| MessagePanel | `inbox/MessagePanel.tsx` | Painel de mensagens |
| MessageBubble | `inbox/MessageBubble.tsx` | Bolha de mensagem individual |
| MessageInput | `inbox/MessageInput.tsx` | Input de envio de mensagem |
| QuickReplyManager | `inbox/QuickReplyManager.tsx` | Gerenciador de respostas rápidas |
| QuickRepliesPopover | `inbox/QuickRepliesPopover.tsx` | Popover de seleção de resposta rápida |
| AttendantsPopover | `inbox/AttendantsPopover.tsx` | Popover de atendentes |
| InboxSettingsPopover | `inbox/InboxSettingsPopover.tsx` | Popover de configurações |
| ContactMemoriesSheet | `inbox/ContactMemoriesSheet.tsx` | Sheet de memórias do contato (Mem0) |

### 3.5 Configurações (49 arquivos)

#### 3.5.1 Views Principais

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| SettingsView | `settings/SettingsView.tsx` | View principal de configurações |
| MetaDiagnosticsView | `settings/meta/MetaDiagnosticsView.tsx` | Diagnóstico da integração Meta |
| SettingsPerformanceView | `settings/performance/SettingsPerformanceView.tsx` | Métricas de performance |
| CredentialsForm | `settings/CredentialsForm.tsx` | Formulário de credenciais WhatsApp |
| AISettings | `settings/ai/AISettings.tsx` | Configurações de AI |
| TestContactPanel | `settings/TestContactPanel.tsx` | Painel de contato de teste |
| InboxRetentionPanel | `settings/InboxRetentionPanel.tsx` | Configuração de retenção de mensagens |
| AutoSuppressionPanel | `settings/AutoSuppressionPanel.tsx` | Configuração de supressão automática |
| CalendarBookingPanel | `settings/calendar/CalendarBookingPanel.tsx` | Configuração de agendamento |
| AIGatewayPanel | `settings/ai/AIGatewayPanel.tsx` | Gateway de AI (Helicone) |
| HeliconePanel | `settings/ai/HeliconePanel.tsx` | Configuração Helicone |
| Mem0Panel | `settings/ai/Mem0Panel.tsx` | Configuração Mem0 |
| UpstashConfigPanel | `settings/UpstashConfigPanel.tsx` | Configuração Upstash |
| WorkflowExecutionPanel | `settings/WorkflowExecutionPanel.tsx` | Painel de execução de workflows |

#### 3.5.2 Webhook (4 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| PhoneNumberCard | `settings/webhook/PhoneNumberCard.tsx` | Card de número de telefone |
| WebhookUrlConfig | `settings/webhook/WebhookUrlConfig.tsx` | Configuração de URL |
| WebhookSubscriptionStatus | `settings/webhook/WebhookSubscriptionStatus.tsx` | Status de subscrições |
| WebhookStatusIndicator | `settings/webhook/WebhookStatusIndicator.tsx` | Indicador visual de status |

#### 3.5.3 AI Agents (12 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| AIAgentsSettingsView | `settings/ai/agents/AIAgentsSettingsView.tsx` | View principal de agentes |
| AIAgentCard | `settings/ai/agents/AIAgentCard.tsx` | Card de agente individual |
| AIAgentForm | `settings/ai/agents/AIAgentForm.tsx` | Formulário de criação/edição |
| AIAgentTestChat | `settings/ai/agents/AIAgentTestChat.tsx` | Chat de teste do agente |
| KnowledgeBasePanel | `settings/ai/agents/KnowledgeBasePanel.tsx` | Painel de base de conhecimento |

#### 3.5.4 Calendar (19 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| CalendarWizardModal | `settings/calendar/wizard/CalendarWizardModal.tsx` | Modal wizard de integração |
| **5 wizard steps** | `settings/calendar/wizard/steps/*` | StepProvider, StepAvailability, StepBooking, StepConfirm, StepReview |

### 3.6 Dashboard (2 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| DashboardView | `dashboard/DashboardView.tsx` | View principal do dashboard |
| DashboardSkeleton | `dashboard/DashboardSkeleton.tsx` | Skeleton de carregamento |

### 3.7 Fluxos (15 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| FlowPublishPanel | `flows/FlowPublishPanel.tsx` | Painel de publicação |
| FlowTestPanel | `flows/FlowTestPanel.tsx` | Painel de teste |
| SendFlowDialog | `flows/SendFlowDialog.tsx` | Diálogo de envio |
| FlowBuilderListView | `flows/FlowBuilderListView.tsx` | Listagem de fluxos |
| UnifiedFlowEditor | `flows/UnifiedFlowEditor.tsx` | Editor unificado |
| FlowFormBuilder | `flows/FlowFormBuilder.tsx` | Builder de formulário |

### 3.8 Formulários de Lead (8 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| LeadFormsView | `forms/LeadFormsView.tsx` | View principal de formulários |
| FormsSkeleton | `forms/FormsSkeleton.tsx` | Skeleton de carregamento |
| **List sub-componentes** | `forms/list/*` | FormList, FormCard, CreateFormDialog |

### 3.9 Submissões (1 arquivo)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| SubmissionsView | `submissions/SubmissionsView.tsx` | View de submissões de formulários |

### 3.10 Onboarding (19 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| OnboardingModal | `onboarding/OnboardingModal.tsx` | Modal principal com 12 steps |
| OnboardingChecklist | `onboarding/OnboardingChecklist.tsx` | Checklist de configuração |
| ChecklistMiniBadge | `onboarding/ChecklistMiniBadge.tsx` | Badge de progresso |
| TutorialsSheet | `onboarding/TutorialsSheet.tsx` | Sheet de tutoriais |

### 3.11 Setup (4 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| SuccessBanner | `setup/SuccessBanner.tsx` | Banner de sucesso |
| EmptyStateBanner | `setup/EmptyStateBanner.tsx` | Banner de estado vazio |
| CredentialsModal | `setup/CredentialsModal.tsx` | Modal de credenciais |
| GuidedTour | `setup/GuidedTour.tsx` | Tour guiado |

## 4. Componentes do Builder (components/builder/) - 106 arquivos

### 4.1 UI (30 arquivos)

Duplicatas de componentes shadcn/ui específicos do builder:

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| IntegrationSelector | `ui/integration-selector.tsx` | Seletor de integrações |
| TemplateAutocomplete | `ui/template-autocomplete.tsx` | Autocomplete de templates |
| CodeEditor | `ui/code-editor.tsx` | Editor Monaco |
| TimezoneSelect | `ui/timezone-select.tsx` | Seletor de fuso horário |
| **shadcn duplicatas** | `ui/*.tsx` | button, card, dialog, input, label, select, etc. |

### 4.2 Workflow Canvas (48 arquivos)

#### 4.2.1 Canvas Principal

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| WorkflowCanvas | `workflow-canvas.tsx` | Canvas principal (React Flow + Jotai) |
| PersistentCanvas | `persistent-canvas.tsx` | Canvas com persistência automática |
| WorkflowToolbar | `workflow-toolbar.tsx` | Barra de ferramentas superior |
| WorkflowContextMenu | `workflow-context-menu.tsx` | Menu contextual do canvas |
| WorkflowRuns | `workflow-runs.tsx` | Painel de execuções |
| NodeConfigPanel | `node-config-panel.tsx` | Painel lateral de configuração |

#### 4.2.2 Nodes (12 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| TriggerNode | `nodes/TriggerNode.tsx` | Nó de início (start) |
| ActionNode | `nodes/ActionNode.tsx` | Nós de ação (message, template, menu, input, condition, delay, ai_agent, handoff, end) |
| AddNode | `nodes/AddNode.tsx` | Nó de adição (botão +) |

#### 4.2.3 Config Panels (15 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| StartConfig | `config/StartConfig.tsx` | Configuração de início |
| MessageConfig | `config/MessageConfig.tsx` | Configuração de mensagem |
| TemplateConfig | `config/TemplateConfig.tsx` | Configuração de template |
| MenuConfig | `config/MenuConfig.tsx` | Configuração de menu |
| InputConfig | `config/InputConfig.tsx` | Configuração de input |
| ConditionConfig | `config/ConditionConfig.tsx` | Configuração de condição |
| DelayConfig | `config/DelayConfig.tsx` | Configuração de delay |
| AIAgentConfig | `config/AIAgentConfig.tsx` | Configuração de agente AI |
| HandoffConfig | `config/HandoffConfig.tsx` | Configuração de handoff |
| EndConfig | `config/EndConfig.tsx` | Configuração de fim |

#### 4.2.4 Toolbar (5 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| ToolbarActions | `toolbar/ToolbarActions.tsx` | Ações (save, publish, test) |
| ToolbarZoom | `toolbar/ToolbarZoom.tsx` | Controles de zoom |
| ToolbarMinimap | `toolbar/ToolbarMinimap.tsx` | Toggle de minimapa |
| ToolbarHelp | `toolbar/ToolbarHelp.tsx` | Ajuda |

#### 4.2.5 Runs (6 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| RunsList | `runs/RunsList.tsx` | Lista de execuções |
| RunDetails | `runs/RunDetails.tsx` | Detalhes de execução |
| RunTimeline | `runs/RunTimeline.tsx` | Timeline de steps |
| RunStepCard | `runs/RunStepCard.tsx` | Card de step individual |

### 4.3 Overlays (18 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| OverlayProvider | `overlays/overlay-provider.tsx` | Provider de overlays |
| OverlayContainer | `overlays/overlay-container.tsx` | Container de renderização |
| ConfigurationOverlay | `overlays/configuration.tsx` | Overlay de configuração |
| IntegrationsOverlay | `overlays/integrations.tsx` | Overlay de integrações |
| SettingsOverlay | `overlays/settings.tsx` | Overlay de configurações |
| APIKeysOverlay | `overlays/api-keys.tsx` | Overlay de chaves API |
| AddConnectionOverlay | `overlays/add-connection.tsx` | Overlay de nova conexão |
| EditConnectionOverlay | `overlays/edit-connection.tsx` | Overlay de edição de conexão |
| ExportOverlay | `overlays/export.tsx` | Overlay de exportação |
| MakePublicOverlay | `overlays/make-public.tsx` | Overlay de publicação |
| ConfirmOverlay | `overlays/confirm.tsx` | Overlay de confirmação |
| AlertOverlay | `overlays/alert.tsx` | Overlay de alerta |
| AIGatewayConsentOverlay | `overlays/ai-gateway-consent.tsx` | Overlay de consentimento AI |

### 4.4 Elementos AI (8 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| AICanvas | `ai/canvas.tsx` | Canvas com sugestões AI |
| AINode | `ai/node.tsx` | Nó com capacidades AI |
| AIEdge | `ai/edge.tsx` | Edge com sugestões AI |
| AIConnection | `ai/connection.tsx` | Conexão inteligente |
| AIControls | `ai/controls.tsx` | Controles AI |
| AIPanel | `ai/panel.tsx` | Painel de sugestões |
| AIPrompt | `ai/prompt.tsx` | Input de prompt |
| AIShimmer | `ai/shimmer.tsx` | Efeito de carregamento |

## 5. Componentes de Padrão (components/patterns/) - 9 arquivos

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| ListPageLayout | `list-page-layout.tsx` | Layout padrão para páginas de listagem |
| WizardPageLayout | `wizard-page-layout.tsx` | Layout padrão para wizards |
| FilterBar | `filter-bar.tsx` | Barra de filtros reutilizável |
| Pagination | `pagination.tsx` | Controles de paginação |
| ActionButtons | `action-buttons.tsx` | Grupo de botões de ação |
| FormSection | `form-section.tsx` | Seção de formulário com título |
| StatsCard | `stats-card.tsx` | Card de estatística genérico |
| SummaryPanel | `summary-panel.tsx` | Painel de resumo lateral |
| Stepper | `stepper.tsx` | Indicador de passos genérico |

## 6. Wizard de Instalação (components/install/) - 21 arquivos

### 6.1 Layout e UI (9 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| InstallLayout | `InstallLayout.tsx` | Layout principal do wizard |
| StepCard | `StepCard.tsx` | Card de passo individual |
| StepDots | `StepDots.tsx` | Indicador de progresso |
| ValidatingOverlay | `ValidatingOverlay.tsx` | Overlay de validação |
| TokenInput | `TokenInput.tsx` | Input de token/chave |
| ServiceIcon | `ServiceIcon.tsx` | Ícone de serviço |
| SuccessCheckmark | `SuccessCheckmark.tsx` | Checkmark animado |
| ErrorView | `ErrorView.tsx` | View de erro |
| RainEffect | `RainEffect.tsx` | Efeito de chuva (celebração) |

### 6.2 Steps (5 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| IdentityStep | `steps/IdentityStep.tsx` | Passo 1: identidade (senha master) |
| SupabaseStep | `steps/SupabaseStep.tsx` | Passo 2: Supabase |
| RedisStep | `steps/RedisStep.tsx` | Passo 3: Upstash Redis |
| VercelStep | `steps/VercelStep.tsx` | Passo 4: Vercel |
| QStashStep | `steps/QStashStep.tsx` | Passo 5: QStash |

### 6.3 Forms (7 arquivos)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| IdentityForm | `forms/IdentityForm.tsx` | Formulário de senha |
| VercelForm | `forms/VercelForm.tsx` | Formulário Vercel |
| QStashForm | `forms/QStashForm.tsx` | Formulário QStash |

## 7. Páginas do Dashboard (app/(dashboard)/) - 27 páginas

Todas as páginas seguem o padrão: **Page (thin)** → **ClientWrapper** → **Hook (controller)** → **View (presentational)**

### 7.1 Rotas Principais

| Rota | Arquivo | Descrição |
|------|---------|-----------|
| `/` | `page.tsx` | Dashboard principal |
| `/campaigns` | `campaigns/page.tsx` | Listagem de campanhas |
| `/campaigns/new` | `campaigns/new/page.tsx` | Wizard de nova campanha |
| `/campaigns/[id]` | `campaigns/[id]/page.tsx` | Detalhes de campanha |
| `/contacts` | `contacts/page.tsx` | Listagem de contatos |
| `/templates` | `templates/page.tsx` | Listagem de templates |
| `/templates/new` | `templates/new/page.tsx` | Builder manual (novo template) |
| `/templates/[id]` | `templates/[id]/page.tsx` | Builder manual (edição) |
| `/templates/drafts/new` | `templates/drafts/new/page.tsx` | Novo rascunho |
| `/templates/drafts/[id]` | `templates/drafts/[id]/page.tsx` | Edição de rascunho |
| `/inbox` | `inbox/page.tsx` | Inbox principal |
| `/inbox/[conversationId]` | `inbox/[conversationId]/page.tsx` | Conversa específica |
| `/forms` | `forms/page.tsx` | Formulários de lead |
| `/submissions` | `submissions/page.tsx` | Submissões de formulários |
| `/flows` | `flows/page.tsx` | Listagem de fluxos |
| `/flows/builder` | `flows/builder/page.tsx` | Builder de novo fluxo |
| `/flows/builder/[id]` | `flows/builder/[id]/page.tsx` | Edição de fluxo |
| `/builder/[id]` | `builder/[id]/page.tsx` | Builder unificado |
| `/workflows` | `workflows/page.tsx` | Listagem de workflows |
| `/settings` | `settings/page.tsx` | Configurações gerais |
| `/settings/ai` | `settings/ai/page.tsx` | Configurações de AI |
| `/settings/ai/agents` | `settings/ai/agents/page.tsx` | Gerenciamento de agentes AI |
| `/settings/attendants` | `settings/attendants/page.tsx` | Gerenciamento de atendentes |
| `/settings/performance` | `settings/performance/page.tsx` | Métricas de performance |
| `/settings/meta-diagnostics` | `settings/meta-diagnostics/page.tsx` | Diagnóstico Meta |
| `/design-system` | `design-system/page.tsx` | Sistema de design (modo escuro) |
| `/design-system-light` | `design-system-light/page.tsx` | Sistema de design (modo claro) |

## 8. Dependências Principais

### 8.1 UI e Styling

| Biblioteca | Uso |
|------------|-----|
| shadcn/ui | Componentes base (Radix UI) |
| Radix UI | Primitivos acessíveis |
| lucide-react | Ícones (exclusivo) |
| Tailwind CSS v4 | Styling (tema escuro padrão, cores primary emerald/green) |
| next-themes | Gerenciamento de tema |

### 8.2 State e Forms

| Biblioteca | Uso |
|------------|-----|
| @tanstack/react-query | Client state + cache (staleTime: 30s, gcTime: 5min, retry: 1) |
| jotai | State global (apenas builder) |
| react-hook-form | Gerenciamento de formulários |
| zod v4 | Validação de schemas |

### 8.3 Editores e Visualização

| Biblioteca | Uso |
|------------|-----|
| @xyflow/react | Editor de fluxos (React Flow) |
| @monaco-editor/react | Editor de código |
| recharts | Gráficos (lazy-loaded via `lazy-charts.tsx`) |
| react-day-picker | Calendário |

### 8.4 Notificações e Feedback

| Biblioteca | Uso |
|------------|-----|
| sonner | Sistema de toast (via `themed-toaster.tsx`) |
| vaul | Drawer mobile |

### 8.5 Utilitários

| Biblioteca | Uso |
|------------|-----|
| date-fns | Manipulação de datas |
| clsx + tailwind-merge | Merge de classes CSS |
| libphonenumber-js | Validação de telefone |

## 9. Convenções de Estilo

### 9.1 Paleta de Cores

```css
/* Primárias */
--primary-400: emerald-400
--primary-500: emerald-500  /* Cor principal */
--primary-600: emerald-600

/* Backgrounds */
--bg-primary: zinc-950
--bg-secondary: zinc-900
--bg-tertiary: zinc-800

/* Borders */
--border: zinc-800
```

### 9.2 Convenções de Nomenclatura

- **View Components**: sufixo `View` (ex: `CampaignListView`)
- **Controller Hooks**: prefixo `use` + sufixo `Controller` (ex: `useCampaignsController`)
- **Service Functions**: sufixo `Service` (ex: `campaignService.ts`)
- **Type Interfaces**: PascalCase sem sufixo (ex: `Campaign`, `Template`)
- **Enums**: PascalCase (ex: `CampaignStatus`, `TemplateCategory`)

### 9.3 Estrutura de Arquivos

```
feature/
├── FeatureView.tsx           # Componente de apresentação
├── FeatureController.ts      # Hook controller (se necessário)
├── components/               # Sub-componentes
│   ├── FeatureHeader.tsx
│   ├── FeatureList.tsx
│   └── FeatureCard.tsx
├── hooks/                    # Hooks específicos
│   └── useFeature.ts
└── types.ts                  # Tipos específicos (se muitos)
```

## 10. Padrões de Composição

### 10.1 Page → Hook → Service → API

```typescript
// 1. Page (thin, apenas wiring)
export default function CampaignsPage() {
  return <CampaignsClientWrapper />
}

// 2. Hook (controller, React Query + state)
export const useCampaignsController = () => {
  const { data } = useCampaignsQuery()
  const [filter, setFilter] = useState('All')
  const filteredCampaigns = useMemo(() => ...)
  return { campaigns, filter, setFilter, onDelete }
}

// 3. Service (typed fetch wrapper)
export const campaignService = {
  getAll: () => fetch('/api/campaigns').then(r => r.json()),
  create: (data) => fetch('/api/campaigns', { method: 'POST', body: JSON.stringify(data) })
}

// 4. API Route (validation + DB)
export async function GET() {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('campaigns').select('*')
  return Response.json(data)
}
```

### 10.2 Component/Controller Separation

```typescript
// View (pure presentational)
interface CampaignListViewProps {
  campaigns: Campaign[]
  onDelete: (id: string) => void
  onRowClick: (id: string) => void
}

export const CampaignListView: React.FC<CampaignListViewProps> = ({
  campaigns,
  onDelete,
  onRowClick
}) => {
  return (
    <div>
      {campaigns.map(c => (
        <CampaignCard key={c.id} campaign={c} onClick={() => onRowClick(c.id)} />
      ))}
    </div>
  )
}

// Controller (logic + side effects)
const controller = useCampaignsController()
return <CampaignListView {...controller} />
```

## 11. Acessibilidade

### 11.1 Componentes Acessíveis

Todos os componentes shadcn/ui são construídos sobre Radix UI, que fornece:

- **ARIA labels** completos
- **Navegação por teclado** (Tab, Enter, Escape, Arrow keys)
- **Screen reader support** testado
- **Focus management** automático

### 11.2 Convenções

- Formulários sempre com `<Label>` associado via `htmlFor`
- Botões de ação com `aria-label` descritivo quando não há texto visível
- Modais com `aria-describedby` e `aria-labelledby`
- Status/alerts com `role="status"` ou `role="alert"`

## 12. Performance

### 12.1 Otimizações

- **React Compiler** ativado (memoização automática)
- **React Query** com `staleTime: 30s` e `gcTime: 5min`
- **Lazy loading** de gráficos via `lazy-charts.tsx`
- **Debounced invalidations** no CentralizedRealtimeProvider
- **Optimized imports** para lucide-react e Radix UI

### 12.2 Code Splitting

- Páginas do dashboard carregadas sob demanda (App Router)
- Monaco Editor carregado apenas quando necessário
- Recharts lazy-loaded com Suspense

## 13. Testes

### 13.1 Convenções de Arquivo

- **Unit tests (Vitest)**: `*.test.ts` ou `*.test.tsx`
- **E2E tests (Playwright)**: `*.spec.ts` (dentro de `tests/e2e/`)

### 13.2 Coverage

Principais áreas cobertas:

- Utilitários (phone formatter, WhatsApp errors)
- Hooks controllers
- Componentes de apresentação (smoke tests)
- Fluxos E2E críticos (WhatsApp, AI API)

## 14. Observabilidade

### 14.1 Dev Mode

- **DevModeProvider** com toggle persistido em localStorage
- **DevModeToggle** no header do dashboard
- Exibe informações adicionais quando ativado (IDs, metadata, traces)

### 14.2 Realtime

- **RealtimeIndicator** mostra status de conexão Supabase
- **CentralizedRealtimeProvider** gerencia todas as subscriptions
- Debounce de 500ms para invalidações em massa

### 14.3 Performance Monitoring

- **SettingsPerformanceView** exibe métricas do sistema
- Integração com Helicone para AI gateway (quando configurado)

---

**Documento gerado automaticamente em 08/02/2026**
**Última atualização manual:** Nunca (gerado via Claude Code)
