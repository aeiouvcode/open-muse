# Handoff

_Read this first if you are picking up Open Muse cold._

## What this is
Open Muse: a local-first, zero-backend, BYO-key AI chat/workbench. Static site, no build tooling, no dependencies. Live at https://aeiouvcode.github.io/open-muse/ from this repo (`aeiouvcode/open-muse`, `main`, GitHub Pages).

## Hard rules (owner directives — violations are ship-blockers)
- No Instinct branding, and never the word "instinct" even as wordplay, anywhere user-visible. Audit every string.
- Humanized errors only — never raw provider JSON in the UI.
- No secrets in the repo or its history.
- No new build tooling; the app stays static/dependency-free.
- Do not import micro-interaction/showcase component libraries. shadcn/ui (ui.shadcn.com) and 21st.dev are pattern/anatomy reference only — reimplement natively, keep Open Muse's own art direction. Games and scenes are excluded from those steers.
- Every cycle ends with a self-critique AND a cybersecurity pass, each honestly graded PASS/PARTIAL/FAIL. See CHECKPOINT.md.

## Repo layout
- `index.html` — shell; contains the `app.js?v=` / `styles.css?v=` cache-busts (bump both on every push).
- `app.js` — the whole app (chat, providers, settings, workforce/team/swarm, studio, storage).
  - Credentials: ALL keys are spent through `Broker` (app.js, search "credential broker"). Never attach a key outside it: name the credential + URL, the broker checks the origin, attaches the secret, audits, and refuses wrong hosts. Add new key-using services as a CREDS entry, not a new fetch.
- `styles.css` — all styling. 390px phone-first.
- `studio-frame.html` — sandboxed iframe host for user-built miniapps (opaque origin, `connect-src 'none'`).
- `edge-bridge-contract.html`, `docs/`, `fonts/` (bundled woff2, CSP allows only self + declared origins).

## Deploy (PAT bridge — the vault never returns secrets to shell)
1. Cloud browser lease; open any page (e.g. the live Pages URL).
2. Inject a visible labeled password input; `read-page` to get its ref.
3. `vault fill` entry **"GitHub push token - aeiouvcode"** (kind login, key password). The old entry was deleted and 401s.
4. Stage file contents base64 into `window.__c` via `execute-js` in ~30KB chunks.
5. `execute-js`: read `input.value`, GET current file sha from the GitHub contents API, PUT new base64 content. (Skip the GET for new files.)
6. Clear the input. Verify deployed bytes with `curl ... | sha256sum` against local.
7. Bump both cache-busts in `index.html` in the same push, or browsers serve stale files.

## Instinct File surface
File `file-01M326APAT2KA6SM3C2HG5XAEB` (PRIVATE) is a separate port project (`/home/sandbox/open-muse-file`, rebuild from this repo if wiped): `src/openmuse.ts`=app.js, `src/body.ts`=body HTML as JSON-string export, `src/style.css`, `src/storageShim.ts` (in-memory storage — hosted Files are sandboxed, state is session-only), `src/App.tsx` side-effect injector, bundled fonts, `file.json` declares every egress origin. Publish each passing build immediately; canonical URL shows a sign-in gate on fresh profiles, so QA with a freshly built signed previewUrl.

## QA method
390px-phone-first. Playwright script (`playwright-core` + system chrome `--no-sandbox`) drives the cloud QA and screenshots; inspect actual pixels, never trust export success. Real-key verification happens in the cloud browser with the owner's key — tester passes on HTTP 200 + `choices`, not reply text.

## Built-in engine (added 2026-09-23)
- `engine-worker.js` - module worker running transformers.js; cache-bust its `?v=` in app.js (`LocalEngine.ensure`) whenever the worker changes.
- `vendor/` - pinned inference runtime; hashes in `vendor/VERSIONS.md`. Never refresh without updating the pin file.
- Model weights are NOT vendored; they download from Hugging Face at first use. CSP `connect-src` must keep huggingface.co + *.cdn.hf.co + *.xethub.hf.co.
- Big vendor binaries do not fit the PAT bridge: push them via the in-page fetch->GitHub blobs/trees API job (background execute-js, the page downloads from jsDelivr and uploads to GitHub itself) or the logged-in GitHub web UI (25MB/file limit - the 28MB jsep wasm needs the API path).

## State files
`CURRENT_TASK.md` (active cycle + next actions), `CHECKPOINT.md` (status, completed, failed approaches), `HANDOFF.md` (this file). Update all three every cycle — owner directive 2026-09-23.

## PWA deploy coupling (gen 19+)
- sw.js `const VERSION` must equal the `?v=` cache-bust in index.html for
  app.js/styles.css. The SW precaches `app.js?v=VERSION`; a mismatch means
  the page's requests miss the precache and offline boot breaks silently.
  Bump both in the same commit.
- The SW never caches cross-origin traffic: provider calls, tool fetches
  and engine weight downloads pass straight through. Do not add them.
- The shipped CSP meta in index.html is the single source of the tight
  policy. applyNetPolicy captures it once and derives open-network mode by
  widening only connect-src - edit the policy in index.html ONLY; there is
  no second copy to drift.
- Update flow: new SW waits -> #updatebar -> Update posts SKIP_WAITING ->
  controllerchange (only swaps after the first; first-install claim is
  ignored) -> reload once -> toast via sessionStorage flag.
