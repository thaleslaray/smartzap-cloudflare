import { defineConfig } from '@playwright/test'

const port = Number(process.env.E2E_PORT || 5174)
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: 'e2e',
  // Os cenários compartilham o estado D1 de teste; serializar a suíte evita
  // que mutações de um cenário contaminem outro.
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS || 1),
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  use: { baseURL },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    // Todos os demais bindings vêm do runtime isolado config/wrangler.test.jsonc.
    env: {
      E2E: '1',
    },
  },
})
