# CURRENT_TASK — Open Muse (updated 2026-09-23 15:30 IST)

## Active: built-in on-device engine (transformers.js) — hardening
Engine shipped and deployed (main @ a4c08d7). Remaining: model load dies in the
cloud QA browser partway through the ~370MB weight download ("Model call failed:
network error"), even with 24MB ranged chunks + retries. Direct range probes from
the same page succeed, so it is not CDN throttling. Discriminator test running:
same chunked loop in page context (jsjob-1) vs worker context.

## Next actions (in order)
1. Read jsjob-1 result (page-side full 369MB chunked download, cloud browser tab 1).
   - If page succeeds: failure is worker-context specific -> move weight download
     to the main thread: prefetch model files into Cache API ("transformers-cache")
     from app.js, then worker pipeline() reads cache (offline path unchanged).
     File list via HF API: /api/models/{model}/tree/main?recursive=true
     (config.json, generation_config.json, tokenizer.json, tokenizer_config.json,
     onnx/model_q4.onnx or model_q4f16.onnx by device).
   - If page also stalls: environment (Browserbase) cap on long downloads; test
     resume-across-retries instead (keep completed chunks in IndexedDB, resume on
     next Load click; currently every retry restarts the file).
2. Strip QA instrumentation (RAWERR notice) once diagnosed -> commit 23fca62 is
   LOCAL ONLY, never push as-is without stripping.
3. Full happy-path QA: load SmolLM2-360M, chat "Reply with exactly: PONG",
   verify streamed reply, screenshot 390px.
4. Publish Instinct File gen 12 (file-01M326APAT2KA6SM3C2HG5XAEB, PRIVATE) from
   repo: needs huggingface.co + *.cdn.hf.co origins in file.json + worker/vendor
   bundling; assess feasibility (single-file constraint vs worker + wasm binaries).
5. Competitor-critique pass (standing directive): rivals = LibreChat / Jan /
   Chatbox-class BYO-key clients + rival "Muse" paste (grading files may be wiped;
   observations DB has chat history). Name where we lose, fix top items.
6. Full cycle report to parent: grade, frames, jsep landed + duplicate commit
   note (d2d567d dup of 4d1e66e), race fix (fdc13b6), resumable downloads
   (a4c08d7), competitor critique, state-file confirmation.

## Standing rules
No Instinct branding/wordplay user-visible; humanized errors only; no secrets in
repo; reimplement natively; 390px-first design QA; honest PASS/PARTIAL/FAIL;
security pass every cycle; state files updated every cycle.
