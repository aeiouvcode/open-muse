# STATE - Open Muse (updated 2026-09-26 18:50 IST, end of run)

## Standing rules
- Browser only when strictly necessary (owner, 18:28): prefer local, CLI,
  and API routes first. The Pages push bridge is currently the only
  sanctioned browser use on this project.
- 20-minute rule, final form (owner, 18:29, supersedes earlier versions):
  20 minutes on the same problem WITHOUT SOLVING it - diagnosed or not -
  means escalate to the owner through main: what was tried, what is
  blocking, ask for his advice and plan. Log attempts in MISTAKES.md, then
  take the next PLAN.md move while awaiting his steer. Never silently
  abandon.
- Loop-stuck is the stuck signal (owner addendum, 18:31): catching yourself
  re-running the same failing action IS the signal - stop, log, escalate,
  take the next move.
- No broad catch-alls (owner, 18:36): catch specific failure modes only;
  everything else fails LOUD. A silent failure is a defect - log it in
  MISTAKES.md.
- Non-vacuous tests (owner, 18:36): tests and benchmarks assert real values
  (row counts, digests, exact strings) - a harness that passes on "didn't
  crash" or an empty parse is a fake test.
- Review reads failure paths (owner, 18:36): self-review and critic passes
  read the failure paths before approving. No vibe-LGTM.
- Critic gate (Sep 26 12:14 via main): X/10 with named deductions from
  fresh 390px screenshots + QA evidence before any ship; bar 8, max 3
  rounds; still short ships only as labelled PARTIAL. Score + rounds in
  every ship report.
- Go-live gate (owner, Sep 26 17:26 via main): nothing public - no Pages
  deploy, no public File publish - without his explicit yes via main.
  Commits, QA, push prep, and PRIVATE File publishes are expected.
- Docs spine (owner, Sep 26 18:09): STATE/MISTAKES/PLAN/FEATURE-MAP updated
  at the END of every run.
- Logic over surface (owner, Sep 26 19:46, "improve the logic on our
  projects"): prefer moves that deepen how the thing works - core
  mechanics, algorithms, state handling, correctness, edge cases, internal
  coherence - over moves that change how it looks.
- RULE 5 (pstack, Sep 26 19:55 via main): control-openmuse.mjs is the
  verification path - doctor/snapshot/screenshot/wait-settle/interact, JSON
  out, --dry-run on destructive actions, descriptive errors. Verification
  claims come through the control CLI, not throwaway scripts.
  FEATURE-MAP.md gains how-to-drive-via-CLI per feature over time (no
  rewrites just to comply).
- RULE 6 (pstack, Sep 26 19:55 via main): restate the problem in PLAN.md
  before coding; prototype open questions empirically; run multiple
  candidate designs for architecture changes and scrap the sketch when
  implementation proves it wrong; readme-first for shared code; plans are
  item-by-item with runnable proof per item.


- Local HEAD: gen 37 commit (Goals & plans 390px action-row redesign,
  design-led cycle) - see git log. Evidence: doctor 7/7, 26/26
  self-tests, CLI eval asserts (viewactions row order, placeholder fits,
  ghost applied), 390px before/after + habits/memory regression shots.
- Previous: gen 36 (dead-code audit, near-zero yield) - see git log;
  gen 35 (Team/Workforce one-skeleton, last File-published);
  gen 34 (attachments - text/image upload, PLAN move 6).
- Previous: gen 33 (coder benchmark harness + runSandboxed repair) -
  see git log. Recovered 2026-09-27 17:4x IST from Instinct
  File revision filerevision-01M3GQXXY5E5694EDNKF8S82T0 after the sandbox
  was rebuilt and the unpushed local stack was lost; RULE 5 doctor green
  (19 self-tests pass) after recovery.
- Live (Pages): gens 20-31, origin/main 12c7686.
  https://aeiouvcode.github.io/open-muse/
- Staged locally, held at the gate: gen 32 (Jelly activity row, PAN/Aadhaar
  cloak patterns) + gen 33 (coder benchmark harness, PLAN move 2; includes
  the runSandboxed SyntaxError repair - run_js/tool-forge sandbox worked
  again after the fix; and the modelAvailable() leanness dedup, 3 duplicate
  keyless gates -> 1 helper).
- Gate (owner, Sep 26 17:26 via main, supersedes Sep 25 GO): nothing goes
  live - no public Pages deploy, no public File publish - without his
  explicit yes relayed by main. Commits, QA, push prep, PRIVATE File
  publishes are expected.
- Instinct File (PRIVATE): current at gen 37 (File generation 36, revision filerevision-01M3PHV4SCSVP9GS361SNATKKJ).
  https://files.instinct.com/file-01M326APAT2KA6SM3C2HG5XAEB
- Midnight wake (00:30 IST): push-prep only - inventories the staged diff,
  re-verifies QA locally, reports readiness. No push.
- Verification: scripts/control-openmuse.mjs (RULE 5) - doctor, snapshot,
  screenshot (--setup), wait-settle, interact, eval. Gen 30 proofs: resume
  via range-server request log, search via live HF queries + prefetch's
  tree-walk, peak-memory render both branches.
- Next steps: ranked in PLAN.md. Moves 1, 5, 2, 3 (doc stamp) and 6
  shipped. Next: engine verification (move 4) needs the owner's phone;
  PDF support is the known move-6 delta (needs a real parser).
- Note: this file absorbs the old CURRENT_TASK.md / CHECKPOINT.md (retired
  2026-09-26 for the fleet-standard spine). HANDOFF.md kept for
  cross-session continuity.

---
# Gen 35 state (2026-09-29 05:50 IST)
- Team/Workforce consolidation SHIPPED: one skeleton (agentMerge,
  agentFinish, teamFail, teamCleanup), net 0 lines (target missed; see
  MISTAKES.md and PLAN.md gen-35 outcome). Behavior proven byte-identical
  via stubbed-AI fixture (22 events both runs, scope-denied path intact).
  Doctor 7/7 PASS, 26 self-tests green. 390px layouts unchanged.
- Waterballoon critic: 8/10 (gate passed). Full passes in PLAN.md.
- Gen 36: dead-code hunt run - 0 dead functions of 282, 1 dead CSS
  selector removed (.cb-contextnote residue); negative result recorded
  in PLAN.md. Next: design-led improvement (owner steering), engine
  verification move 4 (needs owner's phone), or PDF support (move-6 delta).
