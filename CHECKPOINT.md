# CHECKPOINT - 2026-09-26 05:45 IST
- Gen 27 COMPLETE locally: pinned chats + per-chat composer drafts. Pin icon
  on any drawer row keeps a chat on top (accent while set). Drafts autosave
  ~600ms after typing stops, restore on switch/reload, carry a "draft" tag
  in the list, clear on send, prune on chat delete, ride along in backups
  (counted in the honest backup summary).
- QA: 9/9 at 390px (save, restore, badge, reload persistence, send-clears,
  pin order + state + unpin) + broker 22/22, prompts 6/6, voice 7/7
  regression, zero page errors. Drawer visual verified.
- Security pass: PASS - drafts live in the encrypted store, stripped of
  nothing because they hold no secrets; backup counts them honestly.
- Self-critique: pin uses an emoji glyph - consistent with the drawer's
  text-glyph style but worth an SVG pass later; no drag-reorder (pin covers
  the 80% case).
- Competitor note: LibreChat has neither drafts nor pinning in its sidebar;
  Jan has neither. Small, daily-use, phone-first - exactly our lane.
