// Reuse the existing isolated CDP driver, replacing only this study's fixtures and scenarios.
const fs=require('fs'),path=require('path');
const old=fs.readFileSync(path.join(__dirname,'../../uitest/late-expansion.js'),'utf8');
let prefix=old.slice(0,old.indexOf('    if(growthOnly){')).replace("../research/late-expansion/common","../research/full-board/common");
prefix=prefix.replace('checks=[],geometry=[],fonts=[]','checks=[],geometry=[],fonts=[],inputs=[]');
prefix=prefix.replace('fonts.push({params,old,',"await js('document.documentElement.dataset.theme='+JSON.stringify(params.theme||'dark')+';dispatchEvent(new Event(\"resize\"));true');await wait(70);fonts.push({params,old,");
const begin=prefix.indexOf('    const fixture='),end=prefix.indexOf('    const geom=',begin);
prefix=prefix.slice(0,begin)+fs.readFileSync(path.join(__dirname,'browser-fixture.txt'),'utf8')+prefix.slice(end);
const tests=fs.readFileSync(path.join(__dirname,'browser-cases.txt'),'utf8');
prefix=prefix.replace("buttons:1,clickCount:1});await send('Input.dispatchMouseEvent'","buttons:1,clickCount:1});if(delay===550)await wait(550);await send('Input.dispatchMouseEvent'")
 .replace("force:1}]});await send('Input.dispatchTouchEvent'","force:1}]});if(delay===550)await wait(550);await send('Input.dispatchTouchEvent'");
prefix=prefix.replace('await wait(delay);};','await wait(delay);if(/data-i="(?:9|10|11)"|btnFlip|btnHold|btnUndo/.test(selector))inputs.push({selector,mouse,delay,point:p,state:await state()});};');
const tail=old.slice(old.indexOf('  }finally{')).replace("growthOnly?'growth-browser.json':demo?'demo-browser.json':extras?'extras-browser.json':quick?'quick-browser.json':'browser.json'","demo?'demo-browser.json':quick?'quick-browser.json':'browser.json'").replace('checks,geometry,fonts,physicalDevice','checks,geometry,fonts,inputs,physicalDevice');
fs.writeFileSync(path.join(__dirname,'../../uitest/full-board.js'),prefix+tests+tail);
