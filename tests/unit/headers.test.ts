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

  it('serves the Apple association file as JSON and routes app links to the landing script', () => {
    expect(htaccess).toMatch(/<Files "apple-app-site-association">[\s\S]*ForceType application\/json/);
    expect(htaccess).toMatch(/RewriteRule \^join\/team\/\(\[A-Za-z0-9\]\{4,16\}\)\/\?\$ \/api\/link\.php\?kind=team&code=\$1 \[L,QSA\]/);
    expect(htaccess).toMatch(/RewriteRule \^join\/event\/\(\\d\+\)\/\?\$ \/dogadaji\/\$1\/\?prijava \[R=302,L\]/);
    expect(htaccess).toMatch(/RewriteRule \^play\/quiz\/\(\\d\+\)\/\?\$ \/api\/link\.php\?kind=quiz&id=\$1 \[L,QSA\]/);
    expect(htaccess).toMatch(/RewriteRule \^get\/\?\$ \/api\/link\.php\?kind=get \[L\]/);
  });

  it('keeps the certificate challenge folder out of the deploy, and only that', () => {
    const deploy = readFileSync(new URL('../../deploy.sh', import.meta.url), 'utf8');
    expect(deploy).toContain(String.raw`-x '^\\.well-known/acme-challenge/'`);
    expect(deploy).not.toContain(String.raw`-x '^\\.well-known/'`);
  });
});
