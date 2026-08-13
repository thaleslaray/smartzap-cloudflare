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
  <title>Revisão das respostas da IA · SmartZap</title>
  <style>
    :root{color-scheme:dark;--bg:#090b0a;--card:#141816;--line:#303a35;--text:#f3f7f4;--muted:#aab5ae;--green:#55e6ad;--green-bg:#123c30;--red:#ff7777;--red-bg:#4a2020;--soft:#0d100e}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,sans-serif}button,input,textarea{font:inherit}main{width:min(820px,calc(100% - 28px));margin:0 auto 120px}header{position:sticky;top:0;z-index:3;background:rgba(9,11,10,.97);padding:18px 0 14px;border-bottom:1px solid var(--line)}h1{margin:0 0 4px;font-size:clamp(27px,5vw,40px);line-height:1.1}h2{margin:10px 0 6px;font-size:clamp(22px,4vw,30px)}h3{font-size:15px;margin:20px 0 8px;color:var(--muted)}p{color:var(--muted);margin:6px 0}.progress{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;margin-top:14px;font-size:14px}.bar{height:8px;background:#202622;border-radius:999px;overflow:hidden}.bar>span{display:block;height:100%;width:0;background:var(--green)}.intro,.reviewer,.card,.finish{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px;margin-top:18px}.intro ul,.criteria{margin:10px 0 0;padding-left:22px;color:var(--muted)}.reviewer{display:grid;gap:14px}.card{display:none}.card.active{display:block}.meta{display:flex;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:13px}.pill{border:1px solid var(--line);border-radius:999px;padding:3px 9px}.conversation,.response,.criteria-box{background:var(--soft);border-radius:12px;padding:15px;margin:10px 0}.conversation{display:grid;gap:10px}.message{border-left:3px solid #58645e;padding-left:12px}.message.user{border-color:#6ba5ff}.message strong{display:block;font-size:13px;color:var(--muted);margin-bottom:3px}.response{border-left:4px solid var(--green);font-size:18px;white-space:pre-wrap}.criteria-box{border:1px solid var(--line)}.criteria-box strong{display:block}.actions{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0 14px}.actions button,.nav button,#export{min-height:48px;border:1px solid var(--line);border-radius:12px;padding:12px 16px;background:#202622;color:var(--text);font-weight:750;cursor:pointer}.actions button[data-value=pass].selected{background:var(--green-bg);border-color:var(--green)}.actions button[data-value=fail].selected{background:var(--red-bg);border-color:var(--red)}.nav{display:flex;justify-content:space-between;gap:12px;margin-top:18px}.nav button:disabled{opacity:.35;cursor:not-allowed}.nav .next{margin-left:auto}.note-wrap{display:none}.note-wrap.visible{display:grid}.finish{display:grid;gap:12px}.finish.hidden{display:none}label{display:grid;gap:6px}input,textarea{width:100%;background:var(--soft);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:12px}textarea{resize:vertical}.attest{display:flex;align-items:flex-start;gap:10px}.attest input{width:auto;margin-top:5px}.warning{color:#ffd166}.technical{margin-top:14px;color:var(--muted)}.technical summary{cursor:pointer}.technical pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--soft);padding:12px;border-radius:10px}#export{width:100%;background:var(--green);color:#07110d;border:0}#export:disabled{opacity:.45;cursor:not-allowed}@media(max-width:560px){main{width:min(100% - 20px,820px)}header{padding-top:12px}.progress{grid-template-columns:1fr auto}.progress .bar{grid-column:1/-1;grid-row:2}.intro,.reviewer,.card,.finish{padding:16px}.actions{grid-template-columns:1fr}h1{font-size:28px}}
  </style>
</head>
<body><main>
  <header><h1>A IA respondeu bem?</h1><p>Você verá uma resposta por vez. Não precisa entender código.</p><div class="progress"><strong id="counter">0 de 84 concluídas</strong><div class="bar"><span id="bar"></span></div><strong id="fails">0 com problema</strong></div></header>
  <section class="intro"><strong>Em cada resposta, confira cinco coisas:</strong><ul><li>responde ao que a pessoa perguntou;</li><li>é clara e útil;</li><li>não inventa informações;</li><li>não repete perguntas já respondidas;</li><li>é segura e encaminha para uma pessoa quando necessário.</li></ul></section>
  <section id="items"></section>
  <section class="finish hidden" id="finish"><h2>Revisão concluída</h2><p>Agora identifique quem fez a revisão e confirme a declaração abaixo.</p><label>Seu nome<input id="reviewer" autocomplete="name" placeholder="Digite seu nome"></label><label class="attest"><input id="attestation" type="checkbox"><span>${HUMAN_REVIEW_ATTESTATION}</span></label><p class="warning" id="finish-warning"></p><button id="export" disabled>Finalizar e baixar resultado</button></section>
</main>
<script>
const review=${data};const ATTESTATION=${attestation};const key='smartzap-human-review:'+review.sourceEvidenceHash;
let saved=null;try{saved=JSON.parse(localStorage.getItem(key)||'null')}catch{localStorage.removeItem(key)}if(saved?.sourceEvidenceHash===review.sourceEvidenceHash&&Array.isArray(saved.items)){review.reviewer=saved.reviewer||review.reviewer;for(const item of review.items){const old=saved.items.find(x=>x.scenarioId===item.scenarioId&&x.attempt===item.attempt);if(old){item.humanVerdict=old.humanVerdict;item.humanIssues=old.humanIssues||[];item.notes=old.notes||''}}}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const friendly=s=>String(s??'').replaceAll('_',' ').replace(/\\bresponsavel\\b/gi,'responsável').replace(/\\bdiagnostico\\b/gi,'diagnóstico').replace(/\\bproposta\\b/gi,'proposta');
const criteria=expected=>{const lines=[];if(expected?.all?.length)lines.push('Deve mencionar: '+expected.all.map(friendly).join(', ')+'.');if(expected?.any?.length)lines.push('Deve abordar pelo menos um destes pontos: '+expected.any.map(friendly).join(', ')+'.');if(expected?.forbidden?.length)lines.push('Tem problema se repetir ou afirmar: '+expected.forbidden.map(friendly).join(', ')+'.');if(expected?.grounded)lines.push('Não pode inventar informações.');if(expected?.handoff)lines.push('Deve encaminhar para uma pessoa ou equipe.');return lines.length?lines:['A resposta deve ser correta, útil e segura.']};
const conversation=messages=>messages.map(m=>'<div class="message '+(m.role==='user'?'user':'assistant')+'"><strong>'+(m.role==='user'?'Cliente':'IA · contexto')+'</strong><span>'+esc(m.text)+'</span></div>').join('');
const root=document.querySelector('#items');
for(const [index,item] of review.items.entries()){const card=document.createElement('article');card.className='card';card.dataset.index=index;card.innerHTML='<div class="meta"><span class="pill">Resposta '+(index+1)+' de '+review.items.length+'</span><span class="pill">'+esc(friendly(item.group))+'</span></div><h2 tabindex="-1">Leia a conversa</h2><div class="conversation">'+conversation(item.messages)+'</div><h3>O que observar</h3><div class="criteria-box"><ul class="criteria">'+criteria(item.expected).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div><h3>Resposta que você está avaliando</h3><div class="response">'+esc(item.response||'[A IA não respondeu]')+'</div><div class="actions"><button data-value="pass">Está boa</button><button data-value="fail">Tem problema</button></div><label class="note-wrap">O que precisa melhorar?<textarea rows="3" placeholder="Explique o problema em uma frase">'+esc(item.notes)+'</textarea></label><details class="technical"><summary>Detalhes do teste</summary><p>Cenário '+esc(item.scenarioId)+' · tentativa '+item.attempt+'</p></details><div class="nav"><button type="button" data-nav="previous">Anterior</button><button type="button" class="next" data-nav="next">Próxima</button></div>';root.append(card)}
const reviewer=document.querySelector('#reviewer'),attestation=document.querySelector('#attestation');reviewer.value=review.reviewer.name||'';attestation.checked=review.reviewer.attestation===ATTESTATION;
let current=review.items.findIndex(item=>!item.humanVerdict);if(current<0)current=review.items.length-1;
function show(index,moveFocus=false){current=Math.max(0,Math.min(review.items.length-1,index));document.querySelectorAll('.card').forEach((card,i)=>card.classList.toggle('active',i===current));const card=document.querySelector('.card[data-index="'+current+'"]');card.querySelector('[data-nav="previous"]').disabled=current===0;card.querySelector('[data-nav="next"]').textContent=current===review.items.length-1?'Ir para o final':'Próxima';window.scrollTo({top:Math.max(0,root.offsetTop-120),behavior:'smooth'});if(moveFocus)card.querySelector('h2').focus({preventScroll:true})}
function save(){review.reviewer.name=reviewer.value.trim();review.reviewer.attestation=attestation.checked?ATTESTATION:'';localStorage.setItem(key,JSON.stringify(review));update()}
function update(){let done=0,failed=0;document.querySelectorAll('.card').forEach((card,index)=>{const item=review.items[index];if(item.humanVerdict)done++;if(item.humanVerdict==='fail')failed++;card.querySelectorAll('button[data-value]').forEach(button=>button.classList.toggle('selected',button.dataset.value===item.humanVerdict));card.querySelector('.note-wrap').classList.toggle('visible',item.humanVerdict==='fail')});document.querySelector('#counter').textContent=done+' de '+review.items.length+' concluídas';document.querySelector('#fails').textContent=failed+' com problema';document.querySelector('#bar').style.width=(100*done/review.items.length)+'%';const complete=done===review.items.length;document.querySelector('#finish').classList.toggle('hidden',!complete);const notesReady=!review.items.some(i=>i.humanVerdict==='fail'&&!i.notes.trim());document.querySelector('#finish-warning').textContent=failed?(notesReady?'Você marcou '+failed+' resposta(s) com problema. O resultado ficará reprovado até elas serem corrigidas.':'Explique o problema de cada resposta marcada.'):'Todas as respostas foram marcadas como boas.';document.querySelector('#export').disabled=!complete||reviewer.value.trim().length<2||!attestation.checked||!notesReady}
root.addEventListener('click',event=>{const verdict=event.target.closest('button[data-value]');if(verdict){const card=verdict.closest('.card'),item=review.items[Number(card.dataset.index)];item.humanVerdict=verdict.dataset.value;save();if(item.humanVerdict==='pass'&&current<review.items.length-1)setTimeout(()=>show(current+1,true),120);return}const nav=event.target.closest('button[data-nav]');if(!nav)return;if(nav.dataset.nav==='previous')show(current-1,true);else if(current<review.items.length-1)show(current+1,true);else document.querySelector('#finish').scrollIntoView({behavior:'smooth'})});root.addEventListener('input',event=>{if(event.target.tagName!=='TEXTAREA')return;const card=event.target.closest('.card');review.items[Number(card.dataset.index)].notes=event.target.value;save()});reviewer.addEventListener('input',save);attestation.addEventListener('change',save);
document.querySelector('#export').addEventListener('click',()=>{review.reviewer.reviewedAt=new Date().toISOString();save();const blob=new Blob([JSON.stringify(review,null,2)+'\\n'],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='smartzap-ai-human-review-'+review.sourceRunId+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)});update();
show(current);
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
