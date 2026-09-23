# Current Task

_Last updated: 2026-09-23 (IST)_

## Active cycle
**Built-in on-device engine (owner directive 2026-09-23: "use a respective engine or library for framework ... something that improves our project even more").** Replacing the hand-rolled on-device path with a real inference foundation: transformers.js 4.3.0 (vendored, pinned) on ONNX Runtime Web, WebGPU + WASM fallback, running in a module worker behind the existing provider interface. New provider "On-device (built-in)" with an engine panel in Settings (model catalog, download progress, load/unload), humanized engine errors, cloak bypassed on-device (nothing leaves), stop-button support, CSP tightened to an explicit connect-src allowlist (open network mode swaps wide). Local 390px QA in progress. Then: deploy (vendor binaries via in-page fetch->GitHub API), deployed-build QA, self-critique + security pass, report.

## Last completed cycle
**Rival model grading (2026-09-23).** Graded a rival model's "Muse" prompt output (delivered in 4 truncated WhatsApp batches) against this repo and the prompt's own spec. Verdict delivered: real strengths (net.js egress chokepoint + ledger + fetch freeze, post-wipe VERIFY report, cloak NER/twin pools, approval-gated memory, tree branching) and real bugs (boot-breaking truncated app.js + bad `$$$$` import, all sealed messages silently dropped on reload due to orphan key re-derivation, mock default provider with canned replies). Ranked steal list delivered.

## Next actions (candidates, not started — need owner go-ahead)
1. Implement ranked steal list, in order:
   - net.js-style `guardedFetch` egress chokepoint: egress ledger, pre-flight PII abort, global fetch freeze option
   - post-wipe VERIFY report on erase
   - cloak NER cues + twin pools + tracking-param scrubber
   - approval-gated memory writes
   - conversation tree branching with regenerate
   - `proveNoRawPII` outbound re-scan
2. Grade the rival's `index.html` / `verify.mjs` / `SECURITY.md` if they ever arrive (offered; `verify.mjs` would be run, not just read).

## Standing obligations every cycle
- Rigorous self-critique before reporting (weakest point first; fix, then report residuals honestly).
- Cybersecurity pass before reporting: no secrets in repo/history, no unexpected egress, no injection sinks (unsanitized innerHTML), nothing phoning home. Grade PASS/PARTIAL/FAIL.
- 390px-phone-first design QA before shipping.
- Keep CURRENT_TASK.md / CHECKPOINT.md / HANDOFF.md current each cycle.
