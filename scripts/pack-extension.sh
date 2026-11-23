#!/usr/bin/env bash
# Prépare le fichier .zip à envoyer sur le Chrome Web Store (sans fichiers cachés ni outils de développement).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/extension/manifest.json').version")"
OUT="$ROOT/dist/localshot-extension-$VERSION.zip"
mkdir -p "$ROOT/dist"
rm -f "$OUT"
cd "$ROOT/extension"
zip -qr -X "$OUT" . -x '.*' -x '*/.*' -x '*.DS_Store'
echo "✓ $OUT"
unzip -l "$OUT" | tail -1
