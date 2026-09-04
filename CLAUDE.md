# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

The new public website for **Urbana kviz priča (UKP)**, the Zagreb pub-quiz organiser behind the UKP Quiz apps. It replaces the legacy WordPress site at **https://kvizovi.hr**, which will be removed completely once this site is live.

Status (2026-09-03): **first full build of the new site exists in this repo** (Astro 5 static site, whole site map, seasonal theme, GSAP motion, live data from the API). Not yet deployed; WordPress is still live on the domain. Hosting decision: **the new site stays on the same SiteGround account**; the WordPress install will be wiped and replaced, the domain, DNS zone and Google Workspace mail stay where they are.

The backup and inventory of the old site live **outside this repo** in the sibling folder `~/Development/UKPWebsiteBackup/` (not a git repo, ~1 GB of media). This repo only keeps the docs derived from it.

Related repos (siblings under `~/Development/`):
- `PubQuiz/` - the apps, API and admin panel. **Brand assets live there:** `brand/brand_guidelines.html`, `brand/UKP Brand guidlines/` (EPS/PNG logos), `brand/logo.png`, and the stage-deck artwork in `docs/design/ukp-stage-deck/` (seasonal art, logo, teambuilding stamp).
- `UKPWebsiteBackup/` - full FTPS copy of the old kvizovi.hr WordPress files (`site/`), page snapshots and text extracts (`pages/`), upload inventory, DNS snapshot, `NOTES.md`, and the read-only scripts that produced them (`scripts/`).
- `Injeel Web/` - the Injeel IT company site (separate brand, separate domain). Do not mix them up.

Docs in this repo:
- `docs/designer-brief-legacy-content.md` - content-only inventory of the old site (every page, verbatim Croatian copy, contact/company facts) written for the external designer. Deliberately says nothing about visual design.

## Stack and commands

- **Astro 5** (`output: 'static'`, `build.format: 'directory'`), TypeScript, vanilla JS + **GSAP 3** (ScrollTrigger) for motion, **Three.js** for the hero's WebGL layer only (dynamically imported, ~0 cost on other pages), **sharp** for image processing. No UI framework.
- **Croatian only**; copy lives in the `.astro` pages, taken from `docs/designer-brief-legacy-content.md`.

```bash
npm install
npm run data        # snapshot the API -> public/data/*.json + mirror images to public/img/api (needs UKP_API_KEY in .env)
npm run assets      # regenerate optimized brand/season assets from assets-src/ (only when sources change)
node scripts/build-legacy-assets.mjs   # photos/logos salvaged from the old site (assets-src/{partners,team,teambuilding,gallery,about})
npm run dev         # http://127.0.0.1:4321
npm run build       # = data + astro build -> dist/ (164 pages)
npm run build:offline   # astro build without refetching
./deploy.sh [--dry-run|--wipe]   # FTPS upload to SiteGround; --wipe once to retire WordPress (asks for confirmation)

npm run map         # regenerate src/data/map-outline.json from Natural Earth (rarely; it is committed)

npm test            # unit tests (vitest, tests/unit) - pure logic, no browser
npm run test:e2e    # browser tests (playwright, tests/e2e) - builds and previews first
npm run test:all    # both
```

## Tests

Two layers, because the bugs this site actually shipped were not logic bugs.

- **`tests/unit`** (vitest, 88 tests) covers the pure functions: Croatian dates and plurals, fee
  wording, slugs that fold č/ć/ž/š/đ, the season boundaries that must stay identical to the iOS
  app, card HTML (venue-led titles, the date stated once, status and escaping), the location order
  and the three-hour window that drops a quiz once it has started.
- **`tests/e2e`** (playwright, 58 tests × desktop and phone) runs against a real production build,
  never the dev server, which has served stale scoped CSS more than once. It asserts what a reader
  sees: that filtering actually removes cards from view rather than only changing the counter, that
  a heading never lands on the label above it, that nothing is cut off the side of any page, that
  no page can be dragged sideways, and that the registration flow steps from the apps to the form.

Both of the bugs that reached the site were CSS-resolution problems that no unit test could catch:
a card's `display: flex` outranking `[hidden]`, and a caron overflowing its line box. The e2e layer
exists for that class. When adding a fix, add the check that fails without it, then confirm it
fails: reintroducing the three known bugs turns 11 phone and 10 desktop tests red.

Key files:
- `src/components/Hero.astro` + `src/scripts/hero3d.ts` - the **layered hero**: the designer's split "Presentation mode" scene (`brand/UKP Brand guidlines/Presentation mode/<Season>/`, five PNGs: bg, foliage, glow, mascot, UKP letters) converted by `scripts/build-layers.mjs` into `public/img/layers/<season>/` (mascot and letters trimmed to their content box). Stack order bg → glow → letters → mascot → Three.js canvas → foliage → text. `motion.ts` `hero()` adds scroll parallax on each `.layer` (far layers lag, `data-depth` 0..1), pointer parallax on the inner `.drift`, a float on the mascot and a breathing glow; `hero3d.ts` renders additive golden dust with mouse repulsion plus shader light rays from the top-right, DPR capped at 1.5, paused when off-screen or hidden, skipped without WebGL or under reduced motion / `?motion=off`. Phone layout stacks letters and mascot above the headline on a dark scrim; desktop puts text left, scene right. The hero paints **no ground of its own**: `.scene` carries the dark and is masked away over its last `--hero-fade` pixels, so the artwork itself thins out and the paper below shows through the foliage. Both the text scrim and the scene share that fade, or whichever paints last leaves a hard line at the join. Do not give `.hero` a background colour, and keep `.hero-content`'s bottom padding at least `--hero-fade`, or the buttons land in the faded region. The old single-image seasonal hero assets in `public/img/seasons/*-hero-*.webp` are unused now but kept.
- **Season lock:** `LOCKED_SEASON = 'fall'` in `src/lib/seasons.ts` forces fall everywhere (inline head script, `season.ts`, footer switcher hidden) because only the fall layer set exists. When the other three sets arrive: drop them into `assets-src/layers/<season>/` with the same five names, add the season to `SEASONS` in `scripts/build-layers.mjs`, run it, and set `LOCKED_SEASON = null`.
- **Surface system** (`src/styles/global.css`) - the page is built from four surfaces, and the rule is that no two adjacent bands share one: `--paper` (the ground: every reading section, list and form), `--paper-2` via `.band-tint` (alternation), the seasonal gradient via `.band-gradient` and the shared `.page-head` band (page heads only, fading into paper), and `.band-dark` (team building, the app pitch, the footer). Each season defines its own `--paper`/`--paper-2`. Before this the whole page sat on one seasonal gradient and cards were translucent white on mid-brown, which read as muddy; `.card-light` is now solid white with a hairline (`--rule`) and a soft shadow. When adding a section, pick its surface deliberately rather than letting it inherit.
- **Typography** - `--font-display` is **Cobe Heavy**, self-hosted from the brand package (`public/fonts/cobe-heavy.woff2`, 16 KB, subset to Latin + Croatian by `npm run fonts`); it is the same cut the quiz presentation mode uses, and its fallback chain (Anton, Impact) matches the deck's. It takes `h1`, `h2`, `.display` and `.num` (counters, dates, times, prices). Everything else - card titles (`h3`), body, labels, chips, inputs - stays on the system stack. Do not set Cobe below ~20 px; it is a poster weight and there is no lighter cut worth shipping.
- `src/lib/seasons.ts` + `src/styles/global.css` - the **seasonal theme engine mirrored 1:1 from the iOS app** (`SeasonalThemeManager.swift`, `AppTheme.swift`): four accent sets, soft/warm/night gradient stops, semantic tokens, radii, shadows. `<html data-season>` is set before first paint by an inline script in `src/layouts/Base.astro`; `src/scripts/season.ts` handles the footer switcher, `?season=spring|summer|fall|winter|auto` and `localStorage['ukp-season']`. Same MMDD ranges as iOS (spring 03-20..06-20, summer ..09-21, fall ..12-20, winter otherwise).
- `src/scripts/motion.ts` - GSAP: hero word reveal + art parallax, scroll reveals (`data-reveal`), counters (`data-counter`), parallax (`data-parallax`), magnetic buttons, card tilt, header hide/show, mobile nav. Respects `prefers-reduced-motion`; `?motion=off` (persisted as `localStorage['ukp-motion']`) disables it, useful for screenshots.
- `src/lib/render.ts` / `src/lib/detail.ts` - **isomorphic HTML renderers** for event/location/news cards and detail blocks. Card rules worth keeping: an event with no name is titled by its **venue** (most termini are unnamed, so a generic fallback produced three identical "Pub kviz" cards in a row); the date block is the only place the date appears, and the eyebrow returns only for `danas`/`sutra`; chips sit on a rule at the card foot with the body centred, so equal-height rows read as padding rather than a hole. Used by Astro at build time and by `src/scripts/live.ts` in the browser, which re-renders `[data-live]` lists from `/data/*.json` on every page load (so the cron-refreshed snapshots show without a rebuild) and upgrades dates to "danas/sutra".
- `src/scripts/live.ts` `checkEventPage()` - a built `/dogadaji/{id}/` page checks itself against `events.json` on load and, when its event is no longer in the snapshot (hidden or deleted in the admin after the build), swaps the registration panel for `eventGoneHTML()` and the status chip for "Termin nije dostupan". An empty snapshot is treated as a failed refresh and changes nothing. Before this, `/dogadaji/3180/` advertised a deleted 04:00 rehearsal termin for a day.
- `src/components/LayeredScene.astro` + `scenes()` in `motion.ts` - the hero's five layers as a framed card (`data-scene-card`, `data-depth` per layer) with scroll parallax measured over the card's own trip through the viewport, pointer parallax (shared `pointerParallax()` helper with the hero), mascot float and breathing glow; no Three.js. Replaces the flat mascot photo beside the format tiles and on the 404 page. The old `public/img/seasons/*-mascot-*.webp` files are unused now but kept.
- `src/components/PhoneShowcase.astro` + `phones()` in `motion.ts` + `scripts/build-promo-frames.mjs` - the app pitch's phones: the deck's three-phone fan (league left, home in front, quiz right), each a **real device frame**: fastlane's frameit iPhone 17 Pro Silver PNG with the App Store capture composed underneath at frameit's offset (`+72+69`, 1206 wide), written as transparent 640 px WebP into `public/img/promo/*-framed.webp`. Sources live in `assets-src/promo/` (gitignored; the script refetches the frame from github.com/fastlane/frameit-frames when missing, and the captures come from `PubQuiz.Admin/src/assets/presentation/promo/`). A CSS bezel was tried first and read as a thick fake; Koubou (`asc screenshots frame`) fails on Python 3.9 while extracting its frame bundle. Each phone floats on its own rhythm and the trio tilts towards the pointer (`data-tilt`); under reduced motion or `?motion=off` they hold still.
- **Scoped-style gotcha:** a rule like `.hero .btn-ghost` in a component's `<style>` only reaches elements rendered by that component. Buttons that come from a child component (`AppBadges`) fall through to the global `.btn-ghost`, which is dark-on-light; give their wrapper the global `on-dark` class instead. This shipped once as a near-invisible Google Play button in the hero.
- `src/scripts/stickyAside.ts` - the event page's sticky registration panel is taller than a small laptop's viewport once the form step opens (~910 px), and a top-pinned sticky element keeps its bottom out of reach until the main column runs out. The script pins the bottom edge instead whenever the panel does not fit (a negative `top`), re-measured on resize and on every panel height change.
- `src/pages/404.astro` - doubles as the **client-side fallback** for `/dogadaji/{id}/` and `/novosti/{id}/` created after the last build (renders from the JSON), and redirects legacy WordPress URLs.
- `scripts/fetch-data.mjs` (build) and `server/cron/refresh-data.php` (host cron) produce the **same JSON shape**; keep them in sync when adding fields. Both drop events more than 3 h past their start (the API's `from=<today>` still returns this morning's quiz, so a 03:00 termin was being advertised as "danas") and recompute each location's next quiz from what is genuinely ahead. `getLocations()` then sorts locations with a scheduled quiz first: a visitor came to find a quiz, not to read an alphabetical directory.
- `docs/design-review/` - working files for the published design-review canvas (four artboards + `canvas.json`). Re-seed from these when the review is updated; the seeded `.html` is a build output.
- `deploy.sh` mirrors the build **with deletion** (`--delete`), leaving `data/` and `img/api/` to the cron (neither uploaded nor deleted), so a page built for an event that has since gone does not outlive the next deploy. `--dry-run` lists what would be removed; read it before a real deploy after long gaps. SiteGround's NGINX serves `/data/*.json` with its own six-month `max-age` no matter what `.htaccess` says; the site's fetches use `cache: 'no-cache'` and revalidate, so this only matters for other consumers.
- `server/` - PHP endpoints (`api/kontakt.php` mail, `api/prijava.php` registration proxy), `.htaccess`, cron. Secrets go to `kvizovi.hr/ukp-config.php` outside the web root, generated from `.env` by `deploy.sh`. See `server/README.md`.
- `src/components/LocationsMap.astro` + `src/lib/geo.ts` + `src/data/map-outline.json` - the **locations map**. The outline is generated once by `npm run map` from Natural Earth (public domain), simplified with Douglas-Peucker to 27 KB and committed, so the map needs no library, no tile server and no third-party request; a test asserts that. Pins are grouped by city, sized by how many venues it has, and an accent halo marks a city with a quiz coming. `project()` in `geo.ts` must stay identical to the projection in `scripts/build-map.mjs`, or pins drift off the coastline.
- **The display face (Cobe) has a narrow word space**, .16em against the body font's .205em, and the headings' negative letter-spacing trims it further, so words run together at heading sizes. `h1, h2` and `.display` add `word-spacing`; keep it on anything else that adopts `--font-display`.
- **Dark surfaces come in two flavours and both must be styled.** `.on-dark` and `.band-dark` mark dark *sections*; `.card-dark` marks a dark *card*. Any rule that flips a colour for a dark ground must list all three, or the card case silently keeps the light-mode ink. This shipped three times: ghost buttons, input placeholders, and the status chips (which were written for the dark event card and then reused on the light detail hero). `tests/e2e/contrast.spec.ts` computes real composited contrast and fails on text that all but disappears, on faint ink under half opacity, and on a status chip that does not flip with its surface.
- `src/lib/consent.ts` - **how the site asks for a location.** It never calls `getCurrentPosition` on load: an unexplained prompt converts badly, browsers penalise it, and a refusal is usually permanent, which would close the feature for that visitor for good. Instead the page checks what the browser already knows. Permission already granted means distances appear on arrival with no prompt. Otherwise the page explains itself in its own words and only a click reaches the browser prompt. A refusal, or a "Ne, hvala", is remembered and never asked again. **Only the decision is stored, in `ukp-geo`; coordinates are never written anywhere**, and a test asserts that. Both privacy pages describe this, and `/kolacici/` carries a button that erases the decision.
- `src/components/NearbyControls.astro` + `src/scripts/nearby.ts` - **"quizzes near me"** on the locations and events pages. Asks for a position, reorders the grid by distance and badges each card. Locations without coordinates (43 of 137) keep their place behind the measured ones rather than disappearing, the original order is restored by Poništi, and a refused permission says so in Croatian and changes nothing. The same control sits on the homepage rail. **The live refresh rewrites whole card grids**, which silently threw the ordering away, so `nearby.ts` listens for the `ukp:live` event and re-applies to the new cards, reusing the position it already has.
- `src/config.ts` - contacts, company data, social + app-store links, partners, nav, and the `registrationEnabled` flag.

Assets: `public/img/seasons/` (hero 1920/1280/768, mascot 820x740 crop that stops above the baked-in wordmark, portrait gradients, icons), `public/img/brand/`, `public/og/`, salvaged `public/img/{partners,team,teambuilding,gallery,about}`. Raw sources in `assets-src/` are gitignored (20 MB PNGs); `public/img/api/` and `public/data/` are build outputs, also gitignored.

## Secrets

**This repository is public.** Never commit credentials, server addresses, database names or the WordPress path; keep them in `.env` and in the password manager. `.env.example` documents the key names only.

All credentials live in **`.env`** at the repo root (gitignored, mode 600). Never commit them, never paste them into tracked files, never echo them into logs. `.env.example` documents the keys.

Load them in shell scripts with:

```bash
set -a; source .env; set +a
```

Current keys:

| Key | Purpose |
|-----|---------|
| `LEGACY_FTP_HOST` / `LEGACY_FTP_PORT` / `LEGACY_FTP_USER` / `LEGACY_FTP_PASS` | FTP account on the SiteGround host of the old site. Read-only by convention: we only download from it. |
| `LEGACY_SITE_URL` | `https://kvizovi.hr` |
| `SG_MYSQL_HOST` / `SG_MYSQL_PORT` / `SG_MYSQL_USER` / `SG_MYSQL_PASS` | MySQL on the same SiteGround server. One user, granted on both databases below. |
| `SG_MYSQL_DB_LEGACY` | The old WordPress database. **Read-only for us.** |
| `SG_MYSQL_DB_NEW` | Empty database created 2026-09-02, kept as a fallback. The site does not use it. |

API key note: the website uses its own production key, **`ApiKeys:PublicWebsite`** in `PubQuiz.API/appsettings.Production.json` (added 2026-09-03; the dev appsettings carry a `PublicWebsite` entry with the shared dev key). `ApiKeyMiddleware` reads `ApiKeys` as a name → key dictionary, so this key can be rotated without touching the apps or the admin. Rotating it means: change it in `appsettings.Production.json`, redeploy the API, change `UKP_API_KEY` in `.env` here, run `./deploy.sh` so the cron/proxy config on SiteGround picks it up.

MySQL notes: SiteGround only accepts remote MySQL connections from IPs whitelisted in **Site Tools > Site > MySQL > Remote**; from anywhere else the login fails with error 1045 "Access denied" even with the right password. Connect with TLS (`ssl={"ssl": {}}` in PyMySQL). A pure-Python dump script lives in `../UKPWebsiteBackup/scripts/mysql_dump.py` (venv at `../UKPWebsiteBackup/.venv`).

FTP notes: the server accepts **explicit FTPS on port 21** (`curl --ssl-reqd`, Python `FTP_TLS` + `prot_p()`), so always use TLS; plain FTP would send the password in the clear. The account is chrooted at `/`, the WordPress root is **`kvizovi.hr/public_html/`**. The TLS certificate does not match the ftp hostname, so scripts skip verification (`-k`).

## Legacy site (kvizovi.hr)

Facts gathered 2026-09-02, details and content extracts in `../UKPWebsiteBackup/NOTES.md`:

- WordPress on SiteGround shared hosting, **Divi** theme, plugins: All in One SEO, Complianz (cookie banner), Smash Balloon Instagram feed, hCaptcha, SiteGround optimizer/security, dg-carousel.
- **Ten pages** (the sitemap only listed five): `/`, `/o-nama/`, `/pub-kvizovi-zagreb/`, `/kvizaski-teambuilding/`, `/partneri/`, `/arhiva-kvizova/` (alias `/arhiva/`), `/medijski-kutak/`, `/kontakt/`, `/pravila-privatnosti/`, `/cookie-policy-eu/`, plus the default "Hello world!" post. Full list in `../UKPWebsiteBackup/urls.txt`; these need 301 redirects on the new site.
- Site language is **Croatian only**.
- Contact details on the old site: phone `+385 92 387 0832`, emails `organizacija@kvizovi.hr` / `info@urbanakvizprica.hr` / `info@kvizovi.hr` (inconsistent, pick one). Company: Kvizovi j.d.o.o., MBS 081519250.
- Uploads: 1.6 GB on disk, of which **~800 MB / 1,667 files are originals** (2023 and 2025 folders; 2024 and 2026 are empty). The rest are WordPress-generated resized copies and Instagram-feed cache. Inventory in `../UKPWebsiteBackup/inventory*.tsv`.
- Page text and image references are extracted to `../UKPWebsiteBackup/pages/*.txt` (raw HTML alongside as `.html`). WordPress page content itself is in the MySQL database, which FTP cannot reach; for a full content export use SiteGround Site Tools or WP admin (Tools > Export).

### Before wiping the WordPress install

1. Confirm `../UKPWebsiteBackup/site/` is complete (`backup.log` ends with a `done:` line and `failed 0`), and take a WordPress export or phpMyAdmin dump for the database.
2. Delete only under `public_html/`. **Do not touch the DNS zone or email settings in Site Tools**: nameservers stay on SiteGround, MX goes to Google Workspace, SPF/DKIM/DMARC are SiteGround-managed. Snapshot of every record for comparison: `../UKPWebsiteBackup/dns-snapshot.txt`.
3. Keep the two `google-site-verification` TXT records so Search Console ownership survives.
4. Ship the new site with 301 redirects for every URL in `../UKPWebsiteBackup/urls.txt`.
5. Domain registration is at CARNET, paid until 2027-07-26; unaffected by any of this.

## Architecture decision (2026-09-02)

- **Static site, no database of its own, hosted on the existing SiteGround account** (PHP + static files only; no Node/.NET runtime there). Built locally or in CI and uploaded to `public_html` over the same FTPS account. The empty MySQL database `SG_MYSQL_DB_NEW` stays unused as a fallback; PostgreSQL was considered and rejected (third engine, less supported on this host).
- **Live data comes from the PubQuiz API, never from the browser.** Browsers must not call `api.injeel-it.hr` directly: CORS only allows the admin origin, the API key would be exposed, and the public GET endpoints have no output cache, so a traffic spike would land on the shared SQL Server the live apps use. Instead: fetch at build time, plus a SiteGround cron every 10 to 15 minutes that calls the public endpoints once and writes JSON snapshots (e.g. `data/events.json`) into `public_html` for the site's JS to read. Caps API load at ~150 requests/day regardless of visitors and keeps the site up when the API is down.
- **Data shown:** news (`GET /api/news`), locations (`GET /api/pub-quiz-locations`, `/{id}` for detail + upcoming events), events (`GET /api/pub-quiz-events?locationId=&cityId=&from=&to=`), cancellation reasons (`GET /api/cancellation-reasons`). All `[AllowAnonymous]`, all need `X-API-Key`; pass `Accept-Language: hr`. Field inventory with real examples: `docs/designer-brief-legacy-content.md`, Part 2.
- **Event registration from the website** uses the API's anonymous external-registration flow (added 2026-09-03): `POST /api/pub-quiz-events/{id}/external-registrations` (team name, captain, e-mail, phone, optional player count; sends a 4-digit code by e-mail), `POST .../{requestId}/confirm` (creates the `PubQuizRegistration` with `IsExternalRegistration = true`, status per the event's approval setting), `POST .../{requestId}/resend`. Rules live in `PubQuiz.API/Services/ExternalRegistrationService.cs`: deadline/capacity as in the app, 15-minute codes, 5 attempts, 60-second resend cooldown, team names may only reuse placeholder-owned teams (CSV imports and earlier web sign-ups), names of real app teams are refused. The browser talks only to `server/api/prijava.php` (actions `start|confirm|resend`), which adds the API key. UI: `registrationPanelHTML` in `src/lib/detail.ts` (apps-first with QR codes from `npm run qr`, then form, code, done) and `src/scripts/prijava.ts` (Croatian messages keyed by the API's error codes). A link with `?prijava` or `#prijava` (the venue CTA and the links organisers share) scrolls the panel into view on the **apps step** (QR codes, store buttons, "Nemam aplikaciju" below), never straight into the form; step changes are one motion (old step fades up, card height glides, new step rises), skipped under reduced motion. Flag: `registrationEnabled` in `src/config.ts` (also drives the PHP config). Tests for the flow live in the PubQuiz repo (`ExternalRegistrationServiceTests`, `ExternalRegistrationEndpointTests`); the API's `ExternalRegistration:MockCode` setting (dev/tests only) makes `1111` the code and skips e-mail.

## Working conventions

- Croatian copy must be written in proper Croatian with diacritics; English is optional and secondary for this site (the audience is Zagreb).
- No em dashes in any user-facing text (house rule shared with the PubQuiz repo).
- Brand: follow `PubQuiz/brand/brand_guidelines.html` for logo usage, typography (Sao Torpes display, Bahnschrift/DM Sans body) and marketing colours. This is a marketing site, so the brand doc applies here (unlike in-app UI, which uses seasonal themes).
- Scripts that touch the legacy host live in `../UKPWebsiteBackup/scripts/` and must be read-only against the server. They read credentials from this repo's `.env`.

## Mail

The site sends as **noreply@kvizovi.hr**, a SiteGround mailbox. Host `mail.kvizovi.hr`, SMTP 465
(implicit TLS, `SMTP_SSL`), IMAP 993. Credentials live in `.env` (`UKP_MAIL_*`) and nowhere else:
this repo is public.

**The mailbox cannot receive.** `kvizovi.hr` MX points at Google Workspace, so every message
addressed to the domain is delivered there, not to SiteGround. A message sent to noreply@ from
noreply@ is accepted by SiteGround, handed to Google and never appears over IMAP. Treat the
account as send-only, put `organizacija@kvizovi.hr` (a Workspace mailbox someone reads) in
`Reply-To`, and never point anything at noreply@ expecting an answer to arrive.

Two things send mail:
- the contact form, via SiteGround PHP `mail()` (`server/api/kontakt.php`), sending as
  `noreply@kvizovi.hr` to `organizacija@kvizovi.hr`; both are in `server/config.template.php`,
- the external-registration confirmation codes, from the .NET API, which must authenticate to
  `mail.kvizovi.hr:465` as this mailbox. The API runs on another host, so SMTP AUTH through
  SiteGround is what keeps SPF passing without editing DNS.

SPF today is `v=spf1 +a +mx +ip4:35.214.130.152 include:kvizovi.hr.spf.auto.dnssmarthost.net ~all`
(the include expands to `_spf.mailspamprotection.com`, SiteGround's outbound). There is no
`include:_spf.google.com`, so mail sent from Workspace itself leans on `+mx`, which covers Google's
inbound hosts rather than its sending ones. Worth checking against the headers of a real delivery
before trusting it.
