#!/bin/bash
# Set up Puppy from a fresh clone, or bring an existing one up to date: the latest code, its dependencies, and
# ~/Applications/Puppy.app built and opened. Safe to run again any time.   Usage: npm run setup
#
# On the Walmart network (public npm and GitHub downloads blocked) it switches to Walmart's internal mirrors by itself.
# Any other company mirror: pass it once. Either way the mirrors are saved to the gitignored .npmrc and .env.local,
# so later runs (and Settings > About > Update Puppy) just work:
#   PUPPY_NPM_REGISTRY=https://<mirror>/api/npm/npm/ \
#   ELECTRON_MIRROR=https://<mirror>/electron/electron/releases/download/ npm run setup
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" NODE_NO_WARNINGS=1

APP="$HOME/Applications/Puppy.app"   # where scripts/make-app.sh installs it
PUBLIC_NPM_REGISTRY="https://registry.npmjs.org/"
WALMART_NPM_REGISTRY="https://npm.ci.artifacts.walmart.com/artifactory/api/npm/npme-npm/"
WALMART_ELECTRON_MIRROR="https://generic.ci.artifacts.walmart.com/artifactory/github-releases-generic-release-remote/electron/electron/releases/download/"
MIRROR_HINT="On the Walmart network, connect to the VPN or Eagle WiFi. Behind another company mirror, rerun with PUPPY_NPM_REGISTRY=... and ELECTRON_MIRROR=... (see the top of scripts/setup.sh)."

step() { printf '\n==> %s\n' "$1"; }
fail() { printf '\nSetup stopped: %s\n' "$1" >&2; exit 1; }
registry_reachable() { npm ping --fetch-timeout=15000 --fetch-retries=0 >/dev/null 2>&1; }
save_npm_registry() { printf '# Written by scripts/setup.sh (see .npmrc.example)\nregistry=%s\n' "$1" > .npmrc; }
save_electron_mirror() {  # replaces only the ELECTRON_MIRROR line, keeping anything else in .env.local
  { grep -v '^ELECTRON_MIRROR=' .env.local 2>/dev/null || true; echo "ELECTRON_MIRROR=$1"; } > .env.local.new
  mv .env.local.new .env.local
}

step "Checking what Puppy needs"
[ "$(uname)" = Darwin ] || fail "Puppy.app is macOS only. Elsewhere, run it from source: npm install && npm run dev"
command -v git >/dev/null || fail "git is missing. Install Apple's command line tools: xcode-select --install"
command -v node >/dev/null || fail "Node.js 22.9 or newer is missing. Install it: brew install node"
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 9) ? 0 : 1)' ||
  fail "Node $(node --version) is too old; Puppy needs 22.9 or newer: brew upgrade node"
[ -x "$HOME/.code-puppy-venv/bin/code-puppy" ] || command -v code-puppy >/dev/null ||
  echo "Warning: Code Puppy is not installed. Puppy is a window onto it, so install Code Puppy before opening Puppy."
# ps, not pgrep: macOS pgrep never matches its own ancestors, so it misses Puppy when Puppy's own agent runs this.
# And not grep -q: it quits at the first match, ps dies of SIGPIPE, and pipefail turns the match into a failure.
if ps -axo command= | grep -Fx "$APP/Contents/MacOS/Puppy" >/dev/null; then
  fail "Puppy is open, and an app cannot be replaced while it runs. Use Settings > About > Update Puppy instead (it does all of this for you), or quit Puppy and run setup again."
fi

step "Getting the latest code"
[ -d .git ] || fail "this folder is not a git clone (a ZIP download?), so it cannot stay up to date. Clone the repo with git instead."
# A shallow clone (git clone --depth 1) has too little history for the version number, which counts commits.
if [ "$(git rev-parse --is-shallow-repository)" = true ]; then
  git fetch --quiet --unshallow || fail "could not fetch the full history from GitHub. Are you online?"
fi
default=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || echo origin/main)
default=${default#origin/}
branch=$(git symbolic-ref --quiet --short HEAD || true)
if [ -z "$branch" ]; then
  echo "Not on a branch (detached HEAD), so switching to $default."
  git switch --quiet "$default" || fail "could not switch to $default."
  branch=$default
fi
[ "$branch" = "$default" ] || echo "Note: you are on '$branch', not '$default', so '$branch' is what gets built."
if git rev-parse --quiet --verify '@{upstream}' >/dev/null; then
  git pull --ff-only --quiet || fail "could not bring '$branch' up to date with GitHub (offline, or local commits/changes in the way). Sort that out and run setup again."
else
  echo "'$branch' does not track a GitHub branch, so it is built as it is."
fi
echo "Code is at $(git log -1 --format='%h %s')"

step "Installing dependencies"
[ -z "${PUPPY_NPM_REGISTRY:-}" ] || save_npm_registry "$PUPPY_NPM_REGISTRY"
[ -z "${ELECTRON_MIRROR:-}" ] || save_electron_mirror "$ELECTRON_MIRROR"
# Still on the public registry and it is blocked: we are on the Walmart network, so use its mirrors. A registry
# someone configured themselves (their own .npmrc, perhaps with credentials) is never overwritten.
if [ "$(npm config get registry)" = "$PUBLIC_NPM_REGISTRY" ] && ! registry_reachable; then
  echo "The public npm registry is blocked here, so using Walmart's internal mirrors (saved for next time)."
  save_npm_registry "$WALMART_NPM_REGISTRY"
  grep -q '^ELECTRON_MIRROR=' .env.local 2>/dev/null || save_electron_mirror "$WALMART_ELECTRON_MIRROR"
fi
registry_reachable || fail "the npm registry ($(npm config get registry)) cannot be reached. $MIRROR_HINT"
npm install --no-audit --no-fund ||
  fail "npm install failed. If it stopped while downloading Electron, GitHub downloads are blocked. $MIRROR_HINT"

step "Building and installing Puppy.app"
bash scripts/make-app.sh
open "$APP"
printf '\nPuppy %s is installed in %s and opening.\nFrom now on, Settings > About > Update Puppy keeps it up to date.\n' "$(node scripts/version.cjs)" "$APP"
