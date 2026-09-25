# CURRENT_TASK — Open Muse (updated 2026-09-25 21:20 IST)

## Status: prompt library shipped (gen 25); FLEET GO - deploy at 00:30 IST
Gen 26 (this cycle): voice input - composer mic, honest about the browser
speech service, every state human. Deploy wake 00:30 IST covers gen 20-26.

Deploy hold LIFTED 2026-09-25 20:54 IST (user "ship go"). One-shot wake
00:30 IST pushes gen 20-25 to Pages + verifies live bytes.
Gen 25 (this cycle): prompt library (save / one-tap use / delete / backup);
also fixed switchView never re-rendering the tools view.

## Status: backup/export-import shipped (gen 24); deploys HELD pending fresh go
Gen 24 (this cycle): full backup - one JSON out, confirmed replace back in,
secrets structurally excluded. Local-first is now actually portable.

## Status: fleet surface standards shipped (gen 23); deploys HELD pending fresh go
Gen 23 (this cycle): 404.html + humanError() everywhere errors reach the UI +
surface standards folded into the in-app self-test suite and FEATURE-MAP.

## Status: on-device benchmark shipped (gen 22); deploys HELD pending fresh go
Gen 22 (this cycle): engine-panel Benchmark - fixed battery against the loaded
model (exact-instruction / arithmetic / JSON / speed), results per model in
settings.bench, honest failure display, audited. Real-weight run inconclusive
in the sandbox (no WebGPU; WASM load stalled post-download) - default-model
call (SmolLM2-360M vs Qwen3-0.6B) now answerable on the user's device with one
tap, which was the point. Competitor note: Jan/LM Studio guess fit from specs
(janhq/jan#5505 is an open request); we measure.

## Status: CSP single-sourced (gen 21); broker shipped (gen 20); deploys HELD pending fresh go
DEPLOY HOLD (main, 2026-09-25 17:37 IST): no Pages/GitHub push without a fresh
explicit go from Naksh - the standing grant is suspended fleet-wide. File
publishes (PRIVATE) continue. Gen 20 commit 7924ec5 + gen 21 staged locally.
Gen 21 (this cycle): CSP single-source - the shipped index.html meta is the
only copy of the tight policy; applyNetPolicy derives open mode by widening
only connect-src. The gen-19 "edit both" class of bug is structurally
impossible now. Also new this cycle per owner guidance: FEATURE-MAP.md (added
in gen 20 commit) - sitemap of features + triggers, updated on every behavior
change; engineering rules: empirical verification, highest-level fixes for
recurring patterns, no workaround-justifying comments.

## Status: credential broker formalized (gen 20); app is installable + offline-capable
Credential broker shipped (this cycle, gen 20): every credential in the app -
model key, search key (Brave/Tavily/TinyFish), Monid key, per-server MCP keys -
is now spent through one chokepoint (Broker, app.js ~line 912). Callers name a
credential and a URL; the broker validates the destination host against that
credential's allowed origins (derived live from the active provider's
endpoints / search provider / server URL), attaches the secret itself (Bearer
header, ?key= query for Gemini's catalog, api_key JSON-body field for Tavily),
audits each new credential->origin pair once per session, and refuses - with
an audit entry and a human error - anything else. Key-touching code outside
the broker: zero (grep-verified; getKey() survives only as the broker's read
and the settings writer). Presence gates moved to Broker.has(). Settings copy
states the boundary honestly: hygiene against accidents and sloppy code paths,
not a process barrier. QA: 22/22 stubbed-provider assertions (Bearer only to
the provider's own host, query-key only on Gemini's catalog host, body-key only
for Tavily, cross-origin refusal throws + never sends + audits, UI send
round-trip, settings save flow), plus gen-18 workforce and gen-19 PWA
regressions green at 390px.
Earlier: PWA gen 19, agent scopes 6962864 (gen 18), team templates af0993f
(gen 17), checkpoints 7e0d224 (gen 16), sessions 60fc882 (gen 15), branches
0e7b349 (gen 14), search (gen 13). Engine proven live 2026-09-23 ~16:02 IST.

## Status: engine live; app is now installable + offline-capable (gen 19)
PWA shipped (this cycle, gen 19): Open Muse is a real installable app.
manifest.webmanifest (standalone, theme #bc4518, 192/512/maskable icons
rendered from the orb mark) + sw.js precaching the versioned app shell -
the app boots with no network; model calls, tool fetches and engine
downloads always go straight to the network and are never cached. Update
flow: a new deploy surfaces as a calm bottom bar ("A new version of Open
Muse is ready" - Update / Later); applying it swaps the worker, purges the
old cache, reloads once and toasts "Updated to the latest version."
Install: the browser's own prompt when offered, an honest Share > Add to
Home Screen instruction on iOS, and a "This app" settings row that only
appears where service workers actually run (hidden inside the hosted
File). Found + fixed along the way: applyNetPolicy was rewriting the CSP
meta at boot and stripping manifest-src (two sources of truth - both now
carry it); first-install controllerchange caused a spurious reload (now
only swaps after the first trigger a reload).
Earlier: agent scopes 6962864 (gen 18), team templates af0993f (gen 17),
checkpoints 7e0d224 (gen 16), sessions 60fc882 (gen 15), branches 0e7b349
(gen 14), search (gen 13). Engine proven live 2026-09-23 ~16:02 IST.

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
Gen 18 PUBLISHED (PRIVATE, revision filerevision-01M3AA2BMG55Z8BXHMFRZ6WCD7) after local-Chrome preview QA (7/7: scope rows, defaults, toggle, engine option hidden, zero console errors).
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
