#!/bin/bash
# build/icon.png (1024x1024) -> build/icon.icns using only macOS tools.
set -euo pipefail
cd "$(dirname "$0")/.."
set_dir=build/icon.iconset
mkdir -p "$set_dir"
for size in 16 32 128 256 512; do
  sips -z $size $size build/icon.png --out "$set_dir/icon_${size}x${size}.png" >/dev/null
  sips -z $((size * 2)) $((size * 2)) build/icon.png --out "$set_dir/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$set_dir" -o build/icon.icns
rm -r "$set_dir"
