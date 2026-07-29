import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      configPath: process.env.E2E === '1' ? './config/wrangler.test.jsonc' : undefined,
      persistState: process.env.E2E === '1' ? { path: '.wrangler/e2e-state' } : true,
      // Evita conflito com outros projetos locais que usam a porta padrão 9229.
      inspectorPort: Number(process.env.CF_INSPECTOR_PORT || 9235),
    }),
  ],
})
