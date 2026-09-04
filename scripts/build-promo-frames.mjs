/**
 * Frames the app captures for the homepage's app pitch (PhoneShowcase.astro).
 *
 * Sources (assets-src/promo/, gitignored): home.png, league.png, quiz.png are the 720x1565 App Store
 * captures the presentation deck ships (PubQuiz.Admin/src/assets/presentation/promo/*.webp,
 * converted to PNG), and iphone-17-pro-silver.png is fastlane's frameit frame, fetched from
 * https://github.com/fastlane/frameit-frames (gh-pages/latest) when missing. The capture goes under
 * the frame at the offset frameit's offsets.json gives for the iPhone 17 Pro (+72+69, 1206 wide).
 *
 * The frame does not clip the capture by itself: its body is rounded, so at each corner the pixels
 * between the screen's arc and the body's arc are transparent, and a rectangular capture showed
 * its square corners poking out there. The capture is therefore masked to the screen opening,
 * flood-filled from the screen's centre through the frame's transparent pixels, which follows the
 * real corner radius exactly. Output: public/img/promo/<name>-framed.webp, 640 px wide,
 * transparent, about 55 KB each.
 */
import fs from 'node:fs/promises';
import sharp from 'sharp';

const SRC = 'assets-src/promo', OUT = 'public/img/promo';
const FRAME = `${SRC}/iphone-17-pro-silver.png`;
const FRAME_URL = 'https://raw.githubusercontent.com/fastlane/frameit-frames/gh-pages/latest/Apple%20iPhone%2017%20Pro%20Silver.png';
const SCREEN = { left: 72, top: 69, width: 1206 }; // frameit offsets.json, "iPhone 17 Pro"
const OUT_WIDTH = 640;

try { await fs.access(FRAME); } catch {
  console.log('fetching frame');
  const res = await fetch(FRAME_URL); if (!res.ok) throw new Error(`frame download failed: ${res.status}`);
  await fs.writeFile(FRAME, Buffer.from(await res.arrayBuffer()));
}
const frame = await sharp(FRAME).metadata();
await fs.mkdir(OUT, { recursive: true });

/** Alpha mask of the screen opening: the frame's transparent pixels reachable from the screen centre. */
async function screenMask(width, height) {
  const { data, info } = await sharp(FRAME).extract({ left: SCREEN.left, top: SCREEN.top, width, height }).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, open = (x, y) => data[(y * w + x) * 4 + 3] < 128;
  const mask = Buffer.alloc(w * h, 0);
  const stack = [((h >> 1) * w) + (w >> 1)];
  while (stack.length) {
    const i = stack.pop(); if (mask[i]) continue;
    const x = i % w, y = (i - x) / w; if (!open(x, y)) continue;
    mask[i] = 255;
    if (x > 0) stack.push(i - 1); if (x < w - 1) stack.push(i + 1); if (y > 0) stack.push(i - w); if (y < h - 1) stack.push(i + w);
  }
  return sharp(mask, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();
}

for (const name of ['home', 'league', 'quiz']) {
  const src = sharp(`${SRC}/${name}.png`); const m = await src.metadata();
  const h = Math.round(SCREEN.width * m.height / m.width);
  const mask = await screenMask(SCREEN.width, h);
  // Two passes on purpose: sharp runs joinChannel before removeAlpha in its pipeline, so joining
  // the mask in the same chain as removeAlpha leaves a three-channel image with no mask at all.
  const rgb = await src.resize(SCREEN.width, h).removeAlpha().toBuffer();
  const shot = await sharp(rgb).joinChannel(mask).toBuffer();
  const full = await sharp({ create: { width: frame.width, height: frame.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shot, left: SCREEN.left, top: SCREEN.top }, { input: FRAME, left: 0, top: 0 }]).png().toBuffer();
  const info = await sharp(full).resize({ width: OUT_WIDTH }).webp({ quality: 84, alphaQuality: 90 }).toFile(`${OUT}/${name}-framed.webp`);
  console.log(`${OUT}/${name}-framed.webp ${info.width}x${info.height} ${Math.round(info.size / 1024)}KB`);
}
