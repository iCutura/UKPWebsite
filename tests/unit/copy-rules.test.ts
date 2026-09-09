import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The house rule shared with the PubQuiz repo: no em dashes in anything this site ships. It was
 * written down in CLAUDE.md and enforced by nobody, which is how a rule survives until the first
 * hurried paste from a document. Comments are scanned too, deliberately: a comment is the most
 * likely place for one to enter and the cheapest place to notice it.
 */
const ROOT = new URL('../../src/', import.meta.url).pathname;
const EXT = /\.(astro|ts|css)$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : EXT.test(name) ? [full] : [];
  });
}

describe('typography rules', () => {
  it('ships no em dash and no en dash anywhere under src/', () => {
    const offenders = files(ROOT)
      .map(f => ({ f: f.slice(ROOT.length), hits: [...readFileSync(f, 'utf8').matchAll(/[—–]/g)].length }))
      .filter(x => x.hits > 0);
    expect(offenders, `use a comma, a colon or a full stop instead: ${offenders.map(o => o.f).join(', ')}`).toEqual([]);
  });
});
