# Checkpoint

_Last updated: 2026-09-23 (IST)_

## Where things stand
- **GitHub Pages** (https://aeiouvcode.github.io/open-muse/): verified byte-exact (sha256) against repo at commit `035c292` on 2026-09-22 15:09 IST. Repo HEAD is now `a94acaa` (owner's README/screenshot/.gitignore commit — docs-only, no app change).
- **Instinct File**: `file-01M326APAT2KA6SM3C2HG5XAEB`, generation 11, revision `filerevision-01M347TZY277ASK4CB0GZ3G93P`, PRIVATE. Canonical URL: https://files.instinct.com/file-01M326APAT2KA6SM3C2HG5XAEB

## Completed (most recent first)
- 2026-09-23: Rival model grading, final consolidated report (see CURRENT_TASK.md).
- 2026-09-22 PM: Cybersecurity pass — PASS after fixing studio-frame `postMessage` targetOrigin (`*` → strict origin). Pushed to Pages, verified byte-exact. Instinct File port rebuilt from scratch (workspace had been wiped) and published as gen 11.
- 2026-09-22 AM: Final gauntlet — ran owner's real key through the live app in the cloud browser. Fixed the two "doesnt work" root causes (see Failed approaches). Design/chrome pass (focus rings, 44px touch targets, select chevrons, toast motion, reduced-motion). Both surfaces updated and verified.
- Earlier: Eigent-style Workforce runs, Team/Swarm modes, Atelier redesign, Studio (user-built miniapps in sandboxed iframe).

## Failed approaches / traps (do not retry blindly)
- **Model tester probing with `max_tokens: 1` + demanding reply text**: Gemini thinking models spend the whole 1-token budget on thought → 200 with empty content → tester reported every model broken. Probe now passes on HTTP 200 + a `choices` array, never on reply text.
- **Hardcoded Gemini model id lists**: ids churn fast (`gemini-2.5-flash` 404'd live; 2.5 ids "no longer available to new users"). Always trust the live native catalog + tester over any id list.
- **Chat without a stream watchdog**: provider 503s under load left streams sitting at zero bytes forever. Chat now has a 45s/90s stall watchdog.
- **Old vault entry "GitHub aeiouvcode repo push token"**: deleted 2026-09-22, will 401. Current entry: **"GitHub push token - aeiouvcode"**.
- **Mock/canned no-key replies**: treated by the owner as a betrayal, not a feature. Never ship one.
- **Pushing without bumping cache-busts**: browsers serve stale files. Bump BOTH `app.js?v=` and `styles.css?v=` in index.html on every push.

## Open question (reported 2026-09-21, never answered)
- Does the Instinct platform viewer chrome on hosted Files violate the no-branding rule? Pages is clean regardless.
