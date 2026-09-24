# CURRENT_TASK — Open Muse (updated 2026-09-24 23:42 IST)

## Status: engine live; search + branches + sessions + checkpoints + team templates + agent scopes shipped
Agent scopes shipped (this cycle, gen 18): every workforce agent now runs with
an explicit, per-agent tool scope. Roster rows (built-in and custom) carry a
one-tap tools toggle (web search, page fetch, calculator - researcher on by
default, everything else off) and a plain-data-flow line: an agent sees only
its subtask and its teammates' outputs, never chats, memory, or keys. Denied
tool calls are blocked at execution time, logged to the audit trail
(kind "scope"), and the agent is re-asked to answer from knowledge. Running
agents show a gear marker in the status rail when tools are on. Team template
files (gen 17 format, still v1) now carry scope overrides too, validated on
import. Honest labeling throughout: same-tab isolation, not a separate machine.
Also fixed: favicon 404 (inline SVG orb), truncated researcher description.
Earlier: team templates af0993f (gen 17), checkpoints 7e0d224 (gen 16),
sessions 60fc882 (gen 15), branches 0e7b349 (gen 14), search (gen 13).
Engine proven live 2026-09-23 ~16:02 IST (SmolLM2-360M, wasm/q4, streams chat).

## Status: engine live; search + branches + sessions + checkpoints + team templates shipped
Team templates deployed as af0993f; File gen 17 PUBLISHED (PRIVATE, revision
filerevision-01M39N1ZBHME1XDYT0EQRGMJHH): Share team / Import team in the
Workforce roster - one JSON file carries custom agents + automations, import
validates format, skips name dupes (incl. built-ins), caps at 50 each,
regenerates ids, coerces bad cadences to daily. Earlier: checkpoints 7e0d224
(gen 16), sessions 60fc882 (gen 15).
Checkpoints deployed as 7e0d224; File gen 16 PUBLISHED (PRIVATE, revision
filerevision-01M3915NN54H3A1812VBQD2VXC): named chat save-states, restore
(auto-saves current first), fork-into-new-chat. Earlier: sessions 60fc882
(gen 15), branches 0e7b349 (gen 14), search (gen 13).
Sessions deployed as 60fc882; File gen 15 PUBLISHED (PRIVATE, revision
filerevision-01M38BZ0JP3W60PHPECHNQANHM): chat list in the rail
(new/switch/rename/delete, auto-names from first user message) +
cross-conversation search chips that jump to the matching chat. Branching
deployed earlier as 0e7b349 (File gen 14).
Branches deployed as 0e7b349; File gen 14 PUBLISHED (PRIVATE, revision
filerevision-01M37RHTVW751A8M1YMEE8C2CJ) after local-Chrome QA (branch 2/2
flip, search coexistence, zero console errors).
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

## Competitive push (Naksh steering 2026-09-23 ~19:56 IST)
"Make Open Muse substantially better - a competitive alternative." Benchmark:
LibreChat (leading open ChatGPT-style app) + Jan (on-device reference). Plan
reported to parent 20:18 IST. Roadmap, in order:
1. Shareable workforce templates as JSON export/import (borrows OpenMausBot
   community team templates).
1. Per-agent sandbox scopes for roster agents (borrows per-bot sandbox VM;
   honestly labeled same-tab isolation).
2. Credential broker formalization (single egress gate, per-scope key access,
   key use in audit log).
3. PWA manifest + install prompt (honest answer to native mobile).
4. Default-model eval (SmolLM2-360M vs Qwen3-0.6B) + WebGPU on real GPU.
Not chasing (impossible for a static page, would betray the pitch): real
microVMs, server-side agents that run while closed, hosted sync.

## Standing rules
No Instinct branding/wordplay user-visible; humanized errors only; no secrets in
repo; reimplement natively; honest PASS/PARTIAL/FAIL grading; security pass
every cycle; 390px-first design QA; deploy via PAT bridge (vault:
"GitHub push token - aeiouvcode"), clear the token field after every push.
