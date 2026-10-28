#!/usr/bin/env bash
# Eksporterer projektet som ZIP uden hemmelige nøgler, data og afhængighedsmapper.
# Bruger git's filliste (respekterer .gitignore) + eventuelle nye, ikke-ignorerede filer.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p exports
name="ai-agency-platform-$(date +%Y%m%d-%H%M).zip"
files=$(git ls-files --cached --others --exclude-standard | grep -Ev '(^|/)\.env($|\.local$|\..*\.local$)' || true)
if echo "$files" | xargs -r grep -lE 'sk-ant-[A-Za-z0-9_-]{20,}' 2>/dev/null; then
  echo "Afbrudt: en fil ser ud til at indeholde en Anthropic-nøgle." >&2
  exit 1
fi
echo "$files" | zip -q -@ "exports/$name"
echo "Oprettet exports/$name ($(du -h "exports/$name" | cut -f1))"
