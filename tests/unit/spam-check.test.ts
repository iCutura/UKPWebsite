import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The spam check on the two public forms, exercised through the real PHP endpoints.
 *
 * Its history is two incidents. First the trap field answered a fake `ok:true`, so players whose
 * browser had autofilled it were shown the code step for a request that never left (F-21,
 * 2026-09-23). The fix made a filled trap a visible refusal, and the log that came with it showed
 * who was being refused: 242 of the 245 lines in eleven days were people, 65 of them in Instagram's
 * in-app browser on Android, which fills every text input of a form, hidden or not. Zero were bots.
 * So the trap is gone from the markup, and the only thing that can refuse a submit now is that it
 * arrived faster than a person can fill the form (`ukp_t`, milliseconds since the page bound it).
 *
 * The endpoints run under `php -S` in a copy of the production layout (ukp-config.php one level
 * above public_html), with a stand-in API that records what reaches it.
 */
let hasPhp = true;
try { execFileSync('php', ['-v'], { stdio: 'ignore' }); } catch { hasPhp = false; }

const apiDir = fileURLToPath(new URL('../../server/api/', import.meta.url));
let root = '';
let php: ChildProcess | undefined;
let api: Server | undefined;
let base = '';
const upstream: { url: string; body: Record<string, unknown> }[] = [];

async function post(endpoint: string, body: Record<string, unknown>) {
  const r = await fetch(`${base}/api/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json() as Record<string, unknown> };
}
const logLines = () => {
  const f = join(root, 'ukp-honeypot.log');
  return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l.slice(l.indexOf(' ') + 1)) as Record<string, unknown>) : [];
};
const start = (extra: Record<string, unknown>) => post('prijava.php', {
  action: 'start', eventId: 4427, teamName: 'Oscar i Jataci', contactName: 'Damir Ostriž',
  contactEmail: 'damir.ostriz@primjer.hr', contactPhone: '0991234567', playerCount: 4, ...extra,
});
const message = (extra: Record<string, unknown>) => post('kontakt.php', { ime: 'Ana', email: 'ana.anic@primjer.hr', poruka: 'Pozdrav', tema: 'opcenito', ...extra });

beforeAll(async () => {
  if (!hasPhp) return;
  api = createServer((req, res) => {
    let raw = ''; req.on('data', c => { raw += c; });
    req.on('end', () => {
      upstream.push({ url: req.url ?? '', body: JSON.parse(raw || '{}') });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ requestId: 1351, maskedEmail: 'd***@primjer.hr', resendAvailableAt: '2026-10-04T18:00:00Z' }));
    });
  });
  await new Promise<void>(r => api!.listen(0, '127.0.0.1', r));
  const apiPort = (api.address() as AddressInfo).port;

  root = mkdtempSync(join(tmpdir(), 'ukp-spam-check-'));
  mkdirSync(join(root, 'public_html'), { recursive: true });
  mkdirSync(join(root, 'tmp'));
  cpSync(apiDir, join(root, 'public_html', 'api'), { recursive: true });
  writeFileSync(join(root, 'ukp-config.php'), `<?php return ['api_base' => 'http://127.0.0.1:${apiPort}', 'api_key' => 'test', 'mail_to' => 'organizacija@kvizovi.hr', 'mail_from' => 'noreply@kvizovi.hr', 'registration_enabled' => true, 'site_root' => __DIR__ . '/public_html'];`);

  const port = 20000 + Math.floor(Math.random() * 20000);
  base = `http://127.0.0.1:${port}`;
  // Own temp dir: the per-IP throttle keeps its hit files there and would otherwise outlive the run.
  // `mail()` is pointed at /usr/bin/true so the contact form's accept path can be seen end to end.
  php = spawn('php', ['-d', 'display_errors=0', '-d', `sys_temp_dir=${join(root, 'tmp')}`, '-d', 'sendmail_path=/usr/bin/true', '-S', `127.0.0.1:${port}`, '-t', join(root, 'public_html')], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { await fetch(base); break; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
});

afterAll(() => {
  php?.kill();
  api?.close();
  if (root) rmSync(root, { recursive: true, force: true });
});

// The per-IP throttle (6 starts per 10 minutes) is not under test here, and every call below comes
// from 127.0.0.1; each test starts with its hit files gone so the seventh start is not a 429.
beforeEach(() => {
  if (!root) return;
  for (const f of readdirSync(join(root, 'tmp'))) if (f.startsWith('ukp-')) rmSync(join(root, 'tmp', f), { force: true });
});

describe.skipIf(!hasPhp)('registration spam check', () => {
  it('forwards a start that took a person a few seconds, and keeps the timing to itself', async () => {
    upstream.length = 0;
    const r = await start({ ukp_t: 8200 });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ ok: true, requestId: 1351 });
    expect(upstream).toHaveLength(1);
    expect(upstream[0].url).toBe('/api/pub-quiz-events/4427/external-registrations');
    expect(upstream[0].body).not.toHaveProperty('ukp_t');
  });

  it('refuses a start that arrived faster than anyone can fill the form', async () => {
    upstream.length = 0;
    const r = await start({ ukp_t: 400 });
    expect(r.status).toBe(422);
    expect(r.json).toMatchObject({ ok: false, code: 'spam_suspected' });
    expect(String(r.json.message), 'autofill is no longer the reason, so the message must not blame it').not.toContain('automatskog popunjavanja');
    expect(upstream, 'a refused request must not reach the API').toHaveLength(0);
  });

  it('lets a team through whose browser filled the old trap field, when the timing is human', async () => {
    // The Instagram case: every visible field typed by hand, the hidden one filled by the in-app
    // browser. 242 such starts were refused between 23 September and 4 October 2026.
    upstream.length = 0;
    const r = await start({ ukp_x9: 'Damir Ostriž', ukp_t: 9100 });
    expect(r.status).toBe(201);
    expect(r.json.ok).toBe(true);
    expect(upstream).toHaveLength(1);
    expect(upstream[0].body).not.toHaveProperty('ukp_x9');
  });

  it('never refuses on the old trap field alone', async () => {
    upstream.length = 0;
    for (const extra of [{ ukp_x9: 'http://spam.example' }, { website: 'http://spam.example' }]) {
      const r = await start(extra);
      expect(r.status, JSON.stringify(extra)).toBe(201);
    }
    expect(upstream).toHaveLength(2);
  });

  it('accepts a start with no timing at all, as an older page or another client sends it', async () => {
    upstream.length = 0;
    const r = await start({});
    expect(r.status).toBe(201);
    expect(upstream).toHaveLength(1);
  });

  it('treats a timing it cannot read as absent rather than as fast', async () => {
    upstream.length = 0;
    for (const ukp_t of ['abc', -1, null, '']) {
      const r = await start({ ukp_t });
      expect(r.status, `ukp_t=${JSON.stringify(ukp_t)}`).toBe(201);
    }
    expect(upstream).toHaveLength(4);
  });

  it('logs every refusal with the timing, the event and a masked e-mail, never the address', async () => {
    const refused = logLines().filter(l => l.endpoint === 'prijava' && l.verdict === 'rejected');
    expect(refused.length).toBeGreaterThanOrEqual(1);
    for (const h of refused) {
      expect(h.elapsedMs).toBe(400);
      expect(h.eventId).toBe(4427);
      expect(h.email).toBe('d***@primjer.hr');
      expect(JSON.stringify(h)).not.toContain('damir.ostriz');
    }
  });

  it('logs the starts it let through on a signal alone, so the trap and the timing gap can be watched', async () => {
    const lines = logLines().filter(l => l.endpoint === 'prijava' && l.verdict === 'accepted');
    expect(lines.map(l => l.reason)).toEqual(expect.arrayContaining(['trap_filled', 'no_timing']));
    expect(lines.filter(l => l.reason === 'trap_filled').map(l => l.trap)).toEqual(expect.arrayContaining(['ukp_x9', 'website']));
    // A start that carried a human timing and no trap is the normal case and is not logged.
    expect(lines.some(l => l.elapsedMs === 8200)).toBe(false);
  });
});

describe.skipIf(!hasPhp)('contact form spam check', () => {
  it('refuses a message that arrived faster than anyone can write one', async () => {
    const r = await message({ ukp_t: 900 });
    expect(r.status).toBe(422);
    expect(r.json).toMatchObject({ ok: false, code: 'spam_suspected' });
    expect(String(r.json.message)).not.toContain('automatskog popunjavanja');
    expect(logLines().some(l => l.endpoint === 'kontakt' && l.verdict === 'rejected' && l.email === 'a***@primjer.hr')).toBe(true);
  });

  it('sends a message that took a person a while, even if the old trap field came along filled', async () => {
    const r = await message({ ukp_t: 12000, ukp_x9: 'Ana' });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
  });
});

describe('the forms carry no trap field', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  it.each([['registration form', '../../src/lib/detail.ts'], ['contact form', '../../src/pages/kontakt.astro']])(
    '%s ships no input for autofill to fill', (_, p) => {
      const src = read(p);
      expect(src).not.toContain('name="ukp_x9"');
      expect(src).not.toContain('name="website"');
      expect(src, 'the off-screen input style has no element left to hide').not.toContain('class="hp"');
    });

  it('neither stylesheet keeps the off-screen rule', () => {
    expect(read('../../src/styles/detail.css')).not.toMatch(/\.hp\b/);
    expect(read('../../src/pages/kontakt.astro')).not.toMatch(/\.hp\b/);
  });

  it('both scripts report how long the form took instead', () => {
    const prijava = read('../../src/scripts/prijava.ts');
    expect(prijava).toContain('ukp_t:');
    expect(prijava).not.toContain('ukp_x9');
    expect(prijava).toContain('spam_suspected:');
    expect(read('../../src/pages/kontakt.astro')).toContain('ukp_t');
  });
});
