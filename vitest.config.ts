import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

// Migrations D1 lidas em Node no load do config e injetadas no worker de teste
// via binding TEST_MIGRATIONS (aplicadas pelo setup tests/apply-migrations.ts)
const migrations = await readD1Migrations(path.join(__dirname, 'migrations'))

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './config/wrangler.test.jsonc' },
      miniflare: {
        // Bindings de teste autocontidos: os testes não dependem de .dev.vars (CI-safe)
        bindings: {
          TEST_MIGRATIONS: migrations,
          // Testes de sucesso injetam um provider falso diretamente.
          AI: {},
          MASTER_PASSWORD: 'dev',
          SMARTZAP_VAULT_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
          SMARTZAP_API_KEY: 'dev-api-key',
          QA_READONLY_API_KEY: 'dev-readonly-key',
          QA_STAGING_MUTATION_API_KEY: 'dev-mutation-key',
          META_APP_SECRET: 'dev-meta-secret',
          META_VERIFY_TOKEN: 'dev-verify',
          WHATSAPP_TOKEN: 'test-whatsapp-token',
          TURNSTILE_SECRET: '',
          TURNSTILE_SITE_KEY: '',
          ENVIRONMENT: 'test',
          META_GRAPH_VERSION: 'v25.0',
          META_APP_ID: '123456789',
          META_EXPECTED_PHONE_ID: '11111',
          META_EXPECTED_WABA_ID: '22222',
          META_EXPECTED_CALLBACK_URL: 'https://worker.example/webhook',
          META_AD_ACCOUNT_ID: '999999999999999',
          PILOT_SEND_ENABLED: 'false',
          PILOT_RECIPIENT_E164: '+5511999999999',
          PILOT_MAX_REAL_SENDS: '3',
          PILOT_TEMPLATE_ALLOWLIST: 'hello_world,template_static_test',
          TURNSTILE_ENABLED: 'false',
          AI_ENABLED: 'false',
          AI_MODEL: '@cf/openai/gpt-oss-20b',
          AI_GATEWAY_ID: 'default',
          AI_PROVIDER_TIMEOUT_MS: '20000',
          AI_MAX_DRAFTS_PER_CONVERSATION_HOUR: '20',
          AI_MAX_DRAFTS_PER_DAY: '200',
          INBOX_SEND_ENABLED: 'false',
          GOOGLE_CALENDAR_ENCRYPTION_KEY: 'test-google-calendar-encryption-key',
        },
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/apply-migrations.ts'],
  },
})
