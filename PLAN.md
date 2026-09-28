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
   SHIPPED gen 33 (2026-09-28): 3 tasks (fix-the-bug INR grouping,
   implement-to-spec debounce, behavior-preserving refactor) with 7
   exact-value assertions; scoped worker traps fetch/XHR/WebSocket/
   EventSource/importScripts and counts every blocked attempt; PASS
   requires all assertions green AND zero blocked attempts; runs recorded
   in the audit trail; Replay re-executes recorded attempts and rebuilds
   the step sequence FROM the audit entries - exact match proven by CLI
   eval (bench-6ll6iu1yagd). Cycle also repaired runSandboxed (dead since
   introduction, same escaping bug) and deduped 3 keyless-gate copies
   into modelAvailable() (Rule 7). Keyless mode runs an honestly-labelled
   Self-check only; "Run with Muse" gates on a connected model.
   Gap: coder mode is inspect-only with approvals and audit, but nothing
   proves it completes real tasks; OpenHands publishes exactly that proof.
   Move: 3 real coding tasks, scoped sandbox execution, replayable audit.
   Pass test: 3 tasks complete with no unauthorized file/network access;
   replay recovers the exact tool sequence from the audit trail.
3. PII sentinel fixture matrix (fleet move 3 delta).
   SHIPPED gen 32 (2026-09-27, doc stamp late 09-28): the same canary
   transcript (name/email/phone/card/ssn/PAN/Aadhaar) driven through every
   outbound path - gemini, openrouter, tokenharbor, local, nim, edge
   bridge, builtin engine, and both web-search providers - with Broker.use
   stubbed to capture, no network. Every row asserts zero sentinel bytes
   outbound, the name twin present, and replies un-swapped; the builtin
   engine row asserts nothing leaves at all. Any future cloak bypass turns
   a self-test row red.
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
6. File/image upload into chat. SHIPPED gen 34 (2026-09-28).
   Gap: no document or vision input; LibreChat has both.

   Problem restated: a user with notes, a log, or a photo has to
   copy-paste (text) or describe by hand (images). Both lose fidelity and
   both bypass any review of what actually leaves the device.

   Scope decision: text-like files (txt/md/csv/json/log/code) and images
   (png/jpg/webp/gif). PDF is honestly OUT this cycle: no parser lives in
   the repo, and a regex "extractor" that silently fails on scans and
   compressed streams would be fake support. The picker refuses PDFs with
   plain copy; revisit when a real parser earns its bytes.

   Candidate designs:
   A. CHOSEN: text files fold into the message text visibly at send time
      ("Attached notes.txt:" block, capped at 8,000 characters with an
      honest truncation marker) so cloak, memory, retry, checkpoints and
      search keep working with zero structural change. Images ride the
      message as atts[] and become provider multipart content in the one
      history mapper, only for vision-capable providers. Cloak.out gains
      multipart handling - today it skips non-string content entirely,
      which would have made image messages an UNCLOAKED path (real gap,
      closed here).
   B. Separate attachment store + references. Rejected: a second store to
      encrypt/export/wipe for no user-visible gain at this size (Rule 7).
   C. Vendor a PDF library. Rejected: 400KB+ of dependency for extraction
      that fails silently on exactly the files users trust it with.

   Vision capability: Gemini always; other providers when the model id
   matches vision patterns (gpt-4o, claude, gemini, vision, -vl, llava,
   pixtral, minicpm-v); the on-device engines refuse honestly (text-only
   here). Refusals are plain copy at send time, never a silent drop;
   history images under a non-vision provider carry an explicit
   "not shown to this model" marker.

   Caps: text file <=256KB (8KB folded in), image <=10MB downscaled to
   <=1024px JPEG (<=900KB data URL), max 4 attachments per message.

   Pass tests (keyless, via control-openmuse.mjs eval on the real page):
   - attach pipeline folds a sentinel-laden .txt into the message and the
     outbound body (Broker stub) carries the twin, never the sentinel.
   - gemini + image message maps to multipart content; after Cloak.out
     the text part is cloaked (multipart gap proven closed).
   - local provider + image refuses with plain copy; nothing sent.
   - .pdf refused with plain copy; no attachment added.
   - 390px screenshot: paperclip in the composer, image thumb + file chip
     above it, x removes a chip.

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

---
# Gen 33 design log (RULE 6, 2026-09-28 05:45) - Coder benchmark = PLAN move 2

Problem restated: coder mode plans, drafts diffs and routes them through
Evolve gates, but nothing proves the loop completes real coding work.
OpenHands' whole claim rests on published benchmark numbers; ours rests
on nothing. The gap is not model quality (that needs the owner's key and
hardware) - it is that the app has no harness in which a coding attempt is
executed in a scoped sandbox, graded against exact-value assertions, and
recorded so the run can be replayed step-for-step from the audit trail.

What "real" means here (non-vacuous tests rule): three tasks with exact
assertions, not "didn't crash":
1. fix-the-bug: broken Indian-digit-grouping formatter (inr). Assertions:
   inr(1234567.89) is exactly "12,34,567.89", inr(-95000) is "-95,000",
   inr(100) is "100".
2. implement-to-spec: debounce(fn, ms) with trailing fire + .cancel().
   Assertions: 3 calls inside the window fire fn exactly once with the
   last args; after .cancel() nothing fires. Real timers, exact counts.
3. behavior-preserving refactor: candidate quote(items) must match a
   legacy bill calculator's outputs on a fixed 12-case matrix including
   tier boundaries and an empty cart. Deep-equal, exact.

Candidate designs:
A. Benchmark runner beside runSandboxed with a structured-result worker:
   prelude traps fetch/XMLHttpRequest/WebSocket/EventSource/importScripts
   (each trap counts and throws), runs fixture + candidate + assertions,
   postMessages a structured verdict. CHOSEN: workers already have no DOM
   or page storage; the trap makes "no network access" a counted,
   asserted fact instead of an assumption. runSandboxed itself is left
   untouched (its string contract serves chat tools; a shared edit would
   risk every caller for one new caller - anti-lean).
B. In-browser virtual repo where coder mode applies patches to a fake FS
   and runs a test suite. Rejected for this cycle: closest to OpenHands
   but triples the surface (patch parser, FS, differ) before the simpler
   claim - execute, grade, record, replay - is proven. Rule 7.
C. Extend the CLI eval only, no in-app feature. Rejected: the gap is
   user-visible proof; the CLI remains the verification path (RULE 5),
   not the product.

Run record + replay: S().coder.bench stores run id, source
("reference" | "model"), per-task verdicts (assertions, ms, blocked
network attempts) and the attempt code (model runs only, capped 20KB).
Every step also lands in the audit trail (kind "coder-bench"). Replay
re-executes the recorded attempts and asserts the step sequence and every
assertion verdict reproduce exactly - the audit trail is the source of
the sequence, so a tampered or lost trail shows as a replay mismatch,
not a silent pass.

Honesty boundary: with no model key the only runnable mode is "Self-check"
- reference solutions graded by the real harness. It proves the harness,
never the model, and the UI says exactly that. "Run with Muse" needs a
model key in coder mode, extracts the last fenced code block from the
reply (new 8-line helper; mdLite's regex is render-only and not reusable),
and grades that. A keyless canned reply would be a betrayal; a labelled
fixture is not.

Pass tests (keyless, via control-openmuse.mjs eval on the real page):
self-check run grades all 3 tasks PASS with 0 blocked network attempts;
a deliberately network-reaching candidate is blocked and counted; replay
of the recorded run reports an exact sequence+verdict match; a wrong
candidate (returns garbage) FAILS with named failed assertions; results
render in the coder bench with an honest overall label.
