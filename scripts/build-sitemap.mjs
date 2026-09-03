/**
 * Sitemap and robots.txt, generated from what actually got built.
 *
 * Written here rather than pulled in as an integration because the routes are already on disk by
 * the time this runs, and this way the file can never disagree with the pages that shipped.
 * Replacing an indexed WordPress site is exactly when a search engine needs telling what moved.
 */
import { readdir, writeFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const SITE = 'https://kvizovi.hr';
const DIST = 'dist';

/** Pages we do not want in the index: thin, legal-only, or duplicated by a canonical elsewhere. */
const SKIP = [/^404\//, /^_a\//];

/** Rough importance, so the crawler spends its budget on the pages people search for. */
const priority = (route) => {
  if (route === '/') return '1.0';
  if (/^\/(lokacije|dogadaji)\/$/.test(route)) return '0.9';
  if (/^\/(lokacije|dogadaji|novosti)\/[^/]+\/$/.test(route)) return '0.7';
  if (/^\/(pravila-privatnosti|kolacici)\/$/.test(route)) return '0.2';
  return '0.6';
};
const changefreq = (route) =>
  route === '/' || /^\/(dogadaji|novosti)\//.test(route) ? 'daily' : /^\/lokacije\//.test(route) ? 'weekly' : 'monthly';

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name === 'index.html') yield full;
  }
}

const routes = [];
for await (const file of walk(DIST)) {
  const rel = relative(DIST, file).split(sep).slice(0, -1).join('/');
  if (SKIP.some(re => re.test(rel + '/'))) continue;
  routes.push({ route: rel ? `/${rel}/` : '/', mtime: (await stat(file)).mtime });
}
routes.sort((a, b) => a.route.localeCompare(b.route));

const urls = routes.map(({ route, mtime }) => `  <url>
    <loc>${SITE}${route}</loc>
    <lastmod>${mtime.toISOString().slice(0, 10)}</lastmod>
    <changefreq>${changefreq(route)}</changefreq>
    <priority>${priority(route)}</priority>
  </url>`).join('\n');

await writeFile(join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

await writeFile(join(DIST, 'robots.txt'),
  `User-agent: *\nAllow: /\n\n# Build artefacts and the error page carry nothing worth indexing.\nDisallow: /_a/\nDisallow: /404.html\n\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`[sitemap] ${routes.length} routes -> dist/sitemap.xml, dist/robots.txt`);
