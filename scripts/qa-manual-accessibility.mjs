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
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Teste de acessibilidade · SmartZap</title><style>
:root{color-scheme:dark;--bg:#080a09;--card:#141816;--line:#303a35;--text:#f4f8f5;--muted:#aab5ae;--green:#55e6ad;--green-bg:#123c30;--red:#ff7777;--red-bg:#4a2020;--soft:#0c100e}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 system-ui,-apple-system,sans-serif}button,input,textarea,select{font:inherit}main{width:min(820px,calc(100% - 28px));margin:0 auto 120px}header{position:sticky;top:0;z-index:3;padding:18px 0 14px;background:rgba(8,10,9,.97);border-bottom:1px solid var(--line)}h1{margin:0 0 4px;font-size:clamp(27px,5vw,40px);line-height:1.1}h2{margin:8px 0 6px;font-size:clamp(22px,4vw,30px)}p,li{color:var(--muted)}.progress{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;margin-top:14px;font-size:14px}.bar{height:8px;background:#202723;border-radius:999px;overflow:hidden}.bar span{display:block;width:0;height:100%;background:var(--green)}.intro,.panel,.case,.finish{margin-top:18px;padding:20px;background:var(--card);border:1px solid var(--line);border-radius:18px}.intro ol{margin:10px 0 0;padding-left:22px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.case{display:none}.case.active{display:block}label{display:grid;gap:6px}input,textarea,select{width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--soft);color:var(--text)}.attest{display:flex;align-items:flex-start;gap:10px}.attest input{width:auto;margin-top:6px}.expected{padding:14px;border-left:4px solid var(--green);border-radius:10px;background:var(--soft);color:var(--text)}.actions{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.actions button,.nav button,#export{min-height:48px;padding:12px 16px;border:1px solid var(--line);border-radius:12px;background:#202723;color:var(--text);font-weight:750;cursor:pointer}.actions .selected[data-value=pass]{background:var(--green-bg);border-color:var(--green)}.actions .selected[data-value=fail]{background:var(--red-bg);border-color:var(--red)}.nav{display:flex;justify-content:space-between;gap:12px;margin-top:18px}.nav button:disabled{opacity:.35;cursor:not-allowed}.nav .next{margin-left:auto}.notes-wrap{display:none}.notes-wrap.visible{display:grid}.technical{margin-top:14px;color:var(--muted)}.technical summary{cursor:pointer}.pill{display:inline-block;padding:3px 9px;margin:3px;border:1px solid var(--line);border-radius:999px;color:var(--muted)}.finish{display:grid;gap:12px}.finish.hidden{display:none}#export{width:100%;background:var(--green);color:#07110d;border:0}#export:disabled{opacity:.45;cursor:not-allowed}.warning{color:#ffd166}@media(max-width:600px){main{width:min(100% - 20px,820px)}header{padding-top:12px}.progress{grid-template-columns:1fr auto}.progress .bar{grid-column:1/-1;grid-row:2}.intro,.panel,.case,.finish{padding:16px}.grid,.actions{grid-template-columns:1fr}h1{font-size:28px}}
</style></head><body><main><header><h1>O SmartZap funciona sem mouse?</h1><p>Faça um teste por vez. A página salva o seu progresso.</p><div class="progress"><strong id="counter">0 de ${review.items.length} concluídos</strong><div class="bar"><span id="bar"></span></div><strong id="fails">0 com problema</strong></div></header>
<section class="intro"><strong>Como funciona:</strong><ol><li>use o teclado e o leitor de tela indicado;</li><li>siga os passos mostrados;</li><li>conte em uma frase o que aconteceu;</li><li>marque “Funcionou” ou “Encontrei problema”.</li></ol></section>
<section class="panel"><h2>Antes de começar</h2><p>Preencha uma vez. No Mac, use VoiceOver. No Windows, use NVDA. Mantenha o zoom em 200%.</p><div class="grid"><label>Seu nome<input id="reviewer" autocomplete="name" placeholder="Digite seu nome"></label><label>Leitor de tela<select id="screenReader"><option value="">Escolha</option><option>VoiceOver</option><option>NVDA</option></select></label><label>Versão do leitor<input id="screenReaderVersion" placeholder="Ex.: 15.5"></label><label>Navegador<input id="browser" placeholder="Ex.: Safari"></label><label>Versão do navegador<input id="browserVersion" placeholder="Ex.: 18.5"></label><label>Sistema<input id="operatingSystem" placeholder="Ex.: macOS 15"></label><label>Dispositivo<input id="device" placeholder="Ex.: MacBook Pro"></label><label>Zoom<input id="zoomPercent" type="number" min="200" max="200" value="200" aria-describedby="zoom-help"><small id="zoom-help">Precisa ficar em 200%.</small></label></div></section><section id="items"></section><section class="finish hidden" id="finish"><h2>Testes concluídos</h2><label class="attest"><input id="attestation" type="checkbox"><span>${MANUAL_ACCESSIBILITY_ATTESTATION}</span></label><p class="warning" id="finish-warning"></p><button id="export" disabled>Finalizar e baixar resultado</button></section></main><script>
const review=${data};const ATTESTATION=${attestation};const key='smartzap-manual-a11y:'+review.sourcePlanHash;let saved=null;try{saved=JSON.parse(localStorage.getItem(key)||'null')}catch{localStorage.removeItem(key)}if(saved?.sourcePlanHash===review.sourcePlanHash){review.reviewer=saved.reviewer||review.reviewer;review.environment=saved.environment||review.environment;for(const item of review.items){const old=saved.items?.find(x=>x.id===item.id);if(old){item.verdict=old.verdict;item.observations=old.observations||'';item.notes=old.notes||''}}}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const root=document.querySelector('#items');for(const [index,item] of review.items.entries()){const card=document.createElement('article');card.className='case';card.dataset.index=index;card.innerHTML='<p>Teste '+(index+1)+' de '+review.items.length+'</p><h2 tabindex="-1">'+esc(item.title)+'</h2><h3>Faça isto</h3><ol>'+item.instructions.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ol><p class="expected"><strong>Está certo quando:</strong><br>'+esc(item.expected)+'</p><label>O que aconteceu?<textarea class="observations" rows="3" placeholder="Escreva pelo menos uma frase curta">'+esc(item.observations)+'</textarea></label><div class="actions"><button data-value="pass">Funcionou</button><button data-value="fail">Encontrei problema</button></div><label class="notes-wrap">Qual foi o problema?<textarea class="notes" rows="3" placeholder="Explique o que impediu o uso">'+esc(item.notes)+'</textarea></label><details class="technical"><summary>Telas usadas neste teste</summary><div>'+item.routes.map(x=>'<span class="pill">'+esc(x)+'</span>').join('')+'</div></details><div class="nav"><button type="button" data-nav="previous">Anterior</button><button type="button" class="next" data-nav="next">Próximo</button></div>';root.append(card)}
const fields=['screenReader','screenReaderVersion','browser','browserVersion','operatingSystem','device','zoomPercent'];const reviewer=document.querySelector('#reviewer'),attestation=document.querySelector('#attestation');reviewer.value=review.reviewer.name||'';attestation.checked=review.reviewer.attestation===ATTESTATION;for(const field of fields)document.querySelector('#'+field).value=review.environment[field]??(field==='zoomPercent'?200:'');
let current=review.items.findIndex(item=>!item.verdict);if(current<0)current=review.items.length-1;
function show(index,moveFocus=false){current=Math.max(0,Math.min(review.items.length-1,index));document.querySelectorAll('.case').forEach((card,i)=>card.classList.toggle('active',i===current));const card=document.querySelector('.case[data-index="'+current+'"]');card.querySelector('[data-nav="previous"]').disabled=current===0;card.querySelector('[data-nav="next"]').textContent=current===review.items.length-1?'Ir para o final':'Próximo';window.scrollTo({top:Math.max(0,root.offsetTop-120),behavior:'smooth'});if(moveFocus)card.querySelector('h2').focus({preventScroll:true})}
function save(){review.reviewer.name=reviewer.value.trim();review.reviewer.attestation=attestation.checked?ATTESTATION:'';for(const field of fields){const element=document.querySelector('#'+field);review.environment[field]=field==='zoomPercent'?Number(element.value):element.value.trim()}localStorage.setItem(key,JSON.stringify(review));update()}function update(){let done=0,failed=0;document.querySelectorAll('.case').forEach((card,index)=>{const item=review.items[index];if(item.verdict)done++;if(item.verdict==='fail')failed++;card.querySelectorAll('button[data-value]').forEach(button=>button.classList.toggle('selected',button.dataset.value===item.verdict));card.querySelector('.notes-wrap').classList.toggle('visible',item.verdict==='fail')});document.querySelector('#counter').textContent=done+' de '+review.items.length+' concluídos';document.querySelector('#fails').textContent=failed+' com problema';document.querySelector('#bar').style.width=(100*done/review.items.length)+'%';const complete=done===review.items.length;document.querySelector('#finish').classList.toggle('hidden',!complete);const environmentReady=fields.every(field=>String(review.environment[field]??'').trim())&&review.environment.zoomPercent===200;const observationsReady=!review.items.some(item=>item.observations.trim().length<10);const failureNotesReady=!review.items.some(item=>item.verdict==='fail'&&!item.notes.trim());document.querySelector('#finish-warning').textContent=failed?'Há '+failed+' teste(s) com problema. O resultado ficará reprovado até a correção.':'Todos os testes foram marcados como funcionando.';document.querySelector('#export').disabled=!complete||failed>0||!environmentReady||reviewer.value.trim().length<2||!attestation.checked||!observationsReady||!failureNotesReady}
root.addEventListener('click',event=>{const verdict=event.target.closest('button[data-value]');if(verdict){const card=verdict.closest('.case'),item=review.items[Number(card.dataset.index)];item.verdict=verdict.dataset.value;save();if(item.verdict==='pass'&&item.observations.trim().length>=10&&current<review.items.length-1)setTimeout(()=>show(current+1,true),120);return}const nav=event.target.closest('button[data-nav]');if(!nav)return;if(nav.dataset.nav==='previous')show(current-1,true);else if(current<review.items.length-1)show(current+1,true);else document.querySelector('#finish').scrollIntoView({behavior:'smooth'})});root.addEventListener('input',event=>{const card=event.target.closest('.case');if(!card)return;const item=review.items[Number(card.dataset.index)];if(event.target.classList.contains('observations'))item.observations=event.target.value;if(event.target.classList.contains('notes'))item.notes=event.target.value;save()});reviewer.addEventListener('input',save);attestation.addEventListener('change',save);for(const field of fields)document.querySelector('#'+field).addEventListener('input',save);document.querySelector('#export').addEventListener('click',()=>{review.reviewer.reviewedAt=new Date().toISOString();save();const blob=new Blob([JSON.stringify(review,null,2)+'\\n'],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='smartzap-manual-accessibility-'+review.release.productionVersion+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)});update();show(current);
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
