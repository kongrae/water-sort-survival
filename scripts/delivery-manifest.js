const crypto=require('crypto');
const sha=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Released stages remain an exact prefix, including order, supply and star thresholds.
// Editing/removing a released stage needs a different, explicitly designed migration.
module.exports=function deliveryManifest(pack,releases){
  if(!Array.isArray(pack)||!pack.length||new Set(pack.map(s=>s.id)).size!==pack.length)throw Error('Invalid delivery stage IDs');
  if(!Array.isArray(releases))throw Error('Invalid delivery release registry');
  const manifest={packHash:sha(pack)},compatiblePacks=[];
  const seen=new Set();
  for(const release of releases){
    if(!release||!Number.isSafeInteger(release.stageCount)||release.stageCount<1||release.stageCount>pack.length||
      !/^[a-f0-9]{64}$/.test(release.packHash)||seen.has(release.packHash))throw Error('Invalid delivery release entry');
    seen.add(release.packHash);
    if(sha(pack.slice(0,release.stageCount))!==release.packHash)throw Error('Released delivery stages changed: explicit migration required');
    if(release.packHash!==manifest.packHash)compatiblePacks.push({packHash:release.packHash,stageCount:release.stageCount});
  }
  if(compatiblePacks.length)manifest.compatiblePacks=compatiblePacks;
  // Rating policy is separate from the frozen gameplay pack. Existing scored
  // thresholds stay exact; changing a published rating needs a new migration.
  const policy=require('../delivery/star-policy.json'),thresholds={};
  if(policy.version!==1)throw Error('Unsupported delivery star policy');
  for(const c of pack){
    const bounds=c.starMs||policy.thresholds[c.id];
    if(!Array.isArray(bounds)||bounds.length!==2||!bounds.every(n=>Number.isSafeInteger(n)&&n>0)||bounds[0]>=bounds[1])throw Error('Missing delivery star thresholds: '+c.id);
    if(c.starMs&&policy.thresholds[c.id])throw Error('Existing delivery star thresholds cannot be overridden');
    thresholds[c.id]=bounds.slice();
  }
  manifest.starPolicy={version:policy.version,thresholds};
  return manifest;
};
