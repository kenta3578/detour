#!/bin/sh
# Chrome ウェブストアに上げる zip を dist/ に作る
set -eu
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
mkdir -p dist
out="dist/detour-$version.zip"
rm -f "$out"
zip -qr "$out" manifest.json src icons -x '.*'
echo "$out"
