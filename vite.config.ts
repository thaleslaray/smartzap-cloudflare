import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

const isE2E = process.env.E2E === '1'
const e2eWorkerSuffix = [
  process.env.QA_RUN_ID || 'local',
  process.env.QA_E2E_PROJECT || 'browser',
]
  .join('-')
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, '-')
  .replace(/-+/g, '-')
  .slice(-42)
const e2eWorkerName = `smartzap-test-${e2eWorkerSuffix}`.slice(0, 63)

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      configPath: isE2E ? './config/wrangler.test.jsonc' : undefined,
      config: isE2E ? { name: e2eWorkerName } : undefined,
      persistState: isE2E
        ? { path: process.env.QA_E2E_STATE || '.wrangler/e2e-state' }
        : true,
      // Evita conflito com outros projetos locais que usam a porta padrão 9229.
      inspectorPort: Number(process.env.CF_INSPECTOR_PORT || 9235),
    }),
  ],
})
