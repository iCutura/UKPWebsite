import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/**
 * This site replaces one that search engines have indexed for years, which is exactly when they
 * need telling what exists and where it moved.
 */
const dist = (f: string) => new URL(`../../dist/${f}`, import.meta.url);
const has = (f: string) => existsSync(dist(f));

describe('sitemap and robots', () => {
  it('ships both', () => {
    expect(has('sitemap.xml'), 'no sitemap.xml in the build').toBe(true);
    expect(has('robots.txt'), 'no robots.txt in the build').toBe(true);
  });

  it('lists the real pages, on the canonical host', () => {
    const xml = readFileSync(dist('sitemap.xml'), 'utf8');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    expect(locs.length).toBeGreaterThan(100);
    expect(locs).toContain('https://kvizovi.hr/');
    expect(locs).toContain('https://kvizovi.hr/lokacije/');
    expect(locs).toContain('https://kvizovi.hr/dogadaji/');
    // Every entry https, apex host, trailing slash: the same shape the .htaccess redirects to.
    for (const loc of locs) expect(loc).toMatch(/^https:\/\/kvizovi\.hr\/([^?#]*\/)?$/);
  });

  it('keeps build artefacts and the error page out', () => {
    const xml = readFileSync(dist('sitemap.xml'), 'utf8');
    expect(xml).not.toContain('/_a/');
    expect(xml).not.toContain('404');
  });

  it('points crawlers at the sitemap', () => {
    const robots = readFileSync(dist('robots.txt'), 'utf8');
    expect(robots).toContain('Sitemap: https://kvizovi.hr/sitemap.xml');
    expect(robots).toMatch(/^User-agent: \*/m);
    expect(robots).toMatch(/^Allow: \//m);
  });
});
