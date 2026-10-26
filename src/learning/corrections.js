const fs=require('fs/promises');
const path=require('path');
const {createHash}=require('crypto');
const {get,equal,scalar,parts}=require('./json-fields');
const {containsCredential}=require('../commands/privacy');
const roots=new Set(['target','metrics','filters','groupBy','fields','share']);

function confirmedChanges(event){
  const interpretation=event.rawPrediction?.interpretation;
  if(!event.validation?.ok||interpretation?.kind!=='correction')return [];
  const found=new Map();
  for(const evidence of interpretation.fields||[]){
    if(evidence.source!=='explicit_user_correction'||typeof evidence.quote!=='string'||!evidence.quote.trim()||!event.input.includes(evidence.quote))continue;
    try{
      if(!roots.has(parts(evidence.path)[0]))continue;
      const before=get(event.previousState.plan,evidence.path),after=get(event.finalPlan,evidence.path);
      if(after===undefined||!scalar(after)||equal(before,after))continue;
      found.set(evidence.path,{path:evidence.path,before,after,quote:evidence.quote,source:evidence.source,
        schemaValid:true,catalogValid:true,userConfirmed:true,confirmationBasis:'explicit user quotation attributed by Qwen; not an independent semantic oracle'});
    }catch{/* Invalid addressing is not training evidence. */}
  }
  return [...found.values()];
}

class CorrectionStore{
  constructor(directory){this.directory=directory;this.file=path.join(directory,'corrections.jsonl');this.queue=Promise.resolve();}
  async records(){try{return (await fs.readFile(this.file,'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);}catch(e){if(e.code==='ENOENT')return [];throw e;}}
  append(record){const task=this.queue.then(async()=>{await fs.mkdir(this.directory,{recursive:true});await fs.appendFile(this.file,JSON.stringify(record)+'\n',{mode:0o600});});this.queue=task.catch(()=>{});return task;}
  capture(event){
    const task=this.queue.then(async()=>{
      const fields=confirmedChanges(event);if(!fields.length)return {queued:false,reason:'no validated explicit changed fields'};
      const origin=event.correctionOrigin;
      if([event.input,origin?.input].filter(v=>typeof v==='string').some(containsCredential))return {queued:false,reason:'credential-like input'};
      // A structurally valid plan is not automatically a wholly user-confirmed plan.
      const record={recordType:'correction',version:1,id:createHash('sha256').update(event.conversationId+event.turnId+JSON.stringify(fields)).digest('hex'),
        createdAt:new Date().toISOString(),conversationId:event.conversationId,originTurnId:origin?.turnId||null,correctionTurnId:event.turnId,
        originalInput:origin?.input||null,originalPreviousState:origin?.previousState||null,wrongInterpretation:origin?.finalPlan||event.previousState.plan,
        originalMessages:origin?.decisionMessages||null,correctionMessages:event.decisionMessages,previousState:event.previousState,
        correctionUtterance:event.input,correctedPlan:event.finalPlan,correctedFields:fields,
        source:'explicit_user_correction',schemaValid:true,catalogValid:true,wholePlanUserConfirmed:false,
        status:origin?.validation?.ok&&Array.isArray(origin.decisionMessages)?'ready':'needs_context_review'};
      const existing=await this.records();if(existing.some(r=>r.id===record.id))return {queued:false,id:record.id,reason:'already queued'};
      await fs.mkdir(this.directory,{recursive:true});await fs.appendFile(this.file,JSON.stringify(record)+'\n',{mode:0o600});
      return {queued:record.status==='ready',id:record.id,fields:fields.map(f=>f.path),status:record.status};
    });this.queue=task.catch(()=>{});return task;
  }
}
module.exports={CorrectionStore,confirmedChanges};
