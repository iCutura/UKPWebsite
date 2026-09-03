// Subsets the brand's Cobe display face to the Latin + Croatian character set and writes WOFF2.
// Cobe is the UKP display font (same face the quiz presentation deck uses). Run: npm run fonts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const SRC = '/Users/ivancutura/Development/PubQuiz/brand/UKP Brand guidlines/FONT + COLORS/Cobe Font';
// Latin basic + punctuation + the Croatian diacritics (č ć ž š đ and caps) + €
const UNICODES = 'U+0020-007E,U+00A0-00FF,U+0106-0107,U+010C-010D,U+0110-0111,U+0160-0161,U+017D-017E,U+2013-2014,U+2018-201A,U+201C-201E,U+2022,U+2026,U+20AC,U+00D7';
const FACES = [{ file: 'Cobe-Heavy.ttf', out: 'cobe-heavy' }];

for (const f of FACES) {
  const out = `public/fonts/${f.out}.woff2`;
  execFileSync('python3', ['-m', 'fontTools.subset', `${SRC}/${f.file}`,
    `--unicodes=${UNICODES}`, '--layout-features=kern,liga,calt', '--flavor=woff2',
    '--desubroutinize', '--name-IDs=1,2,4,6', `--output-file=${out}`], { stdio: 'inherit' });
  const kb = (fs.statSync(out).size / 1024).toFixed(1);
  const orig = (fs.statSync(`${SRC}/${f.file}`).size / 1024).toFixed(0);
  console.log(`${out}  ${kb} KB  (from ${orig} KB TTF)`);
}
