#!/usr/bin/env bash
# Static export of the grouppot web app for Vercel: no route handlers, no server rendering, zero serverless functions.
# /api/* is a CDN rewrite (not a function) to the relayer on the Mac mini. Output: dist/grouppot/
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
API_ORIGIN=${API_ORIGIN:-https://teslas-mac-mini.tail57f771.ts.net:10000/grouppot}
(cd "$HERE/web" && rm -rf out && env -u NEXT_PUBLIC_RELAYER bun run build > /tmp/grouppot-build.log 2>&1) || { tail -30 /tmp/grouppot-build.log; exit 1; }
OUT="$HERE/dist/grouppot"
# keep the Vercel project link across rebuilds, or the next deploy makes a new project named after the directory
LINK=$(mktemp -d); [ -d "$OUT/.vercel" ] && cp -R "$OUT/.vercel" "$LINK/"
rm -rf "$OUT" && mkdir -p "$OUT" && cp -R "$HERE/web/out/." "$OUT/"
[ -d "$LINK/.vercel" ] && cp -R "$LINK/.vercel" "$OUT/"; rm -rf "$LINK"
# Link-preview crawlers get the relayer's HTML (og tags and a picture of the circle's ring); people get the static page.
# A crawler never sends the #k=... invite part, so the preview carries nothing secret. Vercel serves a file before it
# tries a rewrite, and /c/ is a file, so this uses routes: the crawler route sits before {"handle":"filesystem"}.
BOTS='.*(WhatsApp|TelegramBot|facebookexternalhit|Facebot|Twitterbot|Slackbot|Discordbot|LinkedInBot|Applebot).*'
cat > "$OUT/vercel.json" <<JSON
{
  "\$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "buildCommand": null,
  "routes": [
    { "src": "/api/(.*)", "dest": "$API_ORIGIN/api/\$1" },
    { "src": "/c/?", "has": [{ "type": "header", "key": "user-agent", "value": "$BOTS" }], "dest": "$API_ORIGIN/share/c" },
    { "handle": "filesystem" }
  ]
}
JSON
[ -d "$OUT/api" ] && { echo "refusing: an api/ directory would become a function"; exit 1; }
echo "static build: $(find "$OUT" -type f | wc -l | tr -d ' ') files in $OUT, functions: none"
