import { existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { findForbiddenBuildFiles } from './lib/artifact-safety.mjs'

const outputRoot = resolve('dist')

// O plugin gera este arquivo para execução local do bundle do Worker. Ele não é
// necessário para publicar e não deve permanecer em um artefato de produção.
for (const workerDirectory of ['smartzap', 'smartzap_cf']) {
  const generatedDevVars = join(outputRoot, workerDirectory, '.dev.vars')
  if (existsSync(generatedDevVars)) rmSync(generatedDevVars, { force: true })
}

const leakedFiles = findForbiddenBuildFiles(outputRoot)
if (leakedFiles.length > 0) {
  console.error(`Build contém arquivo de credenciais local: ${leakedFiles.join(', ')}`)
  process.exit(1)
}

console.log('Artefato de produção sanitizado: nenhum arquivo .dev.vars em dist.')
