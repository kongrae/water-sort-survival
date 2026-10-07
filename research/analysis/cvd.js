const P={red:'#e5484d',blue:'#3e63dd',yellow:'#f0b400',green:'#2e9d5d',purple:'#8e4ec6',orange:'#f2701c',cyan:'#0ba1bd',pink:'#d6409f',brown:'#7d5a3c'};
const lin=v=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4)};
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const Lstar=Y=>Y>0.008856?116*Math.cbrt(Y)-16:903.3*Y;
// Machado 2009 deuteranopia severity 1.0 matrix (linear RGB)
const D=[[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]];
const toLab=([r,g,b])=>{const X=0.4124*r+0.3576*g+0.1805*b,Y=0.2126*r+0.7152*g+0.0722*b,Z=0.0193*r+0.1192*g+0.9505*b;const f=t=>t>0.008856?Math.cbrt(t):7.787*t+16/116;const fx=f(X/0.9505),fy=f(Y),fz=f(Z/1.089);return[116*fy-16,500*(fx-fy),200*(fy-fz)]};
const res={};
for(const[k,h]of Object.entries(P)){const l=rgb(h).map(lin);const d=D.map(r=>Math.max(0,Math.min(1,r[0]*l[0]+r[1]*l[1]+r[2]*l[2])));res[k]={L:toLab(l)[0].toFixed(1),deu:toLab(d)};}
for(const k in res)console.log(k,res[k].L);
const ks=Object.keys(res);const pairs=[];
for(let i=0;i<ks.length;i++)for(let j=i+1;j<ks.length;j++){const a=res[ks[i]].deu,b=res[ks[j]].deu;pairs.push([ks[i]+'-'+ks[j],Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]).toFixed(1)]);}
pairs.sort((a,b)=>a[1]-b[1]);console.log('deutan closest',pairs.slice(0,6));
