#!/usr/bin/env bash
# Every image the built pages reference must actually be on the server.
#
# Why this exists: `fetch-data.mjs` mirrors venue artwork into `public/img/api/<id>-s.webp` and the
# build bakes those paths into every page, while the host cron mirrors the same artwork under a
# DIFFERENT name (`<id>.jpg`, no sharp in PHP) for the pages it renders in the browser. On
# 2026-09-04 deploy.sh started excluding `img/api/` from the upload on the reasoning that the
# directory "belongs to the cron" - which quietly stopped shipping the half the built pages point
# at. Artwork added before that date kept working; everything after it 404'd, so venues showed an
# empty logo box, and it read as "only the newest two are broken" until it was 23 of 110.
#
# Run after any deploy that touches images or deploy.sh itself. Sampled, not exhaustive: it checks
# the newest referenced images, which is where this failure always shows first.
set -uo pipefail
H=${1:-https://kvizovi.hr}
PAGES=${PAGES:-"/lokacije/ /dogadaji/ /"}
LIMIT=${LIMIT:-40}

refs=$(for p in $PAGES; do curl -sS --max-time 20 "$H$p"; done \
  | grep -o 'img/api/[A-Za-z0-9._-]*' | sort -u)
[ -z "$refs" ] && { echo "✗ no images referenced by $H - is the site up?"; exit 1; }

# Newest ids last in a numeric sort, and they are the ones that break first.
sample=$(printf '%s\n' "$refs" | sort -t/ -k3 -V | tail -"$LIMIT")
total=0; fail=0
while read -r p; do
  [ -z "$p" ] && continue
  total=$((total + 1))
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "$H/$p")
  [ "$code" = "200" ] || { echo "✗ /$p -> $code"; fail=$((fail + 1)); }
done <<< "$sample"

if [ "$fail" -gt 0 ]; then
  echo "✗ $fail of $total sampled images are missing on the server."
  echo "  The build stages them in dist/img/api/; check that deploy.sh still uploads that directory."
  exit 1
fi
echo "✓ all $total sampled images resolve on $H (of $(printf '%s\n' "$refs" | wc -l | tr -d ' ') referenced)"
