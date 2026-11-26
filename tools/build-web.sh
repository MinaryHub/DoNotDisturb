#!/usr/bin/env bash
# 웹 빌드: Godot를 받아(없으면) build/site/donotdisturb/ 에 내보낸다. Vercel 빌드 명령이 이것을 부른다
set -euo pipefail
cd "$(dirname "$0")/.."
GODOT="${GODOT:-$(command -v godot || true)}"
if [ -z "$GODOT" ] || [ ! -f "$HOME/.local/share/godot/export_templates/4.5.1.stable/web_nothreads_release.zip" ]; then
  GODOT="$(python3 tools/godot-setup.py web_nothreads_release.zip | tail -1)"
fi
OUT=build/site/donotdisturb
rm -rf build/site && mkdir -p "$OUT"
"$GODOT" --headless --import < /dev/null > /dev/null 2>&1 || true
"$GODOT" --headless --export-release Web "$OUT/index.html" < /dev/null
test -f "$OUT/index.pck"
echo "웹 빌드: $OUT"
