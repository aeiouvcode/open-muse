# CHECKPOINT - 2026-09-24 23:42 IST
- Cycle: per-agent sandbox scopes shipped (gen 18) - per-agent tool toggles on
  every roster row, enforced at tool-execution time in workforce runs, denials
  audited + agent re-asked, scope overrides ride team template files, honest
  same-tab-isolation copy. QA: 14/14 puppeteer checks PASS at 390px (toggle,
  persistence across reload, custom-agent assignment via coordinator, tool
  executed when on / denied + audited when off, merge path, zero real console
  errors).
- Roadmap: next = credential-broker formalization, then PWA manifest + install
  prompt, then default-model eval (SmolLM2-360M vs Qwen3-0.6B) + WebGPU on real
  hardware.
- Pending: commit + PAT-bridge push, live-bytes verify, File gen 18 publish.
