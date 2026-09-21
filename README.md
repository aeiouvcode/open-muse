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

## Security

- **Strict CSP:** `default-src 'none'` - the only network egress is the model call to
  your chosen provider (openrouter.ai or tokenharbor.ai). No analytics, no CDN, no
  third-party anything.
- **E2EE at rest and in export:** with a passphrase set, the local store is AES-GCM
  encrypted (PBKDF2, 210k iterations, key derived in-browser and never stored), and
  data exports come out as encrypted envelopes only your passphrase opens.
- **Keys are never embedded in code or artifacts.** The key field is user-entered,
  clearable, and optional device persistence lives inside the encrypted store.
- All user-controlled text is HTML-escaped before render; inputs are length- and
  charset-validated.

## What it is honest about

- It is BYO-key: chat runs on your own OpenRouter or Token Harbor key, stored in
  this browser only. Token Harbor's `:free` models never charge; one Universal Key
  covers its whole catalog. NVIDIA NIM is supported as a self-hosted endpoint
  (run a NIM container and point Open Muse at it): NVIDIA's hosted
  integrate.api.nvidia.com only accepts browser calls from build.nvidia.com
  itself, so a hosted nvapi- key cannot work from any web app - we checked and
  say so in Settings instead of letting you find out the hard way.
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


## Evolve (recursive self-improvement)

Muse drafts concrete improvement proposals (DeepSeek :free route on Token Harbor by default), every attempt runs hard gates - self-tests, schema, size caps, secret scan, external-URL allowlist - and failed attempts stay logged. Nothing self-applies: a static page cannot rewrite its own deployed code. Approved proposals export as a patch bundle or hand off to Instinct with one tap.

## Coder mode

Toggle above chat. Muse reads its own actual source (same-origin) and drafts real diffs with colored rendering. Any diff converts straight into an Evolve proposal.

## Tools, skills, MCP

- Tool registry: calculator (parser, no eval), sandboxed JS worker (no DOM/storage, 5s limit), web search (your Tavily/Brave key), memory, tasks, reminders, fetch-page (open-network mode).
- Muse can build its own tools: it writes the code, gates it, sandbox-tests it, you approve it into the registry.
- Skills teach Muse workflows - three built-ins (togglable) plus your own.
- MCP: remote Streamable HTTP servers over open-network mode. Stdio/local servers are unreachable from any web page (browser limit, stated in the UI).

## Studio (user mini-apps)

Muse builds single-file apps on request. They run in `studio-frame.html` - a sandboxed iframe (opaque origin, no storage) whose own CSP says `connect-src 'none'`. It cannot see your Muse data or the network. Download also works.

## The orb

Muse's orb is this tab. It sleeps when closed (nothing runs - stated honestly in the UI), wakes with everything intact, and catches up: late reminders fire labeled, open goals resume, stale tasks surface. Autonomy: while the tab is open, routine plan steps advance on their own; sensitive steps still pause for approval (the Autonomous toggle lives on the Goals board).
