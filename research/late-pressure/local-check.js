const fs=require('fs'),path=require('path'),assert=require('assert');
const {ROOT,sha,write,metadata}=require('./common');
(async()=>{
  const url='http://127.0.0.1:8154/',response=await fetch(url,{cache:'no-store'});
  assert.equal(response.status,200);
  const served=Buffer.from(await response.arrayBuffer()),built=fs.readFileSync(path.join(ROOT,'dist/index.html'));
  assert(served.equals(built));
  assert(!served.toString().includes('window.__endlessRules ='));
  assert(served.toString().includes('const PRESSURE_V1 ='));
  write('local-build.json',{...metadata(),url,httpStatus:response.status,builtSha256:sha(built),servedSha256:sha(served),testHooks:false});
  console.log('Local HTTP 200 and built bytes match: '+url);
})().catch(error=>{console.error(error);process.exitCode=1;});
