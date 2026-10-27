// LEGACY DISABLED 2026-10-27: preserved during Gemini migration.
// const fs=require('fs/promises');
// const path=require('path');
// const {readJson,atomicJson,fileHash}=require('./files');
//
// async function promote({directory,client,candidate,allowedModelRoot}){
//   if(client.external)throw Error('Cannot replace a separately managed llama-server');
//   if(!candidate?.evaluation?.passed||!candidate.training?.completed||!(candidate.training.adapterUpdateL2>0))throw Error('Candidate has no passed real training/evaluation evidence');
//   const model=path.resolve(candidate.modelPath),root=await fs.realpath(allowedModelRoot);
//   const real=await fs.realpath(model),relative=path.relative(root,real);
//   if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||path.extname(real)!=='.gguf')throw Error('Candidate must be a versioned GGUF inside the allowed model directory');
//   if((await fileHash(real))!==candidate.sha256)throw Error('Candidate GGUF checksum mismatch');
//   if(client.inFlight)throw Error('Promotion requires an idle chat provider');
//   const activeFile=path.join(directory,'active-model.json');
//   const oldModel=client.findModel();
//   const previous=await readJson(activeFile,{modelPath:oldModel,version:'initial'});
//   if(previous.version===candidate.id&&path.resolve(oldModel)===real)return previous;
//   if(!candidate.baselineModel||path.resolve(candidate.baselineModel)!==path.resolve(oldModel)||candidate.baselineSha256!==await fileHash(oldModel))throw Error('Active model changed since candidate evaluation');
//   if(path.resolve(oldModel)===real)throw Error('Candidate cannot overwrite the active model');
//   // Versioned old GGUF stays intact; this manifest is the rollback reference.
//   await atomicJson(path.join(directory,'previous-model.json'),previous);
//   try{
//     await client.useModel(real);
//     const check=await client.complete({purpose:'promotion-canary',maxTokens:100,
//       responseSchema:{type:'object',additionalProperties:false,required:['ready'],properties:{ready:{type:'boolean',enum:[true]}}},
//       messages:[{role:'system',content:'Return exactly the JSON object {"ready":true}.'},{role:'user',content:'Local model readiness check.'}]});
//     if(check.ready!==true)throw Error('Candidate model readiness failed');
//     const next={version:candidate.id,modelPath:real,sha256:candidate.sha256,previousModelPath:oldModel,datasetVersion:candidate.datasetVersion,adapterPath:candidate.adapterPath,promotedAt:new Date().toISOString()};
//     await atomicJson(activeFile,next);return next;
//   }catch(error){
//     let rollbackError=null;
//     try{await client.useModel(oldModel);await atomicJson(activeFile,previous);}catch(e){rollbackError=e.message;}
//     await atomicJson(path.join(directory,'last-rollback.json'),{timestamp:new Date().toISOString(),rejectedCandidate:candidate.id,restoredModel:oldModel,error:error.message,rollbackError});
//     if(rollbackError)throw Error(`Promotion failed; rollback also failed: ${rollbackError}`);
//     throw error;
//   }
// }
// module.exports={promote};
throw Object.assign(new Error('Legacy local LLM path is disabled during Gemini migration.'), {code:'LEGACY_LLM_DISABLED'});
