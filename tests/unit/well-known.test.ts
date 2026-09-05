import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Universal Links and App Links live or die on two static files Apple's CDN and Google fetch
 * from the apex domain. The values are copied from DeepLinkSettings.cs in the PubQuiz API; a
 * typo here silently sends every tapped invite link to Safari instead of the app.
 */
const wk = (f: string) => readFileSync(new URL(`../../public/.well-known/${f}`, import.meta.url), 'utf8');

describe('apple-app-site-association', () => {
  const aasa = JSON.parse(wk('apple-app-site-association'));
  it('names the app and the three link families', () => {
    const detail = aasa.applinks.details[0];
    expect(detail.appID).toBe('X6P3LG956W.injeel.PubQuiz');
    expect(detail.paths).toEqual(['/join/*', '/play/*', '/get']);
    expect(aasa.applinks.apps).toEqual([]);
  });
});

describe('assetlinks.json', () => {
  const links = JSON.parse(wk('assetlinks.json')) as Array<{ relation: string[]; target: { package_name: string; sha256_cert_fingerprints: string[] } }>;
  it('lists the release package with both signing keys', () => {
    const release = links.find(l => l.target.package_name === 'com.injeelit.pubquiz')!;
    expect(release.relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(release.target.sha256_cert_fingerprints).toEqual([
      'CF:CD:38:B7:48:5A:A6:02:E2:7E:D2:63:6B:CF:91:83:D7:B0:51:AA:17:4C:FA:A1:D7:B9:DE:75:E6:AB:A3:EC',
      'B8:71:7B:08:EC:9C:83:E0:6C:71:AA:32:45:B1:7F:F3:85:E4:37:8A:2E:9E:01:47:26:95:3E:C1:BC:15:CC:92',
    ]);
  });
  it('lists the debug package so debug builds verify too', () => {
    const debug = links.find(l => l.target.package_name === 'com.injeelit.pubquiz.debug')!;
    expect(debug.target.sha256_cert_fingerprints).toEqual(['79:12:4B:30:93:B4:03:3B:61:47:8A:30:D5:66:39:6F:26:58:D8:9D:36:73:51:FC:93:1B:D3:24:83:1D:C9:23']);
  });
});
