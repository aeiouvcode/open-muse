# CHECKPOINT - 2026-09-25 00:45 IST
- Cycle COMPLETE: PWA shipped + deployed + File gen 19 PUBLISHED (PRIVATE,
  revision filerevision-01M3ADD6DFER8FWAY0847RJ6GF). Manifest + maskable
  icons, versioned SW precache (offline boot, API traffic never cached),
  consent-based update bar with old-cache purge + post-update toast,
  install prompt (native / iOS instruction), "This app" settings row that
  hides inside the hosted File. QA: 5/5 shell checks (manifest, SW
  control, offline boot, settings row, install flow) + 4/4 update e2e
  (bar, new cache, old purge, toast) + 6/6 File preview, zero real console
  errors. Two real bugs found by QA and fixed: runtime CSP rewrite
  stripping manifest-src, first-install spurious reload.
- Deploy rule (new): sw.js VERSION must equal index.html ?v= - bump both
  together every deploy (HANDOFF has the details).
- Roadmap: credential-broker formalization, then default-model eval
  (SmolLM2-360M vs Qwen3-0.6B) + WebGPU on real hardware.
