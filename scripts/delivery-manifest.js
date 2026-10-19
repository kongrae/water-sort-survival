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
  return manifest;
};
