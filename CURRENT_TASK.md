# CURRENT_TASK — Open Muse (updated 2026-09-23 16:05 IST)

## Status: built-in on-device engine WORKING on deployed build
Proven live 2026-09-23 ~16:02 IST on the deployed site (cloud browser, 390px):
SmolLM2-360M-Instruct-ONNX loads (wasm/q4) and streams chat replies end to end.
Screenshot: /downloads/cloud-browser-20260923-103354.png (task workspace).

## Shipped this cycle (main @ 61dacfd)
- fdc13b6 model-select race fix (stale catalog dropped on provider switch) - verified live.
- a4c08d7 resumable downloads (24MB ranged chunks + retries in worker).
- 6c6c381 main-thread prefetch into Cache API 'transformers-cache' (key = HF
  resolve URL): worker-context long downloads die past ~150-260MB on some
  networks (proven: same chunked loop completes 369MB in page context, fails in
  worker); app.js now picks device via navigator.gpu.requestAdapter, prefetches
  config/tokenizer/weights (q4f16 for WebGPU, q4 for WASM), worker reads cache.
  Completed files survive retries.
- 61dacfd vendored ORT asyncify pair - the WASM backend requires
  ort-wasm-simd-threaded.asyncify.{mjs,wasm}; without it load failed with
  "no available backend found". Hashes pinned in vendor/VERSIONS.md.

## Next actions (in order)
1. Publish Instinct File gen 12 (file-01M326APAT2KA6SM3C2HG5XAEB, PRIVATE) from
   repo: needs huggingface.co + *.cdn.hf.co origins in file.json + worker/vendor
   bundling; assess single-file feasibility (worker + 40MB of wasm may not fit).
2. Competitor-critique pass (standing directive): LibreChat / Jan / Chatbox-class
   BYO-key clients + rival "Muse" paste. Name where we lose, fix top items.
3. Full cycle report to parent with competitor critique.
4. Nice-to-haves: default model instruction-following is weak (SmolLM2-360M
   rambles) - consider prompting template or noting Qwen3-0.6B as the better
   default; WebGPU path untested (QA browser has no adapter).

## Standing rules
No Instinct branding/wordplay user-visible; humanized errors only; no secrets in
repo; reimplement natively; 390px-first design QA; honest PASS/PARTIAL/FAIL;
security pass every cycle; state files updated every cycle; vault-fill bridge:
verify patLen==93 AND chatLen==0 after every fill, clear after every push.
