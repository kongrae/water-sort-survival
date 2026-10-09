// Isolated loopback review; production player storage on 8137 remains separate.
const http = require('http'), fs = require('fs'), path = require('path');
const out = path.resolve(__dirname, '../../outputs/fx-polish');
http.createServer((req, res) => {
  const route = new URL(req.url, 'http://localhost').pathname;
  const file = route === '/before' ? 'before-test.html' : route === '/after' ? 'after-test.html' : null;
  if (!file) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(path.join(out, file)));
}).listen(8140, '127.0.0.1', () => console.log('FX review: http://127.0.0.1:8140/before and /after'));
