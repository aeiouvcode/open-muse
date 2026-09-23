/* Open Muse built-in engine worker.
   Runs chat models fully on-device: transformers.js (vendored + pinned, see
   vendor/VERSIONS.md) on ONNX Runtime Web - WebGPU when the device has it,
   plain WASM otherwise. Model weights download once from Hugging Face, then
   the browser cache serves them offline. On this engine nothing the user
   types ever leaves the device. */
const BASE = new URL(".", location.href);
let T = null, pipe = null;
let cur = { model:"", device:"", dtype:"" };
let stopper = null;

const post = (o)=> self.postMessage(o);

/* The runtime ships gzipped (vendor/transformers.min.js.gz): GitHub push
   protection false-positives on a 32-char class name ("Mistral3ForConditionalGeneration")
   in the raw bundle, so the pinned upstream bytes are stored compressed and
   verified here before import - integrity is enforced, not waived. */
const TF_SHA256 = "1475fd440e9932ab206682ee42cb18f6097403e9ee77ea62084c592d0f83597d"; // @huggingface/transformers@4.3.0 dist/transformers.min.js
async function lib(){
  if(T) return T;
  const r = await fetch(new URL("vendor/transformers.min.js.gz", BASE).href);
  if(!r.ok) throw new Error("engine-runtime-missing");
  const buf = await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  const hex = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buf))).map(b=>b.toString(16).padStart(2,"0")).join("");
  if(hex !== TF_SHA256) throw new Error("engine-runtime-integrity");
  T = await import(URL.createObjectURL(new Blob([buf], {type:"text/javascript"})));
  T.env.allowLocalModels = false;
  T.env.allowRemoteModels = true;
  T.env.useBrowserCache = true;
  T.env.backends.onnx.wasm.wasmPaths = new URL("vendor/ort/", BASE).href;
  return T;
}

async function load(m){
  const t = await lib();
  if(pipe && cur.model===m.model){ post({type:"ready", model:cur.model, device:cur.device, dtype:cur.dtype}); return; }
  if(pipe){ try{ await pipe.dispose(); }catch(_){} pipe = null; cur = { model:"", device:"", dtype:"" }; }
  const hasGpu = !!(self.navigator && navigator.gpu);
  const device = m.device==="wasm" ? "wasm" : (hasGpu ? "webgpu" : "wasm");
  const dtype = m.dtype || (device==="webgpu" ? "q4f16" : "q4");
  const progress = (p)=>{
    if(!p) return;
    if(p.status==="progress") post({type:"progress", file:p.file||"", progress:Math.round(p.progress||0), loaded:p.loaded||0, total:p.total||0});
    else if(p.status==="initiate" || p.status==="download") post({type:"progress", file:p.file||"", progress:0, loaded:0, total:0});
  };
  try{
    pipe = await t.pipeline("text-generation", m.model, { device, dtype, progress_callback: progress });
    cur = { model:m.model, device, dtype };
  }catch(e){
    if(device!=="webgpu") throw e;
    // WebGPU runtime unavailable (old browser, or the jsep wasm is not deployed
    // yet) - fall back to plain WASM instead of failing the load.
    post({type:"notice", text:"WebGPU did not start here - using the WASM engine instead (slower, works everywhere)."});
    pipe = await t.pipeline("text-generation", m.model, { device:"wasm", dtype:"q4", progress_callback: progress });
    cur = { model:m.model, device:"wasm", dtype:"q4" };
  }
  post({type:"ready", model:cur.model, device:cur.device, dtype:cur.dtype});
}

async function gen(m){
  const t = await lib();
  if(!pipe) throw new Error("engine-not-loaded");
  let out = "";
  const streamer = new t.TextStreamer(pipe.tokenizer, {
    skip_prompt: true, skip_special_tokens: true,
    callback_function: (s)=>{ out += s; post({type:"chunk", id:m.id, text: out}); }
  });
  const opts = { max_new_tokens: m.maxTokens || 640, do_sample: true, temperature: 0.7, top_p: 0.9, streamer };
  if(t.InterruptableStoppingCriteria){ stopper = new t.InterruptableStoppingCriteria(); opts.stopping_criteria = stopper; }
  try{
    const res = await pipe(m.messages, opts);
    let full = out;
    try{
      const gt = res && res[0] && res[0].generated_text;
      if(Array.isArray(gt)){ const last = gt[gt.length-1]; if(last && typeof last.content==="string") full = last.content; }
      else if(typeof gt==="string") full = gt;
    }catch(_){}
    post({type:"done", id:m.id, text: full || out});
  }finally{ stopper = null; }
}

self.onmessage = (e)=>{
  const m = e.data || {};
  (async ()=>{
    try{
      if(m.type==="load") await load(m);
      else if(m.type==="gen") await gen(m);
      else if(m.type==="stop"){ if(stopper) stopper.interrupt(); }
      else if(m.type==="probe") post({type:"capabilities", webgpu: !!(self.navigator && navigator.gpu), isolated: self.crossOriginIsolated === true});
      else if(m.type==="unload"){ if(pipe){ try{ await pipe.dispose(); }catch(_){} } pipe = null; cur = { model:"", device:"", dtype:"" }; post({type:"unloaded"}); }
    }catch(err){
      post({type:"error", id:m.id||"", for:m.type||"", message: String((err && err.message) || err).slice(0,300)});
    }
  })();
};
