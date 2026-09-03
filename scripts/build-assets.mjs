// Turns the raw iOS brand/season sources in assets-src/ into optimized web assets under public/img/.
// Run: npm run assets   (idempotent; outputs are tracked in git, sources are not)
import sharp from 'sharp';
import fs from 'node:fs/promises';

const SRC = 'assets-src', OUT = 'public/img';
const SEASONS = ['spring', 'summer', 'fall', 'winter'];
await fs.mkdir(`${OUT}/seasons`, { recursive: true });
await fs.mkdir(`${OUT}/brand`, { recursive: true });
await fs.mkdir(`public/og`, { recursive: true });

const log = (f, info) => console.log(`${f.padEnd(44)} ${String(info.width).padStart(5)}x${String(info.height).padEnd(5)} ${(info.size / 1024).toFixed(0).padStart(5)} KB`);

for (const s of SEASONS) {
  const desktop = sharp(`${SRC}/seasons/${s}-desktop.png`);
  // Hero: top 760px of the 1920x1080 art = mascot + floating UKP letters, no baked-in quiz-card text.
  for (const w of [1920, 1280, 768]) {
    const f = `${OUT}/seasons/${s}-hero-${w}.webp`;
    log(f, await desktop.clone().extract({ left: 0, top: 0, width: 1920, height: 760 }).resize({ width: w }).webp({ quality: w === 1920 ? 78 : 76 }).toFile(f));
  }
  // Mascot crop for cards/teasers/phone hero: 820x740, stops above the baked-in wordmark.
  for (const w of [820, 410]) {
    const f = `${OUT}/seasons/${s}-mascot-${w}.webp`;
    log(f, await desktop.clone().extract({ left: 550, top: 0, width: 820, height: 740 }).resize({ width: w }).webp({ quality: 78 }).toFile(f));
  }
  // Designer's portrait gradient: page/hero background on phones.
  const grad = sharp(`${SRC}/seasons/${s}-gradient.jpg`);
  for (const w of [1080, 540]) {
    const f = `${OUT}/seasons/${s}-gradient-${w}.webp`;
    log(f, await grad.clone().resize({ width: w }).webp({ quality: 72 }).toFile(f));
  }
  // Season app icon -> favicon + theme chip.
  const icon = sharp(`${SRC}/seasons/${s}-icon.png`);
  log(`${OUT}/seasons/${s}-icon-192.png`, await icon.clone().resize(192).png({ compressionLevel: 9 }).toFile(`${OUT}/seasons/${s}-icon-192.png`));
  log(`${OUT}/seasons/${s}-icon-64.png`, await icon.clone().resize(64).png({ compressionLevel: 9 }).toFile(`${OUT}/seasons/${s}-icon-64.png`));
  // Open Graph 1200x630 from the art (mascot centered).
  log(`public/og/${s}.jpg`, await desktop.clone().extract({ left: 0, top: 0, width: 1920, height: 1008 }).resize(1200, 630).jpeg({ quality: 80 }).toFile(`public/og/${s}.jpg`));
}

const brand = [
  ['brand/logo-square.png', 'logo-square', [512, 160]],
  ['brand/logo-horizontal.png', 'logo-horizontal', [900, 450]],
  ['brand/mascot-white.png', 'mascot-white', [512, 96]],
];
for (const [src, name, widths] of brand) {
  const img = sharp(`${SRC}/${src}`);
  const meta = await img.metadata();
  for (const w of widths) {
    const f = `${OUT}/brand/${name}-${w}.webp`;
    log(f + (meta.hasAlpha ? ' (alpha)' : ''), await img.clone().resize({ width: w }).webp({ quality: 85, alphaQuality: 90 }).toFile(f));
  }
}
await fs.copyFile('/Users/ivancutura/Development/PubQuiz/src/PubQuiz.iOS/PubQuiz/PubQuiz/Assets.xcassets/whatsapp.logo.imageset/whatsapp.svg', `${OUT}/brand/whatsapp.svg`).catch(() => {});
console.log('assets done');
