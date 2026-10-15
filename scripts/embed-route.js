// Keep the product self-contained. Research and product embed the same source files.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const base=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(base,f),'utf8');
const files=['route/engine.js','route/guidance.js','route/progress.js','route/view.js','route/app.js','route/view.css','route/prototype.html','route/packs/first-eight.json','route/packs/first-eight-guides.json'];
const content=read('route/packs/first-eight.json'),guides=read('route/packs/first-eight-guides.json');
require('../route/guidance').prepare(JSON.parse(content),JSON.parse(guides));
const markup=read('route/prototype.html').match(/<main class="route-root">([\s\S]*?)<\/main>/)[1]
 .replace(/id="([^"]+)"/g,'id="route-$1"').replace(/aria-controls="([^"]+)"/g,'aria-controls="route-$1"')
 .replace('시제품 · 3개 판','체험 · 8개 스테이지')
 .replaceAll('연구용 판입니다. 이번 플레이는 새로고침하면 초기화됩니다.','스테이지 진행은 이 브라우저에만 저장됩니다.');
const block='<!-- ROUTE_BUNDLE_START -->\n<style>'+read('route/view.css').replaceAll('__PREFIX__','route-')+'</style>\n'+
 '<template id="routeViewTemplate">'+markup+'</template>\n'+
 files.filter(f=>f.endsWith('.js')).map(f=>'<script data-route-source="'+f+'">'+read(f)+'</script>').join('\n')+'\n'+
 '<script id="routePack" type="application/json">'+content.replace(/</g,'\\u003c')+'</script>\n'+
 '<script id="routePackGuides" type="application/json">'+guides.replace(/</g,'\\u003c')+'</script>\n<!-- ROUTE_BUNDLE_END -->';
const file=path.join(base,'water-sort-survival.html');let html=read('water-sort-survival.html');
if(!html.includes('<!-- ROUTE_BUNDLE_START -->'))throw Error('Missing product route bundle marker');
html=html.replace(/<!-- ROUTE_BUNDLE_START -->[\s\S]*?<!-- ROUTE_BUNDLE_END -->/,()=>block);fs.writeFileSync(file,html);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const out=path.resolve(base,process.argv[2]||'dist');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'bundle.json'),JSON.stringify({files:Object.fromEntries(files.map(f=>[f,sha(read(f))])),bundleSha256:sha(block)},null,2)+'\n');
console.log('Embedded the shared route engine, view, progress and first-eight pack.');
