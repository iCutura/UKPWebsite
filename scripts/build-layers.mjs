// Layered hero scene (designer's "Presentation mode" split art) -> public/img/layers/<season>/*.webp
// Transparent layers are trimmed to their content box; the printed sizes feed the CSS aspect ratios in Hero.astro.
import sharp from 'sharp'; import fs from 'node:fs/promises';
const SEASONS = ['fall']; // spring/summer/winter layer sets not delivered yet
const log = (f, i) => console.log(`${f.padEnd(46)} ${String(i.width).padStart(5)}x${String(i.height).padEnd(5)} ${(i.size / 1024).toFixed(0).padStart(4)} KB`);
for (const s of SEASONS) {
  const src = `assets-src/layers/${s}`, out = `public/img/layers/${s}`; await fs.mkdir(out, { recursive: true });
  for (const w of [1536, 900]) log(`${out}/bg-${w}.webp`, await sharp(`${src}/bg.png`).resize({ width: w }).webp({ quality: 74 }).toFile(`${out}/bg-${w}.webp`));
  for (const w of [1536, 900]) log(`${out}/foliage-${w}.webp`, await sharp(`${src}/foliage.png`).resize({ width: w }).webp({ quality: 80, alphaQuality: 85 }).toFile(`${out}/foliage-${w}.webp`));
  for (const w of [1024, 640]) log(`${out}/glow-${w}.webp`, await sharp(`${src}/glow.png`).resize({ width: w }).webp({ quality: 68, alphaQuality: 80 }).toFile(`${out}/glow-${w}.webp`));
  for (const [name, q] of [['mascot', 80], ['ukp', 82]]) {
    const trimmed = sharp(`${src}/${name}.png`).trim({ threshold: 6 });
    const meta = await trimmed.clone().toBuffer({ resolveWithObject: true });
    console.log(`  ${name} trimmed to ${meta.info.width}x${meta.info.height} (from 1536x1024)`);
    for (const w of [1200, 720]) log(`${out}/${name}-${w}.webp`, await sharp(meta.data).resize({ width: w }).webp({ quality: q, alphaQuality: 88 }).toFile(`${out}/${name}-${w}.webp`));
  }
}
console.log('layers done');
