# MISTAKES - Open Muse. Negative results are assets. Never delete.

- runSandboxed silently dead since introduction (found 2026-09-28, gen 33):
  the worker template literal contained split("\n") - at app runtime that
  escape became a REAL newline inside the generated worker source, so every
  worker died with "Uncaught SyntaxError: Invalid or unexpected token".
  run_js, custom-tool test-runs and tool-forge sandbox gates all returned
  that error; the 19 self-tests never covered the worker path, so nothing
  caught it. Found while building the gen 33 benchmark sandbox (I copied
  the same pattern, hit the same wall, then proved the pre-existing bug
  with a one-line eval: runSandboxed("return 1+1") -> the SyntaxError).
  Fixed both sites (split("\\n") in app.js source). Lessons: (1) code
  generated inside template literals needs its escapes double-checked at
  the GENERATED layer, not the source layer; (2) a sandbox that always
  fails the same way is indistinguishable from a passing one unless a test
  asserts a REAL computed value - the non-vacuous-tests rule now covers
  the sandbox itself: gen 33's benchmark self-check asserts "return 1+1"
  -> "-> 2" equivalents via 7 exact-value assertions through the worker.

- Workspace shell outage (2026-09-26 18:28-18:47): 10 consecutive bash
  calls - including pure reads - interrupted within 30-80ms of starting.
  Unverifiable during the outage whether one agent_message send (18:29,
  status note to main) landed. Recovered 18:47 with no partial writes (the
  interrupted python edit had never reached disk). Lesson: the loop-stuck
  rule applied mid-outage - stop re-running the same failing call, hold for
  the environment, verify state before assuming a write landed.

- gen 22 engine benchmark, sandbox (2026-09-25): WASM path stalled after
  ~850 MB downloaded with the browser idle; navigator.gpu absent even with
  swiftshader flags. Could not distinguish environment constraint from a
  real regression. Result: INCONCLUSIVE. Consequence: the in-app Benchmark
  button became the verification path (measures on the user's device).
- Cloud-browser File previews (since 2026-09-21): the Instinct File viewer
  iframe fails for every revision in the cloud browser, while the same
  preview is green in local Chrome. Consequence: File previews are QA'd in
  local Chrome only; flagged to platform via main, still open. Update 2026-09-28: local Chrome now also shows
  the viewer's "This file could not load" banner - on BOTH the published
  gen-32 revision and the fresh gen-33 build, with the app rendering and
  working below the banner each time. Identical across revisions = viewer
  shell watchdog issue, not build content. Reported to main with
  side-by-side screenshots.
- qa-gen23 harness artifact (2026-09-25 23:37): the suite reported 15/16 -
  the one "failure" was the app's own "model key configured" self-test on a
  fresh profile, which is designed guidance. Proven by probe: fails without
  a key, passes with one, fails again after removal. Lesson: self-test rows
  that are informative-by-design must be excluded from pass/fail counts.
- qa-gen27 first run (2026-09-26 05:39): 2 failures ("switch restores
  draft", "draft survives reload") were test bugs, not app bugs - the test
  read row 0 of the chat list after a new chat had been unshifted to the
  top. Lesson: capture ids before mutating state, never index rows after.
- gen 28 first run (2026-09-26 11:39): imported legacy memory items missing
  ts crashed the renderer (memItemHtml, app.js:279) and the merge aborted
  mid-render. Fixed at the highest level: intake enforces the invariant,
  renderer tolerates its absence. Re-run: 11/11, zero page errors.
- Bridge-page artifact (2026-09-26 01:24): EDGE's agent found a leftover
  data:URL "bridge" tab from an earlier deploy in the shared browser -
  inert (token nulled, field empty) but sloppy. Recipe fixed: any page or
  tab created for a push is closed at the end; verified clean since.
- Verification loop vs bash limit (2026-09-26 01:19): first live-bytes
  check embedded `sleep 180` and hit the 120s tool limit; chunked into
  60-75s waits. Lesson: keep each shell call under the limit; CDN lag is
  one retry, not a loop.
- gen 26 QA assumption (2026-09-25 20:58): expected headless Chrome to lack
  SpeechRecognition; it has it. "Unsupported browser" path must delete the
  API in the test to exist at all. Lesson: test the absence of a feature by
  removing it, not by assuming the environment lacks it.

## 2026-09-26 - unverified sha in report (twice in one cycle)
Reported "8f5d06a-ish" as HEAD sha in the rule-5 adoption report without reading it
from git; corrected. Then the correction message itself contained a second "-ish" sha.
Actual shas: c27549d, dec31e9. Numbers that carry trust (hashes, counts, scores) come
from tool output only - never from memory of what a sha "should" look like.
## 2026-09-26 - await-precedence bug in resume path (caught by CLI QA)
`const r = await k && pcache.match(k)` parses as `(await k) && promise` - r held
the un-awaited Promise, and `r.headers.get` threw TypeError on the resume path only
(first-run path has no parts, so the loop body never executed). The CLI eval QA
caught it with a real stack line (app.js:1124). Rule: an `await` inside a boolean
chain is a smell - await the actual promise, then branch.
## 2026-09-27 - shared CSS class collision (permswitch vs modebtn logic)
The mode-switch logic selected ALL .modebtn elements, so setMode() stripped the
new permission switch's active state and its clicks hit setMode(undefined).
First write reused .modebtn for visual consistency without checking who owns the
class. Rule: before reusing a styled class, grep who SELECTS it, not just who
styles it. Fixed at the selector level (:not(.permswitch)), not with a parallel
class.

## 2026-09-27 - sandbox rebuild lost unpushed gen-32 stack (recovered)
- What: the task sandbox was rebuilt mid-project; the local clone with the
  unpushed gen-32 stack (b0afb35..617a71c) went with it.
- Lesson: local-only commits are fragile across sandbox rebuilds. The
  Instinct File revision (immutable, per publish) is the durable
  checkpoint - gen 32 was recovered byte-clean from
  filerevision-01M3GQXXY5E5694EDNKF8S82T0 (file checkout -> port files
  back: openmuse.ts->app.js, style.css->styles.css, BODY string->index.html
  body, bump cache stamps). RULE 5 doctor green after recovery (19
  self-tests pass).
- Standing: commit + File-publish each passing build BEFORE long gaps;
  treat the File revision id as the recovery key and record it in STATE.md.
