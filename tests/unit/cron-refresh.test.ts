import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The cron's two staleness decisions, exercised through the real PHP rather than a JS
 * re-implementation. They cost the site a venue description that sat a day behind the admin:
 * the detail map was swept once every 24 h, and `description` was only ever read from it.
 */
const lib = fileURLToPath(new URL('../../server/cron/refresh-lib.php', import.meta.url));

let hasPhp = true;
try { execFileSync('php', ['-v'], { stdio: 'ignore' }); } catch { hasPhp = false; }

function php<T>(expr: string, args: unknown): T {
  const out = execFileSync('php', [
    '-r',
    `require ${JSON.stringify(lib)}; $a = json_decode(stream_get_contents(STDIN), true); echo json_encode(${expr});`,
  ], { input: JSON.stringify(args), encoding: 'utf8' });
  return JSON.parse(out) as T;
}

const toRefresh = (ids: number[], seen: Record<string, number>, slice: number) =>
  php<number[]>('ukp_details_to_refresh($a["ids"], $a["seen"], $a["slice"])', { ids, seen, slice });

const description = (row: unknown, detail: unknown, listCarries: boolean) =>
  php<string | null>('ukp_description($a["row"], $a["detail"], $a["carries"])', { row, detail, carries: listCarries });

describe.skipIf(!hasPhp)('cron detail refresh', () => {
  it('fetches every location the cache has never seen', () => {
    expect(toRefresh([1, 2, 3], {}, 2)).toEqual([1, 2, 3]);
  });

  it('re-reads the oldest details once nothing is missing, so an edit cannot sit a day', () => {
    expect(toRefresh([1, 2, 3, 4, 5], { 1: 500, 2: 100, 3: 400, 4: 200, 5: 300 }, 2)).toEqual([2, 4]);
  });

  it('spends the run on the never-seen ones before re-reading anything', () => {
    expect(toRefresh([1, 2, 3], { 1: 100 }, 2)).toEqual([2, 3]);
  });
});

describe.skipIf(!hasPhp)('cron description precedence', () => {
  it('prefers the list, which every run reads, over the cached detail', () => {
    expect(description({ description: 'Novi opis' }, { description: 'Stari opis' }, true)).toBe('Novi opis');
  });

  it('drops a description cleared in the admin instead of serving the cached one', () => {
    expect(description({}, { description: 'Stari opis' }, true)).toBeNull();
  });

  it('falls back to the cached detail while the API list still has no description', () => {
    expect(description({}, { description: 'Stari opis' }, false)).toBe('Stari opis');
  });

  it('reads a list as carrying descriptions when any row has one', () => {
    expect(php<boolean>('ukp_list_carries_descriptions($a)', [{ name: 'A' }, { name: 'B', description: 'x' }])).toBe(true);
    expect(php<boolean>('ukp_list_carries_descriptions($a)', [{ name: 'A' }, { name: 'B', description: '  ' }])).toBe(false);
  });
});

/**
 * The cron is uploaded file by file, so a script split into two ships as half a script: the
 * require fatals on the server, every run aborts, and the site quietly serves the last snapshot
 * it happened to have.
 */
describe('cron deploy', () => {
  it('ships every PHP file the cron requires', () => {
    const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
    const required = [...read('../../server/cron/refresh-data.php').matchAll(/require __DIR__ \. '\/([\w.-]+\.php)'/g)].map(m => m[1]);
    expect(required.length).toBeGreaterThan(0);

    const staging = read('../../deploy.sh').split('\n').filter(l => l.includes('.deploy/ukp-cron') && l.includes('cp '));
    for (const file of required) {
      const shipped = staging.some(l => l.includes('server/cron/*.php') || l.includes(`server/cron/${file}`));
      expect(shipped, `deploy.sh never copies server/cron/${file}, which refresh-data.php requires`).toBe(true);
    }
  });
});
