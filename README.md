# Puppy Desktop

A desktop app for Code Puppy in the style of Claude's desktop app: a **Chat** mode
for general questions and a **Code** mode that works inside a project folder you pick.

Built the same way: **Electron + React + TypeScript** (Vite, Tailwind). The app's
brain is your installed Code Puppy, which runs in the background as
`code-puppy --acp` (Agent Client Protocol). Code Puppy keeps updating itself and
the app always uses the current version.

## Run it

- **Puppy.app** in `~/Applications` (build or refresh it with `npm run package:mac`; drag it to the Dock), or
- **Double-click** `Start Puppy.command` in Finder (builds, then runs from source), or
- `npm run dev` for development (UI changes reload live).

Only one Puppy runs per data folder; opening a second one just focuses the first.

## Develop

```bash
npm install                            # needs Node 22+ and Code Puppy installed
npm test                               # unit tests (Vitest)
npm run test:e2e                       # drives the real app + real code-puppy (Playwright)
PUPPY_APP=~/Applications/Puppy.app/Contents/MacOS/Puppy npx playwright test e2e/packaged.spec.ts   # smoke-test the installed app
npm run typecheck
```

### Behind a mirror or proxy

If your network blocks npm or GitHub (a company Artifactory, say), keep that configuration out of git:

- `.npmrc` (gitignored): copy `.npmrc.example` and set `registry=` to your mirror. The lockfile points at the public npm registry; npm swaps in your mirror's host.
- `.env.local` (gitignored): `ELECTRON_MIRROR=https://your-mirror/.../electron/releases/download/` so the postinstall can fetch the Electron binary.

## Layout

| Path | What lives there |
|------|------------------|
| `src/shared/api.ts` | The one contract between main, preload and UI (types + IPC channel names) |
| `src/main/acp/` | Spawning code-puppy, the ACP connection, permission prompts, stdout cleanup |
| `src/main/workspace.ts` | Chat vs code sessions, rename/delete, smart titles, model list (only sessions this app created) |
| `src/main/preview.ts`, `pathGuard.ts` | Private `puppy-preview://` scheme + the folder allow-list behind the preview panel |
| `scripts/make-app.sh` | Assembles and signs `Puppy.app` without electron-builder (blocked network) |
| `build/` | App icon source (SVG), rendered PNG and `.icns` |
| `src/preload/` | The narrow `window.puppy` bridge (context isolation + sandbox on) |
| `src/renderer/src/state/` | Pure reducers that turn ACP updates into a conversation |
| `src/renderer/src/components/` | Sidebar, home, thread, composer, tool cards, permission cards |

## Gotchas

- Code Puppy prints terminal colour codes to stdout before the first JSON-RPC
  message; `jsonLinesOnly` strips them or `initialize` never gets an answer.
- npm 11 skips dependency install scripts, so `scripts/ensure-electron.cjs`
  downloads the Electron binary (it honours `ELECTRON_MIRROR`; see "Behind a mirror or proxy").
- **Pins and folders** (`src/main/organizer.ts`, `folders.ts`, `src/renderer/src/lib/organize.ts`). Both are our own bookkeeping, never
  Code Puppy's: `pinned`/`folderId` live in `sessions.json`, the folders themselves in `folders.json`. A folder belongs to one tab
  (chat or code) and the main process refuses to file a chat in a code folder. Deleting a folder keeps its conversations. The
  sidebar treats a conversation with an unknown folder as unfiled, so nothing can vanish. Order: pinned chats, folders (pinned first,
  then A-Z), then the rest by day. A pin inside a folder stays inside it.
- **Big images are shrunk before sending** (`src/renderer/src/lib/attachments.ts`). We accept up to 30 MB, but anything over
  ~3.5 MB is re-encoded in the renderer (lossless PNG if that fits, else JPEG at falling quality/size, long edge <= 2048)
  and the composer says so. Smaller images are sent byte for byte. An unshrunk 9.7 MB image got no reply from the model.
- Code Puppy's model is a global setting, so the model picker is app-wide (and changes it for the terminal too).
- `session/close` is "Method not found" in code-puppy (its SDK gates it behind the unstable protocol), so deleting a
  conversation also removes its files from `~/.code_puppy/autosaves/acp` itself (`src/main/acp/sessionStore.ts`).
- The model list needs a session, so a throwaway one is opened and closed to read it (same trick for smart titles).
- **Context meter** (left of the model picker; click it for "9.5k of 272k tokens used", the percentage and what is left): ACP only reports token totals *summed over every model request in a turn*,
  so `estimateContext` (src/main/context.ts) recovers the last request's size assuming linear growth from the previous
  turn. Exact for turns without tool calls, an estimate otherwise (the tooltip says so). The stable SDK types hide
  `usage`; `readTurnUsage` reads it defensively. Window sizes come from code-puppy's `models.json`/`extra_models.json`.
- **Quota rings** show the user's REAL quota, not a local guess. Code Puppy builds with a quota service (some organizations' do) expose it as a
  rolling block with two buckets, *all models* and a smaller *large models* one carved out of it (plus requests and a
  reset time), and per-model "burn rates" (0 = free, 1 = most expensive). Puppy never touches the user's token: it runs
  a tiny script inside code-puppy's own Python (`src/main/quota.ts`) that calls code-puppy's own fetch function.
  Quota is per CLASS of model, so a model's ring shows the bucket that applies to it (`src/renderer/src/lib/quota.ts`).
  The server does not publish which models are "large"; we infer burn rate >= 1 (`LARGE_MODEL_MIN_BURN_RATE`), which
  fits the one refusal on record. Unknown models get no ring, never a made-up 0%. Without a quota service the quota UI says
  "unavailable".
  Freshness: polled every 5 min, after each turn, and when the model menu opens; plus a one-shot read at the user's OWN
  reset time (each reading says how many seconds remain, so nothing is hard-coded and every user gets theirs), and on
  wake from sleep (timers do not count sleep). The on-screen "resets in" ticks every 15s (`useNow`). `PUPPY_LIVE_QUOTA=1 npx vitest run
  src/main/quota.test.ts` checks it against the real service.
- **One code-puppy process per project folder** (`src/main/acp/agentPool.ts`). Code Puppy's shell tool and its idea of
  "the current directory" come from the folder the *process* started in, not the ACP session's folder, so a shared
  process ran every command in the wrong place. Each folder now gets its own `code-puppy --acp`, started lazily in that
  folder (pre-warmed when you pick it). Chats and throwaway sessions share the process in the chat folder, which is
  also the app's status. Sessions are routed by folder (`Workspace.contextFor`); permission answers go back to the
  process that asked. Processes are not reaped when idle (a reaped one would need a silent `session/load`).
- **Previews open by themselves** (Settings > Previews turns it off): a completed *edit* of an html/image file, or a
  local URL a command printed / the reply mentions (only once the server answers, via `waitForServer`). Never when
  merely reading a file, never while a saved chat replays (`Thread.replaying`). Localhost pages are framed with
  `allow-same-origin` (they need their own origin); the app refuses to frame its own origin, and `X-Frame-Options` /
  `frame-ancestors` are stripped for localhost sub-frames only (`withoutFramingBlocks`).
- Electron treats an executable named `Electron` as a dev copy, so `make-app.sh` renames it to `Puppy`.
