const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),file=path.join(root,'water-sort-survival.html');
let source=fs.readFileSync(file,'utf8');
const read=name=>fs.readFileSync(path.join(root,'delivery',name),'utf8');
for(const [label,name] of [['ENGINE','engine.js'],['UI','ui.js'],['CSS','ui.css']]){
 const re=new RegExp('/\\* DELIVERY_'+label+'_START \\*/[\\s\\S]*?/\\* DELIVERY_'+label+'_END \\*/');
 if(!re.test(source))throw Error('Missing delivery marker '+label);
 source=source.replace(re,()=>`/* DELIVERY_${label}_START */\n${read(name)}\n/* DELIVERY_${label}_END */`);
}
source=source.replace(/<!-- DELIVERY_DIALOGS_START -->[\s\S]*?<!-- DELIVERY_DIALOGS_END -->/,()=>`<!-- DELIVERY_DIALOGS_START -->\n${read('ui.html')}\n<!-- DELIVERY_DIALOGS_END -->`);
source=source.replace(/<script id="deliveryPack" type="application\/json">[\s\S]*?<\/script>/,()=>'<script id="deliveryPack" type="application/json">'+JSON.stringify(JSON.parse(read('representative-three.json'))).replace(/</g,'\\u003c')+'</script>');
const pack=JSON.parse(read('representative-three.json')),manifest=require('./delivery-manifest')(pack,JSON.parse(read('released-packs.json')));
const persistence='<!-- DELIVERY_PROGRESS_START -->\n<script id="deliveryManifest" type="application/json">'+JSON.stringify(manifest)+'</script>\n<script id="deliveryProgress">\n'+read('progress.js')+'\n</script>\n<!-- DELIVERY_PROGRESS_END -->';
if(source.includes('<!-- DELIVERY_PROGRESS_START -->'))source=source.replace(/<!-- DELIVERY_PROGRESS_START -->[\s\S]*?<!-- DELIVERY_PROGRESS_END -->/,()=>persistence);
else source=source.replace(/<script id="deliveryPack" type="application\/json">[\s\S]*?<\/script>/,m=>m+'\n'+persistence);
fs.writeFileSync(file,source);console.log('Embedded delivery prototype on shared board');
