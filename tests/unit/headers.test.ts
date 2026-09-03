import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The production headers are applied by Apache, not by `astro preview`, so nothing else in this
 * suite ever sees them. That gap shipped a Permissions-Policy of `geolocation=()`, which disables
 * the geolocation API for the site's own pages and silently killed "quizzes near me".
 */
const htaccess = readFileSync(new URL('../../server/public_html/.htaccess', import.meta.url), 'utf8');
const header = (name: string) =>
  htaccess.split('\n').find(l => l.includes(`set ${name}`))?.match(/"([^"]*)"\s*$/)?.[1];

describe('production headers', () => {
  it('lets the site use geolocation, while keeping it from embedded third parties', () => {
    const policy = header('Permissions-Policy');
    expect(policy, 'Permissions-Policy is missing').toBeTruthy();
    expect(policy, `"${policy}" disables geolocation for our own pages too`).toContain('geolocation=(self)');
    expect(policy).not.toContain('geolocation=()');
  });

  it('still denies camera and microphone, which the site never uses', () => {
    const policy = header('Permissions-Policy')!;
    expect(policy).toContain('camera=()');
    expect(policy).toContain('microphone=()');
  });

  it('tells browsers not to try http again', () => {
    const hsts = header('Strict-Transport-Security');
    expect(hsts, 'no HSTS: the first request of every visit is interceptable').toBeTruthy();
    const maxAge = Number(hsts!.match(/max-age=(\d+)/)?.[1] ?? 0);
    expect(maxAge).toBeGreaterThanOrEqual(15552000); // six months, the usual floor
  });

  it('keeps the redirect to https and the canonical host', () => {
    expect(htaccess).toContain('RewriteCond %{HTTPS} !=on');
    expect(htaccess).toMatch(/RewriteRule \^\(\.\*\)\$ https:\/\/kvizovi\.hr/);
  });

  it('keeps secrets out of the web root', () => {
    expect(htaccess).toMatch(/\\\.env/);
    expect(htaccess).toContain('Require all denied');
  });
});
