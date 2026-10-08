// Loopback-only review fixtures. Production preview remains on 8137.
const http = require('http');
const fs = require('fs');
const path = require('path');
const out = path.resolve(__dirname, '../../outputs/uiux');
http.createServer((req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname;
  const file=route==='/before'?'before-test.html':route==='/after'?'after-test.html':null;
  if(!file){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(fs.readFileSync(path.join(out,file)));
}).listen(8138,'127.0.0.1',()=>console.log('UI review fixtures: http://127.0.0.1:8138/before and /after'));
