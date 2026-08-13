# SmartZap — guia (visão Jobs)

Você não precisa de um manual. Você precisa de um resultado.

Este é o caminho mais curto entre “zero” e “app rodando”.

Guia completo (com prints): [`GUIA_CONFIGURACAO.md`](./GUIA_CONFIGURACAO.md)

---

## Setup em 10 minutos (Vercel + Wizard)

### 1) Tenha o mínimo em mãos

- Vercel: conta logada
- Supabase: projeto criado
- Upstash QStash: `QSTASH_TOKEN`
- (Opcional) WhatsApp Cloud API: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`

### 2) Faça o deploy

1. Fork do repositório
2. Importar na Vercel e fazer o deploy

### 3) Abra o Wizard

1. Acesse `https://SEU-PROJETO.vercel.app/setup`
2. Cole o token da Vercel quando solicitado
3. Siga os passos na ordem (não pule o Supabase)

### 4) “Acabou” quando você conseguir logar

Se o Wizard terminou e você chegou no `/login`, você está no ar.

---

## Variáveis de ambiente (o essencial)

Use `.env.local` no local e *Environment Variables* na Vercel.

### Obrigatórias

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `QSTASH_TOKEN`

### Recomendadas (segurança/admin)

- `MASTER_PASSWORD`
- `SMARTZAP_API_KEY`
- `SMARTZAP_ADMIN_KEY`
- `FRONTEND_URL` (principalmente em produção)

### Opcionais

- WhatsApp: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`
- Webhook (verify token): Supabase settings (`webhook_verify_token`) e, como fallback, `WEBHOOK_VERIFY_TOKEN`
- Métricas Upstash: `UPSTASH_EMAIL`, `UPSTASH_API_KEY`
- IA: `GEMINI_API_KEY`

Fonte de verdade: [`.env.example`](../.env.example)

---

## Local (quando você quiser desenvolver)

1. Copie `.env.example` → `.env.local`
2. Preencha as variáveis (mínimo: Supabase)
3. Rode `npm run dev` e abra `http://localhost:3000`

---

## 3 regras de ouro

1. Segredos nunca vão para o Git (nem em print “de exemplo”).
2. Tudo que muda o sistema fica em variáveis de ambiente (não no código).
3. Se você teve dúvida se vazou, rotacione o token e siga.

---

## Se der erro (3 casos comuns)

1) **Supabase 403 / permission denied (42501)**
- Rode a migration completa em `lib/migrations/0001_initial_schema.sql` (incluindo permissões/GRANTs).

2) **App abre, mas rotas falham / tabelas não existem**
- Você não migrou. Volte no Wizard e execute “Verificar e Migrar”.

3) **Campanhas não disparam**
- Falta `QSTASH_TOKEN` no ambiente certo (Production vs Preview vs Local). Ajuste e redeploy/restart.

---

## Guia detalhado (com prints)

Para o passo a passo completo, prints e troubleshooting expandido:

- [`GUIA_CONFIGURACAO.md`](./GUIA_CONFIGURACAO.md)
