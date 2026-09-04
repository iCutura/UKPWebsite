import { test, expect } from '@playwright/test';
import { open } from './support';

/**
 * The registration panel is sticky on desktop. On a small laptop the form step is taller than the
 * viewport, and a top-pinned panel had its last field and submit button cut off until the reader
 * reached the end of the venue description. The panel must pin whichever edge keeps it reachable.
 */
test.describe('event page on a small laptop', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the whole registration form can be reached by scrolling', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'the panel is not sticky on phones');
    await open(page, '/dogadaji/');
    test.skip(await page.locator('[data-event-id]').count() === 0, 'no upcoming quizzes');
    await page.locator('[data-event-id]').first().click();
    await page.waitForLoadState('load');
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
  await expect(page.locator('.chip-status')).toHaveText('Termin nije dostupan');
});

test('a page whose event is still on the calendar keeps its registration panel', async ({ page }) => {
  await open(page, '/dogadaji/');
  test.skip(await page.locator('[data-event-id]').count() === 0, 'no upcoming quizzes');
  await page.locator('[data-event-id]').first().click();
  await page.waitForLoadState('load');
  await page.waitForTimeout(400);
  await expect(page.locator('[data-prijava]')).toBeVisible();
  await expect(page.locator('.evd')).not.toHaveClass(/is-gone/);
});

test('a fee corrected in the admin shows on the built page without a deploy', async ({ page }) => {
  await open(page, '/dogadaji/');
  const ids = await page.locator('[data-event-id]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.eventId!));
  test.skip(ids.length === 0, 'no upcoming quizzes');
  const id = ids[0];
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
