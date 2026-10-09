// Builds the GitHub Pages site from water-sort-survival.html (the artifact source).
// The artifact host wraps the page in a document skeleton; Pages serves files as-is, so the skeleton is added here.
// usage: node build-pages.js [outDir]   (default: dist)
const fs = require('fs');
const path = require('path');
require('./scripts/embed-i18n.js');
const outDir = path.resolve(__dirname, process.argv[2] || 'dist');
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
<style>:root{color-scheme:dark;box-sizing:border-box}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
`;
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), skeleton + page.replace(title, '').replace(description, '') + '\n</body>\n</html>\n');
console.log('built ' + path.relative(__dirname, path.join(outDir, 'index.html')));
