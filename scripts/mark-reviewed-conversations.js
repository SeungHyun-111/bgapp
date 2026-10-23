const fs=require('fs/promises');
const path=require('path');
const {createHash}=require('crypto');
const {QueryStore}=require('../src/commands/query-store');
async function applyReviews(directory){
  const file=path.join(directory,'training/annotations.json');
  const raw=await fs.readFile(file,'utf8'),annotations=JSON.parse(raw);
  const hash=createHash('sha256').update(raw).digest('hex');
  const archive=path.join(directory,'training/reviews',hash+'.json');
  const store=new QueryStore(directory),records=await store.conversations();
  const reviewed=annotations.filter(a=>a.category&&a.category!=='unreviewed');
  for(const annotation of reviewed){
    const record=records.find(r=>r.id===annotation.sourceId);
    if(!record||record.input!==annotation.input)throw Error('Annotation does not match original conversation: '+annotation.sourceId);
  }
  await fs.mkdir(path.dirname(archive),{recursive:true});await fs.writeFile(archive,raw,{encoding:'utf8',flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
  let changed=0;
  for(const a of reviewed){const version=createHash('sha256').update(JSON.stringify(a)).digest('hex');const result=await store.markReviewed({id:a.sourceId,category:a.category,annotationFile:'training/reviews/'+hash+'.json',annotationVersion:version});if(result.changed)changed++;}
  const pending=await store.conversations({review:'unreviewed'});
  return {total:records.length,reviewed:records.length-pending.length,pending:pending.length,newReviewEvents:changed,trainingUsed:(await store.conversations({training:'used'})).length};
}
if(require.main===module)applyReviews(path.resolve(__dirname,'../data')).then(r=>console.log(JSON.stringify(r,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={applyReviews};
