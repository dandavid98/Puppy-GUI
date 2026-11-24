#!/bin/bash
# Double-click in Finder to build and open Puppy.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:$PATH" NODE_NO_WARNINGS=1

[ -d node_modules ] || npm install --no-audit --no-fund
npx electron-vite build >/tmp/puppy-desktop-build.log 2>&1
nohup npx electron-vite preview >/tmp/puppy-desktop.log 2>&1 &
