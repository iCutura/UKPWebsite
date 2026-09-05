#!/usr/bin/env bash
# Run after every deploy that touches .well-known or the link landing page, and BEFORE shipping
# an app build: Apple's CDN caches the association file and Android verifies assetlinks at install.
set -uo pipefail
H=https://kvizovi.hr; fail=0
chk() { # chk <label> <url> <expected-status> [grep-body]
  local out; out=$(curl -sS -o /tmp/vl.body -w "%{http_code} %{content_type} %{redirect_url}" --max-time 20 "$2")
  local code=${out%% *}
  if [ "$code" != "$3" ]; then echo "✗ $1: $2 -> $out (want $3)"; fail=1; return; fi
  if [ -n "${4:-}" ] && ! grep -q "$4" /tmp/vl.body; then echo "✗ $1: body lacks '$4'"; fail=1; return; fi
  echo "✓ $1: $out"
}
chk "AASA" "$H/.well-known/apple-app-site-association" 200 '"appID": "X6P3LG956W.injeel.PubQuiz"'
curl -sI "$H/.well-known/apple-app-site-association" | grep -qi "content-type: application/json" && echo "✓ AASA content-type json" || { echo "✗ AASA content-type is not application/json"; fail=1; }
chk "assetlinks" "$H/.well-known/assetlinks.json" 200 'com.injeelit.pubquiz'
chk "team link (unknown code)" "$H/join/team/ABCD1234" 404 'og:title'
chk "team link (bad chars)" "$H/join/team/ab%20cd" 404
chk "event link" "$H/join/event/12" 302
chk "event link (non-numeric)" "$H/join/event/x" 404
chk "quiz link (unknown id)" "$H/play/quiz/999999" 404 'og:title'
chk "get" "$H/get" 200 'Otvori u UKP Quiz'
# SiteGround's front-end serves static files before Apache's www redirect runs, so www may answer
# 200 with the file itself; Apple only asks the apex host, so either answer is fine.
www=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "https://www.kvizovi.hr/.well-known/apple-app-site-association")
case "$www" in 200|301) echo "✓ www host: $www";; *) echo "✗ www host: $www (want 200 or 301)"; fail=1;; esac
# Apple's CDN ingests a domain some hours after the file first goes live; until then it answers 404.
# Keep re-running this script: no iOS build ships before this line is green.
cdn=$(curl -sS -o /tmp/vl.cdn -w "%{http_code}" --max-time 20 "https://app-site-association.cdn-apple.com/a/v1/kvizovi.hr")
if [ "$cdn" = 200 ] && grep -q 'X6P3LG956W.injeel.PubQuiz' /tmp/vl.cdn; then echo "✓ Apple CDN: 200"; elif [ "$cdn" = 404 ]; then echo "✗ Apple CDN: not ingested yet (404), retry later"; fail=1; else echo "✗ Apple CDN: $cdn"; fail=1; fi
chk "Google statements" "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://kvizovi.hr&relation=delegate_permission/common.handle_all_urls" 200 'com.injeelit.pubquiz'
[ $fail = 0 ] && echo "all link checks passed" || { echo "SOME LINK CHECKS FAILED"; exit 1; }
