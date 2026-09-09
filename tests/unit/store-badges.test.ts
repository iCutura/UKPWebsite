import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { storeBadgesHTML } from '../../src/lib/render';

/**
 * The badges are Apple's and Google's artwork, downloaded rather than drawn. A missing file is an
 * empty rectangle where the download button should be, on the one page that carries ad spend.
 */
const asset = (f: string) => new URL(`../../public/img/store/${f}`, import.meta.url);

describe('the store badge artwork', () => {
  it('ships every file the site references', () => {
    for (const f of ['app-store-hr.svg', 'app-store-en.svg', 'google-play-hr.png', 'google-play-en.png']) {
      expect(existsSync(asset(f)), `public/img/store/${f} is missing`).toBe(true);
    }
  });

  it('is the real artwork, not a placeholder', () => {
    // Apple's badge is outlined type on a rounded rect; a stand-in would be a handful of bytes.
    for (const f of ['app-store-hr.svg', 'app-store-en.svg']) {
      const svg = readFileSync(asset(f), 'utf8');
      expect(svg, f).toContain('<svg');
      expect(svg.length, f).toBeGreaterThan(4000);
    }
  });

  it('points both badges at the store listings, with the pixel hooks intact', () => {
    const html = storeBadgesHTML();
    expect(html).toContain('href="https://apps.apple.com/app/id6759879046"');
    expect(html).toContain('href="https://play.google.com/store/apps/details?id=com.injeelit.pubquiz"');
    expect(html).toContain('data-store-badge="ios"');
    expect(html).toContain('data-store-badge="android"');
    expect(html).toContain('/img/store/app-store-hr.svg');
    expect(html).toContain('/img/store/google-play-hr.png');
    // Croatian alt text, since this renderer only ever writes the Croatian side of the site.
    expect(html).toContain('alt="Preuzmi u App Storeu"');
    expect(html).toContain('alt="Preuzmite Google Play"');
    // Not lazy: these are the call to action, and the e2e suite checks they actually loaded.
    expect(html).not.toContain('loading="lazy"');
  });
});
