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
