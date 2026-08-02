const baseUrl = process.env.QA_BASE_URL;
const apiKey = process.env.QA_API_KEY;

if (!baseUrl || !apiKey) {
  throw new Error("QA_BASE_URL e QA_API_KEY são obrigatórios");
}

const headers = {
  "cache-control": "no-cache",
  "x-api-key": apiKey,
};

function assetPathsFromHtml(html) {
  return [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((path) => path.startsWith("/assets/"));
}

function expectedContentType(path) {
  if (/\.css(?:\?|$)/i.test(path)) return "text/css";
  if (/\.(?:js|mjs)(?:\?|$)/i.test(path)) return "javascript";
  return null;
}

async function inspectDeployment() {
  const nonce = `${Date.now()}-${crypto.randomUUID()}`;
  const [health, auth, shell] = await Promise.all([
    fetch(`${baseUrl}/api/health?ci=${nonce}`, { headers }).catch(() => null),
    fetch(`${baseUrl}/api/auth/status?ci=${nonce}`, { headers }).catch(() => null),
    fetch(`${baseUrl}/?ci=${nonce}`, { headers }).catch(() => null),
  ]);

  const authenticated = auth?.ok
    ? (await auth.json().catch(() => null))?.authenticated === true
    : false;
  if (!health?.ok || !authenticated || !shell?.ok) return null;

  const html = await shell.text();
  const assetPaths = assetPathsFromHtml(html);
  const scriptPaths = assetPaths.filter((path) => expectedContentType(path) === "javascript");
  if (scriptPaths.length === 0) return null;

  const assets = await Promise.all(
    assetPaths.map(async (path) => {
      const response = await fetch(new URL(path, baseUrl), { headers }).catch(() => null);
      const contentType = response?.headers.get("content-type")?.toLowerCase() ?? "";
      const expected = expectedContentType(path);
      return {
        ok: Boolean(response?.ok && (!expected || contentType.includes(expected))),
        path,
      };
    }),
  );
  if (assets.some((asset) => !asset.ok)) return null;

  return assetPaths.sort().join("|");
}

let previousSignature = null;
let consecutive = 0;
for (let attempt = 1; attempt <= 18; attempt += 1) {
  const signature = await inspectDeployment();
  consecutive = signature && signature === previousSignature ? consecutive + 1 : signature ? 1 : 0;
  previousSignature = signature;
  if (consecutive >= 3) {
    console.log("Worker, autenticação, HTML e assets estabilizados em três provas consecutivas.");
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}

throw new Error("Worker não estabilizou HTML e assets na mesma versão em 90 segundos");
