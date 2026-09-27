#!/usr/bin/env node
/* control-openmuse.mjs - the verification path for Open Muse (RULE 5).
   Every verification claim about the app comes through this CLI, not
   throwaway scripts. JSON on stdout, always. Destructive actions require
   --yes, and --dry-run prints the intended action without touching state.
   Exit 1 with {ok:false,error:"..."} on failure - descriptive, never silent. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
const run = promisify(execFile);
const BASE = process.env.OPENMUSE_URL || 'http://127.0.0.1:8971/';
const CHROME = '/usr/bin/google-chrome';
const out = (o, code=0) => { process.stdout.write(JSON.stringify(o,null,1)+"\n"); process.exit(code); };
const fail = (msg, extra={}) => out({ ok:false, error: msg, ...extra }, 1);

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (n) => { const i=args.indexOf(n); return i<0 ? null : args[i+1]; };
const has = (n) => args.includes(n);

async function browser(){
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const puppeteer = require('/home/sandbox/node_modules/puppeteer-core');
  return puppeteer.launch({ executablePath: CHROME, headless: 'new', args:['--no-sandbox','--disable-dev-shm-usage'] });
}
async function page390(b){
  const p = await b.newPage();
  await p.setViewport({ width:390, height:844 });
  return p;
}

if(cmd==='doctor'){
  const checks = [];
  const push = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail ?? null });
  try { await fs.promises.access(CHROME); push('chrome binary present', true); }
  catch { push('chrome binary present', false, CHROME+' not found'); }
  let up=false, bytes=0;
  try { const r = await run('curl',['-s','-o','/dev/null','-w','%{http_code} %{size_download}',BASE],{timeout:8000});
        const [code,size] = r.stdout.trim().split(' ').map(Number); up = code===200; bytes = size; }
  catch(e){ push('server responds 200', false, 'curl failed: '+(e.message||e)); }
  push('server responds 200', up, BASE+' -> '+(up?'200':'unreachable'));
  push('index serves real bytes', bytes>10000, bytes+' bytes');
  if(up){
    let b;
    try{
      b = await browser();
      const p = await page390(b);
      const errors = [];
      p.on('pageerror', e=>errors.push(String(e)));
      await p.goto(BASE,{waitUntil:'networkidle2',timeout:30000});
      const probe = await p.evaluate(async ()=>{
        const tests = await runSelfTests();
        return { tests, version: (document.querySelector('script[src^="app.js"]')||{}).src || '',
                 hasComposer: !!document.querySelector('#chatinput'),
                 convos: (S().convos||[]).length, drafts: Object.keys(S().drafts||{}).length };
      });
      push('page loads without JS errors', errors.length===0, errors.length? errors.join(' | ').slice(0,200) : null);
      push('composer present', probe.hasComposer);
      const failed = probe.tests.filter(t=>!t.pass && t.name!=='model key configured');
      push('self-tests pass (excluding designed fresh-state key row)', failed.length===0,
           probe.tests.length+' tests, failed: '+(failed.map(t=>t.name).join(',')||'none'));
      push('state readable (non-vacuous: convos>=1)', probe.convos>=1, 'convos='+probe.convos+' drafts='+probe.drafts);
      await b.close();
    }catch(e){ push('browser probe', false, String(e.message||e).slice(0,200)); if(b) await b.close().catch(()=>{}); }
  }
  const ok = checks.every(c=>c.pass);
  out({ ok, checks }, ok?0:1);
}

else if(cmd==='snapshot'){
  const b = await browser();
  try{
    const p = await page390(b);
    const errors = [];
    p.on('pageerror', e=>errors.push(String(e)));
    await p.goto(BASE,{waitUntil:'networkidle2',timeout:30000});
    const snap = await p.evaluate(()=>{
      const s = S();
      return {
        view: location.hash || 'chat', convos: (s.convos||[]).length, activeConvo: s.activeConvo,
        chatMessages: (s.chat||[]).length, drafts: Object.keys(s.drafts||{}).length,
        prompts: (s.prompts||[]).length, memory: (s.memory||[]).length, goals: (s.goals||[]).length,
        provider: s.settings.provider, model: s.settings.model||null,
        engineLoaded: (typeof LocalEngine!=='undefined' && LocalEngine.loadedModel) || null,
        auditEntries: (s.audit||[]).length,
        appJsVersion: ((document.querySelector('script[src^="app.js"]')||{}).src||'').split('v=')[1]||null
      };
    });
    await b.close();
    out({ ok:true, snapshot: snap, pageErrors: errors });
  }catch(e){ await b.close().catch(()=>{}); fail('snapshot failed: '+String(e.message||e).slice(0,200)); }
}

else if(cmd==='screenshot'){
  const file = flag('--out') || '/tmp/openmuse-shot.png';
  const view = flag('--view');
  const setup = flag('--setup');
  const b = await browser();
  try{
    const p = await page390(b);
    await p.goto(BASE,{waitUntil:'networkidle2',timeout:30000});
    if(setup){ await p.evaluate(async (code)=>{ await (new Function('return ('+code+')'))(); }, setup); await new Promise(r=>setTimeout(r,400)); }
    if(view){ await p.evaluate(v=>switchView(v), view); await new Promise(r=>setTimeout(r,400)); }
    await p.screenshot({ path: file });
    const size = fs.statSync(file).size;
    await b.close();
    if(size < 5000) fail('screenshot looks empty ('+size+' bytes) - refusing to claim success', {path:file});
    out({ ok:true, path:file, bytes:size, view: view||'default' });
  }catch(e){ await b.close().catch(()=>{}); fail('screenshot failed: '+String(e.message||e).slice(0,200)); }
}

else if(cmd==='wait-settle'){
  const b = await browser();
  try{
    const p = await page390(b);
    await p.goto(BASE,{waitUntil:'networkidle2',timeout:30000});
    const settled = await p.evaluate(async ()=>{
      const t0 = Date.now();
      while(Date.now()-t0 < 8000){
        const busy = document.querySelector('.toast.show,#toast.show') || (typeof LocalEngine!=='undefined' && LocalEngine._load);
        if(!busy) return { settled:true, afterMs: Date.now()-t0 };
        await new Promise(r=>setTimeout(r,250));
      }
      return { settled:false };
    });
    await b.close();
    out({ ok: settled.settled, ...settled }, settled.settled?0:1);
  }catch(e){ await b.close().catch(()=>{}); fail('wait-settle failed: '+String(e.message||e).slice(0,200)); }
}

else if(cmd==='eval'){
  const text = flag('--text');
  if(!text) fail('eval needs --text \'<js expression or async iife>\'');
  const b = await browser();
  try{
    const p = await page390(b);
    await p.goto(BASE,{waitUntil:'networkidle2',timeout:30000});
    const result = await p.evaluate(async (code)=>{
      try{ const v = await (new Function('return ('+code+')'))(); return { ok:true, value: v===undefined?null:v }; }
      catch(e){ return { ok:false, error: String(e && e.message || e).slice(0,300) }; }
    }, text);
    await b.close();
    out(result, result.ok?0:1);
  }catch(e){ await b.close().catch(()=>{}); fail('eval failed: '+String(e.message||e).slice(0,200)); }
}

else if(cmd==='interact'){
  const action = flag('--do');
  const sel = flag('--selector');
  const text = flag('--text');
  if(!action || !sel) fail('interact needs --do click|type|delete-convo --selector <css> [--text ...]');
  const destructive = action.startsWith('delete');
  if(has('--dry-run')) out({ ok:true, dryRun:true, would:{ action, selector:sel, text: text??null } });
  if(destructive && !has('--yes')) fail('refusing destructive action "'+action+'" without --yes (or pass --dry-run to preview)');
  const b = await browser();
  try{
    const p = await page390(b);
    await p.goto(BASE,{waitUntil:'networkidle2',timeout:30000});
    const found = await p.$(sel);
    if(!found) { await b.close(); fail('selector matched nothing: '+sel); }
    if(action==='click') await p.click(sel);
    else if(action==='type'){ await p.click(sel); await p.type(sel, text||''); }
    else if(destructive) await p.click(sel);
    else { await b.close(); fail('unknown --do action: '+action); }
    await new Promise(r=>setTimeout(r,300));
    await b.close();
    out({ ok:true, did:{ action, selector:sel } });
  }catch(e){ await b.close().catch(()=>{}); fail('interact failed: '+String(e.message||e).slice(0,200)); }
}

else {
  fail('unknown command: '+(cmd||'(none)'), { usage:'control-openmuse.mjs doctor|snapshot|screenshot --out f.png [--view v]|wait-settle|interact --do ... --selector ... [--text ...] [--dry-run] [--yes]' });
}
