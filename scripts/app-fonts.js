// Downloads the Korean UI fonts (Jua, IBM Plex Sans KR 400/500/700; SIL Open Font License) from Google Fonts, cut down to
// the characters the game uses, so the Android app shows the same fonts offline and makes no font requests at run time.
// usage: node scripts/app-fonts.js   -> assets/fonts/*.woff2 + chars.txt   (rerun when build:app warns about missing characters)
// Only Korean uses these fonts (other languages use system fonts, see :root:not(:lang(ko))), so CJK and Devanagari are left out.
const fs = require('fs'), path = require('path');
const BASE = path.resolve(__dirname, '..'), OUT = path.join(BASE, 'assets/fonts');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const FACES = [['Jua', 400, 'jua-400'], ['IBM Plex Sans KR', 400, 'plex-kr-400'], ['IBM Plex Sans KR', 500, 'plex-kr-500'], ['IBM Plex Sans KR', 700, 'plex-kr-700']];
const appChars = source => {
  const set = new Set();
  for (let p = 0x20; p < 0x7f; p++) set.add(String.fromCharCode(p));
  for (const c of source) { const p = c.codePointAt(0); if ((p >= 0xa0 && p < 0x2c00) || (p >= 0x3130 && p <= 0x318f) || (p >= 0xac00 && p <= 0xd7a3)) set.add(c); }
  return [...set].sort().join('');
};
async function main() {
  const chars = appChars(fs.readFileSync(path.join(BASE, 'water-sort-survival.html'), 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });
  for (const [family, weight, file] of FACES) {
    const css = await (await fetch('https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family).replace(/%20/g, '+') + ':wght@' + weight
      + '&text=' + encodeURIComponent(chars), { headers: { 'User-Agent': UA } })).text();
    const url = (css.match(/url\((https:[^)]+)\)\s*format\('woff2'\)/) || [])[1];
    if (!url) throw Error('No woff2 for ' + family + ' ' + weight + ': ' + css.slice(0, 200));
    const font = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
    fs.writeFileSync(path.join(OUT, file + '.woff2'), font);
    console.log(file + '.woff2', font.length + ' bytes');
  }
  fs.writeFileSync(path.join(OUT, 'chars.txt'), chars);
  console.log('chars.txt', [...chars].length + ' characters');
}
module.exports = { appChars };
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
