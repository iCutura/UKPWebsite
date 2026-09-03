# Server side (SiteGround, PHP)

Deployed by `./deploy.sh` (see repo root):

| Local | Remote (FTP root = `kvizovi.hr/`) | Purpose |
|-------|-----------------------------------|---------|
| `dist/` (Astro build) | `public_html/` | the static site |
| `server/public_html/.htaccess` | `public_html/.htaccess` | redirects, caching, security headers, 404 |
| `server/api/kontakt.php` | `public_html/api/kontakt.php` | contact form → e-mail |
| `server/api/prijava.php` | `public_html/api/prijava.php` | team registration proxy (feature-flagged) |
| `server/cron/refresh-data.php` | `ukp-cron/refresh-data.php` (outside web root) | rewrites `public_html/data/*.json` from the API |
| generated from `.env` | `ukp-config.php` (outside web root) | API key, mail settings, flags. Never in git, never in public_html. |

SiteGround cron (Site Tools → Devs → Cron Jobs), every 15 minutes:

```
php /home/customer/www/kvizovi.hr/ukp-cron/refresh-data.php >/dev/null 2>&1
```

Adjust the absolute path to what Site Tools shows for the account. API load: 3 requests per run (~300/day) plus 137 location-detail requests once a day.
