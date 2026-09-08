#!/usr/bin/env bash
# Deploy kvizovi.hr to SiteGround over FTPS.
#   ./deploy.sh            build + upload site, PHP endpoints, cron script, config (keeps unknown remote files)
#   ./deploy.sh --wipe     same, but first REMOVES everything in public_html (use once, to retire WordPress)
#   ./deploy.sh --dry-run  show what would be transferred
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo ".env missing"; exit 1; }
set -a; source .env; set +a
: "${LEGACY_FTP_HOST:?}" "${LEGACY_FTP_USER:?}" "${LEGACY_FTP_PASS:?}" "${UKP_API_BASE:?}" "${UKP_API_KEY:?}"
command -v lftp >/dev/null || { echo "lftp is required (brew install lftp)"; exit 1; }
WIPE=0; DRY=""
for a in "$@"; do case "$a" in --wipe) WIPE=1;; --dry-run) DRY="--dry-run";; esac; done

echo "▶ building"; npm run build
mkdir -p .deploy && rm -rf .deploy/* && cp -R dist .deploy/public_html
cp server/public_html/.htaccess .deploy/public_html/.htaccess
mkdir -p .deploy/public_html/api && cp server/api/*.php .deploy/public_html/api/
# Every .php in server/cron: refresh-data.php requires refresh-lib.php, and half a script fatals.
mkdir -p .deploy/ukp-cron && cp server/cron/*.php .deploy/ukp-cron/
REG=$(grep -q "registrationEnabled: true" src/config.ts && echo true || echo false)
sed -e "s#__UKP_API_BASE__#${UKP_API_BASE}#" -e "s#__UKP_API_KEY__#${UKP_API_KEY}#" -e "s#__REGISTRATION_ENABLED__#${REG}#" server/config.template.php > .deploy/ukp-config.php

LFTP_OPTS="set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate no; set net:max-retries 2; set mirror:parallel-transfer-count 4;"
if [ "$WIPE" = 1 ]; then
  echo "▶ WIPING remote public_html (old WordPress) - backup lives in ../UKPWebsiteBackup"; read -r -p "type WIPE to continue: " c; [ "$c" = "WIPE" ] || exit 1
  lftp -u "$LEGACY_FTP_USER","$LEGACY_FTP_PASS" "ftp://$LEGACY_FTP_HOST" -e "$LFTP_OPTS mirror -R --delete --verbose=1 $DRY .deploy/public_html kvizovi.hr/public_html; bye"
else
  # data/ is the cron's and is neither uploaded nor deleted, and .well-known/acme-challenge/ is
  # Let's Encrypt's; the association files next to it are ours and mirror with the build.
  # Everything else mirrors the build, deletions included: a page built for an event that was
  # later hidden or removed must not outlive the next deploy (/dogadaji/3180/ stayed up a day
  # after the event went).
  #
  # img/api/ is excluded HERE only to protect it from --delete: the cron writes files into it
  # (<id>.jpg for artwork the build has not mirrored) that do not exist locally and must survive.
  # The images themselves are uploaded by the second mirror below. Excluding the directory
  # outright, which is what this did between 2026-09-04 and 2026-09-08, stops shipping the
  # <id>-s.webp files every built page points at: 23 of 110 images 404'd and venues added since
  # showed an empty logo box. See scripts/verify-images.sh.
  lftp -u "$LEGACY_FTP_USER","$LEGACY_FTP_PASS" "ftp://$LEGACY_FTP_HOST" -e "$LFTP_OPTS mirror -R --only-newer --delete -x '^data/' -x '^img/api/' -x '^\\.well-known/acme-challenge/' --verbose=1 $DRY .deploy/public_html kvizovi.hr/public_html; bye"
fi
# The artwork the built pages point at. Uploaded separately and WITHOUT --delete, so the cron's own
# mirrored files (different names, not present locally) are left alone.
if [ -d .deploy/public_html/img/api ]; then
  lftp -u "$LEGACY_FTP_USER","$LEGACY_FTP_PASS" "ftp://$LEGACY_FTP_HOST" -e "$LFTP_OPTS mirror -R --only-newer --verbose=1 $DRY .deploy/public_html/img/api kvizovi.hr/public_html/img/api; bye"
fi

# put has no --dry-run of its own; skip it rather than let it error out the dry run.
PUT_CFG="put .deploy/ukp-config.php -o kvizovi.hr/ukp-config.php;"; [ -n "$DRY" ] && PUT_CFG="echo '(dry run) would upload ukp-config.php';"
lftp -u "$LEGACY_FTP_USER","$LEGACY_FTP_PASS" "ftp://$LEGACY_FTP_HOST" -e "$LFTP_OPTS mirror -R --verbose=1 $DRY .deploy/ukp-cron kvizovi.hr/ukp-cron; $PUT_CFG bye"
rm -f .deploy/ukp-config.php
echo "✔ deployed. Check: curl -sI https://kvizovi.hr/ | head -1"
[ -n "$DRY" ] || ./scripts/verify-images.sh
