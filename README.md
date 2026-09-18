# Open Muse

An open-source, local-first personal AI agent, inspired by the idea of Meta's Muse
(a personal agent that takes work off your plate) and rebuilt for everyone, everywhere,
with no region locks and no server holding your life.

**Live app:** https://aeiouvcode.github.io/open-muse/

## What it does

- **Chat-first.** Talking to Muse works like messaging a person. Tell it what needs
  to get done.
- **Goals to plans.** State a goal and Muse breaks it into a concrete step plan on the
  Goals board, then advances it step by step with you.
- **Approvals before sensitive actions.** A Sentinel policy layer pauses anything that
  sends, shares, books or buys until you explicitly approve it.
- **Memory you control.** Muse learns durable facts from conversation, shows you every
  one, and forgets anything on request - one item or everything.
- **Permissions model.** Per-app scopes (off / read / read+write) gate what Muse is
  allowed to plan and draft. Revoke any time.
- **Audit trail.** Everything Muse has done and plans to do, recorded and inspectable.
- **Personal VM.** All state lives in your browser. Set a passphrase and the store is
  encrypted with AES-GCM using a key derived from your passphrase - a key only you hold.

## What it is honest about

- It is BYO-key: chat runs on your own OpenRouter key, stored in this browser only.
- On static hosting it cannot run after you close the tab; it picks up where it left
  off when you return and nudges you while it is open.
- Connectors model the permission system locally. They gate planning and drafting;
  they do not touch your real accounts. External actions are drafts and preparations -
  the final send is always yours.

## Running it

It is a single static `index.html`. Serve it anywhere or open the live Pages link.
No build step, no dependencies, no backend.

## License

MIT - see LICENSE. Built from scratch; no code from Meta or any existing project.
