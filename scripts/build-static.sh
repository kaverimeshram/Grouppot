#!/usr/bin/env bash
# Static export of the grouppot web app for Vercel: no route handlers, no server rendering, zero serverless functions.
# /api/* is a CDN rewrite (not a function) to the relayer on the Mac mini. Output: dist/grouppot/
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
API_ORIGIN=${API_ORIGIN:-https://teslas-mac-mini.tail57f771.ts.net:10000/grouppot}
(cd "$HERE/web" && rm -rf out && env -u NEXT_PUBLIC_RELAYER bun run build > /tmp/grouppot-build.log 2>&1) || { tail -30 /tmp/grouppot-build.log; exit 1; }
OUT="$HERE/dist/grouppot"
rm -rf "$OUT" && mkdir -p "$OUT" && cp -R "$HERE/web/out/." "$OUT/"
cat > "$OUT/vercel.json" <<JSON
{
  "\$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "buildCommand": null,
  "cleanUrls": false,
  "rewrites": [{ "source": "/api/:path*", "destination": "$API_ORIGIN/api/:path*" }]
}
JSON
[ -d "$OUT/api" ] && { echo "refusing: an api/ directory would become a function"; exit 1; }
echo "static build: $(find "$OUT" -type f | wc -l | tr -d ' ') files in $OUT, functions: none"
