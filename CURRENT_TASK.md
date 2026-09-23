# CURRENT_TASK — Open Muse (updated 2026-09-23 16:28 IST)

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

## Done 16:28 IST
- 8a7c200 custom HF repo field for the engine (any ONNX instruct repo with
  q4/q4f16) + friendly not-found error. Deployed (c43832b).
- Instinct File gen 12 PUBLISHED (PRIVATE): https://files.instinct.com/file-01M326APAT2KA6SM3C2HG5XAEB
  Engine excluded from the File (70MB wasm + Cache API not shippable/guaranteed
  in the File sandbox; external script/wasm origins blocked) - provider option
  hidden via App.tsx patch. Verified in local Chrome: boots, providers correct,
  honest no-key refusal, zero console errors. Cloud-browser viewer iframes fail
  for ALL revisions (environment), bundle leases ~60s - QA previews locally.
- Competitor critique sent to parent (Jan/LibreChat/Chatbox); top fix shipped =
  the custom-repo field (model breadth); next top items below.

## Next actions (in order)
1. Next improvement cycle from the critique: conversation search, then
   branching (LibreChat/Jan gap), chat export polish.
2. WebGPU verification on real GPU hardware (QA browser has no adapter).
3. Default-model note: SmolLM2-360M rambles; consider Qwen3-0.6B as default.

## Standing rules
No Instinct branding/wordplay user-visible; humanized errors only; no secrets in
repo; reimplement natively; 390px-first design QA; honest PASS/PARTIAL/FAIL;
security pass every cycle; state files updated every cycle; vault-fill bridge:
verify patLen==93 AND chatLen==0 after every fill, clear after every push.
