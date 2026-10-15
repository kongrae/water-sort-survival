// Validate strings in the source modules, not an older generated bundle.
const fs=require('fs'),path=require('path');
module.exports=function validateRouteLocales(base,catalog){
 const required=new Set(),read=f=>fs.readFileSync(path.join(base,f),'utf8');
 for(const f of ['route/view.js','route/app.js'])for(const m of read(f).matchAll(/(['"])([^'"\r\n]*[가-힣][^'"\r\n]*)\1/g))required.add(m[2]);
 for(const m of read('route/prototype.html').matchAll(/(?:data-i18n|aria-label)="([^"]+)"/g))required.add(m[1]);
 for(const stage of JSON.parse(read('route/packs/first-eight.json')))required.add(stage.title);
 for(const lesson of JSON.parse(read('route/packs/first-eight-guides.json')).lessons){for(const k of ['intro','completion','fallback'])required.add(lesson[k]);for(const cue of lesson.cues)required.add(cue.text);}
 const shell=read('water-sort-survival.html').match(/<div class="overlay" id="ovRoute"[\s\S]*?<div class="overlay" id="ovHelp"/)[0];
 for(const m of shell.matchAll(/>([^<>]*[가-힣][^<>]*)<|(?:aria-label|title)="([^"]*[가-힣][^"]*)"/g))required.add((m[1]||m[2]).trim());
 required.add('스테이지 진행은 이 브라우저에만 저장됩니다.');
 for(const key of required)if(!catalog[key])throw Error('Missing route translation: '+key);
 return required.size;
};
