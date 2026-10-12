// Renders the app icon, Android icon/splash sources and the Play feature graphic from store/art/bottle.svg.
// usage: node scripts/store-art.js   (Chrome headless; CHROME overrides the path)
//   assets/icon-only.png, icon-foreground.png, icon-background.png, splash.png, splash-dark.png  -> @capacitor/assets (docs/ANDROID.md)
//   store/icon-512.png, store/feature-graphic.png                                              -> Play store listing
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const BASE = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const bottle = fs.readFileSync(path.join(BASE, 'store/art/bottle.svg'), 'utf8').replace(/<!--[\s\S]*?-->\s*/, '');
const BG = '#0f171c';
const background = `<defs><radialGradient id="bg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#1d4a54"/><stop offset=".55" stop-color="#122a31"/><stop offset="1" stop-color="${BG}"/></radialGradient></defs><rect width="1024" height="1024" fill="url(#bg)"/>`;
const svg = (body, size = 1024) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${body}</svg>`;
// the bottle spans y 134..890; centre it on 512 and scale it into the given height
const fit = (h, cy = 512) => { const s = h / 756; return `<g transform="translate(512 ${cy}) scale(${s}) translate(-512 -512)">${bottle}</g>`; };
function render(name, html, w, h) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'botris-art-'));
  const file = path.join(dir, 'page.html');
  fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}</style>${html}`);
  const out = path.join(BASE, name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', '--force-device-scale-factor=1',
    `--window-size=${w},${h}`, '--virtual-time-budget=3000', '--user-data-dir=' + path.join(dir, 'profile'), `--screenshot=${out}`, 'file:///' + file.split(path.sep).join('/')], { stdio: 'ignore' });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(name);
}
const icon = svg(background + fit(756, 520));
render('assets/icon-only.png', icon, 1024, 1024);
render('store/icon-512.png', svg(background + fit(756, 520), 512), 512, 512);
// adaptive icon: the launcher masks to roughly the centre 66%, so the foreground bottle stays inside it
render('assets/icon-foreground.png', svg(fit(560, 516)), 1024, 1024);
render('assets/icon-background.png', svg(background), 1024, 1024);
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732"><rect width="2732" height="2732" fill="${BG}"/><g transform="translate(1366 1366) scale(.62) translate(-512 -512)">${fit(756, 512)}</g></svg>`;
render('assets/splash.png', splash, 2732, 2732);
render('assets/splash-dark.png', splash, 2732, 2732);
// Play feature graphic 1024x500: bottle row on the left, title on the right
const small = (x, colors) => `<g transform="translate(${x} 250) scale(.36) translate(-512 -512)">${bottle.replace(/#e5484d/, colors[0]).replace(/#f0b400/, colors[1]).replace(/#2e9d5d/, colors[2]).replace(/#3e63dd/, colors[3]).replace(/id="(outline|glass|shine)"/g, `id="$1${x}"`).replace(/#(outline|glass|shine)\b/g, `#$1${x}`).replace(/url\(#(glass|shine)\)/g, `url(#$1${x})`)}</g>`;
const feature = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&family=IBM+Plex+Sans+KR:wght@500;700&display=block">
<style>.fg{position:relative;width:1024px;height:500px;overflow:hidden;background:radial-gradient(120% 120% at 30% 40%,#1d4a54 0,#122a31 45%,${BG} 100%);font-family:'IBM Plex Sans KR',sans-serif;color:#e4edf1}
.fg svg{position:absolute;left:0;top:0}.t{position:absolute;left:548px;top:132px;right:40px}
.t h1{margin:0;font:400 104px/1 Jua,sans-serif;letter-spacing:-.01em}.t p{margin:18px 0 0;font-weight:700;font-size:34px;color:#3fc2d1}
.t small{display:block;margin-top:22px;font-weight:500;font-size:24px;color:#93a4ae}</style>
<div class="fg"><svg width="1024" height="500" viewBox="0 0 1024 500">${small(132, ['#e5484d', '#f0b400', '#2e9d5d', '#3e63dd'])}${small(288, ['#8e4ec6', '#0ba1bd', '#f2701c', '#d6409f'])}${small(444, ['#3e63dd', '#3e63dd', '#3e63dd', '#3e63dd'])}</svg>
<div class="t"><h1>보트리스</h1><p>물병 정렬 퍼즐</p><small>한 병 비우고, 한 번 더!</small></div></div>`;
render('store/feature-graphic.png', feature, 1024, 500);
