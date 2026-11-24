#!/bin/bash
# Build Puppy.app and install it to ~/Applications (no admin rights needed).
#
# electron-builder downloads helper tools from GitHub, which locked-down networks
# often block, so this assembles the bundle directly: Electron's own app shell + our
# built code + our icon, then an ad-hoc signature (valid for apps made on this Mac).
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$PATH" NODE_NO_WARNINGS=1

BUNDLE_ID="com.puppy.desktop"
DEST="$HOME/Applications/Puppy.app"   # fixed on purpose: nothing here can be pointed at another folder
SHELL_APP="node_modules/electron/dist/Electron.app"
PLIST="$DEST/Contents/Info.plist"
set_plist() { /usr/libexec/PlistBuddy -c "Set :$1 $2" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :$1 string $2" "$PLIST"; }

[ -d "$SHELL_APP" ] || { echo "Electron is missing: run npm install first." >&2; exit 1; }
[ -f build/icon.icns ] || { echo "build/icon.icns is missing (see scripts/make-icns.sh)." >&2; exit 1; }

# Replace an existing install, but only if it really is ours.
if [ -e "$DEST" ]; then
  existing_id=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$PLIST" 2>/dev/null || true)
  if [ "$existing_id" != "$BUNDLE_ID" ]; then
    echo "Refusing to replace $DEST: it is not a Puppy app (bundle id '$existing_id')." >&2
    exit 1
  fi
  rm -r "$DEST"
fi

echo "Building the app code..."
npx electron-vite build >/tmp/puppy-desktop-build.log 2>&1

echo "Assembling $DEST ..."
mkdir -p "$HOME/Applications"
ditto "$SHELL_APP" "$DEST"          # ditto keeps symlinks and permissions intact

APP_DIR="$DEST/Contents/Resources/app"
mkdir -p "$APP_DIR"
ditto out "$APP_DIR/out"
cat > "$APP_DIR/package.json" <<JSON
{ "name": "puppy-desktop", "version": "$(node -p "require('./package.json').version")", "main": "./out/main/index.js" }
JSON

cp build/icon.icns "$DEST/Contents/Resources/electron.icns"   # the file Electron's plist points at
# Electron treats an executable literally named "Electron" as a dev copy (app.isPackaged
# stays false) and Activity Monitor would list it as "Electron". Rename it.
mv "$DEST/Contents/MacOS/Electron" "$DEST/Contents/MacOS/Puppy"
set_plist CFBundleExecutable Puppy
set_plist CFBundleName Puppy
set_plist CFBundleDisplayName Puppy
set_plist CFBundleIdentifier "$BUNDLE_ID"
set_plist NSHumanReadableCopyright "Puppy, a desktop app for Code Puppy"
/usr/libexec/PlistBuddy -c "Delete :ElectronAsarIntegrity" "$PLIST" 2>/dev/null || true  # we ship unpacked files, not an asar

echo "Signing (ad hoc)..."
codesign --force --deep --sign - "$DEST" >/dev/null 2>&1
codesign --verify --deep --strict "$DEST"
touch "$DEST"   # nudge Finder/Dock to refresh the icon
echo "Done: $DEST"
