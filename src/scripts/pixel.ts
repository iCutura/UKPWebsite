import { SITE } from '../config';
import { marketingAllowed, metaCookieClearing } from '../lib/cookieConsent';

/**
 * Meta Pixel, behind the cookie banner.
 *
 * The rule this file exists to keep: `connect.facebook.net` is never contacted, and no `_fbp` or
 * `_fbc` cookie exists, until the visitor has accepted marketing cookies. A pixel that loads first
 * and asks later is not consented tracking, it is tracking with a notice.
 *
 * Two consequences that are easy to get wrong:
 *  - `ClientRouter` swaps documents without reloading, so `PageView` has to fire on every
 *    `astro:page-load`, not once per document. One PageView per visit would undercount every
 *    campaign that lands on a page a visitor then navigates away from.
 *  - A visitor who clicks a store badge before deciding still deserves to be counted if they then
 *    accept, so those events wait in a queue and are sent at the moment of pristanak. Without a
 *    pristanak the queue is simply dropped.
 *
 * Withdrawal reloads the page. There is no way to unload a script that is already running, and
 * leaving it in place while telling the visitor it is gone would be the one lie this file must not
 * tell.
 */
type Params = Record<string, unknown> | undefined;
type Kind = 'track' | 'trackCustom';
interface Queued { kind: Kind; name: string; params: Params }

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[]; push?: unknown; loaded?: boolean; version?: string };
    _fbq?: unknown;
  }
}

const SRC = 'https://connect.facebook.net/en_US/fbevents.js';
/** Enough for a visitor who taps both badges and reads the banner; a queue is not a log. */
const QUEUE_MAX = 20;

let loaded = false;
const queue: Queued[] = [];

/** Meta's own loader, in TypeScript. Keeps the shim's contract: calls before the script arrives queue inside fbq. */
function bootstrap(): void {
  if (window.fbq) return;
  const n: Window['fbq'] = function (...args: unknown[]) {
    n!.callMethod ? n!.callMethod.apply(n, args) : n!.queue!.push(args);
  } as NonNullable<Window['fbq']>;
  n.queue = [];
  n.loaded = true;
  n.version = '2.0';
  n.push = n;
  window.fbq = n;
  if (!window._fbq) window._fbq = n;
  const t = document.createElement('script');
  t.async = true;
  t.src = SRC;
  document.head.appendChild(t);
}

function load(): boolean {
  if (!SITE.metaPixelId) return false;
  if (loaded) return true;
  bootstrap();
  window.fbq!('init', SITE.metaPixelId);
  loaded = true;
  return true;
}

function emit(kind: Kind, name: string, params: Params): void {
  if (params) window.fbq!(kind, name, params);
  else window.fbq!(kind, name);
}

function flush(): void {
  while (queue.length) {
    const q = queue.shift()!;
    emit(q.kind, q.name, q.params);
  }
}

function send(kind: Kind, name: string, params: Params): void {
  if (!SITE.metaPixelId) return;
  if (!marketingAllowed()) {
    if (queue.length < QUEUE_MAX) queue.push({ kind, name, params });
    return;
  }
  if (!load()) return;
  flush();
  emit(kind, name, params);
}

/** A standard Meta event (PageView, ViewContent). */
export function track(name: string, params?: Params): void { send('track', name, params); }
/** An event of our own (AppStoreClick, GooglePlayClick, WebRegistration, WebRegistrationComplete). */
export function trackCustom(name: string, params?: Params): void { send('trackCustom', name, params); }

function pageView(): void {
  if (!marketingAllowed() || !load()) return;
  flush();
  emit('track', 'PageView', undefined);
}

function forget(): void {
  for (const write of metaCookieClearing(location.hostname)) document.cookie = write;
}

document.addEventListener('astro:page-load', pageView);

document.addEventListener('ukp:consent', ev => {
  const granted = (ev as CustomEvent<{ marketing: boolean }>).detail?.marketing === true;
  if (granted) { pageView(); return; }
  queue.length = 0;
  forget();
  if (loaded) location.reload();
});
