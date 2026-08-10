import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const outputRoot = resolve('dist')
const generatedDevVars = join(outputRoot, 'smartzap_cf', '.dev.vars')

// O plugin gera este arquivo para execução local do bundle do Worker. Ele não é
// necessário para publicar e não deve permanecer em um artefato de produção.
if (existsSync(generatedDevVars)) rmSync(generatedDevVars, { force: true })

function findDevVars(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return findDevVars(path)
    return entry.name.startsWith('.dev.vars') ? [relative(outputRoot, path)] : []
  })
}

const leakedFiles = findDevVars(outputRoot)
if (leakedFiles.length > 0) {
  console.error(`Build contém arquivo de credenciais local: ${leakedFiles.join(', ')}`)
  process.exit(1)
}

console.log('Artefato de produção sanitizado: nenhum arquivo .dev.vars em dist.')
