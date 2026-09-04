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
php /home/customer/www/kvizovi.hr/ukp-cron/refresh-data.php >/dev/null
```

Adjust the absolute path to what Site Tools shows for the account. API load: 3 requests per run (~300/day) plus 137 location-detail requests once a day.

**Do not add `2>&1` to that line.** It used to read `>/dev/null 2>&1`, and that is how eleven venues
lost their description, fee and team cap on the site for a full day with no trace anywhere: the
script reported each failed request on STDERR and the cron threw it away. STDOUT is still discarded
(it is only the one-line summary), but STDERR must reach SiteGround so a failing run turns up in
the cron's mail or job history.

The script also keeps its own record next to itself, so the evidence survives however it is invoked:

| File | Meaning |
|------|---------|
| `ukp-cron/refresh.log` | failures and the runs that produced them, UTC-stamped, trimmed to the last 500 lines |
| `ukp-cron/last-ok.txt` | timestamp of the last fully healthy run - a heartbeat; if it stops moving, the cron is broken |
| `ukp-cron/cache/details.json` | the location-detail map, `{at, complete, details}`; re-read in full once a day |

A run that could not fetch every location's detail exits **2** and marks
`public_html/data/meta.json` with `"locationDetails": "partial"`, which is readable over HTTP:

```
curl -s https://kvizovi.hr/data/meta.json
```

`partial` is not a crisis - the venues that did resolve are fine and the missing ones are retried on
the next run - but it means some venue is being served without its description or fee, and the site
will refuse to remove any description while the flag is set.
