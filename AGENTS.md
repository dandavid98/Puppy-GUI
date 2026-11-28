# Notes for coding agents (Code Puppy and friends)

## "Set this repo up for me" / install / get the latest Puppy

Run exactly this from the repo root, and nothing else first:

```bash
npm run setup
```

That one command (`scripts/setup.sh`) does the whole job and is safe to rerun:
checks Node 22.9+, git and Code Puppy, unshallows a `--depth 1` clone, pulls the latest
default branch, runs `npm install`, builds and installs `~/Applications/Puppy.app`, and opens it.
After that the app keeps itself current (Settings > About > Update Puppy).

- It takes a few minutes (npm install + build). Give the shell command a timeout of at least 900 seconds.
- Do NOT substitute `npm install && npm run dev` / `npm start` / `Start Puppy.command`: those run from source
  and never self-update. That is the "stuck on an old version" trap.
- Do NOT pass `--depth 1` when cloning. Clone with plain `git clone <url>`, then `cd` into it.
- If it stops, it prints why. Fix that one thing and rerun `npm run setup`:
  - **npm registry unreachable / Electron download failed**: the network blocks public npm or GitHub.
    Ask the user for their company's npm mirror and Electron (GitHub releases) mirror, then run
    `PUPPY_NPM_REGISTRY=<npm mirror> ELECTRON_MIRROR=<mirror>/electron/electron/releases/download/ npm run setup`.
    They are saved to the gitignored `.npmrc` / `.env.local`. Never commit those files.
  - **"Puppy is open"**: tell the user to use Settings > About > Update Puppy, or quit Puppy and rerun.
  - **Cannot fast-forward**: the user has local commits or changes. Show them `git status`; do not reset or
    discard their work without asking.

## Working on the code

See README.md ("Develop", "Layout", "Gotchas"). `npm test`, `npm run typecheck`, `npm run test:e2e`.
The version is computed, never hand-bumped: see `scripts/version.cjs`.
