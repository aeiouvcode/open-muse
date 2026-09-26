# CHECKPOINT - 2026-09-26 11:45 IST
- Gen 28 COMPLETE locally: merge-import for backups. Import now opens with
  what the file holds and offers Merge (default), Replace, Cancel. Merge
  dedupes by id (memory by text), newer-updated wins conflicts, drafts never
  clobber, settings/keys always stay. Honest result line + audit entry.
  QA surfaced two structural fixes: memory intake now enforces the ts
  invariant, and the memory renderer tolerates legacy items missing ts.
  Static backup copy updated to match reality.
- QA: 11/11 at 390px through the real upload path + gen24 backup suite
  updated for the new copy (9/9) + pins/drafts 9/9 + voice 7/7, zero page
  errors. Merge UI visual verified.
- Security pass: PASS - merge never imports settings keys (the snapshot
  never carries them) and cloak originals stay device-local.
- Self-critique: replace is still one tap with no typed confirmation -
  acceptable since merge is now the default and the copy is explicit, but a
  "type REPLACE" gate may be worth it. Conflict rule is timestamp-based,
  which trusts clock stamps inside the file - honest about it in the copy.
- Competitor note: LibreChat's import is replace-only; Jan has no portable
  backup at all. Merge-with-conflict-resolution is past both.
