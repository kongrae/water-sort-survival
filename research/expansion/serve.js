// Local preview only: node build-pages.js && node research/expansion/serve.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const port = Number(process.env.PORT) || 8137;
const file = path.resolve(__dirname, '../../dist/index.html');
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname !== '/' && pathname !== '/index.html') { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(file));
}).listen(port, '127.0.0.1', () => console.log(`Local preview: http://127.0.0.1:${port}/`));
