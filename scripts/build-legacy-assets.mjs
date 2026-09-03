// Photos and partner logos salvaged from the old kvizovi.hr (staged in assets-src/ by hand) -> public/img/*.webp
import sharp from 'sharp'; import fs from 'node:fs/promises';
const slug = s => s.replace(/\.[^.]+$/, '').replace(/^UKP-Partneri-/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const jobs = [
  ['partners', [{ h: 96 }], { fit: 'inside', q: 84 }],
  ['team', [{ w: 480 }], { fit: 'cover', ratio: [4, 5], q: 78 }],
  ['teambuilding', [{ w: 1400 }, { w: 700 }], { fit: 'inside', q: 76 }],
  ['gallery', [{ w: 1200 }, { w: 600 }], { fit: 'inside', q: 76 }],
  ['about', [{ w: 1400 }, { w: 700 }], { fit: 'inside', q: 76 }],
];
for (const [dir, sizes, o] of jobs) {
  const out = `public/img/${dir}`; await fs.mkdir(out, { recursive: true });
  for (const f of (await fs.readdir(`assets-src/${dir}`)).filter(f => !f.startsWith('.'))) {
    const img = sharp(`assets-src/${dir}/${f}`).rotate();
    for (const s of sizes) {
      let p = img.clone();
      if (o.ratio && s.w) p = p.resize({ width: s.w, height: Math.round(s.w * o.ratio[1] / o.ratio[0]), fit: 'cover', position: 'attention' });
      else p = p.resize({ width: s.w, height: s.h, fit: o.fit, withoutEnlargement: true });
      const name = `${out}/${slug(f)}${sizes.length > 1 ? '-' + (s.w || s.h) : ''}.webp`;
      const info = await p.webp({ quality: o.q, alphaQuality: 90 }).toFile(name);
      console.log(`${name.padEnd(58)} ${info.width}x${info.height} ${(info.size / 1024).toFixed(0)}KB`);
    }
  }
}
