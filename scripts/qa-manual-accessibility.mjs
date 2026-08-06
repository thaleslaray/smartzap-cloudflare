import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { Script } from "node:vm";
import {
  buildManualAccessibilityReview,
  evaluateManualAccessibilityReview,
  MANUAL_ACCESSIBILITY_ATTESTATION,
} from "./lib/manual-accessibility.mjs";

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
  const attestation = JSON.stringify(MANUAL_ACCESSIBILITY_ATTESTATION);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acessibilidade manual · SmartZap</title><style>
:root{color-scheme:dark;--bg:#080a09;--card:#141816;--line:#303a35;--text:#f4f8f5;--muted:#aab5ae;--green:#55e6ad;--red:#ff7777}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 system-ui,-apple-system,sans-serif}main{width:min(1080px,calc(100% - 32px));margin:24px auto 120px}header{position:sticky;top:0;z-index:3;padding:18px 0;background:rgba(8,10,9,.97);border-bottom:1px solid var(--line)}h1{margin:0;font-size:clamp(28px,4vw,44px)}p,li{color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.panel,.case{margin-top:18px;padding:20px;background:var(--card);border:1px solid var(--line);border-radius:18px}label{display:grid;gap:6px}input,textarea,select{width:100%;padding:11px;border:1px solid var(--line);border-radius:10px;background:#0c100e;color:var(--text);font:inherit}.attest{display:flex;align-items:flex-start;gap:10px}.attest input{width:auto;margin-top:6px}.meta{display:flex;gap:8px;flex-wrap:wrap}.pill{padding:3px 9px;border:1px solid var(--line);border-radius:999px;color:var(--muted)}.expected{padding:12px;border-left:3px solid var(--green);background:#0c100e}.actions{display:flex;gap:10px;margin:14px 0}.actions button,#export{padding:11px 16px;border:1px solid var(--line);border-radius:10px;background:#202723;color:var(--text);font-weight:700}.actions .selected[data-value=pass]{background:#123c30;border-color:var(--green)}.actions .selected[data-value=fail]{background:#4a2020;border-color:var(--red)}#export{position:fixed;right:24px;bottom:24px;background:var(--green);color:#07110d}#export:disabled{opacity:.45}.warning{color:#ffd166}.progress{display:flex;gap:12px;align-items:center}.bar{height:10px;flex:1;background:#202723;border-radius:999px;overflow:hidden}.bar span{display:block;width:0;height:100%;background:var(--green)}
</style></head><body><main><header><h1>Homologação manual de acessibilidade</h1><p>Release <code>${review.release.productionVersion}</code>. Use VoiceOver ou NVDA real, teclado e zoom real de 200%.</p><div class="progress"><strong id="counter">0/${review.items.length}</strong><div class="bar"><span id="bar"></span></div><strong id="fails">0 falhas</strong></div></header>
<section class="panel"><h2>Executor e ambiente</h2><div class="grid"><label>Nome do revisor<input id="reviewer" autocomplete="name"></label><label>Leitor de tela<select id="screenReader"><option value="">Selecione</option><option>VoiceOver</option><option>NVDA</option></select></label><label>Versão do leitor<input id="screenReaderVersion"></label><label>Navegador<input id="browser"></label><label>Versão do navegador<input id="browserVersion"></label><label>Sistema operacional<input id="operatingSystem"></label><label>Dispositivo<input id="device"></label><label>Zoom real (%)<input id="zoomPercent" type="number" min="200" max="200" value="200"></label></div><label class="attest"><input id="attestation" type="checkbox"><span>${MANUAL_ACCESSIBILITY_ATTESTATION}</span></label><p class="warning">Scanner automático não substitui esta execução. Registre em cada caso o que o leitor anunciou.</p></section><section id="items"></section><button id="export" disabled>Baixar revisão assinada</button></main><script>
const review=${data};const ATTESTATION=${attestation};const key='smartzap-manual-a11y:'+review.sourcePlanHash;let saved=null;try{saved=JSON.parse(localStorage.getItem(key)||'null')}catch{localStorage.removeItem(key)}if(saved?.sourcePlanHash===review.sourcePlanHash){review.reviewer=saved.reviewer||review.reviewer;review.environment=saved.environment||review.environment;for(const item of review.items){const old=saved.items?.find(x=>x.id===item.id);if(old){item.verdict=old.verdict;item.observations=old.observations||'';item.notes=old.notes||''}}}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const root=document.querySelector('#items');for(const [index,item] of review.items.entries()){const card=document.createElement('article');card.className='case';card.dataset.index=index;card.innerHTML='<div class="meta">'+item.routes.map(x=>'<span class="pill">'+esc(x)+'</span>').join('')+'</div><h2>'+esc(item.title)+'</h2><ol>'+item.instructions.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ol><p class="expected"><strong>Esperado:</strong> '+esc(item.expected)+'</p><div class="actions"><button data-value="pass">Aprovar caso</button><button data-value="fail">Reprovar caso</button></div><label>O que o leitor anunciou e o que foi observado<textarea class="observations" rows="3">'+esc(item.observations)+'</textarea></label><label>Falha encontrada ou observação adicional<textarea class="notes" rows="2">'+esc(item.notes)+'</textarea></label>';root.append(card)}
const fields=['screenReader','screenReaderVersion','browser','browserVersion','operatingSystem','device','zoomPercent'];const reviewer=document.querySelector('#reviewer'),attestation=document.querySelector('#attestation');reviewer.value=review.reviewer.name||'';attestation.checked=review.reviewer.attestation===ATTESTATION;for(const field of fields)document.querySelector('#'+field).value=review.environment[field]??(field==='zoomPercent'?200:'');
function save(){review.reviewer.name=reviewer.value.trim();review.reviewer.attestation=attestation.checked?ATTESTATION:'';for(const field of fields){const element=document.querySelector('#'+field);review.environment[field]=field==='zoomPercent'?Number(element.value):element.value.trim()}localStorage.setItem(key,JSON.stringify(review));update()}function update(){let done=0,failed=0;document.querySelectorAll('.case').forEach((card,index)=>{const item=review.items[index];if(item.verdict)done++;if(item.verdict==='fail')failed++;card.querySelectorAll('button[data-value]').forEach(button=>button.classList.toggle('selected',button.dataset.value===item.verdict))});document.querySelector('#counter').textContent=done+'/'+review.items.length;document.querySelector('#fails').textContent=failed+' falhas';document.querySelector('#bar').style.width=(100*done/review.items.length)+'%';const environmentReady=fields.every(field=>String(review.environment[field]??'').trim())&&review.environment.zoomPercent===200;document.querySelector('#export').disabled=done!==review.items.length||failed>0||!environmentReady||reviewer.value.trim().length<2||!attestation.checked||review.items.some(item=>item.observations.trim().length<10)}
root.addEventListener('click',event=>{const button=event.target.closest('button[data-value]');if(!button)return;review.items[Number(button.closest('.case').dataset.index)].verdict=button.dataset.value;save()});root.addEventListener('input',event=>{const card=event.target.closest('.case');if(!card)return;const item=review.items[Number(card.dataset.index)];if(event.target.classList.contains('observations'))item.observations=event.target.value;if(event.target.classList.contains('notes'))item.notes=event.target.value;save()});reviewer.addEventListener('input',save);attestation.addEventListener('change',save);for(const field of fields)document.querySelector('#'+field).addEventListener('input',save);document.querySelector('#export').addEventListener('click',()=>{review.reviewer.reviewedAt=new Date().toISOString();save();const blob=new Blob([JSON.stringify(review,null,2)+'\\n'],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='smartzap-manual-accessibility-'+review.release.productionVersion+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)});update();
</script></body></html>`;
}

function assertEmbeddedScriptSyntax(html) {
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  if (!match) throw new Error("Interface sem script executável.");
  new Script(match[1], { filename: "manual-accessibility.inline.js" });
}

if (!['prepare', 'verify'].includes(command)) throw new Error("Use prepare ou verify.");
const specPath = resolve(root, option("spec", "qa/production-certification.json"));
const spec = readJson(specPath);

if (command === "prepare") {
  const outputDir = resolve(root, option("output", "qa/reports/AUTOQA_MANUAL_A11Y_PREPARED"));
  const review = buildManualAccessibilityReview({ release: spec.release });
  const jsonPath = resolve(outputDir, "manual-accessibility.template.json");
  const htmlPath = resolve(outputDir, "manual-accessibility.html");
  const html = reviewHtml(review);
  assertEmbeddedScriptSyntax(html);
  writePrivate(jsonPath, `${JSON.stringify(review, null, 2)}\n`);
  writePrivate(htmlPath, html);
  console.log(`Revisão preparada: ${review.items.length} casos.`);
  console.log(`Interface: ${htmlPath}`);
  console.log(`Modelo JSON: ${jsonPath}`);
} else {
  const reviewPath = requiredPath("review");
  const outputDir = resolve(root, option("output", dirname(reviewPath)));
  const result = evaluateManualAccessibilityReview({ review: readJson(reviewPath), release: spec.release });
  const detailsPath = resolve(outputDir, "manual-accessibility-details.json");
  const attestationPath = resolve(outputDir, "manual-accessibility-attestation.json");
  writePrivate(detailsPath, `${JSON.stringify(result, null, 2)}\n`);
  const attestation = {
    schemaVersion: 1,
    kind: "smartzap-certification-attestation",
    evidenceId: "manual-accessibility",
    status: result.status,
    release: spec.release,
    performedBy: result.reviewer,
    performedAt: result.performedAt,
    checks: result.checks,
    artifacts: [reviewPath, detailsPath].map((path) => ({ path: relative(root, path), sha256: sha256(path) })),
    issues: result.issues,
  };
  writePrivate(attestationPath, `${JSON.stringify(attestation, null, 2)}\n`);
  console.log(`Acessibilidade manual: ${result.status}; ${result.metrics.passedCases}/${result.metrics.totalCases} casos.`);
  console.log(`Atestado: ${attestationPath}`);
  if (result.status !== "passed") process.exitCode = 1;
}
