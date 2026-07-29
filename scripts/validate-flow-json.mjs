#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { validateFlowJson } from "../src/domain/flow-validation.ts";

const file = process.argv[2];
if (!file) {
  console.error(JSON.stringify({
    ok: false,
    version: null,
    errors: [{ path: "$", code: "FILE_REQUIRED", message: "Informe o caminho do flow.json" }],
  }, null, 2));
  process.exit(2);
}

let value;
try {
  value = JSON.parse(await readFile(file, "utf8"));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    version: null,
    errors: [{
      path: "$",
      code: error instanceof SyntaxError ? "INVALID_JSON" : "FILE_READ_ERROR",
      message: error instanceof SyntaxError ? "Arquivo não contém JSON válido" : "Não foi possível ler o arquivo",
    }],
  }, null, 2));
  process.exit(1);
}

const errors = validateFlowJson(value);
const result = {
  ok: errors.length === 0,
  version: typeof value?.version === "string" ? value.version : null,
  screens: Array.isArray(value?.screens) ? value.screens.length : 0,
  bytes: new TextEncoder().encode(JSON.stringify(value)).byteLength,
  errors,
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
