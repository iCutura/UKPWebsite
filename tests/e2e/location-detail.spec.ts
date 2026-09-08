import { test, expect, type Page } from '@playwright/test';
import { open } from './support';

/**
 * A venue's About copy is baked into its page at build time, so an edit in the admin used to wait
 * for the next deploy: one venue sat on the site with a description two revisions old while the
 * cron's snapshot already carried the new one. The page now redraws the block from that snapshot.
 *
 * The reverse is the trap these tests mostly guard. A cron run that loses a venue's detail request
 * reports no description at all, which is indistinguishable here from a venue that genuinely has
 * none, so a naive redraw would blank copy the build got right. meta.json says whether the run was
 * whole, and only a whole one may remove anything.
 */

/** Serve a doctored snapshot: `edit` rewrites the location rows, `state` sets meta's completeness. */
async function snapshot(page: Page, edit: (rows: Record<string, unknown>[]) => void, state: 'complete' | 'partial') {
  await page.route('**/data/locations.json', async route => {
    const res = await route.fetch();
    const rows = (await res.json()) as Record<string, unknown>[];
    edit(rows);
    await route.fulfill({ response: res, json: rows });
  });
  await page.route('**/data/meta.json', async route => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), locationDetails: state } });
  });
}

/** A venue whose built page already shows an About block, plus its id. */
async function venueWithAbout(page: Page) {
  await open(page, '/lokacije/');
  const rows = await page.evaluate(async () => {
    const list = await fetch('/data/locations.json').then(r => r.json());
    return list.filter((l: { description: string | null }) => (l.description || '').trim())
      .map((l: { id: number; url: string }) => ({ id: l.id, url: l.url }));
  });
  return rows[0] as { id: number; url: string } | undefined;
}

const settled = (page: Page) => page.waitForFunction(
  () => document.querySelector<HTMLElement>('[data-location-page]')?.dataset.aboutDone === '1',
  null, { timeout: 5000 },
);

test('a description edited in the admin shows on the built page without a deploy', async ({ page }) => {
  const venue = await venueWithAbout(page);
  test.skip(!venue, 'no venue in the fixture has a description');
  await snapshot(page, rows => {
    for (const l of rows) if (l.id === venue!.id) l.description = 'Novi opis lokacije iz admina.';
  }, 'complete');
  await open(page, venue!.url);
  await settled(page);
  await expect(page.locator('[data-about]')).toContainText('Novi opis lokacije iz admina.');
});

test('a partial snapshot never blanks a description the build got right', async ({ page }) => {
  const venue = await venueWithAbout(page);
  test.skip(!venue, 'no venue in the fixture has a description');
  const built = await page.evaluate(async id => {
    const list = await fetch('/data/locations.json').then(r => r.json());
    return list.find((l: { id: number }) => l.id === id).description as string;
  }, venue!.id);
  // The exact shape of a lost detail request: the venue is listed, its description is gone.
  await snapshot(page, rows => {
    for (const l of rows) if (l.id === venue!.id) l.description = null;
  }, 'partial');
  await open(page, venue!.url);
  await settled(page);
  await expect(page.locator('[data-about]')).toBeVisible();
  await expect(page.locator('[data-about]')).toContainText(built.split('\n')[0].slice(0, 24).trim());
});

test('a whole snapshot does remove a description that was deleted in the admin', async ({ page }) => {
  const venue = await venueWithAbout(page);
  test.skip(!venue, 'no venue in the fixture has a description');
  await snapshot(page, rows => {
    for (const l of rows) if (l.id === venue!.id) l.description = null;
  }, 'complete');
  await open(page, venue!.url);
  await settled(page);
  await expect(page.locator('[data-about]')).toBeHidden();
});

test('the venue description on an event page is redrawn too', async ({ page }) => {
  await open(page, '/dogadaji/');
  const ids = await page.locator('[data-event-id]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.eventId!));
  test.skip(ids.length === 0, 'no upcoming quizzes');
  const locId = await page.evaluate(async id => {
    const list = await fetch('/data/events.json').then(r => r.json());
    return list.find((e: { id: number }) => String(e.id) === id)?.locationId as number;
  }, ids[0]);
  await snapshot(page, rows => {
    for (const l of rows) if (l.id === locId) l.description = 'Opis lokacije osvježen bez deploya.';
  }, 'complete');
  await open(page, `/dogadaji/${ids[0]}/`);
  await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-event-page]')?.dataset.aboutDone === '1', null, { timeout: 5000 });
  await expect(page.locator('[data-about]')).toContainText('Opis lokacije osvježen bez deploya.');
});

/**
 * A venue page is built by getStaticPaths from the snapshot on disk, so a venue added in the admin
 * after the last deploy has no page: the cron carries it into locations.json within the quarter
 * hour, every list on the site starts linking to it, and each of those links was a 404. It cost
 * OUT Rooftop and Royal Palace their pages on the day they were created. The 404 page now draws
 * the venue from the same snapshot, the way it already drew a new event or article.
 */
const NEW_ID = 999001;
const NEW_URL = `/lokacije/${NEW_ID}-nova-lokacija-bez-stranice/`;

/**
 * Serve a snapshot carrying a venue the build never saw, optionally with a quiz booked at it.
 * The rows are read once and served as fixed bodies rather than proxied: the ?prijava case
 * navigates away mid-flight, which disposes a proxied response before it can be read.
 */
async function unbuiltVenue(page: Page, o: { withEvent?: boolean } = {}) {
  const read = async (file: string) => (await page.request.get(`/data/${file}`)).json() as Promise<Record<string, unknown>[]>;
  const locations = await read('locations.json');
  const events = await read('events.json');
  const sample = locations[0];
  locations.push({
    ...sample, id: NEW_ID, slug: 'nova-lokacija-bez-stranice', url: NEW_URL,
    name: 'Nova lokacija', venueName: 'Nova lokacija', address: 'Ilica 16, 10000, Zagreb',
    city: { id: 386, name: 'Zagreb', country: 'Hrvatska' }, lat: 45.813, lng: 15.974,
    logo: null, image: null, description: 'Krovna kvizaška manifestacija u Zagrebu.',
    defaultStartTime: '20:00:00', weekday: 3, whatsapp: null,
    upcomingCount: o.withEvent ? 1 : 0, nextEventDate: null, nextEventStartTime: null, isActive: true,
  });
  // Hand the new venue a real, already-built termin, so the ?prijava link has somewhere to land.
  // Dated well ahead so the fixture does not go stale and drop out of the upcoming window.
  if (o.withEvent && events.length) {
    Object.assign(events[0], { locationId: NEW_ID, date: '2099-01-07', isCancelled: false, registrationDeadline: null });
  }
  await page.route('**/data/locations.json', route => route.fulfill({ json: locations }));
  await page.route('**/data/events.json', route => route.fulfill({ json: events }));
  return events[0]?.url as string | undefined;
}

const drawn = (page: Page) => page.waitForFunction(
  () => document.querySelector<HTMLElement>('[data-nf-live]')?.hidden === false, null, { timeout: 5000 },
);

test('a venue created after the last deploy still opens on its own link', async ({ page }) => {
  await unbuiltVenue(page);
  await open(page, NEW_URL);
  await drawn(page);
  await expect(page.locator('[data-nf-live] h1')).toHaveText('Nova lokacija');
  await expect(page.locator('[data-nf-live]')).toContainText('Krovna kvizaška manifestacija u Zagrebu.');
  await expect(page.locator('[data-nf-live]')).toContainText('srijedom · 20:00');
  // Not the apology page.
  await expect(page.locator('[data-nf-static]')).toBeHidden();
});

test('the link a new venue shares still forwards to its next quiz', async ({ page }) => {
  const eventUrl = await unbuiltVenue(page, { withEvent: true });
  await page.goto(`${NEW_URL}?prijava&motion=off`, { waitUntil: 'load' });
  await page.waitForURL(/\/dogadaji\/\d+\/\?prijava/, { timeout: 5000 });
  expect(new URL(page.url()).pathname).toBe(eventUrl);
});

test('a link that spells a new venue another way lands on its page, not on the apology', async ({ page }) => {
  await unbuiltVenue(page);
  await page.goto(`/lokacije/${NEW_ID}-staro-ime/?motion=off`, { waitUntil: 'load' });
  await page.waitForURL(u => u.pathname === NEW_URL, { timeout: 5000 });
  await drawn(page);
  await expect(page.locator('[data-nf-live] h1')).toHaveText('Nova lokacija');
});

test('an id no venue answers to still stops on the 404, without looping', async ({ page }) => {
  await page.goto('/lokacije/999999-ne-postoji/?motion=off', { waitUntil: 'load' });
  await page.waitForURL(u => u.pathname === '/lokacije/999999/', { timeout: 5000 });
  await expect(page.locator('[data-nf-static]')).toBeVisible();
  await expect(page.locator('[data-nf-static]')).toContainText('Ovo pitanje nema odgovor.');
});

/**
 * The invariant these exist to hold: **a detail page must agree with the snapshot it is shown, not
 * with the snapshot it was built from.**
 *
 * The card grid was refreshed live from the cron snapshot, but the heading above it, the hero CTA
 * and the ?prijava target were decided in the Astro template at deploy time and nothing revisited
 * them. So Pub 022 and Yesterday, whose September termini were scheduled after the last deploy,
 * advertised their own cards under the words "Trenutno nema zakazanih termina" (reported
 * 2026-09-08), offered a CTA leading away from the quiz on screen, and shared a ?prijava link that
 * did nothing at all. The list pages never had this problem: they recompute on `ukp:live`.
 */

/** Serve fixed snapshot bodies (read once) so a navigating test cannot race a proxied response. */
async function withEvents(page: Page, edit: (events: any[], locations: any[]) => void) {
  const read = async (f: string) => (await page.request.get(`/data/${f}`)).json();
  const events = await read('events.json');
  const locations = await read('locations.json');
  edit(events, locations);
  await page.route('**/data/events.json', r => r.fulfill({ json: events }));
  await page.route('**/data/locations.json', r => r.fulfill({ json: locations }));
}

/** A venue the build gave no termini, and one it gave some. */
async function venues(page: Page) {
  const events = await (await page.request.get('/data/events.json')).json();
  const locations = await (await page.request.get('/data/locations.json')).json();
  const busy = new Set(events.map((e: any) => e.locationId));
  return {
    quiet: locations.find((l: any) => !busy.has(l.id) && l.isActive !== false),
    busy: locations.find((l: any) => busy.has(l.id)),
    sample: events[0],
  };
}

const liveDone = (page: Page) => page.waitForFunction(
  () => document.querySelector<HTMLElement>('[data-location-page]')?.dataset.eventsDone === '1',
  null, { timeout: 5000 },
);

test('a termin added after the deploy is announced, not contradicted', async ({ page }) => {
  const { quiet, sample } = await venues(page);
  test.skip(!quiet || !sample, 'every venue in the fixture already has a termin');
  await withEvents(page, events => {
    events.push({ ...sample, id: 999901, url: '/dogadaji/999901/', locationId: quiet!.id,
                  date: '2099-01-07', startTime: '20:00:00', isCancelled: false,
                  registrationDeadline: null, maxTeams: 20, registered: 2, spotsRemaining: 18 });
  });
  await open(page, quiet!.url);
  await liveDone(page);
  // The heading the build wrote was "Trenutno nema zakazanih termina"; the snapshot disagrees.
  await expect(page.locator('[data-termini-title]')).toHaveText('Nadolazeći kvizovi');
  await expect(page.locator('[data-location-cta]')).toHaveAttribute('href', '/dogadaji/999901/?prijava');
  await expect(page.locator('[data-location-cta]')).toContainText('Prijavi ekipu na sljedeći kviz');
  await expect(page.locator('[data-event-id="999901"]')).toBeVisible();
});

test('the link a venue shares reaches a termin scheduled after the deploy', async ({ page }) => {
  const { quiet, sample } = await venues(page);
  test.skip(!quiet || !sample, 'every venue in the fixture already has a termin');
  await withEvents(page, events => {
    events.push({ ...sample, id: 999902, url: '/dogadaji/999902/', locationId: quiet!.id,
                  date: '2099-01-07', startTime: '20:00:00', isCancelled: false, registrationDeadline: null });
  });
  // This link did nothing at all before: the build rendered no target for it to read.
  await page.goto(`${quiet!.url}?prijava&motion=off`, { waitUntil: 'load' });
  await page.waitForURL(/\/dogadaji\/999902\/\?prijava/, { timeout: 8000 });
});

test('a termin removed after the deploy stops being advertised', async ({ page }) => {
  const { busy } = await venues(page);
  test.skip(!busy, 'no venue in the fixture has a termin');
  await withEvents(page, events => {
    for (let i = events.length - 1; i >= 0; i--) if (events[i].locationId === busy!.id) events.splice(i, 1);
  });
  await open(page, busy!.url);
  await liveDone(page);
  await expect(page.locator('[data-termini-title]')).toHaveText('Trenutno nema zakazanih termina');
  await expect(page.locator('[data-location-cta]')).toContainText('Pogledaj druge lokacije');
});

test('an unreachable snapshot leaves the built page exactly as it was', async ({ page }) => {
  const { busy } = await venues(page);
  test.skip(!busy, 'no venue in the fixture has a termin');
  await page.route('**/data/events.json', r => r.abort());
  await open(page, busy!.url);
  await liveDone(page);
  // Whatever the build knew still stands; a failed refresh must never blank a page.
  await expect(page.locator('[data-termini-title]')).toHaveText('Nadolazeći kvizovi');
});
