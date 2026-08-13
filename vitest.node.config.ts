import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [{
    name: 'markdown-text-module',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('.md')) return null
      return { code: `export default ${JSON.stringify(source)}`, map: null }
    },
  }],
  test: {
    environment: 'node',
    include: ['tests-node/**/*.node.test.ts'],
  },
})
