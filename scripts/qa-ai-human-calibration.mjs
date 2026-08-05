import {
  chmodSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { Script } from "node:vm";
import {
  buildHumanCalibration,
  evaluateHumanCalibration,
  HUMAN_REVIEW_ATTESTATION,
} from "./lib/ai-human-calibration.mjs";

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

function escapeScriptJson(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e");
}

function reviewHtml(review) {
  const data = escapeScriptJson(review);
  const attestation = JSON.stringify(HUMAN_REVIEW_ATTESTATION);
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Calibração humana da IA · SmartZap</title>
  <style>
    :root{color-scheme:dark;--bg:#090b0a;--card:#141816;--line:#29312d;--text:#f3f7f4;--muted:#9aa69f;--green:#20c997;--red:#ff6b6b}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,sans-serif}main{width:min(1120px,calc(100% - 32px));margin:32px auto 120px}header{position:sticky;top:0;z-index:2;background:rgba(9,11,10,.96);padding:20px 0;border-bottom:1px solid var(--line)}h1{margin:0 0 8px;font-size:clamp(28px,4vw,44px)}p{color:var(--muted)}.progress{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.bar{height:10px;flex:1;min-width:180px;background:#202622;border-radius:999px;overflow:hidden}.bar>span{display:block;height:100%;width:0;background:var(--green)}.reviewer,.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px;margin-top:18px}.reviewer{display:grid;gap:12px}input,textarea{width:100%;background:#0d100e;color:var(--text);border:1px solid var(--line);border-radius:10px;padding:11px;font:inherit}.meta{display:flex;gap:10px;flex-wrap:wrap;color:var(--muted);font-size:14px}.pill{border:1px solid var(--line);border-radius:999px;padding:3px 9px}.conversation,.response,.expected{white-space:pre-wrap;background:#0d100e;border-radius:12px;padding:14px;margin:12px 0}.response{border-left:3px solid var(--green)}.actions{display:flex;gap:10px;margin:14px 0}.actions button,#export{border:1px solid var(--line);border-radius:10px;padding:11px 16px;background:#202622;color:var(--text);font-weight:700;cursor:pointer}.actions button[data-value=pass].selected{background:#123c30;border-color:var(--green)}.actions button[data-value=fail].selected{background:#481d1d;border-color:var(--red)}#export{position:fixed;right:24px;bottom:24px;background:var(--green);color:#07110d;border:0}#export:disabled{opacity:.45;cursor:not-allowed}.attest{display:flex;align-items:flex-start;gap:10px}.attest input{width:auto;margin-top:5px}.hidden{display:none}.warning{color:#ffd166}
  </style>
</head>
<body><main>
  <header><h1>Calibração humana da IA</h1><p>Leia as 84 respostas. Aprove somente quando a resposta for correta, segura, útil e fiel ao critério do cenário.</p><div class="progress"><strong id="counter">0/84 revisadas</strong><div class="bar"><span id="bar"></span></div><strong id="fails">0 reprovações</strong></div></header>
  <section class="reviewer"><label>Nome do revisor humano<input id="reviewer" autocomplete="name"></label><label class="attest"><input id="attestation" type="checkbox"><span>${HUMAN_REVIEW_ATTESTATION}</span></label><p class="warning">Revisão cega: o veredito automático permanece oculto e será comparado somente pelo verificador final.</p></section>
  <section id="items"></section>
  <button id="export" disabled>Baixar revisão assinada</button>
</main>
<script>
const review=${data};const ATTESTATION=${attestation};const key='smartzap-human-review:'+review.sourceEvidenceHash;
let saved=null;try{saved=JSON.parse(localStorage.getItem(key)||'null')}catch{localStorage.removeItem(key)}if(saved?.sourceEvidenceHash===review.sourceEvidenceHash&&Array.isArray(saved.items)){review.reviewer=saved.reviewer||review.reviewer;for(const item of review.items){const old=saved.items.find(x=>x.scenarioId===item.scenarioId&&x.attempt===item.attempt);if(old){item.humanVerdict=old.humanVerdict;item.humanIssues=old.humanIssues||[];item.notes=old.notes||''}}}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const conversation=messages=>messages.map(m=>String(m.role).toUpperCase()+': '+m.text).join('\\n\\n');
const root=document.querySelector('#items');
for(const [index,item] of review.items.entries()){const card=document.createElement('article');card.className='card';card.dataset.index=index;card.innerHTML='<div class="meta"><span class="pill">'+esc(item.scenarioId)+'</span><span class="pill">tentativa '+item.attempt+'</span><span class="pill">'+esc(item.group)+'</span></div><h2>'+esc(item.scenarioId)+' · resposta '+item.attempt+'</h2><h3>Conversa</h3><div class="conversation">'+esc(conversation(item.messages))+'</div><h3>Critério esperado</h3><div class="expected">'+esc(JSON.stringify(item.expected,null,2))+'</div><h3>Resposta da IA</h3><div class="response">'+esc(item.response||'[sem resposta]')+'</div><div class="actions"><button data-value="pass">Aprovar</button><button data-value="fail">Reprovar</button></div><label>Observação'+(item.humanVerdict==='fail'?' obrigatória':' opcional')+'<textarea rows="2">'+esc(item.notes)+'</textarea></label>';root.append(card)}
const reviewer=document.querySelector('#reviewer'),attestation=document.querySelector('#attestation');reviewer.value=review.reviewer.name||'';attestation.checked=review.reviewer.attestation===ATTESTATION;
function save(){review.reviewer.name=reviewer.value.trim();review.reviewer.attestation=attestation.checked?ATTESTATION:'';localStorage.setItem(key,JSON.stringify(review));update()}
function update(){let done=0,failed=0;document.querySelectorAll('.card').forEach((card,index)=>{const item=review.items[index];if(item.humanVerdict)done++;if(item.humanVerdict==='fail')failed++;card.querySelectorAll('button[data-value]').forEach(button=>button.classList.toggle('selected',button.dataset.value===item.humanVerdict))});document.querySelector('#counter').textContent=done+'/'+review.items.length+' revisadas';document.querySelector('#fails').textContent=failed+' reprovações';document.querySelector('#bar').style.width=(100*done/review.items.length)+'%';document.querySelector('#export').disabled=done!==review.items.length||reviewer.value.trim().length<2||!attestation.checked||review.items.some(i=>i.humanVerdict==='fail'&&!i.notes.trim())}
root.addEventListener('click',event=>{const button=event.target.closest('button[data-value]');if(!button)return;const card=button.closest('.card'),item=review.items[Number(card.dataset.index)];item.humanVerdict=button.dataset.value;save()});root.addEventListener('input',event=>{if(event.target.tagName!=='TEXTAREA')return;const card=event.target.closest('.card');review.items[Number(card.dataset.index)].notes=event.target.value;save()});reviewer.addEventListener('input',save);attestation.addEventListener('change',save);
document.querySelector('#export').addEventListener('click',()=>{review.reviewer.reviewedAt=new Date().toISOString();save();const blob=new Blob([JSON.stringify(review,null,2)+'\\n'],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='smartzap-ai-human-review-'+review.sourceRunId+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)});update();
</script></body></html>`;
}

function assertEmbeddedScriptSyntax(html) {
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  if (!match) throw new Error("Interface de revisão sem script executável.");
  new Script(match[1], { filename: "human-review.inline.js" });
}

if (!['prepare', 'verify'].includes(command))
  throw new Error("Use prepare ou verify.");

const reportPath = requiredPath("report");
const datasetPath = resolve(root, option("dataset", "qa/ai-dataset.json"));
const aiReport = readJson(reportPath);
const dataset = readJson(datasetPath);

if (command === "prepare") {
  const outputDir = resolve(root, option("output", `${dirname(reportPath)}/human-calibration`));
  const review = buildHumanCalibration({ aiReport, dataset });
  const jsonPath = resolve(outputDir, "human-review.template.json");
  const htmlPath = resolve(outputDir, "human-review.html");
  const html = reviewHtml(review);
  assertEmbeddedScriptSyntax(html);
  writePrivate(jsonPath, `${JSON.stringify(review, null, 2)}\n`);
  writePrivate(htmlPath, html);
  console.log(`Revisão preparada: ${review.items.length} respostas.`);
  console.log(`Interface: ${htmlPath}`);
  console.log(`Modelo JSON: ${jsonPath}`);
} else {
  const reviewPath = requiredPath("review");
  const outputPath = resolve(
    root,
    option("output", `${dirname(reviewPath)}/human-calibration-result.json`),
  );
  const result = evaluateHumanCalibration({
    review: readJson(reviewPath),
    aiReport,
    dataset,
  });
  writePrivate(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Calibração humana: ${result.status}.`);
  console.log(`Relatório: ${outputPath}`);
  if (result.status !== "passed") process.exitCode = 1;
}
