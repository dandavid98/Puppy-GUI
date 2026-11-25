#!/bin/bash
# Update the installed Puppy.app from its own source, then reopen it.
# Started (detached) by the app itself: update-app.sh <app-pid> <log-file> <pull|rebuild>
#
# The app quits first, because an app cannot replace itself while it runs. Whatever
# happens here, Puppy is opened again at the end (the old one if the update failed).
#
# Everything lives inside main() on purpose: bash reads a script as it runs, and
# `git pull` may rewrite this very file halfway through.
main() {
  local app_pid="$1" log="$2" mode="$3"
  cd "$(dirname "$0")/.." || exit 1
  # An app launched from Finder has a minimal PATH; these are where node and git usually live.
  export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" NODE_NO_WARNINGS=1
  exec >>"$log" 2>&1
  echo "=== update started $(date) (mode: $mode) ==="

  notify() { osascript -e "display notification \"$1\" with title \"Puppy\"" >/dev/null 2>&1 || true; }

  for _ in $(seq 60); do kill -0 "$app_pid" 2>/dev/null || break; sleep 0.5; done  # wait for the app to quit

  notify "Updating... Puppy will reopen in a minute."
  local before
  before=$(git rev-parse HEAD)
  if update "$mode" "$before"; then
    notify "Puppy is up to date."
  else
    notify "The update failed, so your old Puppy is back. Details: update.log in Puppy's data folder."
  fi
  open "$HOME/Applications/Puppy.app"
}

update() {
  local mode="$1" before="$2"
  if [ "$mode" = "pull" ]; then
    git pull --ff-only || return 1   # refuses (rather than merges) if you have commits of your own
  fi
  # New or changed dependencies need installing before the build.
  if [ ! -d node_modules ] || ! git diff --quiet "$before" HEAD -- package-lock.json; then
    npm install --no-audit --no-fund || return 1
  fi
  bash scripts/make-app.sh
}

main "$@"
exit
