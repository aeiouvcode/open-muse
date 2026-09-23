# Build prompt: Open Muse (paste into any coding agent)

You are building **Open Muse** - an open-source, local-first personal AI agent inspired by
Meta's Muse (a US-only personal agent announced September 2026), rebuilt so anyone,
anywhere can run it. Build everything from scratch. Do not copy, fork, or port any
existing project. Ship a working artifact, not a mockup.

## What Meta's Muse is (the reference, not the source)

Muse is Meta's personal AI agent: it does not just answer questions, it does the work.
People talk to it like messaging a person. It takes tasks and goals, turns long-term
goals into action plans, keeps working after the app closes, and comes back when
something changes or needs approval (before sending an email or making a purchase).
It remembers what matters and suggests things unprompted. It runs on a dedicated
"Secure VM" with a separate Sentinel agent that approves anything leaving the machine,
granular per-app permissions the user can change or revoke any time, a complete audit
trail, and a "forget" command for anything it has learned. It is US-only, closed source,
and your data lives on Meta's computer. Open Muse exists because most of the world
cannot have that.

## Product definition

A single-page web app where a personal agent:

1. **Chats like a person.** Messaging-style interface, streaming replies, short warm
   plain-spoken persona named Muse. No corporate assistant voice.
2. **Turns goals into plans.** When the user states a goal ("my goal is to run a 10k"),
   Muse breaks it into a 4-7 step plan on a Goals board, classifying each step as
   agent-doable (research, drafting, writing, analysis) or human-required.
3. **Advances work step by step.** An "Advance" action runs the next agent step through
   the model and delivers the actual work product (the draft, the plan, the checklist),
   never a description of what it would do.
4. **Pauses for approval on sensitive actions.** A Sentinel policy layer inspects every
   planned step; anything that sends, shares, books, buys, invites, or deletes stops at
   an approval card. The user approves or rejects; both are recorded.
5. **Remembers what matters - and forgets on command.** After exchanges, Muse extracts
   durable personal facts (preferences, relationships, constraints, projects) into a
   visible Memory list. The user can forget one item, ask "forget X" in chat, or wipe
   everything. Memory is injected into the agent's context so it personalizes.
6. **Has granular, revocable permissions.** Per-app scopes (off / read / read+write)
   for Email, Calendar, Files, Web, Payments. Scopes gate what Muse is allowed to plan
   and draft. Changes take effect immediately and are audited.
7. **Keeps a complete audit trail.** Every goal accepted, plan built, step run,
   approval granted or rejected, memory learned or forgotten, permission changed -
   timestamped and inspectable.
8. **Lives in a Personal VM.** All state (chat, goals, memory, audit, settings) persists
   locally in the browser. Optional passphrase mode encrypts the entire store with
   AES-GCM via PBKDF2 (WebCrypto) - a key only the user's passphrase derives, so the
   data is unrecoverable without it, by design.
9. **Is proactive.** While open, Muse periodically reviews active goals and pending
   approvals and nudges the user with concrete next actions they can accept in one tap.
10. **Is honest about limits.** It cannot act after the tab closes; connectors model
    the permission system rather than touching real accounts; external actions are
    drafts and preparations - the final send is always the user's. These limits are
    stated in the UI and README, not hidden.

## Architecture and stack

- **Zero backend, zero build step, one vendored engine.** (Updated 2026-09-23 per
  owner directive: the app now carries a real inference engine - transformers.js on
  ONNX Runtime Web - vendored under vendor/ with pinned versions + sha256 in
  vendor/VERSIONS.md, loaded from same origin. Still no build step, no runtime CDN,
  no other dependencies.) One static `index.html`
  (plus README and MIT LICENSE) deployable to GitHub Pages or any static host.
- **BYO model key.** The user pastes their own OpenRouter API key in Settings; it is
  kept in session/local storage in their browser and only ever sent to openrouter.ai.
  Model name is user-configurable with a sane default.
- **Streaming chat** via the provider's SSE endpoint (fetch + ReadableStream).
- **Structured planning** via JSON-mode model calls for goal breakdown and memory
  extraction.
- **State store** as a single JSON document in localStorage, transparently swapped for
  AES-GCM ciphertext when a passphrase is set. Crypto must derive the key and store
  the salt atomically so lock/unlock round-trips survive reloads.
- **Data model:** settings {model, hasKey}, chat [{role, text, ts}], goals
  [{id, title, created, status, plan.steps[{id, title, kind: agent|user,
  status: todo|doing|approval|done, output}]}], memory [{id, text, ts, source}],
  audit [{ts, kind, text}], connectors [{id, name, scope}], counters.

## Interface

Three-column desktop layout collapsing gracefully to mobile:
- **Left rail:** brand, nav (Chat, Goals & plans, Memory, Permissions, Audit trail,
  Settings), and a "Personal VM" status chip (local / encrypted).
- **Center:** the active view. Chat view is message bubbles + approval cards +
  suggestion cards + a composer. Goals view is a card grid with progress bars and
  per-step status icons. Memory is a dismissible fact list. Permissions is per-app
  segmented scope controls. Audit is a timestamped ledger. Settings holds key, model,
  passphrase, export-my-data (JSON download), and erase-everything.
- **Right dock:** live agent status (state, model, actions taken, awaiting approval),
  the work queue (next steps across goals), and a Sentinel explanation.
Dark, calm visual language; one accent color; nothing flashy. Fully responsive.

## Behavioral rules the agent must follow

- Talk like a person in a chat app. Under ~120 words unless depth is asked for.
- Never claim to have sent, bought, booked, or changed anything external. Draft and
  prepare; the human executes.
- If the user states a goal, plan it. If they say "advance", advance the active goal.
- Sensitive steps never run without explicit approval, even if the user earlier said
  "just do everything" - approval is per action, in the moment.
- Forgetting is instant, total, and confirmed.

## Acceptance criteria

1. Paste a valid OpenRouter key, send a message, see a streaming reply. With no key,
   a clear in-chat prompt to add one (no crash).
2. "My goal is to learn to cook ramen from scratch" produces a multi-step plan on the
   Goals board within seconds; Advance executes the first agent step and posts its
   real output to chat.
3. A goal involving sending something (e.g. "help me email my landlord about rent")
   pauses at an approval card before any send-adjacent step; approving runs it,
   rejecting skips it; both appear in the audit trail.
4. After chatting, at least one durable fact appears in Memory; "forget <topic>" in
   chat removes matching memories and confirms; Memory view forget buttons work.
5. Changing a permission scope takes effect immediately and is written to the audit
   trail.
6. Audit trail shows every action taken during the session in order.
7. Set a passphrase, reload: the app demands the passphrase, a wrong one fails, the
   right one restores everything byte-for-byte. Without a passphrase the app works
   identically unencrypted.
8. Reload mid-goal: goals, chat, memory, and audit are fully restored.
9. Export-my-data downloads the full decrypted state as JSON. Erase-everything wipes
   local state completely after confirmation.
10. Zero console errors through all of the above. Works on a phone-width viewport.

## Constraints

- Original work only. No copied code, no forked repos, no Meta trademarks or assets.
- Static hosting only; no server, no database, no tracking, no analytics.
- MIT licensed, public repository, README that states both what it does and what it
  honestly cannot do.
