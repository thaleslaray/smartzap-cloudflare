# SmartZap - Árvore de Código Fonte Anotada

Estrutura completa do projeto com descrições de cada diretório e arquivo principal.

Gerado em: 2026-02-08

```
smartzap/
├── app/                                    # Next.js App Router (App Directory)
│   ├── (auth)/                             # Grupo de rotas de autenticação
│   │   ├── install/                        # Wizard de instalação inicial
│   │   │   ├── page.tsx                    # Página principal do instalador
│   │   │   ├── steps/                      # Steps do wizard
│   │   │   └── layout.tsx                  # Layout do instalador
│   │   ├── login/                          # Página de login
│   │   │   ├── page.tsx                    # Formulário de login com MASTER_PASSWORD
│   │   │   └── LoginForm.tsx               # Componente do formulário
│   │   └── layout.tsx                      # Layout compartilhado de auth
│   │
│   ├── (dashboard)/                        # Grupo de rotas do dashboard (27 páginas)
│   │   ├── DashboardShell.tsx              # Shell principal com sidebar, alerts, onboarding
│   │   ├── DashboardClientWrapper.tsx      # Wrapper client-side
│   │   ├── DashboardClientLoader.tsx       # Loader de dados do dashboard
│   │   ├── page.tsx                        # Home do dashboard com métricas
│   │   │
│   │   ├── campaigns/                      # Gestão de campanhas
│   │   │   ├── page.tsx                    # Lista de campanhas
│   │   │   ├── new/page.tsx                # Criar nova campanha (wizard)
│   │   │   └── [id]/page.tsx               # Detalhes/edição de campanha
│   │   │
│   │   ├── contacts/                       # Gestão de contatos
│   │   │   ├── page.tsx                    # Lista de contatos com filtros
│   │   │   ├── import/page.tsx             # Importação de contatos (CSV)
│   │   │   └── [id]/page.tsx               # Detalhes do contato
│   │   │
│   │   ├── templates/                      # Gestão de templates WhatsApp
│   │   │   ├── page.tsx                    # Lista de templates (Meta API)
│   │   │   ├── new/page.tsx                # Criar template
│   │   │   ├── drafts/page.tsx             # Rascunhos de templates
│   │   │   └── [id]/page.tsx               # Edição de template
│   │   │
│   │   ├── inbox/                          # Inbox de conversas WhatsApp
│   │   │   ├── page.tsx                    # Lista de conversas
│   │   │   └── [conversationId]/page.tsx   # Thread de conversa individual
│   │   │
│   │   ├── flows/                          # WhatsApp Flows (MiniApps)
│   │   │   ├── page.tsx                    # Lista de flows
│   │   │   └── builder/page.tsx            # Builder visual de flows
│   │   │
│   │   ├── forms/                          # Formulários de captação de leads
│   │   │   ├── page.tsx                    # Lista de formulários
│   │   │   └── [id]/page.tsx               # Editor de formulário
│   │   │
│   │   ├── submissions/                    # Submissões de formulários
│   │   │   └── page.tsx                    # Lista de submissões recebidas
│   │   │
│   │   ├── workflows/                      # Workflows de automação
│   │   │   └── page.tsx                    # Lista de workflows (Upstash)
│   │   │
│   │   ├── builder/                        # Editor visual de workflows
│   │   │   └── [id]/page.tsx               # Canvas React Flow com nodes
│   │   │
│   │   ├── settings/                       # Configurações do sistema
│   │   │   ├── page.tsx                    # Settings gerais (credentials)
│   │   │   ├── ai/page.tsx                 # Configuração AI (Gemini)
│   │   │   ├── agents/page.tsx             # AI Agents (inbox automation)
│   │   │   ├── attendants/page.tsx         # Atendentes humanos
│   │   │   ├── performance/page.tsx        # Métricas de performance
│   │   │   └── diagnostics/page.tsx        # Diagnósticos e logs
│   │   │
│   │   ├── design-system/                  # Showcase de componentes (dev-only)
│   │   │   └── page.tsx                    # Galeria de UI components
│   │   │
│   │   └── layout.tsx                      # Layout do dashboard (sidebar + header)
│   │
│   ├── api/                                # API Routes (200+ endpoints, 50+ diretórios)
│   │   ├── ai-agents/                      # AI Agents
│   │   │   ├── route.ts                    # CRUD de agents
│   │   │   ├── [agentId]/                  # Operações por agent
│   │   │   │   ├── chat/route.ts           # Chat com agent
│   │   │   │   ├── test/route.ts           # Teste de agent
│   │   │   │   └── knowledge/route.ts      # Knowledge base do agent
│   │   │   └── default/route.ts            # Agent padrão
│   │   │
│   │   ├── ai/                             # Geração AI (Gemini)
│   │   │   ├── generate-template/route.ts  # Gerar template via AI
│   │   │   ├── generate-flow/route.ts      # Gerar flow via AI
│   │   │   └── respond/route.ts            # Resposta AI para inbox
│   │   │
│   │   ├── attendant*/                     # Atendentes
│   │   │   ├── attendant-sessions/route.ts # Sessões de atendimento
│   │   │   └── attendants/route.ts         # CRUD de atendentes
│   │   │
│   │   ├── auth/                           # Autenticação
│   │   │   ├── login/route.ts              # POST login (bcrypt)
│   │   │   ├── logout/route.ts             # POST logout
│   │   │   ├── setup/route.ts              # GET status de setup
│   │   │   └── status/route.ts             # GET status de auth
│   │   │
│   │   ├── builder/                        # Workflow Builder API
│   │   │   ├── workflows/route.ts          # CRUD de workflows
│   │   │   ├── integrations/route.ts       # Integrações externas
│   │   │   └── api-keys/route.ts           # API keys de integrações
│   │   │
│   │   ├── campaign/                       # Operações de campanha
│   │   │   ├── dispatch/route.ts           # Disparar campanha (QStash)
│   │   │   ├── pause/route.ts              # Pausar campanha
│   │   │   ├── resume/route.ts             # Retomar campanha
│   │   │   └── cancel/route.ts             # Cancelar campanha
│   │   │
│   │   ├── campaigns/                      # CRUD de campanhas
│   │   │   ├── route.ts                    # GET/POST campaigns
│   │   │   ├── [id]/route.ts               # GET/PATCH/DELETE campaign
│   │   │   ├── folders/route.ts            # Pastas de campanhas
│   │   │   ├── tags/route.ts               # Tags de campanhas
│   │   │   └── metrics/route.ts            # Métricas agregadas
│   │   │
│   │   ├── contacts/                       # CRUD de contatos
│   │   │   ├── route.ts                    # GET/POST contacts
│   │   │   ├── [id]/route.ts               # GET/PATCH/DELETE contact
│   │   │   ├── import/route.ts             # Importação CSV
│   │   │   ├── stats/route.ts              # Estatísticas de contatos
│   │   │   ├── tags/route.ts               # Tags de contatos
│   │   │   └── segments/route.ts           # Segmentação dinâmica
│   │   │
│   │   ├── custom-fields/                  # Campos customizados
│   │   │   └── route.ts                    # CRUD de definições de campos
│   │   │
│   │   ├── dashboard/                      # Dashboard stats
│   │   │   ├── stats/route.ts              # Métricas principais
│   │   │   └── recent-activity/route.ts    # Atividade recente
│   │   │
│   │   ├── debug/                          # Endpoints de debug
│   │   │   ├── ai-logs/route.ts            # Logs de AI requests
│   │   │   └── diagnostics/route.ts        # Diagnósticos do sistema
│   │   │
│   │   ├── flows/                          # WhatsApp Flows
│   │   │   ├── route.ts                    # CRUD de flows
│   │   │   ├── [id]/endpoint/route.ts      # Endpoint público do flow
│   │   │   └── submissions/route.ts        # Submissões de flows
│   │   │
│   │   ├── health/                         # Health check
│   │   │   └── route.ts                    # GET health status (público)
│   │   │
│   │   ├── inbox/                          # Inbox WhatsApp
│   │   │   ├── conversations/route.ts      # Lista de conversas
│   │   │   ├── messages/route.ts           # Enviar mensagem
│   │   │   ├── labels/route.ts             # Labels de conversas
│   │   │   └── quick-replies/route.ts      # Respostas rápidas
│   │   │
│   │   ├── installer/                      # Install wizard API
│   │   │   ├── provision/route.ts          # Provisionar recursos
│   │   │   ├── validate/route.ts           # Validar configuração
│   │   │   └── bootstrap/route.ts          # Bootstrap inicial
│   │   │
│   │   ├── integrations/                   # Integrações externas
│   │   │   ├── google/                     # Google Calendar OAuth
│   │   │   └── webhooks/route.ts           # Webhooks de integrações
│   │   │
│   │   ├── lead-forms/                     # Formulários de leads
│   │   │   ├── route.ts                    # CRUD de forms
│   │   │   └── [id]/route.ts               # Operações por form
│   │   │
│   │   ├── mem0/                           # Memória de conversas (Mem0)
│   │   │   ├── memories/route.ts           # CRUD de memórias
│   │   │   └── search/route.ts             # Busca semântica
│   │   │
│   │   ├── messages/                       # Mensagens WhatsApp
│   │   │   └── send/route.ts               # Enviar mensagem de teste
│   │   │
│   │   ├── meta/                           # Meta WhatsApp API
│   │   │   ├── diagnostics/route.ts        # Diagnósticos de API
│   │   │   ├── uploads/route.ts            # Upload de mídia
│   │   │   └── webhooks/route.ts           # Gestão de webhooks
│   │   │
│   │   ├── phone-numbers/                  # Números WhatsApp
│   │   │   └── route.ts                    # Lista phone numbers
│   │   │
│   │   ├── public/                         # Endpoints públicos
│   │   │   └── lead-forms/route.ts         # Submit de form público
│   │   │
│   │   ├── push/                           # Push notifications
│   │   │   ├── subscribe/route.ts          # Subscrever push
│   │   │   └── send/route.ts               # Enviar push
│   │   │
│   │   ├── settings/                       # Settings do sistema
│   │   │   ├── route.ts                    # GET/POST settings
│   │   │   ├── credentials/route.ts        # WhatsApp credentials
│   │   │   ├── ai/route.ts                 # AI settings
│   │   │   └── throttle/route.ts           # Rate limiting config
│   │   │
│   │   ├── submissions/                    # Form submissions
│   │   │   └── route.ts                    # GET submissions
│   │   │
│   │   ├── system/                         # System info
│   │   │   └── info/route.ts               # Informações do sistema
│   │   │
│   │   ├── template-projects/              # Template projects
│   │   │   └── route.ts                    # CRUD de projects
│   │   │
│   │   ├── templates/                      # Templates WhatsApp
│   │   │   ├── route.ts                    # GET templates (Meta API)
│   │   │   ├── sync/route.ts               # Sincronizar com Meta
│   │   │   └── [id]/route.ts               # Operações por template
│   │   │
│   │   ├── usage/                          # Usage metrics
│   │   │   └── route.ts                    # GET usage stats
│   │   │
│   │   ├── vercel/                         # Vercel API (admin)
│   │   │   ├── deployments/route.ts        # Lista deployments
│   │   │   └── env/route.ts                # Gerenciar env vars
│   │   │
│   │   └── webhook/                        # Meta webhook (entry point)
│   │       └── route.ts                    # GET/POST webhook (público)
│   │
│   ├── atendimento/                        # Portal de atendimento
│   │   ├── page.tsx                        # Interface de atendente
│   │   └── layout.tsx                      # Layout do portal
│   │
│   ├── docs/                               # Página de documentação
│   │   └── page.tsx                        # Documentação embarcada
│   │
│   ├── layout.tsx                          # Root layout (HTML, body, providers)
│   ├── providers.tsx                       # Provider stack (Theme, Query, Realtime, PWA)
│   └── globals.css                         # Global styles (Tailwind v4)
│
├── components/                             # Componentes React (460+ arquivos)
│   ├── ui/                                 # shadcn/ui primitives (59 arquivos)
│   │   ├── accordion.tsx                   # Accordion (Radix)
│   │   ├── alert-dialog.tsx                # Alert Dialog (Radix)
│   │   ├── badge.tsx                       # Badge
│   │   ├── button.tsx                      # Button (variants: default, destructive, outline, etc)
│   │   ├── calendar.tsx                    # Calendar (react-day-picker)
│   │   ├── card.tsx                        # Card (Header, Content, Footer)
│   │   ├── checkbox.tsx                    # Checkbox (Radix)
│   │   ├── command.tsx                     # Command palette (cmdk)
│   │   ├── dialog.tsx                      # Dialog (Radix)
│   │   ├── dropdown-menu.tsx               # Dropdown Menu (Radix)
│   │   ├── form.tsx                        # Form (react-hook-form)
│   │   ├── input.tsx                       # Input
│   │   ├── label.tsx                       # Label (Radix)
│   │   ├── popover.tsx                     # Popover (Radix)
│   │   ├── select.tsx                      # Select (Radix)
│   │   ├── separator.tsx                   # Separator (Radix)
│   │   ├── sheet.tsx                       # Sheet/Drawer (Radix Dialog)
│   │   ├── skeleton.tsx                    # Skeleton loader
│   │   ├── slider.tsx                      # Slider (Radix)
│   │   ├── switch.tsx                      # Switch (Radix)
│   │   ├── table.tsx                       # Table
│   │   ├── tabs.tsx                        # Tabs (Radix)
│   │   ├── textarea.tsx                    # Textarea
│   │   ├── toast.tsx                       # Toast (sonner)
│   │   ├── tooltip.tsx                     # Tooltip (Radix)
│   │   └── ...                             # 40+ outros componentes UI
│   │
│   ├── features/                           # Componentes de features (228 arquivos)
│   │   ├── campaigns/                      # Campanhas (30+ arquivos)
│   │   │   ├── CampaignListView.tsx        # Lista de campanhas (presentational)
│   │   │   ├── CampaignWizard.tsx          # Wizard de criação
│   │   │   ├── CampaignDetails.tsx         # Detalhes da campanha
│   │   │   ├── CampaignStats.tsx           # Estatísticas
│   │   │   └── ...                         # Outros componentes de campanha
│   │   │
│   │   ├── contacts/                       # Contatos (20+ arquivos)
│   │   │   ├── ContactListView.tsx         # Lista de contatos
│   │   │   ├── ContactImport.tsx           # Importação CSV
│   │   │   ├── ContactSegments.tsx         # Segmentação
│   │   │   └── ...                         # Outros componentes de contato
│   │   │
│   │   ├── templates/                      # Templates (25+ arquivos)
│   │   │   ├── TemplateListView.tsx        # Lista de templates
│   │   │   ├── TemplateBuilder.tsx         # Builder de template
│   │   │   ├── TemplatePreview.tsx         # Preview WhatsApp
│   │   │   └── ...                         # Outros componentes de template
│   │   │
│   │   ├── inbox/                          # Inbox (12 arquivos)
│   │   │   ├── ConversationList.tsx        # Lista de conversas
│   │   │   ├── MessageThread.tsx           # Thread de mensagens
│   │   │   ├── QuickReplies.tsx            # Respostas rápidas
│   │   │   └── ...                         # Outros componentes de inbox
│   │   │
│   │   ├── settings/                       # Settings (49 arquivos)
│   │   │   ├── CredentialsForm.tsx         # Formulário de credenciais
│   │   │   ├── AISettings.tsx              # Configuração AI
│   │   │   ├── AgentsList.tsx              # Lista de AI agents
│   │   │   └── ...                         # Outros componentes de settings
│   │   │
│   │   ├── flows/                          # Flows (15+ arquivos)
│   │   │   ├── FlowBuilder.tsx             # Builder de flows
│   │   │   ├── FlowPreview.tsx             # Preview de flow
│   │   │   └── ...                         # Outros componentes de flows
│   │   │
│   │   ├── lead-forms/                     # Lead forms (10+ arquivos)
│   │   │   ├── FormBuilder.tsx             # Builder de formulários
│   │   │   ├── FormPreview.tsx             # Preview de form
│   │   │   └── ...                         # Outros componentes de forms
│   │   │
│   │   ├── dashboard/                      # Dashboard (15+ arquivos)
│   │   │   ├── DashboardMetrics.tsx        # Métricas principais
│   │   │   ├── RecentActivity.tsx          # Atividade recente
│   │   │   └── ...                         # Outros componentes de dashboard
│   │   │
│   │   ├── onboarding/                     # Onboarding (19 arquivos)
│   │   │   ├── OnboardingFlow.tsx          # Flow de onboarding
│   │   │   ├── OnboardingChecklist.tsx     # Checklist de setup
│   │   │   └── ...                         # Outros componentes de onboarding
│   │   │
│   │   ├── setup/                          # Post-setup (8+ arquivos)
│   │   │   ├── SetupWizard.tsx             # Wizard pós-instalação
│   │   │   └── ...                         # Outros componentes de setup
│   │   │
│   │   └── submissions/                    # Submissions (5+ arquivos)
│   │       ├── SubmissionsList.tsx         # Lista de submissões
│   │       └── ...                         # Outros componentes de submissions
│   │
│   ├── builder/                            # Workflow Builder UI (106 arquivos)
│   │   ├── ai-elements/                    # Custom React Flow nodes
│   │   │   ├── AIAgentNode.tsx             # Node de AI Agent
│   │   │   ├── ConditionNode.tsx           # Node de condição
│   │   │   ├── DelayNode.tsx               # Node de delay
│   │   │   ├── HandoffNode.tsx             # Node de handoff
│   │   │   ├── InputNode.tsx               # Node de input
│   │   │   ├── MenuNode.tsx                # Node de menu
│   │   │   ├── MessageNode.tsx             # Node de mensagem
│   │   │   ├── TemplateNode.tsx            # Node de template
│   │   │   └── ...                         # Outros custom nodes
│   │   │
│   │   ├── workflow/                       # Canvas e configuração (40+ arquivos)
│   │   │   ├── WorkflowCanvas.tsx          # Canvas React Flow
│   │   │   ├── NodeConfigPanel.tsx         # Painel de configuração
│   │   │   ├── WorkflowRuns.tsx            # Histórico de execuções
│   │   │   └── ...                         # Outros componentes de workflow
│   │   │
│   │   ├── overlays/                       # Modal overlays (15+ arquivos)
│   │   │   ├── AIAgentOverlay.tsx          # Modal de AI Agent
│   │   │   ├── ConditionOverlay.tsx        # Modal de condição
│   │   │   └── ...                         # Outros overlays
│   │   │
│   │   ├── ui/                             # Builder-specific UI (20+ arquivos)
│   │   │   ├── Toolbar.tsx                 # Toolbar do builder
│   │   │   ├── NodePalette.tsx             # Paleta de nodes
│   │   │   └── ...                         # Outros componentes UI
│   │   │
│   │   └── settings/                       # Builder settings (10+ arquivos)
│   │       ├── WorkflowSettings.tsx        # Settings do workflow
│   │       └── ...                         # Outros settings
│   │
│   ├── patterns/                           # Padrões de layout reutilizáveis (9 arquivos)
│   │   ├── PageLayout.tsx                  # Layout padrão de página
│   │   ├── EmptyState.tsx                  # Estado vazio
│   │   ├── ErrorBoundary.tsx               # Error boundary
│   │   └── ...                             # Outros padrões
│   │
│   ├── providers/                          # Context providers (5 arquivos)
│   │   ├── ThemeProvider.tsx               # Tema (next-themes)
│   │   ├── QueryProvider.tsx               # React Query
│   │   ├── DevModeProvider.tsx             # Dev mode
│   │   ├── RealtimeProvider.tsx            # Supabase Realtime
│   │   └── PWAProvider.tsx                 # PWA
│   │
│   ├── install/                            # Install wizard components (21 arquivos)
│   │   ├── InstallWizard.tsx               # Wizard principal
│   │   ├── steps/                          # Steps do wizard
│   │   │   ├── WelcomeStep.tsx             # Step de boas-vindas
│   │   │   ├── CredentialsStep.tsx         # Step de credenciais
│   │   │   ├── ValidationStep.tsx          # Step de validação
│   │   │   └── ...                         # Outros steps
│   │   └── ...                             # Outros componentes de install
│   │
│   ├── layout/                             # Layout components (8+ arquivos)
│   │   ├── Sidebar.tsx                     # Sidebar principal
│   │   ├── Header.tsx                      # Header
│   │   ├── Footer.tsx                      # Footer
│   │   └── ...                             # Outros componentes de layout
│   │
│   ├── shared/                             # Componentes compartilhados (15+ arquivos)
│   │   ├── LoadingSpinner.tsx              # Spinner de loading
│   │   ├── ErrorMessage.tsx                # Mensagem de erro
│   │   └── ...                             # Outros componentes shared
│   │
│   ├── pwa/                                # PWA components (5+ arquivos)
│   │   ├── InstallPrompt.tsx               # Prompt de instalação
│   │   └── ...                             # Outros componentes PWA
│   │
│   └── attendant/                          # Componentes de atendente (10+ arquivos)
│       ├── AttendantDashboard.tsx          # Dashboard do atendente
│       └── ...                             # Outros componentes de atendente
│
├── hooks/                                  # Controller hooks (57 arquivos)
│   ├── campaigns/                          # Hooks de campanhas
│   │   ├── useCampaigns.ts                 # Controller de campanhas
│   │   ├── useCampaignDetails.ts           # Detalhes de campanha
│   │   └── ...                             # Outros hooks de campanhas
│   │
│   ├── settings/                           # Hooks de settings
│   │   ├── useSettings.ts                  # Controller de settings
│   │   └── ...                             # Outros hooks de settings
│   │
│   ├── useContacts.ts                      # Controller de contatos
│   ├── useTemplates.ts                     # Controller de templates
│   ├── useInbox.ts                         # Controller de inbox
│   ├── useFlows.ts                         # Controller de flows
│   ├── useWorkflows.ts                     # Controller de workflows
│   ├── useAIAgents.ts                      # Controller de AI agents
│   ├── useDashboard.ts                     # Controller de dashboard
│   ├── useAuth.ts                          # Controller de autenticação
│   ├── useRealtime.ts                      # Hook de Supabase Realtime
│   ├── useDebounce.ts                      # Hook de debounce
│   ├── useLocalStorage.ts                  # Hook de localStorage
│   └── ...                                 # 40+ outros hooks
│
├── services/                               # API client layer (19 arquivos)
│   ├── campaignService.ts                  # API calls de campanhas
│   ├── contactService.ts                   # API calls de contatos
│   ├── templateService.ts                  # API calls de templates
│   ├── inboxService.ts                     # API calls de inbox
│   ├── flowService.ts                      # API calls de flows
│   ├── workflowService.ts                  # API calls de workflows
│   ├── aiAgentService.ts                   # API calls de AI agents
│   ├── settingsService.ts                  # API calls de settings
│   ├── authService.ts                      # API calls de auth
│   ├── metaService.ts                      # API calls de Meta API
│   ├── dashboardService.ts                 # API calls de dashboard
│   ├── leadFormService.ts                  # API calls de lead forms
│   ├── submissionService.ts                # API calls de submissions
│   ├── mem0Service.ts                      # API calls de Mem0
│   ├── whatsappService.ts                  # API calls de WhatsApp
│   └── ...                                 # 4+ outros services
│
├── lib/                                    # Business logic & utilities
│   ├── ai/                                 # AI subsystem
│   │   ├── providers/                      # AI providers
│   │   │   ├── gemini.ts                   # Gemini provider
│   │   │   └── ...                         # Outros providers
│   │   ├── embeddings/                     # Embeddings
│   │   │   ├── generate.ts                 # Gerar embeddings
│   │   │   └── search.ts                   # Busca semântica
│   │   ├── rag/                            # RAG (Retrieval-Augmented Generation)
│   │   │   ├── retriever.ts                # Retriever de conhecimento
│   │   │   └── ...                         # Outros componentes RAG
│   │   └── prompts/                        # Prompt templates
│   │       ├── template-generation.ts      # Prompts de templates
│   │       ├── flow-generation.ts          # Prompts de flows
│   │       └── ...                         # Outros prompts
│   │
│   ├── builder/                            # Workflow engine
│   │   ├── workflow-executor.workflow.ts   # Executor principal (Upstash Workflow)
│   │   ├── store/                          # State management
│   │   │   ├── workflow-store.ts           # Zustand store
│   │   │   └── ...                         # Outros stores
│   │   ├── steps/                          # Workflow steps
│   │   │   ├── message-step.ts             # Step de mensagem
│   │   │   ├── template-step.ts            # Step de template
│   │   │   ├── condition-step.ts           # Step de condição
│   │   │   ├── delay-step.ts               # Step de delay
│   │   │   ├── ai-agent-step.ts            # Step de AI agent
│   │   │   └── ...                         # Outros steps
│   │   ├── nodes/                          # Node handlers
│   │   │   ├── message-node.ts             # Handler de message node
│   │   │   ├── template-node.ts            # Handler de template node
│   │   │   └── ...                         # Outros handlers
│   │   └── codegen/                        # Code generation
│   │       ├── workflow-to-code.ts         # Converter workflow para código
│   │       └── ...                         # Outros codegen
│   │
│   ├── business/                           # Business rules
│   │   ├── audience/                       # Regras de audiência
│   │   │   ├── segmentation.ts             # Segmentação de contatos
│   │   │   └── ...                         # Outras regras de audiência
│   │   ├── campaign/                       # Regras de campanha
│   │   │   ├── validation.ts               # Validação de campanha
│   │   │   ├── scheduling.ts               # Agendamento de campanha
│   │   │   └── ...                         # Outras regras de campanha
│   │   ├── contact/                        # Regras de contato
│   │   │   ├── validation.ts               # Validação de contato
│   │   │   └── ...                         # Outras regras de contato
│   │   └── template/                       # Regras de template
│   │       ├── validation.ts               # Validação de template
│   │       └── ...                         # Outras regras de template
│   │
│   ├── inbox/                              # Inbox service
│   │   ├── inbox-service.ts                # Serviço de inbox
│   │   ├── webhook-handler.ts              # Handler de webhook
│   │   └── ...                             # Outros componentes de inbox
│   │
│   ├── installer/                          # Install wizard logic
│   │   ├── provisioner.ts                  # Provisionamento de recursos
│   │   ├── validator.ts                    # Validação de configuração
│   │   └── bootstrap.ts                    # Bootstrap inicial
│   │
│   ├── whatsapp/                           # WhatsApp API integration
│   │   ├── client.ts                       # Cliente WhatsApp API
│   │   ├── send-message.ts                 # Enviar mensagem
│   │   ├── send-template.ts                # Enviar template
│   │   ├── upload-media.ts                 # Upload de mídia
│   │   ├── get-templates.ts                # Buscar templates
│   │   └── ...                             # Outros métodos WhatsApp
│   │
│   ├── shared/                             # Schemas compartilhados
│   │   ├── campaign-schema.ts              # Schema de campanha (Zod)
│   │   ├── contact-schema.ts               # Schema de contato (Zod)
│   │   └── ...                             # Outros schemas
│   │
│   ├── upstash/                            # Redis client
│   │   ├── redis.ts                        # Cliente Redis (Upstash)
│   │   └── cache.ts                        # Cache helpers
│   │
│   ├── validation/                         # Validation schemas (Zod v4)
│   │   ├── campaign.ts                     # Validação de campanha
│   │   ├── contact.ts                      # Validação de contato
│   │   ├── template.ts                     # Validação de template
│   │   └── ...                             # Outros schemas de validação
│   │
│   ├── design-system/                      # Design tokens
│   │   ├── colors.ts                       # Cores do sistema
│   │   ├── typography.ts                   # Tipografia
│   │   └── ...                             # Outros tokens
│   │
│   ├── data/                               # Data utilities
│   │   ├── transformers.ts                 # Transformadores de dados
│   │   └── ...                             # Outros utilitários de dados
│   │
│   ├── supabase.ts                         # Supabase clients (admin, browser)
│   ├── supabase-server.ts                  # Server Component client (@supabase/ssr)
│   ├── supabase-db.ts                      # Database CRUD abstraction (campaignDb, contactDb, etc)
│   ├── auth.ts                             # API key authentication (verifyApiKey)
│   ├── constants.ts                        # Constantes centralizadas
│   ├── query-invalidation.ts               # React Query invalidation helpers
│   ├── whatsapp-errors.ts                  # 44+ error codes mapped (mapWhatsAppError)
│   ├── whatsapp-credentials.ts             # Credentials management (getWhatsAppCredentials)
│   ├── phone-formatter.ts                  # E.164 phone formatting (normalizePhoneNumber)
│   └── utils.ts                            # General utilities (cn, debounce, formatDate, etc)
│
├── types.ts                                # All TypeScript interfaces (centralized)
├── types/                                  # Domain-specific type files
│   ├── campaign.ts                         # Tipos de campanha
│   ├── contact.ts                          # Tipos de contato
│   ├── template.ts                         # Tipos de template
│   ├── workflow.ts                         # Tipos de workflow
│   └── ...                                 # Outros tipos de domínio
│
├── supabase/                               # Supabase resources
│   ├── migrations/                         # SQL migrations (31+ arquivos)
│   │   ├── 001_initial_schema.sql          # Schema inicial
│   │   ├── 002_campaigns.sql               # Tabela de campanhas
│   │   ├── 003_contacts.sql                # Tabela de contatos
│   │   ├── 004_templates.sql               # Tabela de templates
│   │   └── ...                             # 27+ outras migrations
│   └── seed.sql                            # Seed data
│
├── tests/                                  # Test suites
│   ├── e2e/                                # Playwright E2E tests
│   │   ├── auth.spec.ts                    # Testes de autenticação
│   │   ├── campaigns.spec.ts               # Testes de campanhas
│   │   ├── contacts.spec.ts                # Testes de contatos
│   │   └── ...                             # Outros testes E2E
│   │
│   ├── e2e-whatsapp/                       # WhatsApp E2E scenarios (Vitest)
│   │   ├── send-template.test.ts           # Teste de envio de template
│   │   └── ...                             # Outros testes WhatsApp E2E
│   │
│   ├── api-ai/                             # AI API tests (Vitest)
│   │   ├── generate-template.test.ts       # Teste de geração de template
│   │   └── ...                             # Outros testes AI API
│   │
│   ├── stress/                             # Stress tests
│   │   └── campaign-dispatch.test.ts       # Teste de stress de dispatch
│   │
│   └── adversarial/                        # Red team tests
│       └── injection.test.ts               # Teste de injection
│
├── scripts/                                # Utility scripts (50+ arquivos)
│   ├── db/                                 # Scripts de banco de dados
│   │   ├── migrate.ts                      # Executar migrations
│   │   ├── seed.ts                         # Seed de dados
│   │   └── ...                             # Outros scripts de DB
│   ├── deploy/                             # Scripts de deploy
│   │   └── vercel-deploy.ts                # Deploy para Vercel
│   ├── test/                               # Scripts de teste
│   │   └── run-all-tests.ts                # Executar todos os testes
│   └── ...                                 # 40+ outros scripts
│
├── docs/                                   # Documentação (36+ arquivos)
│   ├── ARCHITECTURE-GUIDE.md               # Guia de arquitetura
│   ├── whatsapp-contract.md                # Contrato WhatsApp API
│   ├── whatsapp-flows-complete-reference.md # Referência WhatsApp Flows
│   ├── INSTALLATION_WIZARD.md              # Wizard de instalação
│   ├── DATABASE_SCHEMA_MANAGEMENT.md       # Gestão de schema
│   ├── changelog.md                        # Histórico de mudanças
│   ├── inbox-ai-agents.md                  # Agentes AI do inbox
│   ├── MEM0_INTEGRATION.md                 # Integração Mem0
│   ├── rag-pgvector-plan.md                # Plano RAG com pgvector
│   └── ...                                 # 27+ outros docs
│
├── public/                                 # Static assets
│   ├── manifest.json                       # PWA manifest
│   ├── sw.js                               # Service worker
│   ├── openapi.yaml                        # OpenAPI spec
│   ├── icons/                              # Ícones da aplicação
│   └── images/                             # Imagens estáticas
│
├── _bmad/                                  # BMAD AI agent system
│   └── ...                                 # Arquivos BMAD
│
├── _bmad-output/                           # BMAD generated output
│   ├── project-context.md                  # 68 regras críticas para AI agents
│   └── ...                                 # Outros outputs BMAD
│
├── CLAUDE.md                               # AI agent instructions (este projeto)
├── package.json                            # Dependencies (100+ packages)
├── next.config.ts                          # Next.js config (standalone, React Compiler, etc)
├── tsconfig.json                           # TypeScript config (strict mode)
├── vitest.config.ts                        # Vitest config (jsdom, coverage)
├── playwright.config.ts                    # Playwright config (chromium + mobile)
├── eslint.config.mjs                       # ESLint flat config
├── tailwind.config.ts                      # Tailwind CSS v4 config
├── postcss.config.mjs                      # PostCSS config
├── .env.example                            # Environment variables template
├── .gitignore                              # Git ignore rules
├── README.md                               # Project README
└── LICENSE                                 # License file

```

## Notas de Estrutura

### Convenções de Nomenclatura

- **Componentes React**: PascalCase (ex: `CampaignListView.tsx`)
- **Hooks**: camelCase com prefixo `use` (ex: `useCampaigns.ts`)
- **Services**: camelCase com sufixo `Service` (ex: `campaignService.ts`)
- **Types**: PascalCase para interfaces/types (ex: `Campaign`, `CampaignStatus`)
- **Constantes**: UPPER_SNAKE_CASE (ex: `MASTER_PASSWORD`)

### Padrões de Arquitetura

- **Frontend**: Page → Hook → Service → API Route
- **Backend**: API Route → Validation → Business Logic → DB
- **Componentes**: Separação controller/view (hook + view component)
- **State Management**: React Query (server) + Zustand (client, builder only)
- **Database**: Supabase PostgreSQL (sem ORM, queries diretas)

### Agrupamento de Rotas (Next.js App Router)

- `(auth)`: grupo sem impacto no URL, layout de autenticação
- `(dashboard)`: grupo sem impacto no URL, layout de dashboard
- `[id]`: rota dinâmica (ex: `/campaigns/[id]`)
- `[...slug]`: catch-all route

### Testes

- **Unit**: `*.test.ts` (Vitest, jsdom)
- **E2E**: `*.spec.ts` (Playwright, headless chromium + mobile)
- **E2E WhatsApp**: `e2e-whatsapp/*.test.ts` (Vitest)
- **AI API**: `api-ai/*.test.ts` (Vitest)
