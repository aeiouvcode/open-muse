# FEATURE MAP - Open Muse

_Sitemap of every feature and how to reach/trigger it. Kept current with each
behavior change (owner directive 2026-09-25). Use it to interpret vague bug
reports: find the feature here, then check the trigger path. Code anchors are
in app.js unless noted._

## Navigation
Left drawer (hamburger, top-left) lists views: Chat, Goals & plans, Habits,
Workforce, Memory, Tools & skills, Studio, Permissions, Audit trail, Evolve,
Settings. Below: Chats (session drawer) + "+ New". Top-right of chat: status
rail (provider/model/key presence) - tap opens Settings.

## Settings (#view-settings)
- Backup: Export downloads one JSON of everything (keys and cloak originals
  never included). Import shows exactly what the file holds, then offers a
  real choice: Merge (default) adds what is missing and keeps the newer copy
  on same-id conflicts - memory notes dedupe by text, drafts never clobber,
  settings and keys stay as they are; Replace wipes first, as before. Both
  paths report exactly what happened and write to the audit trail.

## Chat (default view, #view-chat)
- Send message: type in #chatinput, press Send (#sendbtn) or Enter. Streams a
  reply token-by-token. Stop button halts mid-stream; partial text is kept.
- Retry a reply: retry action on the last Muse message - regenerates; the old
  variant is parked as a branch.
- Branches: arrows on a user message cycle its variants (attempts); editing a
  sent message forks a new branch instead of rewriting history.
- Pin a chat: pin icon on any chat row in the drawer - pinned chats stay on
  top; the pin shows in accent while set. Rename and delete sit beside it.
- Drafts: an unfinished message is autosaved to its chat (about a second
  after you stop typing), survives reloads and killed tabs, and shows a
  "draft" tag in the chat list. Sending consumes and clears it. Drafts ride
  along in backups.
- Search chats: #chatsearch box above the message list - matches message text
  across sessions, results jump to the session+message.
- Voice input: mic button in the composer (only appears where the browser
  has a speech service). Tap to dictate - existing text is kept and speech
  appends; tap again to stop. Denied permission and offline get human copy.
  Honest note: transcription uses the browser's own speech service, not
  on-device - the tooltip says so.
- Checkpoints: bookmark icon top-right (#checkpointsbtn). Save names a snapshot
  of the chat; Restore rewinds to it; Fork starts a new session from it.
- Sessions: drawer "Chats" lists sessions; "+ New" starts one; a session
  auto-names from the first exchange. Coder sessions (Studio-linked) save via
  the coder bar's Checkpoint / session name flow.
- Welcome/first-run: empty chat shows Muse's intro; it appears only when no
  session has content and no key is set.

## Goals & plans (#view-goals)
- New goal: "+ New goal" - Muse drafts a plan of steps; approve to activate.
- Tasks: "Add a task" input + Add task - tracked open/done, shown in chat when
  relevant. Export: Export Markdown / Export CSV buttons.
- Plans advance in chat ("advance" continues a paused plan).

## Habits (#view-habits)
- Add habit: input + Add habit. Daily check-off, streak counts.

## Workforce (#view-workforce)
- Roster: built-in agents + custom ("Agent name" + "Specialty" + Add agent).
- Per-agent tool scope: tools toggle on each roster row (web search, page
  fetch, calculator). Denied tool calls are blocked at execution, audited
  (kind "scope"), and the agent is asked to answer from knowledge.
- Team templates: Share team exports the roster as a file; Import team loads
  one back. 
- Run: asking for multi-part work in chat proposes a workforce run; the
  coordinator splits subtasks, agents work in the run log, merge lands in chat.
- Automations: schedule recurring prompts; fires in-tab, catches up on wake.
  Parked (with a chat note) when no model key or autonomy is off.

## Memory (#view-memory)
- Facts Muse saved about you; deletable individually. "Forget everything"
  wipes memory (confirm). Memory writes come from chat ("remember that...")
  or automatic nudges the user confirms.

## Tools & skills (#view-tools)
- Prompt library: save prompts (form, or "Save composer text" to capture the
  current draft), one-tap Use drops one into the composer and jumps to chat,
  delete with ×. Included in backups.
- Tool catalog: built-ins with honest badges (real / sandboxed / key needed /
  CORS-blocked). "+ Have Muse build a tool" drafts a custom tool from a
  description.
- Web search: provider picker (TinyFish, Tavily, Brave) + key field + Save.
- Monid: key field for api.monid.ai catalog calls (CORS-limited; the app says
  so instead of pretending).
- MCP servers: add by URL; Discover lists the server's tools; per-server key
  is sent only to that server (broker).

## Studio (#view-studio)
- "+ New app": describe a miniapp; Muse builds it into a sandboxed iframe
  (studio-frame.html, opaque origin, connect-src 'none'). Apps persist locally.

## Permissions (#view-connectors)
- What the app can reach: provider endpoints, open-network mode toggle (off by
  default - direct fetches to arbitrary sites are refused unless enabled).

## Audit trail (#view-audit)
- Every sensitive event, newest first: key uses (kind "broker", first use per
  credential->origin per session + every refusal), scope denials, workforce
  runs, checkpoints, settings changes, reminders. Capped at 500.

## Evolve (#view-evolve)
- Draft proposal: input (blank = Muse picks) - drafts an improvement proposal.
- Run self-tests: executes the app's self-test suite, reports pass/fail.

## Settings (#view-settings)
- Provider: Gemini / OpenRouter / Token Harbor / NIM / Local (Ollama, LM
  Studio) / EDGE//AI (sibling app bridge) / On-device built-in engine.
- API key: #setkey + Save settings. Optional "Remember key on this device".
  Broker copy under the field explains exactly how keys are spent.
- Model: catalog dropdown + filter + refresh; Test probes every listed model
  with a one-token call and floats verified ones up.
- Built-in engine panel (visible when provider = On-device built-in): Load /
  Unload, and Benchmark - runs a fixed battery against the loaded model
  (exact-instruction, arithmetic, JSON shape, generation speed), stores
  results per model+device in settings.bench, and shows them under the panel.
  Numbers are the device's own; WASM vs WebGPU differ by a lot.
- Personal VM passphrase: encrypts local storage when set.
- Privacy cloak: auto-detects emails/phones/card-IDs and swaps taught values
  for synthetic twins before any outbound model call; un-swaps replies.
- Backup: Export backup (one JSON - chats, goals, habits, memory, workforce,
  automations, tools, studio apps, audit) / Import backup (shows exactly what
  it will restore, Replace everything / Cancel; garbage files rejected).
  Keys, MCP keys and privacy-cloak originals are NEVER in the file - after a
  restore, re-add keys in Settings.
- Appearance: theme, density, font size; status strip toggle.
- This app: install/offline status row (only where service workers run;
  hidden inside the hosted File).

## PWA (no view)
- Installs from the browser prompt or iOS Share > Add to Home Screen.
- Offline: app shell boots from the service-worker cache; model calls and tool
  fetches always go to network and are never cached.
- Updates: a bottom bar offers Update/Later when a new version deploys;
  updating purges the old cache and reloads once.

## Credential broker (no view)
- All keys (model, search, Monid, MCP) are spent only through Broker
  (app.js "credential broker"): origin-checked, attached by the broker,
  audited. Refusals appear in the Audit trail and as a human error in chat.
- Bug reports about "key sent somewhere wrong" should be impossible by
  construction; a real one means a fetch site bypassed the broker - grep for
  direct fetch calls carrying headers outside the broker.

## Surface standards (fleet checklist, verified by Evolve > Run self-tests)
- Favicon: inline SVG orb in <head> (and on 404.html).
- Real title + meta description on index.html and 404.html.
- 404: 404.html at repo root - GitHub Pages serves it for unknown paths;
  art-directed, honest copy, link home. Self-test asserts it on Pages.
- No placeholder text anywhere user-visible (self-test scans the DOM).
- Errors: every error that reaches the screen passes humanError() (app.js) -
  first line only, no stack frames, no JSON blobs, plain fallback copy.
  Model-call errors go through friendlyModelError() on top.

## Storage
- Everything lives in the browser (IndexedDB/localStorage), optionally
  encrypted with the Personal VM passphrase. Keys: session-only by default,
  device-persisted only if "Remember key" is checked. Nothing is sent anywhere
  except the chosen provider/tool endpoints.
