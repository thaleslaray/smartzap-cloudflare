// Setup global (setupFiles): aplica as migrations D1 no banco de teste antes de cada arquivo.
// TEST_MIGRATIONS é injetado pelo vitest.config.ts via readD1Migrations().
import { applyD1Migrations, env } from 'cloudflare:test'

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
