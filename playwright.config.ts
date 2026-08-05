import { defineConfig } from '@playwright/test'

const port = Number(process.env.E2E_PORT || 5174)
const remoteBaseURL = process.env.QA_REMOTE_BASE_URL?.replace(/\/+$/, '')
const baseURL = remoteBaseURL || `http://localhost:${port}`
const reportDir =
  process.env.QA_PLAYWRIGHT_REPORT_DIR ||
  process.env.QA_REPORT_DIR ||
  'test-results'
const releaseMetadata = {
  sourceCommit: process.env.QA_RELEASE_COMMIT || '',
  productionVersion: process.env.QA_RELEASE_VERSION || '',
  productionUrl: process.env.QA_RELEASE_URL || remoteBaseURL || '',
}

export default defineConfig({
  testDir: 'e2e',
  // Os cenários compartilham o estado D1 de teste; serializar a suíte evita
  // que mutações de um cenário contaminem outro.
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS || 1),
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: `${reportDir}/playwright-artifacts`,
  reporter: [
    ['line'],
    ['html', { outputFolder: `${reportDir}/playwright-html`, open: 'never' }],
    ['json', { outputFile: `${reportDir}/playwright-results.json` }],
    ['junit', { outputFile: `${reportDir}/playwright-junit.xml` }],
  ],
  metadata: releaseMetadata,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'firefox', use: { browserName: 'firefox', viewport: { width: 1440, height: 900 } } },
    { name: 'webkit', use: { browserName: 'webkit', viewport: { width: 1440, height: 900 } } },
  ],
  use: {
    baseURL,
    locale: 'pt-BR',
    colorScheme: 'dark',
    extraHTTPHeaders:
      remoteBaseURL && (process.env.QA_READONLY_API_KEY || process.env.QA_API_KEY)
        ? process.env.QA_READONLY_API_KEY
          ? { 'x-qa-readonly-key': process.env.QA_READONLY_API_KEY }
          : { 'x-api-key': process.env.QA_API_KEY! }
        : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: remoteBaseURL
    ? undefined
    : {
        command: `npm run dev -- --port ${port} --strictPort`,
        url: `${baseURL}/api/health`,
        // Nunca reutilizar um processo alheio: isso poderia validar outro app
        // que por acaso estivesse respondendo na mesma porta.
        reuseExistingServer: false,
        // Todos os demais bindings vêm do runtime isolado config/wrangler.test.jsonc.
        env: {
          E2E: '1',
          CF_INSPECTOR_PORT: process.env.CF_INSPECTOR_PORT || '9235',
          QA_RUN_ID: process.env.QA_RUN_ID || '',
          QA_E2E_STATE: process.env.QA_E2E_STATE || '.wrangler/e2e-state',
          QA_E2E_PROJECT: process.env.QA_E2E_PROJECT || '',
        },
      },
})
