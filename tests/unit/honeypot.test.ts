import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The anti-spam trap on the two public forms, exercised through the real PHP endpoints (F-21).
 * It used to answer a filled trap with a fake `ok:true`: the registration form then showed the code
 * step for a request that never reached the API, and the contact form thanked people for a message
 * nobody got. Browser autofill filled the trap, so the people caught were real players.
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
const upstream: { url: string; body: unknown }[] = [];

async function post(endpoint: string, body: Record<string, unknown>) {
  const r = await fetch(`${base}/api/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json() as Record<string, unknown> };
}
const logLines = () => {
  const f = join(root, 'ukp-honeypot.log');
  return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l.slice(l.indexOf(' ') + 1))) : [];
};
const start = (extra: Record<string, unknown>) => post('prijava.php', {
  action: 'start', eventId: 4427, teamName: 'Pametnjakovići', contactName: 'Ana Anić',
  contactEmail: 'ana.anic@primjer.hr', contactPhone: '0991234567', playerCount: 4, ...extra,
});

beforeAll(async () => {
  if (!hasPhp) return;
  api = createServer((req, res) => {
    let raw = ''; req.on('data', c => { raw += c; });
    req.on('end', () => {
      upstream.push({ url: req.url ?? '', body: JSON.parse(raw || '{}') });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ requestId: 1351, maskedEmail: 'a***@primjer.hr', resendAvailableAt: '2026-09-23T09:00:00Z' }));
    });
  });
  await new Promise<void>(r => api!.listen(0, '127.0.0.1', r));
  const apiPort = (api.address() as AddressInfo).port;

  root = mkdtempSync(join(tmpdir(), 'ukp-honeypot-'));
  mkdirSync(join(root, 'public_html'), { recursive: true });
  mkdirSync(join(root, 'tmp'));
  cpSync(apiDir, join(root, 'public_html', 'api'), { recursive: true });
  writeFileSync(join(root, 'ukp-config.php'), `<?php return ['api_base' => 'http://127.0.0.1:${apiPort}', 'api_key' => 'test', 'mail_to' => 'organizacija@kvizovi.hr', 'mail_from' => 'noreply@kvizovi.hr', 'registration_enabled' => true, 'site_root' => __DIR__ . '/public_html'];`);

  const port = 20000 + Math.floor(Math.random() * 20000);
  base = `http://127.0.0.1:${port}`;
  // Own temp dir: the per-IP throttle keeps its hit files there and would otherwise outlive the run.
  php = spawn('php', ['-d', 'display_errors=0', '-d', `sys_temp_dir=${join(root, 'tmp')}`, '-S', `127.0.0.1:${port}`, '-t', join(root, 'public_html')], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { await fetch(base); break; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
});

afterAll(() => {
  php?.kill();
  api?.close();
  if (root) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!hasPhp)('registration honeypot', () => {
  it('forwards a start with an empty trap and hands back the request', async () => {
    upstream.length = 0;
    const r = await start({ ukp_x9: '' });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ ok: true, requestId: 1351 });
    expect(upstream).toHaveLength(1);
    expect(upstream[0].url).toBe('/api/pub-quiz-events/4427/external-registrations');
    expect(upstream[0].body).not.toHaveProperty('ukp_x9');
  });

  it('refuses a filled trap visibly instead of pretending a code went out', async () => {
    upstream.length = 0;
    const r = await start({ ukp_x9: 'http://spam.example' });
    expect(r.status).toBe(422);
    expect(r.json.ok).toBe(false);
    expect(r.json.code).toBe('spam_suspected');
    expect(String(r.json.message)).toContain('automatskog popunjavanja');
    expect(upstream, 'a trapped request must not reach the API').toHaveLength(0);
  });

  it('still judges the old field name, for pages cached before the rename', async () => {
    upstream.length = 0;
    const r = await start({ website: 'http://spam.example' });
    expect(r.json.code).toBe('spam_suspected');
    expect(upstream).toHaveLength(0);
  });

  it('logs every trapped start with the event and a masked e-mail, never the address', async () => {
    const hits = logLines().filter(l => l.endpoint === 'prijava');
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.map(h => h.field)).toEqual(expect.arrayContaining(['ukp_x9', 'website']));
    for (const h of hits) {
      expect(h.eventId).toBe(4427);
      expect(h.email).toBe('a***@primjer.hr');
      expect(JSON.stringify(h)).not.toContain('ana.anic');
    }
  });
});

describe.skipIf(!hasPhp)('contact form honeypot', () => {
  it('refuses a filled trap visibly instead of thanking the sender', async () => {
    const r = await post('kontakt.php', { ime: 'Ana', email: 'ana.anic@primjer.hr', poruka: 'Pozdrav', tema: 'opcenito', ukp_x9: 'x' });
    expect(r.status).toBe(422);
    expect(r.json).toMatchObject({ ok: false, code: 'spam_suspected' });
    expect(logLines().some(l => l.endpoint === 'kontakt' && l.email === 'a***@primjer.hr')).toBe(true);
  });
});

describe('the trap field in the markup', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  it.each([['registration form', '../../src/lib/detail.ts'], ['contact form', '../../src/pages/kontakt.astro']])(
    '%s uses a name autofill does not recognise', (_, p) => {
      const src = read(p);
      expect(src).toContain('name="ukp_x9"');
      expect(src, 'browser autofill fills a field called website').not.toContain('name="website"');
    });

  it('the registration script sends the renamed field', () => {
    const src = read('../../src/scripts/prijava.ts');
    expect(src).toContain('ukp_x9:');
    expect(src).not.toMatch(/\bwebsite:/);
    expect(src).toContain('spam_suspected:');
  });
});
