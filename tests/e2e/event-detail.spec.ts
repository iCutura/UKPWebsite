import { test, expect } from '@playwright/test';
import { open, openEvent, closedEvent, withEvent, daysOut } from './support';

/**
 * The registration panel is sticky on desktop. On a small laptop the form step is taller than the
 * viewport, and a top-pinned panel had its last field and submit button cut off until the reader
 * reached the end of the venue description. The panel must pin whichever edge keeps it reachable.
 */
test.describe('event page on a small laptop', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the whole registration form can be reached by scrolling', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'the panel is not sticky on phones');
    const e = await openEvent(page);
    test.skip(!e, 'no quiz is open for registration');
    await open(page, e!.url);
    await page.locator('[data-step-panel="apps"] [data-step-go="form"]').click();
    await expect(page.locator('[data-step-panel="form"]')).toBeVisible();

    const vh = page.viewportSize()!.height;
    const panelHeight = await page.locator('.evd-side').evaluate(el => el.getBoundingClientRect().height);
    test.skip(panelHeight <= vh - 104, 'the panel fits this viewport; nothing to pin');

    // A long venue description is what makes the panel stick; give this event one.
    await page.evaluate(() => { const s = document.createElement('div'); s.style.height = '2400px'; document.querySelector('.evd-main')!.appendChild(s); });
    await page.evaluate(() => window.scrollTo(0, 1400));
    await page.waitForTimeout(200);

    const submit = page.locator('[data-step-panel="form"] button[type="submit"]');
    const box = (await submit.boundingBox())!;
    expect(box.y, 'submit button is above the viewport').toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, 'submit button is cut off below the viewport').toBeLessThanOrEqual(vh);
  });
});

/**
 * Every upcoming event gets a built page, and the host keeps it until the next deploy. An event
 * hidden or deleted in the admin in the meantime still had a live-looking page inviting sign-ups.
 * The page checks itself against the live snapshot and says so.
 */
test('a page built for an event that has since vanished says so', async ({ page }) => {
  await open(page, '/dogadaji/');
  const ids = await page.locator('[data-event-id]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.eventId!));
  test.skip(ids.length < 2, 'needs two upcoming quizzes: one to remove, one to keep the snapshot non-empty');
  const gone = ids[0];
  await page.route('**/data/events.json', async route => {
    const res = await route.fetch();
    const list = (await res.json()) as { id: number }[];
    await route.fulfill({ response: res, json: list.filter(e => String(e.id) !== gone) });
  });
  await open(page, `/dogadaji/${gone}/`);
  await expect(page.locator('.evd-side .prijava-panel')).toContainText('više nije u ponudi');
  await expect(page.locator('[data-prijava]')).toHaveCount(0);
  await expect(page.locator('.evd-head .chip-status')).toHaveText('Termin nije dostupan');
});

test('a page whose event is still on the calendar keeps its registration panel', async ({ page }) => {
  const e = await openEvent(page);
  test.skip(!e, 'no quiz is open for registration');
  await open(page, e!.url);
  await page.waitForTimeout(400);
  await expect(page.locator('[data-prijava]')).toBeVisible();
  await expect(page.locator('.evd')).not.toHaveClass(/is-gone/);
});

test('a fee corrected in the admin shows on the built page without a deploy', async ({ page }) => {
  const open_ = await openEvent(page);
  test.skip(!open_, 'no quiz is open for registration');
  const id = String(open_!.id);
  await page.route('**/data/events.json', async route => {
    const res = await route.fetch();
    const list = (await res.json()) as { id: number; feeType: string | null; feeAmount: number | null; feeCurrency: string | null }[];
    for (const e of list) if (String(e.id) === id) { e.feeType = 'PerTeam'; e.feeAmount = 25; e.feeCurrency = 'BAM'; }
    await route.fulfill({ response: res, json: list });
  });
  await open(page, `/dogadaji/${id}/`);
  await expect(page.locator('.facts')).toContainText('25 KM po ekipi');
  await expect(page.locator('.evd-head .chip', { hasText: '25 KM po ekipi' })).toHaveCount(1);
  await expect(page.locator('[data-prijava]')).toBeVisible();
});

test('a location link with the wrong slug forwards to the page by id', async ({ page }) => {
  await open(page, '/lokacije/');
  const href = await page.locator('a[data-location-id]').first().getAttribute('href');
  test.skip(!href, 'no locations in the snapshot');
  const id = href!.match(/\/lokacije\/(\d+)-/)![1];
  await page.goto(`/lokacije/${id}-neko-drugo-ime/`, { waitUntil: 'load' });
  await page.waitForURL(new RegExp(`/lokacije/${id}-(?!neko-drugo-ime)[a-z0-9-]+/$`), { timeout: 10000 });
  await expect(page.locator('h1')).not.toContainText('nema odgovor');
});

/**
 * A quiz scheduled after the last deploy has no built page, so the 404 page draws it from the
 * snapshot. That fallback was a header and a registration panel only, and shipped a page missing
 * its fact tiles, the venue description and the entire actions row - no "Kako doći", no WhatsApp
 * group, no "Podijeli" (reported 2026-09-08). It now renders what the built page renders.
 */
test('an event drawn after the deploy is the whole page, not a stub', async ({ page }) => {
  const events = await (await page.request.get('/data/events.json')).json();
  test.skip(events.length === 0, 'no upcoming quizzes in the fixture');
  const sample = events.find((e: Record<string, unknown>) => !e.isCancelled) ?? events[0];
  events.push({ ...sample, id: 999903, url: '/dogadaji/999903/', date: '2099-01-07',
                startTime: '20:00:00', isCancelled: false, registrationDeadline: null,
                maxTeams: 20, registered: 2, spotsRemaining: 18,
                whatsapp: 'https://chat.whatsapp.com/fixture' });
  await page.route('**/data/events.json', r => r.fulfill({ json: events }));

  const res = await page.goto('/dogadaji/999903/?motion=off', { waitUntil: 'load' });
  // The static host answers 404 and the page renders itself; that is the design, not the bug.
  expect(res?.status()).toBe(404);
  await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-nf-live]')?.hidden === false,
    null, { timeout: 8000 });

  const live = page.locator('[data-nf-live]');
  await expect(live.locator('.evd-head')).toBeVisible();
  await expect(live.locator('.facts')).toBeVisible();
  await expect(live.getByRole('link', { name: /Kako doći/ })).toBeVisible();
  await expect(live.getByRole('link', { name: /WhatsApp grupa/ })).toBeVisible();
  await expect(live.getByRole('button', { name: /Podijeli/ })).toBeVisible();
  await expect(live.locator('.prijava-panel')).toBeVisible();
});

/**
 * The registration panel used to be the one part of an event page live.ts deliberately left alone,
 * on the grounds that it was already wired up and the API re-checks every rule at submit time. It
 * is also the one part that carries a verdict, so a rule changed in the admin left the page
 * arguing with itself: on 22 September 2026 a venue lifted the 24 h deadline on that evening's
 * quiz, the header above the panel redrew from the snapshot to "5+ slobodnih mjesta" within the
 * quarter hour, and the panel beside it went on saying "Prijave zatvorene - rok za prijave je
 * prosao" with no way in at all. Both directions are the same bug.
 */
test('a deadline lifted in the admin reopens the panel without a deploy', async ({ page }) => {
  const shut = await closedEvent(page);
  test.skip(!shut, 'no quiz on the calendar is closed at build time');
  await withEvent(page, shut!.id, {
    registrationDeadline: null, isCancelled: false, resultsPublished: false,
    maxTeams: 20, registered: 2, spotsRemaining: 18,
  });
  await open(page, `/dogadaji/${shut!.id}/`);
  await expect(page.locator('[data-prijava]')).toBeVisible();
  await expect(page.locator('.evd-side .prijava-panel')).not.toContainText('Prijave zatvorene');
  await expect(page.locator('.evd-head .chip-status')).not.toHaveText('Prijave zatvorene');
});

test('a deadline set in the admin closes the panel without a deploy', async ({ page }) => {
  const live = await openEvent(page);
  test.skip(!live, 'no quiz is open for registration');
  await withEvent(page, live!.id, { registrationDeadline: daysOut(-1) });
  await open(page, `/dogadaji/${live!.id}/`);
  await expect(page.locator('.evd-side .prijava-panel')).toContainText('Rok za prijave je prošao');
  await expect(page.locator('[data-prijava]')).toHaveCount(0);
});

/**
 * Redrawing the panel costs the reader whatever they have typed, so it must not happen once they
 * have moved off the apps step. The snapshot is held back here until the form is open and filled,
 * which is the slow connection this race actually needs.
 */
test('a reader who has started the form is not interrupted by the refresh', async ({ page }) => {
  const live = await openEvent(page);
  test.skip(!live, 'no quiz is open for registration');
  let release = () => {};
  const held = new Promise<void>(r => { release = r; });
  await page.route('**/data/events.json', async route => {
    await held;
    const res = await route.fetch();
    const list = (await res.json()) as { id: number; registrationDeadline: string | null }[];
    for (const e of list) if (String(e.id) === String(live!.id)) e.registrationDeadline = daysOut(-1);
    await route.fulfill({ response: res, json: list });
  });
  await page.goto(`/dogadaji/${live!.id}/?motion=off`, { waitUntil: 'load' });
  await page.locator('[data-step-panel="apps"] [data-step-go="form"]').click();
  await page.locator('#p-team').fill('Pametnjakovići');
  release();
  await page.waitForTimeout(600);
  await expect(page.locator('#p-team')).toHaveValue('Pametnjakovići');
  await expect(page.locator('[data-step-panel="form"]')).toBeVisible();
});

/**
 * A quiz cancelled in the admin used to vanish from the snapshot altogether (the public API list
 * dropped cancelled events), so the most this page could say was "više nije u ponudi", and the
 * static build went on advertising the quiz with an open form for the rest of the evening: on
 * 22 September 2026 a host cancelled that night's quiz at 17:10 and at 20:30 the page still read
 * "5+ slobodnih mjesta" (event 4268). The snapshot now keeps a cancelled quiz, with the host's
 * reason, and the page says so where people arriving from the QR code will read it.
 */
test('a quiz cancelled in the admin says so on the built page, with the reason, without a deploy', async ({ page }) => {
  const live = await openEvent(page);
  test.skip(!live, 'no quiz is open for registration');
  await withEvent(page, live!.id, { isCancelled: true, cancellationReason: 'Bolest voditelja' });
  await open(page, `/dogadaji/${live!.id}/`);
  const panel = page.locator('.evd-side .prijava-panel');
  await expect(panel).toContainText('Kviz je otkazan');
  await expect(panel).toContainText('Bolest voditelja');
  await expect(page.locator('[data-prijava]')).toHaveCount(0);
  await expect(page.locator('.evd-head .chip-status')).toHaveText('Otkazano');
  await expect(page.locator('.facts')).toContainText('Kviz je otkazan');
  await expect(page.locator('.facts')).not.toContainText('slobodnih mjesta');
  await expect(page.locator('.evd')).not.toHaveClass(/is-gone/);
});

test('a cancelled quiz stays on its venue page as cancelled and leaves the events list', async ({ page }) => {
  const live = await openEvent(page);
  test.skip(!live?.locationUrl, 'no quiz is open for registration');
  await withEvent(page, live!.id, { isCancelled: true, cancellationReason: 'Bolest voditelja' });
  await open(page, live!.locationUrl!);
  const card = page.locator(`[data-live="events"] [data-event-id="${live!.id}"]`);
  await expect(card).toHaveClass(/is-cancelled/);
  await expect(card.locator('.chip-status')).toHaveText('Otkazano');
  await open(page, '/dogadaji/');
  await expect(page.locator(`[data-live="events"] [data-event-id="${live!.id}"]`)).toHaveCount(0);
});
