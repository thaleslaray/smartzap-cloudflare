# Brief das telas — SmartZap CF (MVP)

SaaS single-tenant de campanhas de marketing via WhatsApp (API oficial da Meta), self-hosted na Cloudflare. Dashboard atrás de login, dark-first, pt-BR, público: operadores de PME/infoprodutores/agências. Redesenhar as 8 telas abaixo — o design system de partida está em `tokens/smartzap-tokens.css` (manter identidade emerald/zinc ou evoluir).

## 1. Login
Tela única: senha mestra + Turnstile (CAPTCHA da Cloudflare). Sem cadastro, sem "esqueci a senha" (single-tenant). Logo SmartZap centrado.

## 2. Dashboard (home)
- 4 stat cards: mensagens enviadas (30d), taxa de entrega, taxa de leitura, falhas.
- Lista "campanhas recentes" (nome, status, progresso, enviadas/total).
- Estado vazio para instância recém-instalada ("importe seus contatos").

## 3. Campanhas — lista
- Tabela: nome, template, status (draft/scheduled/sending/completed/paused/failed/cancelled — badges coloridos), progresso (enviadas/entregues/lidas/falhas), data.
- Filtro por status, busca por nome. Ação primária: "Nova campanha".
- Campanha `sending` mostra progresso ao vivo (barra animada — chega via WebSocket).

## 4. Nova campanha (wizard, 4 passos)
1. **Template**: escolher template aprovado da Meta (cards com preview do corpo, badge de categoria MARKETING/UTILITY e idioma).
2. **Audiência**: todos os contatos opt-in / filtro por tags / colar lista. Mostrar contagem resolvida e quantos serão pulados (opt-out/supressão).
3. **Variáveis**: mapear {{1}}, {{2}} do template para campos do contato (nome, custom fields) com preview da mensagem real.
4. **Revisão e disparo**: resumo + **custo estimado da Meta em R$** (nº de destinatários × R$ 0,3217 para marketing — diferencial do produto, nenhum concorrente barato mostra) + agendar ou disparar agora.

## 5. Campanha — detalhe
- Header: nome, status, ações (pausar/retomar/cancelar).
- Progresso ao vivo: barra + contadores enviadas/entregues/lidas/falhas (atualiza via WebSocket).
- Custo real acumulado (mensagens entregues × tarifa).
- Tabela de destinatários: contato, telefone, status individual (com timestamp), código de erro da Meta quando falha (ex: 131056 "limite de par" — tooltip com explicação em português).

## 6. Contatos
- Tabela: nome, telefone (E.164), status opt-in/opt-out (badge), tags, data.
- Import CSV em modal: upload → mapeamento de colunas → **declaração de opt-in obrigatória** (checkbox "confirmo que esta lista tem consentimento documentado — LGPD art. 7º") → resultado (importados/duplicados/inválidos).
- Ações em massa: adicionar tag, marcar opt-out.
- Custom fields configuráveis (usados nas variáveis de template).

## 7. Templates
- Grid de cards sincronizados da Meta: nome, categoria, idioma, status de aprovação (APPROVED/PENDING/REJECTED — badge), preview do corpo com {{variáveis}} destacadas.
- Botão "Sincronizar com a Meta". Read-only no MVP (criação de template fica pós-MVP).

## 8. Settings
- Seções: Credenciais Meta (phone number ID, WABA ID, token — mascarados), Webhook (URL + status de verificação), Throttle (mensagens/segundo), API keys do SmartZap, Sessões ativas.
- Health check visual: conexão Meta OK / webhook OK / banco OK.

## Componentes recorrentes
Badges de status (7 estados de campanha + 6 de mensagem — cores nos tokens), stat card, barra de progresso ao vivo, tabela densa com paginação, modal de confirmação destrutiva, toast de feedback, empty states com CTA.

## O que NÃO existe no MVP (não desenhar)
Inbox/chat, builder de fluxos, WhatsApp Flows, lead forms, multi-usuário.
