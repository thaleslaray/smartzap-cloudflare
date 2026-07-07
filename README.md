# SmartZap CF

Automação de campanhas WhatsApp (API oficial Meta) — 100% Cloudflare Workers.

## Deploy (produção)

1. `wrangler d1 create smartzap` → copiar `database_id` para wrangler.jsonc
2. `wrangler kv namespace create CACHE` → copiar `id`
3. `wrangler r2 bucket create smartzap-media`
4. `wrangler queues create meta-webhooks`
5. `wrangler queues create meta-webhooks-dlq`   # dead-letter queue do consumer
6. Secrets:
   wrangler secret put MASTER_PASSWORD
   wrangler secret put META_APP_SECRET      # app secret do app Meta (HMAC do webhook)
   wrangler secret put META_VERIFY_TOKEN    # token de verificação do webhook — valor
                                            # DIFERENTE do META_APP_SECRET; é ele que
                                            # se digita no painel da Meta
   wrangler secret put WHATSAPP_TOKEN       # fallback; o oficial vive em Settings
   wrangler secret put TURNSTILE_SECRET     # widget criado no dashboard Cloudflare
   wrangler secret put SMARTZAP_API_KEY
7. `npm run deploy`
8. `wrangler d1 migrations apply smartzap --remote`
9. Meta App Dashboard → WhatsApp → Webhook: URL `https://<worker>/webhook`,
   verify token = META_VERIFY_TOKEN, campos: `messages`
10. Login no dashboard → Settings → preencher token/phone_id/waba_id → Sincronizar templates

## Checklist pós-deploy

- [ ] `TURNSTILE_SECRET` setado + widget do Turnstile conectado no Login.tsx ANTES de
      abrir para produção real. Sem o secret, a verificação anti-bot fica DESLIGADA e o
      login é liberado (postura de teste) — protegido só por rate limit + senha mestra.
- [ ] `GET https://<worker>/api/health` responde JSON (confirma `run_worker_first` ok)
- [ ] Webhook configurado na Meta com o `META_VERIFY_TOKEN` (GET de verificação passa)

## Dev

cp .dev.vars.example .dev.vars && npm install
wrangler d1 migrations apply smartzap --local   # cria as tabelas no D1 local (sem isso: "no such table")
npm run dev
npm test        # worker (vitest pool workers) — aplica as migrations no D1 de teste automaticamente
npm run e2e     # smoke Playwright (sobe o dev server; requer o D1 local migrado)
