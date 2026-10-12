// Builds the GitHub Pages site from water-sort-survival.html (the artifact source).
// The artifact host wraps the page in a document skeleton; Pages serves files as-is, so the skeleton is added here.
// usage: node build-pages.js [outDir] [--app]   (default: dist)
//   --app  Android app build (Capacitor webDir, see docs/ANDROID.md). Google blocks sign-in inside an embedded WebView,
//          so the app build has no Firebase config and hides the save section; everything stays on the device.
const fs = require('fs');
const path = require('path');
require('./scripts/embed-i18n.js');
const args = process.argv.slice(2);
const app = args.includes('--app');
const outDir = path.resolve(__dirname, args.find(a => !a.startsWith('--')) || 'dist');
const page = fs.readFileSync(path.join(__dirname, 'water-sort-survival.html'), 'utf8');
const title = (page.match(/<title>[^<]*<\/title>/) || [''])[0];
const description = (page.match(/<meta name="description"[^>]*>/) || [''])[0];
const skeleton = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0f171c">
${title}
${description}
<style>:root{color-scheme:dark;box-sizing:border-box}body{margin:0}img{max-width:100%}[hidden]{display:none!important}${app ? 'section[aria-labelledby="saveTitle"]{display:none!important}' : ''}</style>
</head>
<body>
`;
let body = page.replace(title, '').replace(description, '');
if (app) {
  const CONFIG_RE = /const FIREBASE_CONFIG = (null|\{[\s\S]*?\n  \});/;
  if (!CONFIG_RE.test(body)) throw new Error('FIREBASE_CONFIG not found');
  body = body.replace(CONFIG_RE, 'const FIREBASE_CONFIG = null;');
  // Fonts ship inside the app (assets/fonts from scripts/app-fonts.js) instead of the Google Fonts links: offline, no requests.
  const FONT_LINKS_RE = /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\r?\n<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\r?\n<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*">/;
  if (!FONT_LINKS_RE.test(body)) throw new Error('Google Fonts links not found');
  const fontDir = path.join(__dirname, 'assets/fonts');
  const face = (family, weight, file) => `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(fontDir, file)).toString('base64')}) format('woff2')}`;
  body = body.replace(FONT_LINKS_RE, () => '<style>' + face('Jua', 400, 'jua-400.woff2') + face('IBM Plex Sans KR', 400, 'plex-kr-400.woff2')
    + face('IBM Plex Sans KR', 500, 'plex-kr-500.woff2') + face('IBM Plex Sans KR', 700, 'plex-kr-700.woff2') + '</style>');
  const have = new Set(fs.readFileSync(path.join(fontDir, 'chars.txt'), 'utf8'));
  const missing = [...require('./scripts/app-fonts.js').appChars(page)].filter(c => !have.has(c));
  if (missing.length) console.warn('warning: ' + missing.length + ' characters are not in assets/fonts (run node scripts/app-fonts.js): ' + missing.slice(0, 40).join(''));
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), skeleton + body + '\n</body>\n</html>\n');
console.log('built ' + path.relative(__dirname, path.join(outDir, 'index.html')));
if (!app) {
  // The Play Store listing links to the privacy policy on Pages.
  fs.copyFileSync(path.join(__dirname, 'store/privacy.html'), path.join(outDir, 'privacy.html'));
  console.log('copied ' + path.relative(__dirname, path.join(outDir, 'privacy.html')));
}
