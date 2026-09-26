"use strict";
/* =====================================================================
   OPEN MUSE - an open-source, local-first personal agent.
   Original implementation. Everything runs in this browser.
   ===================================================================== */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const nowISO = () => new Date().toISOString();
const uid = p => (p||"id") + "-" + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4);

/* ---------------- store (Personal VM) ----------------
   Plain mode: JSON in localStorage.
   Locked mode: AES-GCM(PBKDF2(passphrase)) - the key never leaves the page. */
const Store = {
  raw: null,          // decrypted object while unlocked
  locked: false,
  passKey: null,      // CryptoKey while session unlocked
  KEY: "openmuse.store.v1",
  default(){
    return {
      settings: { provider: "gemini", model: "", hasKey: false, saveKey: false, keyStored: "", mode: "agent", searchProvider: "tavily", searchKey: "", openNetwork: false, skillsOff: [], autonomy: true, theme: "serious", density: "comfortable", font: "m", statusStrip: true, localUrl: "http://localhost:11434/v1" },
      cloak: { on: false, rules: [] },   // {id, real, twin, kind, auto, created} - twins never leave the device
      habits: [],        // {id,name,cadence:"daily"|"weekly",created,checks:[day-or-week keys]}
      chat: [],          // {role, text, ts, kind}
      goals: [],         // {id,title,created,due,note,plan:{steps:[]},status}
      memory: [],        // {id,text,ts,source}
      audit: [],         // {ts,kind,text}
      connectors: [      // local permission model (scopes gate what Muse may plan)
        {id:"email",  name:"Email",    glyph:"✉", desc:"Read and draft email",            scope:"off"},
        {id:"cal",    name:"Calendar", glyph:"◷", desc:"See availability, draft events",  scope:"off"},
        {id:"files",  name:"Files",    glyph:"▤", desc:"Read documents you point it at",  scope:"off"},
        {id:"web",    name:"Web",      glyph:"◎", desc:"Look things up while planning",   scope:"off"},
        {id:"pay",    name:"Payments", glyph:"◈", desc:"Prepare checkouts (always needs approval)", scope:"off"},
      ],
      counters: { actions: 0 },
      suggestions: [],
      evolutions: [],     // {id,ts,ask,source,title,rationale,changes,testPlan,status,attempts,eval,decidedAt}
      tasks: [],          // {id,text,status,created,doneAt}
      reminders: [],      // {id,text,at,status,created,firedAt,late}
      userSkills: [],     // {id,name,text}
      miniapps: [],       // {id,name,code,created,from}
      mcps: [],           // {id,name,url,key,tools:[{name,desc}]}
      customTools: [],    // {id,name,desc,argsHint,code,sampleArgs,status,eval,created}
      worklog: [],        // {ts,text} - milestone resume doc, newest first
      coder: { planMode:false, activeSession:"main", sessions:[{id:"main",name:"Main",created:new Date().toISOString(),updated:new Date().toISOString(),chat:[],checkpoint:""}], archives:[], lastCheckpoint:"" },
      agents: [],         // {id,name,prompt,created} - custom workforce specialists
      automations: [],    // {id,text,cadence,nextRun,lastRun,runs,status,created}
      lastSeen: "",
    };
  },
  async deriveKey(pass, salt){
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({name:"PBKDF2", salt, iterations:210000, hash:"SHA-256"}, base, {name:"AES-GCM", length:256}, false, ["encrypt","decrypt"]);
  },
  async load(){
    const blob = localStorage.getItem(this.KEY);
    if(!blob){ this.raw = this.default(); return; }
    const parsed = JSON.parse(blob);
    if(parsed.enc){
      this.locked = true; this.raw = null; this._cipher = parsed;   // needs passphrase
    } else {
      this.raw = Object.assign(this.default(), parsed);
      this.raw.settings = Object.assign(this.default().settings, parsed.settings || {});
    }
  },
  async save(){
    if(this.locked && this.passKey){
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const salt = this._cipher ? Uint8Array.from(atob(this._cipher.salt), c=>c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
      const data = new TextEncoder().encode(JSON.stringify(this.raw));
      const ct = await crypto.subtle.encrypt({name:"AES-GCM", iv}, this.passKey, data);
      const b64 = buf => { const a=new Uint8Array(buf); let s=""; for(let i=0;i<a.length;i+=0x8000) s+=String.fromCharCode(...a.subarray(i,i+0x8000)); return btoa(s); };
      this._cipher = {enc:1, v:1, salt:b64(salt), iv:b64(iv), data:b64(ct)};
      localStorage.setItem(this.KEY, JSON.stringify(this._cipher));
    } else if(!this.locked){
      localStorage.setItem(this.KEY, JSON.stringify(this.raw));
    }
  },
  async lock(pass){
    const salt = crypto.getRandomValues(new Uint8Array(16));
    // stash the salt first so save() encrypts with the SAME key it stores
    this._cipher = {enc:1, v:1, salt: btoa(String.fromCharCode(...salt)), iv:"", data:""};
    this.passKey = await this.deriveKey(pass, salt);
    this.locked = true;
    await this.save();
  },
  async unlock(pass){
    const salt = Uint8Array.from(atob(this._cipher.salt), c=>c.charCodeAt(0));
    const key = await this.deriveKey(pass, salt);
    const iv = Uint8Array.from(atob(this._cipher.iv), c=>c.charCodeAt(0));
    const data = Uint8Array.from(atob(this._cipher.data), c=>c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({name:"AES-GCM", iv}, key, data);
    const dec = JSON.parse(new TextDecoder().decode(pt));
    this.raw = Object.assign(this.default(), dec);
    this.raw.settings = Object.assign(this.default().settings, dec.settings || {});
    this.passKey = key;
    return true;
  },
  wipe(){ localStorage.removeItem(this.KEY); }
};
const S = () => Store.raw;

/* model providers - OpenAI-compatible chat completions shape */
const PROVIDERS = {
  gemini:      { name:"Gemini",       url:"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", nativeCatalog:"https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", defModel:"gemini-3.8-flash", keyPh:"AIza...", hint:"free key from aistudio.google.com/apikey - the most reliable free tier, called straight from this browser", hintHtml:'free key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> - the most reliable free tier, called straight from this browser', authCatalog:true,
                 fallback:["gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash","gemini-3.5-flash-lite","gemini-3-flash-preview","gemini-3.1-pro-preview","gemini-3-pro-preview","gemini-3.1-flash-lite","gemini-3.1-flash-lite-preview","gemini-2.5-pro","gemini-2.5-flash","gemini-2.5-flash-lite","gemini-2.5-flash-preview-09-2025","gemini-2.0-flash","gemini-2.0-flash-lite","gemini-flash-latest"] },
  engine:      { name:"On-device (built-in)", builtin:true, defModel:"", keyPh:"no key needed", hint:"Muse's own engine runs the model right here in this app - WebGPU when your device has it, plain WASM otherwise. Weights download once from Hugging Face, then it works offline. Nothing you type ever leaves this device.",
                 fallback:[] },
  openrouter:  { name:"OpenRouter",   url:"https://openrouter.ai/api/v1/chat/completions", modelsUrl:"https://openrouter.ai/api/v1/models", defModel:"openai/gpt-4o-mini",       keyPh:"sk-or-...",    hint:"key from openrouter.ai/keys",
                 fallback:["openai/gpt-4o-mini","openai/gpt-4o","anthropic/claude-sonnet-4.5","google/gemini-2.5-flash","deepseek/deepseek-chat-v3-0324"] },
  tokenharbor: { name:"Token Harbor", url:"https://tokenharbor.ai/v1/chat/completions",    modelsUrl:"https://tokenharbor.ai/v1/models",    defModel:"deepseek-v4.1-flash:free", keyPh:"thk_live_...", hint:"Universal Key from the tokenharbor.ai dashboard - :free models never charge", authCatalog:true,
                 fallback:["deepseek-v4.1-flash:free","mimo-v2.5:free","muse-spark-3","kimi-k3","glm-5.3","gemini-3.8-flash"] },
  nim:         { name:"NVIDIA NIM",   nim:true, defModel:"", keyPh:"nvapi-... (optional)", hint:"self-hosted NIM container (docker, port 8000) - no key needed locally. Verified constraint: NVIDIA's hosted integrate.api.nvidia.com only allows browser calls from build.nvidia.com itself, so a hosted nvapi- key cannot work from any web app - run NIM locally instead.",
                 fallback:[] },
  local:       { name:"Local model",  local:true, defModel:"", keyPh:"no key needed", hint:"runs entirely on your machine - Ollama (ollama serve) or LM Studio's local server. No key, no cloud: prompts never leave this device.",
                 fallback:[] },
  edge:        { name:"On-device (EDGE//AI)", edge:true, defModel:"", keyPh:"no key needed", hint:"the EDGE//AI app runs the model in a hidden frame on this device - first use downloads model weights (Hugging Face), after that it works offline. No key, no cloud.",
                 fallback:[] },
};
const provider = () => PROVIDERS[S().settings.provider] || PROVIDERS.openrouter;
const activeModel = () => S().settings.model || provider().defModel;
/* local provider endpoints come from the user-set base URL */
function provEndpoints(){
  const p = provider();
  if(p.local){
    const base = String(S().settings.localUrl || "http://localhost:11434/v1").replace(/\/+$/,"");
    return { url: base + "/chat/completions", modelsUrl: base + "/models", base };
  }
  if(p.nim){
    const base = String(S().settings.nimUrl || "http://localhost:8000/v1").replace(/\/+$/,"");
    return { url: base + "/chat/completions", modelsUrl: base + "/models", base };
  }
  return { url: p.url, modelsUrl: p.modelsUrl, base: "" };
}

/* ---------------- audit ---------------- */
/* worklog: persistent milestone doc so any later session resumes cleanly.
   Milestones only - the audit trail keeps the full detail. */
async function logWork(text){
  const s=S(); if(!s) return;
  if(!s.worklog) s.worklog=[];
  s.worklog.unshift({ts:nowISO(), text});
  if(s.worklog.length>40) s.worklog.length=40;
  await Store.save(); renderWorklog();
}
function worklogNow(){
  const s=S(); if(!s) return "";
  const bits=[];
  const active=s.goals.find(g=>g.status==="active");
  if(active){
    const step=active.plan.steps.find(x=>x.status==="todo"||x.status==="approval");
    bits.push(`active goal "${active.title}" (${active.plan.steps.filter(x=>x.status==="done").length}/${active.plan.steps.length} steps done${step?`, next: "${step.title}"${step.status==="approval"?" - waiting for approval":""}`:", plan complete"})`);
  } else bits.push("no active goal");
  const pend=s.goals.flatMap(g=>g.plan.steps).filter(x=>x.status==="approval").length;
  if(pend) bits.push(`${pend} approval${pend>1?"s":""} waiting`);
  if(s.memory.length) bits.push(`${s.memory.length} memor${s.memory.length>1?"ies":"y"}`);
  const muted=Object.entries((s.proactivity&&s.proactivity.kinds)||{}).filter(([,k])=>k.muted).map(([n])=>n);
  if(muted.length) bits.push(`proposal kinds muted: ${muted.join(", ")}`);
  return bits.join(" · ");
}
function renderWorklog(){
  const s=S(); if(!s || !$("#worklog")) return;
  const entries=(s.worklog||[]).slice(0,15).map(w=>`<div class="auline"><span class="t">${fmtD(w.ts)}</span><span class="k">work</span><span>${esc(w.text)}</span></div>`).join("");
  $("#worklog").innerHTML = `<div class="wlbox"><div class="lbl">Worklog - resume card</div><div class="wlnow"><b>Right now:</b> ${esc(worklogNow())}</div>${entries || `<div class="empty">Milestones land here as they happen.</div>`}</div>`;
}

async function audit(kind, text){
  S().audit.unshift({ts: nowISO(), kind, text});
  if(S().audit.length > 500) S().audit.length = 500;
  if(kind === "action") S().counters.actions++;
  await Store.save();
  renderAudit(); renderStatus();
}

/* ---------------- ui helpers ---------------- */
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("on"); clearTimeout(t._x); t._x=setTimeout(()=>t.classList.remove("on"),2600); }
function openModal(html){ const m=$("#modal"); m.innerHTML=html; $("#modalwrap").classList.add("on");
  m.querySelectorAll(".modal-cancel").forEach(b=>b.addEventListener("click", closeModal)); }
function closeModal(){ $("#modalwrap").classList.remove("on"); }
$("#modalwrap").addEventListener("click", e=>{ if(e.target.id==="modalwrap" && !$("#modalwrap").dataset.sticky) closeModal(); });
const esc = s => s.replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmtT = iso => { const d=new Date(iso); return d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}); };
const fmtD = iso => { const d=new Date(iso); return d.toLocaleString([], {year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}); };

/* navigation */
$$(".navbtn").forEach(b => b.addEventListener("click", () => {
  switchView(b.dataset.view);
  $("#rail").classList.remove("open"); $("#railbackdrop").style.display="none";
}));
$("#menubtn").addEventListener("click", ()=>{ const r=$("#rail"); r.classList.toggle("open"); $("#railbackdrop").style.display = r.classList.contains("open") ? "block" : "none"; });
$("#railbackdrop").addEventListener("click", ()=>{ $("#rail").classList.remove("open"); $("#railbackdrop").style.display="none"; });

/* ---------------- status / queue ----------------
   The dock rail is live: it shows what Muse is doing right now (goal step,
   active tool with a spinner, last completed action) and compacts honestly
   when idle. RT is transient runtime state - never persisted. */
const RT = {state:"idle", step:"", tool:"", last:""};
function setRT(patch){ Object.assign(RT, patch); renderStatus(); }
function renderStatus(){
  const s=S(); if(!s) return;
  const busy = RT.state!=="idle" || !!RT.tool;
  document.body.classList.toggle("agent-busy", busy);
  $("#st-title").textContent = busy ? "Working" : "Agent status";
  $("#st-live").hidden = !busy;
  $("#st-step").textContent = RT.step || "Working";
  $("#st-tool").hidden = !RT.tool;
  $("#st-toolname").textContent = RT.tool;
  const teamBox = $("#st-team");
  if(TEAM.active && TEAM.agents.length){
    teamBox.hidden = false;
    teamBox.innerHTML = TEAM.agents.map(ag=>
      `<div class="teamrow"><span class="tic ${ag.status}">${ag.status==="done"?"\u2713":ag.status==="failed"?"\u2715":ag.status==="running"?'<i class="spin"></i>':ag.status==="waiting"?"\u25cc":"\u00b7"}</span><span class="trole">${esc(ag.role)}${roleToolsAllowed(ag.role)?' <span style="color:var(--dim2)" title="Tools on: web search, page fetch, calculator">⚙</span>':""}</span><span class="ttask">${esc(ag.task)}${ag.status==="waiting"&&ag.depends?" (after "+ag.depends.join("+")+")":""}</span></div>`).join("");
  } else teamBox.hidden = true;
  $("#st-lastrow").hidden = !RT.last;
  $("#st-last").textContent = RT.last; $("#st-last").title = RT.last;
  const keyless = !!provider().local || !!provider().edge || !!provider().nim || !!provider().builtin;
  // A key left in session storage from another engine is irrelevant to a
  // keyless provider - the rail reports what THIS engine needs and has.
  const rawKey = sessionStorage.getItem("openmuse.key") ? "set (session)" : (s.settings.keyStored ? "set (device)" : null);
  const keyTxt = keyless ? (provider().nim && rawKey ? rawKey : null) : rawKey;
  // Only name a provider/model once one is actually usable - a default label
  // with no key behind it is a claim the app can't back. Keyless providers
  // (local, EDGE//AI) are usable the moment they are selected.
  const em = (provider().edge ? (EdgeBridge.loadedModel || activeModel()) : provider().builtin ? (LocalEngine.loadedModel || "") : activeModel()) || "";
  const m = keyless ? provider().name + (em ? " / " + em : "") : (keyTxt && em ? provider().name + " / " + em : null);
  $("#st-model").textContent = m || "none yet";
  $("#st-model").title = m || "";
  $("#st-model").classList.toggle("muted", !m);
  $("#st-key").textContent = keyless ? (keyTxt || (provider().nim ? "optional" : "not needed")) : (keyTxt || "none yet");
  const cl=$("#st-cloak"); if(cl){ cl.textContent = Cloak.on() ? `on \u00b7 ${Cloak.rules().length} rule${Cloak.rules().length===1?"":"s"}` : "off"; cl.classList.toggle("muted", !Cloak.on()); }
  $("#st-key").classList.toggle("muted", !keyTxt && !keyless);
  $("#st-actions").textContent = s.counters.actions;
  const pending = s.goals.flatMap(g=>g.plan.steps).filter(x=>x.status==="approval").length;
  $("#st-pending").textContent = pending;
  $("#st-pending").classList.toggle("hot", pending>0);
  $("#st-minipending").hidden = pending===0; $("#st-minipending").textContent = pending;
  $("#memcount").textContent = s.memory.length;
  const strip = $("#mstrip");
  if(strip){
    /* calm shell: the strip only earns its row when something is happening */
    strip.hidden = s.settings.statusStrip === false || (!busy && pending===0);
    if(!strip.hidden){
      const queued = s.goals.flatMap(g=>g.plan.steps.filter(x=>x.status!=="done")).length;
      $("#ms-text").textContent = busy
        ? "Working: " + (RT.step || "Working") + (RT.tool ? " · " + RT.tool : "")
        : (queued ? `Idle · ${queued} in queue` : "Idle");
      $("#ms-pending").hidden = pending===0; $("#ms-pending").textContent = pending;
      $("#ms-pending").title = pending + " awaiting approval";
    }
  }
  const q = $("#queue");
  const items = s.goals.flatMap(g=>g.plan.steps.filter(x=>x.status!=="done").map(x=>({g,x})));
  q.innerHTML = items.length ? items.slice(0,8).map(({g,x}) =>
    `<div class="queue-item">${esc(x.title)}<div class="w">${esc(g.title)} · ${x.status}${x.kind!=="agent"?" · "+x.kind:""}</div></div>`).join("")
    : `<div class="empty" style="padding:14px">Queue is empty.<br>Set a goal and Muse starts planning.</div>`;
}

/* ---------------- renders ---------------- */
function renderAudit(){
  const s=S(); if(!s) return;
  renderWorklog();
  $("#auditlog").innerHTML = s.audit.length ? s.audit.map(a =>
    `<div class="auline"><span class="t">${fmtD(a.ts)}</span><span class="k">${esc(a.kind)}</span><span>${esc(a.text)}</span></div>`).join("")
    : `<div class="empty">Nothing yet. Every action Muse takes will be recorded here.</div>`;
}
function renderMemory(){
  const s=S(); if(!s) return;
  const byDir={preferences:[],people:[],projects:[],facts:[]};
  s.memory.forEach(m=>byDir[VM_DIRS[m.kind||(m.kind=memKind(m.text))]||"facts"].push(m));
  const dirHtml=Object.entries(byDir).filter(([,items])=>items.length).map(([dir,items])=>
    `<div class="lbl" style="margin:14px 0 8px">vm://memory/${dir}</div>` + items.map(m=>memItemHtml(m)).join("")).join("");
  $("#memlist").innerHTML = s.memory.length ? dirHtml
    : `<div class="empty">Muse has not learned anything yet. Talk to it - it remembers what matters, and you can edit or forget anything.</div>`;
  bindMemlist();
}
function memItemHtml(m){
  return `<div class="memitem"><div class="txt">${m.pinned?`<span class="memchip pinned">pinned</span>`:""}<span class="memchip">${m.kind||"fact"}</span>${esc(m.text)}<div class="when">${vmPath(m)} · learned ${m.ts.slice(0,10)} · ${esc(m.source||"conversation")}${m.uses?" · used "+m.uses+"x":""}${m.updated?" · revised "+m.updated+"x":""}${m.expiresAt?(memAlive(m)?" · expires "+m.expiresAt.slice(0,10):" · expired - removed on next load"):""}${m.pinned?" · rides every prompt":""}</div></div>
     <button class="iconbtn${m.pinned?" on":""}" data-pinmem="${m.id}" title="${m.pinned?"Unpin - stop injecting into every prompt":"Pin - always inject into every prompt"}">⚲</button>
     <button class="iconbtn" data-editmem="${m.id}" title="Edit this memory">\u270e</button>
     <button class="iconbtn" data-forget="${m.id}" title="Forget this">✕</button></div>`;
}
function bindMemlist(){
  $$("#memlist [data-pinmem]").forEach(b => b.addEventListener("click", async () => {
    const m=S().memory.find(x=>x.id===b.dataset.pinmem); if(!m) return;
    m.pinned=!m.pinned;
    await audit("memory", `${m.pinned?"Pinned":"Unpinned"}: "${m.text.slice(0,60)}"${m.pinned?" - it rides every prompt now":""}`);
    await Store.save(); renderMemory();
  }));
  $$("#memlist [data-editmem]").forEach(b => b.addEventListener("click", () => {
    const m=S().memory.find(x=>x.id===b.dataset.editmem); if(!m) return;
    openModal(`<h3>Edit memory</h3>
      <div class="field"><input type="text" id="memedit" value="${esc(m.text).replace(/"/g,"&quot;")}" maxlength="280"></div>
      <div class="row"><button class="btn modal-cancel">Cancel</button><button class="btn pri" id="memeditsave">Save</button></div>`);
    $("#memeditsave").onclick=async()=>{
      const t=$("#memedit").value.trim().slice(0,280);
      if(t.length>=8 && t!==m.text){ await audit("memory", `Edited memory: "${m.text.slice(0,60)}" -> "${t.slice(0,60)}"`); m.text=t; m.updated=(m.updated||0)+1; m.kind=memKind(t); m.expiresAt=memExpiry(t); delete m._tok; await Store.save(); renderMemory(); }
      closeModal();
    };
    setTimeout(()=>$("#memedit").focus(), 50);
  }));
  $$("#memlist [data-forget]").forEach(b => b.addEventListener("click", async () => {
    const id=b.dataset.forget; const i=S().memory.findIndex(m=>m.id===id);
    if(i>=0){ const [gone]=S().memory.splice(i,1); await audit("memory", `Forgot: "${gone.text}"`); await Store.save(); renderMemory(); renderStatus(); toast("Forgotten."); }
  }));
}
function renderConnectors(){
  const s=S(); if(!s) return;
  $("#connlist").innerHTML = s.connectors.map(c =>
    `<div class="conn"><div class="glyph">${c.glyph}</div>
      <div class="inf"><b>${esc(c.name)}</b><p>${esc(c.desc)}</p></div>
      <div class="seg" data-conn="${c.id}">
        ${["off","read","read+write"].map(v=>`<button data-v="${v}" class="${c.scope===v?"on":""}">${v}</button>`).join("")}
      </div></div>`).join("");
  $$("#connlist .seg button").forEach(b => b.addEventListener("click", async () => {
    const seg=b.parentElement; const c=S().connectors.find(x=>x.id===seg.dataset.conn);
    c.scope=b.dataset.v; await audit("permission", `${c.name} permission set to "${c.scope}"`);
    await Store.save(); renderConnectors();
  }));
}
function dueInfo(g){
  if(!g.due) return null;
  const end=new Date(g.due+"T23:59:59");
  const days=Math.ceil((end-Date.now())/86400000);
  return {days, label:days<0?`${Math.abs(days)}d overdue`:days===0?"due today":days===1?"due tomorrow":`${days}d left`};
}
function moveStep(gid,sid,delta){
  const g=S().goals.find(x=>x.id===gid); if(!g) return;
  const i=g.plan.steps.findIndex(x=>x.id===sid), j=i+delta;
  if(i<0||j<0||j>=g.plan.steps.length) return;
  [g.plan.steps[i],g.plan.steps[j]]=[g.plan.steps[j],g.plan.steps[i]];
  audit("plan",`Reordered plan step on "${g.title}"`).then(()=>Store.save()).then(()=>renderGoals());
}
function downloadText(name,type,text){
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function goalsMarkdown(){
  return `# Open Muse goals\n\n`+S().goals.map(g=>{
    const meta=[g.due?`Due: ${g.due}`:"",g.note?`Steering: ${g.note}`:""].filter(Boolean).join(" · ");
    return `## ${g.title}\n${meta?`\n${meta}\n`:""}\n`+g.plan.steps.map(x=>`- [${x.status==="done"?"x":" "}] ${x.title} (${x.kind})${x.output?`\n  - Output: ${x.output.replace(/\n/g," ").slice(0,500)}`:""}`).join("\n");
  }).join("\n\n");
}
function csvCell(v){ return `"${String(v??"").replace(/"/g,'""')}"`; }
function goalsCSV(){
  const rows=[["goal","goal_status","due","steering","step","step_status","kind","output"]];
  S().goals.forEach(g=>g.plan.steps.forEach(x=>rows.push([g.title,g.status,g.due||"",g.note||"",x.title,x.status,x.kind,x.output||""])));
  return rows.map(r=>r.map(csvCell).join(",")).join("\n");
}
function renderGoals(){
  const s=S(); if(!s) return;
  const strip=$("#duestrip");
  const due=s.goals.filter(g=>g.status!=="done"&&g.due).map(g=>({g,d:dueInfo(g)})).filter(x=>x.d&&x.d.days<=14).sort((a,b)=>a.d.days-b.d.days);
  strip.hidden=!due.length;
  strip.innerHTML=due.length?`<b>Due soon</b>${due.map(({g,d})=>`<span class="duechip ${d.days<0?"late":""}">${esc(g.title)} · ${d.label}</span>`).join("")}`:"";
  const grid=$("#goalgrid");
  if(!s.goals.length){ grid.innerHTML=`<div class="empty" style="grid-column:1/-1">No goals yet. Tell Muse a goal - "my goal is to..." - or use + New goal.</div>`; return; }
  grid.innerHTML = s.goals.map(g => {
    const done=g.plan.steps.filter(x=>x.status==="done").length;
    const pct=g.plan.steps.length?Math.round(100*done/g.plan.steps.length):0;
    const di=dueInfo(g);
    return `<div class="goal ${g.status==="done"?"archived":""}" data-goal="${g.id}">
      <h3>${esc(g.title)}</h3>
      <div class="goalmeta">${g.status==="done"?'<span class="pill ok">Archived complete</span>':""}${di?`<span class="pill ${di.days<0?"bad":di.days<=3?"warn":""}">${esc(di.label)} · ${esc(g.due)}</span>`:""}${g.note?`<span class="steernote" title="Injected into every planning and execution prompt">↳ ${esc(g.note)}</span>`:""}</div>
      <div class="progbar"><i style="width:${pct}%"></i></div>
      <div class="small" style="font-size:11.5px;color:var(--dim)">${done}/${g.plan.steps.length} steps · ${g.status}</div>
      <div class="steps">${g.plan.steps.map((x,i)=>{
        const ic = x.status==="done"?"✓":x.status==="approval"?"⏸":x.status==="doing"?"…":x.kind==="user"?"◌":"·";
        return `<div class="step ${x.status}" draggable="true" data-dragstep="${g.id}|${x.id}" ${x.status==="done"?`data-reopen="${g.id}|${x.id}" title="Click to reopen this step"`:""}><span class="drag" aria-hidden="true">⠿</span><span class="ic">${ic}</span><span class="st-t">${esc(x.title)}</span><span class="stepmoves"><button class="iconbtn" aria-label="Move step up" data-move="${g.id}|${x.id}|-1" ${i===0?"disabled":""}>↑</button><button class="iconbtn" aria-label="Move step down" data-move="${g.id}|${x.id}|1" ${i===g.plan.steps.length-1?"disabled":""}>↓</button></span><span class="tag">${x.kind}</span></div>`;
      }).join("")}</div>
      <div class="row">
        <button class="btn pri" data-advance="${g.id}" ${g.status==="done"?"disabled":""}>${g.status==="done"?"Complete":"Advance"}</button>
        <button class="btn" data-discuss="${g.id}">Discuss</button>
        <span class="gmenu"><button class="btn" data-goalmenu="${g.id}" aria-label="More actions for this goal">&#8943;</button><span class="gmenu-pop">
          <button class="btn" data-tune="${g.id}">Tune</button>
          <button class="btn" data-team="${g.id}|team">Team</button>
          <button class="btn" data-team="${g.id}|swarm">Swarm</button>
          <button class="btn" data-team="${g.id}|workforce">Workforce</button>
          <button class="btn badb" data-delgoal="${g.id}">Drop</button>
        </span></span>
      </div></div>`;
  }).join("");
  $$('[data-move]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); const [g,x,d]=b.dataset.move.split('|'); moveStep(g,x,+d); });
  $$('[data-goalmenu]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); const pop=b.parentElement.querySelector('.gmenu-pop'); const was=pop.classList.contains('open'); $$('.gmenu-pop.open').forEach(x=>x.classList.remove('open')); if(!was)pop.classList.add('open'); });
  let drag=null;
  $$('[data-dragstep]').forEach(el=>{
    el.ondragstart=()=>{ drag=el.dataset.dragstep; el.classList.add('dragging'); };
    el.ondragend=()=>{ drag=null; el.classList.remove('dragging'); };
    el.ondragover=e=>e.preventDefault();
    el.ondrop=e=>{ e.preventDefault(); if(!drag) return; const [sg,sid]=drag.split('|'),[tg,tid]=el.dataset.dragstep.split('|'); if(sg!==tg||sid===tid)return; const g=S().goals.find(x=>x.id===sg),from=g.plan.steps.findIndex(x=>x.id===sid),to=g.plan.steps.findIndex(x=>x.id===tid); const [item]=g.plan.steps.splice(from,1); g.plan.steps.splice(to,0,item); audit('plan',`Reordered plan step on "${g.title}"`).then(()=>Store.save()).then(()=>renderGoals()); };
  });
  $$('[data-tune]').forEach(b=>b.onclick=()=>{ const g=S().goals.find(x=>x.id===b.dataset.tune); openModal(`<h3>Tune goal</h3><div class="sub">Steering rides every planning and execution prompt. Due dates power the 14-day strip and deadline nudges.</div><div class="field"><label>Steering note</label><textarea id="gsteer" rows="3" maxlength="500" placeholder="e.g. Keep it practical; budget ₹5,000; no meetings">${esc(g.note||"")}</textarea></div><div class="field"><label>Due date</label><input id="gdue" type="date" value="${esc(g.due||"")}"></div><div class="row"><button class="btn modal-cancel">Cancel</button><button class="btn pri" id="savetune">Save</button></div>`); $('#savetune').onclick=async()=>{ g.note=$('#gsteer').value.trim(); g.due=$('#gdue').value; closeModal(); await audit('goal',`Updated steering/deadline for "${g.title}"`); await Store.save(); renderGoals(); toast('Goal tuned. New guidance will ride every prompt.'); }; });
  $$('[data-advance]').forEach(b=>b.onclick=()=>advanceGoal(b.dataset.advance));
  $$('[data-team]').forEach(b=>b.onclick=()=>{ const [gid,md]=b.dataset.team.split('|'); runTeam(gid,md); });
  $$('[data-discuss]').forEach(b=>b.onclick=e=>{ switchView('chat'); const goal=S().goals.find(x=>x.id===e.currentTarget.dataset.discuss); if(goal){ $('#chatinput').value=`About my goal "${goal.title}": `; $('#chatinput').focus(); } });
  $$('[data-reopen]').forEach(b=>b.onclick=async e=>{ if(e.target.closest('button'))return; const [gid,sid]=b.dataset.reopen.split('|'); const g=S().goals.find(x=>x.id===gid),st=g&&g.plan.steps.find(x=>x.id===sid); if(!st)return; st.status='todo';st.output='';g.status='active';await audit('plan',`Reopened step: "${st.title}" (goal: "${g.title}")`);await Store.save();renderGoals();renderStatus();toast('Step reopened.'); });
  $$('[data-delgoal]').forEach(b=>b.onclick=async()=>{ const id=b.dataset.delgoal,i=S().goals.findIndex(x=>x.id===id);if(i>=0){await audit('goal',`Dropped goal "${S().goals[i].title}"`);S().goals.splice(i,1);await Store.save();renderGoals();renderStatus();} });
}
function switchView(name){
  $$(".navbtn").forEach(x=>x.classList.toggle("on", x.dataset.view===name));
  $$(".view").forEach(v=>v.classList.toggle("on", v.id==="view-"+name));
  if(name==="settings"){ $("#setprovider").value = S().settings.provider || "openrouter"; $("#setsavekey").checked = !!S().settings.keyStored; $("#setstrip").checked = S().settings.statusStrip !== false; syncProviderUI(); populateModelSelect(); renderEngine(); renderCloak(); }
  if(name==="evolve") renderEvolutions();
  if(name==="tools") renderTools();
}
function renderAll(){ renderPrompts(); renderConvos(); renderGoals(); renderMemory(); renderConnectors(); renderAudit(); renderStatus(); renderChat(); renderCoderWorkbench(); renderEvolutions(); renderTasks(); renderRems(); renderTools(); renderSkills(); renderMcps(); renderStudio(); renderWorkforce(); renderHabits(); renderCloak(); }

/* ---------------- chat ---------------- */
function addMsg(role, text, kind){
  const s=S();
  s.chat.push({role, text, ts: nowISO(), kind: kind||""});
  if(s.chat.length>400) s.chat.splice(0, s.chat.length-400);
  return Store.save();
}
function renderChat(){
  const s=S(); if(!s) return;
  const log=$("#chatlog");
  const lastUserMi = s.chat.reduce((a,m,i)=>m.role==="user"&&!m.kind?i:a, -1);
  log.innerHTML = s.chat.map((m,mi) => {
    if(m.kind==="card") return m.text;   // pre-rendered card html (approval/suggestion cards render live below)
    if(m.kind==="tool"){ const [t,r]=m.text.split("|||"); return `<div class="toolcard"><b>⚙ ${esc(t)}</b><div class="res">${esc(r)}</div></div>`; }
    const cls = (m.role==="user" ? "user" : m.role==="sys" ? "sys" : "muse") + (m.kind==="checkpoint" ? " checkpoint" : "");
    const body = m.role==="muse" ? mdLite(m.text) : esc(m.text);
    const br = (mi===lastUserMi && m.attempts && m.attempts.length>1) ? ` <button class="msgbranch" data-mi="${mi}" data-dir="-1" title="Previous reply variant">&lsaquo;</button><span class="branchno">${(m.attempt==null?m.attempts.length-1:m.attempt)+1}/${m.attempts.length}</span><button class="msgbranch" data-mi="${mi}" data-dir="1" title="Next reply variant">&rsaquo;</button>` : "";
    const retry = mi===lastUserMi ? ` <button class="msgretry" data-mi="${mi}" title="Send this again - keeps this reply as a branch you can flip back to">retry</button>${br}` : "";
    return `<div class="msg ${cls}"><div class="body">${body}</div><div class="meta">${fmtT(m.ts)} <button class="msgcopy" data-mi="${mi}" title="Copy message">copy</button>${retry}</div></div>`;
  }).join("");
  $$("#chatlog .msgretry").forEach(b=>b.onclick=async()=>{
    const mi=+b.dataset.mi, m=S().chat[mi]; if(!m||m.role!=="user") return;
    const text=m.text;
    const tail = S().chat.splice(mi+1);            // keep the old reply as a branch
    if(tail.length){
      m.attempts = m.attempts||[];
      m.attempts[m.attempt==null? m.attempts.length : m.attempt] = tail;  // park the visible variant in its slot
      m.attempts.push([]);                             // reserve a slot for the new reply
      m.attempt = m.attempts.length - 1;
      pendingBranch = {attempts:m.attempts, attempt:m.attempt};
    }
    S().chat.splice(mi); await Store.save(); renderChat();
    sendChat({text, origin:"retry"});
  });
  $$("#chatlog .msgbranch").forEach(b=>b.onclick=async()=>{
    const mi=+b.dataset.mi, dir=+b.dataset.dir, m=S().chat[mi]; if(!m||!m.attempts) return;
    const n = m.attempts.length; if(n<2) return;
    const cur = S().chat.splice(mi+1);             // park the visible attempt in its slot
    const ai = m.attempt==null? n-1 : m.attempt;
    m.attempts[ai] = cur;
    m.attempt = (ai + dir + n) % n;
    S().chat.push(...(m.attempts[m.attempt]||[]));
    await Store.save(); renderChat();
  });
  $$("#chatlog .msgcopy").forEach(b=>b.onclick=async()=>{ const m=S().chat[+b.dataset.mi]; if(!m) return; try{ await navigator.clipboard.writeText(m.text); b.textContent="copied"; setTimeout(()=>b.textContent="copy",1200); }catch(e){ toast("Copy failed - select the text manually."); } });
  // live approval cards
  s.goals.forEach(g => g.plan.steps.forEach(x => {
    if(x.status==="approval" && !document.getElementById("ap-"+x.id)){
      const c=document.createElement("div"); c.className="card"; c.id="ap-"+x.id;
      c.innerHTML=`<h4>⏸ Approval needed</h4><div class="small"><b>${esc(x.title)}</b> - part of goal “${esc(g.title)}”. Sentinel policy: sensitive actions always wait for you.</div>
        <div class="row"><button class="btn okb" data-approve="${g.id}|${x.id}">Approve &amp; run</button>
        <button class="btn badb" data-reject="${g.id}|${x.id}">Reject</button></div>`;
      log.appendChild(c);
    }
  }));
  $$("#chatlog [data-approve]").forEach(b=>b.onclick=()=>decideStep(b.dataset.approve,true));
  $$("#chatlog [data-reject]").forEach(b=>b.onclick=()=>decideStep(b.dataset.reject,false));
  const searching = !$("#chatsearchbar").hidden && ($("#chatsearch").value||"").trim();
  if(searching) applyChatSearch(true); else log.scrollTop = log.scrollHeight;
}

/* ---------- chat checkpoints + fork ----------
   Named snapshots of the active conversation, stored on its convo entry.
   Restore parks the current state as an auto-checkpoint first (nothing is
   lost); fork copies a snapshot into a NEW conversation and switches to it.
   Borrowed concept: DigitalOcean Managed Agents' pause/resume/fork - here it
   is all local, inside the encrypted store. */
function cpList(){ const c=S().convos.find(x=>x.id===S().activeConvo); if(!c.checkpoints) c.checkpoints=[]; return c.checkpoints; }
async function cpSave(name){
  const cps=cpList();
  cps.unshift({id:"cp"+Date.now().toString(36), name:name||("State "+new Date().toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})), ts:new Date().toISOString(), chat:JSON.parse(JSON.stringify(S().chat))});
  while(cps.length>10) cps.pop();
  await Store.save();
}
async function cpRestore(id){
  const cps=cpList(), cp=cps.find(x=>x.id===id); if(!cp) return;
  if(S().chat.length){ await cpSave("Before restore - auto"); }
  S().chat=JSON.parse(JSON.stringify(cp.chat));
  await Store.save(); renderChat(); renderConvos();
  toast("Restored: "+cp.name);
}
async function cpFork(id){
  const cps=cpList(), cp=cps.find(x=>x.id===id); if(!cp) return;
  parkActiveConvo();
  const s=S(), nid="c"+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36);
  s.convos.unshift({id:nid, name:(cp.name||"Checkpoint")+" (fork)", _auto:false, created:new Date().toISOString(), updated:new Date().toISOString(), chat:[]});
  s.chat=JSON.parse(JSON.stringify(cp.chat)); s.activeConvo=nid;
  await Store.save(); renderChat(); renderConvos();
  toast("Forked into a new chat.");
}
async function cpDelete(id){
  const cps=cpList(), i=cps.findIndex(x=>x.id===id); if(i<0) return;
  cps.splice(i,1); await Store.save(); renderCheckpoints();
}
function renderCheckpoints(){
  const cps=cpList();
  const el=$("#cplist"); if(!el) return;
  el.innerHTML = cps.length ? cps.map(cp=>{
    const n=(cp.chat||[]).filter(m=>m.role==="user"||m.role==="muse").length;
    return `<div class="cprow">
      <div class="cpinfo"><b>${esc(cp.name)}</b><span class="small">${fmtT(cp.ts)} - ${n} messages</span></div>
      <div class="cpacts">
        <button class="btn" data-cprestore="${cp.id}">Restore</button>
        <button class="btn" data-cpfork="${cp.id}">Fork</button>
        <button class="btn badb" data-cpdel="${cp.id}">Delete</button>
      </div></div>`;
  }).join("") : `<div class="small" style="color:var(--dim2)">No checkpoints yet. Save one before a big turn - you can always come back.</div>`;
  $$("#cplist [data-cprestore]").forEach(b=>b.onclick=async()=>{ await cpRestore(b.dataset.cprestore); closeModal(); });
  $$("#cplist [data-cpfork]").forEach(b=>b.onclick=async()=>{ await cpFork(b.dataset.cpfork); closeModal(); });
  $$("#cplist [data-cpdel]").forEach(b=>b.onclick=()=>cpDelete(b.dataset.cpdel));
}
$("#checkpointsbtn").addEventListener("click", ()=>{
  ensureConvos();
  openModal(`<h3>Checkpoints</h3>
    <div class="small" style="color:var(--dim);margin-bottom:10px">Named save-states of this chat. Restore jumps back (your current state is auto-saved first); Fork opens the snapshot as a new chat and keeps this one too.</div>
    <div class="trow" style="margin-bottom:12px"><input id="cpnewname" placeholder="Name this state - e.g. before the rewrite" maxlength="48"><button class="btn pri" id="cpsavebtn">Save state</button></div>
    <div id="cplist"></div>`);
  $("#cpsavebtn").onclick=async()=>{ await cpSave($("#cpnewname").value.trim()); renderCheckpoints(); renderConvos(); toast("Checkpoint saved."); };
  renderCheckpoints();
});

/* ---------- conversations (multi-session chat) ----------
   Invariant: the ACTIVE conversation's messages live in S().chat; every other
   conversation keeps its messages in its convo entry's .chat. Switching parks
   the active array into its entry and loads the target's. Same slot pattern
   as retry branches. */
function convoAutoName(chat){ const u=(chat||[]).find(m=>m.role==="user"); return u? u.text.replace(/\s+/g," ").slice(0,34) : ""; }
function ensureConvos(){
  const s=S(); if(!s) return;
  if(!Array.isArray(s.convos)) s.convos=[];
  if(!s.convos.length){
    s.convos.push({id:"c"+Date.now().toString(36), name:convoAutoName(s.chat)||"First chat", _auto:true, created:new Date().toISOString(), updated:new Date().toISOString(), chat:[]});
    s.activeConvo=s.convos[0].id;
  }
  if(!s.convos.find(c=>c.id===s.activeConvo)) s.activeConvo=s.convos[0].id;
}
function parkActiveConvo(){
  ensureConvos();
  const s=S(), c=s.convos.find(x=>x.id===s.activeConvo); if(!c) return;
  c.chat=s.chat; c.updated=new Date().toISOString();
  if(c._auto){ const n=convoAutoName(s.chat); if(n) c.name=n; }
}
async function switchConvo(id){
  const s=S(); ensureConvos();
  if(id===s.activeConvo) return;
  parkActiveConvo();
  const t=s.convos.find(c=>c.id===id); if(!t) return;
  s.chat=t.chat||[]; t.chat=[]; s.activeConvo=id;
  chatSearchCur=-1;
  restoreDraft();
  await Store.save(); renderChat(); renderConvos();
}
async function newConvo(){
  const s=S(); ensureConvos(); parkActiveConvo();
  const id="c"+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36);
  s.convos.unshift({id, name:"New chat", _auto:true, created:new Date().toISOString(), updated:new Date().toISOString(), chat:[]});
  s.chat=[]; s.activeConvo=id;
  restoreDraft();
  await addMsg("sys","New chat. Your other chats are kept in the list - nothing is lost.");
  await Store.save(); renderChat(); renderConvos();
  $("#chatinput").focus();
}
function renderConvos(){
  const el=$("#chatlist"); if(!el || !S()) return;
  ensureConvos();
  const s=S();
  const ordered = s.convos.slice().sort((a,b)=>((b.pin?1:0)-(a.pin?1:0)));
  el.innerHTML = ordered.map(c=>{
    const isA = c.id===s.activeConvo;
    const chat = isA ? s.chat : (c.chat||[]);
    const name = (c._auto ? (convoAutoName(chat)||c.name) : c.name) || "Chat";
    const n = chat.filter(m=>m.role==="user").length;
    const hasDraft = !!(s.drafts && s.drafts[c.id]);
    return `<div class="convo${isA?" on":""}"><button class="convo-name" data-cid="${c.id}" title="${esc(name)}">${esc(name)}${hasDraft?' <span class="convo-draft">draft</span>':""}</button><span class="convo-n">${n||""}</span><button class="convo-pin${c.pin?" on":""}" data-cid="${c.id}" title="${c.pin?"Unpin":"Pin to top"}">&#128204;</button><button class="convo-rn" data-cid="${c.id}" title="Rename">&#9998;</button><button class="convo-x" data-cid="${c.id}" title="Delete chat">&times;</button></div>`;
  }).join("");
  $$("#chatlist .convo-pin").forEach(b=>b.onclick=async()=>{
    const c=S().convos.find(x=>x.id===b.dataset.cid); if(!c) return;
    c.pin=!c.pin; await Store.save(); renderConvos();
  });
  $$("#chatlist .convo-name").forEach(b=>b.onclick=()=>switchConvo(b.dataset.cid));
  $$("#chatlist .convo-x").forEach(b=>b.onclick=async()=>{
    const s=S();
    if(s.convos.length<=1){ toast("Keep at least one chat."); return; }
    if(b.dataset.armed){ 
      const id=b.dataset.cid;
      s.convos = s.convos.filter(c=>c.id!==id);
      if(s.drafts) delete s.drafts[id];
      if(s.activeConvo===id){ s.activeConvo=s.convos[0].id; s.chat=s.convos[0].chat||[]; s.convos[0].chat=[]; }
      await Store.save(); renderChat(); renderConvos(); toast("Chat deleted.");
    } else {
      b.dataset.armed="1"; b.textContent="sure?"; b.classList.add("armed");
      setTimeout(()=>{ if(b.isConnected){ delete b.dataset.armed; b.innerHTML="&times;"; b.classList.remove("armed"); } }, 2600);
    }
  });
  $$("#chatlist .convo-rn").forEach(b=>b.onclick=()=>{
    const c=S().convos.find(x=>x.id===b.dataset.cid); if(!c) return;
    const row=b.closest(".convo"), nameBtn=row.querySelector(".convo-name");
    const inp=document.createElement("input");
    inp.className="convo-edit";
    const shownChat = (c.id===S().activeConvo) ? S().chat : (c.chat||[]);
    inp.value = c._auto ? (convoAutoName(shownChat)||c.name) : c.name;
    inp.maxLength=48;
    nameBtn.replaceWith(inp); inp.focus(); inp.select();
    let done=false;
    const finish=async(save)=>{
      if(done) return; done=true;
      if(save){ const v=inp.value.trim().slice(0,48); if(v){ c.name=v; c._auto=false; await Store.save(); } }
      renderConvos();
    };
    inp.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); finish(true); } else if(e.key==="Escape"){ e.preventDefault(); finish(false); } });
    inp.addEventListener("blur", ()=>finish(true));
  });
}
$("#newconvobtn").addEventListener("click", newConvo);

/* ---------- conversation search ----------
   Filter-jump over the current stream: matches get an outline, prev/next
   cycles with the match scrolled into view. Search state lives only in the
   DOM/inputs - nothing extra is stored. */
let chatSearchCur = -1;
let pendingBranch = null;   // retry carries the old user message's variants onto the new one
function chatSearchHits(){
  const q = ($("#chatsearch").value||"").trim().toLowerCase();
  if(!q) return [];
  return $$("#chatlog .msg").filter(el => el.textContent.toLowerCase().includes(q));
}
function chatSearchOtherConvos(q){
  const s=S(); if(!s || !Array.isArray(s.convos) || !q) return [];
  const ql=q.toLowerCase();
  return s.convos.filter(c=>c.id!==s.activeConvo).map(c=>{
    const n=(c.chat||[]).filter(m=>(m.role==="user"||m.role==="muse") && (m.text||"").toLowerCase().includes(ql)).length;
    return n? {id:c.id, name:c.name||"Chat", n} : null;
  }).filter(Boolean);
}
function applyChatSearch(keepCur){
  const bar=$("#chatsearchbar"); if(!bar || bar.hidden) return;
  const q0 = ($("#chatsearch").value||"").trim();
  const other=$("#chatsearchother");
  if(other){
    const others = chatSearchOtherConvos(q0);
    other.hidden = !others.length;
    other.innerHTML = others.map(o=>`<button class="searchother" data-cid="${o.id}">${esc(o.name)} <b>${o.n}</b></button>`).join("");
    $$("#chatsearchother .searchother").forEach(b=>b.onclick=async()=>{ await switchConvo(b.dataset.cid); });
  }
  const hits = chatSearchHits();
  $$("#chatlog .msg.hit").forEach(el=>el.classList.remove("hit","cur"));
  hits.forEach(el=>el.classList.add("hit"));
  const q = ($("#chatsearch").value||"").trim();
  $("#chatsearchcount").textContent = q ? (hits.length? String(hits.length) : "0") : "";
  if(!hits.length){ chatSearchCur=-1; return; }
  chatSearchCur = keepCur ? Math.min(Math.max(chatSearchCur,0), hits.length-1) : hits.length-1;
  const cur = hits[chatSearchCur];
  cur.classList.add("cur");
  cur.scrollIntoView({block:"center", behavior:"smooth"});
  $("#chatsearchcount").textContent = (chatSearchCur+1)+"/"+hits.length;
}
function chatSearchStep(d){
  const hits = chatSearchHits(); if(!hits.length) return;
  chatSearchCur = ((chatSearchCur + d) % hits.length + hits.length) % hits.length;
  $$("#chatlog .msg.cur").forEach(el=>el.classList.remove("cur"));
  const cur = hits[chatSearchCur];
  cur.classList.add("cur");
  cur.scrollIntoView({block:"center", behavior:"smooth"});
  $("#chatsearchcount").textContent = (chatSearchCur+1)+"/"+hits.length;
}
function chatSearchClose(){
  $("#chatsearchbar").hidden = true;
  $("#chatsearch").value = "";
  chatSearchCur = -1;
  $$("#chatlog .msg.hit").forEach(el=>el.classList.remove("hit","cur"));
  $("#chatlog").scrollTop = $("#chatlog").scrollHeight;
}
$("#chatsearchbtn").addEventListener("click", ()=>{
  const bar=$("#chatsearchbar");
  bar.hidden = !bar.hidden;
  if(!bar.hidden){ $("#chatsearch").focus(); }
  else chatSearchClose();
});
$("#chatsearch").addEventListener("input", ()=>applyChatSearch(false));
$("#chatsearch").addEventListener("keydown", (e)=>{
  if(e.key==="Enter"){ e.preventDefault(); chatSearchStep(e.shiftKey?-1:1); }
  else if(e.key==="Escape"){ e.preventDefault(); chatSearchClose(); }
});
$("#chatsearchprev").addEventListener("click", ()=>chatSearchStep(-1));
$("#chatsearchnext").addEventListener("click", ()=>chatSearchStep(1));
$("#chatsearchclose").addEventListener("click", chatSearchClose);
function inlineMd(t){
  return esc(t)
    .replace(/\*\*([^*]+)\*\*/g,"<b>$1</b>")
    .replace(/\*([^*\n]+)\*/g,"<i>$1</i>")
    .replace(/~~([^~]+)~~/g,"<s>$1</s>")
    .replace(/`([^`]+)`/g,"<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}
/* Block-level markdown for chat/plan/merge text: pipe tables, bullet and
   numbered lists, headings, rules. Code blocks are already carved out by
   mdLite before this runs, so |-lines here are never inside code. */
function blockMd(t){
  const lines=String(t).split("\n"), out=[];
  let i=0;
  const isTable = l => /^\s*\|.*\|\s*$/.test(l);
  const isSep   = l => /^\s*\|[\s:|-]+\|\s*$/.test(l);
  const isUl    = l => /^\s*[-*]\s+/.test(l);
  const isOl    = l => /^\s*\d+\.\s+/.test(l);
  const cells = r => r.replace(/^\s*\|/,"").replace(/\|\s*$/,"").split("|").map(c=>inlineMd(c.trim()));
  while(i<lines.length){
    const l=lines[i];
    if(isTable(l)){
      const rows=[];
      while(i<lines.length && isTable(lines[i])) rows.push(lines[i++]);
      let html='<table class="mdtable">', start=0;
      if(rows.length>1 && isSep(rows[1])){ html+="<tr>"+cells(rows[0]).map(c=>"<th>"+c+"</th>").join("")+"</tr>"; start=2; }
      for(let r=start;r<rows.length;r++) html+="<tr>"+cells(rows[r]).map(c=>"<td>"+c+"</td>").join("")+"</tr>";
      out.push(html+"</table>"); continue;
    }
    if(isUl(l)){
      const items=[];
      while(i<lines.length && isUl(lines[i])) items.push("<li>"+inlineMd(lines[i++].replace(/^\s*[-*]\s+/,""))+"</li>");
      out.push('<ul class="mdlist">'+items.join("")+"</ul>"); continue;
    }
    if(isOl(l)){
      const firstN=+(l.match(/^\s*(\d+)\./)||[0,1])[1];
      const items=[];
      while(i<lines.length && isOl(lines[i])) items.push("<li>"+inlineMd(lines[i++].replace(/^\s*\d+\.\s+/,""))+"</li>");
      out.push('<ol class="mdlist"'+(firstN>1?' start="'+firstN+'"':"")+'>'+items.join("")+"</ol>"); continue;
    }
    if(/^\s*>\s?/.test(l)){
      const ql=[];
      while(i<lines.length && /^\s*>\s?/.test(lines[i])) ql.push(inlineMd(lines[i++].replace(/^\s*>\s?/,"")));
      out.push('<blockquote class="mdq">'+ql.join("<br>")+"</blockquote>"); continue;
    }
    const hm=l.match(/^(#{1,4})\s+(.+?)\s*$/);
    if(hm){ out.push('<div class="mdh mdh'+hm[1].length+'">'+inlineMd(hm[2])+"</div>"); i++; continue; }
    if(/^---+\s*$/.test(l)){ out.push('<hr class="mdhr">'); i++; continue; }
    out.push(inlineMd(l)); i++;
  }
  return out.join("\n").replace(/\n/g,"<br>");
}
function mdLite(t){
  const re = /```([a-zA-Z]*)\n?([\s\S]*?)```/;
  let out = "", rest = String(t), m;
  while((m = rest.match(re))){
    out += blockMd(rest.slice(0, m.index));
    const lang = m[1] || "", code = m[2].replace(/\n$/, "");
    const html = lang === "diff"
      ? esc(code).split("\n").map(l => `<span class="dl ${l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : l.startsWith("@") ? "hunk" : ""}">${l || " "}</span>`).join("\n")
      : esc(code);
    out += `<pre class="codeblock"${lang ? ` data-lang="${esc(lang)}"` : ""}><code>${html}</code></pre>`;
    rest = rest.slice(m.index + m[0].length);
  }
  return out + blockMd(rest);
}

/* ---------------- privacy cloak (AgentCloak-style, fully local) ----------------
   Before any text leaves for a model call, structured private data and
   user-taught values are swapped for consistent synthetic twins kept in the
   local (optionally encrypted) store. Replies are un-swapped before display,
   so the user always reads their real data and the provider never sees it.
   Audit records counts and kinds only - never values, never twins. */
const CLOAK_NAME_POOL = ["Alex Morgan","Priya Nair","Jordan Lee","Sam Whitfield","Meera Kulkarni","Tom Eriksen","Nina Rao","Chris Delacroix","Ravi Menon","Sara Lindqvist","Dev Patel","Kate Osei","Arjun Shah","Lena Fischer","Omar Haddad","Tara Byrne","Vikram Iyer","Julia Moreau","Aditya Rao","Elena Petrova"];
const CLOAK_DETECTORS = [
  {kind:"email", re:/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g},
  {kind:"phone", re:/\+\d[\d\s().-]{7,16}\d|\b\d{3}[ -]\d{3}[ -]\d{4}\b/g},
  {kind:"card",  re:/\b(?:\d[ -]?){13,19}\b/g, luhn:true},
  {kind:"id",    re:/\b\d{3}-\d{2}-\d{4}\b/g},
];
function luhnOk(num){ const d=num.replace(/\D/g,""); if(d.length<13||d.length>19) return false; let sum=0,alt=false; for(let i=d.length-1;i>=0;i--){ let n=+d[i]; if(alt){ n*=2; if(n>9)n-=9; } sum+=n; alt=!alt; } return sum%10===0; }
function cloakPick(str,n){ let h=0; for(const c of String(str)) h=(h*31 + c.codePointAt(0))>>>0; return h%n; }
function cloakTwin(real, kind){
  if(kind==="email") return CLOAK_NAME_POOL[cloakPick(real,CLOAK_NAME_POOL.length)].toLowerCase().replace(/[^a-z]+/g,".")+"@example.com";
  if(kind==="phone") return "+1 555 01"+String(cloakPick(real,90)+10);
  if(kind==="card")  return "4111 1111 1111 "+String(1000+cloakPick(real,9000));
  if(kind==="id")    return "9"+String(10+cloakPick(real,89))+"-55-"+String(7000+cloakPick(real+"x",999));
  return CLOAK_NAME_POOL[cloakPick(real,CLOAK_NAME_POOL.length)];
}
function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }
const Cloak = {
  sessionSwaps: 0, _audited: false,
  box(){ const s=S(); if(s && !s.cloak) s.cloak={on:false,rules:[]}; return s ? s.cloak : {on:false,rules:[]}; },
  on(){ return !!this.box().on; },
  rules(){ return this.box().rules; },
  isTwin(v){ return this.rules().some(x=>x.twin===v); },
  ensure(real, kind, auto){
    real=String(real).trim(); if(!real) return null;
    const ex=this.rules().find(x=>x.real.toLowerCase()===real.toLowerCase());
    if(ex) return ex;
    const rule={id:uid("cl"), real:real.slice(0,120), twin:cloakTwin(real,kind), kind:kind||"custom", auto:!!auto, created:nowISO()};
    let n=2; while(this.rules().some(x=>x.twin===rule.twin)){ rule.twin=rule.twin.replace(/[ -]?\d*$/,"")+"-"+(n++); if(n>12){ rule.twin=rule.twin+"-"+uid("t").slice(-4); break; } }
    this.box().rules.push(rule);
    return rule;
  },
  /* transform outbound text: returns {text, swaps, kinds} */
  outText(text){
    if(!this.on() || !text) return {text, swaps:0, kinds:[]};
    let swaps=0; const kinds=new Set();
    // known rules first, longest real value first so overlapping values resolve sanely
    for(const r of this.rules().slice().sort((x,y)=>y.real.length-x.real.length)){
      if(!r.real) continue;
      const re=new RegExp(escRe(r.real),"gi");
      text=text.replace(re, ()=>{ swaps++; kinds.add(r.kind); return r.twin; });
    }
    // auto-detect structured PII in what remains; skip anything already a twin
    for(const det of CLOAK_DETECTORS){
      det.re.lastIndex=0;
      const found=text.match(det.re)||[];
      for(const m of found){
        if(det.luhn && !luhnOk(m)) continue;
        if(this.isTwin(m)) continue;
        const rule=this.ensure(m, det.kind, true);
        if(!rule) continue;
        const re=new RegExp(escRe(m),"g");
        text=text.replace(re, ()=>{ swaps++; kinds.add(det.kind); return rule.twin; });
      }
    }
    return {text, swaps, kinds:[...kinds]};
  },
  out(messages){
    if(!this.on()) return messages;
    let total=0; const kinds=new Set();
    const t=messages.map(m=>{
      if(typeof m.content!=="string") return m;
      const r=this.outText(m.content);
      total+=r.swaps; r.kinds.forEach(k=>kinds.add(k));
      return r.swaps ? {...m, content:r.text} : m;
    });
    if(total){
      this.sessionSwaps+=total;
      const c=S(); c.counters.cloakSwaps=(c.counters.cloakSwaps||0)+total;
      if(!this._audited){ this._audited=true; audit("cloak","Cloak engaged on outbound calls - values stay on this device (counts only, never values)"); }
      renderStatus();
    }
    return t;
  },
  back(text){
    if(!this.on() || !text) return text;
    for(const r of this.rules().slice().sort((x,y)=>y.twin.length-x.twin.length)){
      if(!r.twin) continue;
      text=text.split(r.twin).join(r.real);
    }
    return text;
  }
};
function renderCloak(){
  if(!S()) return;
  $("#cloakon").checked = Cloak.on();
  const box=$("#cloakrules"); const rules=Cloak.rules();
  box.innerHTML = rules.length ? rules.map(r=>`<div class="skill"><span class="txt"><b>${esc(r.real)}</b><span>becomes "${esc(r.twin)}" - ${r.kind}${r.auto?" (auto-detected)":""}</span></span><button class="btn badb" data-cloakdel="${r.id}" style="padding:3px 9px">\u00d7</button></div>`).join("")
    : `<div class="small" style="font-size:12px;color:var(--dim2)">Nothing taught yet. Structured data (emails, phones, card and ID numbers) is still detected automatically when the cloak is on.</div>`;
  $$("#cloakrules [data-cloakdel]").forEach(b=>b.onclick=async()=>{ const i=Cloak.rules().findIndex(x=>x.id===b.dataset.cloakdel); if(i>=0){ Cloak.rules().splice(i,1); await audit("cloak","Removed a cloak rule"); await Store.save(); renderCloak(); } });
  const tot=(S().counters.cloakSwaps||0);
  $("#cloakstats").textContent = Cloak.on()
    ? `Cloak is ON - ${rules.length} rule${rules.length===1?"":"s"}, ${tot} value${tot===1?"":"s"} cloaked so far${Cloak.sessionSwaps?` (${Cloak.sessionSwaps} this session)`:""}.`
    : `Cloak is off - prompts go to your provider exactly as written.${tot?` ${tot} values were cloaked before it was turned off.`:""}`;
}

/* ---------------- EDGE//AI bridge: on-device inference via the sibling app ----------------
   Open Muse and EDGE//AI are both static sites on aeiouvcode.github.io (same
   origin). With the "On-device (EDGE//AI)" provider, Muse mounts EDGE//AI in a
   hidden frame and runs inference there over postMessage RPC: the model lives
   on this device, no key, no cloud. The cloak still applies to every prompt.
   Contract (mirrored in edge-bridge-contract.html and shared with the EDGE//AI build):
     frame URL:  /edge-ai/?bridge=openmuse&nonce=<random>
     edge->muse: {edgeai:"ready", nonce, models:[{id,name,params}]}
     muse->edge: {edgeai:"infer", id, nonce, model, messages:[{role,content}], stream}
     edge->muse: {edgeai:"chunk", id, text}* then {edgeai:"done", id, text} | {edgeai:"error", id, message}
   Both sides check event.origin and the nonce. */
const EDGE_ORIGIN = "https://aeiouvcode.github.io";
const EDGE_URL = EDGE_ORIGIN + "/edge-ai/";
const EdgeBridge = {
  frame:null, nonce:"", ready:null, models:[], inflight:{},
  ensure(){
    if(this.ready) return this.ready;
    this.nonce = Math.random().toString(36).slice(2)+Date.now().toString(36);
    this.ready = new Promise((resolve,reject)=>{
      const to=setTimeout(()=>reject(new Error("edge-timeout")), 30000);
      addEventListener("message", (e)=>{
        if(e.origin!==EDGE_ORIGIN) return;
        const d=e.data||{};
        if(d.nonce!==this.nonce) return;   // every contract message carries the session nonce
        if(d.edgeai==="ready"){ clearTimeout(to); this.models=d.models||[]; this.state=d.state||"ready"; this.loadedModel=d.loadedModel||""; resolve(this.models); }
        const p=d.id && this.inflight[d.id];
        if(!p) return;
        if(d.edgeai==="chunk"){ p.onChunk && p.onChunk(String(d.text||"")); }
        if(d.edgeai==="done"){ delete this.inflight[d.id]; p.resolve(String(d.text||"")); }
        if(d.edgeai==="error"){ delete this.inflight[d.id]; p.reject(new Error(String(d.message||"edge-error"))); }
      });
      const f=document.createElement("iframe");
      f.style.display="none"; f.setAttribute("aria-hidden","true"); f.tabIndex=-1;
      f.src=(window.__EDGE_URL_OVERRIDE||EDGE_URL)+"?bridge=openmuse&nonce="+this.nonce;
      document.body.appendChild(f);
      this.frame=f;
    });
    this.ready.catch(()=>{ this.ready=null; });   // a timeout stays retryable
    return this.ready;
  },
  async infer(messages, opts={}){
    await this.ensure();
    const id=uid("ei");
    return new Promise((resolve,reject)=>{
      const to=setTimeout(()=>{ delete this.inflight[id]; reject(new Error("edge-infer-timeout")); }, 10*60*1000);  // first run downloads weights
      this.inflight[id]={
        resolve:t=>{clearTimeout(to);resolve(t)},
        reject:e=>{clearTimeout(to);reject(e)},
        onChunk:t=>{ opts.onTok && opts.onTok(t); }
      };
      this.frame.contentWindow.postMessage({edgeai:"infer", id, nonce:this.nonce, model:opts.model||this.loadedModel||"", messages, stream:!!opts.stream}, EDGE_ORIGIN);
    });
  }
};

/* ---------------- model ---------------- */
function getKey(){ return sessionStorage.getItem("openmuse.key") || (S() && S().settings.keyStored) || ""; }

/* ---------------- credential broker ----------------
   Every credential in the app - model key, search key, Monid key, per-server
   MCP keys - is spent through this one chokepoint. Callers name a credential
   and a URL; the broker checks the destination against that credential's
   allowed origins, attaches the secret itself (header, query param, or JSON
   body field), audits each new credential->origin pair once per session, and
   refuses - with an audit entry - anything else. Keys never appear in caller
   code, logs, or error text by construction.
   Honest boundary: this is same-tab hygiene, not a process barrier. It
   removes accidental leakage (wrong origin, logs, error copy) by
   construction; it does not defend against a compromised same-origin script
   - nothing in a web page can. */
const Broker = (()=>{
  const seen = new Set();  // cred->host pairs already audited this session
  function modelHosts(){
    const p = provider(); const hosts = new Set();
    const add = u => { try{ if(u) hosts.add(new URL(u).host); }catch(e){} };
    if(p.local) add((S() && S().settings.localUrl) || "http://localhost:11434/v1");
    else if(p.nim) add((S() && S().settings.nimUrl) || "http://localhost:8000/v1");
    else { add(p.url); add(p.modelsUrl); add(p.nativeCatalog); }
    return hosts;
  }
  const CREDS = {
    model: {
      label: ()=> provider().name + " key",
      read: ()=> getKey(),
      hosts: modelHosts,
      attach(url, headers, key, opts){
        if(opts && opts.via==="query"){
          if(url.host!=="generativelanguage.googleapis.com") throw new Error("broker-style");
          url.searchParams.set("key", key);
        } else headers.set("Authorization", "Bearer "+key);
      }
    },
    search: {
      label: ()=> ((S()&&S().settings.searchProvider)||"search") + " key",
      read: ()=> (S() && S().settings.searchKey) || "",
      hosts(){
        const pv=(S() && S().settings.searchProvider)||"tavily";
        return new Set(pv==="brave" ? ["api.search.brave.com"]
          : pv==="tinyfish" ? ["api.search.tinyfish.ai","api.fetch.tinyfish.ai"]
          : ["api.tavily.com"]);
      },
      attach(url, headers, key, opts){
        const pv=(S() && S().settings.searchProvider)||"tavily";
        if(pv==="brave") headers.set("X-Subscription-Token", key);
        else if(pv==="tinyfish") headers.set("X-API-Key", key);
        /* tavily carries the key in the JSON body - handled below via bodyKey */
      }
    },
    monid: {
      label: ()=> "Monid key",
      read: ()=> (S() && S().settings.monidKey) || "",
      hosts: ()=> new Set(["api.monid.ai"]),
      attach(url, headers, key){ headers.set("Authorization", "Bearer "+key); }
    }
  };
  async function use(credId, url, init, opts){
    const c = CREDS[credId]; if(!c) throw new Error("broker: unknown credential");
    init = init || {}; opts = opts || {};
    let u; try{ u = new URL(url); }catch(e){ throw new Error("broker: unreadable URL"); }
    if(!c.hosts().has(u.host)){
      await audit("broker", `Refused to send the ${c.label()} to ${u.host} - not an allowed origin for it`);
      throw new Error(`The credential broker stopped a request: ${u.host} is not where this key is allowed to go. Nothing was sent.`);
    }
    const headers = new Headers(init.headers || {});
    const key = c.read();
    if(key){
      if(opts.bodyKey){
        let b = {}; try{ b = JSON.parse(init.body || "{}"); }catch(e){}
        b[opts.bodyKey] = key;
        init = Object.assign({}, init, { body: JSON.stringify(b) });
      } else c.attach(u, headers, key, opts);
    }
    const mark = credId + "->" + u.host;
    if(!seen.has(mark)){ seen.add(mark); await audit("broker", `Key in use: ${c.label()} -> ${u.host}`); }
    return fetch(u.toString(), Object.assign({}, init, { headers }));
  }
  /* MCP servers carry their own per-server key, allowed only to that server */
  async function useMcp(srv, url, init){
    init = init || {};
    let u; try{ u = new URL(url); }catch(e){ throw new Error("broker: unreadable URL"); }
    let srvHost; try{ srvHost = new URL(srv.url).host; }catch(e){ throw new Error("broker: bad server URL"); }
    if(u.host !== srvHost){
      await audit("broker", `Refused to send the "${srv.name}" server key to ${u.host}`);
      throw new Error(`The credential broker stopped a request: ${u.host} is not the "${srv.name}" server. Nothing was sent.`);
    }
    const headers = new Headers(init.headers || {});
    if(srv.key) headers.set("Authorization", "Bearer "+srv.key);
    const mark = "mcp:"+srv.name+"->"+u.host;
    if(!seen.has(mark)){ seen.add(mark); await audit("broker", `Key in use: MCP server "${srv.name}" -> ${u.host}`); }
    return fetch(u.toString(), Object.assign({}, init, { headers }));
  }
  function has(credId){ const c = CREDS[credId]; return !!(c && c.read()); }
  return { use, useMcp, has };
})();
/* ---------------- built-in on-device engine (transformers.js, vendored) ----------------
   Models run in engine-worker.js on ONNX Runtime Web. Weights come from
   Hugging Face once and then from the browser cache; prompts never leave
   the device. ENGINE_MODELS is the curated catalog - sizes are the honest
   q4/q4f16 download ranges from the model hubs. */
const ENGINE_MODELS = [
  { id:"onnx-community/SmolLM2-360M-Instruct-ONNX", label:"SmolLM2 360M - tiny, fits anywhere", size:"~0.26-0.37 GB" },
  { id:"onnx-community/Qwen3-0.6B-Instruct-ONNX", label:"Qwen3 0.6B - fastest, made for phones", size:"~0.6-0.95 GB" },
  { id:"onnx-community/Qwen2.5-1.5B-Instruct",    label:"Qwen2.5 1.5B - sharper, heavier",       size:"~1.2-1.7 GB" },
  { id:"onnx-community/Llama-3.2-3B-Instruct-ONNX", label:"Llama 3.2 3B - desktop-class",        size:"~2 GB" },
];
const LocalEngine = {
  worker:null, loadedModel:"", device:"", dtype:"", seq:Promise.resolve(), inflight:{}, onProgress:null, _load:null, _probe:null,
  ensure(){
    if(this.worker) return;
    this.worker = new Worker("engine-worker.js?v=202609231548", { type:"module" });
    this.worker.onmessage = (e)=> this.onmsg(e.data||{});
  },
  onmsg(d){
    if(d.type==="progress"){ if(this.onProgress) this.onProgress(d); }
    else if(d.type==="ready"){ this.loadedModel=d.model||""; this.device=d.device||""; this.dtype=d.dtype||""; if(this._load){ this._load.res(d); this._load=null; } }
    else if(d.type==="unloaded"){ this.loadedModel=""; this.device=""; this.dtype=""; renderEngine(); renderStatus(); }
    else if(d.type==="capabilities"){ if(this._probe){ this._probe(d); this._probe=null; } }
    else if(d.type==="chunk"){ const p=this.inflight[d.id]; if(p && p.onTok) p.onTok(String(d.text||"")); }
    else if(d.type==="done"){ const p=this.inflight[d.id]; delete this.inflight[d.id]; if(p) p.resolve(String(d.text||"")); }
    else if(d.type==="error"){
      if(d.for==="load" && this._load){ this._load.rej(new Error(d.message||"engine-error")); this._load=null; }
      else { const p=this.inflight[d.id]; if(p){ delete this.inflight[d.id]; p.reject(new Error(d.message||"engine-error")); } }
    }
  },
  probe(){ this.ensure(); return new Promise(res=>{ this._probe=res; this.worker.postMessage({type:"probe"}); }); },
  async load(model, device){
    this.ensure();
    if(this._load) return Promise.reject(new Error("engine-busy"));
    // Decide the device here on the main thread and prefetch the weights into
    // the browser cache before the worker starts: long streams die in worker
    // context on some networks, while the same chunked download completes on
    // the main thread. The worker then reads everything from cache (offline
    // after first load, same as before).
    let dev = device && device!=="auto" ? device : "wasm";
    if(!device || device==="auto"){
      dev = "wasm";
      try{ if(navigator.gpu && await navigator.gpu.requestAdapter()) dev = "webgpu"; }catch(_){}
    }
    const dtype = dev==="webgpu" ? "q4f16" : "q4";
    await this.prefetch(model, dtype);
    return new Promise((res,rej)=>{ this._load={res,rej}; this.worker.postMessage({type:"load", model, device:dev, dtype}); });
  },
  async prefetch(model, dtype){
    if(!("caches" in self)) return; // no Cache API: worker downloads directly
    const cache = await caches.open("transformers-cache");
    const rt = await fetch("https://huggingface.co/api/models/"+model+"/tree/main?recursive=true");
    if(!rt.ok) throw new Error("engine-model-list-"+rt.status);
    const tree = await rt.json();
    const paths = tree.filter(f=>f.type==="file").map(f=>f.path);
    const wanted = [];
    for(const p of ["config.json","generation_config.json","tokenizer.json","tokenizer_config.json","special_tokens_map.json"]) if(paths.includes(p)) wanted.push(p);
    let weights = paths.filter(p=>p==="onnx/model_"+dtype+".onnx" || p==="onnx/model_"+dtype+".onnx_data");
    if(!weights.length) weights = paths.filter(p=>p.startsWith("onnx/model_"+dtype) && p.endsWith(".onnx"));
    if(!weights.length){ const q = paths.filter(p=>p.startsWith("onnx/") && p.endsWith(".onnx")); if(q.length===1) weights = q; }
    wanted.push(...weights);
    for(const p of wanted){
      const url = "https://huggingface.co/"+model+"/resolve/main/"+p;
      if(await cache.match(url)) continue;
      await this.dlChunked(url, cache, p);
    }
  },
  async dlChunked(url, cache, fname){
    const CH = 24*1024*1024;
    const prog = (loaded,total)=>{ if(this.onProgress) this.onProgress({type:"progress", file:fname, loaded, total, progress: total? Math.round(loaded/total*100) : 0}); };
    const sleep = ms=>new Promise(r=>setTimeout(r,ms));
    const get = async (start,end,tries)=>{
      let last=null;
      for(let a=1;a<=tries;a++){
        try{
          const r = await fetch(url,{headers:{Range:"bytes="+start+"-"+end}});
          if(r.status===200) return {whole:true, response:r};
          if(r.status!==206) throw new Error("http-"+r.status);
          const cr=r.headers.get("content-range")||"";
          const total=parseInt((cr.split("/")[1]||"0"),10)||(end-start+1);
          const buf=await r.arrayBuffer();
          if(!buf.byteLength) throw new Error("empty-chunk");
          return {whole:false, buf, total, type:r.headers.get("content-type")||"application/octet-stream"};
        }catch(e){ last=e; await sleep(600*a); }
      }
      throw last||new Error("chunk-failed");
    };
    const probe = await get(0, CH-1, 3);
    if(probe.whole){ await cache.put(url, probe.response); return; }
    const total = probe.total;
    if(total<=CH){ await cache.put(url, new Response(probe.buf,{status:200,headers:{"Content-Type":probe.type,"Content-Length":String(total)}})); return; }
    const parts=[probe.buf]; let got=probe.buf.byteLength;
    prog(got,total);
    while(got<total){
      const part = await get(got, Math.min(got+CH,total)-1, 4);
      parts.push(part.buf); got+=part.buf.byteLength; prog(got,total);
    }
    await cache.put(url, new Response(new Blob(parts), {status:200, headers:{"Content-Type":probe.type,"Content-Length":String(total)}}));
  },
  stop(){ if(this.worker) this.worker.postMessage({type:"stop"}); },
  infer(messages, opts){
    opts = opts||{};
    this.ensure();
    if(!this.loadedModel) return Promise.reject(new Error("engine-not-loaded"));
    const run = ()=> new Promise((resolve,reject)=>{
      const id = uid("le");
      this.inflight[id] = { resolve, reject, onTok: opts.onTok };
      this.worker.postMessage({ type:"gen", id, messages, maxTokens: opts.maxTokens||640 });
    });
    // one model, one device: serialize generations so agent sub-calls never interleave
    const out = this.seq.then(run, run);
    this.seq = out.then(()=>{}, ()=>{});
    return out;
  }
};

/* human-readable model errors: never show raw provider JSON in chat */
function friendlyModelError(e){
  const m = String(e && e.message || e);
  if(m==="no-key") return "No model key set. Open Muse is BYO-key: paste a key in Settings - Gemini\u2019s free tier (aistudio.google.com/apikey) is the easiest start, OpenRouter, Token Harbor and NVIDIA NIM work too - it stays in this browser. Or pick the Local provider and run a model on this machine with no key at all.";
  if(m==="stall") return "The provider went quiet mid-reply - nothing came through for a while, so I stopped waiting instead of spinning forever. That usually means the model is overloaded right now: try again, or use the Test button in Settings to pick a model that answers.";
  if(m==="model-empty") return "The provider answered but sent back no reply text - the model may be overloaded or it filtered the response. Try again, or pick another model in Settings.";
  if(m==="no-model") return provider().edge
    ? "No on-device model is loaded. Open EDGE//AI (aeiouvcode.github.io/edge-ai), load a chat model there, then come back - Muse never downloads or switches models on its own."
    : "No model selected. Open Settings and refresh the model list once your local server is up - or just type the model id (e.g. llama3.1:8b).";
  if(m==="edge-timeout") return "The EDGE//AI frame did not come up in 30s - edge-ai may be unreachable right now. Try again, or pick another engine in Settings.";
  if(m==="edge-infer-timeout") return "On-device inference timed out. A first run downloads model weights, which can take a while on slow connections - try again once the EDGE//AI app has the model cached.";
  if(S() && provider().edge && !/^edge-/.test(m)) return "EDGE//AI reported: "+m.slice(0,140);
  if(m==="engine-not-loaded") return "No on-device model is loaded in the built-in engine yet. Open Settings - with On-device (built-in) picked, choose a model and tap Load. The first load downloads the weights once; after that they stay in this browser and work offline.";
  if(m==="engine-busy") return "The built-in engine is already loading a model - give it a moment.";
  if(m==="engine-runtime-missing") return "The built-in engine's runtime file is missing from this deployment - it should sit next to the app under vendor/. Redeploy or pick another provider meanwhile.";
  if(m==="engine-runtime-integrity") return "The built-in engine's runtime failed its integrity check, so I refused to run it. The deployed file does not match the pinned release - redeploy a clean copy.";
  if(provider().builtin && /out of memory|oom|allocation failed|insufficient memory/i.test(m)) return "That model did not fit in this device's memory. Pick the smallest one in Settings (Qwen3 0.6B) - it is made for phones.";
  if(provider().builtin && /engine-model-list-4\d\d/.test(m)) return "That model repo was not found on Hugging Face - check the id (owner/repo) and try again.";
  if(provider().builtin && /failed to fetch|networkerror|load failed/i.test(m)) return "The model weights did not finish downloading - check the connection and tap Load again. Files that already finished are kept, so the retry picks up where it stopped.";
  if(S() && provider().builtin && !/^engine-/.test(m)) return "Built-in engine reported: "+m.slice(0,140);
  if(S() && provider().local && /failed to fetch|networkerror|load failed/i.test(m)) return "Could not reach the local model server at " + (S().settings.localUrl||"http://localhost:11434/v1") + ". Start Ollama (ollama serve) or LM Studio's server there, then try again. Nothing left this device.";
  const st = m.match(/\bmodel (\d{3})\b/) || m.match(/\b(401|402|403|404|408|409|429|5\d\d)\b/);
  const code = st ? st[1] : "";
  if(code==="400") return /api key/i.test(m) ? "The provider says that key isn't valid (400). Re-check it in Settings - Gemini keys come from aistudio.google.com/apikey." : "The provider rejected the request (400) - the model id may not exist on this provider. Pick another model in Settings.";
  if(code==="401") return "The provider rejected the call as unauthenticated (401) - the key is missing, malformed or revoked. Check it in Settings, or switch provider.";
  if(code==="402") return "The provider says this key is out of credit (402). Top up, or switch to a free model.";
  if(code==="403") return "The provider refused this key (403) - it may not have access to that model. Check the key in Settings or pick another model.";
  if(code==="404") return "The provider does not recognize that model (404). Pick another model in Settings.";
  if(code==="429") return "Rate limited (429) - too many requests right now. Give it a moment and try again.";
  if(code && code[0]==="5") return "The provider is having server trouble ("+code+"). Try again shortly.";
  if(/failed to fetch|networkerror|load failed/i.test(m)) return "Could not reach the model provider - network blocked or offline. Gemini, OpenRouter and Token Harbor all allow direct browser calls, so this is usually connectivity.";
  if(/^(Cannot read propert|undefined is not|null is not|.*is not a function)/.test(m)) return "Muse hit an internal bug, not something you did. The step stays open - say \u201cadvance\u201d to try again; if it repeats, the bug needs fixing, not retrying.";
  const mc=m.match(/^model (\d{3}):/); if(mc) return "The model call failed ("+mc[1]+"). Try again, or pick another model in Settings.";
  return "Model call failed: "+m.slice(0,140);
}

/* humanError: the only path from a thrown error to the screen. Takes the
   first line, drops anything that smells like a stack frame, JSON blob or
   internal path, and falls back to plain copy when nothing human is left.
   Raw stack traces never reach the UI. */
function humanError(e, fallback){
  let m = String(e && e.message || e || "").split("\n")[0];
  if(/^\s*[{\[]/.test(m) || /\bat [\w<>.$]+ \(|node_modules|chrome-extension:\/\/|\.js:\d+:\d+/.test(m)) m = "";
  m = m.replace(/\s+/g," ").trim().slice(0,140);
  if(m.length < 3) return fallback || "Something went wrong - try again.";
  return m;
}
async function chatStream(messages, onTok, signal){
  const prov=provider(); const ep=provEndpoints();
  if(!Broker.has("model") && !prov.local && !prov.edge && !prov.nim && !prov.builtin) throw new Error("no-key");
  if((prov.local || prov.nim) && !activeModel()) throw new Error("no-model");
  if(prov.builtin){
    // on-device: nothing leaves the browser, so there is nothing to cloak
    const em = activeModel() || LocalEngine.loadedModel || "";
    if(!em) throw new Error("no-model");
    if(!LocalEngine.loadedModel) throw new Error("engine-not-loaded");
    return await LocalEngine.infer(messages, { stream:true, maxTokens:768, onTok: acc=>{ onTok && onTok(acc); } });
  }
  messages = Cloak.out(messages);
  if(prov.edge){
    const em = activeModel() || EdgeBridge.loadedModel || "";
    if(!em) throw new Error("no-model");
    const t = await EdgeBridge.infer(messages, {stream:true, model:em, onTok: acc=>{ onTok && onTok(Cloak.back(acc)); }});
    return Cloak.back(t);
  }
  // stall watchdog: the user stop signal is external; an inner controller lets
  // us abort ourselves when the provider goes quiet (connects, then nothing)
  const inner=new AbortController();
  const onExt=()=>inner.abort();
  if(signal){ if(signal.aborted) inner.abort(); else signal.addEventListener("abort", onExt); }
  const t0=Date.now(); let lastByte=t0, gotText=false;
  const watchdog=setInterval(()=>{
    if(Date.now()-lastByte>45000 || (!gotText && Date.now()-t0>90000)) inner.abort("stall");
  },2000);
  let r;
  try{
    r = await Broker.use("model", ep.url, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      signal: inner.signal,
      body: JSON.stringify({ model: activeModel(), messages, stream:true, temperature:0.7 })
    });
  }catch(e){
    clearInterval(watchdog); if(signal) signal.removeEventListener("abort", onExt);
    if(signal && signal.aborted) throw e;
    if(inner.signal.aborted) throw new Error("stall");
    throw e;
  }
  if(!r.ok){ clearInterval(watchdog); if(signal) signal.removeEventListener("abort", onExt); const t=await r.text(); throw new Error("model "+r.status+": "+t.slice(0,160)); }
  const rd=r.body.getReader(); const dec=new TextDecoder(); let buf="", out="";
  try{
    for(;;){
      const {done,value}=await rd.read(); if(done) break;
      lastByte=Date.now();
      buf+=dec.decode(value,{stream:true});
      let i; while((i=buf.indexOf("\n"))>=0){
        const line=buf.slice(0,i).trim(); buf=buf.slice(i+1);
        if(!line.startsWith("data:")) continue;
        const d=line.slice(5).trim(); if(d==="[DONE]"){ clearInterval(watchdog); if(signal) signal.removeEventListener("abort", onExt); return Cloak.back(out); }
        try{ const tok=JSON.parse(d).choices?.[0]?.delta?.content || ""; if(tok){ gotText=true; out+=tok; onTok && onTok(Cloak.back(out)); } }catch(e){}
      }
    }
  }catch(e){
    clearInterval(watchdog); if(signal) signal.removeEventListener("abort", onExt);
    // user pressed Stop: keep whatever streamed in, hand it back partial
    if(signal && signal.aborted) return Cloak.back(out);
    if(inner.signal.aborted) throw new Error("stall");
    throw e;
  }
  clearInterval(watchdog); if(signal) signal.removeEventListener("abort", onExt);
  return Cloak.back(out);
}
async function chatOnce(messages, json, model){
  const prov=provider(); const ep=provEndpoints();
  if(!Broker.has("model") && !prov.local && !prov.edge && !prov.nim && !prov.builtin) throw new Error("no-key");
  if((prov.local || prov.nim) && !(model || activeModel())) throw new Error("no-model");
  if(prov.builtin){
    const em = model || activeModel() || LocalEngine.loadedModel || "";
    if(!em) throw new Error("no-model");
    if(!LocalEngine.loadedModel) throw new Error("engine-not-loaded");
    return await LocalEngine.infer(messages, { maxTokens:640 });
  }
  messages = Cloak.out(messages);
  if(prov.edge){ const em = model || activeModel() || EdgeBridge.loadedModel || ""; if(!em) throw new Error("no-model"); return Cloak.back(await EdgeBridge.infer(messages, {model: em})); }
  const body={ model: model || activeModel(), messages, temperature:0.3 };
  if(json) body.response_format={type:"json_object"};
  const r=await Broker.use("model", ep.url, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
  if(!r.ok) throw new Error("model "+r.status);
  const j=await r.json();
  const ch=j.choices && j.choices[0];
  if(!ch || !ch.message || typeof ch.message.content!=="string") throw new Error("model-empty");
  return Cloak.back(ch.message.content);
}

/* ---------------- AI SDK-shaped protocol ----------------
   All model access goes through this layer, shaped after the Vercel AI SDK:
   a provider exposing generateText/streamText over {role, content} model
   messages, and tool exchanges carried as AI-SDK-style parts
   ({type:"tool-call"|"tool-result", toolCallId, toolName, args|result}) on
   the assistant message's `parts` field. A future swap to the real SDK
   touches this object and the parts helpers - nothing else. */
const AI = {
  provider(){
    return {
      id: String(provider().name||"unknown").toLowerCase().replace(/\s+/g,"-"),
      model: activeModel(),
      generateText: ({messages, json}) => chatOnce(messages, json),
      streamText: ({messages, onChunk}) => chatStream(messages, onChunk)
    };
  }
};
function toolCallParts(calls, results){
  return [
    ...calls.map((c,i)=>({type:"tool-call", toolCallId:"call_"+i, toolName:c.tool, args:c.args||{}})),
    ...results.map((r,i)=>({type:"tool-result", toolCallId:"call_"+i, toolName:r.tool, result:String(r.result).slice(0,1000)}))
  ];
}

/* ---------------- memory engine: Mem0/Cognee patterns, fully local ----------------
   Mem0-style durable facts: add OR update-in-place (never a growing pile of
   near-duplicates), gentle recency decay that re-ranks but NEVER deletes,
   usage tracking. Cognee-style retrieval: hybrid scoring (token similarity
   blended with recency + usage) plus a graph-lite one-hop expansion over
   memories linked by shared salient terms. No embeddings, no servers -
   everything lives in the encrypted local store. */
const _STOP = new Set(("the a an and or of to in for on with is are was were be been my your his her its our their this that these those it as at by from about into over after am do does did have has had will would can could should not no yes but so if then than too very just").split(" "));
function memTokens(t){
  return String(t||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w=>w.length>2 && !_STOP.has(w));
}
function jaccard(a, b){
  const A=new Set(a), B=new Set(b); let i=0;
  for(const w of A) if(B.has(w)) i++;
  return i/Math.max(1, A.size+B.size-i);
}
function memSim(qt, m){
  const mt = m._tok || (m._tok = memTokens(m.text));
  let s = jaccard(qt, mt);
  const ql=qt.join(" "), ml=String(m.text).toLowerCase();
  if(ql.length>5 && ml.includes(ql)) s=Math.max(s, 0.55); // direct phrase containment
  return s;
}
function memKind(text){
  const t=String(text).toLowerCase();
  if(/\b(prefer|prefers|preferred|favorite|likes|loves|hates|dislikes|always|never|usually|vegetarian|vegan|allergic|tone|style)\b/.test(t)) return "preference";
  if(/\b(wife|husband|partner|girlfriend|boyfriend|friend|mother|father|mom|dad|brother|sister|son|daughter|colleague|coworker|boss|manager|mentor)\b/.test(t)) return "person";
  if(/\b(project|building|launching|startup|app|website|repo|company|client|product|deadline|launch)\b/.test(t)) return "project";
  return "fact";
}
function memExpiry(text){
  const t=String(text).toLowerCase(), d=Date.now();
  if(/\b(tonight|today|this morning|this afternoon|this evening)\b/.test(t)) return new Date(d+86400000).toISOString();
  if(/\btomorrow\b/.test(t)) return new Date(d+2*86400000).toISOString();
  if(/\b(this week|this weekend)\b/.test(t)) return new Date(d+7*86400000).toISOString();
  if(/\bnext week\b/.test(t)) return new Date(d+10*86400000).toISOString();
  return null;
}
const memAlive = m => !m.expiresAt || new Date(m.expiresAt).getTime() > Date.now();
async function rememberFact(text, source){
  const s=S(); text=String(text||"").trim().slice(0,280); if(text.length<8) return null;
  const tt=memTokens(text);
  let best=null, bestSim=0;
  for(const m of s.memory){ if(!memAlive(m)) continue; const sim=memSim(tt, m); if(sim>bestSim){ bestSim=sim; best=m; } }
  if(best && bestSim>=0.6){
    // Mem0-style UPDATE: the same fact evolved -> update in place, keep one record
    if(best.text.toLowerCase()!==text.toLowerCase()){
      await audit("memory", `Updated memory: "${best.text.slice(0,60)}" -> "${text.slice(0,60)}"`);
      best.text=text; delete best._tok;
      best.ts=nowISO(); best.updated=(best.updated||0)+1; if(source) best.source=source;
      best.kind=memKind(text); best.expiresAt=memExpiry(text);
      await Store.save(); renderMemory(); return best;
    }
    // exact duplicate: refresh quietly, announce nothing - nothing was learned
    best.ts=nowISO();
    await Store.save(); return null;
  }
  const m={id:uid("mem"), text, ts:nowISO(), source:source||"conversation", uses:0, kind:memKind(text), expiresAt:memExpiry(text)};
  s.memory.unshift(m);
  await audit("memory", `Learned: "${text}"`);
  await Store.save(); renderMemory(); return m;
}
function retrieveMemory(query, k){
  const s=S(); const out={hits:[], related:[]};
  const pool=s.memory.filter(memAlive);
  if(!pool.length) return out;
  const qt=memTokens(query); if(!qt.length) return out;
  const now=Date.now();
  const scored=pool.map(m=>{
    const sim=memSim(qt, m);
    const ageDays=(now-new Date(m.ts).getTime())/86400000;
    const recency=1/(1+ageDays/30);               // decay re-ranks, never deletes
    const usage=1+Math.min(3, m.uses||0)*0.15;
    return {m, sim, score:sim*recency*usage};
  }).filter(x=>x.sim>0.06).sort((a,b)=>b.score-a.score);
  out.hits=scored.slice(0, k||6).map(x=>x.m);
  // graph-lite one hop: memories sharing salient terms with a hit come along as "linked"
  const inHits=new Set(out.hits.map(m=>m.id));
  for(const h of out.hits){
    const ent=memTokens(h.text).filter(w=>w.length>4);
    if(!ent.length) continue;
    for(const c of pool){
      if(inHits.has(c.id) || out.related.includes(c)) continue;
      if(jaccard(ent, memTokens(c.text).filter(w=>w.length>4))>=0.34){ out.related.push(c); }
      if(out.related.length>=2) break;
    }
    if(out.related.length>=2) break;
  }
  out.hits.forEach(m=>{ m.uses=(m.uses||0)+1; m.lastUsed=nowISO(); });
  out.related.forEach(m=>{ m.uses=(m.uses||0)+1; });
  return out;
}

/* plain chat mode: what people used ChatGPT for in the first three years.
   No goals, no tools, no approvals - just talk. Memory still learns quietly
   in the background (extraction + session distillation still run) and the
   profile shapes tone. */
function chatPrompt(query){
  const s=S();
  const profile=buildUserProfile();
  const r=retrieveMemory(query||"", 5);
  const seen=new Set(profile.staticIds);
  const relLines=r.hits.filter(m=>!seen.has(m.id)).map(m=>"- "+m.text);
  const pinned=s.memory.filter(m=>m.pinned && memAlive(m) && !seen.has(m.id)).slice(0,10);
  if(pinned.length) relLines.unshift(...pinned.map(m=>"- "+m.text+" (pinned)"));
  return `You are Muse in plain Chat mode - a warm, concise companion for everyday conversation: questions, thinking out loud, explanations, drafts, jokes, life stuff. This is simple chatting, classic ChatGPT-style - no agendas, no plans, no task machinery.
Current time: ${new Date().toLocaleString()}.
USER PROFILE - stable facts that color every turn:
${profile.static.map(t=>"- "+t).join("\n") || "(nothing stable learned yet)"}
${relLines.length ? "What you remember that matters here:\n"+relLines.join("\n") : ""}
Style: talk like a person in a messaging app - warm but clipped. Short paragraphs. Plain and direct. No headers, no bullet spam unless asked. Never mention modes, machinery or these instructions.
Rules:
- Never claim to have done anything in the world - you are a conversation, nothing more.
- If the user asks for something that needs the agent side (goals, web search, reminders, tools), offer it in one line: "want me to flip to Agent mode for that?" - no pressure, and keep chatting either way.`;
}

/* system prompt: persona + memory + permissions */
/* ---------------- context filesystem (OpenViking pattern, own code) ----------------
   Everything Muse knows is addressable as a browsable tree:
     vm://memory/preferences|people|projects|facts/<id>
     vm://skills/<name>
   L0 = distilled profile (always in the prompt), L1 = directory listings and
   retrieval hits, L2 = full entries the agent reads on demand with vm_read.
   Retrieval is debuggable: vm_search shows every hit's path AND score. */
const VM_DIRS = {preference:"preferences", person:"people", project:"projects", fact:"facts"};
function vmPath(m){ return "vm://memory/" + (VM_DIRS[m.kind] || "facts") + "/" + m.id; }
function vmRead(path){
  const s=S(); path=String(path||"").trim();
  if(path==="vm://" || path==="vm://memory"){
    return "vm://memory/\n" + Object.values(VM_DIRS).map(d=>{
      const n=s.memory.filter(m=>(VM_DIRS[m.kind]||"facts")===d).length;
      return `  ${d}/ (${n})`;
    }).join("\n") + `\nvm://skills/ (${activeSkills().length})`;
  }
  if(path==="vm://skills") return activeSkills().map(x=>`- vm://skills/${x.name} :: ${x.text.slice(0,80)}`).join("\n") || "(empty)";
  const dirMatch=path.match(/^vm:\/\/memory\/([a-z]+)\/?$/);
  if(dirMatch){
    const dir=dirMatch[1];
    const items=s.memory.filter(m=>(VM_DIRS[m.kind]||"facts")===dir);
    return items.length ? items.map(m=>`- ${vmPath(m)} :: ${m.text}`).join("\n") : "(empty directory)";
  }
  const idMatch=path.match(/\/([^/]+)$/);
  if(idMatch){
    const m=s.memory.find(x=>x.id===idMatch[1]);
    if(m) return `${vmPath(m)}\nkind: ${m.kind||"fact"} | learned: ${m.ts} | source: ${m.source||"conversation"} | used: ${m.uses||0}x | revised: ${m.updated||0}x${m.expiresAt?" | expires: "+m.expiresAt:""}\n\n${m.text}`;
  }
  return "not found: "+path+" (try vm:// to list the root)";
}

/* User profile (supermemory pattern, computed locally on read): a STATIC
   block of stable identity facts that must color every turn - a name or tone
   preference never matches a semantic query, so it cannot wait for retrieval -
   plus a DYNAMIC block of what is happening right now. */
function buildUserProfile(){
  const s=S(); const now=Date.now();
  const alive=s.memory.filter(memAlive);
  const isStable=m=>{ const k=m.kind||(m.kind=memKind(m.text));
    return k==="preference" || k==="person" || (m.uses||0)>=2 || (now-new Date(m.ts).getTime())>14*86400000; };
  const stat=alive.filter(isStable)
    .sort((x,y)=>((y.uses||0)-(x.uses||0)) || (new Date(x.ts)-new Date(y.ts)))
    .slice(0,5).map(m=>m.text);
  const dyn=[];
  const ag=s.goals.filter(g=>g.status==="active").slice(0,3);
  if(ag.length) dyn.push("active goals: "+ag.map(g=>g.title).join("; "));
  const ot=s.tasks.filter(t=>t.status==="open").slice(0,4);
  if(ot.length) dyn.push("open tasks: "+ot.map(t=>t.text).join("; "));
  const pr=s.reminders.filter(r=>r.status==="pending").slice(0,3);
  if(pr.length) dyn.push("reminders: "+pr.map(r=>r.text+" @ "+new Date(r.at).toLocaleString()).join("; "));
  return {static:stat, dynamic:dyn, staticIds:new Set(alive.filter(isStable).slice(0,5).map(m=>m.id))};
}

function systemPrompt(query){
  const s=S();
  const profile = buildUserProfile();
  let mem = "(nothing learned yet)";
  if(s.memory.length){
    const r = retrieveMemory(query||"", 6);
    const seen = new Set(profile.staticIds);
    const lines = [];
    const pinned = s.memory.filter(m=>m.pinned && memAlive(m)).slice(0,10);
    if(pinned.length){ lines.push("Pinned by the user (always in context):"); pinned.forEach(m=>{ if(!seen.has(m.id)){ seen.add(m.id); lines.push("- "+m.text); } }); }
    if(r.hits.length){ lines.push("Relevant to this turn:"); r.hits.forEach(m=>{ if(!seen.has(m.id)){ seen.add(m.id); lines.push("- "+m.text); } }); }
    if(r.related.length){ lines.push("Linked memories:"); r.related.forEach(m=>{ if(!seen.has(m.id)){ seen.add(m.id); lines.push("- "+m.text); } }); }
    const recent = s.memory.slice(0,3).filter(m=>!seen.has(m.id));
    if(recent.length){ lines.push("Recently learned:"); recent.forEach(m=>lines.push("- "+m.text)); }
    mem = lines.join("\n") || s.memory.slice(0,10).map(m=>"- "+m.text).join("\n");
  }
  const perms = s.connectors.map(c=>`${c.name}: ${c.scope}`).join(", ");
  const skills = activeSkills().map(x=>`- ${x.name}: ${x.text}`).join("\n") || "none";
  const manifest = [
    ...Object.entries(Tools).map(([id,t])=>`- ${id} ${t.argsHint}${t.openOnly?" (needs open network mode)":""}`),
    ...s.customTools.filter(t=>t.status==="active").map(t=>`- ${t.name} ${t.argsHint} (custom)`),
    ...(s.mcps.length?['- mcp_call {"server":"<name>","tool":"<tool>","arguments":{}} (needs open network mode)']:[]),
  ].join("\n");
  return `You are Muse, the personal agent inside Open Muse - an open-source, local-first personal agent. You behave like a capable, warm, concise assistant that DOES work, not just chats.
Current time: ${new Date().toLocaleString()}.
USER PROFILE - stable facts that color every turn, never wait for a matching query:
${profile.static.map(t=>"- "+t).join("\n") || "(nothing stable learned yet)"}
Right now: ${profile.dynamic.join(" · ") || "nothing active"}
TOOLS - to use one, emit a fenced block exactly like: \`\`\`tool {"tool":"id","args":{...}} \`\`\` (up to 4 per turn, they chain; results come back to you, then you answer). Use tools when they genuinely help - calculate instead of guessing math, search instead of inventing facts, set reminders when asked.
${manifest}
Active skills (follow them):
${skills}
Style: talk like a person in a messaging app - warm but clipped. Short paragraphs, no headers, no bullet spam unless listing steps. Plain and direct. Use what you remember about the user naturally, the way a friend would ("still on for that 10k?"), without reciting your memory list.
What you can do in this environment: chat, build and advance goal plans, remember facts, draft things (emails, messages, documents, checklists, plans), and prepare actions. You cannot reach the internet or real accounts directly - the Permissions panel grants scopes, and drafts are as far as anything external goes without the user doing the send.
Current permissions: ${perms}.
Rules:
- If the user states a goal, say you will plan it (the app builds the plan).
- Never claim to have sent, bought, booked or changed anything external. You draft and prepare; the user approves and executes outside.
- Keep replies under ~120 words unless the user asks for depth.
What you remember about the user:
${mem}`;
}

/* ---------------- sentinel policy ---------------- */
const SENSITIVE = /\b(send|email|message|share|post|publish|buy|purchase|pay|book|order|invite|transfer|delete|schedule)\b/i;
function sentinelCheck(step){
  return { sensitive: SENSITIVE.test(step.title) };
}

/* ---------------- goals engine ---------------- */
async function createGoal(title, opts={}){
  const s=S();
  const g={id:uid("goal"), title, created:nowISO(), due:opts.due||"", note:opts.note||"", status:"planning", plan:{steps:[]}};
  s.goals.unshift(g); renderGoals(); renderStatus();
  await audit("goal", `Goal accepted: "${title}" - planning`);
  try{
    const raw = await chatOnce([
      {role:"system", content:`You are the planning core of a personal agent. Break the user's goal into 4-7 concrete steps. Output JSON only: {"steps":[{"title":"...","kind":"agent"|"user"}]}. kind "agent" = the agent can do it in chat (research, drafting, writing, planning, analysis, learning, comparison, checklists). kind "user" = strictly requires the human's body or accounts in the real world (buying groceries, physically cooking, attending). Prefer agent steps - most steps of most goals are agent-doable; a good plan usually has at most 1-2 user steps. Steps that send/share/buy/book anything must be phrased as drafts or preparations, since a human always does the final external act.`},
      {role:"user", content:`Goal: ${title}\n${g.note?`Steering: ${g.note}`:""}\n${g.due?`Due: ${g.due}`:""}` }
    ], true);
    const plan=JSON.parse(raw);
    g.plan.steps=(plan.steps||[]).slice(0,8).map(x=>({id:uid("step"), title:String(x.title||"step"), kind:x.kind==="user"?"user":"agent", status:"todo", output:""}));
    g.status="active";
    await audit("plan", `Plan ready for "${title}": ${g.plan.steps.length} steps`);
    await logWork(`Goal accepted: "${title}" - plan ready, ${g.plan.steps.length} steps`);
    await Store.save(); renderGoals(); renderStatus();
    return g;
  }catch(e){
    g.status="active";
    g.plan.steps=[{id:uid("step"),title:"Define the first concrete move for: "+title,kind:"agent",status:"todo",output:""}];
    await audit("plan", `Planning fell back to a seed step for "${title}" (${e.message})`);
    await Store.save(); renderGoals(); renderStatus();
    return g;
  }
}

async function advanceGoal(id){
  const s=S(); const g=s.goals.find(x=>x.id===id); if(!g) return;
  const step=g.plan.steps.find(x=>x.status==="todo"||x.status==="approval");
  if(!step){ g.status="done"; await audit("goal",`Goal complete: "${g.title}"`); await logWork(`Goal complete: "${g.title}"`); await Store.save(); renderGoals(); renderStatus(); toast("Goal complete - archived with its outputs."); return; }
  if(step.kind==="user"){
    await audit("plan",`Step needs the human: "${step.title}"`);
    step.status="done"; g.status = g.plan.steps.every(x=>x.status==="done")?"done":"active";
    await addMsg("muse", `I marked “${step.title}” on “${g.title}” as handled - that one was yours to do in the world. Say the word if it isn't actually done and I'll reopen it.`);
    await Store.save(); renderAll(); return;
  }
  const check=sentinelCheck(step);
  if(check.sensitive && step.status!=="approval"){
    step.status="approval";
    await audit("sentinel",`Paused "${step.title}" - sensitive action, needs approval`);
    await addMsg("sys",`Sentinel paused a step on “${g.title}”.`);
    await Store.save(); renderAll(); return;
  }
  await runStep(g, step);
}

async function runStep(g, step){
  const guidance=[g.note?`Steering note: ${g.note}`:"",g.due?`Deadline: ${g.due} (${dueInfo(g)?.label||""})`:""].filter(Boolean).join("\n");
  const prior = g.plan.steps.filter(x=>x.status==="done"&&x.output).map(x=>`Earlier step "${x.title}" produced:\n${x.output.slice(0,900)}`).join("\n\n");
  step.status="doing"; renderGoals();
  setRT({state:"working", step:step.title, tool:""});
  await audit("action",`Running step: "${step.title}" (goal: "${g.title}")`);
  try{
    const out = await chatOnce([
      {role:"system", content: systemPrompt(g.title+" "+step.title)},
      {role:"user", content:`Execute this step of my goal and give me the finished work product, not a description of what you would do. Never say you cannot - produce the best possible artifact with what you know.\nGoal: ${g.title}\nStep: ${step.title}\n${guidance}\n${prior}\nProduce the actual artifact (draft text, plan, analysis, checklist, etc).`}
    ]);
    step.output=out; step.status="done";
    await addMsg("muse", `Done with “${step.title}” (${g.title}):\n\n${out.slice(0,1800)}`);
    await audit("action",`Completed step: "${step.title}"`);
    setRT({last:"Completed: "+step.title.slice(0,60)});
  }catch(e){
    step.status="todo";
    setRT({last:"Failed: "+step.title.slice(0,60)});
    await addMsg("sys", `Step “${step.title}” hit a problem: ${friendlyModelError(e)}`);
    await audit("error",`Step failed: "${step.title}" (${e.message})`);
  }
  g.status = g.plan.steps.every(x=>x.status==="done") ? "done" : "active";
  if(g.status==="done") toast("Goal complete - archived with its outputs.");
  setRT({state:"idle", step:"", tool:""});
  await Store.save(); renderAll();
}

/* ---------------- autonomy: Jules-style, honestly bounded ----------------
   While the tab is open, Muse advances routine plan steps on its own.
   Human steps and sentinel-flagged (sensitive) steps still stop and wait.
   Tab closed = orb asleep = nothing runs. That boundary is the truth of a
   static app, and the UI says it out loud. */
const _autoErr = {};
async function autoAdvance(goalId){
  if(!S() || !S().settings.autonomy) return;
  if(TEAM.active) return; // a team/swarm owns this goal's compute right now
  const g=S().goals.find(x=>x.id===goalId); if(!g || g.status!=="active") return;
  const step=g.plan.steps.find(x=>x.status==="todo");
  if(!step || step.kind==="human") return;
  setTimeout(async()=>{
    if(!S() || !S().settings.autonomy) return;
    if(TEAM.active) return;
    const g2=S().goals.find(x=>x.id===goalId); if(!g2 || g2.status!=="active") return;
    const st=g2.plan.steps.find(x=>x.id===step.id); if(!st || st.status!=="todo") return;
    if((_autoErr[goalId]||0) >= 2){ await audit("plan",`Autonomy paused on "${g2.title}" - repeated step failures`); return; }
    const before = S().audit.length;
    await advanceGoal(goalId);
    const err = S().audit.length>before && S().audit[0].kind==="error";
    _autoErr[goalId] = err ? (_autoErr[goalId]||0)+1 : 0;
    autoAdvance(goalId);
  }, 1400);
}
async function decideStep(pair, ok){
  const [gid,sid]=pair.split("|");
  const g=S().goals.find(x=>x.id===gid); const st=g&&g.plan.steps.find(x=>x.id===sid); if(!st) return;
  const card=$("#ap-"+sid);
  // resolved decisions persist as a card message in chat history - a live DOM
  // card would vanish on the next render, and the record is the whole point
  const settle=async(ok)=>{
    if(card) card.remove();
    await addMsg("sys", `<div class="card resolved"><h4>${ok?"✓ Approved":"✕ Rejected"}</h4><div class="small"><b>${esc(st.title)}</b> - ${ok?"running it now":"skipped"}. Recorded ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}; the audit trail keeps both outcomes.</div></div>`, "card");
  };
  if(ok){
    await audit("approval",`Approved: "${st.title}"`);
    logWork(`Approved sensitive step "${st.title}" (goal: ${g.title})`);
    await settle(true);
    await runStep(g, st);
    autoAdvance(gid);
  } else {
    st.status="done"; st.output="Rejected by user.";
    await audit("approval",`Rejected: "${st.title}"`);
    logWork(`Rejected sensitive step "${st.title}" (goal: ${g.title}) - skipped`);
    await settle(false);
    g.status = g.plan.steps.every(x=>x.status==="done") ? "done" : "active";
    await Store.save(); renderAll();
  }
}

/* ---------------- chat flow ---------------- */
const GOAL_RE = /\b(my goal is|goal:|set a goal|new goal|i want to (?:learn|run|build|write|launch|save|get|become|finish)|help me (?:plan|prepare|get|learn|build|write|launch|email|send|draft|negotiate|make|create|organize|apply))(?=\W|$)/i;

async function sendChat(auto){
  if(!S()){ showLockScreen("Locked - enter your passphrase to continue."); return; }
  const injected = auto && typeof auto.text==="string";
  const ta=$("#chatinput"); const text=(injected?auto.text:ta.value).trim().slice(0,4000); if(!text) return;
  if(!injected){ ta.value=""; ta.style.height="auto"; const s=S(); if(s&&s.drafts){ delete s.drafts[s.activeConvo]; } }
  await addMsg("user", text);
  if(pendingBranch){
    const nm = S().chat[S().chat.length-1];
    if(nm && nm.role==="user"){ nm.attempts = pendingBranch.attempts; nm.attempt = pendingBranch.attempt; await Store.save(); }
    pendingBranch = null;
  }
  renderChat();

  // forget command handled locally, instantly
  const fm = text.match(/^forget (?:that |about )?(.+)/i);
  if(fm){
    const q=fm[1].toLowerCase().trim();
    const hits=S().memory.filter(m=>m.text.toLowerCase().includes(q.slice(0,24)) || q.split(/\s+/).some(w=>w.length>3 && m.text.toLowerCase().includes(w)));
    if(hits.length){
      S().memory=S().memory.filter(m=>!hits.includes(m));
      for(const h of hits) await audit("memory",`Forgot on request: "${h.text}"`);
      await addMsg("muse", `Forgotten. ${hits.length===1?"That memory is":"Those "+hits.length+" memories are"} gone for good.`);
    } else {
      await addMsg("muse", `I don't hold anything matching that. The Memory view shows everything I know - it's a short list, you can check.`);
    }
    await Store.save(); renderAll(); return;
  }

  // recall intent: list real stored memories, framed honestly as local data
  if(/\bwhat do you (remember|know) about me\b/i.test(text) && S().memory.length){
    const mem=S().memory;
    await addMsg("muse", "From local memory - stored on this device, no model involved:\n\n" + mem.slice(0,12).map(m=>"- "+m.text).join("\n") + "\n\nSay \"forget <thing>\" and it's gone.");
    await Store.save(); renderAll(); return;
  }

  // what's on my plate: instant local answer
  if(/\bwhat'?s on my (plate|list)|\bmy tasks\b|\bshow (my )?tasks\b/i.test(text)){
    const open=S().tasks.filter(t=>t.status==="open");
    const rems=S().reminders.filter(r=>r.status==="pending");
    const active=S().goals.find(g=>g.status==="active");
    if(open.length || rems.length || active){
      await addMsg("muse", "From your local board - no model involved:\n" + (open.length? open.map(t=>"- "+t.text).join("\n") : "- no open tasks")
        + (active? `\n\nGoal in motion: "${active.title}" - say "advance" and I keep going.` : "")
        + (rems.length? `\n\nReminders set: ${rems.map(r=>r.text+" ("+fmtD(r.at)+")").join(", ")}` : ""));
      await Store.save(); renderAll(); return;
    }
  }

  // honesty gate: without a model key nothing past here can work - say so
  // plainly and point at the fix instead of pretending to answer.
  const keylessProv = !!provider().local || !!provider().edge || !!provider().nim || !!provider().builtin;
  if(!Broker.has("model") && !keylessProv){
    await addMsg("muse", "I can't answer that yet - there is no model connected, so anything I said would be fake. Paste a **Gemini** key in Settings and everything starts working for real: chat, goals, plans, memory. The key is free and stays in this browser.");
    await addMsg("muse", `<div class="wactions"><button class="wchip" data-wa="settings">Set up a key</button><button class="wchip" data-wa="geminikey">Get a free Gemini key</button></div>`, "card");
    await Store.save(); renderAll(); return;
  }

  // goal intent
  if(mode()!=="chat" && GOAL_RE.test(text)){
    const title=text.replace(/^(my goal is to|my goal is|my goal:|goal:|set a goal( to)?|new goal( is)?( to)?)\s*/i,"").trim().replace(/[.!\s]+$/,"").slice(0,140);
    const nice=title.charAt(0).toUpperCase()+title.slice(1);
    await addMsg("muse", `On it. I'm turning “${nice}” into a plan - give me a few seconds.`);
    renderChat();
    learnFrom(text).catch(async e=>audit("error","memory extraction failed: "+humanError(e)));
    const g=await createGoal(nice);
    const words = nice.toLowerCase().split(/\W+/).filter(w=>w.length>3);
    const rel = retrieveMemory(text, 1).hits[0];
    if(rel) await addMsg("sys", `Using what I remember: "${rel.text}"`);
    await addMsg("muse", `Plan is ready: ${g.plan.steps.length} steps. It's on the Goals board - I'll advance it step by step, and anything sensitive pauses for your approval first. Say "advance" or press Advance over there.`);
    await Store.save(); renderAll(); switchView("goals"); autoAdvance(g.id); return;
  }
  if(/^(advance|continue|keep going|next step)\b/i.test(text)){
    const g=S().goals.find(x=>x.status==="active");
    if(g){ await advanceGoal(g.id); autoAdvance(g.id); } else await addMsg("muse","No active goal right now. Give me one and I'll get moving.");
    await Store.save(); renderAll(); return;
  }

  // ordinary chat with streaming
  const log=$("#chatlog");
  const el=document.createElement("div"); el.className="msg muse";
  el.innerHTML=`<div class="body"><span class="typing"><i></i><i></i><i></i></span></div>`;
  log.appendChild(el); log.scrollTop=log.scrollHeight;
  setPresence("thinking");
  // stop control: aborting keeps the partial reply instead of discarding it
  const ctl=new AbortController();
  let lastPartial="";
  const stopBtn=$("#stopbtn");
  if(provider().builtin){ stopBtn.hidden=false; stopBtn.onclick=()=>{ LocalEngine.stop(); stopBtn.hidden=true; }; }
  else if(!provider().edge){ stopBtn.hidden=false; stopBtn.onclick=()=>{ ctl.abort(); stopBtn.hidden=true; }; }
  const hist=S().chat.slice(-14).filter(m=>m.role!=="sys"&&!m.kind).map(m=>({role:m.role==="muse"?"assistant":m.role, content:m.text}));
  try{
    const m0 = mode();
    const sys = m0==="coder" ? coderPrompt(await ownSource()) : m0==="chat" ? chatPrompt(text) : systemPrompt(text);
    let out=await chatStream([{role:"system",content:sys}, ...hist], partial=>{ lastPartial=partial; el.querySelector(".body").innerHTML=mdLite(partial); log.scrollTop=log.scrollHeight; }, ctl.signal);
    el.remove(); stopBtn.hidden=true;
    if(ctl.signal.aborted){
      out = (lastPartial||"").trim();
      await addMsg("muse", out ? out + "\n\n*(stopped - reply cut short at your request)*" : "Stopped before the reply got going - nothing was sent onward.");
      await Store.save(); renderAll(); setPresence("idle"); return;
    }
    const calls = m0==="agent" ? parseToolCalls(out) : [];
    if(calls.length){
      const display = stripToolFences(out).trim();
      if(display){ await addMsg("muse", display); renderChat(); }
      setPresence("working");
      const results=[];
      for(const c of calls){
        const res = await execTool(c.tool, c.args);
        results.push({tool:c.tool, result:res});
        await toolCard(c.tool, res);
        await audit("tool", `${c.tool}: ${res.slice(0,100)}`);
      }
      setPresence("thinking");
      const fin = await chatOnce([
        {role:"system",content:sys}, ...hist,
        {role:"assistant",content:out},
        {role:"user",content:"Tool results:\n"+results.map(r=>`[${r.tool}]\n${r.result}`).join("\n\n")+"\n\nAnswer the user using these results. Be brief."}
      ], false);
      await addMsg("muse", fin);
      S().chat[S().chat.length-1].parts = toolCallParts(calls, results);
      renderChat();
    } else {
      await addMsg("muse", out); renderChat();
    }
    learnFrom(text).catch(async e=>audit("error","memory extraction failed: "+humanError(e)));
  }catch(e){
    el.remove(); stopBtn.hidden=true;
    if(ctl.signal.aborted){
      const p=(lastPartial||"").trim();
      await addMsg("muse", p ? p + "\n\n*(stopped - reply cut short at your request)*" : "Stopped before the reply got going - nothing was sent onward.");
    } else {
      await addMsg("sys", friendlyModelError(e));
    }
    renderChat();
  }
  setPresence("idle");
  await Store.save();
  if(mode()==="coder") { await saveCoderSession(); const q=coderContext(); if(q.pct>88 && S().chat.length>18) await createCoderCheckpoint(true); }
  renderStatus(); renderCoderWorkbench();
}

/* memory extraction: small background call, durable facts only */
async function learnFrom(userText){
  if(!Broker.has("model")) return;
  const raw=await chatOnce([
    {role:"system",content:`Extract durable personal facts worth remembering from the user's message (preferences, relationships, constraints, projects, goals). Output JSON: {"facts":["...",...]}. Facts must be third-person, specific, and useful later ("User is training for a 10k"). Skip transient chatter, questions, and anything already implied. Empty list if nothing durable.`},
    {role:"user",content:userText}
  ], true);
  const facts=(JSON.parse(raw).facts||[]).slice(0,3);
  const saved=[];
  for(const f of facts){
    const t=String(f).trim(); if(t.length<8) continue;
    if(await rememberFact(t, "conversation")) saved.push(t);
  }
  if(saved.length){
    renderStatus();
    await addMsg("sys", `Muse will remember: "${saved[0]}"${saved.length>1?` (+${saved.length-1} more)`:""}`);
    await Store.save(); renderChat();
  }
}

/* ---------------- session distillation ----------------
   OpenViking's session-commit pattern, honestly bounded: when the tab goes
   hidden (and as catch-up on boot after a gap), durable facts are distilled
   from the conversation window since the last pass. Extraction reuses the
   Mem0-style loop, so dedupe/update applies. Runs only while a key is set. */
async function distillSession(){
  const s=S(); if(!s || !Broker.has("model")) return;
  const from = s.lastDistillIdx || 0;
  const fresh = s.chat.slice(from).filter(m=>m.role==="user" && !m.kind);
  if(fresh.length < 3) return;
  s.lastDistillIdx = s.chat.length;
  await Store.save();
  try{ await learnFrom(fresh.slice(-12).map(m=>m.text).join("\n").slice(0,2500)); }
  catch(e){ await audit("error", "session distillation failed: "+humanError(e)); }
}
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="hidden") distillSession(); });

/* ---------------- proactivity ----------------
   THUNLP ProactiveAgent patterns (arXiv:2410.12361), local analog:
   - "nothing" is a prediction: staying silent is a decision, and every silence
     is audited with its reason (the local stand-in for their reward model)
   - a persisted feedback ledger per proposal kind: proposed / accepted /
     dismissed / ignored. Ignored proposals back the cadence off (busy signal),
     kinds with near-zero acceptance mute themselves, accepts reset the backoff
   - proposals are tri-state: Accept / Dismiss / do nothing (TTL = ignore)
   - deciding costs no model call; the model only runs when you accept
   - honest bound: proposals fire only while the orb is awake (this tab) */
const PROPOSAL_TTL = 15*60*1000;
function proactiveLedger(){ const s=S(); if(!s.proactivity) s.proactivity={kinds:{}, cooldownUntil:0, ignoreStreak:0, outstanding:null}; return s.proactivity; }
function kindStats(kind){ const P=proactiveLedger(); if(!P.kinds[kind]) P.kinds[kind]={proposed:0,accepted:0,dismissed:0,ignored:0,muted:false}; return P.kinds[kind]; }
function gateVerdict(kind){
  const P=proactiveLedger(); const now=Date.now();
  if(!S().settings.autonomy) return "autonomy is off";
  if(mode()==="chat") return "chat mode - plain talk, no proposals";
  const k=kindStats(kind);
  if(k.muted) return `kind "${kind}" muted (acceptance ran near zero)`;
  if(now < (P.cooldownUntil||0)) return `backing off after ignored proposals (${Math.max(1,Math.round((P.cooldownUntil-now)/60000))}m left)`;
  if(document.querySelector(".suggest")) return "another proposal is already on screen";
  return null;
}
async function resolveProposal(outcome){
  const P=proactiveLedger(); const o=P.outstanding; if(!o) return;
  const k=kindStats(o.kind);
  k[outcome]=(k[outcome]||0)+1;
  if(outcome==="accepted"){ P.ignoreStreak=0; P.cooldownUntil=0; }
  if(outcome==="dismissed"){ P.ignoreStreak=0; P.cooldownUntil=Date.now()+30*60000; }
  if(outcome==="ignored"){
    P.ignoreStreak=(P.ignoreStreak||0)+1;
    P.cooldownUntil=Date.now()+Math.min(120,30*Math.pow(2,P.ignoreStreak-1))*60000;
  }
  if(k.proposed>=3 && k.accepted===0 && (k.dismissed+k.ignored)>=Math.ceil(k.proposed*0.7)){
    k.muted=true;
    await audit("proactive", `Muted "${o.kind}" proposals for good: ${k.proposed} proposed, none accepted.`);
  }
  await audit("proactive", `Proposal [${o.kind}] ${outcome}`);
  P.outstanding=null;
  await Store.save();
}
async function propose(kind, html, onAccept){
  const verdict=gateVerdict(kind);
  if(verdict){ await audit("proactive", `Stayed silent [${kind}]: ${verdict}`); return false; }
  const P=proactiveLedger();
  if(P.outstanding) await resolveProposal("ignored");   // abandoned by reload = did not engage
  const k=kindStats(kind);
  k.proposed++; P.outstanding={kind, at:Date.now()};
  await Store.save();
  await audit("proactive", `Proposed [${kind}]`);
  const c=document.createElement("div"); c.className="suggest";
  c.innerHTML=`<div class="s-t">${html}</div><div class="s-b"><button class="btn pri" data-a="yes">Yes, go</button><button class="btn" data-a="no">Dismiss</button></div>`;
  $("#chatlog").appendChild(c); $("#chatlog").scrollTop=1e9;
  const done=async outcome=>{ if(!c.isConnected) return; c.remove(); await resolveProposal(outcome); };
  c.querySelector('[data-a="yes"]').onclick=async ()=>{ await done("accepted"); onAccept&&onAccept(); };
  c.querySelector('[data-a="no"]').onclick=()=>done("dismissed");
  setTimeout(()=>done("ignored"), PROPOSAL_TTL);
  return true;
}
/* event scan: observe in-app state -> candidates -> gate -> propose or stay silent */
async function proactiveNudge(){
  if(!S()) return;
  const P=proactiveLedger();
  if(P.outstanding && Date.now()-P.outstanding.at > PROPOSAL_TTL){ document.querySelector(".suggest")?.remove(); await resolveProposal("ignored"); }
  const active=S().goals.find(g=>g.status==="active");
  const pending=S().goals.flatMap(g=>g.plan.steps).filter(x=>x.status==="approval").length;
  if(pending>0){
    if(sessionStorage.getItem("openmuse.nudged")!==String(pending)){
      const verdict=gateVerdict("approval");
      if(verdict){ await audit("proactive", `Stayed silent [approval]: ${verdict}`); }
      else{ sessionStorage.setItem("openmuse.nudged", String(pending)); await addMsg("sys",`${pending} action${pending>1?"s are":" is"} waiting for your approval below.`); await Store.save(); renderChat(); }
    }
    return;
  }
  sessionStorage.removeItem("openmuse.nudged");
  if(new Date().getHours()>=17){
    const dueHabit=(S().habits||[]).find(h=>!habitDoneNow(h));
    if(dueHabit){
      await propose("habit-due", `<b>Muse, unprompted:</b> "${esc(dueHabit.name)}" is still unchecked ${dueHabit.cadence==="weekly"?"this week":"today"}${habitStreak(dueHabit)>0?` - ${habitStreak(dueHabit)} in a row on the line`:""}. Done it?`, async ()=>{
        await toggleHabit(dueHabit.id);
        await addMsg("muse", `Checked in "${esc(dueHabit.name)}". Streak's alive.`); await Store.save(); renderChat();
      });
      return;
    }
  }
  const stale = S().tasks.find(t=>t.status==="open" && Date.now()-new Date(t.created).getTime() > 24*3600*1000);
  if(stale){
    await propose("stale-task", `<b>Muse, unprompted:</b> "${esc(stale.text)}" has sat open since ${new Date(stale.created).toLocaleDateString()}. Want help closing it out?`, async ()=>{
      await addMsg("muse", `Let's close out "${esc(stale.text)}". Tell me what's blocking it - or say the word and I'll mark it done.`); await Store.save(); renderChat();
    });
    return;
  }
  if(active){
    const step=active.plan.steps.find(x=>x.status==="todo");
    if(step){
      await propose("next-step", `<b>Muse, unprompted:</b> "${esc(active.title)}" is mid-plan. Next up: "${esc(step.title)}". Want me to take it?`, ()=>advanceGoal(active.id));
      return;
    }
    return;
  }
  if(S().memory.length){
    const cand = S().memory.find(m=>/\b(wants?|training|learning|building|planning|hoping)\b/i.test(m.text));
    if(cand){
      const idea = cand.text.replace(/^User (wants to|is|is training to|is learning to|hopes to)\s*/i,"").replace(/[.。]+$/,"");
      await propose("memory-goal", `<b>Muse, unprompted:</b> you mentioned ${esc(idea)}. Want me to turn that into a real plan?`, async ()=>{ await createGoal(idea.charAt(0).toUpperCase()+idea.slice(1)); switchView("goals"); });
      return;
    }
  }
  if(!S().goals.length && S().chat.length<4 && !S().memory.length){
    const verdict=gateVerdict("fresh-start");
    if(verdict){ await audit("proactive", `Stayed silent [fresh-start]: ${verdict}`); return; }
    await addMsg("muse","One thing I'm good at: give me a goal, even a big one. I'll break it into a plan and start working through it with you.");
    await Store.save(); renderChat();
  }
}

/* ---------------- settings ---------------- */
async function fetchCatalog(pv){
  const prov = PROVIDERS[pv] || PROVIDERS.openrouter;
  if(prov.authCatalog && !Broker.has("model")) return null;   // TH/NIM catalogs are auth-gated
  if(prov.nativeCatalog){
    try{
      const r = await Broker.use("model", prov.nativeCatalog, {}, {via:"query"});
      if(!r.ok) return null;
      const j = await r.json();
      const ids = (j.models||[])
        .filter(m=>Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
        .map(m=>String(m.name||"").replace(/^models\//,""))
        .filter(id=>id && !/image|tts|transcribe|live|audio|embedding|aqa|omni|nano|computer-use|robotics/i.test(id));
      return ids.length ? ids : null;
    }catch(e){ return null; }
  }
  const mu = prov.local ? provEndpoints().modelsUrl : prov.modelsUrl;
  try{
    const r = await Broker.use("model", mu, {});
    if(!r.ok) return null;
    const j = await r.json();
    const ids = (j.data||[]).map(m=>m.id).filter(Boolean);
    return ids.length ? ids : null;
  }catch(e){ return null; }
}
async function populateModelSelect(){
  let fallbackOrder = false;
  const pv = $("#setprovider").value;
  const prov = PROVIDERS[pv] || PROVIDERS.openrouter;
  const sel = $("#setmodel");
  const current = S().settings.model || prov.defModel;
  sel.innerHTML = `<option value="">loading catalog...</option>`;
  let ids = prov.builtin ? null : await fetchCatalog(pv);
  // the provider may have changed while the catalog was loading - drop stale results
  if($("#setprovider").value !== pv) return;
  let note = "";
  if(prov.edge){
    $("#setmodelcustom").hidden = false;
    ids = null;
    try{
      const ms = await EdgeBridge.ensure();
      ids = ms.map(m=>m.id||m.name).filter(Boolean);
      if(EdgeBridge.state==="needs_model") note = "EDGE//AI is up but no model is loaded there - open EDGE//AI and load a chat model first (Muse never downloads or switches models on its own)";
      else if(ids.length) note = ids.length + " on-device model" + (ids.length===1?"":"s") + " via EDGE//AI" + (EdgeBridge.loadedModel?` - loaded now: ${EdgeBridge.loadedModel}`:"");
    }catch(e){ ids = null; }
    if(ids===null){ ids = []; note = "EDGE//AI frame not up yet - the first run brings it up in a hidden frame; models load on the EDGE//AI side"; }
  } else if(prov.builtin){
    $("#setmodelcustom").hidden = true;
    ids = ENGINE_MODELS.map(m=>m.id);
    note = "built-in engine models - weights download once from Hugging Face, then run offline on this device. Load one in the panel below.";
  } else if(prov.nim){
    $("#setmodelcustom").hidden = false;
    if(!ids){ ids = []; note = "no NIM server answered at " + (S().settings.nimUrl||"http://localhost:8000/v1") + " - start your NIM container, press \u21bb, or type the model id below (build.nvidia.com lists them)"; }
    else note = ids.length + " model" + (ids.length===1?"":"s") + " served by your NIM endpoint";
  } else if(prov.local){
    $("#setmodelcustom").hidden = false;
    if(!ids){ ids = []; note = "no local server found at " + (S().settings.localUrl||"http://localhost:11434/v1") + " - start Ollama or LM Studio, press \u21bb, or type the model id below"; }
    else note = ids.length + " model" + (ids.length===1?"":"s") + " served locally - prompts never leave this device";
  } else {
    $("#setmodelcustom").hidden = true;
    if(!ids){ ids = prov.fallback.slice(); fallbackOrder = true; note = prov.authCatalog && !Broker.has("model") ? "enter a key to load the full catalog - showing current models meanwhile" : "catalog unavailable - showing current models"; }
  }
  if(prov.nim){ $("#setmodelcustom").hidden = false; }
  // verified-working on this provider+key first, then :free, rest alphabetical
  const ver=(S().settings.verified||{})[pv]||{};
  const okIds = ids.filter(id=>ver[id]!=null).sort((x,y)=>ver[x]-ver[y]);
  const free = ids.filter(id=>ver[id]==null && id.endsWith(":free")).sort();
  const paid = ids.filter(id=>ver[id]==null && !id.endsWith(":free")).sort();
  const ordered = fallbackOrder ? ids.slice() : [...okIds, ...free, ...paid];
  if(current && !ordered.includes(current)) ordered.unshift(current);
  MODEL_SELECT_CACHE.ids = ordered; MODEL_SELECT_CACHE.current = current; MODEL_SELECT_CACHE.note = note; MODEL_SELECT_CACHE.provName = prov.name;
  applyModelFilter();
}
const MODEL_SELECT_CACHE = {ids:[], current:"", note:"", provName:""};
function applyModelFilter(){
  const sel = $("#setmodel"); if(!sel) return;
  const engMap = {}; ENGINE_MODELS.forEach(m=>{ engMap[m.id]=m.label+" ("+m.size+")"; });
  const q = ($("#modelfilter") ? $("#modelfilter").value : "").trim().toLowerCase();
  const {ids, current, note, provName} = MODEL_SELECT_CACHE;
  const shown = q ? ids.filter(id=>id.toLowerCase().includes(q)) : ids;
  const list = shown.slice();
  if(current && !list.includes(current)) list.unshift(current);
  const verMap=(S().settings.verified||{})[($("#setprovider")||{}).value]||{};
  sel.innerHTML = list.map(id=>{
    const base = engMap[id] || (id.endsWith(":free") ? `FREE · ${id.replace(/:free$/,"")}` : id);
    const label = verMap[id]!=null ? `\u2713 ${base} · answered in ${verMap[id]} ms` : base;
    return `<option value="${id}" ${id===current?"selected":""}>${label}</option>`;
  }).join("");
  sel.value = current;
  const freeCount = shown.filter(id=>id.endsWith(":free")).length;
  $("#modelhint").textContent = q
    ? `${shown.length} of ${ids.length} models match "${q}"`
    : (note || `${ids.length} models from ${provName}${freeCount?` - ${freeCount} free`:""}`);
}
if($("#modelfilter")) $("#modelfilter").addEventListener("input", applyModelFilter);
function mtReason(st){ return {400:"key or request rejected",401:"key rejected",402:"out of credit / quota",403:"no permission for this model",404:"retired or unknown here",408:"timed out",409:"conflict",429:"rate limited - retry later"}[st] || (st>=500?"provider server trouble ("+st+")":"failed ("+st+")"); }
$("#testmodels").addEventListener("click", async ()=>{
  const pv=$("#setprovider").value; const prov=PROVIDERS[pv]||PROVIDERS.openrouter;
  const box=$("#modeltest");
  if(prov.builtin){ box.innerHTML=`<div class="small" style="color:var(--dim);margin-top:8px">The built-in engine's models verify themselves on load - pick one above and tap Load in the engine panel.</div>`; return; }
  if(prov.edge){ box.innerHTML=`<div class="small" style="color:var(--dim);margin-top:8px">On-device models load one at a time inside EDGE//AI - test them there instead.</div>`; return; }
  const keyless=!!prov.local||!!prov.nim;
  if(!Broker.has("model") && !keyless){ box.innerHTML=`<div class="small" style="color:var(--dim);margin-top:8px">Paste your key above and Save first - then the tester can show what it actually reaches.</div>`; return; }
  const ids=(MODEL_SELECT_CACHE.ids||[]).filter(Boolean);
  const q=($("#modelfilter").value||"").trim().toLowerCase();
  const list=q?ids.filter(id=>id.toLowerCase().includes(q)):ids;
  if(!list.length){ box.innerHTML=`<div class="small" style="color:var(--dim);margin-top:8px">No models listed - press ↻ to load the catalog first.</div>`; return; }
  const ep=provEndpoints();
  box.innerHTML=`<div class="small" id="mtsum" style="color:var(--dim);margin:8px 0 6px">Probing ${list.length} model${list.length===1?"":"s"} with one-token replies - cheap, and done in a few seconds.</div>`
    + list.map(id=>`<div class="mtrow" data-mt="${esc(id)}"><span class="mtst"><i class="spin"></i></span><span class="mtid">${esc(id)}</span><span class="mtms"></span><span class="mtuse"></span></div>`).join("");
  const sum=box.querySelector("#mtsum");
  let done=0, pass=0;
  const probe=async(id)=>{
    const row=box.querySelector(`[data-mt="${CSS.escape(id)}"]`);
    const t0=performance.now();
    const ctl=new AbortController(); const to=setTimeout(()=>ctl.abort(),20000);
    let st;
    try{
      const r=await Broker.use("model", ep.url, {method:"POST", headers:{"Content-Type":"application/json"}, signal:ctl.signal, body:JSON.stringify({model:id,messages:[{role:"user",content:"Say OK"}],max_tokens:1,temperature:0})});
      const ms=Math.round(performance.now()-t0);
      if(r.ok){ const j=await r.json().catch(()=>null); st=(j&&Array.isArray(j.choices)&&j.choices.length)?{ok:true,ms}:{ok:false,why:"answered but sent no text"}; }
      else st={ok:false,why:mtReason(r.status)};
    }catch(e){ st={ok:false,why:ctl.signal.aborted?"timed out (20s)":(/failed to fetch|networkerror|load failed/i.test(String(e))?"unreachable from this browser":"probe error")}; }
    clearTimeout(to);
    done++; if(st.ok)pass++;
    if(sum) sum.textContent=`Probing ${list.length} model${list.length===1?"":"s"} - ${done} done, ${pass} answering so far.`;
    if(row){
      const stEl=row.querySelector(".mtst"); stEl.textContent=st.ok?"✓":"✕"; stEl.className="mtst "+(st.ok?"ok":"bad");
      row.querySelector(".mtms").textContent=st.ok?st.ms+" ms":st.why;
      if(st.ok){ const u=document.createElement("button"); u.className="btn mtusebtn"; u.textContent="Use";
        u.onclick=()=>{ S().settings.model=id; Store.save().then(()=>{ MODEL_SELECT_CACHE.current=id; populateModelSelect(); renderStatus(); }); audit("settings","Picked model "+id+" from the tester"); toast("Model set to "+id+"."); };
        row.querySelector(".mtuse").appendChild(u); }
    }
    return st;
  };
  const queue=list.slice();
  const passed={};
  await Promise.all(Array.from({length:Math.min(6,queue.length)},async()=>{ while(queue.length){ const id=queue.shift(); const st=await probe(id); if(st&&st.ok) passed[id]=st.ms; } }));
  // remember what verifiably answers on this provider+key; the model list
  // floats those to the top so a working model is always one glance away
  const st=S().settings; st.verified=st.verified||{}; const v=Object.assign({}, st.verified[pv]);
  for(const id of list) delete v[id];
  Object.assign(v, passed);
  st.verified[pv]=v; await Store.save();
  populateModelSelect();
  if(sum) sum.textContent=`${pass} of ${list.length} models answered with ${keyless?"this endpoint":"your key"}. Passes show latency; tap Use to pick one.`;
  audit("settings",`Model tester: ${pass}/${list.length} answered on ${prov.name}`);
});
function syncProviderUI(){
  const pv = $("#setprovider").value;
  const prov = PROVIDERS[pv] || PROVIDERS.openrouter;
  $("#setkey").placeholder = prov.keyPh;
  $("#keyhint").innerHTML = prov.hintHtml ? prov.hintHtml : prov.edge
    ? 'the EDGE//AI app runs the model in a hidden frame on this device. <a href="https://aeiouvcode.github.io/edge-ai/" target="_blank" rel="noopener">Open EDGE//AI</a> to unlock it and load a chat model - Muse never downloads or switches models on its own.'
    : String(prov.hint||"").replace(/</g,"&lt;");
  const isLocal = !!prov.local, isNim = !!prov.nim, keyless = (isLocal || !!prov.edge || !!prov.builtin) && !isNim;
  $("#localurlwrap").hidden = !(isLocal || isNim);
  if(isNim){
    $("#localurlwrap label").textContent = "NIM endpoint base URL";
    $("#setlocalurl").placeholder = "http://localhost:8000/v1";
    $("#localurlwrap .small").textContent = "Self-hosted NIM containers listen on 8000 by default. Hosted integrate.api.nvidia.com is browser-locked to build.nvidia.com - a hosted key cannot work here.";
    $("#setlocalurl").value = S().settings.nimUrl || "";
    $("#setkey").disabled = false;
    $("#setsavekey").disabled = false;
    $("#keylabel").textContent = "API key (optional - only if your NIM endpoint asks for one; a local container needs none)";
  } else if(isLocal){
    $("#localurlwrap label").textContent = "Local server base URL";
    $("#setlocalurl").placeholder = "http://localhost:11434/v1";
    $("#localurlwrap .small").textContent = "Ollama listens on 11434, LM Studio on 1234. The model list refresh reads what your server has.";
  }
  $("#setkey").disabled = keyless;
  $("#setsavekey").disabled = keyless;
  if(!isNim) $("#keylabel").textContent = keyless
    ? (prov.edge ? "No API key - EDGE//AI runs the model on this device" : prov.builtin ? "No API key - the built-in engine runs the model on this device" : "No API key - a local model runs on this machine and prompts never leave it")
    : "API key (stored in this browser only, sent only to your provider)";
  if(isLocal) $("#setlocalurl").value = S().settings.localUrl || "http://localhost:11434/v1";
  renderEngine();
}
function renderEngine(){
  const wrap=$("#enginewrap"); if(!wrap) return;
  const prov=PROVIDERS[($("#setprovider")||{}).value]||{};
  wrap.hidden=!prov.builtin;
  if(!prov.builtin) return;
  const st=$("#enginestate"), model=(S()&&S().settings.model)||"";
  if(LocalEngine.loadedModel){
    st.innerHTML="Loaded: <b>"+esc(LocalEngine.loadedModel.split("/").pop())+"</b> on "+esc(LocalEngine.device||"this device")+(LocalEngine.dtype?" ("+esc(LocalEngine.dtype)+")":"");
    $("#engineunload").hidden=false; $("#engineload").textContent="Reload"; $("#enginebench").hidden=false;
    renderEngineBench();
  } else {
    st.textContent=model&&ENGINE_MODELS.some(m=>m.id===model)?("Picked: "+model.split("/").pop()+" - not loaded yet."):"Pick a model above, then load it here.";
    $("#engineunload").hidden=true; $("#engineload").textContent="Load model"; $("#enginebench").hidden=true;
  }
}

/* ---------------- on-device benchmark ----------------
   Answers "which small model should I run" with this device's own evidence:
   a fixed battery against the loaded model - speed (time to first token,
   tokens/sec) plus three behavior checks (exact instruction, arithmetic,
   JSON shape). Results persist per model in settings.bench and show in the
   engine panel, so the default-model choice is measured, not folklore.
   Numbers are this device's own - WASM and WebGPU differ by a lot. */
const BENCH = [
  { id:"exact", label:"follows an exact instruction", max:12,
    msgs:[{role:"user",content:"Reply with exactly this token and nothing else: BENCH-OK"}],
    check:t=>/BENCH-OK/.test(t) },
  { id:"math", label:"does arithmetic", max:12,
    msgs:[{role:"user",content:"What is 17+25? Reply with just the number."}],
    check:t=>/\b42\b/.test(t) },
  { id:"json", label:"emits a clean JSON shape", max:24,
    msgs:[{role:"user",content:'Reply with only this JSON object and nothing else: {"ok":true}'}],
    check:t=>{ try{ const m=t.match(/\{[\s\S]*\}/); return !!(m && JSON.parse(m[0]).ok===true); }catch(e){ return false; } } },
  { id:"speed", label:"generation speed", max:80,
    msgs:[{role:"user",content:"In two short sentences, why is the sky blue?"}],
    check:null },
];
async function benchRun(){
  const out=$("#enginebenchout"), btn=$("#enginebench");
  if(!LocalEngine.loadedModel){ out.innerHTML='<div class="small" style="font-size:12px;color:var(--dim)">Load a model first - the benchmark measures the loaded one.</div>'; return; }
  btn.disabled=true;
  const model=LocalEngine.loadedModel, device=LocalEngine.device||"wasm", dtype=LocalEngine.dtype||"";
  const res={ model, device, dtype, ts:nowISO(), checks:{}, tFirst:0, tokPerSec:0 };
  let done=0;
  const paint=()=>{ out.innerHTML='<div class="small" style="font-size:12px;color:var(--dim)">Benchmarking '+esc(model.split("/").pop())+' on '+esc(device)+' - '+done+' of '+BENCH.length+' checks...</div>'; };
  paint();
  for(const b of BENCH){
    let first=0, chunks=0, acc=""; const t0=performance.now();
    try{
      const t=await LocalEngine.infer(b.msgs, { stream:true, maxTokens:b.max, onTok:a=>{ if(!first) first=performance.now()-t0; chunks++; acc=a; } });
      const txt=String(t||acc||"");
      if(b.id==="speed"){
        const wall=(performance.now()-t0)/1000;
        res.tFirst=Math.round(first||wall*1000);
        res.tokPerSec=Math.round(chunks/wall*10)/10;
        res.checks.speed={pass:true, detail:res.tokPerSec+" tok/s, first token in "+res.tFirst+" ms"};
      } else {
        const pass=!!b.check(txt);
        res.checks[b.id]={pass, detail: pass ? "pass" : "said: "+txt.trim().slice(0,60)};
      }
    }catch(e){ res.checks[b.id]={pass:false, detail:"error: "+humanError(e, "the check itself errored")}; }
    done++; paint();
  }
  const s=S(); s.settings.bench=Object.assign({}, s.settings.bench, {[model]:res}); await Store.save();
  await audit("engine", "Benchmarked "+model.split("/").pop()+" on "+device+": "+(res.tokPerSec||"?")+" tok/s, "+BENCH.filter(b=>b.check).map(b=>((res.checks[b.id]&&res.checks[b.id].pass)?"✓":"✕")+b.id).join(" "));
  btn.disabled=false; renderEngineBench();
}
function renderEngineBench(){
  const out=$("#enginebenchout"); if(!out) return;
  const b=((S()&&S().settings.bench)||{})[LocalEngine.loadedModel];
  if(!b){ out.innerHTML=""; return; }
  const rows=BENCH.map(x=>{ const c=b.checks[x.id]; if(!c) return "";
    return '<div class="small" style="font-size:12px;color:var(--dim)">'+(c.pass?"✓ ":"✕ ")+esc(x.label)+(c.detail?' <span style="color:var(--dim2)">- '+esc(c.detail)+"</span>":"")+"</div>"; }).join("");
  out.innerHTML='<div class="small" style="font-size:12px;color:var(--dim);margin-top:6px">Benchmark on this device ('+esc(b.device+(b.dtype?", "+b.dtype:""))+", "+new Date(b.ts).toLocaleDateString()+"):</div>"+rows
    +'<div class="small" style="font-size:11.5px;color:var(--dim2);margin-top:4px">These numbers are this device\'s own - WASM vs WebGPU differ by a lot. Load another model and re-run to compare them head to head.</div>';
}
$("#enginebench").addEventListener("click", benchRun);

/* ---------------- voice input ----------------
   Dictation via the browser's own speech service (Web Speech API). Honest
   by construction: the button exists only where the API does, the copy says
   transcription leaves the page for the browser's speech service, and every
   state - listening, denied, unsupported - says what is actually true. */
const Voice = (()=>{
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec=null, listening=false, base="";
  function supported(){ return !!SR; }
  function stop(){ if(rec && listening){ try{ rec.stop(); }catch(e){} } }
  function paint(){
    const b=$("#micbtn"); if(!b) return;
    b.classList.toggle("listening", listening);
    b.title = listening ? "Listening - tap to stop" : "Dictate - transcription uses this browser's speech service";
  }
  function toggle(){
    if(!SR) return;
    if(listening){ stop(); return; }
    const inp=$("#chatinput");
    rec = new SR();
    rec.continuous = true; rec.interimResults = true;
    rec.lang = (navigator.language||"en-US");
    base = inp.value ? inp.value.replace(/\s+$/,"")+" " : "";
    rec.onresult = (e)=>{
      let final="", interim="";
      for(const r of e.results){ (r.isFinal ? final+=r[0].transcript : interim+=r[0].transcript); }
      inp.value = base + final + interim;
      inp.dispatchEvent(new Event("input"));
      inp.focus();
    };
    rec.onerror = (e)=>{
      listening=false; paint();
      const why = e && e.error;
      if(why==="not-allowed"||why==="service-not-allowed") toast("Microphone access was denied - allow it in the browser's site settings to dictate.");
      else if(why==="network") toast("Dictation needs a connection - this browser transcribes speech on its own service, not on your device.");
      else if(why!=="aborted") toast("Dictation stopped: "+humanError(why, "the speech service hit a snag")+".");
    };
    rec.onend = ()=>{ listening=false; paint(); };
    try{ rec.start(); listening=true; paint(); audit("voice","Dictation started (browser speech service)"); }
    catch(e){ toast("Dictation could not start: "+humanError(e, "the speech service is unavailable")+"."); }
  }
  return { supported, toggle, stop, get listening(){ return listening; } };
})();
$("#micbtn").addEventListener("click", ()=>Voice.toggle());

/* ---------------- prompt library ----------------
   Prompts the user reaches for often, one tap into the composer. Plain local
   data like everything else; included in backups automatically. */
function renderPrompts(){
  const el=$("#promptlist"); if(!el) return;
  const list=S().prompts||[];
  el.innerHTML = list.length ? list.map(p=>
    `<div class="mtrow" style="align-items:flex-start"><span class="mtid" style="white-space:normal"><b>${esc(p.title)}</b><br><span style="color:var(--dim2);font-size:12px">${esc(p.text.slice(0,90))}${p.text.length>90?"...":""}</span></span><span class="mtuse" style="white-space:nowrap"><button class="btn" data-useprompt="${p.id}">Use</button> <button class="btn" data-delprompt="${p.id}" title="Delete">×</button></span></div>`
  ).join("") : `<div class="small" style="color:var(--dim2);font-size:12px">No saved prompts yet.</div>`;
  el.querySelectorAll("[data-useprompt]").forEach(b=>b.onclick=()=>{
    const p=(S().prompts||[]).find(x=>x.id===b.dataset.useprompt); if(!p) return;
    switchView("chat");
    const inp=$("#chatinput"); inp.value=p.text; inp.focus(); inp.dispatchEvent(new Event("input"));
  });
  el.querySelectorAll("[data-delprompt]").forEach(b=>b.onclick=async ()=>{
    S().prompts=(S().prompts||[]).filter(x=>x.id!==b.dataset.delprompt);
    await Store.save(); renderPrompts(); toast("Prompt deleted.");
  });
}
async function addPrompt(title, text){
  title=String(title||"").trim().slice(0,60); text=String(text||"").trim().slice(0,4000);
  if(!text){ toast("Nothing to save - write or compose a prompt first."); return false; }
  if(!title) title=text.split(/\n/)[0].slice(0,48);
  if(!Array.isArray(S().prompts)) S().prompts=[];
  S().prompts.unshift({id:uid("pr"), title, text, created:nowISO()});
  await Store.save(); renderPrompts(); toast("Prompt saved.");
  return true;
}
$("#promptadd").addEventListener("click", async ()=>{
  if(await addPrompt($("#prompttitle").value, $("#prompttext").value)){ $("#prompttitle").value=""; $("#prompttext").value=""; }
});
$("#promptsave").addEventListener("click", async ()=>{
  const t=($("#chatinput")||{}).value||"";
  if(await addPrompt($("#prompttitle").value, t)){ $("#prompttitle").value=""; }
});
$("#prompttext").addEventListener("keydown", e=>{ if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)){ e.preventDefault(); $("#promptadd").click(); } });

/* ---------------- backup: everything you own, one file ----------------
   Local-first only works if the data is portable. Export snapshots the whole
   store minus secrets (API keys, MCP keys, cloak originals - those never
   leave the device, so the file is safe to keep anywhere). Import shows
   exactly what it will restore, then replaces on explicit confirm. */
function backupSnapshot(){
  const data = JSON.parse(JSON.stringify(S()));
  data.settings.keyStored = "";
  data.settings.searchKey = "";
  data.settings.monidKey = "";
  (data.mcps||[]).forEach(m=>{ m.key=""; });
  data.cloak = { on: !!(data.cloak&&data.cloak.on), rules: [] };   // originals stay on this device
  return { app:"open-muse", format:1, exportedAt:nowISO(), data };
}
function backupCounts(d){
  const c=[];
  const n=(x,w)=>{ if(x) c.push(x+" "+w+(x===1?"":"s")); };
  n((d.convos||[]).length+(d.chat&&d.chat.length?1:0)||0, "chat");
  n((d.goals||[]).length, "goal");
  n((d.habits||[]).length, "habit");
  n((d.memory||[]).length, "memory note");
  n((d.agents||[]).length, "agent");
  n((d.automations||[]).length, "automation");
  n((d.customTools||[]).length, "custom tool");
  n((d.miniapps||[]).length, "studio app");
  n((d.mcps||[]).length, "MCP server");
  n((d.tasks||[]).length, "task");
  n((d.prompts||[]).length, "saved prompt");
  n(Object.keys(d.drafts||{}).length, "draft");
  return c.length ? c.join(", ") : "settings only";
}
$("#backupexport").addEventListener("click", async ()=>{
  const snap = backupSnapshot();
  const blob = new Blob([JSON.stringify(snap, null, 1)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "open-muse-backup-"+snap.exportedAt.slice(0,10)+".json";
  a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
  await audit("backup", "Exported backup ("+backupCounts(snap.data)+")");
  const out=$("#backupout"); if(out) out.innerHTML='<div class="small" style="font-size:12px;color:var(--dim)">Exported: '+esc(backupCounts(snap.data))+'. Keys and cloak originals stayed on this device.</div>';
});
$("#backupimport").addEventListener("click", ()=> $("#backupfile").click());
$("#backupfile").addEventListener("change", async (e)=>{
  const f = e.target.files && e.target.files[0]; e.target.value="";
  const out=$("#backupout");
  if(!f) return;
  let snap=null;
  try{ snap = JSON.parse(await f.text()); }catch(_){}
  if(!snap || snap.app!=="open-muse" || !snap.data || typeof snap.data!=="object"){
    out.innerHTML='<div class="small" style="font-size:12px;color:#a33">That file is not an Open Muse backup - nothing was changed.</div>'; return;
  }
  out.innerHTML='<div class="small" style="font-size:12px;color:var(--dim)">This backup ('+esc((snap.exportedAt||"").slice(0,10)||"unknown date")+') restores: <b>'+esc(backupCounts(snap.data))+'</b>. Importing replaces everything currently here.</div>'
    +'<div style="display:flex;gap:8px;margin-top:8px"><button class="btn pri" id="backupgo">Replace everything</button><button class="btn" id="backupcancel">Cancel</button></div>';
  $("#backupcancel").onclick=()=>{ out.innerHTML='<div class="small" style="font-size:12px;color:var(--dim)">Import cancelled - nothing was changed.</div>'; };
  $("#backupgo").onclick=async ()=>{
    const fresh = Object.assign(Store.default(), snap.data);
    fresh.settings = Object.assign(Store.default().settings, snap.data.settings||{}, { keyStored:"", searchKey:"", monidKey:"" });
    if(!Array.isArray(fresh.convos)) fresh.convos=[];
    Store.raw = fresh;
    await Store.save();
    await audit("backup", "Imported backup from "+((snap.exportedAt||"").slice(0,10)||"unknown date")+" ("+backupCounts(snap.data)+")");
    renderAll();
    out.innerHTML='<div class="small" style="font-size:12px;color:var(--dim)">Backup restored: '+esc(backupCounts(snap.data))+'. Add your keys again in Settings - they are never part of a backup.</div>';
    toast("Backup restored.");
  };
});
$("#engineload").addEventListener("click", async ()=>{
  const custom=(($("#enginecustom")||{}).value||"").trim();
  const model= custom && /^[\w.-]+\/[\w.-]+$/.test(custom) ? custom : ((S().settings.model&&ENGINE_MODELS.some(m=>m.id===S().settings.model))?S().settings.model:ENGINE_MODELS[0].id);
  if(!custom){ S().settings.model=model; await Store.save(); }
  const prog=$("#engineprog"), btn=$("#engineload");
  btn.disabled=true;
  LocalEngine.onProgress=(d)=>{
    const mb=d.total?(" - "+Math.round(d.loaded/1048576)+" of "+Math.round(d.total/1048576)+" MB"):"";
    prog.innerHTML='<div class="small" style="font-size:12px;color:var(--dim)">'+esc(d.file?("Fetching "+d.file.split("/").pop()+mb):"Preparing...")+'</div><div class="ebar"><div style="width:'+(d.progress||0)+'%"></div></div>';
  };
  try{
    const r=await LocalEngine.load(model,"auto");
    prog.innerHTML='<div class="small" style="font-size:12px;color:var(--dim)">Ready on '+esc(r.device||"this device")+'.</div>';
    toast("On-device model ready.");
    await audit("engine","Loaded on-device model "+model+" on "+(r.device||"unknown"));
  }catch(e){
    prog.innerHTML='<div class="small" style="font-size:12px;color:#a33">'+esc(friendlyModelError(e))+'</div>';
  }finally{
    btn.disabled=false; LocalEngine.onProgress=null; renderEngine(); renderStatus();
  }
});
$("#engineunload").addEventListener("click", ()=>{ if(LocalEngine.worker) LocalEngine.worker.postMessage({type:"unload"}); const prog=$("#engineprog"); if(prog) prog.innerHTML=""; });
$("#setprovider").addEventListener("change", ()=>{ syncProviderUI(); populateModelSelect(); });
$("#refreshmodels").addEventListener("click", populateModelSelect);
$("#savesettings").addEventListener("click", async ()=>{
  const k=$("#setkey").value.trim(), m=$("#setmodel").value, p=$("#setpass").value;
  const pv=$("#setprovider").value, remember=$("#setsavekey").checked;
  let modelNote="";
  const isLocal = pv==="local";
  S().settings.provider = pv;
  const isNim = pv==="nim";
  if(isLocal || isNim){
    const dflt = isLocal ? "http://localhost:11434/v1" : "http://localhost:8000/v1";
    const base=$("#setlocalurl").value.trim() || dflt;
    if(!/^https?:\/\/[\w.:\/-]+$/.test(base)){ toast("Endpoint URL looks wrong - e.g. "+dflt); return; }
    if(isLocal) S().settings.localUrl = base; else S().settings.nimUrl = base;
  }
  if(k && !isLocal){
    sessionStorage.setItem("openmuse.key", k);
    S().settings.hasKey=true;
    if(remember) S().settings.keyStored = k;
  }
  if(!remember) S().settings.keyStored = "";
  const custom = (isLocal || isNim) ? $("#setmodelcustom").value.trim() : "";
  const chosen = custom || m;
  if(chosen && !/^[\w.:/-]{1,100}$/.test(chosen)){ toast("Model id has invalid characters."); return; }
  S().settings.model = chosen;  // blank = provider default
  if(isLocal || isNim) $("#setmodelcustom").value = "";
  // with a fresh key, trust the provider's live catalog over any remembered or
  // fallback model id - ids get retired, the catalog knows what exists today
  if(k && !isLocal && !isNim && pv!=="edge"){
    const ids = await fetchCatalog(pv);
    if(ids && ids.length){
      const cur = S().settings.model || PROVIDERS[pv].defModel;
      if(!ids.includes(cur)){
        const pick = ids.find(id=>/flash/i.test(id)) || ids[0];
        S().settings.model = pick;
        modelNote = " Model set to " + pick + " from the provider's live catalog.";
      }
    }
  }
  if(p){
    if(p.length < 8){ toast("Passphrase needs at least 8 characters."); return; }
    $("#setpass").value = "";
    await Store.lock(p); $("#vmstate").className="pill ok"; $("#vmstate").innerHTML='<span class="d"></span>encrypted'; $("#vmdesc").textContent="Store is AES-GCM encrypted with a key only your passphrase derives."; }
  $("#setkey").value = "";
  await Store.save(); renderStatus();
  await audit("settings","Settings updated");
  toast("Saved." + modelNote);
});
$("#ms-close").addEventListener("click", async ()=>{ S().settings.statusStrip=false; await Store.save(); renderStatus(); toast("Status strip hidden - turn it back on in Settings."); });
$("#setstrip").addEventListener("change", async ()=>{ S().settings.statusStrip = $("#setstrip").checked; await Store.save(); renderStatus(); });
$("#locknowbtn").addEventListener("click", manualLock);
$("#cloakon").addEventListener("change", async ()=>{
  Cloak.box().on = $("#cloakon").checked;
  await audit("cloak", "Privacy cloak " + ($("#cloakon").checked ? "enabled" : "disabled"));
  await Store.save(); renderCloak(); renderStatus();
  toast($("#cloakon").checked ? "Cloak on - outbound calls are scrubbed and un-swapped on reply." : "Cloak off - prompts go out exactly as written.");
});
$("#cloakadd").addEventListener("click", async ()=>{
  const real=$("#cloakreal").value.trim(), twin=$("#cloaktwin").value.trim();
  if(!real){ toast("Enter the real value to cloak."); return; }
  const r=Cloak.ensure(real, "custom", false);
  if(twin){
    if(Cloak.rules().some(x=>x!==r && x.twin===twin)){ toast("That twin is already taken - pick another."); return; }
    r.twin=twin; r.auto=false;
  }
  $("#cloakreal").value=""; $("#cloaktwin").value="";
  await audit("cloak","Added a cloak rule");
  await Store.save(); renderCloak(); renderStatus();
  toast("Cloaked: it becomes \u201c"+r.twin+"\u201d on every outbound call.");
});
$("#cloakreal").addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); $("#cloakadd").click(); } });
$("#addhabitbtn").addEventListener("click", async ()=>{
  if(!S()) return;
  const name=$("#newhabit").value.trim().slice(0,80), cadence=$("#newhabitcad").value;
  if(!name){ toast("Name the habit first."); return; }
  if((S().habits||[]).some(h=>h.name.toLowerCase()===name.toLowerCase())){ toast("That habit already exists."); return; }
  S().habits.push({id:uid("hb"), name, cadence, created:nowISO(), checks:[]});
  $("#newhabit").value="";
  await audit("habit", `New ${cadence} habit: "${name}"`);
  await Store.save(); renderHabits(); toast("Habit added - check in when you do it.");
});
$("#newhabit").addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); $("#addhabitbtn").click(); } });
$("#exportbtn").addEventListener("click", async ()=>{
  if(Store.locked && Store.passKey){
    // E2EE export: same AES-GCM envelope as the at-rest store; only your passphrase opens it
    const iv = crypto.getRandomValues(new Uint8Array(12));
    // encrypt under the already-derived session key; the salt of the at-rest store travels
    // with the export so the same passphrase re-derives the key on import
    const payload = {enc:1, v:1, kind:"open-muse-export", salt: Store._cipher.salt, iv: btoa(String.fromCharCode(...iv)), data:""};
    const ct = await crypto.subtle.encrypt({name:"AES-GCM", iv}, Store.passKey, new TextEncoder().encode(JSON.stringify(S())));
    let bin=""; const a8=new Uint8Array(ct); for(let i=0;i<a8.length;i+=0x8000) bin+=String.fromCharCode(...a8.subarray(i,i+0x8000));
    payload.data = btoa(bin);
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="open-muse-export.encrypted.json"; a.click();
    await audit("settings","Encrypted export downloaded (AES-GCM, passphrase-derived key)");
    toast("Encrypted export downloaded - only your passphrase opens it.");
  } else {
    openModal(`<h3>Export is unencrypted</h3><div class="sub">No passphrase is set, so this export is plain JSON anyone can read. Set a Personal VM passphrase to make exports end-to-end encrypted.</div>
    <div class="row"><button class="btn modal-cancel">Cancel</button><button class="btn pri" id="plainexp">Export anyway</button></div>`);
    $("#plainexp").onclick=async ()=>{
      const blob=new Blob([JSON.stringify(S(),null,2)],{type:"application/json"});
      const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="open-muse-export.json"; a.click();
      closeModal(); await audit("settings","Unencrypted export downloaded");
    };
  }
});
$("#wipeallbtn").addEventListener("click", async ()=>{
  openModal(`<h3>Erase everything?</h3><div class="sub">Chat, goals, memory, audit and settings are wiped from this browser. There is no copy anywhere else - that is the point of Open Muse.</div>
  <div class="row"><button class="btn modal-cancel">Cancel</button><button class="btn badb" id="yeswipe">Erase</button></div>`);
  $("#yeswipe").onclick=()=>{ Store.wipe(); sessionStorage.clear(); location.reload(); };
});
$("#wipemembtn").addEventListener("click", async ()=>{
  S().memory=[]; await audit("memory","All memories forgotten on request"); await Store.save(); renderMemory(); renderStatus(); toast("All memories forgotten.");
});
$("#newgoalbtn").addEventListener("click", ()=>{
  openModal(`<h3>New goal</h3><div class="sub">Add optional steering and a due date. Both ride the plan from the start.</div><div class="field"><label>Goal</label><input id="ngoal" placeholder="e.g. train for a 10k in 10 weeks"></div><div class="field"><label>Steering note</label><textarea id="nsteer" rows="2" maxlength="500" placeholder="Constraints, style, budget, or what to avoid"></textarea></div><div class="field"><label>Due date</label><input id="ndue" type="date"></div><div class="row"><button class="btn modal-cancel">Cancel</button><button class="btn pri" id="gogoal">Plan it</button></div>`);
  $("#gogoal").onclick=async ()=>{ const v=$("#ngoal").value.trim(); if(!v)return; const note=$("#nsteer").value.trim(),due=$("#ndue").value; closeModal(); await createGoal(v.charAt(0).toUpperCase()+v.slice(1),{note,due}); };
});
$("#exportmd").onclick=async()=>{ downloadText("open-muse-goals.md","text/markdown",goalsMarkdown()); await audit("goal","Exported goals as Markdown"); toast("Markdown export downloaded."); };
$("#exportchatbtn").onclick=async()=>{
  const s=S(); if(!s) return;
  if(!s.chat.length){ toast("Nothing to export yet - say something first."); return; }
  const lines=["# Open Muse conversation","","Exported "+new Date().toLocaleString()+". This file came from your browser - it was never sent anywhere.","","---",""];
  s.chat.forEach(m=>{
    if(m.kind==="card") return;
    if(m.kind==="tool"){ const [t,r]=m.text.split("|||"); lines.push("**\u2699 "+t+"**","",r,""); return; }
    const who=m.role==="user"?"**You**":m.role==="sys"?"_system_":"**Muse**";
    lines.push(who+"  \u00b7  "+fmtT(m.ts),"",m.text,"");
  });
  downloadText("open-muse-chat.md","text/markdown",lines.join("\n"));
  await audit("chat","Exported conversation as Markdown"); toast("Conversation export downloaded.");
};
$("#exportcsv").onclick=async()=>{ downloadText("open-muse-goals.csv","text/csv",goalsCSV()); await audit("goal","Exported goals as CSV"); toast("CSV export downloaded."); };

/* composer */
const ta=$("#chatinput");
/* drafts: an unfinished message belongs to its chat, survives reloads and
   tab kills, and is marked in the chat list - phone browsers murder tabs. */
let draftT=null;
function restoreDraft(){
  const s=S(); if(!s) return;
  ta.value = (s.drafts && s.drafts[s.activeConvo]) || "";
  ta.style.height="auto"; ta.style.height=Math.min(ta.scrollHeight,160)+"px";
}
ta.addEventListener("input",()=>{
  ta.style.height="auto"; ta.style.height=Math.min(ta.scrollHeight,160)+"px";
  clearTimeout(draftT);
  draftT=setTimeout(()=>{
    const s=S(); if(!s) return;
    s.drafts = s.drafts||{};
    if(ta.value) s.drafts[s.activeConvo]=ta.value; else delete s.drafts[s.activeConvo];
    Store.save(); renderConvos();
  },600);
});
ta.addEventListener("keydown",e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendChat(); } });
$("#sendbtn").addEventListener("click", sendChat);


/* ---------------- modes: agent | coder ---------------- */
const mode = () => (S().settings.mode || "agent");
function applyModeUI(){
  const m = mode();
  $$(".modebtn").forEach(b=>b.classList.toggle("on", b.dataset.mode===m));
  $("#modebar").classList.toggle("coder", m==="coder");
  $("#modenote").textContent = m==="coder"
    ? "Coding agent - reads its own source, drafts diffs; patches never self-apply"
    : m==="chat"
    ? "Plain chat - just talk; Muse still remembers quietly"
    : "Personal agent";
  const mob = matchMedia("(max-width:820px)").matches;
  renderCoderWorkbench();
  $("#chatinput").placeholder = m==="coder"
    ? (mob ? "Ask Muse to change its code..." : "Ask Muse to change its own code...  (diffs go through Evolve gates + your approval)")
    : m==="chat"
    ? (mob ? "Just talk - no plans or approvals here" : "Just talk - ask anything, think out loud, no plans or approvals here")
    : (mob ? "What needs to get done?" : "Tell Muse what needs to get done...  (try: 'my goal is to run a 10k in 10 weeks')");
}
async function setMode(m){
  S().settings.mode = m;
  await Store.save();
  applyModeUI();
  await audit("mode", `Mode switched to ${m}`);
}
$$(".modebtn").forEach(b=>b.addEventListener("click", ()=>setMode(b.dataset.mode)));

let _srcCache = null;
async function ownSource(){
  if(_srcCache) return _srcCache;
  const files = {};
  for(const f of ["index.html","styles.css","app.js"]){
    try{ const r = await fetch(f); if(r.ok) files[f] = (await r.text()).slice(0, 60000); }catch(e){}
  }
  _srcCache = files; return files;
}
function coderPrompt(src){
  const listing = Object.entries(src).map(([f,c])=>`--- ${f} (${c.length} chars) ---\n${c}`).join("\n\n");
  return `You are Muse in CODER MODE - a coding agent working on Open Muse's own source, an open-source local-first personal agent web app. The full current source is included below.
How you work:
${S().coder&&S().coder.planMode ? "- PLAN MODE IS ON. Inspect and reason only. Do not emit tool calls or a patch. Return a numbered implementation plan, risks, and verification steps; wait for the user to turn Plan mode off before producing changes." : "- Execution mode is on. Work from evidence and produce a concrete change."}
- Plan in code steps: say what you will change and why, then produce the change.
- Code goes in fenced blocks with the language (\`\`\`js, \`\`\`html, \`\`\`css). When editing existing code, produce a unified diff in a \`\`\`diff block (+ / - / @@ lines) against the source below.
- Review your own diff before finishing: one short paragraph on risks and what to test. Suggest the Self-tests button after any change.
Honesty rules:
- You CANNOT apply changes. A static page cannot rewrite its deployed code. When a patch is ready, offer: "Turn this into an Evolve proposal?" - proposals pass hard gates and the user's approval, then export as a patch bundle or hand to your agent.
- Never invent files or features not in the source below. No external services beyond openrouter.ai and tokenharbor.ai. Never include API keys, tokens or secrets.
Style: clipped, precise, engineer-to-engineer. Short prose; the code does the talking.
CURRENT APP SOURCE:
${listing}`;
}

/* ---------------- Coder workspace: MiniMax Code patterns ----------------
   Adapted, not copied: resumable sessions, explicit Plan mode, context
   pressure, durable checkpoints and bounded compaction. Everything stays in
   the same encrypted Store as the rest of Open Muse. */
function coderState(){
  if(!S().coder) S().coder={planMode:false,activeSession:"main",sessions:[],archives:[],lastCheckpoint:""};
  if(!S().coder.sessions.length) S().coder.sessions=[{id:"main",name:"Main",created:nowISO(),updated:nowISO(),chat:[],checkpoint:""}];
  return S().coder;
}
function activeCoderSession(){ const c=coderState(); return c.sessions.find(x=>x.id===c.activeSession)||c.sessions[0]; }
function coderContext(){
  const chars=S().chat.filter(m=>!m.kind||m.kind==="checkpoint").reduce((n,m)=>n+String(m.text||"").length,0);
  const estimated=Math.ceil(chars/4)+12500; // own source is injected in Coder mode
  const limit=32768, pct=Math.min(100,Math.round(estimated/limit*100));
  return {estimated,limit,pct,label:pct>84?"compact now":pct>66?"getting full":pct>40?"in use":"fresh"};
}
function checkpointText(){
  const recent=S().chat.filter(m=>!m.kind||m.kind==="checkpoint").slice(-10);
  const asks=recent.filter(m=>m.role==="user").slice(-3).map(m=>String(m.text).replace(/\s+/g," ").slice(0,120));
  const replies=recent.filter(m=>m.role==="muse").slice(-2).map(m=>String(m.text).replace(/```[\s\S]*?```/g,"[code]").replace(/\s+/g," ").slice(0,150));
  const diff=[...S().chat].reverse().find(m=>m.role==="muse" && /```diff[\s\S]*?```/.test(String(m.text||"")));
  return [asks.length?"Recent asks: "+asks.join(" / "):"No recent ask",replies.length?"Muse: "+replies.join(" / "):"No answer yet",diff?"A draft diff is present and still needs review/testing.":"No draft diff in the recent transcript."].join(" ");
}
async function saveCoderSession(){
  const x=activeCoderSession(); if(!x)return; x.chat=JSON.parse(JSON.stringify(S().chat)); x.updated=nowISO(); await Store.save();
}
function renderCoderWorkbench(){
  const bench=$("#coderbench"); if(!bench||!S())return;
  const coder=mode()==="coder"; bench.hidden=!coder;
  const c=coderState(), x=activeCoderSession(), q=coderContext();
  $("#coderplan").classList.toggle("on",!!c.planMode); $("#coderplan").setAttribute("aria-pressed",String(!!c.planMode));
  $("#coderplan small").textContent=c.planMode?"inspect only; execution paused":"inspect first, then execute";
  $("#codersessionname").textContent=x?x.name:"Main";
  $("#codercontextbar").style.width=q.pct+"%"; $("#codercontexttext").textContent=q.pct+"%"; $("#codercontextnote").textContent=q.label;
  $("#coderresume").textContent=(x&&x.checkpoint)||c.lastCheckpoint||"No checkpoint yet. Muse will preserve decisions, changed files and next steps locally.";
}
async function createCoderCheckpoint(quiet){
  const c=coderState(), x=activeCoderSession(), text=checkpointText(); x.checkpoint=text; c.lastCheckpoint=text; x.updated=nowISO();
  if(!quiet) await addMsg("sys","Checkpoint saved locally. "+text,"checkpoint");
  await saveCoderSession(); renderChat(); renderCoderWorkbench(); if(!quiet) toast("Coder checkpoint saved.");
}
async function compactCoderContext(){
  const c=coderState(), x=activeCoderSession(); if(S().chat.length<=14){ toast("Context is already lean."); return; }
  const old=S().chat.slice(0,-12), keep=S().chat.slice(-12), summary=checkpointText();
  c.archives.unshift({id:uid("arc"),sessionId:x.id,ts:nowISO(),messages:old,summary}); if(c.archives.length>12)c.archives.length=12;
  S().chat=[{role:"sys",text:"Earlier work compacted into an encrypted local checkpoint. "+summary,ts:nowISO(),kind:"checkpoint"},...keep];
  x.checkpoint=summary; c.lastCheckpoint=summary; await saveCoderSession(); renderChat(); renderCoderWorkbench(); await audit("coder",`Compacted ${old.length} messages into a local checkpoint`); toast("Older context compacted; full copy kept locally.");
}
function openCoderSessions(){
  const c=coderState(); openModal(`<h3>Coder sessions</h3><div class="sub">Resume a focused coding thread. Sessions and archived context stay inside your encrypted local store.</div><div class="sessionlist">${c.sessions.map(x=>`<button class="btn" data-csess="${esc(x.id)}"><b>${esc(x.name)}</b><br><span class="small">${x.id===c.activeSession?"active · ":""}${fmtD(x.updated||x.created)}</span></button>`).join(" ")}</div><div class="field"><label>New session</label><input id="newcsname" maxlength="40" placeholder="e.g. mobile navigation fix"></div><div class="row"><button class="btn modal-cancel">Close</button><button class="btn pri" id="newcsbtn">Create clean session</button></div>`);
  $$('[data-csess]').forEach(b=>b.onclick=async()=>{ await saveCoderSession(); c.activeSession=b.dataset.csess; S().chat=JSON.parse(JSON.stringify(activeCoderSession().chat||[])); closeModal(); await Store.save(); renderAll(); });
  $("#newcsbtn").onclick=async()=>{ const n=$("#newcsname").value.trim()||"Untitled session"; await saveCoderSession(); const x={id:uid("sess"),name:n,created:nowISO(),updated:nowISO(),chat:[],checkpoint:""}; c.sessions.unshift(x); c.activeSession=x.id; S().chat=[]; closeModal(); await Store.save(); renderAll(); };
}
$("#coderplan").onclick=async()=>{ const c=coderState(); c.planMode=!c.planMode; await Store.save(); renderCoderWorkbench(); await audit("coder",`Plan mode ${c.planMode?"enabled":"disabled"}`); };
$("#codersessions").onclick=openCoderSessions;
$("#codercheckpoint").onclick=()=>createCoderCheckpoint(false);
$("#codercompact").onclick=compactCoderContext;

/* ---------------- evolve: recursive self-improvement ----------------
   Proposal-and-approve, honestly: Muse drafts a concrete improvement with
   the model, hard gates evaluate it, the human decides. A static Pages app
   cannot rewrite itself, so approval yields a patch bundle download or a
   structured hand-off to the user's agent. Failed attempts stay logged. */
const EVOLVE_ENGINE = "deepseek-v4.1-flash:free";   // Token Harbor :free route - the loop engine
/* Self-knowledge: what Open Muse ALREADY does. The evolve engine only ever saw
   a one-line app description, so it kept proposing features that exist (it once
   proposed theme selection with themes already shipped). Keep this list current
   whenever a capability ships - it is injected into every draft prompt. */
const APP_CAPABILITIES = [
  "Three modes: Agent (tools + goals), Chat (plain talk, tools stay silent), Coder (code/diffs, self-tests, diff-to-proposal)",
  "Goals: natural-language goal capture, model-generated plans with steps, autonomous step execution with auto-advance, human steps paused by Sentinel, Complete/Team/Swarm/Discuss/Drop actions",
  "Team mode: model-decomposed 2-4 role agents (researcher/coder/reviewer/writer) run in parallel with a live roster, then a merge pass",
  "Swarm mode: three fixed angles (research/design/red-team) on one goal, then merge",
  "Studio: Muse-built mini-apps stored in the VM, run in a sandboxed iframe (connect-src none), downloadable",
  "Memory: Mem0-style auto-learned facts with update-in-place, pinning, expiry, provenance and use counts; pinned facts ride every prompt",
  "Audit trail + worklog: full event stream with a resume card",
  "Tasks and reminders with due-time firing",
  "Tools: calc, web search, fetch page, remember, reminders, Monid trio (honestly CORS-badged), plus user-built custom tools, skills, and MCP connector entries",
  "Connectors permission model (email/cal/files/web/pay scopes gating plans)",
  "Approvals: Sentinel pauses sensitive steps; approval cards persist resolved state across reloads",
  "Personal VM: local IndexedDB store, optional AES-GCM at rest with PBKDF2 passphrase, 15-minute idle auto-lock, manual Lock now, encrypted export/import, full wipe",
  "Appearance: four themes (serious/violet/ember/paper), density, font size - user-selectable in Settings",
  "Model providers: Gemini (free tier, browser-direct OpenAI-compatible endpoint), OpenRouter, Token Harbor (live catalog with free-model listing, key in session or encrypted on device), and Local - Ollama/LM Studio over a user-set localhost OpenAI-compatible endpoint, no key, prompts never leave the device",
  "Privacy cloak: optional AgentCloak-style layer - before any outbound model call, structured PII (emails, phones, card/ID numbers) is auto-detected and user-taught values are swapped for consistent synthetic twins; replies are un-swapped before display; twins stored locally/encrypted, audit logs counts only",
  "On-device engine: EDGE//AI bridge - sibling static app (same origin) runs inference in a hidden frame over postMessage RPC, no key, offline after model download",
  "Habits: daily/weekly habits with check-ins and honest streaks (a missed period resets the count, no freebies), due pill in nav, evening proactive nudge, ISO-week buckets for weekly habits",
  "Evolve itself: proposal drafting, hard gates (storage + encryption roundtrip, key configured, schema, size, app-file targets, secret scan, external-call allowlist), approve/reject with persistence, patch-bundle export, handoff to your agent",
  "Mobile layout: hamburger nav, safe-area composer, dismissible status strip showing working state and queue",
  "Proactivity: stale-step follow-ups and suggestions surfaced in chat"
];
const EVOLVE_HOSTS = ["openrouter.ai","tokenharbor.ai","generativelanguage.googleapis.com"];
const EVO_SECRET_RES = [ /thk_live_[A-Za-z0-9]{6,}/, /sk-or-[A-Za-z0-9._-]{6,}/, /\bsk-[A-Za-z0-9]{20,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/, /BEGIN [A-Z ]*PRIVATE KEY/, /(?:password|passwd|api[_-]?key|secret)\s*[:=]\s*["'][^"'\s]{8,}/i ];

async function runSelfTests(){
  const out = [];
  try{ const k="openmuse.selftest"; localStorage.setItem(k,"1"); const ok=localStorage.getItem(k)==="1"; localStorage.removeItem(k); out.push({name:"storage roundtrip",pass:ok}); }
  catch(e){ out.push({name:"storage roundtrip",pass:false,note:humanError(e)}); }
  try{
    const k=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},k,new TextEncoder().encode("muse"));
    const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv},k,ct);
    out.push({name:"AES-GCM roundtrip",pass:new TextDecoder().decode(pt)==="muse"});
  }catch(e){ out.push({name:"AES-GCM roundtrip",pass:false,note:humanError(e)}); }
  out.push({name:"model key configured",pass:Broker.has("model"),note:Broker.has("model")?"":"add a key in Settings to draft proposals"});
  // fleet surface standards: favicon, real title + meta description, decent
  // 404 on Pages, no placeholder text, and proof stack traces stay off screen
  try{
    out.push({name:"favicon present",pass:!!document.querySelector('link[rel="icon"]')});
    const t=document.title||"";
    out.push({name:"real page title",pass:t.length>3 && !/untitled/i.test(t),note:t.slice(0,60)});
    const md=document.querySelector('meta[name="description"]');
    out.push({name:"meta description",pass:!!(md && (md.getAttribute("content")||"").length>40)});
    out.push({name:"no placeholder text in the UI",pass:!/lorem ipsum|coming soon/i.test(document.body?document.body.innerText:"")});
    const stacky=new Error("boom\n    at Object.x (app.js:1:1)\n    at y (worker.js:2:2)");
    out.push({name:"errors never show stack traces",pass:!/ at \w+ \(|\.js:\d+/.test(humanError(stacky)),note:humanError(stacky).slice(0,60)});
    if(/(^|\.)github\.io$|(^|\.)pages\.dev$/.test(location.hostname)){
      const r=await fetch("./404.html",{cache:"no-store"});
      out.push({name:"404 page served",pass:r.ok && /not here|not found/i.test(await r.text())});
    } else out.push({name:"404 page (off Pages)",pass:true,note:"checked on the deployed site"});
  }catch(e){ out.push({name:"surface standards",pass:false,note:humanError(e)}); }
  return out;
}

function proposalGates(p){
  const chg = Array.isArray(p.changes) ? p.changes : [];
  const gates = [
    {name:"schema: title + rationale + at least one change", pass: !!(p.title && p.rationale && chg.length)},
    {name:"size: max 8 changes, patch <= 20000 chars", pass: chg.length<=8 && chg.every(c=>(c.patch||"").length<=20000)},
    {name:"targets only app files (index.html / app.js / styles.css / README.md)", pass: chg.every(c=>/^(index\.html|app\.js|styles\.css|README\.md)$/.test(c.file||""))},
  ];
  const all = [p.title, p.rationale, ...chg.map(c=>(c.description||"")+"\n"+(c.patch||""))].join("\n");
  const hits = EVO_SECRET_RES.filter(re=>re.test(all));
  gates.push({name:"secret scan (thk_live_, sk-, ghp_, private keys, passwords)", pass:hits.length===0, note:hits.length?("matched: "+hits.map(r=>r.source).join(", ").slice(0,110)):""});
  const bad = [...new Set([...all.matchAll(/https:\/\/([a-zA-Z0-9.-]+)/g)].map(m=>m[1]))].filter(h=>!EVOLVE_HOSTS.some(x=>h===x||h.endsWith("."+x)));
  gates.push({name:"no external calls beyond allowlist (openrouter.ai, tokenharbor.ai)", pass:bad.length===0, note:bad.length?("found: "+bad.join(", ")):""});
  return gates;
}

function addEvolution(p, meta){
  const e = { id: uid("evo"), ts: nowISO(), ask: meta.ask || "", source: meta.source || "user",
    title: String(p.title||"Untitled").slice(0,140), rationale: String(p.rationale||"").slice(0,2000),
    changes: (Array.isArray(p.changes)?p.changes:[]).slice(0,8).map(c=>({file:String(c.file||"").slice(0,40), description:String(c.description||"").slice(0,500), patch:String(c.patch||"").slice(0,20000)})),
    testPlan: (Array.isArray(p.testPlan)?p.testPlan:[]).slice(0,10).map(t=>String(t).slice(0,200)),
    status: "draft", attempts: 0 };
  S().evolutions.unshift(e);
  if(S().evolutions.length > 30) S().evolutions.length = 30;
  return e;
}

async function evaluateEvolution(id){
  const e = S().evolutions.find(x=>x.id===id); if(!e) return;
  const tests = await runSelfTests();
  const gates = proposalGates(e);
  const pass = tests.every(t=>t.pass) && gates.every(g=>g.pass);
  e.eval = { at: nowISO(), tests, gates, pass };
  e.status = pass ? "evaluated" : "failed";
  if(!pass) e.attempts = (e.attempts||0) + 1;
  await audit("evolve", pass
    ? `Proposal passed all gates: "${e.title}"`
    : `Proposal FAILED gates (attempt ${e.attempts||1}): "${e.title}" - ${gates.filter(g=>!g.pass).map(g=>g.name).join("; ").slice(0,140)}`);
  await Store.save(); renderEvolutions();
}

async function draftEvolution(ask){
  if(!Broker.has("model")){ toast("Add a model key in Settings first."); switchView("settings"); return; }
  const btn=$("#evodraft"); btn.disabled=true; btn.textContent="Drafting...";
  try{
    const engine = S().settings.provider==="tokenharbor" ? EVOLVE_ENGINE : activeModel();
    const raw = await chatOnce([
      {role:"system",content:`You are the self-improvement engine of Open Muse - an open-source, local-first personal agent web app, three static files: index.html (UI shell), styles.css (dark refined theme), app.js (all logic: local store with optional AES-GCM encryption, chat, goals/plans, memory, audit trail, permissions model, model providers Gemini + OpenRouter + Token Harbor, coder mode, this evolve module).
Open Muse ALREADY HAS these capabilities - never propose any of them, a rename/restyle of them, or a near-duplicate:
${APP_CAPABILITIES.map(c=>"- "+c).join("\n")}
If the user's ask is already covered by the list, do NOT draft a proposal for it; instead title the proposal "Already shipped: <capability>" and use the rationale to point at the existing feature.
Propose ONE concrete, high-value improvement as strict JSON: {"title":"...","rationale":"...","changes":[{"file":"app.js","description":"...","patch":"unified diff or replacement snippet"}],"testPlan":["..."]}.
Hard rules: original code only; patches small and self-contained; no external services beyond openrouter.ai and tokenharbor.ai; never include API keys or secrets; files limited to index.html, app.js, styles.css, README.md.`},
      {role:"user",content: ask || "Look at the app description and propose the single highest-value improvement."}
    ], true, engine);
    let p; try{ p = JSON.parse(raw); }catch(e2){ throw new Error("model returned non-JSON"); }
    const e = addEvolution(p, {ask: ask || "(Muse picked)", source: ask ? "user" : "muse"});
    await audit("evolve", `Drafted proposal: "${e.title}" (engine: ${engine})`);
    await Store.save(); renderEvolutions();
    await evaluateEvolution(e.id);   // isolated attempt: draft -> gates immediately, failures logged
  }catch(e3){
    toast("Draft failed: "+humanError(e3, "the model could not draft that - try again"));
  }finally{ btn.disabled=false; btn.textContent="Draft proposal"; }
}

async function proposalFromChat(){
  const last = [...S().chat].reverse().find(m=>m.role==="muse" && /```/.test(m.text));
  if(!last){ toast("No code or diff in chat yet."); return; }
  if(!Broker.has("model")){ toast("Add a model key in Settings first."); return; }
  toast("Structuring proposal...");
  try{
    const raw = await chatOnce([
      {role:"system",content:`Structure this coding output into an Open Muse improvement proposal as strict JSON: {"title":"...","rationale":"...","changes":[{"file":"app.js","description":"...","patch":"unified diff or replacement snippet"}],"testPlan":["..."]}. Files limited to index.html, app.js, styles.css, README.md. No secrets, no external hosts beyond openrouter.ai and tokenharbor.ai.`},
      {role:"user",content: last.text.slice(0,24000)}
    ], true, S().settings.provider==="tokenharbor" ? EVOLVE_ENGINE : activeModel());
    const p = JSON.parse(raw);
    const e = addEvolution(p, {ask:"from a coder-mode diff", source:"coder"});
    await audit("evolve", `Coder-mode diff became proposal: "${e.title}"`);
    await Store.save(); switchView("evolve");
    await evaluateEvolution(e.id);
  }catch(e2){ toast("Could not structure that diff: "+humanError(e2, "the model returned an unreadable diff")); }
}

async function decideEvolution(id, ok){
  const e = S().evolutions.find(x=>x.id===id); if(!e) return;
  if(ok && (!e.eval || !e.eval.pass)){ toast("Gates must pass before approval."); return; }
  e.status = ok ? "approved" : "rejected";
  await logWork(`Evolve proposal "${e.title}" ${ok?"approved - patch bundle ready to hand off":"rejected"}`);
  e.decidedAt = nowISO();
  await audit("evolve", `${ok?"Approved":"Rejected"} proposal: "${e.title}"`);
  await Store.save(); renderEvolutions();
}

async function downloadBundle(id){
  const e = S().evolutions.find(x=>x.id===id); if(!e) return;
  const bundle = { app:"open-muse", kind:"evolve-proposal", created: nowISO(), approvedAt: e.decidedAt,
    proposal: { title:e.title, rationale:e.rationale, changes:e.changes, testPlan:e.testPlan },
    eval: e.eval,
    note: "Approved by the user in-app. Apply via the repo, re-run the secret scan and gates, deploy, verify live." };
  const blob = new Blob([JSON.stringify(bundle,null,2)], {type:"application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `open-muse-evolve-${e.id}.json`; a.click();
  await audit("evolve", `Patch bundle downloaded: "${e.title}"`);
}

async function agentHandoff(id){
  const e = S().evolutions.find(x=>x.id===id); if(!e) return;
  const g = e.eval ? e.eval.gates : [];
  const msg = `Open Muse improvement - I approved it in the app, please apply it.

Title: ${e.title}
Why: ${e.rationale}
Gates: ${g.filter(x=>x.pass).length}/${g.length} passed${e.eval ? ` (evaluated ${e.eval.at})` : ""}
Changes:
${e.changes.map((c,i)=>`${i+1}. ${c.file} - ${c.description}\n${c.patch}`).join("\n\n")}
Test plan: ${e.testPlan.join("; ") || "-"}

Please review, apply to aeiouvcode/open-muse, re-run the secret scan, deploy, and verify live before calling it done.`;
  let copied = false;
  try{ await navigator.clipboard.writeText(msg); copied = true; }catch(e2){}
  openModal(`<h3>Hand this to your agent</h3><div class="sub">${copied ? "Copied to your clipboard. " : ""}Paste this to your agent in chat - it reviews, applies, tests and redeploys. Nothing changes until it reports back.</div>
    <textarea readonly style="width:100%;min-height:220px;font-size:12px">${esc(msg)}</textarea>
    <div class="row"><button class="btn modal-cancel">Done</button></div>`);
  await audit("evolve", `Proposal handed to your agent: "${e.title}"`);
}

function renderEvolutions(){
  const cnt = $("#evocount"); if(cnt) cnt.textContent = S() ? S().evolutions.length : 0;
  const box = $("#evolist"); if(!box || !S()) return;
  const hint = $("#evohint");
  if(hint) hint.textContent = S().settings.provider==="tokenharbor"
    ? "Loop engine: deepseek-v4.1-flash:free (Token Harbor - :free models never charge)"
    : "Loop engine: your selected model. Switch to Token Harbor in Settings to run the loop free on deepseek-v4.1-flash:free.";
  const list = S().evolutions;
  if(!list.length){
    box.innerHTML = `<div class="small" style="color:var(--dim)">No proposals yet. Describe an improvement above - or leave it blank and let Muse pick. Failed attempts stay logged here, nothing is hidden.</div>`;
    return;
  }
  box.innerHTML = list.map(e=>{
    const pillCls = e.status==="approved"||e.status==="evaluated" ? "ok" : (e.status==="failed"||e.status==="rejected") ? "bad" : "warn";
    const evalHtml = e.eval ? `<div class="gates">${[...e.eval.tests, ...e.eval.gates].map(g=>
      `<div class="g"><span class="pill ${g.pass?"ok":"bad"}"><span class="d"></span>${g.pass?"pass":"fail"}</span><span>${esc(g.name)}${g.note?` <span style="color:var(--dim2)">- ${esc(g.note)}</span>`:""}</span></div>`).join("")}</div>` : "";
    const chgHtml = e.changes.map(c=>`<div class="chg"><b>${esc(c.file)}</b> - ${esc(c.description)}${c.patch?`<pre>${esc(c.patch)}</pre>`:""}</div>`).join("");
    let btns = "";
    if(e.status==="draft" || e.status==="failed") btns += `<button class="btn" data-evoeval="${e.id}">${e.status==="failed"?"Re-run gates":"Run gates"}</button>`;
    if(e.status==="evaluated") btns += `<button class="btn okb" data-evoapp="${e.id}">Approve</button><button class="btn badb" data-evorej="${e.id}">Reject</button>`;
    if(e.status==="approved") btns += `<button class="btn pri" data-evodl="${e.id}">Download patch bundle</button><button class="btn" data-evoinst="${e.id}">Hand to your agent</button>`;
    btns += `<button class="btn" data-evodel="${e.id}">Remove</button>`;
    return `<div class="evo">
      <h3><span class="pill ${pillCls}"><span class="d"></span>${e.status}</span> ${esc(e.title)}</h3>
      <div class="meta">${fmtD(e.ts)} - ${e.source === "coder" ? "from coder mode" : e.source === "muse" ? "Muse's own pick" : "your ask"}${e.attempts ? ` - ${e.attempts} failed attempt${e.attempts>1?"s":""}` : ""}</div>
      <div class="why">${esc(e.rationale)}</div>
      ${chgHtml}
      ${e.testPlan.length?`<div class="meta">Test plan: ${e.testPlan.map(esc).join("; ")}</div>`:""}
      ${evalHtml}
      <div class="row">${btns}</div>
    </div>`;
  }).join("");
  $$("#evolist [data-evoeval]").forEach(b=>b.onclick=()=>evaluateEvolution(b.dataset.evoeval));
  $$("#evolist [data-evoapp]").forEach(b=>b.onclick=()=>decideEvolution(b.dataset.evoapp, true));
  $$("#evolist [data-evorej]").forEach(b=>b.onclick=()=>decideEvolution(b.dataset.evorej, false));
  $$("#evolist [data-evodl]").forEach(b=>b.onclick=()=>downloadBundle(b.dataset.evodl));
  $$("#evolist [data-evoinst]").forEach(b=>b.onclick=()=>agentHandoff(b.dataset.evoinst));
  $$("#evolist [data-evodel]").forEach(b=>b.onclick=async ()=>{ const i=S().evolutions.findIndex(x=>x.id===b.dataset.evodel); if(i>=0){ S().evolutions.splice(i,1); await Store.save(); renderEvolutions(); } });
}
$("#evodraft").addEventListener("click", ()=>draftEvolution($("#evoask").value.trim().slice(0,1000)));
$("#evoself").addEventListener("click", async ()=>{
  const tests = await runSelfTests();
  openModal(`<h3>Self-tests</h3><div class="gates" style="margin-top:10px">${tests.map(t=>`<div class="g"><span class="pill ${t.pass?"ok":"bad"}"><span class="d"></span>${t.pass?"pass":"fail"}</span> ${esc(t.name)}${t.note?` <span style="color:var(--dim2)">- ${esc(t.note)}</span>`:""}</div>`).join("")}</div>
    <div class="row" style="margin-top:12px"><button class="btn modal-cancel">Close</button></div>`);
});
$("#selftestsbtn").addEventListener("click", ()=>$("#evoself").click());
$("#diff2prop").addEventListener("click", proposalFromChat);

/* tasks */
$("#addtaskbtn").addEventListener("click", async()=>{ const v=$("#newtask").value.trim(); if(!v) return; $("#newtask").value=""; await addTask(v); });
$("#newtask").addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); $("#addtaskbtn").click(); } });

/* tools view wiring */
$("#savesearch").addEventListener("click", async()=>{
  S().settings.searchProvider = $("#searchpv").value;
  const k = $("#searchkey").value.trim().slice(0,200);
  if(k) S().settings.searchKey = k;
  $("#searchkey").value = "";
  await Store.save(); renderTools();
  await audit("settings","Search settings saved");
  toast("Saved.");
});
$("#savemonid").addEventListener("click", async()=>{
  const k = $("#monidkey").value.trim().slice(0,200);
  if(k) S().settings.monidKey = k;
  $("#monidkey").value = "";
  await Store.save(); renderTools();
  await audit("settings","Monid key saved");
  toast("Saved.");
});
$("#opennet").addEventListener("change", async()=>{
  S().settings.openNetwork = $("#opennet").checked;
  applyNetPolicy();
  await audit("settings", "Open network mode "+(S().settings.openNetwork?"ON - connect policy widened to https:/wss:":"off - tight allowlist restored"));
  await Store.save();
  toast(S().settings.openNetwork ? "Open network on - Muse can fetch pages and reach MCP servers." : "Open network off.");
});
$("#addskillbtn").addEventListener("click", ()=>{
  openModal(`<h3>New skill</h3><div class="sub">A name and the workflow instructions Muse should follow when it applies.</div>
    <div class="field"><input id="nskil" placeholder="e.g. Standup writer" maxlength="60"></div>
    <div class="field"><textarea id="nskiltext" rows="4" placeholder="When writing my standup: yesterday/today/blockers, three lines max, plain tone." maxlength="1200"></textarea></div>
    <div class="row"><button class="btn modal-cancel">Cancel</button><button class="btn pri" id="goskil">Save skill</button></div>`);
  $("#goskil").onclick=async()=>{ const n=$("#nskil").value.trim(), t=$("#nskiltext").value.trim();
    if(!n||!t) return; closeModal();
    S().userSkills.push({id:uid("sk"), name:n.slice(0,60), text:t.slice(0,1200)});
    await audit("skill",`Skill added: "${n}"`); await Store.save(); renderSkills(); };
});
$("#addmcpbtn").addEventListener("click", ()=>{
  if(!S().settings.openNetwork){ toast("MCP needs open network mode - turn it on above first."); return; }
  openModal(`<h3>Add MCP server</h3><div class="sub">Remote server over HTTP (streamable transport). It must answer browser cross-origin requests - local stdio servers cannot work from any web page.</div>
    <div class="field"><input id="nmcp" placeholder="name" maxlength="40"></div>
    <div class="field"><input id="nmcpurl" placeholder="https://.../mcp" maxlength="200"></div>
    <div class="field"><input id="nmcpkey" type="password" placeholder="auth token (optional - stays in your VM)" maxlength="200"></div>
    <div class="row"><button class="btn modal-cancel">Cancel</button><button class="btn pri" id="gomcp">Add &amp; discover</button></div>`);
  $("#gomcp").onclick=async()=>{ const n=$("#nmcp").value.trim(), u=$("#nmcpurl").value.trim(), k=$("#nmcpkey").value.trim();
    if(!n||!/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1))/.test(u)) { toast("Need a name and an https URL (http only for localhost)."); return; }
    closeModal();
    const srv={id:uid("mcp"), name:n.slice(0,40), url:u.slice(0,200), key:k.slice(0,200), tools:[]};
    S().mcps.push(srv); await Store.save(); renderMcps();
    try{ await mcpDiscover(srv.id); toast(`Connected - ${srv.tools.length} tools found.`); }catch(e){ toast("Added, but discovery failed: "+humanError(e, "the server did not answer")); }
  };
});
$("#buildtoolbtn").addEventListener("click", ()=>{
  openModal(`<h3>Have Muse build a tool</h3><div class="sub">Describe the tool. Muse writes the code, runs the gates and a sandbox test, then you approve it into the registry.</div>
    <div class="field"><input id="btask" placeholder="e.g. a tool that converts CSV to JSON" maxlength="200"></div>
    <div class="row"><button class="btn modal-cancel">Cancel</button><button class="btn pri" id="gobtool">Build it</button></div>`);
  $("#gobtool").onclick=async()=>{ const v=$("#btask").value.trim(); if(!v) return; closeModal();
    toast("Muse is building the tool...");
    try{ await buildCustomTool(v); }catch(e){ toast("Build failed: "+humanError(e, "the model could not build that tool")); }
  };
});

/* studio wiring */
$("#newappbtn").addEventListener("click", ()=>{
  if(!Broker.has("model")){ toast("Add a model key in Settings first."); return; }
  openModal(`<h3>New mini-app</h3><div class="sub">Describe it in a line. Muse writes a single-file app - self-contained, secret-scanned, no external calls - and keeps it in your VM.</div>
    <div class="field"><input id="nappdesc" placeholder="e.g. a pomodoro timer with session stats" maxlength="200"></div>
    <div class="row"><button class="btn modal-cancel">Cancel</button><button class="btn pri" id="gonapp">Build it</button></div>`);
  $("#gonapp").onclick=async()=>{ const v=$("#nappdesc").value.trim(); if(!v) return; closeModal();
    toast("Muse is building the app...");
    try{ const name=await genMiniApp(v); toast(`Built "${name}".`); }catch(e){ toast("Build failed: "+humanError(e, "the model could not build that app")); }
  };
});


/* ---------------- presence: the orb's state of life ---------------- */
function setPresence(state){
  const d = document.querySelector("#presence"); if(!d) return;
  d.className = "dot " + state; d.id = "presence";
  if(state==="idle") setRT({state:"idle", step:"", tool:""});
  else if(state==="thinking") setRT({state:"working", step:RT.step && RT.step!=="Thinking" ? RT.step : "Thinking", tool:""});
  else if(state==="working") setRT({state:"working", step:"Using tools"});
}

/* ---------------- tools ---------------- */
function runSandboxed(code, prelude){
  return new Promise(resolve=>{
    let worker;
    try{
      const wrapped = `${prelude||""}
const __logs=[]; const console={log:(...a)=>__logs.push(a.map(x=>{try{return typeof x==="object"?JSON.stringify(x):String(x)}catch(e){return String(x)}}).join(" "))};
Promise.resolve((async()=>{ ${code} })()).then(r=>postMessage({logs:__logs,result:(()=>{try{return typeof r==="object"?JSON.stringify(r):String(r)}catch(e){return String(r)}})()})).catch(e=>postMessage({logs:__logs,error:String(e&&e.message||e).split("\n")[0].slice(0,200)}));`;
      worker = new Worker(URL.createObjectURL(new Blob([wrapped],{type:"application/javascript"})));
    }catch(e){ resolve("sandbox unavailable: "+String(e).slice(0,80)); return; }
    const to = setTimeout(()=>{ worker.terminate(); resolve("(killed: 5 second limit)"); }, 5000);
    worker.onmessage = e=>{ clearTimeout(to); worker.terminate();
      const d = e.data||{};
      resolve((d.logs&&d.logs.length ? d.logs.join("\n")+"\n" : "") + (d.error ? "Error: "+String(d.error).slice(0,200) : "→ "+String(d.result).slice(0,1500)));
    };
    worker.onerror = e=>{ clearTimeout(to); worker.terminate(); resolve("Error: "+humanError(e.message||"script error", "the script crashed")); };
  });
}
function calcEval(expr){
  const tokens = String(expr).slice(0,200).match(/(\d+\.?\d*)|[+\-*/%^()]/g) || [];
  if(tokens.join("") !== String(expr).slice(0,200).replace(/\s/g,"")) throw new Error("numbers and + - * / % ^ ( ) only");
  let pos=0; const peek=()=>tokens[pos], next=()=>tokens[pos++];
  function pExpr(){ let v=pTerm(); while(peek()==="+"||peek()==="-"){ const op=next(), r=pTerm(); v = op==="+"? v+r : v-r; } return v; }
  function pTerm(){ let v=pPow(); while(peek()==="*"||peek()==="/"||peek()==="%"){ const op=next(), r=pPow(); v = op==="*"? v*r : op==="/"? v/r : v%r; } return v; }
  function pPow(){ let v=pUnary(); if(peek()==="^"){ next(); v=Math.pow(v,pPow()); } return v; }
  function pUnary(){ if(peek()==="-"){ next(); return -pUnary(); } return pAtom(); }
  function pAtom(){ const t=next(); if(t==="("){ const v=pExpr(); if(next()!==")") throw new Error("unbalanced parens"); return v; } const n=parseFloat(t); if(isNaN(n)) throw new Error("bad number"); return n; }
  const v = pExpr();
  if(pos!==tokens.length) throw new Error("could not parse");
  if(!isFinite(v)) throw new Error("result not finite");
  return String(Math.round(v*1e10)/1e10);
}
async function webSearch(q){
  const pv = S().settings.searchProvider || "tinyfish";
  if(!Broker.has("search")) throw new Error("needs a search API key - add one in Tools (TinyFish's key is free, no card)");
  if(pv==="tinyfish"){
    const r = await Broker.use("search", "https://api.search.tinyfish.ai?query="+encodeURIComponent(q)+"&language=en");
    if(!r.ok) throw new Error("tinyfish "+r.status);
    const j = await r.json();
    return (j.results||[]).slice(0,6).map(x=>`- ${x.title||x.url}: ${x.url}\n  ${String(x.snippet||x.content||x.description||"").slice(0,180)}`).join("\n") || "(no results)";
  }
  if(pv==="tavily"){
    const r = await Broker.use("search", "https://api.tavily.com/search", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({query:q, max_results:5})}, {bodyKey:"api_key"});
    if(!r.ok) throw new Error("tavily "+r.status);
    const j = await r.json();
    return (j.results||[]).map(x=>`- ${x.title}: ${x.url}\n  ${String(x.content||"").slice(0,180)}`).join("\n") || "(no results)";
  }
  const r = await Broker.use("search", "https://api.search.brave.com/res/v1/web/search?q="+encodeURIComponent(q)+"&count=5", {headers:{"Accept":"application/json"}});
  if(!r.ok) throw new Error("brave "+r.status);
  const j = await r.json();
  return (j.web&&j.web.results||[]).map(x=>`- ${x.title}: ${x.url}\n  ${String(x.description||"").slice(0,180)}`).join("\n") || "(no results)";
}

/* ---------------- Monid: a catalog of live data endpoints ----------------
   discover -> inspect -> run, exactly how the Monid CLI drives it, straight
   from the browser. Auth is the user's own Bearer key; runs spend their
   Monid balance, so results report cost and the tool descriptions say so. */
async function monidApi(method, path, body){
  if(!Broker.has("monid")) throw new Error("needs a Monid key - add one in Tools (app.monid.ai/access/api-keys)");
  let r;
  try{
    r = await Broker.use("monid", "https://api.monid.ai"+path, {
      method,
      headers:{"Content-Type":"application/json", "X-Monid-Client":"open-muse"},
      body: body ? JSON.stringify(body) : undefined
    });
  }catch(e){ const err = new Error("network"); err.corsBlocked = true; throw err; }
  const j = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error((j.error && j.error.message) || j.message || ("monid "+r.status));
  return j;
}
function monidCorsNote(e){
  return e && e.corsBlocked
    ? "Monid's API only answers browser calls from its own domains (app.monid.ai) - a static page on any other origin is CORS-blocked, and no app code can change that. The Monid CLI (npm i -g @monid-ai/cli) works outside the browser."
    : "Error: "+humanError(e, "that tool failed");
}

const Tools = {
  get_time:    { name:"Get time", argsHint:"{}", badge:"real", desc:"Current date and time.", run: async()=> new Date().toLocaleString() },
  calc:        { name:"Calculator", argsHint:'{"expression":"2+2*10"}', badge:"real", desc:"Arithmetic parser - no eval, numbers and operators only.",
                 run: async a=> calcEval(a.expression || a.expr || "") },
  run_js:      { name:"Run JavaScript", argsHint:'{"code":"console.log(1+1)"}', badge:"sandboxed", desc:"JS in an isolated worker - no DOM, no storage, 5s limit. A sandbox, not a real shell.",
                 run: async a=>{ if(typeof Worker==="undefined") throw new Error("this browser has no Web Workers - sandbox unavailable"); return runSandboxed(String(a.code||"").slice(0,8000)); } },
  web_search:  { name:"Web search", argsHint:'{"query":"..."}', badge:"key needed", desc:"Live web search via your own key - TinyFish (free, no card), Tavily or Brave.",
                 run: async a=> webSearch(String(a.query||"").slice(0,300)) },
  monid_discover: { name:"Monid discover", argsHint:'{"query":"flight prices"}', badge:"CORS-blocked", desc:"Search Monid's catalog of hundreds of live data endpoints. Honest limit: Monid's API refuses browser calls from any origin but its own, so this only works if Monid opens CORS - until then it reports the block instead of pretending.",
                 run: async a=>{ try{ const j=await monidApi("POST","/v1/discover",{query:String(a.query||"").slice(0,300),limit:5});
                   const arr=j.results||j.endpoints||j.data||[];
                   return arr.slice(0,5).map(e=>`- ${e.provider||"?"} ${e.endpoint||e.path||""} :: ${String(e.description||e.name||"").slice(0,120)}${e.metrics&&e.metrics.status?" ["+e.metrics.status+"]":""}`).join("\n") || JSON.stringify(j).slice(0,800);
                   }catch(e){ return monidCorsNote(e); } } },
  monid_inspect: { name:"Monid inspect", argsHint:'{"provider":"apify","endpoint":"/..."}', badge:"CORS-blocked", desc:"Read one Monid endpoint's input schema. Same browser-origin limit as Monid discover.",
                 run: async a=>{ try{ const j=await monidApi("POST","/v1/inspect",{provider:String(a.provider||"").slice(0,80),endpoint:String(a.endpoint||"").slice(0,200)});
                   return JSON.stringify(j.input||j).slice(0,1400);
                   }catch(e){ return monidCorsNote(e); } } },
  monid_run:   { name:"Monid run", argsHint:'{"provider":"apify","endpoint":"/...","body":{"query":"..."}}', badge:"CORS-blocked", desc:"Execute a Monid endpoint (run monid_inspect first for the schema - never guess). Polls up to 60s. Spends the Monid balance; the result reports its cost. Same browser-origin limit as Monid discover.",
                 run: async a=>{ try{
                   const req={provider:String(a.provider||"").slice(0,80),endpoint:String(a.endpoint||"").slice(0,200)};
                   const input={};
                   if(a.body) input.body=a.body; if(a.queryParams) input.queryParams=a.queryParams; if(a.pathParams) input.pathParams=a.pathParams;
                   if(Object.keys(input).length) req.input=input;
                   const fired=await monidApi("POST","/v1/run",req);
                   const id=fired.runId||fired.run_id||(fired.run&&fired.run.id)||fired.id;
                   if(!id) return JSON.stringify(fired).slice(0,1200);
                   for(let i=0;i<20;i++){
                     await new Promise(r=>setTimeout(r,3000));
                     const j=await monidApi("GET","/v1/runs/"+encodeURIComponent(id));
                     const st=String(j.status||(j.run&&j.run.status)||"").toUpperCase();
                     if(["COMPLETED","FAILED","BLOCKED","STOPPED","TIMED_OUT"].includes(st)){
                       const cv=(j.cost&&j.cost.value)!==undefined?j.cost.value:(j.run&&j.run.cost&&j.run.cost.value);
                       const out=j.result??j.output??(j.run&&(j.run.result??j.run.output))??j;
                       return "status:"+st+(cv!==undefined?" cost:"+cv:"")+"\n"+JSON.stringify(out).slice(0,1800);
                     }
                   }
                   return "still running after ~60s - Monid run id "+id;
                   }catch(e){ return monidCorsNote(e); } } },
  vm_read:     { name:"VM read", argsHint:'{"path":"vm://memory/preferences"}', badge:"real", desc:"Browse Muse's own context filesystem: list directories (L1) or read one full memory entry (L2). Try vm:// for the root.",
                 run: async a=> vmRead(a.path) },
  vm_search:   { name:"VM search", argsHint:'{"query":"breakfast"}', badge:"real", desc:"Debuggable memory retrieval: every hit shows its vm:// path and relevance score (similarity x recency x usage).",
                 run: async a=>{ const q=String(a.query||""); const r=retrieveMemory(q, 6);
                   const qt=memTokens(q); const now=Date.now();
                   const rows=r.hits.map(m=>{ const sim=memSim(qt,m); const age=(now-new Date(m.ts).getTime())/86400000;
                     const score=(sim*(1/(1+age/30))*(1+Math.min(3,m.uses||0)*0.15)).toFixed(3);
                     return `${score}  ${vmPath(m)}  ${m.text}`; });
                   if(r.related.length) rows.push("linked: "+r.related.map(m=>vmPath(m)).join(", "));
                   return rows.join("\n") || "(no matches)"; } },
  remember:    { name:"Remember", argsHint:'{"fact":"..."}', badge:"real", desc:"Store a durable fact about the user - duplicates and evolved facts update in place instead of piling up.",
                 run: async a=>{ const t=String(a.fact||"").trim(); if(t.length<8) throw new Error("too short");
                   await rememberFact(t, "tool"); return "remembered"; } },
  add_task:    { name:"Add task", argsHint:'{"text":"..."}', badge:"real", desc:"Track a task to completion.",
                 run: async a=>{ const t=String(a.text||"").trim().slice(0,280); if(t.length<2) throw new Error("too short");
                   S().tasks.unshift({id:uid("task"),text:t,status:"open",created:nowISO()}); await audit("task",`Task added: "${t}"`); await Store.save(); renderTasks(); return "task added"; } },
  complete_task:{ name:"Complete task", argsHint:'{"id":"task-..."}', badge:"real", desc:"Mark a task done.",
                 run: async a=>{ const t=S().tasks.find(x=>x.id===a.id); if(!t) throw new Error("no such task");
                   t.status="done"; t.doneAt=nowISO(); await audit("task",`Task done: "${t.text}"`); await Store.save(); renderTasks(); return "done: "+t.text; } },
  list_tasks:  { name:"List tasks", argsHint:"{}", badge:"real", desc:"Open and done tasks.",
                 run: async()=>{ const o=S().tasks.filter(t=>t.status==="open"); return (o.length? o.map(t=>"- ["+t.id+"] "+t.text).join("\n") : "no open tasks"); } },
  set_reminder:{ name:"Set reminder", argsHint:'{"text":"...","at":"ISO-8601 time"}', badge:"real", desc:"Fires while the tab is open; if Muse is asleep, it catches up on wake and says so.",
                 run: async a=>{ const t=String(a.text||"").trim().slice(0,280); const at=new Date(a.at);
                   if(!t || isNaN(at)) throw new Error("need text and a valid ISO time");
                   if(window.Notification && Notification.permission==="default"){ try{ Notification.requestPermission(); }catch(e){} }
                   S().reminders.unshift({id:uid("rem"),text:t,at:at.toISOString(),status:"pending",created:nowISO()});
                   await audit("reminder",`Reminder set: "${t}" at ${at.toLocaleString()}`); await Store.save(); renderRems();
                   return "reminder set for "+at.toLocaleString()+" (fires in-tab; late catch-up if asleep)"; } },
  fetch_page:  { name:"Fetch page", argsHint:'{"url":"https://..."}', badge:"key/open-net", desc:"Reads a page as clean text. Uses TinyFish Fetch when its key is set (renders the page for you); otherwise a direct fetch in open-network mode (many sites block those - reported, not hidden).",
                 run: async a=>{ const u=String(a.url||"").slice(0,300); if(!/^https?:\/\//.test(u)) throw new Error("http(s) URLs only");
                   if(S().settings.searchProvider==="tinyfish" && Broker.has("search")){
                     const r=await Broker.use("search", "https://api.fetch.tinyfish.ai", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({urls:[u],format:"markdown"})});
                     if(!r.ok) throw new Error("tinyfish "+r.status);
                     const j=await r.json();
                     const txt=(j.results||[]).map(x=>x.text||"").join("\n");
                     if(!txt) throw new Error("no content extracted");
                     return txt.slice(0,3000);
                   }
                   if(!S().settings.openNetwork) throw new Error("needs a TinyFish key (Tools) or open network mode");
                   const r=await fetch(u); if(!r.ok) throw new Error("http "+r.status);
                   const t=await r.text();
                   return t.replace(/<script[\s\S]*?<\/script>/g,"").replace(/<style[\s\S]*?<\/style>/g,"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").slice(0,3000); } },
};

async function execTool(id, args){
  setRT({tool:(Tools[id]?Tools[id].name:id).replace(/_/g," ")});
  try{ return await execToolInner(id, args); }
  finally{ setRT({tool:""}); }
}
async function execToolInner(id, args){
  if(id==="mcp_call"){
    if(!S().settings.openNetwork) return "blocked: MCP needs open network mode (Tools view)";
    const srv = S().mcps.find(x=>x.name===args.server);
    if(!srv) return "unknown MCP server";
    try{ const r = await mcpRpc(srv,"tools/call",{name:args.tool, arguments:args.arguments||{}});
      return JSON.stringify((r.result&&r.result.content)||r.result||r).slice(0,1500);
    }catch(e){ return "mcp error: "+String(e).slice(0,150); }
  }
  const cust = S().customTools.find(t=>t.name===id && t.status==="active");
  if(cust){
    try{ return await runSandboxed(cust.code, "const args = "+JSON.stringify(args||{}).slice(0,4000)+";\n"); }
    catch(e){ return "tool error: "+String(e).slice(0,150); }
  }
  const t = Tools[id];
  if(!t) return "unknown tool: "+id;
  try{ return String(await t.run(args||{})); }
  catch(e){ return "Error: "+String(e.message||e).slice(0,200); }
}

function knownToolId(id){
  return !!(id && (Tools[id] || (S() && S().customTools.some(t=>t.name===id && t.status==="active"))));
}
function parseToolCalls(text){
  // Accepts the canonical ```tool {"tool":"id","args":{...}} fence, plus the common model
  // deviation of naming the fence after the tool (```calc {"expression":"..."}).
  const out=[]; const re=/```([a-zA-Z_][a-zA-Z0-9_]*)\s*(\{[\s\S]*?)```/g; let m;
  while((m=re.exec(text)) && out.length<4){
    try{
      const label=m[1], j=JSON.parse(m[2]); if(!j) continue;
      if(label==="tool" && typeof j.tool==="string") out.push({tool:String(j.tool).slice(0,60), args:j.args||{}});
      else if(knownToolId(label)) out.push(typeof j.tool==="string" ? {tool:String(j.tool).slice(0,60), args:j.args||{}} : {tool:label.slice(0,60), args:j});
    }catch(e){}
  }
  return out;
}
function stripToolFences(text){
  return String(text).replace(/```([a-zA-Z_][a-zA-Z0-9_]*)\s*(\{[\s\S]*?)```/g,(whole,label,body)=>{
    if(label==="tool") return "";
    if(knownToolId(label)){ try{ JSON.parse(body); return ""; }catch(e){ return whole; } }
    return whole;
  });
}
async function toolCard(tool, res){
  const c=document.createElement("div"); c.className="toolcard";
  c.innerHTML=`<b>⚙ ${esc(tool)}</b><div class="res">${esc(res.slice(0,600))}</div>`;
  $("#chatlog").appendChild(c); $("#chatlog").scrollTop=1e9;
  S().chat.push({role:"sys", kind:"tool", text:`${tool}|||${res.slice(0,600)}`, ts:nowISO()});
  await Store.save();
}

/* ---------------- tasks ---------------- */
async function addTask(text){
  const t=String(text||"").trim().slice(0,280); if(t.length<2) return;
  S().tasks.unshift({id:uid("task"),text:t,status:"open",created:nowISO()});
  await audit("task",`Task added: "${t}"`); await Store.save(); renderTasks();
}
function renderTasks(){
  const box=$("#tasklist"); if(!box||!S()) return;
  const open=S().tasks.filter(t=>t.status==="open"), done=S().tasks.filter(t=>t.status==="done").slice(0,5);
  if(!S().tasks.length){ box.innerHTML=`<div class="small" style="color:var(--dim2);font-size:12px">No tasks. Quick to-dos live here, tracked to done.</div>`; return; }
  box.innerHTML = [...open, ...done].map(t=>`<div class="task ${t.status}">
      <button class="btn" data-tasktoggle="${t.id}" style="padding:3px 9px">${t.status==="open"?"○":"●"}</button>
      <span class="txt">${esc(t.text)}</span>
      <button class="btn badb" data-taskdel="${t.id}" style="padding:3px 9px">×</button>
    </div>`).join("");
  $$("#tasklist [data-tasktoggle]").forEach(b=>b.onclick=async()=>{ const t=S().tasks.find(x=>x.id===b.dataset.tasktoggle); if(!t)return;
    if(t.status==="open"){ t.status="done"; t.doneAt=nowISO(); await audit("task",`Task done: "${t.text}"`); } else { t.status="open"; delete t.doneAt; }
    await Store.save(); renderTasks(); });
  $$("#tasklist [data-taskdel]").forEach(b=>b.onclick=async()=>{ const i=S().tasks.findIndex(x=>x.id===b.dataset.taskdel); if(i>=0){ S().tasks.splice(i,1); await Store.save(); renderTasks(); } });
}

/* ---------------- habits: honest streaks, no freebies ----------------
   A streak counts consecutive checked periods only. For a daily habit the
   streak is alive through yesterday if today is unchecked (today still
   pending), and resets to zero the moment a full day is missed. Weekly
   habits use ISO weeks. */
const localDay = (d=new Date()) => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
function isoWeekKey(d=new Date()){
  const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day=(t.getUTCDay()+6)%7; t.setUTCDate(t.getUTCDate()-day+3);
  const firstThu=new Date(Date.UTC(t.getUTCFullYear(),0,4));
  const fd=(firstThu.getUTCDay()+6)%7; firstThu.setUTCDate(firstThu.getUTCDate()-fd+3);
  return t.getUTCFullYear()+"-W"+String(1+Math.round((t-firstThu)/(7*86400000))).padStart(2,"0");
}
const habitKeyNow = h => h.cadence==="weekly" ? isoWeekKey() : localDay();
const habitDoneNow = h => (h.checks||[]).includes(habitKeyNow(h));
function habitStreak(h){
  const set=new Set(h.checks||[]); let n=0;
  if(h.cadence==="weekly"){
    const d=new Date(); if(!set.has(isoWeekKey(d))) d.setDate(d.getDate()-7);
    while(set.has(isoWeekKey(d))){ n++; d.setDate(d.getDate()-7); }
  } else {
    const d=new Date(); if(!set.has(localDay(d))) d.setDate(d.getDate()-1);
    while(set.has(localDay(d))){ n++; d.setDate(d.getDate()-1); }
  }
  return n;
}
async function toggleHabit(id){
  const h=(S().habits||[]).find(x=>x.id===id); if(!h) return;
  h.checks=h.checks||[]; const k=habitKeyNow(h);
  if(h.checks.includes(k)){
    h.checks=h.checks.filter(x=>x!==k);
    await audit("habit",`Unchecked "${h.name}" for ${k}`);
  } else {
    h.checks.push(k); h.checks=h.checks.slice(-400);
    const st=habitStreak(h);
    await audit("habit",`Checked in "${h.name}" - ${st} ${h.cadence==="weekly"?"week":"day"}${st===1?"":"s"} in a row`);
    toast(st>1 ? `${h.name}: ${st} in a row.` : `${h.name} checked in.`);
  }
  await Store.save(); renderHabits();
}
function renderHabits(){
  const list=$("#habitlist"); if(!list||!S()) return;
  const hs=S().habits||[];
  const due=hs.filter(h=>!habitDoneNow(h)).length;
  const pill=$("#habitdue"); if(pill){ pill.hidden=due===0; pill.textContent=due; pill.title=due+" habit"+(due===1?"":"s")+" not checked in yet"; }
  if(!hs.length){ list.innerHTML=`<div class="empty">No habits yet. Add one above - "stretch 10 minutes", "read 20 pages" - and check in when you do it. Streaks are honest: a missed day resets the count.</div>`; return; }
  list.innerHTML = hs.map(h=>{
    const st=habitStreak(h), done=habitDoneNow(h);
    let dots="";
    if(h.cadence==="weekly"){
      const d=new Date(); const keys=[]; for(let i=5;i>=0;i--){ const t=new Date(d); t.setDate(t.getDate()-7*i); keys.push(isoWeekKey(t)); }
      dots=keys.map((k,i)=>`<i class="${(h.checks||[]).includes(k)?"on":""}" title="week of ${k}${i===5?" (this week)":""}"></i>`).join("");
    } else {
      const keys=[]; for(let i=6;i>=0;i--){ const t=new Date(); t.setDate(t.getDate()-i); keys.push(localDay(t)); }
      dots=keys.map((k,i)=>`<i class="${(h.checks||[]).includes(k)?"on":""}" title="${k}${i===6?" (today)":""}"></i>`).join("");
    }
    return `<div class="habit">
      <button class="btn ${done?"okb":"pri"}" data-habcheck="${h.id}">${done?"Done "+(h.cadence==="weekly"?"this week":"today")+" \u2713":"Check in"}</button>
      <span class="txt"><b>${esc(h.name)} <span class="pill" style="font-size:10px">${h.cadence}</span></b>
      <span>${st>0?`<b class="habstreak">${st} ${h.cadence==="weekly"?"week":"day"}${st===1?"":"s"} in a row</b> \u00b7 `:""}${(h.checks||[]).length} check-in${(h.checks||[]).length===1?"":"s"} total${done?"":" \u00b7 due now"}</span></span>
      <span class="habdots">${dots}</span>
      <button class="btn badb" data-habdel="${h.id}" style="padding:3px 9px">\u00d7</button>
    </div>`;
  }).join("");
  $$("#habitlist [data-habcheck]").forEach(b=>b.onclick=()=>toggleHabit(b.dataset.habcheck));
  $$("#habitlist [data-habdel]").forEach(b=>b.onclick=async()=>{ const i=S().habits.findIndex(x=>x.id===b.dataset.habdel); if(i>=0){ await audit("habit",`Deleted habit "${S().habits[i].name}"`); S().habits.splice(i,1); await Store.save(); renderHabits(); } });
}

/* ---------------- reminders (orb wake engine) ---------------- */
function habitTick(){
  if(!S()) return;
  const due=(S().habits||[]).filter(h=>!habitDoneNow(h)).length;
  const pill=$("#habitdue"); if(pill){ pill.hidden=due===0; pill.textContent=due; }
  if(habitTick._day && habitTick._day!==localDay()) renderHabits();
  habitTick._day=localDay();
}
async function checkReminders(){
  if(!S()) return;
  habitTick();
  const now=Date.now(); let fired=false;
  for(const r of S().reminders.filter(x=>x.status==="pending" && new Date(x.at).getTime()<=now)){
    r.status="fired"; r.firedAt=nowISO(); r.late = now-new Date(r.at).getTime()>60000; fired=true;
    await addMsg("sys", `⏰ Reminder: ${r.text}${r.late?" (fired late - Muse was asleep when it came due)":""}`);
    if(window.Notification && Notification.permission==="granted"){ try{ new Notification("Muse reminder",{body:r.text}); }catch(e){} }
    await audit("reminder",`Fired: "${r.text}"${r.late?" (late catch-up)":""}`);
  }
  if(fired){ await Store.save(); renderRems(); renderChat(); toast("Reminder fired."); }
}
function renderRems(){
  const box=$("#remlist"); if(!box||!S()) return;
  const pending=S().reminders.filter(r=>r.status==="pending").slice(0,6);
  if(!pending.length){ box.innerHTML=""; return; }
  box.innerHTML = pending.map(r=>`<div class="rem"><span>⏰</span><span class="txt">${esc(r.text)}</span><span>${fmtD(r.at)}</span>
    <button class="btn badb" data-remdel="${r.id}" style="padding:3px 9px">×</button></div>`).join("");
  $$("#remlist [data-remdel]").forEach(b=>b.onclick=async()=>{ const i=S().reminders.findIndex(x=>x.id===b.dataset.remdel); if(i>=0){ S().reminders.splice(i,1); await Store.save(); renderRems(); } });
}

/* ---------------- skills ---------------- */
const BUILTIN_SKILLS = [
  { id:"sk-email", name:"Email drafter", text:"When drafting email: subject line plus body, short plain paragraphs, no filler, sign off as the user. Never claim it was sent." },
  { id:"sk-plan", name:"Planning", text:"Break plans into concrete, dated, doable steps. Smallest useful step first. Say what is next in one line." },
  { id:"sk-code", name:"Coding standards", text:"Small self-contained diffs, no new dependencies, no secrets, state the risks and what to test." },
];
const activeSkills = ()=> [
  ...BUILTIN_SKILLS.filter(s=>!(S().settings.skillsOff||[]).includes(s.id)),
  ...S().userSkills
];
function renderSkills(){
  const box=$("#skilllist"); if(!box||!S()) return;
  const off=S().settings.skillsOff||[];
  box.innerHTML = [
    ...BUILTIN_SKILLS.map(s=>({...s, builtin:true, on:!off.includes(s.id)})),
    ...S().userSkills.map(s=>({...s, builtin:false, on:true}))
  ].map(s=>`<div class="skill">
      <button class="btn ${s.on?"okb":""}" data-skiltoggle="${s.id}" style="padding:3px 10px">${s.on?"on":"off"}</button>
      <span class="txt"><b>${esc(s.name)}${s.builtin?" <span style='color:var(--dim2)'>(built-in)</span>":""}</b><span>${esc(s.text.slice(0,110))}</span></span>
      ${s.builtin?"":`<button class="btn badb" data-skildel="${s.id}" style="padding:3px 9px">×</button>`}
    </div>`).join("");
  $$("#skilllist [data-skiltoggle]").forEach(b=>b.onclick=async()=>{
    const id=b.dataset.skiltoggle; const offL=S().settings.skillsOff=S().settings.skillsOff||[];
    const i=offL.indexOf(id);
    if(BUILTIN_SKILLS.some(s=>s.id===id)){ i>=0? offL.splice(i,1) : offL.push(id); await Store.save(); renderSkills(); }
  });
  $$("#skilllist [data-skildel]").forEach(b=>b.onclick=async()=>{ const i=S().userSkills.findIndex(x=>x.id===b.dataset.skildel); if(i>=0){ S().userSkills.splice(i,1); await Store.save(); renderSkills(); } });
}

/* ---------------- open network + MCP ---------------- */
const CSP_META = ()=> document.querySelector('meta[http-equiv="Content-Security-Policy"]');
/* Tight by default: the only origins this tab may connect to are the model
   providers, the search providers, Hugging Face (built-in engine weights),
   and local endpoints. Open network mode (MCP, fetch_page) is the documented
   escape hatch and swaps in the wide policy until turned off. */
function applyNetPolicy(){
  // The shipped meta tag in index.html is the single source of the tight policy;
  // open-network mode derives from it by widening only connect-src. Nothing else
  // is ever re-typed, so a directive (like manifest-src) cannot drift between copies.
  // The toggle is the consent gate for MCP + arbitrary fetch_page; keys are only ever
  // attached to the configured provider's own origin, by the broker.
  const on = !!(S() && S().settings.openNetwork);
  const meta = CSP_META();
  if(meta){
    if(!applyNetPolicy._tight) applyNetPolicy._tight = meta.getAttribute("content");
    meta.setAttribute("content", on
      ? applyNetPolicy._tight.replace(/connect-src [^;]+/, "connect-src 'self' https: wss: http://localhost:* http://127.0.0.1:*")
      : applyNetPolicy._tight);
  }
  const st=$("#opennetstate"); if(st){ st.textContent = on?"ON - MCP and page fetch enabled":"off"; st.className = "pill "+(on?"warn":""); }
  const cb=$("#opennet"); if(cb) cb.checked = on;
}
async function mcpRpc(srv, method, params){
  const r = await Broker.useMcp(srv, srv.url, { method:"POST",
    headers: {"Content-Type":"application/json","Accept":"application/json, text/event-stream"},
    body: JSON.stringify({jsonrpc:"2.0", id:uid("m"), method, params}) });
  if(!r.ok) throw new Error("http "+r.status);
  const ct = r.headers.get("content-type")||"";
  if(ct.includes("text/event-stream")){
    const t = await r.text();
    const line = t.split("\n").find(l=>l.startsWith("data:"));
    if(!line) throw new Error("empty event stream");
    return JSON.parse(line.slice(5));
  }
  return r.json();
}
async function mcpDiscover(id){
  const srv=S().mcps.find(x=>x.id===id); if(!srv) return;
  try{ await mcpRpc(srv,"initialize",{protocolVersion:"2025-03-26",capabilities:{},clientInfo:{name:"open-muse",version:"1.0"}}); }catch(e){}
  const res = await mcpRpc(srv,"tools/list",{});
  srv.tools = ((res.result&&res.result.tools)||[]).map(t=>({name:String(t.name).slice(0,60), desc:String(t.description||"").slice(0,140)})).slice(0,20);
  await audit("mcp",`Discovered ${srv.tools.length} tools on "${srv.name}"`);
  await Store.save(); renderMcps(); renderTools();
}
function renderMcps(){
  const box=$("#mcplist"); if(!box||!S()) return;
  if(!S().mcps.length){ box.innerHTML=`<div class="small" style="color:var(--dim2);font-size:12px">No servers yet.</div>`; return; }
  box.innerHTML = S().mcps.map(s=>`<div class="mcp">
      <span class="txt"><b>${esc(s.name)}</b><span>${esc(s.url)}${s.tools?` - ${s.tools.length} tools: ${s.tools.map(t=>esc(t.name)).join(", ").slice(0,90)}`:" - not discovered yet"}</span></span>
      <button class="btn" data-mcpdisc="${s.id}">Discover tools</button>
      <button class="btn badb" data-mcpdel="${s.id}" style="padding:3px 9px">×</button>
    </div>`).join("");
  $$("#mcplist [data-mcpdisc]").forEach(b=>b.onclick=async()=>{ b.disabled=true; try{ await mcpDiscover(b.dataset.mcpdisc); toast("Tools discovered."); }catch(e){ toast("MCP failed: "+String(e).slice(0,70)); } b.disabled=false; });
  $$("#mcplist [data-mcpdel]").forEach(b=>b.onclick=async()=>{ const i=S().mcps.findIndex(x=>x.id===b.dataset.mcpdel); if(i>=0){ S().mcps.splice(i,1); await Store.save(); renderMcps(); } });
}

/* ---------------- tools view ---------------- */
function renderTools(){
  renderPrompts();
  const box=$("#toolgrid"); if(!box||!S()) return;
  const customs = S().customTools.filter(t=>t.status==="active");
  const pending = S().customTools.filter(t=>t.status==="pending");
  box.innerHTML = [
    ...Object.entries(Tools).map(([id,t])=>({id, name:t.name, desc:t.desc, badge:t.badge, hint:t.argsHint})),
    ...customs.map(t=>({id:t.id, name:t.name, desc:t.desc+" (built by Muse)", badge:"custom", hint:t.argsHint})),
    ...pending.map(t=>({id:t.id, name:t.name+" - awaiting your approval", desc:t.desc, badge:"pending", hint:t.argsHint, pend:true}))
  ].map(t=>`<div class="tool"><h4>${esc(t.name)} <span class="pill ${t.badge==="real"?"ok":(t.badge==="pending"||/blocked/i.test(t.badge))?"warn":""}">${t.badge}</span></h4>
    <div class="small">${esc(t.desc)}</div>
    ${t.pend?`<div class="row"><button class="btn okb" data-ctapp="${t.id}">Approve</button><button class="btn badb" data-ctrej="${t.id}">Reject</button></div>`
      :(t.badge==="custom"?`<div class="row"><button class="btn badb" data-ctdel="${t.id}">Remove</button></div>`:"")}
  </div>`).join("");
  $$("#toolgrid [data-ctapp]").forEach(b=>b.onclick=()=>decideCustomTool(b.dataset.ctapp,true));
  $$("#toolgrid [data-ctrej]").forEach(b=>b.onclick=()=>decideCustomTool(b.dataset.ctrej,false));
  $$("#toolgrid [data-ctdel]").forEach(b=>b.onclick=async()=>{ const i=S().customTools.findIndex(x=>x.id===b.dataset.ctdel); if(i>=0){ await audit("tool",`Custom tool removed: "${S().customTools[i].name}"`); S().customTools.splice(i,1); await Store.save(); renderTools(); } });
  const ss=$("#searchstate"); if(ss) ss.textContent = S().settings.searchKey ? "Search key saved ("+(S().settings.searchProvider||"tavily")+")." : "No search key yet.";
  const ms=$("#monidstate"); if(ms) ms.textContent = (S().settings.monidKey ? "Monid key stored. " : "No Monid key yet - create one at app.monid.ai/access/api-keys. ") + "Heads up: Monid's API only allows browser calls from its own site, so from this static app the calls are CORS-blocked for now; the Monid CLI works anywhere.";
  const spv=$("#searchpv"); if(spv) spv.value = S().settings.searchProvider || "tinyfish";
}

/* ---------------- self-built tools (Muse extends itself) ---------------- */
async function buildCustomTool(ask){
  if(!Broker.has("model")){ toast("Add a model key in Settings first."); return; }
  const engine = S().settings.provider==="tokenharbor" ? EVOLVE_ENGINE : activeModel();
  const raw = await chatOnce([
    {role:"system",content:`Design a small browser tool as strict JSON: {"name":"snake_case_id","desc":"one line","argsHint":"{\\"x\\":\\"...\\"}","code":"async JS body; 'args' is in scope; use console.log for output; return the result","sampleArgs":{"x":"..."}}.
Rules: the code runs in an isolated worker - no DOM, no storage, no fetch to anything (pure computation, parsing, transformation). Under 80 lines. No secrets. Example: word_counter, csv_to_json, cron_explainer, unit_converter.`},
    {role:"user",content: ask.slice(0,600)}
  ], true, engine);
  const p = JSON.parse(raw);
  const t = { id:uid("ct"), name:String(p.name||"").toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,40),
    desc:String(p.desc||"").slice(0,200), argsHint:String(p.argsHint||"{}").slice(0,120),
    code:String(p.code||"").slice(0,6000), sampleArgs:(p.sampleArgs&&typeof p.sampleArgs==="object")?p.sampleArgs:{},
    status:"pending", created:nowISO(), from:ask.slice(0,140) };
  // gates: shape, uniqueness, secret scan, sandbox test
  const gates=[];
  gates.push({name:"valid unique name", pass: !!t.name && !Tools[t.name] && !S().customTools.some(x=>x.name===t.name)});
  gates.push({name:"code size <= 6000 chars", pass: t.code.length>0 && t.code.length<=6000});
  const hits = EVO_SECRET_RES.filter(re=>re.test(t.code));
  gates.push({name:"secret scan", pass: hits.length===0});
  const test = await runSandboxed(t.code, "const args = "+JSON.stringify(t.sampleArgs).slice(0,2000)+";\n");
  gates.push({name:"sandbox test-run completes", pass: !/^Error:|^sandbox unavailable/.test(test), note: test.slice(0,140)});
  const pass = gates.every(g=>g.pass);
  t.eval = {at:nowISO(), gates, pass, testOut:test.slice(0,300)};
  if(pass){
    S().customTools.unshift(t);
    await audit("tool",`Muse built tool "${t.name}" - passed gates, awaiting your approval`);
    toast(`Tool "${t.name}" built and tested - approve it in Tools.`);
  } else {
    S().customTools.unshift({...t, status:"rejected"});
    await audit("tool",`Muse-built tool "${t.name||"unnamed"}" FAILED gates: ${gates.filter(g=>!g.pass).map(g=>g.name).join("; ").slice(0,120)}`);
    toast("Tool failed gates - see audit log.");
  }
  await Store.save(); renderTools();
}
async function decideCustomTool(id, ok){
  const t=S().customTools.find(x=>x.id===id); if(!t) return;
  if(ok && !(t.eval&&t.eval.pass)){ toast("Gates must pass first."); return; }
  t.status = ok ? "active" : "rejected";
  await audit("tool",`${ok?"Approved":"Rejected"} custom tool: "${t.name}"`);
  await Store.save(); renderTools();
}

/* ---------------- studio: user mini-apps in a real sandbox ---------------- */
async function genMiniApp(desc){
  const raw = await chatOnce([
    {role:"system",content:`You build tiny self-contained web apps. Output exactly one fenced \`\`\`html block: a complete single-file HTML app with inline <style> and <script>. Dark refined theme. Fully self-contained - no external URLs, no fetch calls, no images from the web. After the block add one line: NAME: <short app name>.`},
    {role:"user",content: desc.slice(0,800)}
  ], false, S().settings.provider==="tokenharbor" ? EVOLVE_ENGINE : activeModel());
  const m = raw.match(/```html([\s\S]*?)```/);
  if(!m) throw new Error("model returned no app");
  const code = m[1].trim();
  if(code.length > 80000) throw new Error("app too large");
  const hits = EVO_SECRET_RES.filter(re=>re.test(code));
  if(hits.length) throw new Error("generated app failed the secret scan");
  if(/https?:\/\//.test(code)) throw new Error("generated app references external URLs - rejected (must be self-contained)");
  const name = ((raw.match(/NAME:\s*(.+)/)||[])[1] || desc).trim().slice(0,60);
  S().miniapps.unshift({id:uid("app"), name, code, created:nowISO(), from:desc.slice(0,140)});
  if(S().miniapps.length>20) S().miniapps.length=20;
  await audit("studio",`Mini-app built: "${name}"`);
  await Store.save(); renderStudio();
  return name;
}
function runMiniApp(id){
  const app=S().miniapps.find(x=>x.id===id); if(!app) return;
  openModal(`<h3>${esc(app.name)}</h3>
    <div class="sub" id="studionote">Running in a sandboxed frame - an isolated origin with no storage and no network (its own CSP says connect-src 'none'). It cannot see your Muse data.</div>
    <div class="row">
      <button class="btn" id="dlapp">Download .html</button>
      <button class="btn modal-cancel">Close</button>
    </div>
    <div id="framehost" style="margin-top:10px"></div>`);
  $("#dlapp").onclick=()=>{ const b=new Blob([app.code],{type:"text/html"}); const x=document.createElement("a"); x.href=URL.createObjectURL(b); x.download=app.name.replace(/[^\w-]+/g,"-")+".html"; x.click(); };
  const mount=()=>{
    const f=document.createElement("iframe");
    f.className="studioframe"; f.setAttribute("sandbox","allow-scripts");
    f.src="studio-frame.html";
    f.onload=()=>{ f.contentWindow.postMessage({openmuseApp:app.code}, location.origin); };
    $("#framehost").appendChild(f);
  };
  mount();
}
function renderStudio(){
  const cnt=$("#appcount"); if(cnt) cnt.textContent = S()?S().miniapps.length:0;
  const box=$("#applist"); if(!box||!S()) return;
  if(!S().miniapps.length){ box.innerHTML=`<div class="empty">No apps yet. Describe one - "build me a pomodoro timer" - and Muse writes it, gates it, and keeps it here.</div>`; return; }
  box.innerHTML = S().miniapps.map(x=>`<div class="app">
      <span class="txt"><b>${esc(x.name)}</b><span>${fmtD(x.created)}${x.from?` - from "${esc(x.from)}"`:""}</span></span>
      <button class="btn pri" data-apprun="${x.id}">Run</button>
      <button class="btn badb" data-appdel="${x.id}">Delete</button>
    </div>`).join("");
  $$("#applist [data-apprun]").forEach(b=>b.onclick=()=>runMiniApp(b.dataset.apprun));
  $$("#applist [data-appdel]").forEach(b=>b.onclick=async()=>{ const i=S().miniapps.findIndex(x=>x.id===b.dataset.appdel); if(i>=0){ S().miniapps.splice(i,1); await Store.save(); renderStudio(); } });
}


/* ---------------- design engine: themes, density, compat ---------------- */
function applyAppearance(){
  const s = S() ? S().settings : {theme:"serious", density:"comfortable", font:"m"};
  const de = document.documentElement;
  de.dataset.theme = s.theme || "serious";
  de.dataset.density = s.density || "comfortable";
  de.dataset.font = s.font || "m";
  $$("#themerow .swatch").forEach(b=>b.classList.toggle("on", b.dataset.themePick===de.dataset.theme));
  const d=$("#setdensity"); if(d) d.value = de.dataset.density;
  const f=$("#setfont"); if(f) f.value = de.dataset.font;
}
const Compat = {
  check(){
    return [
      { name:"WebCrypto (encrypted VM)", ok: !!(crypto && crypto.subtle), fix:"lock/E2EE unavailable without it" },
      { name:"Local storage", ok: (()=>{ try{ localStorage.setItem("t","1"); localStorage.removeItem("t"); return true; }catch(e){ return false; } })(), fix:"nothing persists without it" },
      { name:"Web Workers (JS sandbox)", ok: typeof Worker !== "undefined", fix:"run_js and custom tools disabled" },
      { name:"Notifications", ok: "Notification" in window, fix:"reminders show in-chat only" },
      { name:"Clipboard", ok: !!(navigator && navigator.clipboard), fix:"hand-off shows text to copy manually" },
    ];
  },
  render(){
    const box=$("#compatlist"); if(!box) return;
    box.innerHTML = this.check().map(c=>`<div class="rowc"><span class="pill ${c.ok?"ok":"bad"}"><span class="d"></span>${c.ok?"yes":"no"}</span><span>${c.name}${c.ok?"":` <span style="color:var(--dim2)">- ${c.fix}</span>`}</span></div>`).join("");
  },
  has(name){ return this.check().find(c=>c.name.startsWith(name))?.ok !== false; }
};
$$("#themerow .swatch").forEach(b=>b.addEventListener("click", async()=>{
  S().settings.theme = b.dataset.themePick; applyAppearance(); await Store.save();
}));
$("#setdensity").addEventListener("change", async()=>{ S().settings.density=$("#setdensity").value; applyAppearance(); await Store.save(); });
$("#setfont").addEventListener("change", async()=>{ S().settings.font=$("#setfont").value; applyAppearance(); await Store.save(); });

/* ---------------- boot ---------------- */
/* Free tiers and busy providers rate-limit parallel agent waves (429).
   Retry a team/workforce model call with backoff before failing the agent;
   non-transient errors (auth, bad model) fail immediately. */
async function teamCall(fn){
  let err;
  for(let i=0;i<3;i++){
    try{ return await fn(); }
    catch(e){
      err=e;
      if(!/\b429\b|\b5\d\d\b/.test(String(e&&e.message||e))) break;
      if(i<2) await new Promise(r=>setTimeout(r, 5000*(i+1)+Math.floor(Math.random()*2000)));
    }
  }
  throw err;
}

/* ---------------- multi-agent: teams and swarms ----------------
   The orchestrator asks the model to split a goal into role-shaped subtasks
   (researcher / coder / reviewer / writer), runs them in parallel with a
   live roster in the status rail, then a merge pass combines the work.
   Swarm mode: three fixed angles on the same goal, then merge.
   Honest bounds: these are parallel model calls inside this tab - no
   background agents, nothing runs while the tab is closed, and agents only
   produce artifacts (researchers may use read-only tools). Anything
   sensitive still has to come back through sentinel approval. */
const AgentRoles = {
  researcher: "You are the RESEARCHER on a small agent team. Gather and verify facts; you may emit fenced ```tool blocks for web_search, fetch_page or calc. Output: tight, sourced findings.",
  coder: "You are the CODER on a small agent team. Produce working code and technical artifacts. Output: code blocks plus exact implementation notes.",
  reviewer: "You are the REVIEWER on a small agent team. Attack the problem: find errors, risks, missing pieces. Output: prioritized critique with concrete fixes.",
  writer: "You are the WRITER on a small agent team. Turn material into finished prose: simple, direct, warm. Output: the final text itself."
};
/* roster lookup: a custom specialist by name, else a built-in role */
function rolePrompt(role){
  const custom=(S() && S().agents || []).find(a=>a.name.toLowerCase()===String(role).toLowerCase());
  if(custom) return "You are "+custom.name.toUpperCase()+" on a small agent workforce. "+custom.prompt+" Stay inside your specialty; output only the artifact.";
  return AgentRoles[role] || AgentRoles.researcher;
}
/* Per-agent scopes: what a workforce agent may touch. Every agent already runs
   context-blind - it is handed only its subtask and its teammates' outputs,
   never the chats, memory, or keys. The scope here is tool use (web search,
   page fetch, calculator): researcher on by default, everyone else off, any
   row flippable. Same-tab isolation - not a separate machine. */
function roleToolsAllowed(role){
  const s=S(); const key=String(role||"").toLowerCase();
  const o=(s && s.roleTools) || {};
  if(Object.prototype.hasOwnProperty.call(o, key)) return !!o[key];
  return key==="researcher";
}
function resolveRole(role){
  const r=String(role||"").slice(0,40);
  const exact=Object.keys(AgentRoles).find(k=>k.toLowerCase()===r.toLowerCase());
  if(exact) return exact;
  const custom=(S() && S().agents || []).find(a=>a.name.toLowerCase()===r.toLowerCase());
  if(custom) return custom.name;
  return "researcher";
}
const TEAM = {active:false, mode:"", goal:"", agents:[]};
async function runTeam(goalId, mode){
  if(mode==="workforce") return runWorkforce(goalId);
  const s=S(); const g=s.goals.find(x=>x.id===goalId); if(!g) return;
  if(TEAM.active){ toast("A team is already running - watch the status rail."); return; }
  const ai = AI.provider();
  TEAM.active=true; TEAM.mode=mode; TEAM.goal=g.title; TEAM.agents=[];
  setRT({state:"working", step:(mode==="swarm"?"Swarm: ":"Team: ")+g.title, tool:""});
  try{
    let specs;
    if(mode==="swarm"){
      specs=[{role:"researcher",task:"Find the strongest facts, sources and examples for: "+g.title},
             {role:"coder",task:"Design the concrete plan or artifact for: "+g.title},
             {role:"reviewer",task:"Red-team likely approaches to: "+g.title}];
    } else {
      const decomp = await teamCall(()=>ai.generateText({messages:[
        {role:"system",content:"You decompose goals for a small agent team. Reply with strict JSON only: {\"agents\":[{\"role\":\"researcher|coder|reviewer|writer\",\"task\":\"<one concrete self-contained subtask>\"}]} - 2 to 4 agents, no dependencies between tasks."},
        {role:"user",content:g.title}
      ], json:true}));
      try{ specs=(JSON.parse(decomp).agents||[]).slice(0,4); if(!specs.length) throw 0; }
      catch(e){ specs=[{role:"researcher",task:"Research: "+g.title},{role:"writer",task:"Draft the deliverable for: "+g.title}]; }
    }
    TEAM.agents = specs.map(sp=>({role:AgentRoles[sp.role]?sp.role:"researcher", task:String(sp.task||"").slice(0,300)||("Work on: "+g.title), status:"queued", output:""}));
    renderStatus();
    await audit("team", `${mode==="swarm"?"Swarm":"Team"} started on "${g.title}": `+TEAM.agents.map(x=>x.role).join(", "));
    await addMsg("sys", `${mode==="swarm"?"Swarm":"Team"} running on \u201c${g.title}\u201d - ${TEAM.agents.length} agents in parallel (${TEAM.agents.map(x=>x.role).join(", ")}). Live roster is in the status rail; artifacts only, nothing external happens without your approval.`);
    renderChat();
    await Promise.all(TEAM.agents.map(async ag=>{
      ag.status="running"; renderStatus();
      try{
        let out = await teamCall(()=>ai.generateText({messages:[
          {role:"system",content:AgentRoles[ag.role]},
          {role:"user",content:ag.task+(g.note?`\nSteering: ${g.note}`:"")+(g.due?`\nDue: ${g.due}`:"")}
        ]}));
        if(ag.role==="researcher"){
          const calls=parseToolCalls(out);
          if(calls.length){
            const results=[];
            for(const c of calls.slice(0,3)){ results.push({tool:c.tool, result:await execTool(c.tool, c.args||{})}); }
            out = await teamCall(()=>ai.generateText({messages:[
              {role:"system",content:AgentRoles[ag.role]},
              {role:"user",content:ag.task+"\n\nTool results:\n"+results.map(r=>`[${r.tool}]\n${r.result}`).join("\n\n")+"\n\nWrite the final findings from this material."}
            ]}));
          }
        }
        ag.output=out; ag.status="done";
      }catch(e){ ag.status="failed"; ag.output=String(e.message||e).slice(0,200); }
      renderStatus();
    }));
    const ok = TEAM.agents.filter(x=>x.status==="done");
    let merged;
    if(!ok.length){
      const firstErr=(TEAM.agents.find(x=>x.status==="failed"&&x.output)||{}).output||"";
      merged="Every agent failed. " + friendlyModelError(firstErr || "unknown");
    }
    else{
      merged = await teamCall(()=>ai.generateText({messages:[
        {role:"system",content:"You are the orchestrator. Merge your agent team's work into one coherent deliverable: keep what survives scrutiny, drop what does not. End with one line naming what you merged."},
        {role:"user",content:`Goal: ${g.title}\n${g.note?`Steering: ${g.note}\n`:""}${g.due?`Due: ${g.due}\n`:""}\n`+ok.map(x=>`[${x.role} - ${x.task}]\n${x.output}`).join("\n\n---\n\n")}
      ]}));
    }
    await addMsg("muse", `Team merge on \u201c${g.title}\u201d (${ok.length}/${TEAM.agents.length} agents delivered):\n\n${merged}`);
    await audit("team", `Team finished on "${g.title}" (${ok.length}/${TEAM.agents.length} ok)`);
    s.counters.actions++;
    setRT({last:"Team finished: "+g.title.slice(0,50)});
  }catch(e){
    await addMsg("sys", "Team run failed. " + friendlyModelError(e));
    await audit("error", `Team run failed on "${g.title}": ${String(e.message||e).slice(0,120)}`);
  }
  TEAM.active=false; TEAM.agents=[];
  setRT({state:"idle", step:"", tool:""});
  await Store.save(); renderAll();
}

/* ---------------- workforce: dependency-graph multi-agent runs ----------------
   Adapted from Eigent's open-source multi-agent workforce (eigent-ai/eigent,
   built on CAMEL): a coordinator decomposes the goal into a dependency graph
   of subtasks, assigns each to a roster specialist (built-in or user-added),
   runs ready subtasks in parallel waves, hands each agent its dependencies'
   output, then merges. Rebuilt for this browser - same honest bounds as Team:
   parallel model calls in this tab, artifacts only, sensitive work still
   pauses for approval, and nothing runs while the tab is closed. */
async function runWorkforce(goalId){
  const s=S(); const g=s.goals.find(x=>x.id===goalId); if(!g) return;
  if(TEAM.active){ toast("A team is already running - watch the status rail."); return; }
  const ai = AI.provider();
  TEAM.active=true; TEAM.mode="workforce"; TEAM.goal=g.title; TEAM.agents=[];
  setRT({state:"working", step:"Workforce: "+g.title, tool:""});
  try{
    const rosterDesc=Object.keys(AgentRoles).map(r=>"- "+r)
      .concat((s.agents||[]).slice(0,12).map(a=>"- "+a.name+": "+String(a.prompt).slice(0,120)))
      .join("\n");
    let tasks;
    const decomp = await teamCall(()=>ai.generateText({messages:[
      {role:"system",content:"You are the coordinator of a small agent workforce. Decompose the goal into 3 to 6 subtasks as a dependency graph. Reply with strict JSON only: {\"tasks\":[{\"id\":\"t1\",\"role\":\"<roster role>\",\"task\":\"<one concrete self-contained subtask>\",\"depends\":[\"<id of an earlier task whose output this subtask needs>\"]}]}. Rules:\n- Assign roles only from this roster:\n"+rosterDesc+"\n- depends lists earlier task ids only (t1 may not depend on t3); a subtask with no dependencies gets [].\n- Independent subtasks must NOT depend on each other, so they run in parallel.\n- Make the final subtask synthesize the deliverable from whatever it needs."},
      {role:"user",content:g.title+(g.note?"\nSteering: "+g.note:"")}
    ], json:true}));
    try{
      tasks=(JSON.parse(decomp).tasks||[]).slice(0,6);
      if(tasks.length<2) throw 0;
      tasks.forEach((t,i)=>{
        t.id="t"+(i+1);
        t.role=resolveRole(t.role||"researcher");
        t.task=String(t.task||"").slice(0,300)||("Work on: "+g.title);
        t.depends=(Array.isArray(t.depends)?t.depends:[]).map(String).filter(d=>/^t\d+$/.test(d) && +d.slice(1)>=1 && +d.slice(1)<=i);
      });
    }catch(e){
      tasks=[{id:"t1",role:"researcher",task:"Research the facts and options for: "+g.title,depends:[]},
             {id:"t2",role:"coder",task:"Produce the concrete artifact for: "+g.title,depends:["t1"]},
             {id:"t3",role:"reviewer",task:"Attack the artifact: errors, risks, gaps. Goal: "+g.title,depends:["t2"]}];
    }
    TEAM.agents=tasks.map(t=>({role:t.role, task:t.task, depends:t.depends, tid:t.id, status:t.depends.length?"waiting":"queued", output:""}));
    renderStatus();
    const byId=id=>TEAM.agents.find(x=>x.tid===id);
    await audit("workforce", `Workforce started on "${g.title}": `+TEAM.agents.map(t=>t.tid+":"+t.role+(t.depends.length?" after "+t.depends.join("+"):"")).join(", "));
    await addMsg("sys", `Workforce running on \u201c${g.title}\u201d - ${TEAM.agents.length} subtasks in a dependency graph. Independent waves run in parallel; each agent is handed its dependencies' output. Live roster is in the status rail; artifacts only, nothing external without your approval.`);
    renderChat();
    let guard=0;
    while(TEAM.agents.some(t=>t.status==="queued"||t.status==="waiting") && guard++<12){
      const ready=TEAM.agents.filter(t=>(t.status==="queued"||t.status==="waiting") && t.depends.every(d=>byId(d) && byId(d).status==="done"));
      if(!ready.length){
        for(const t of TEAM.agents.filter(t=>t.status==="queued"||t.status==="waiting")){
          t.status="failed";
          t.output=t.depends.some(d=>byId(d) && byId(d).status==="failed") ? "Skipped - a dependency failed." : "Skipped - unresolvable dependencies.";
        }
        renderStatus();
        break;
      }
      await Promise.all(ready.map(async t=>{
        t.status="running"; renderStatus();
        const depOut=t.depends.map(d=>byId(d)).filter(x=>x && x.status==="done")
          .map(x=>"["+x.role+" delivered]\n"+x.output.slice(0,2200)).join("\n\n");
        try{
          const toolsOn=roleToolsAllowed(t.role);
          let out=await teamCall(()=>ai.generateText({messages:[
            {role:"system",content:rolePrompt(t.role)+(toolsOn && t.role!=="researcher"?" You may emit fenced ```tool blocks for web_search, fetch_page or calc.":"")},
            {role:"user",content:t.task+(g.note?"\nSteering: "+g.note:"")+(g.due?"\nDue: "+g.due:"")+(depOut?"\n\nWork handed to you by earlier agents:\n"+depOut:"")}
          ]}));
          const calls=parseToolCalls(out);
          if(calls.length){
            if(toolsOn){
              const results=[];
              for(const c of calls.slice(0,3)){ results.push({tool:c.tool, result:await execTool(c.tool, c.args||{})}); }
              out=await teamCall(()=>ai.generateText({messages:[
                {role:"system",content:rolePrompt(t.role)},
                {role:"user",content:t.task+"\n\nTool results:\n"+results.map(r=>`[${r.tool}]\n${r.result}`).join("\n\n")+"\n\nWrite the final findings from this material."}
              ]}));
            }else{
              await audit("scope",`Denied ${calls.length} tool call${calls.length===1?"":"s"} from "${t.role}" - tools are off for this agent`);
              out=await teamCall(()=>ai.generateText({messages:[
                {role:"system",content:rolePrompt(t.role)},
                {role:"user",content:t.task+"\n\nTool use is switched off for your role, so no tools ran. Answer from what you know and flag anything you would have wanted to verify."}
              ]}));
            }
          }
          t.output=out; t.status="done";
        }catch(e){ t.status="failed"; t.output=String(e.message||e).slice(0,200); }
        renderStatus();
      }));
    }
    const ok=TEAM.agents.filter(x=>x.status==="done");
    let merged;
    if(!ok.length){
      const firstErr=(TEAM.agents.find(x=>x.status==="failed"&&x.output)||{}).output||"";
      merged="Every workforce agent failed. " + friendlyModelError(firstErr || "unknown");
    }
    else{
      merged=await teamCall(()=>ai.generateText({messages:[
        {role:"system",content:"You are the coordinator. Merge your workforce's deliverables into one coherent final answer: keep what survives scrutiny, resolve conflicts, drop what failed. End with one line naming what you merged."},
        {role:"user",content:`Goal: ${g.title}\n`+ok.map(x=>`[${x.role} - ${x.task}]\n${x.output}`).join("\n\n---\n\n")}
      ]}));
    }
    await addMsg("muse", `Workforce merge on \u201c${g.title}\u201d (${ok.length}/${TEAM.agents.length} subtasks delivered):\n\n${merged}`);
    await audit("workforce", `Workforce finished on "${g.title}" (${ok.length}/${TEAM.agents.length} ok)`);
    s.counters.actions++;
    setRT({last:"Workforce finished: "+g.title.slice(0,50)});
  }catch(e){
    await addMsg("sys", "Workforce run failed. " + friendlyModelError(e));
    await audit("error", `Workforce run failed on "${g.title}": ${String(e.message||e).slice(0,120)}`);
  }
  TEAM.active=false; TEAM.agents=[];
  setRT({state:"idle", step:"", tool:""});
  await Store.save(); renderAll();
}

/* ---------------- roster + automations (Eigent: custom workforce, scheduled runs) ----------------
   Roster: user-defined specialists the workforce coordinator can assign.
   Automations: recurring prompts fired on a schedule while the tab is open.
   Tab closed = orb asleep - missed runs surface as honest catch-ups, never
   phantom background runs, and an automation turn is a normal agent turn
   (sentinel approvals unchanged). */
const CADENCE_MS={hourly:36e5, daily:864e5, weekly:6048e5};
function renderWorkforce(){
  const s=S(); if(!s) return;
  const ac=$("#agentcount"); if(ac) ac.textContent=(s.agents||[]).length;
  const rl=$("#rosterlist");
  if(rl){
    rl.innerHTML=[
      ...Object.entries(AgentRoles).map(([r,p])=>({name:r,desc:p.split(". ").slice(1).join(". "),builtin:true})),
      ...(s.agents||[]).map(a=>({id:a.id,name:a.name,desc:a.prompt,builtin:false}))
    ].map(a=>{
      const tools=roleToolsAllowed(a.name);
      return `<div class="skill"><span class="txt"><b>${esc(a.name)}${a.builtin?" <span style='color:var(--dim2)'>(built-in)</span>":""}</b><span>${esc(a.desc)}</span><span class="small" style="display:block;color:var(--dim2);font-size:11px;margin-top:2px">Sees only its subtask + teammates' outputs - never your chats, memory, or keys. Tools: ${tools?"on":"off"}.</span></span><button class="btn" data-agtools="${esc(a.name)}" title="Tool access for this agent: web search, page fetch, calculator" style="padding:3px 9px">${tools?"⚙ on":"⚙ off"}</button>${a.builtin?"":`<button class="btn badb" data-agdel="${a.id}" style="padding:3px 9px">×</button>`}</div>`;
    }).join("");
    $$("#rosterlist [data-agtools]").forEach(b=>b.onclick=async()=>{
      const key=b.dataset.agtools.toLowerCase();
      s.roleTools=s.roleTools||{};
      const now=!roleToolsAllowed(key);
      s.roleTools[key]=now;
      await audit("scope",`Tools ${now?"enabled":"disabled"} for agent "${b.dataset.agtools}"`);
      await Store.save(); renderWorkforce();
    });
    $$("#rosterlist [data-agdel]").forEach(b=>b.onclick=async()=>{
      const i=s.agents.findIndex(x=>x.id===b.dataset.agdel);
      if(i>=0){ await audit("workforce",`Removed roster agent "${s.agents[i].name}"`); s.agents.splice(i,1); await Store.save(); renderWorkforce(); }
    });
  }
  const al=$("#autolist");
  if(al){
    const list=s.automations||[];
    al.innerHTML=list.length?list.map(a=>`<div class="rem"><span>⏱</span><span class="txt">${esc(a.text)}</span><span>${a.cadence} · ${a.status==="active"?"next "+fmtD(a.nextRun):"paused"} · ${a.runs||0} run${(a.runs||0)===1?"":"s"}</span>
      <button class="btn" data-autotoggle="${a.id}" style="padding:3px 9px">${a.status==="active"?"❚❚":"▶"}</button>
      <button class="btn badb" data-autodel="${a.id}" style="padding:3px 9px">×</button></div>`).join("")
      :`<div class="small" style="color:var(--dim2);font-size:12px">No automations yet.</div>`;
    $$("#autolist [data-autotoggle]").forEach(b=>b.onclick=async()=>{
      const a=s.automations.find(x=>x.id===b.dataset.autotoggle); if(!a) return;
      a.status=a.status==="active"?"paused":"active";
      if(a.status==="active" && new Date(a.nextRun).getTime()<Date.now()) a.nextRun=new Date(Date.now()+CADENCE_MS[a.cadence]).toISOString();
      await audit("automation",(a.status==="active"?"Resumed: ":"Paused: ")+`"${a.text}"`);
      await Store.save(); renderWorkforce();
    });
    $$("#autolist [data-autodel]").forEach(b=>b.onclick=async()=>{
      const i=s.automations.findIndex(x=>x.id===b.dataset.autodel);
      if(i>=0){ await audit("automation",`Removed automation: "${s.automations[i].text}"`); s.automations.splice(i,1); await Store.save(); renderWorkforce(); }
    });
  }
}
async function checkAutomations(){
  if(!S()) return;
  const s=S(); const now=Date.now(); let changed=false;
  for(const a of (s.automations||[])){
    if(a.status!=="active" || new Date(a.nextRun).getTime()>now) continue;
    const overdue=now-new Date(a.nextRun).getTime();
    a.lastRun=nowISO(); a.runs=(a.runs||0)+1;
    a.nextRun=new Date(now+CADENCE_MS[a.cadence]).toISOString();
    changed=true;
    runAutomation(a, overdue>Math.min(CADENCE_MS[a.cadence], 30*60*1000))
      .catch(async e=>audit("error","automation run failed: "+String(e).slice(0,120)));
  }
  if(changed){ await Store.save(); renderWorkforce(); }
}
async function runAutomation(a, late){
  if(TEAM.active){ await audit("automation",`Deferred "${a.text}" - a team/workforce owns the compute right now`); return; }
  await audit("automation",`Fired: "${a.text}" (${a.cadence})${late?" - late catch-up":""}`);
  if(!Broker.has("model") || S().settings.autonomy===false){
    await addMsg("sys", `⏱ Automation due: "${esc(a.text)}" - ${!Broker.has("model")?"no model key is set":"autonomy is off"}, so it is parked here instead of running blind. Fix the gate and it fires on its own next cycle.`);
    await Store.save(); renderChat(); return;
  }
  await addMsg("sys", `⏱ Automation firing${late?" (late catch-up - Muse was asleep at the scheduled time; nothing ran while the tab was closed)":""}: "${esc(a.text)}"`);
  await Store.save(); renderChat();
  await sendChat({text:a.text, origin:"automation"});
}

/* workforce view form bindings */
/* ---------- shareable team templates (OpenMausBot borrow) ----------
   Export the custom roster + automations as one JSON file; import merges a
   team file with fresh ids, name-dupe skips, and hard caps. */
$("#exportteambtn").addEventListener("click", async()=>{
  if(!S()) return;
  const agents=(S().agents||[]).map(a=>({name:a.name, prompt:a.prompt}));
  const automations=(S().automations||[]).map(a=>({text:a.text, cadence:a.cadence}));
  if(!agents.length && !automations.length){ toast("Nothing to share yet - add a custom agent or an automation first."); return; }
  const payload={format:"openmuse-team", v:1, exported:nowISO(), agents, automations, roleTools:S().roleTools||{}};
  downloadText("open-muse-team.json","application/json",JSON.stringify(payload,null,2));
  await audit("workforce",`Exported team template: ${agents.length} agents, ${automations.length} automations`);
  toast("Team file downloaded - share it anywhere.");
});
$("#importteambtn").addEventListener("click", ()=>$("#importteamfile").click());
$("#importteamfile").addEventListener("change", async e=>{
  const f=e.target.files[0]; e.target.value="";
  if(!f) return;
  if(f.size>512*1024){ toast("That file is too big to be a team template."); return; }
  let data;
  try{ data=JSON.parse(await f.text()); }
  catch(_){ toast("That file is not readable JSON - pick an Open Muse team file."); return; }
  if(!data || data.format!=="openmuse-team" || !Array.isArray(data.agents) || !Array.isArray(data.automations)){
    toast("That file is not an Open Muse team template."); return;
  }
  if(!S()) return;
  let addedA=0, addedU=0, skipped=0;
  const names=new Set([...Object.keys(AgentRoles).map(r=>r.toLowerCase()), ...(S().agents||[]).map(a=>a.name.toLowerCase())]);
  for(const a of data.agents.slice(0,50)){
    const name=String(a.name||"").trim().slice(0,40), prompt=String(a.prompt||"").trim().slice(0,280);
    if(!name || !prompt){ skipped++; continue; }
    if(names.has(name.toLowerCase())){ skipped++; continue; }
    names.add(name.toLowerCase());
    S().agents.push({id:uid("ag"), name, prompt, created:nowISO()});
    addedA++;
  }
  const haveAuto=new Set((S().automations||[]).map(a=>a.text.toLowerCase()));
  for(const a of data.automations.slice(0,50)){
    const text=String(a.text||"").trim().slice(0,280), cadence=["hourly","daily","weekly"].includes(a.cadence)?a.cadence:"daily";
    if(!text){ skipped++; continue; }
    if(haveAuto.has(text.toLowerCase())){ skipped++; continue; }
    haveAuto.add(text.toLowerCase());
    S().automations.push({id:uid("au"), text, cadence, status:"active", runs:0, created:nowISO(), nextRun:new Date(Date.now()+CADENCE_MS[cadence]).toISOString(), lastRun:""});
    addedU++;
  }
  if(data.roleTools && typeof data.roleTools==="object" && !Array.isArray(data.roleTools)){
    S().roleTools=S().roleTools||{};
    const valid=new Set([...Object.keys(AgentRoles).map(r=>r.toLowerCase()), ...(S().agents||[]).map(a=>a.name.toLowerCase())]);
    for(const [k,v] of Object.entries(data.roleTools)){
      const key=String(k).toLowerCase().slice(0,40);
      if(valid.has(key) && typeof v==="boolean") S().roleTools[key]=v;
    }
  }
  await audit("workforce",`Imported team template: ${addedA} agents, ${addedU} automations (${skipped} skipped)`);
  await Store.save(); renderWorkforce();
  toast(`Team imported: ${addedA} agent${addedA===1?"":"s"}, ${addedU} automation${addedU===1?"":"s"}${skipped?` (${skipped} skipped as duplicates or invalid)`:""}.`);
});

$("#addagentbtn").addEventListener("click", async()=>{
  if(!S()) return;
  const name=$("#newagentname").value.trim().slice(0,40), prompt=$("#newagentprompt").value.trim().slice(0,280);
  if(!name || !prompt){ toast("Give the agent a name and a specialty."); return; }
  if(Object.keys(AgentRoles).some(r=>r.toLowerCase()===name.toLowerCase()) || (S().agents||[]).some(a=>a.name.toLowerCase()===name.toLowerCase())){ toast("That name is already on the roster."); return; }
  S().agents.push({id:uid("ag"), name, prompt, created:nowISO()});
  $("#newagentname").value=""; $("#newagentprompt").value="";
  await audit("workforce",`Added roster agent "${name}"`);
  await Store.save(); renderWorkforce(); toast(name+" joined the roster.");
});
$("#newagentprompt").addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); $("#addagentbtn").click(); } });
$("#addautobtn").addEventListener("click", async()=>{
  if(!S()) return;
  const text=$("#newautotext").value.trim().slice(0,280), cadence=$("#newautocad").value;
  if(!text){ toast("Describe what Muse should do each run."); return; }
  if(!CADENCE_MS[cadence]) return;
  S().automations.push({id:uid("au"), text, cadence, status:"active", runs:0, created:nowISO(), nextRun:new Date(Date.now()+CADENCE_MS[cadence]).toISOString(), lastRun:""});
  $("#newautotext").value="";
  await audit("automation",`Scheduled (${cadence}): "${text}"`);
  await Store.save(); renderWorkforce(); toast("Automation scheduled.");
});
$("#newautotext").addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); $("#addautobtn").click(); } });


/* lock screen shared by boot and idle auto-lock. Sticky: backdrop clicks do
   not dismiss - locked means locked. */
function showLockScreen(reason){
  openModal(`<h3>Personal VM is locked</h3><div class="sub">${esc(reason||"This store is encrypted with your passphrase. Enter it to unlock.")}</div>
    <div class="field"><input type="password" id="unlockpass" placeholder="passphrase"></div>
    <div class="row"><button class="btn badb" id="wipeinstead">Erase and start fresh</button><button class="btn pri" id="unlockbtn">Unlock</button></div>`);
  $("#modalwrap").dataset.sticky="1";
  const tryUnlock = async ()=>{
    const btn=$("#unlockbtn"); btn.disabled=true; btn.textContent="Unlocking...";
    try{
      const wasIdleLock = !S();
      await Store.unlock($("#unlockpass").value);
      delete $("#modalwrap").dataset.sticky;
      closeModal();
      if(wasIdleLock){ renderAll(); await audit("lock","Unlocked after lock"); }
      armIdleLock();
      if(!window.__booted){ window.__booted=true; finishBoot(); }
    }
    catch(e){ toast("Wrong passphrase."); btn.disabled=false; btn.textContent="Unlock"; $("#unlockpass").select(); }
  };
  $("#unlockbtn").onclick=tryUnlock;
  $("#unlockpass").addEventListener("keydown", e=>{ if(e.key==="Enter") tryUnlock(); });
  setTimeout(()=>$("#unlockpass").focus(), 50);
  $("#wipeinstead").onclick=()=>{ Store.wipe(); location.reload(); };
}
/* idle auto-lock: with a passphrase set, 15 idle minutes wipes the decrypted
   state and derived key from memory. The at-rest store was always ciphertext;
   after lock, plaintext exists nowhere. */
const IDLE_LOCK_MS = 15*60*1000;
let idleTimer=null;
function armIdleLock(){
  clearTimeout(idleTimer);
  if(!(Store.locked && Store.passKey)) return;
  idleTimer=setTimeout(sessionLock, IDLE_LOCK_MS);
}
function sessionLock(){ doLock("Locked after 15 idle minutes. Your data is ciphertext again - enter your passphrase to continue."); }
async function manualLock(){
  if(!(Store.locked && Store.passKey)){ toast("Nothing to lock - set a Personal VM passphrase first and the store encrypts."); return; }
  await audit("lock","Manual lock from Settings");
  doLock("Locked manually. Your data is ciphertext again - enter your passphrase to continue.");
}
function doLock(reason){
  if(!(Store.locked && Store.passKey)) return;
  Store.passKey=null; Store.raw=null;
  clearTimeout(idleTimer);
  showLockScreen(reason);
}
["pointerdown","keydown","touchstart"].forEach(ev=>addEventListener(ev, armIdleLock, {passive:true}));

/* ---------------- PWA: offline shell, update flow, install prompt ----------------
   The service worker precaches the app shell so Open Muse boots with no
   network; model calls and tool fetches always go straight to the network.
   A new deploy surfaces as a calm "Update" bar - never a surprise reload.
   Install uses the browser's own prompt when it offers one; on iOS it is an
   honest instruction instead. Everything here no-ops silently where service
   workers or install prompts don't exist (including inside hosted embeds). */
const PWA = { deferred:null, swReg:null };
function pwaSupported(){ return "serviceWorker" in navigator && window.isSecureContext; }
async function pwaSetup(){
  if(!pwaSupported()) return;
  try{
    const reg = await navigator.serviceWorker.register("./sw.js", {updateViaCache:"none"});
    PWA.swReg = reg;
    if(sessionStorage.getItem("openmuse.updated")){
      sessionStorage.removeItem("openmuse.updated");
      toast("Updated to the latest version.");
      audit("settings","App updated to the latest version");
    }
    if(reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg);
    reg.addEventListener("updatefound", ()=>{
      const w = reg.installing; if(!w) return;
      w.addEventListener("statechange", ()=>{
        if(w.state==="installed" && navigator.serviceWorker.controller) showUpdateBar(reg);
      });
    });
    /* controllerchange also fires on first install (claim): the first swap we
       see only means "became controlled". Every later swap is a version change. */
    let sawController = !!navigator.serviceWorker.controller;
    let reloaded=false;
    navigator.serviceWorker.addEventListener("controllerchange", ()=>{
      if(reloaded) return;
      if(!sawController){ sawController=true; return; }
      reloaded=true;
      sessionStorage.setItem("openmuse.updated","1");
      location.reload();
    });
  }catch(_){ /* no SW here (embed, file://) - the app works the same without it */ }

  window.addEventListener("beforeinstallprompt", e=>{
    e.preventDefault();
    PWA.deferred = e;
    renderAppField();
  });
  window.addEventListener("appinstalled", ()=>{
    PWA.deferred = null;
    toast("Installed - Open Muse is on your home screen now.");
    audit("settings","App installed to home screen");
    renderAppField();
  });
  renderAppField();
}
function pwaStandalone(){
  return matchMedia("(display-mode: standalone)").matches || navigator.standalone===true;
}
function pwaIsIOS(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
}
function showUpdateBar(reg){
  const bar=$("#updatebar"); if(!bar) return;
  bar.hidden=false;
  $("#updatebtn").onclick=()=>{
    bar.hidden=true;
    if(reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
  };
  $("#updatelater").onclick=()=>{ bar.hidden=true; };
}
function renderAppField(){
  const f=$("#appfield"); if(!f) return;
  const status=$("#appstatus"), row=$("#appinstallrow"), note=$("#appnote");
  const offline = !!PWA.swReg;
  if(pwaStandalone()){
    f.hidden=false;
    status.textContent="You're running the installed app.";
    row.hidden=true;
    note.textContent=offline?"It boots offline; model calls and tool fetches still need a connection.":"";
    return;
  }
  if(PWA.deferred){
    f.hidden=false;
    status.textContent="Open Muse can live on your home screen, like any app.";
    row.hidden=false;
    $("#appinstallbtn").onclick=async()=>{
      const d=PWA.deferred; PWA.deferred=null; if(!d) return;
      d.prompt();
      try{ await d.userChoice; }catch(_){}
      renderAppField();
    };
    note.textContent=(offline?"Once installed it boots offline; model calls and tool fetches still need a connection.":"");
    return;
  }
  if(pwaIsIOS() && offline){
    f.hidden=false;
    status.textContent="Open Muse can live on your home screen, like any app.";
    row.hidden=true;
    note.textContent="On this device: tap Share, then Add to Home Screen. Once installed it boots offline; model calls and tool fetches still need a connection.";
    return;
  }
  f.hidden = !offline;
  if(offline){
    status.textContent="Open Muse works offline from this browser.";
    row.hidden=true;
    note.textContent="Model calls and tool fetches still need a connection.";
  }
}

(async function boot(){
  await Store.load();
  if(Store.locked){ showLockScreen(); }
  else { window.__booted=true; finishBoot(); }
})();
async function finishBoot(){
  armIdleLock();
  // first run on a fresh store: one welcome that says what this is and how to start
  if(!S().chat.length && !Broker.has("model")){
    await addMsg("muse", "Welcome to Open Muse - a personal agent that belongs to you. Everything it learns lives in this browser (encrypt it in Settings), and nothing runs anywhere but this tab.\n\nGive it a brain and it starts working: paste a **Gemini** key (free at aistudio.google.com/apikey - the most reliable free tier), pick **Local** with Ollama on this machine, or **EDGE//AI** on-device.");
    await addMsg("muse", `<div class="wactions"><button class="wchip" data-wa="settings">Set up a key</button><button class="wchip" data-wa="goal">Try: plan a weekend trip</button><button class="wchip" data-wa="recall">What do you remember?</button></div>`, "card");
    await Store.save();
  }
  {
    const dead=S().memory.filter(m=>!memAlive(m));
    if(dead.length){
      S().memory=S().memory.filter(memAlive);
      for(const m of dead) await audit("memory", `Forgot expired memory: "${m.text.slice(0,60)}"`);
      await Store.save();
    }
  }
  ensureConvos();
  renderAll();
  applyModeUI();
  if(Voice.supported()) $("#micbtn").hidden=false;
  restoreDraft();
  applyNetPolicy();
  applyAppearance();
  Compat.render();
  pwaSetup();
  if(S().settings.dockCollapsed){ document.body.classList.add("dock-collapsed"); $("#docktoggle").textContent = "\u2039"; }
  $("#docktoggle").addEventListener("click", async()=>{
    const c = document.body.classList.toggle("dock-collapsed");
    $("#docktoggle").textContent = c ? "\u2039" : "\u203a";
    S().settings.dockCollapsed = c; await Store.save();
  });
  const acb=$("#autonomycb"); if(acb){ acb.checked = S().settings.autonomy!==false;
    acb.addEventListener("change", async()=>{ S().settings.autonomy=acb.checked; await audit("settings","Autonomy "+(acb.checked?"on":"off")); await Store.save();
      if(acb.checked){ const g=S().goals.find(x=>x.status==="active"); if(g) autoAdvance(g.id); } }); }

  // orb sleep/wake: how long was Muse asleep?
  const gap = S().lastSeen ? Date.now()-new Date(S().lastSeen).getTime() : 0;
  if(gap > 30*60*1000){
    const hrs = Math.round(gap/360000)/10;
    await addMsg("sys", `Muse was asleep for ~${hrs}h - its orb lives in this tab, so nothing ran while it was closed. Catching up now.`);
  }
  S().lastSeen = nowISO(); await Store.save();
  setInterval(()=>{ if(S()){ S().lastSeen=nowISO(); Store.save(); } }, 60000);
  await checkReminders();
  setInterval(checkReminders, 20000);
  await checkAutomations();
  setInterval(checkAutomations, 30000);
  distillSession();
  $("#vmstate").innerHTML = Store.locked ? '<span class="d"></span>encrypted' : '<span class="d"></span>local';
  const active = S().goals.find(g=>g.status==="active");
  if(S().chat.length && active){
    const done = active.plan.steps.filter(x=>x.status==="done").length;
    const next = active.plan.steps.find(x=>x.status==="todo"||x.status==="approval");
    await addMsg("muse", `Welcome back. "${active.title}" is ${done}/${active.plan.steps.length} done${next?` - next up is "${next.title}"`:""}. Say "advance" and I'll keep moving.`);
    await Store.save();
  }
  if(!S().chat.length){
    await addMsg("muse","Hi - I'm Muse. I run entirely in your browser: your goals, memory and plans live here, not on someone's server. Tell me what needs to get done, or give me a goal and I'll plan it and start working. First, set up a brain in Settings: OpenRouter or Token Harbor keys work (Token Harbor has free models), or pick Local and point me at Ollama or LM Studio on this machine - then nothing leaves the device at all. There's also a privacy cloak in Settings that swaps private details for synthetic twins before any call goes out.");
    await addMsg("sys","Open Muse is open source. The agent is real - it thinks with your own model key - but it acts only inside this browser. External actions come back to you as drafts and preparations; the final send is always yours.");
    await Store.save(); renderChat();
  }
  setTimeout(proactiveNudge, 2500);
  setInterval(proactiveNudge, 10*60*1000);
  setTimeout(()=>{ const g=S() && S().goals.find(x=>x.status==="active"); if(g) autoAdvance(g.id); }, 6000);
  setPresence("idle");
}



/* ---------------- welcome quick actions ---------------- */
document.addEventListener("click", e=>{
  const b = e.target && e.target.closest ? e.target.closest("[data-wa]") : null;
  if(!b) return;
  const a=b.dataset.wa;
  if(a==="settings"){ switchView("settings"); }
  else if(a==="goal"){ const ta=$("#chatinput"); ta.value="my goal is to plan a weekend trip"; ta.focus(); }
  else if(a==="recall"){ sendChat({text:"what do you remember about me?", origin:"welcome-chip"}); }
  else if(a==="geminikey"){ window.open("https://aistudio.google.com/apikey","_blank","noopener"); }
});

/* ---------------- tactile: pointer tilt on physical cards ---------------- */
(function(){
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if(matchMedia("(pointer: coarse)").matches) return;
  let cur=null;
  const reset=()=>{ if(cur){ cur.classList.remove("tilt"); cur.style.removeProperty("--rx"); cur.style.removeProperty("--ry"); cur=null; } };
  document.addEventListener("pointermove", e=>{
    const card = e.target && e.target.closest ? e.target.closest(".goal,.suggest") : null;
    if(card!==cur){ reset(); cur=card; }
    if(!card) return;
    const r=card.getBoundingClientRect();
    if(!r.width || !r.height) return;
    const px=(e.clientX-r.left)/r.width-.5, py=(e.clientY-r.top)/r.height-.5;
    card.classList.add("tilt");
    card.style.setProperty("--ry",(px*4.5).toFixed(2)+"deg");
    card.style.setProperty("--rx",(-py*4.5).toFixed(2)+"deg");
  }, {passive:true});
  document.addEventListener("pointerout", e=>{ if(cur && !e.relatedTarget) reset(); }, true);
  document.addEventListener("pointerdown", reset, true);

  /* magnetic Send: leans a few px toward the pointer, springs back */
  const send=document.getElementById("sendbtn");
  if(send){
    send.addEventListener("pointermove", e=>{
      const r=send.getBoundingClientRect();
      const dx=e.clientX-(r.left+r.width/2), dy=e.clientY-(r.top+r.height/2);
      send.style.transform=`translate(${(dx*.08).toFixed(1)}px, ${(dy*.12).toFixed(1)}px)`;
    });
    send.addEventListener("pointerleave", ()=>{ send.style.transform=""; });
  }
})();

/* close goal overflow menus on any outside click */
document.addEventListener('click',()=>{ $$('.gmenu-pop.open').forEach(x=>x.classList.remove('open')); });
