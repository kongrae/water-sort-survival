// Builds the GitHub Pages site from water-sort-survival.html (the artifact source).
// The artifact host wraps the page in a document skeleton; Pages serves files as-is, so the skeleton is added here.
// usage: node build-pages.js [outDir]   (default: dist)
const fs = require('fs');
const path = require('path');
const outDir = path.resolve(__dirname, process.argv[2] || 'dist');
const page = fs.readFileSync(path.join(__dirname, 'water-sort-survival.html'), 'utf8');
const skeleton = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
`;
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), skeleton + page + '\n</body>\n</html>\n');
console.log('built ' + path.relative(__dirname, path.join(outDir, 'index.html')));
