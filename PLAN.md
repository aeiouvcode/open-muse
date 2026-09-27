# PLAN - Open Muse improvement plan (ranked; synced with the fleet-doc section 2026-09-26)

1. Hub v2 - search, resume, peak memory. SHIPPED gen 30 (2026-09-26):
   HF search (10 results for "qwen", 9 verified loadable via prefetch's
   own tree-walk, measured Q4 sizes + fit labels from repo listings),
   chunk-level resume (range-server log proves no byte refetched;
   62,914,560/62,914,560 bytes assembled; parts cleaned), peak-memory
   line in Test (renders measured value, honest fallback). Remaining
   delta vs Jan: none blocking - Jan has no resume either; our sizes are
   measured where Jan's are per-model metadata.
2. Coder 3-task replayable benchmark (fleet move 1 delta).
   Gap: coder mode is inspect-only with approvals and audit, but nothing
   proves it completes real tasks; OpenHands publishes exactly that proof.
   Move: 3 real coding tasks, scoped sandbox execution, replayable audit.
   Pass test: 3 tasks complete with no unauthorized file/network access;
   replay recovers the exact tool sequence from the audit trail.
3. PII sentinel fixture matrix (fleet move 3 delta).
   Gap: the broker is one audited chokepoint with 22 tests, but no
   cross-provider proof that PII never leaks.
   Move: fixture matrix - same conversation transcript through every
   provider adapter, sentinel PII values asserted absent outbound.
   Pass test: every provider fixture passes the sentinel tests.
4. Engine verification on real hardware.
   Gap: the engine's biggest claim is unproven since Sep 23 (sandbox has no
   WebGPU; WASM run inconclusive - see MISTAKES).
   Move: run the in-app Benchmark on the owner's phone.
   Pass test: benchmark numbers recorded on-device and the hub fit labels
   upgrade from estimate to measured.
5. Permission modes as a first-class control (from T3 Code study 2026-09-26).
   SHIPPED gen 31 (2026-09-27): Observe/Ask/Auto segmented control in the
   chat header; permMode source of truth with autonomy synced; Observe
   holds steps AND refuses approval settlement; all 7 keyless pass tests
   green via CLI eval; both switches scoped so neither strips the other's
   active state.
   Gap: autonomy is a buried boolean; T3 Code makes the trust level a
   visible, per-context choice (their permission-modes doc is the pattern).
   Move: a segmented control - Observe / Ask first / Autonomous - in the
   chat header, wired to the existing Sentinel approval flow and the
   autonomy setting, with the current mode always visible.
   Pass test: switching modes changes real behavior - Observe never runs a
   Sentinel step, Ask first gates on the approval card, Autonomous runs
   within granted permissions; the header always shows the active mode.
6. File/image upload into chat.
   Gap: no document or vision input; LibreChat has both.
   Move: attachment picker, text extraction for docs, vision-model path
   where the provider supports it; cloak applies to extracted text.
   Pass test: a PDF and a photo each produce a grounded answer; sentinel
   PII in the document is cloaked before the model call.

---
Reference study: pingdotgg/t3code (T3 Code), designated 2026-09-26 18:47.
Agent-harness control surface (mobile/web/Electron) for external CLI
agents. Fits we drew: permission modes as a visible control (move 5);
validation of the phone-first control-surface design. Explicit non-fits
(against the local-first brief): driving external CLI agents, subscription
account integrations, any server component. Original build only.

---
# Gen 30 design log (RULE 6, 2026-09-26 23:40) - Hub v2 = PLAN move 1

Problem restated: the hub shows 4 curated ids; Jan searches all of HF and
resumes interrupted downloads; our Test reports speed but not memory. Close
those three logic gaps without breaking the works-offline-after-download
guarantee or the measured-not-folklore honesty rule.

Candidate designs for resume (the architecture choice):
A. Parts as Blobs in IndexedDB, reassemble on completion.
   Rejected: second storage API to reason about, separate quota/eviction
   behavior from the Cache API the models already live in.
B. Parts as entries in a second Cache ("transformers-partial"), each stored
   with a truthful Content-Range header; on completion assemble with
   Blob concatenation (disk-backed, no full-RAM copy) into the main cache
   and delete the parts. Resume derives total+offset from the parts
   themselves - no re-probe of byte 0, so a server log can prove resume.
   CHOSEN: one storage API, browser eviction stays consistent, assembly is
   lazy. Corrupt/mismatched parts are deleted and refetched (fail loud).
C. Stream directly into the final cache entry with append.
   Rejected: Cache API has no append; would need full re-put per chunk.

Search: two parallel HF API calls - search=q&filter=onnx (verified 200 with
CORS allow-origin echo) and author=onnx-community&search=q - merged/deduped,
sorted by downloads. onnx-community results get a "matches the engine
layout" mark; other repos are attempted and fail with a humanized message
if the ONNX layout is missing. No fake sizes: size shows only once measured
by the download probe.

Peak memory: performance.memory.usedJSHeapSize sampled every 250ms during
the benchmark, stored as res.peakMB, printed as its own line. Browsers
without performance.memory get an honest "not measurable here" line.

Pass tests (from move 1): search "qwen" returns >=3 models whose trees
contain q4 ONNX weights (proved via the same tree-walk prefetch uses);
a download cancelled mid-file resumes from the stored offset (proved by a
range-server request log showing no byte-0 fetch on the second run); Test
prints a measured peak-memory line.

---
# Gen 31 design log (RULE 6, 2026-09-27 05:39) - Permission modes = PLAN move 5

Problem restated: autonomy is one buried boolean in the Goals header; T3
Code makes trust level a visible, per-context choice. The Sentinel approval
flow already exists - what is missing is a first-class, always-visible mode
control wired into it.

Mode semantics (mapped onto existing mechanics, no new execution paths):
- Observe: nothing executes. autoAdvance off; advanceGoal and Sentinel
  approval settlement refuse to run steps and say why. Planning, chat,
  memory, search all keep working.
- Ask first: no auto-advance; steps run only when the user explicitly
  advances them, and sensitive steps still pause on the Sentinel approval
  card. (This is the current autonomy=off behavior, made visible.)
- Autonomous: current autonomy=on behavior, unchanged: routine steps
  auto-advance; sensitive steps still wait for explicit approval. That
  boundary is the app's standing honest claim and does not move.

settings.permMode in {observe, ask, autonomous} is the source of truth;
settings.autonomy is kept in sync (true only in autonomous) so every
existing guard keeps working untouched. Migration: absent permMode derives
from the current autonomy value once at load.

UI: a 3-segment control in the chat header next to the mode switch, active
mode always shown. The Goals-header autonomy checkbox stays but becomes a
reflection of the mode (checked = Autonomous) - two views of one state,
never two states.

Candidate designs considered:
A. New independent permission engine alongside autonomy.
   Rejected: two sources of truth for the same gate; bug farm.
B. permMode as source of truth, autonomy derived/synced. CHOSEN:
   existing guards (autoAdvance, automations, coder autonomy) keep their
   boolean and gain the modes without rewrites.

Pass tests (keyless, via CLI eval on synthetic goals): observe+sensitive
step stays todo with an Observe message (never reaches approval or run);
ask+sensitive lands on the approval card; autonomous+sensitive also lands
on the approval card; observe+routine stays todo; header control and the
Goals checkbox reflect each switch; autonomy syncs.
