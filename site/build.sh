#!/usr/bin/env sh
# Build the static site into ./dist (site + live browser demo from ../app).
# Usage: sh build.sh            (set SKIP_DEMO=1 to build without ../app)
set -eu
cd "$(dirname "$0")"

rm -rf dist
mkdir -p dist
cp index.html site.css site.js dist/
if [ -d assets ]; then cp -R assets dist/; fi
for f in robots.txt favicon.ico _headers; do
  if [ -f "$f" ]; then cp "$f" dist/; fi
done

if [ "${SKIP_DEMO:-0}" = "1" ]; then
  echo "SKIP_DEMO=1: building without /demo/"
  exit 0
fi
if [ ! -f ../app/index.html ]; then
  echo "error: ../app/index.html not found (set SKIP_DEMO=1 to build the site alone)" >&2
  exit 1
fi

mkdir -p dist/demo
cp -R ../app/. dist/demo/

# Inject the static-mode flag right after <head> (portable: python, no sed -i differences).
PY=python3
"$PY" -c 'import sys' >/dev/null 2>&1 || PY=python   # e.g. Windows' python3 store stub
"$PY" - dist/demo/index.html <<'PYCODE'
import re, sys
path = sys.argv[1]
tag = '<script>window.HAUNTFACE_STATIC=true</script>'
with open(path, encoding='utf-8') as f:
    html = f.read()
if tag not in html:
    html, n = re.subn(r'(<head\b[^>]*>)', lambda m: m.group(1) + tag, html, count=1, flags=re.I)
    if n == 0:
        sys.exit('error: no <head> tag in dist/demo/index.html')
with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
PYCODE

echo "built ./dist (site + /demo/)"
