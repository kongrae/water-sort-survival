// Renders the Android icon/splash sources and the Play icon from the app icon artwork (assets/icons/botris-icon-v1-1024.png,
// made by the user on 2026-10-12, prompt next to it), and the Play feature graphic from store/art/bottle.svg.
// usage: node scripts/store-art.js   (Chrome headless; CHROME overrides the path)
//   assets/icon-only.png, icon-foreground.png, icon-background.png, splash.png, splash-dark.png  -> @capacitor/assets (docs/ANDROID.md)
//   store/icon-512.png, store/feature-graphic.png                                              -> Play store listing
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const BASE = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const bottle = fs.readFileSync(path.join(BASE, 'store/art/bottle.svg'), 'utf8').replace(/<!--[\s\S]*?-->\s*/, '');
const ART = 'data:image/png;base64,' + fs.readFileSync(path.join(BASE, 'assets/icons/botris-icon-v1-1024.png')).toString('base64');
const ART_EDGE = '#051a25';   // the artwork's corner colour, used around it where the launcher shows more than the square
const BG = '#0f171c';
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
const art = (size, style = '') => `<img src="${ART}" width="${size}" height="${size}" style="display:block;${style}">`;
render('assets/icon-only.png', art(1024), 1024, 1024);
render('store/icon-512.png', art(512), 512, 512);
// adaptive icon: @capacitor/assets insets both layers by 16.7%, so this square is the visible 72dp area; the artwork fills it
// (a circular mask still keeps all three bottles) and the background layer is its edge colour
render('assets/icon-foreground.png', art(1024), 1024, 1024);
render('assets/icon-background.png', `<div style="width:1024px;height:1024px;background:${ART_EDGE}"></div>`, 1024, 1024);
const splash = `<div style="width:2732px;height:2732px;display:grid;place-items:center;background:${BG}">${art(760, 'border-radius:22%')}</div>`;
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
