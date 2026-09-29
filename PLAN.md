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

---
# Gen 35 design log (RULE 6, 2026-09-28 23:45) - Rule 7 leanness: orchestration-path consolidation

Problem restated: Rule 7 asks for a redundancy hunt with before/after
numbers. Hunt results (2026-09-28, app.js 4,948 lines): zero dead
functions (the __eq/__deep/__trap single-mentions are eval-string test
helpers, alive by design); zero repeated 4-line blocks beyond two 2x
micro-dups; the one real find is STRUCTURAL: runTeam (classic, 81 lines)
and runWorkforce (110 lines) are two parallel multi-agent orchestration
paths with identical skeletons - spawn loop with tool-call handling,
merge block, all-failed merge, addMsg+audit+counters+setRT tail,
try/catch with sys message + error audit, TEAM cleanup x2. Convergent
evolution left the same machine written twice.

Hunt evidence (negative results are assets): dead-function scan clean;
identifier-insensitive 5-line block scan found 18 groups, all either
consecutive registrations (cloak patterns, not extractable), micro-dups
(chatSearch cur-marking 2x, settings-save 2x), or the Team/Workforce
pair above.

Scope decision: consolidate the SHARED SKELETON only. What stays
deliberately distinct (parameterized, never unified): role-prompt source
(AgentRoles vs rolePrompt), tool policy (researcher-only vs scope-denied
audit path - Workforce's denial path is a real behavior, not dup), and
all user-visible copy ("Team merge"/"orchestrator" vs "Workforce
merge"/"coordinator"). This is a behavior-preserving refactor, not a
feature merge; both front-ends stay live and byte-identical in output.

Candidate designs:
A. CHOSEN: extract agentMerge(g, ok, {noun, mergeSys, auditKind}),
   agentAllFailed(err, noun), teamFail(g, e, noun), teamCleanup() as
   shared helpers; both run paths call them with their own copy/policy
   arguments. Plus the two micro-dups: chatSearchShowCur(hits) helper,
   saveSettingKey(inputId, settingsKey, auditLabel) helper.
B. Fold Team into Workforce with a compat shim. Rejected: Workforce's
   tool policy is stricter; a shim hides a real semantic difference and
   risks silently downgrading Team behavior.
C. Leave it; 1% is below the noise floor. Rejected: Rule 7 is the
   owner's explicit cycle ask, and the twin paths are the top future-bug
   farm (fix one, forget the other).

Before numbers (to be re-measured after): app.js 4,948 lines; runTeam 81
(4323-4403), runWorkforce 110 (4404-4513); duplicated skeleton est.
~45-55 lines; micro-dups ~12 lines. Target: net -55 to -65 lines, zero
behavior change.

Pass tests (keyless, via control-openmuse.mjs eval; behavior-preserving
proof, not just "it runs"):
- Pre-change fixture: synthetic team goal + workforce goal run with a
  stubbed ai.generateText; record the exact audit sequence, addMsg
  labels, and counter deltas. Post-change run of the same fixture must
  produce byte-identical sequences (non-vacuous: fixture asserts >=6
  distinct audit/message events per path).
- Workforce scope-denied path still emits its denial audit line and the
  "tools are off" user copy (guards against accidental unification).
- Keyless gate: both paths refuse with the same honest copy as before.
- 390px screenshot: team launch buttons + workforce view unchanged.

---
# Gen 35 outcome log (2026-09-29 05:50) - Rule 7 leanness: SHIPPED net 0, honest miss on the line target

What shipped: the Team/Workforce shared skeleton is now ONE machine.
agentMerge (all-failed copy + merge head parameterized), agentFinish
(merge post + audit + counter + last-step), teamFail, teamCleanup,
chatSearchShowCur, saveSettingKey. Call sites keep their own copy, role
prompts, and tool policy. Workforce's scope-denied path is untouched and
fixture-proven.

Before/after numbers (the honest part): app.js 4,948 -> 4,948 lines.
Target was net -55 to -65. The estimate assumed helper scaffolding was
free; it costs ~30 lines against ~40 saved, and the micro-dups nearly
break even. An extra extraction (teamGoal) made it WORSE (+3) and was
reverted on measurement. Result: zero net lines, one skeleton instead of
two. The win is maintenance (fix one path, not two), not byte count.

Proof of behavior preservation (RULE 5, via control-openmuse.mjs eval):
stubbed-AI fixture ran team mode, workforce mode, and both no-key
failure gates pre- and post-change. Event streams (audit kinds+text,
addMsg roles+text, counter deltas, Store.save calls) are BYTE-IDENTICAL:
22 distinct events both runs, including "Denied 1 tool call from coder"
(scope policy intact) and both friendlyModelError fail gates. Doctor:
7/7 PASS, 26 self-tests green. 390px screenshots (goals, workforce):
layouts unchanged.

Self-critique: the line target missed and I ship it anyway - the
alternative was leaving a known twin-machine bug farm in place because
the estimate was wrong. PARTIAL on the metric, PASS on the structure.
Cybersecurity pass: no new inputs, no new network surface, tool policy
bit-identical (fixture-proven), no secrets touched. PASS.
Competitor pass (Eigent/CAMEL, our workforce inspiration): they run ONE
orchestration engine with pluggable policies; this cycle moves us the
same direction. Remaining honest gap: spawn loops still differ
(parallel map vs dependency waves) - deliberately, that IS the feature
difference.
Waterballoon critic gate: 8/10. Deductions: headline metric missed
(-1.5); a skeptic can call a net-zero cycle cosmetic (-0.5). Held at 8
because the behavior proof is byte-level, the negative result is
recorded with numbers, and the structural debt is actually gone.

---
# Gen 36 audit + micro-deletion (2026-09-29 ~12:00 IST) - dead-code hunt: honest near-zero yield

Problem restatement (RULE 6): after gen 35's net-0 consolidation, is there
REAL dead weight to delete, provable by behavior-preserving removal?

Method + numbers: static reference analysis over all 282 defined
function/const identifiers in app.js - every one has a live call site
(TRUE DEAD: 0). CSS audit over 215 used classes: 2 candidates, of which
.mdh1-.mdh4 are FALSE POSITIVES (generated by concatenation 'mdh'+level
in the markdown renderer - see MISTAKES.md). One true dead selector
found: .cb-contextnote{display:none} inside the 700px media query - no
base rule, no markup carries the class (coderbench context-note residue
from an earlier layout). Deleted. Yield: -1 selector, ~27 bytes, 0 lines.

Negative result recorded as an asset: the leanness target is NOT met by
deletion; the codebase's function surface is fully live. Next leanness
moves must come from structural simplification, not corpse removal.

Proof (RULE 5, control-openmuse.mjs doctor): 7/7 PASS, 26 self-tests
green post-deletion. Layouts untouched (selector had no matching nodes
by construction).

Next cycle candidates (ranked):
1. Design-led improvement per owner steering (pick one visible surface
   and deepen it - critic gate grades from 390px evidence).
2. Engine verification (move 4) - still blocked on the owner's phone.
3. PDF support (move-6 delta) - needs a real parser decision.

---
# Gen 37 design log (RULE 6, 2026-09-29 17:50) - Goals & plans 390px action-row redesign

Problem restated: the Goals & plans viewhead at 390px wraps its four
controls (Autonomous checkbox, Export Markdown, Export CSV, + New goal)
into a ragged two-row scatter next to a full-width subtitle - the primary
action (+ New goal) lands mid-row-2 with no visual priority, and the two
export buttons carry the same weight as the primary. In the taskbox, the
"Add a task" input clips its own placeholder ("Muse tracks it t...") at
390px. Fresh 390px evidence: /tmp/om-goals.png (pre-change).

Candidate designs:
A. CHOSEN: a standard full-width .viewactions row inside the viewhead,
   below title+sub: [+ New goal] primary first, Autonomous checkbox next,
   spacer, then Export Markdown / Export CSV demoted to small ghost
   buttons. Placeholder shortened to "Add a task..." so nothing clips;
   the existing muted line under the row keeps the full explanation.
   Zero behavior change - same ids, same handlers, same sync logic.
B. Overflow "..." menu for the exports. Rejected: hides a discoverable,
   harmless action behind chrome; more JS for no gain (Rule 7).
C. Move exports into the empty-state card. Rejected: controls vanish
   once a goal exists; position depends on data state.

Pass tests (keyless, via control-openmuse.mjs eval + screenshots):
- goals viewhead contains .viewactions with newgoalbtn as its first
  button; newgoalbtn's top is below the subtitle's bottom (row order).
- newtask placeholder rendered width (canvas measureText at computed
  font) fits inside input.clientWidth at 390px.
- autonomycb still reflects permMode after a mode switch (existing 26
  self-tests stay green; no handler touched).
- 390px screenshots: goals view before/after; habits + memory views
  re-shot to prove no regression from shared CSS (.trow/.btn untouched,
  ghost is additive).

---
# Gen 38 cycle - Settings model picker 390px redesign (design-led, 2026-09-29)

Problem restated: on a 390px phone the Settings Model row crams four
controls into one flex line - filter input (fixed 104px), model select
(flex:1), refresh button, Test button. The select, the one control that
carries the actual choice, is left ~120px and truncates every model id
("gemini-3.8-..."), so the owner picks blind. This is the primary
setup path; a setup control that hides its own value fails
works-out-of-the-box.

Designs considered:
A. Two-row stack - row 1: select full width; row 2: filter (grows) +
   refresh + Test. Keeps every control, gives the choice full width,
   matches the app's single-column rhythm.
B. Filter above as a search field, refresh + Test beside the select.
   Still truncates the select (~230px max) - rejected.
C. Icon-only buttons in one row. Saves ~40px, still truncates, and
   "Test" as an icon is ambiguous - rejected.
Pick: A. Zero behavior change - same element ids, same handlers, markup
reorder only.

Named-competitor pass: Jan gives the model name a full-width dropdown
with settings gear separate; LibreChat stacks the model selector above
endpoint options. Both give the chosen model full width on a phone;
a truncated select is the anti-pattern both avoid.

Cybersecurity pass: markup reorder only - no new inputs, no innerHTML,
no handler or id changes, no new network or storage surface.

Pass test: at 390px the select spans the full content width and shows
complete model ids; filter, refresh, Test keep working (same ids);
doctor 7/7 + 26 self-tests green; before/after screenshots.
