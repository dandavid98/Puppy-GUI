// Electron's own postinstall downloads its binary from GitHub, but npm 11 skips dependency install
// scripts, so we run it ourselves. Behind a mirror or proxy, set ELECTRON_MIRROR (put it in .env.local:
// gitignored, and loaded by the postinstall script in package.json).
require('electron/install.js')
