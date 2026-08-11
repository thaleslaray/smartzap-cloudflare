export function installerHtml(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Instalar SmartZap</title>
  <style>
    :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f4f7f5;background:#08110e;line-height:1.45}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 80% 0,#123729 0,transparent 34%),#08110e}
    main{width:min(760px,calc(100% - 32px));margin:0 auto;padding:56px 0 80px}.brand{color:#7ef2bb;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:.78rem}
    h1{font-size:clamp(2.2rem,7vw,4.6rem);letter-spacing:-.055em;line-height:.95;margin:18px 0 20px;max-width:700px}p{color:#aab8b1;font-size:1.05rem}
    .card{margin-top:30px;background:rgba(15,27,22,.88);border:1px solid #294139;border-radius:24px;padding:28px;box-shadow:0 20px 80px #0008}
    .step{display:flex;gap:14px;padding:18px 0;border-bottom:1px solid #22352e}.step:last-child{border:0}.number{display:grid;place-items:center;width:34px;height:34px;border:1px solid #3c6253;border-radius:50%;color:#7ef2bb;flex:0 0 auto}
    label{display:block;color:#dbe5df;margin:18px 0 8px;font-weight:650}input,select{width:100%;min-height:50px;border:1px solid #355146;border-radius:13px;background:#09120f;color:#f4f7f5;padding:0 14px;font:inherit}
    button,a.button{display:inline-flex;align-items:center;justify-content:center;min-height:50px;border:0;border-radius:999px;padding:0 22px;font:inherit;font-weight:750;cursor:pointer;text-decoration:none}button:disabled{cursor:not-allowed;opacity:.45}
    .primary{background:#7ef2bb;color:#07120d}.secondary{background:#1a2d26;color:#dce7e1;border:1px solid #355146!important}.danger{background:#311d20;color:#ffb3bb}
    .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}.muted{font-size:.9rem;color:#82938b}.status{margin-top:20px;padding:16px;border-radius:14px;background:#0a1712;border:1px solid #294139;white-space:pre-wrap}.status.error{border-color:#75323b;color:#ffb3bb}.hidden{display:none}
    code{color:#9affca}.plan{margin:16px 0;padding:0;list-style:none}.plan li{padding:9px 0;border-bottom:1px solid #22352e}.ok{color:#7ef2bb}.blocked{color:#ff9ba6}
    @media(max-width:520px){main{padding-top:30px}.card{padding:20px;border-radius:18px}.actions>*{width:100%}}
  </style>
</head>
<body><main>
  <div class="brand">SmartZap · instalador seguro</div>
  <h1>Seu WhatsApp na sua Cloudflare.</h1>
  <p>Você autoriza a conta, confere o plano e instala. A senha e a chave do cofre são criadas neste navegador e só seguem, uma vez, diretamente para a Cloudflare.</p>
  <section class="card" aria-labelledby="title"><h2 id="title">Instalação guiada</h2>
    <div class="step"><span class="number">1</span><div><strong>Autorizar Cloudflare</strong><p class="muted">O provisionador usa OAuth e permissões mínimas. Não pedimos API Token.</p><div class="actions"><a class="button primary" href="/oauth/start" id="authorize">Autorizar conta</a><button class="secondary hidden" id="disconnect">Desconectar</button></div></div></div>
    <div class="step"><span class="number">2</span><div style="width:100%"><strong>Escolher a conta</strong><div id="accounts" class="hidden"><label for="account">Conta Cloudflare</label><select id="account"></select><div id="manual-account" class="hidden"><label for="account-id">Account ID</label><input id="account-id" maxlength="32" autocomplete="off" placeholder="32 caracteres hexadecimais"></div><div class="actions"><button class="secondary" id="select-account">Usar esta conta</button></div></div></div></div>
    <div class="step"><span class="number">3</span><div style="width:100%"><strong>Criar acesso e cofre</strong><label for="password">Sua senha administrativa</label><input id="password" type="password" minlength="14" autocomplete="new-password" placeholder="Use pelo menos 14 caracteres"><label for="vault">Chave do cofre</label><input id="vault" readonly autocomplete="off"><p class="muted">Guarde essa chave. Sem ela, as integrações precisarão ser cadastradas novamente.</p><input id="recovery" class="hidden" type="file" accept="application/json"><div class="actions"><button class="secondary" id="new-vault">Gerar outra chave</button><button class="secondary" id="download">Baixar recuperação</button><button class="secondary" id="load-recovery">Retomar pelo arquivo</button></div></div></div>
    <div class="step"><span class="number">4</span><div style="width:100%"><strong>Conferir e instalar</strong><label for="prefix">Identificador da instalação</label><input id="prefix" pattern="smartzap-[a-f0-9]{8}" maxlength="17" autocomplete="off" spellcheck="false" aria-describedby="prefix-help"><p id="prefix-help" class="muted">Para retomar uma instalação, cole o identificador salvo no arquivo de recuperação.</p><div class="actions"><button class="secondary" id="new-prefix">Gerar outro identificador</button><button class="secondary" id="plan">Conferir plano</button><button class="primary" id="install" disabled>Instalar SmartZap</button></div><ul id="plan-list" class="plan"></ul></div></div>
    <div id="status" class="status" role="status" aria-live="polite">Carregando estado seguro…</div>
  </section>
</main><script>
(() => {
  const $ = (id) => document.getElementById(id);
  let session = null, currentPlan = null;
  const PREFIX=/^smartzap-[a-f0-9]{8}$/;
  const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/g,"");
  const hex = (bytes) => [...bytes].map(v=>v.toString(16).padStart(2,"0")).join("");
  const generateVault = () => { const b=new Uint8Array(32);crypto.getRandomValues(b);$("vault").value=base64url(b); };
  const invalidatePlan = () => { currentPlan=null;$("install").disabled=true;$("plan-list").textContent="";status("Identificador alterado. Confira o plano novamente antes de instalar."); };
  const generatePrefix = () => { const b=new Uint8Array(4);crypto.getRandomValues(b);$("prefix").value="smartzap-"+hex(b);invalidatePlan(); };
  const prefix = () => { const value=$("prefix").value.trim().toLowerCase();if(!PREFIX.test(value))throw new Error("Use o identificador smartzap- seguido de 8 letras ou números do arquivo de recuperação");return value; };
  const status = (message,error=false) => { $("status").textContent=message;$("status").classList.toggle("error",error); };
  const json = async (url, options={}) => { const response=await fetch(url,{...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});const data=await response.json();if(!response.ok)throw new Error(data.error||"Falha inesperada");return data; };
  async function refresh(){
    try{
      session=await json("/api/session");
      if(session.authorized){$("authorize").classList.add("hidden");$("disconnect").classList.remove("hidden");$("accounts").classList.remove("hidden");renderAccounts(session.accounts||[]);status(session.accountId?"Conta validada. Gere o plano seguro.":"Cloudflare autorizada. Selecione a conta.");}
      else status("Comece autorizando sua conta Cloudflare.");
    }catch(error){status(error.message,true)}
  }
  function renderAccounts(accounts){
    const select=$("account");select.textContent="";
    if(accounts.length){for(const account of accounts){const option=document.createElement("option");option.value=account.id;option.textContent=account.name+" · "+account.id.slice(0,6)+"…";select.append(option)}$("manual-account").classList.add("hidden");}
    else{const option=document.createElement("option");option.value="manual";option.textContent="Informar Account ID";select.append(option);$("manual-account").classList.remove("hidden");}
  }
  $("select-account").onclick=async()=>{try{const selected=$("account").value;const accountId=selected==="manual"?$("account-id").value.trim():selected;const found=(session.accounts||[]).find(a=>a.id===accountId);await json("/api/account",{method:"POST",body:JSON.stringify({accountId,accountName:found?.name||"Conta validada"})});status("Conta validada. Agora confira o plano.");session.accountId=accountId;}catch(error){status(error.message,true)}};
  $("new-vault").onclick=generateVault;
  $("new-prefix").onclick=generatePrefix;
  $("prefix").addEventListener("input",invalidatePlan);
  $("download").onclick=()=>{try{const password=$("password").value;if(password.length<14)throw new Error("Defina primeiro uma senha com pelo menos 14 caracteres.");const payload={produto:"SmartZap",criadoEm:new Date().toISOString(),masterPassword:password,vaultKey:$("vault").value,prefix:prefix()};const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="smartzap-recuperacao.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);status("Arquivo de recuperação baixado. Guarde-o em local seguro.");}catch(error){status(error.message,true)}};
  $("load-recovery").onclick=()=>$("recovery").click();
  $("recovery").onchange=async()=>{try{const file=$("recovery").files?.[0];if(!file) return;const data=JSON.parse(await file.text());if(data.produto!=="SmartZap"||typeof data.masterPassword!=="string"||data.masterPassword.length<14||!PREFIX.test(String(data.prefix||""))||!/^[A-Za-z0-9_-]{43}$/.test(String(data.vaultKey||"")))throw new Error("O arquivo de recuperação não é válido para o SmartZap");$("password").value=data.masterPassword;$("vault").value=data.vaultKey;$("prefix").value=data.prefix;invalidatePlan();status("Recuperação carregada somente neste navegador. Confira o plano para retomar.");}catch(error){status(error.message,true)}finally{$("recovery").value=""}};
  $("plan").onclick=async()=>{try{const selectedPrefix=prefix();currentPlan=await json("/api/plan",{method:"POST",body:JSON.stringify({prefix:selectedPrefix})});currentPlan.requestedPrefix=selectedPrefix;$("plan-list").textContent="";for(const item of currentPlan.items){const li=document.createElement("li");li.className=item.action==="blocked"?"blocked":"ok";li.textContent=(item.action==="create"?"Criar ":item.action==="reuse"?"Reutilizar ":"Bloqueado ")+item.kind+" · "+item.name;$("plan-list").append(li)}$("install").disabled=!currentPlan.safe;status(currentPlan.safe?"Plano seguro. Nenhum recurso do cliente será sobrescrito.":"Há colisões. Gere outro identificador antes de instalar.",!currentPlan.safe);}catch(error){invalidatePlan();status(error.message,true)}};
  $("install").onclick=async()=>{try{const password=$("password").value;const selectedPrefix=prefix();if(password.length<14)throw new Error("Defina uma senha administrativa com pelo menos 14 caracteres");if(!currentPlan?.safe||currentPlan.requestedPrefix!==selectedPrefix)throw new Error("Confira novamente o plano desta instalação antes de instalar");$("install").disabled=true;status("Provisionando recursos. Não feche esta página…");const result=await json("/api/install",{method:"POST",body:JSON.stringify({prefix:selectedPrefix,masterPassword:password,vaultKey:$("vault").value})});$("password").value="";$("vault").value="";status("SmartZap instalado. Os segredos foram descartados pelo provisionador.");if(result.url){const a=document.createElement("a");a.className="button primary";a.href=result.url;a.textContent="Abrir configuração do SmartZap";$("status").append(document.createElement("br"),a)}}catch(error){$("install").disabled=false;status(error.message,true)}};
  $("disconnect").onclick=async()=>{try{await json("/api/disconnect",{method:"POST",body:"{}"});location.href="/"}catch(error){status(error.message,true)}};
  generateVault();generatePrefix();refresh();
})();
</script></body></html>`;
}
