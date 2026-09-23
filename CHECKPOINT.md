# CHECKPOINT — 2026-09-23 16:05 IST
- Deployed main: 61dacfd. Engine load + streamed chat VERIFIED live (wasm/q4,
  SmolLM2-360M) at 390px. Screenshot: /downloads/cloud-browser-20260923-103354.png.
- Deploy saga this cycle: worker-context downloads die >150-260MB in cloud browser
  (page context fine) -> main-thread prefetch fix (6c6c381); then ORT asyncify
  runtime missing -> vendored (61dacfd, sha256-pinned, byte-verified live).
- Local git synced with origin/main (61dacfd).
- Bridge lease L-ohqeww3cnct23br4qiqizw35au tab 1: token CLEARED, page has
  engine model loaded, viewport mobile 390x844, weights cached in browser
  (transformers-cache) - future QA loads are instant. CDP reconnects reset
  tab to about:blank once; re-navigate if so.
- File gen 12 NOT started. Competitor critique NOT done. WebGPU untested.
