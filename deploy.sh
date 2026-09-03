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
mkdir -p .deploy/ukp-cron && cp server/cron/refresh-data.php .deploy/ukp-cron/
REG=$(grep -q "registrationEnabled: true" src/config.ts && echo true || echo false)
sed -e "s#__UKP_API_BASE__#${UKP_API_BASE}#" -e "s#__UKP_API_KEY__#${UKP_API_KEY}#" -e "s#__REGISTRATION_ENABLED__#${REG}#" server/config.template.php > .deploy/ukp-config.php

LFTP_OPTS="set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate no; set net:max-retries 2; set mirror:parallel-transfer-count 4;"
if [ "$WIPE" = 1 ]; then
  echo "▶ WIPING remote public_html (old WordPress) - backup lives in ../UKPWebsiteBackup"; read -r -p "type WIPE to continue: " c; [ "$c" = "WIPE" ] || exit 1
  lftp -u "$LEGACY_FTP_USER","$LEGACY_FTP_PASS" "ftp://$LEGACY_FTP_HOST" -e "$LFTP_OPTS mirror -R --delete --verbose=1 $DRY .deploy/public_html kvizovi.hr/public_html; bye"
else
  # Keep cron-written data/ and img/api/ if newer, never delete unknown remote files
  lftp -u "$LEGACY_FTP_USER","$LEGACY_FTP_PASS" "ftp://$LEGACY_FTP_HOST" -e "$LFTP_OPTS mirror -R --only-newer --verbose=1 $DRY .deploy/public_html kvizovi.hr/public_html; bye"
fi
lftp -u "$LEGACY_FTP_USER","$LEGACY_FTP_PASS" "ftp://$LEGACY_FTP_HOST" -e "$LFTP_OPTS mirror -R --verbose=1 $DRY .deploy/ukp-cron kvizovi.hr/ukp-cron; put $DRY .deploy/ukp-config.php -o kvizovi.hr/ukp-config.php; bye"
rm -f .deploy/ukp-config.php
echo "✔ deployed. Check: curl -sI https://kvizovi.hr/ | head -1"
