# SmartZap MCP Server

Servidor MCP (Model Context Protocol) do SmartZap — permite que Claude Code e outros clientes MCP interajam com o sistema via ferramentas tipadas, sem precisar abrir a UI.

## Endpoints

| Protocolo | URL |
|-----------|-----|
| Streamable HTTP | `/api/mcp` |
| SSE (Server-Sent Events) | `/api/sse` |

## Autenticação

```
Authorization: Bearer <token>
# ou
X-Api-Key: <token>
```

**Chaves:**
- `SMARTZAP_API_KEY` — acesso geral (leitura + escrita de dados)
- `SMARTZAP_ADMIN_KEY` — acesso admin (configurações sensíveis, debug, delete)

Ferramentas que exigem admin retornam erro quando chamadas com a chave API padrão.

---

## Ferramentas (48 tools)

### Contatos — Leitura

| Tool | Descrição |
|------|-----------|
| `sz.contacts.list` | Lista contatos com filtros (busca, tag, status, limit) |
| `sz.contacts.get` | Detalhes de um contato por `id` ou `phone` |
| `sz.contacts.stats` | Totais: opt_in, opt_out, unknown, total |
| `sz.contacts.tags` | Lista todas as tags distintas |

### Contatos — Escrita

| Tool | Descrição |
|------|-----------|
| `sz.contacts.create` | Cria um novo contato |
| `sz.contacts.update` | Atualiza campos de um contato existente |
| `sz.contacts.delete` | Remove um ou mais contatos (array de IDs) |
| `sz.contacts.import` | Importa até 10.000 contatos em bulk |
| `sz.contacts.set_custom_field` | Aplica campo customizado em até 5.000 contatos |

### Campanhas — Leitura/Controle

| Tool | Descrição |
|------|-----------|
| `sz.campaigns.list` | Lista campanhas com filtro de status e paginação |
| `sz.campaigns.get` | Detalhes completos de uma campanha |
| `sz.campaigns.metrics` | Métricas de entrega: enviados, entregues, lidos, falhados |
| `sz.campaigns.messages` | Mensagens de uma campanha com filtro de status |
| `sz.campaigns.pause` | Pausa uma campanha em envio |
| `sz.campaigns.resume` | Retoma uma campanha pausada |

### Campanhas — Escrita

| Tool | Descrição |
|------|-----------|
| `sz.campaigns.create` | Cria nova campanha (rascunho ou agendada) |
| `sz.campaigns.update` | Atualiza nome, template ou agendamento (DRAFT only) |
| `sz.campaigns.delete` | Remove uma campanha (DRAFT ou FAILED) |
| `sz.campaigns.start` | Dispara uma campanha imediatamente |
| `sz.campaigns.schedule` | Define data/hora de disparo |
| `sz.campaigns.duplicate` | Cria cópia de uma campanha como novo rascunho |

### Templates

| Tool | Descrição |
|------|-----------|
| `sz.templates.list` | Lista templates com filtro de status e categoria |
| `sz.templates.get` | Estrutura completa de um template pelo nome |
| `sz.templates.sync` | Dispara sincronização de templates com a Meta |

### Inbox

| Tool | Descrição |
|------|-----------|
| `sz.inbox.list` | Lista conversas com filtros (status, busca, limit) |
| `sz.inbox.get` | Conversa com últimas N mensagens |
| `sz.inbox.takeover` | Pausa o bot em uma conversa (modo humano) |
| `sz.inbox.return_to_bot` | Reativa o bot em uma conversa |

### Mensagens

| Tool | Descrição |
|------|-----------|
| `sz.messages.send_test` | Envia texto direto para um número WhatsApp |
| `sz.messages.send_template` | Envia template HSM com variáveis |

### Agentes de IA

| Tool | Descrição |
|------|-----------|
| `sz.agents.list` | Lista todos os atendentes de IA configurados |
| `sz.agents.get` | Configuração completa de um agente por UUID |
| `sz.agents.create` | Cria novo agente (system_prompt, modelo, debounce, etc.) |
| `sz.agents.update` | Atualiza campos de um agente existente |
| `sz.agents.delete` | ⚠️ Admin — remove agente (conversas migram para padrão) |
| `sz.agents.toggle_active` | Liga/desliga o sistema de resposta automática via IA |

### Configurações

| Tool | Descrição |
|------|-----------|
| `sz.settings.get_whatsapp` | Status das credenciais WhatsApp (sem expor token) |
| `sz.settings.set_whatsapp` | ⚠️ Admin — configura Phone Number ID, Business Account ID, Access Token |
| `sz.settings.get_ai` | Provider, modelo e status das chaves de IA |
| `sz.settings.set_ai` | ⚠️ Admin — configura provider, modelo, chaves Google/OpenAI e rotas |
| `sz.settings.remove_ai_key` | ⚠️ Admin — remove chave de API do Google ou OpenAI |
| `sz.settings.get_integrations` | Status do Helicone e Mem0 |
| `sz.settings.set_helicone` | ⚠️ Admin — ativa/desativa Helicone e configura chave |
| `sz.settings.set_mem0` | ⚠️ Admin — ativa/desativa Mem0 e configura chave |

### Fluxos

| Tool | Descrição |
|------|-----------|
| `sz.flows.list` | Lista todos os fluxos de automação |
| `sz.flows.get` | Configuração completa de um fluxo por UUID |
| `sz.flows.delete` | ⚠️ Admin — remove um fluxo |

### Webhook WhatsApp

| Tool | Descrição |
|------|-----------|
| `sz.settings.webhook_status` | Status da assinatura de webhook na Meta (URL, override, hierarchy) |
| `sz.settings.subscribe_webhook` | ⚠️ Admin — assina webhook; usa URL auto-detectada se callbackUrl omitido |
| `sz.settings.unsubscribe_webhook` | ⚠️ Admin — remove override de URL (mantém assinatura ativa) |

### Sistema / Debug

| Tool | Descrição |
|------|-----------|
| `sz.health.check` | Health check completo (banco + WhatsApp + QStash) |
| `sz.settings.credentials_status` | Status das credenciais WhatsApp (sem expor valores) |
| `sz.settings.ai_status` | Provider e modelo IA ativos (sem expor chaves) |
| `sz.debug.alerts` | ⚠️ Admin — alertas recentes da conta |
| `sz.debug.campaign_contacts` | ⚠️ Admin — contatos com falha em campanha |
| `sz.debug.test_connection` | ⚠️ Admin — testa credenciais WhatsApp via Meta API |

---

## Configuração Local

Arquivo `.mcp.json` na raiz do projeto (já criado):

```json
{
  "mcpServers": {
    "smartzap": {
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_SMARTZAP_API_KEY"
      }
    }
  }
}
```

Substitua `YOUR_SMARTZAP_API_KEY` pelo valor da variável `SMARTZAP_API_KEY` do `.env.local`.

Para acesso admin, use o valor de `SMARTZAP_ADMIN_KEY`.

---

## Arquitetura

```
app/api/[transport]/route.ts   ← Rota Next.js (GET/POST/DELETE)
    ↓
withMcpAuth()                  ← Valida token (Bearer ou X-Api-Key)
    ↓
mcpContextStorage.run(ctx)     ← AsyncLocalStorage com { isAdmin }
    ↓
createMcpHandler(registerAllTools)
    ↓
lib/mcp/tools/
  contacts.ts        (4 tools — leitura)
  contacts-write.ts  (5 tools — escrita)
  campaigns.ts       (6 tools — leitura/controle)
  campaigns-write.ts (6 tools — criação/edição)
  templates.ts       (3 tools)
  inbox.ts           (4 tools)
  messages.ts        (2 tools)
  system.ts          (6 tools)
  settings.ts        (8 tools — configurações admin)
  agents.ts          (6 tools — agentes IA)
  flows.ts           (3 tools — fluxos)
```

**Padrão de implementação**: cada tool chama as rotas API internas existentes via `fetch`, reutilizando toda a validação Zod, lógica de negócio e cache já implementados.

**Contexto por request**: cada chamada MCP carrega `{ isAdmin: boolean }` em `AsyncLocalStorage`, acessível via `getMcpContext()` em qualquer tool sem passar parâmetros explicitamente.

---

## Exemplos de Uso (Claude Code)

```
# Verificar saúde do sistema
sz.health.check

# Listar últimas 5 campanhas
sz.campaigns.list { limit: 5 }

# Criar e disparar campanha
sz.campaigns.create { name: "Black Friday", templateName: "black_friday_2025", selectedContactIds: [...] }
sz.campaigns.start { id: "uuid-da-campanha" }

# Importar lista de contatos
sz.contacts.import { contacts: [{ name: "João", phone: "+5511999999999" }, ...] }

# Configurar credenciais WhatsApp (admin)
sz.settings.set_whatsapp { phoneNumberId: "123", businessAccountId: "456", accessToken: "EAABxx..." }

# Assinar webhook (usa URL auto-detectada do Vercel — admin)
sz.settings.webhook_status                    # verificar estado antes
sz.settings.subscribe_webhook                 # assinar com URL auto-detectada
sz.settings.subscribe_webhook { callbackUrl: "https://meu-dominio.com/api/webhook" }  # ou URL explícita
sz.settings.unsubscribe_webhook               # remover override (admin)

# Configurar IA com Google Gemini (admin)
sz.settings.set_ai { provider: "google", model: "gemini-2.5-flash", google_api_key: "AIzaSy..." }

# Criar agente de atendimento
sz.agents.create {
  name: "Suporte Comercial",
  system_prompt: "Você é um assistente de vendas...",
  debounce_ms: 3000
}

# Listar fluxos ativos
sz.flows.list

# Ver conversas ativas com bot
sz.inbox.list { status: "bot", limit: 10 }

# Enviar mensagem de teste
sz.messages.send_test { phone: "+5511999999999", message: "Teste de conectividade" }

# (admin) Ver alertas recentes
sz.debug.alerts { limit: 20 }
```
