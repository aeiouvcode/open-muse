# CHECKPOINT - 2026-09-25 21:20 IST
- Gen 26 COMPLETE locally: voice input. Composer mic button, shown only
  where the browser exposes a speech service; tap to dictate (existing text
  kept, interim results stream in), tap to stop. Every state honest:
  unsupported = no button, denied = how to allow, offline = says the browser
  transcribes on its own service. Dictation is audited (kind "voice"),
  never the transcript content.
- QA: 7/7 (hidden without API, visible with, listening state, text appended
  to existing draft, audit, clean stop, denied->human copy) + broker 22/22
  at 390px, zero page errors.
- Security pass: PASS - no keys, no app-side network; the honest copy names
  the browser's speech service as the processor, and nothing but the audit
  kind is logged.
- Self-critique: no push-to-talk language setting yet (uses browser
  language); continuous mode can hang on some mobile browsers - stop is one
  tap and onend always clears state.
- Competitor note vs LibreChat/Jan: both bolt voice on as a paid/cloud
  afterthought or lack it; ours is native, zero-config, and honest about who
  transcribes.
- Deploy: 00:30 IST wake pushes gen 20-26 (7924ec5..) + verifies live bytes.
