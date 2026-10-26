const fs=require('fs/promises');
const path=require('path');
const {createHash}=require('crypto');
const {get,set,equal}=require('./json-fields');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function samplesFor(record){
  if(record.status!=='ready'||!record.correctedFields?.length)return [];
  const fields=record.correctedFields.filter(f=>f.source==='explicit_user_correction'&&f.schemaValid&&f.catalogValid&&f.userConfirmed);
  if(!fields.length)return [];
  const roots=[...new Set(fields.map(f=>f.path.split('/')[1]))];
  const correctionTurn={action:'modify',patch:Object.fromEntries(roots.map(k=>[k,structuredClone(record.correctedPlan[k])]))};
  const groupId=digest([record.originalInput.trim(),record.originalPreviousState?.plan||null]);
  const output=[];
  if(Array.isArray(record.correctionMessages))output.push({id:record.id+':correction',groupId,sourceId:record.id,kind:'correction_followup',messages:record.correctionMessages,answer:correctionTurn,supervisedPaths:fields.map(f=>'/patch'+f.path),previousState:record.previousState,text:record.correctionUtterance,expectedFields:fields.map(f=>({path:f.path,value:f.after}))});
  // Do not project a correction onto an earlier, differently shaped context.
  const compatible=fields.filter(f=>equal(get(record.wrongInterpretation,f.path),f.before)&&get(record.wrongInterpretation,f.path)!==undefined);
  if(compatible.length&&Array.isArray(record.originalMessages)){
    const plan=structuredClone(record.wrongInterpretation);
    for(const f of compatible)set(plan,f.path,f.after);
    output.push({id:record.id+':original',groupId,sourceId:record.id,kind:'corrected_original',messages:record.originalMessages,answer:{action:'new',patch:plan},supervisedPaths:compatible.map(f=>'/patch'+f.path),previousState:record.originalPreviousState,text:record.originalInput,expectedFields:compatible.map(f=>({path:f.path,value:f.after}))});
  }
  return output;
}
function partition(records,{minimumGroups=10,holdoutGroups=2}={}){
  const eligible=records.filter(r=>r.recordType==='correction'&&r.status==='ready');
  const groups=new Map();
  for(const record of eligible)for(const sample of samplesFor(record)){if(!groups.has(sample.groupId))groups.set(sample.groupId,[]);groups.get(sample.groupId).push(sample);}
  const ids=[...groups.keys()].sort();
  if(ids.length<Math.max(minimumGroups,holdoutGroups+1))return {ready:false,reason:'insufficient independent correction contexts',groups:ids.length};
  // Stable group-level holdout: original/followup pairs cannot leak across splits.
  const held=new Set(ids.filter(id=>parseInt(id.slice(0,8),16)%5===0));
  if(held.size<holdoutGroups||held.size===ids.length)return {ready:false,reason:'insufficient fixed independent holdout groups',groups:ids.length,holdoutGroups:held.size};
  const train=[],holdout=[];
  for(const [id,samples] of groups)(held.has(id)?holdout:train).push(...samples);
  if(!train.length||!holdout.length)return {ready:false,reason:'empty training/evaluation split'};
  return {ready:true,train,holdout,replay:train,groups:ids.length,sourceIds:[...new Set([...train,...holdout].map(s=>s.sourceId))]};
}
async function writeSnapshot(directory,split){
  if(!split.ready)throw Error('Dataset is not eligible');
  await fs.mkdir(directory,{recursive:true});
  const version=digest({train:split.train,holdout:split.holdout});
  for(const [name,data] of Object.entries({train:split.train,holdout:split.holdout,replay:split.replay}))await fs.writeFile(path.join(directory,name+'.jsonl'),data.map(s=>JSON.stringify(s)).join('\n')+'\n',{flag:'wx'});
  await fs.writeFile(path.join(directory,'dataset.json'),JSON.stringify({version,sourceIds:split.sourceIds,trainSamples:split.train.length,holdoutSamples:split.holdout.length,groups:split.groups,partialFieldSupervision:true},null,2),{flag:'wx'});
  return version;
}
module.exports={samplesFor,partition,writeSnapshot,digest};
