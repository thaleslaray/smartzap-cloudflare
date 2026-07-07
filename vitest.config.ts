import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

// Migrations D1 lidas em Node no load do config e injetadas no worker de teste
// via binding TEST_MIGRATIONS (aplicadas pelo setup tests/apply-migrations.ts)
const migrations = await readD1Migrations(path.join(__dirname, 'migrations'))

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        // Bindings de teste autocontidos: os testes não dependem de .dev.vars (CI-safe)
        bindings: {
          TEST_MIGRATIONS: migrations,
          MASTER_PASSWORD: 'dev',
          SMARTZAP_API_KEY: 'dev-api-key',
          META_APP_SECRET: 'dev-meta-secret',
          META_VERIFY_TOKEN: 'dev-verify',
          TURNSTILE_SECRET: '',
          ENVIRONMENT: 'test',
        },
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/apply-migrations.ts'],
  },
})
