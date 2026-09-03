// Static QR codes for the store listings (registration panel). Run: npm run qr
import QRCode from 'qrcode'; import fs from 'node:fs/promises';
const targets = { 'app-store': 'https://apps.apple.com/app/id6759879046', 'google-play': 'https://play.google.com/store/apps/details?id=com.injeelit.pubquiz' };
await fs.mkdir('public/img/qr', { recursive: true });
for (const [name, url] of Object.entries(targets)) {
  const svg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#1E1411', light: '#00000000' } });
  await fs.writeFile(`public/img/qr/${name}.svg`, svg); console.log(`public/img/qr/${name}.svg <- ${url}`);
}
