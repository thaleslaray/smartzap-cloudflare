import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(repo, "tmp", "provisioner-release");
const bucket = process.env.SMARTZAP_RELEASE_BUCKET || "smartzap-provisioner-releases";
const manifest = JSON.parse(await readFile(path.join(source, "manifest.json"), "utf8"));
const files = ["manifest.json", ...await walk(path.join(source, "files"), "files")];

await parallel(files, 6, async (relative) => {
  const args = ["wrangler", "r2", "object", "put", `${bucket}/${relative}`, "--remote", "--force", "--file", path.join(source, relative)];
  const type = contentType(relative);
  if (type) args.push("--content-type", type);
  await exec("npx", args, { cwd: repo, maxBuffer: 1024 * 1024 });
  process.stdout.write(".");
});
process.stdout.write("\n");
console.log(`Release ${manifest.version} publicada: ${files.length} objetos em ${bucket}`);

async function walk(directory, prefix) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const key = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await walk(path.join(directory, entry.name), key));
    else if (entry.isFile() && entry.name !== "README.md") result.push(key);
  }
  return result;
}

async function parallel(items, concurrency, task) {
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await task(item);
    }
  }));
}

function contentType(name) {
  if (name.endsWith("manifest.json")) return "application/json";
  if (name.endsWith(".js")) return "application/javascript";
  if (name.endsWith(".css")) return "text/css";
  if (name.endsWith(".html")) return "text/html";
  if (name.endsWith(".svg")) return "image/svg+xml";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}
