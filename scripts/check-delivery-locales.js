// Delivery uses single-quoted dynamic keys and static dialog text. Fail the build
// when new copy is missing, including choices inside conditional expressions.
const fs=require('fs'),path=require('path');
function deliveryKeys(root){
 const keys=new Set(['색상 납품 체험','잠시 쉬기','납품 진행·별점·최고 시간은 이 브라우저에만 저장하며 구글 계정과 동기화하지 않아요.']);
 const ui=fs.readFileSync(path.join(root,'delivery/ui.js'),'utf8').replace(/^\s*\/\/.*$/gm,'');
 for(const m of ui.matchAll(/'((?:\\.|[^'\\])*)'/g)){
   const value=m[1].replace(/\\n/g,'\n').replace(/\\'/g,"'").replace(/\\\\/g,'\\');
   if(/[가-힣]/.test(value))keys.add(value);
 }
 const html=fs.readFileSync(path.join(root,'delivery/ui.html'),'utf8');
 for(const m of html.matchAll(/>([^<>]+)</g))if(/[가-힣]/.test(m[1]))keys.add(m[1].trim());
 for(const c of JSON.parse(fs.readFileSync(path.join(root,'delivery/representative-three.json'),'utf8')))keys.add(c.title);
 return [...keys];
}
function check(root,catalog){for(const key of deliveryKeys(root))if(!catalog[key])throw Error('Missing delivery translation: '+key);}
module.exports=check;module.exports.keys=deliveryKeys;
