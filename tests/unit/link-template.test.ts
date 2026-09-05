import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/**
 * The landing page is built once by Astro and filled in per request by server/api/link.php,
 * which does plain string substitution. If a token is renamed on one side only, visitors get a
 * page that literally says {{TITLE}}; this pins both sides to the same three tokens.
 */
const file = new URL('../../dist/link/index.html', import.meta.url);
const phpFile = new URL('../../server/api/link.php', import.meta.url);

describe('app link landing template', () => {
  it('is built', () => {
    expect(existsSync(file), 'run npm run build first').toBe(true);
    expect(existsSync(phpFile), 'server/api/link.php is missing').toBe(true);
  });
  it('carries every token the PHP fills and both store links', () => {
    const html = readFileSync(file, 'utf8');
    const php = readFileSync(phpFile, 'utf8');
    for (const token of ['{{TITLE}}', '{{DESCRIPTION}}', '{{OPEN_URL}}']) {
      expect(html, `${token} missing from the template`).toContain(token);
      expect(php, `${token} not filled by link.php`).toContain(token);
    }
    expect(html).toMatch(/href="\{\{OPEN_URL\}\}"/);
    expect(html).toContain('https://apps.apple.com/app/id6759879046');
    expect(html).toContain('https://play.google.com/store/apps/details?id=com.injeelit.pubquiz');
    expect(html).toContain('<meta name="robots" content="noindex"');
    expect(html).toMatch(/<meta property="og:image" content="https:\/\/kvizovi\.hr\/og\/[a-z]+\.jpg"/);
  });
});
