const fs=require('fs/promises');
const path=require('path');
const {spawn}=require('child_process');
const {atomicJson,readJson,fileHash}=require('../src/learning/files');
const {gate}=require('./evaluate-qwen-candidate');
async function main(file){
  const job=await readJson(file);if(!job)throw Error('Learning job missing');
  const dir=await fs.realpath(job.directory),base=await fs.realpath(job.baseModel);
  if(dir===base||base.startsWith(dir+path.sep))throw Error('Candidate directory must not contain the immutable base model');
  for(const [key,min,max] of [['rank',1,64],['epochs',1,10],['maxLength',128,8192]])if(!Number.isInteger(job[key])||job[key]<min||job[key]>max)throw Error('Invalid '+key);
  await fs.mkdir(path.join(dir,'tmp'),{recursive:true});
  const env={...process.env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',HF_DATASETS_OFFLINE:'1',HF_HOME:path.join(dir,'hf-cache'),TORCH_HOME:path.join(dir,'torch-cache'),TEMP:path.join(dir,'tmp'),TMP:path.join(dir,'tmp'),PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1'};
  async function run(command,args,stage){
    await atomicJson(path.join(dir,'job-status.json'),{stage,updatedAt:new Date().toISOString()});
    await new Promise((resolve,reject)=>{
      const child=spawn(command,args,{windowsHide:true,env,stdio:'inherit'});
      const timer=setTimeout(()=>{child.kill();reject(Error(stage+' exceeded the four-hour job limit'));},4*3600000);
      child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error(stage+' exited '+code));});
    });
  }
  try{
    if(job.workerLeaseFile)await atomicJson(job.workerLeaseFile,{id:job.id,directory:dir,pid:process.pid});
    // Import package metadata only before loading any model. No auto-install.
    const modules=['torch','transformers','peft','safetensors','gguf',...(job.method==='qlora'?['bitsandbytes']:[])];
    await run(job.python,['-B','-c',`import importlib.util; missing=[n for n in ${JSON.stringify(modules)} if importlib.util.find_spec(n) is None]; assert not missing, 'Missing training packages: '+str(missing)`],'dependencies');
    const trainingScript=path.join(__dirname,'qwen_train.py');
    await run(job.python,['-B',trainingScript,'train',file],'training');
    const training=await readJson(path.join(dir,'training-report.json'));
    if(!training?.completed||!training.steps||!(training.adapterUpdateL2>0))throw Error('No verified Qwen weight update');
    await run(job.python,['-B',trainingScript,'merge',file],'merging');
    await run(job.python,[path.join(job.llamaCppDirectory,'convert_hf_to_gguf.py'),path.join(dir,'merged'),'--outfile',path.join(dir,'model-f16.gguf'),'--outtype','f16'],'converting');
    const runtime=path.join(job.dataDirectory,'llm/runtime/llama-quantize.exe');
    const model=path.join(dir,'model-Q4_K_M.gguf');
    await run(runtime,[path.join(dir,'model-f16.gguf'),model,'Q4_K_M'],'quantizing');
    const evaluator=path.join(__dirname,'evaluate-qwen-candidate.js');
    await run(process.execPath,[evaluator,file,job.baselineModel,'baseline'],'baseline_evaluation');
    await run(process.execPath,[evaluator,file,model,'candidate'],'candidate_evaluation');
    const evaluation=gate(await readJson(path.join(dir,'baseline-evaluation.json')),await readJson(path.join(dir,'candidate-evaluation.json')));
    await atomicJson(path.join(dir,'evaluation-gate.json'),evaluation);
    if(!evaluation.passed)throw Error('Candidate rejected: '+evaluation.reasons.join('; '));
    const candidate={id:job.id,modelPath:model,baselineModel:job.baselineModel,baselineSha256:await fileHash(job.baselineModel),adapterPath:path.join(dir,'adapter'),sha256:await fileHash(model),datasetVersion:job.datasetVersion,training,evaluation};
    await atomicJson(path.join(dir,'candidate.json'),candidate);await atomicJson(path.join(dir,'job-status.json'),{stage:'validated_candidate',id:job.id});
  }catch(error){await atomicJson(path.join(dir,'job-status.json'),{stage:'failed',error:error.message,timestamp:new Date().toISOString()});throw error;}
}
if(require.main===module)main(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
