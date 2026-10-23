const fs=require('fs/promises');
const path=require('path');
const {createHash}=require('crypto');
function mergeRecords(history,legacy,events){
  const result=structuredClone(history),used=new Set();
  for(const record of legacy){
    const candidates=result.map((r,i)=>({r,i,delta:Math.abs(Date.parse(r.timestamp)-Date.parse(record.timestamp))})).filter(({r,i,delta})=>!used.has(i)&&r.input===record.input&&(r.outcome==='unhandled'||r.status==='unhandled')&&delta<=3000).sort((a,b)=>a.delta-b.delta);
    const match=candidates[0];
    if(match){used.add(match.i);result[match.i]={...record,...match.r,recordType:'conversation',id:record.id,status:'unhandled',mergedIds:[...new Set([...(match.r.mergedIds||[]),match.r.id,record.id])]};}
    else if(!result.some(r=>r.id===record.id))result.push({...record,recordType:'conversation'});
  }
  for(const event of events)if(!result.some(r=>r.recordType==='status_event'&&r.id===event.id&&r.timestamp===event.timestamp))result.push({...event,recordType:'status_event'});
  return result.sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
}
async function migrate(directory){
  const names=['conversation-history.jsonl','unhandled-queries.jsonl','query-status-events.jsonl'];
  const sources=[];
  for(const name of names){let raw='';try{raw=await fs.readFile(path.join(directory,name),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}sources.push({name,raw,records:raw.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).map(JSON.parse)});}
  const merged=mergeRecords(...sources.map(s=>s.records));
  const backup=path.join(directory,'backups','conversation-unification');await fs.mkdir(backup,{recursive:true});
  for(const source of sources)if(source.raw){const hash=createHash('sha256').update(source.raw).digest('hex').slice(0,12);await fs.writeFile(path.join(backup,source.name+'.'+hash+'.bak'),source.raw,'utf8');}
  const destination=path.join(directory,names[0]);
  await fs.writeFile(destination+'.merging',merged.map(r=>JSON.stringify(r)).join('\n')+(merged.length?'\n':''),'utf8');
  await fs.rename(destination+'.merging',destination);
  for(const name of names.slice(1))await fs.unlink(path.join(directory,name)).catch(error=>{if(error.code!=='ENOENT')throw error;});
  return {before:sources.map(s=>({file:s.name,records:s.records.length})),after:merged.length,file:destination,backup};
}
if(require.main===module)migrate(path.resolve(__dirname,'../data')).then(r=>console.log(JSON.stringify(r))).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={mergeRecords,migrate};
