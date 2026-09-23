# CURRENT_TASK — Open Muse (updated 2026-09-23 17:42 IST)

## Status: on-device engine WORKING live; conversation search shipped
Engine proven live 2026-09-23 ~16:02 IST (SmolLM2-360M, wasm/q4, streams chat).
This cycle shipped conversation search (top of the competitor-critique queue).

## Shipped this cycle (search)
- Conversation search over the current stream: magnifier button in the chat
  header opens a search bar; matches are outlined in-stream, count shows
  "n/N", prev/next (or Enter/Shift+Enter) cycles and centers the match,
  Escape/X closes. Highlights re-apply after every render; state lives only in
  the DOM (nothing stored). Verified at 390px: hit on user bubble and muse
  bubble both readable (cur = accent ring + soft halo; a background-tint
  version washed out the user bubble - fixed before ship).

## Instinct File
Gen 13 PUBLISHED (PRIVATE): https://files.instinct.com/file-01M326APAT2KA6SM3C2HG5XAEB
Engine excluded from the File (see HANDOFF). File port at
/home/sandbox/open-muse-file regenerates openmuse.ts/body.ts/style.css from
the repo; sync it, build, preview in LOCAL Chrome, gen 13 published (revision filerevision-01M3734HXS3CQ6EBTXAGHJM4QK).

## Next actions (in order)
1. Chat branching (LibreChat/Jan gap - retry-as-branch).
2. Default-model note: SmolLM2-360M rambles; consider Qwen3-0.6B default.
3. WebGPU verification on real GPU hardware (QA browser has no adapter).

## Standing rules
No Instinct branding/wordplay user-visible; humanized errors only; no secrets in
repo; reimplement natively; honest PASS/PARTIAL/FAIL grading; security pass
every cycle; 390px-first design QA; deploy via PAT bridge (vault:
"GitHub push token - aeiouvcode"), clear the token field after every push.
