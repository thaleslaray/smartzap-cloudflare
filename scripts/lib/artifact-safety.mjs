import { existsSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export function findForbiddenBuildFiles(outputRoot = resolve("dist")) {
  if (!existsSync(outputRoot)) return [];
  const findings = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.startsWith(".dev.vars")) findings.push(relative(outputRoot, path));
    }
  };
  visit(outputRoot);
  return findings.sort();
}

export function assertSafeDeployArtifact(outputRoot = resolve("dist")) {
  const findings = findForbiddenBuildFiles(outputRoot);
  if (findings.length > 0) {
    throw new Error(`Deploy recusado: artefato contém arquivo local de credenciais (${findings.join(", ")}). Execute npm run postbuild e tente novamente.`);
  }
  if (!existsSync(join(outputRoot, "client"))) {
    throw new Error("Deploy recusado: dist/client não existe. Execute npm run build sem ignorar o postbuild.");
  }
  return true;
}
