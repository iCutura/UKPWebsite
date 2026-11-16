import { SITE } from '../config';
import { marketingAllowed, googleCookieClearing } from '../lib/cookieConsent';

/**
 * Google Tag Manager, for the Google Ads conversion tags, behind the same cookie bar as the pixel.
 *
 * The rule is the one `pixel.ts` keeps: `googletagmanager.com` is never contacted, and no `_gcl_*`
 * cookie exists, until the visitor has accepted marketing cookies. The snippet marketing sent loads
 * `gtm.js` in `<head>` before anybody is asked; this file loads the same `gtm.js`, only later.
 *
 * At the moment of pristanak, and before the container arrives, the data layer is told the answer
 * through Google Consent Mode v2: a `default` with everything denied, then an `update` granting the
 * three ad signals. `analytics_storage` stays denied because the site asks for no analytics
 * category; a GA tag added to the container later would run without storage and would contradict
 * /kolacici. Analytics needs its own category, a `CONSENT_VERSION` bump and new legal text first.
 *
 * The rest mirrors the pixel:
 *  - `ClientRouter` swaps documents without reloading, so the container's own "All pages" trigger
 *    only ever sees the landing page. `virtual_page_view` is pushed on every `astro:page-load`, the
 *    first one included, and the container triggers on that Custom Event instead.
 *  - Events fired before a decision wait in a queue and are sent at the moment of pristanak; a
 *    refusal drops them.
 *  - Withdrawal denies everything, deletes the Google Ads cookies and reloads if the container was
 *    loaded, because a running script cannot be unloaded.
 */
type Params = Record<string, unknown>;

declare global {
  interface Window { dataLayer?: unknown[] }
}

const SRC = 'https://www.googletagmanager.com/gtm.js?id=';
/** Same cap as the pixel's queue: room for both badges and a registration, not a log. */
const QUEUE_MAX = 20;

const DENIED = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' } as const;
const GRANTED_ADS = { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'denied' } as const;

let loaded = false;
const queue: Params[] = [];

function layer(): unknown[] {
  return (window.dataLayer = window.dataLayer || []);
}

/**
 * Google's `gtag()` shim. Consent commands must reach the data layer as an `arguments` object, not
 * an array: GTM reads an array as a plain message and ignores it as a command.
 */
function gtag(..._args: unknown[]): void {
  layer().push(arguments);
}

function load(): boolean {
  if (!SITE.gtmId) return false;
  if (loaded) return true;
  gtag('consent', 'default', DENIED);
  gtag('consent', 'update', GRANTED_ADS);
  layer().push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  const s = document.createElement('script');
  s.async = true;
  s.src = SRC + encodeURIComponent(SITE.gtmId);
  document.head.appendChild(s);
  loaded = true;
  return true;
}

function flush(): void {
  while (queue.length) layer().push(queue.shift()!);
}

/** A Custom Event for the container (web_registration, web_registration_complete, app_store_click, google_play_click). */
export function trackEvent(name: string, params: Params = {}): void {
  if (!SITE.gtmId) return;
  const message = { event: name, ...params };
  if (!marketingAllowed()) {
    if (queue.length < QUEUE_MAX) queue.push(message);
    return;
  }
  if (!load()) return;
  flush();
  layer().push(message);
}

function pageView(): void {
  if (!marketingAllowed() || !load()) return;
  flush();
  layer().push({ event: 'virtual_page_view', page_path: location.pathname, page_title: document.title });
}

function forget(): void {
  for (const write of googleCookieClearing(location.hostname)) document.cookie = write;
}

document.addEventListener('astro:page-load', pageView);

document.addEventListener('ukp:consent', ev => {
  const granted = (ev as CustomEvent<{ marketing: boolean }>).detail?.marketing === true;
  if (granted) { pageView(); return; }
  queue.length = 0;
  if (loaded) gtag('consent', 'update', DENIED);
  forget();
  if (loaded) location.reload();
});
