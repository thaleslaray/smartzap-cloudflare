import { spawnSync } from 'node:child_process'

// O Playwright prepara uma base isolada antes de subir o servidor. No uso local,
// aplicar migrações automaticamente evita que uma rota nova quebre apenas porque
// o banco persistido do desenvolvedor ficou atrás do código.
if (process.env.E2E === '1') process.exit(0)

const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(
  executable,
  ['wrangler', 'd1', 'migrations', 'apply', 'smartzap', '--local'],
  { stdio: 'inherit', env: { ...process.env, CI: '1' } },
)

if (result.error) {
  console.error(`Não foi possível preparar o banco local: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
