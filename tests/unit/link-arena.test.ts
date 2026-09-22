import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The arena invite landing's decisions, exercised through the real PHP rather than a JS
 * re-implementation: which codes reach the API at all (the apps never mint 0, O, 1 or I, so a
 * link carrying one is a typo, not a match) and what the page says for a match that is waiting,
 * one that already started, and one that does not exist.
 */
const lib = fileURLToPath(new URL('../../server/api/link-arena-lib.php', import.meta.url));
const linkPhp = fileURLToPath(new URL('../../server/api/link.php', import.meta.url));

let hasPhp = true;
try { execFileSync('php', ['-v'], { stdio: 'ignore' }); } catch { hasPhp = false; }

function php<T>(expr: string, args: unknown): T {
  const out = execFileSync('php', [
    '-r',
    `require ${JSON.stringify(lib)}; $a = json_decode(stream_get_contents(STDIN), true); echo json_encode(${expr});`,
  ], { input: JSON.stringify(args), encoding: 'utf8' });
  return JSON.parse(out) as T;
}

type Copy = { status: number; title: string; desc: string };
const code = (raw: string) => php<string | null>('ukp_arena_code($a)', raw);
const label = (mode: string) => php<string>('ukp_arena_mode_label($a)', mode);
const copy = (match: unknown) => php<Copy>('ukp_arena_copy($a)', match);

const waiting = { mode: 'Classic', hostNickname: 'Marko', playerCount: 2, maxPlayers: 4, questionCount: 10, status: 'Waiting' };

describe.skipIf(!hasPhp)('arena code validation', () => {
  it('accepts a code the apps mint and uppercases what people retype', () => {
    expect(code('7K3QXZ')).toBe('7K3QXZ');
    expect(code('7k3qxz')).toBe('7K3QXZ');
    expect(code(' 7k3qxz ')).toBe('7K3QXZ');
  });

  it('rejects any length but six', () => {
    expect(code('ABCDE')).toBeNull();
    expect(code('ABCDEFG')).toBeNull();
    expect(code('')).toBeNull();
  });

  it('rejects the four look-alike characters the alphabet leaves out', () => {
    expect(code('ABCDE0')).toBeNull();
    expect(code('ABCDEO')).toBeNull();
    expect(code('ABCDE1')).toBeNull();
    expect(code('ABCDEI')).toBeNull();
  });

  it('rejects punctuation instead of stripping it into a different code', () => {
    expect(code('ABC-12')).toBeNull();
    expect(code('AB CDE')).toBeNull();
  });
});

describe.skipIf(!hasPhp)('arena landing copy', () => {
  it('names the host, the mode, the seats and the length of a waiting match', () => {
    const c = copy(waiting);
    expect(c.status).toBe(200);
    expect(c.title).toBe('Pridruži se privatnom Arena meču');
    expect(c.desc).toContain('Marko te poziva na Klasik meč: 2/4 igrača, 10 pitanja.');
    expect(c.desc).toContain('Otvori UKP Quiz aplikaciju');
  });

  it('tells a late arrival that the match already started', () => {
    const c = copy({ ...waiting, status: 'Live', playerCount: 4 });
    expect(c.status).toBe(200);
    expect(c.desc).toContain('4/4 igrača');
    expect(c.desc).toContain('Meč je u tijeku');
  });

  it('labels every mode in Croatian and passes an unknown one through', () => {
    expect(label('Classic')).toBe('Klasik');
    expect(label('FirstStrike')).toBe('Prvi udarac');
    expect(label('Gladiator')).toBe('Gladijator');
    expect(label('Knockout')).toBe('Knockout');
  });

  it('still reads as an invitation when the host has no nickname', () => {
    expect(copy({ ...waiting, hostNickname: '' }).desc).toContain('Poziv na Klasik meč: 2/4 igrača');
  });

  it('is a 404 with its own copy when the API knows no such match', () => {
    const c = copy(null);
    expect(c.status).toBe(404);
    expect(c.title).toBe('Ova poveznica za meč ne vrijedi');
    expect(c.desc).toContain('Zamoli domaćina za novu.');
  });

  it('ships no em dash and no en dash in any variant', () => {
    for (const c of [copy(waiting), copy({ ...waiting, status: 'Live' }), copy(null)]) {
      expect(`${c.title} ${c.desc}`).not.toMatch(/[–—]/);
    }
    expect(readFileSync(lib, 'utf8')).not.toMatch(/[–—]/);
  });
});

describe('link.php wires the arena kind', () => {
  const src = readFileSync(linkPhp, 'utf8');

  it('loads the decisions from the tested library', () => {
    expect(src).toContain("require_once __DIR__ . '/link-arena-lib.php';");
  });

  it('caches a match preview for a minute, not the five minutes a team gets', () => {
    expect(src).toContain('const UKP_ARENA_LINK_CACHE_TTL = 60;');
    expect(src).toMatch(/function ukp_api_cached\(string \$path, array \$cfg, int \$ttl = UKP_LINK_CACHE_TTL\): \?array/);
    expect(src).toMatch(/filemtime\(\$f\) > time\(\) - \$ttl/);
    expect(src).toMatch(/ukp_api_cached\("\/api\/links\/arena\/\$code", \$cfg, UKP_ARENA_LINK_CACHE_TTL\)/);
  });

  it('validates the code with the library and points the button at the API host', () => {
    expect(src).toContain("$kind === 'arena'");
    expect(src).toContain("ukp_arena_code((string)($_GET['code'] ?? ''))");
    expect(src).toContain('$open = "https://api.injeel-it.hr/join/arena/$code";');
    expect(src).toContain('$canonical = "https://kvizovi.hr/join/arena/$code";');
  });

  it('keeps the team and quiz kinds on the default cache', () => {
    expect(src).toMatch(/ukp_api_cached\("\/api\/links\/team\/\$code", \$cfg\)/);
    expect(src).toMatch(/ukp_api_cached\("\/api\/links\/quiz\/\$id", \$cfg\)/);
  });
});
