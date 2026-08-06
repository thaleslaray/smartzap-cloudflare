import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { Script } from "node:vm";
import {
  buildReleaseRiskReview,
  evaluateReleaseRiskReview,
  RELEASE_RISK_ATTESTATION,
} from "./lib/release-risk.mjs";

const root = resolve(import.meta.dirname, "..");
const command = process.argv[2];

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function requiredPath(name) {
  const value = option(name);
  if (!value) throw new Error(`Informe --${name} <caminho>.`);
  return resolve(root, value);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writePrivate(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function escapeScriptJson(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e");
}

function reviewHtml(review) {
  const data = escapeScriptJson(review);
  const attestation = JSON.stringify(RELEASE_RISK_ATTESTATION);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aceite de risco · SmartZap</title><style>
:root{color-scheme:dark;--bg:#080a09;--card:#141816;--line:#303a35;--text:#f4f8f5;--muted:#aab5ae;--green:#55e6ad;--red:#ff7777}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 system-ui,-apple-system,sans-serif}main{width:min(900px,calc(100% - 32px));margin:32px auto 120px}.card{margin-top:18px;padding:22px;background:var(--card);border:1px solid var(--line);border-radius:18px}h1{font-size:clamp(28px,5vw,46px);margin:0}p,li{color:var(--muted)}code{overflow-wrap:anywhere}.ok{color:var(--green)}.blocked{color:var(--red)}label{display:flex;gap:10px;align-items:flex-start;margin:12px 0}label input[type=checkbox]{margin-top:6px}input[type=text],textarea{width:100%;padding:11px;border:1px solid var(--line);border-radius:10px;background:#0c100e;color:var(--text);font:inherit}button{position:fixed;right:24px;bottom:24px;padding:12px 18px;border:0;border-radius:10px;background:var(--green);color:#07110d;font-weight:800}button:disabled{opacity:.4}.pill{display:inline-block;padding:3px 9px;border:1px solid var(--line);border-radius:999px;margin:3px}
</style></head><body><main><h1>Aceite final de risco</h1><p>Release <code>${review.release.productionVersion}</code>. Esta decisão não substitui evidências técnicas nem remove falhas.</p><section class="card"><h2>Pré-condições</h2><p class="${review.readyForDecision ? "ok" : "blocked"}">${review.readyForDecision ? "As outras 22 evidências estão prontas para decisão." : "Aceite bloqueado: ainda existem pendências técnicas."}</p><ul>${review.preconditions.blockingIssues.map((item) => `<li>${item}</li>`).join("")}</ul></section><section class="card"><h2>Escopo</h2><p>${review.preconditions.journeys.approvedBeforeSignoff}/${review.preconditions.journeys.active - 1} jornadas anteriores ao aceite aprovadas.</p><h3>Exclusões documentadas</h3><p>${review.preconditions.journeys.exclusions.map((item) => `<span class="pill">${item.id} · ${item.state}</span>`).join("") || "Nenhuma"}</p></section><section class="card"><h2>Decisão humana</h2><label style="display:grid">Nome do responsável<input id="reviewer" type="text" autocomplete="name"></label><label><input type="checkbox" data-check="scopeAccepted">Aceito o escopo produtivo desta release.</label><label><input type="checkbox" data-check="exclusionsAccepted">Aceito as exclusões e limitações documentadas.</label><label><input type="checkbox" data-check="zeroKnownP0P1">Confirmo que não há P0/P1 conhecido aberto nas evidências revisadas.</label><label><input type="checkbox" data-check="evidenceReviewed">Revisei as 22 evidências técnicas e os resultados finais.</label><label><input id="attestation" type="checkbox">${RELEASE_RISK_ATTESTATION}</label><label style="display:grid">Observação opcional<textarea id="notes" rows="4"></textarea></label></section><button id="export" disabled>Baixar aceite assinado</button></main><script>
const review=${data};const ATTESTATION=${attestation};const reviewer=document.querySelector('#reviewer'),attestation=document.querySelector('#attestation'),notes=document.querySelector('#notes'),button=document.querySelector('#export');const key='smartzap-release-risk:'+review.sourceCertificationHash;let saved=null;try{saved=JSON.parse(localStorage.getItem(key)||'null')}catch{localStorage.removeItem(key)}if(saved?.sourceCertificationHash===review.sourceCertificationHash)review.decision=saved.decision;reviewer.value=review.decision.reviewer||'';notes.value=review.decision.notes||'';attestation.checked=review.decision.attestation===ATTESTATION;for(const input of document.querySelectorAll('[data-check]'))input.checked=review.decision.checks[input.dataset.check]===true;function save(){review.decision.reviewer=reviewer.value.trim();review.decision.notes=notes.value;review.decision.attestation=attestation.checked?ATTESTATION:'';for(const input of document.querySelectorAll('[data-check]'))review.decision.checks[input.dataset.check]=input.checked;localStorage.setItem(key,JSON.stringify(review));button.disabled=!review.readyForDecision||review.decision.reviewer.length<2||!attestation.checked||Object.values(review.decision.checks).some(value=>value!==true)}document.addEventListener('input',save);document.addEventListener('change',save);button.addEventListener('click',()=>{review.decision.reviewedAt=new Date().toISOString();save();const blob=new Blob([JSON.stringify(review,null,2)+'\\n'],{type:'application/json'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='smartzap-release-risk-'+review.release.productionVersion+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)});save();
</script></body></html>`;
}

function assertEmbeddedScriptSyntax(html) {
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  if (!match) throw new Error("Interface de aceite sem script executável.");
  new Script(match[1], { filename: "release-risk.inline.js" });
}

if (!["prepare", "verify"].includes(command)) throw new Error("Use prepare ou verify.");
const spec = readJson(resolve(root, option("spec", "qa/production-certification.json")));
const catalogPath = resolve(root, option("catalog", "jornada.md"));
const catalogMarkdown = readFileSync(catalogPath, "utf8");
const certificationPath = requiredPath("certification");
const certification = readJson(certificationPath);

if (command === "prepare") {
  const outputDir = resolve(root, option("output", `${dirname(certificationPath)}/release-risk`));
  const review = buildReleaseRiskReview({ release: spec.release, catalogMarkdown, certification });
  const jsonPath = resolve(outputDir, "release-risk.template.json");
  const htmlPath = resolve(outputDir, "release-risk.html");
  const html = reviewHtml(review);
  assertEmbeddedScriptSyntax(html);
  writePrivate(jsonPath, `${JSON.stringify(review, null, 2)}\n`);
  writePrivate(htmlPath, html);
  console.log(`Aceite de risco preparado: ${review.readyForDecision ? "pronto" : "bloqueado"}.`);
  console.log(`Interface: ${htmlPath}`);
  if (!review.readyForDecision) process.exitCode = 1;
} else {
  const reviewPath = requiredPath("review");
  const outputDir = resolve(root, option("output", dirname(reviewPath)));
  const result = evaluateReleaseRiskReview({
    review: readJson(reviewPath),
    release: spec.release,
    catalogMarkdown,
    certification,
  });
  const detailsPath = resolve(outputDir, "release-risk-details.json");
  const attestationPath = resolve(outputDir, "release-risk-attestation.json");
  writePrivate(detailsPath, `${JSON.stringify(result, null, 2)}\n`);
  writePrivate(attestationPath, `${JSON.stringify({
    schemaVersion: 1,
    kind: "smartzap-certification-attestation",
    evidenceId: "release-risk",
    status: result.status,
    release: spec.release,
    performedBy: result.reviewer,
    performedAt: result.performedAt,
    checks: result.checks,
    artifacts: [reviewPath, detailsPath].map((path) => ({ path: relative(root, path), sha256: sha256(path) })),
    issues: result.issues,
  }, null, 2)}\n`);
  console.log(`Aceite final de risco: ${result.status}.`);
  console.log(`Atestado: ${attestationPath}`);
  if (result.status !== "passed") process.exitCode = 1;
}
