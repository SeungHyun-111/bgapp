const fs=require('fs/promises');
const path=require('path');
const os=require('os');
const {spawn}=require('child_process');
const {randomUUID}=require('crypto');
const {CorrectionStore}=require('./corrections');
const {partition,writeSnapshot,digest}=require('./dataset-builder');
const {atomicJson,readJson}=require('./files');

class LearningSupervisor{
  constructor({dataDirectory,client,onCandidate=async()=>{},config=process.env}){
    this.directory=path.join(dataDirectory,'learning');this.client=client;this.onCandidate=onCandidate;this.config=config;
    this.store=new CorrectionStore(this.directory);this.child=null;this.timer=null;this.closed=false;this.busy=false;
  }
  start(){this.timer=setInterval(()=>this.tick().catch(()=>{}),60000);this.timer.unref?.();}
  stop(){this.closed=true;clearInterval(this.timer);/* Owned job is allowed to finish; promotion requires a running app. */}
  async status(value){await atomicJson(path.join(this.directory,'status.json'),{timestamp:new Date().toISOString(),...value});}
  async capture(event){const captured=await this.store.capture(event);if(captured.queued)this.tick().catch(()=>{});return captured;}
  async preflight(){
    const c=this.config,missing=[];
    for(const key of ['QWEN_TRAINING_PYTHON','QWEN_TRAINING_MODEL_PATH','LLAMA_CPP_DIR','LOCAL_LLM_MODEL_PATH'])if(!c[key])missing.push(key);
    if(missing.length)return {ok:false,reason:'missing configuration',missing};
    const python=path.resolve(c.QWEN_TRAINING_PYTHON);
    if(python.toLowerCase().includes('.venv-rasa'))return {ok:false,reason:'Qwen must not use the Rasa environment'};
    const required=[python,path.join(c.QWEN_TRAINING_MODEL_PATH,'config.json'),path.join(c.QWEN_TRAINING_MODEL_PATH,'tokenizer_config.json'),path.join(c.LLAMA_CPP_DIR,'convert_hf_to_gguf.py')];
    for(const file of required)try{await fs.access(file);}catch{return {ok:false,reason:'required local file missing',file};}
    const minimum=Number(c.QWEN_MIN_FREE_RAM_GB||6)*1024**3;
    if(os.freemem()<minimum)return {ok:false,reason:'insufficient free RAM; no applications are terminated automatically',freeBytes:os.freemem(),requiredBytes:minimum};
    const root=path.dirname(path.resolve(c.LOCAL_LLM_MODEL_PATH));
    const disk=await fs.statfs(root);if(Number(disk.bavail)*Number(disk.bsize)<20*1024**3)return {ok:false,reason:'candidate generation requires 20 GiB free disk'};
    return {ok:true,python,root};
  }
  async tick(){
    if(this.closed||this.busy||this.child)return;
    this.busy=true;
    try{
      const records=await this.store.records();
      if(this.config.QWEN_AUTO_TRAIN!=='true'){await this.status({stage:'paused_by_configuration',queued:records.filter(r=>r.status==='ready').length,reason:'QWEN_AUTO_TRAIN is not enabled; no training process started'});return;}
      const split=partition(records,{minimumGroups:Number(this.config.QWEN_MIN_CORRECTION_GROUPS||10),holdoutGroups:Number(this.config.QWEN_MIN_HOLDOUT_GROUPS||2)});
      if(!split.ready){await this.status({stage:'collecting',...split});return;}
      const preflight=await this.preflight();if(!preflight.ok){await this.status({stage:'blocked',...preflight});return;}
      const identity=digest({records:records.filter(r=>r.recordType==='correction'),base:this.config.QWEN_TRAINING_MODEL_PATH,method:this.config.QWEN_TRAIN_METHOD||'qlora',maxLength:this.config.QWEN_MAX_LENGTH||4096,retryToken:this.config.QWEN_RETRY_TOKEN||'',rank:this.config.QWEN_LORA_RANK||8,epochs:this.config.QWEN_TRAIN_EPOCHS||2});
      const previous=await readJson(path.join(this.directory,'last-attempt.json'));
      // A cross-process lease prevents duplicate training after an app restart.
      const lockFile=path.join(this.directory,'worker.lock');
      const lease=await readJson(lockFile);
      if(lease){
        let running=false;try{process.kill(lease.pid,0);running=true;}catch{}
        if(running){await this.status({stage:'training',id:lease.id,directory:lease.directory,recoveredWorker:true});return;}
        const candidate=await readJson(path.join(lease.directory,'candidate.json'));
        if(candidate?.evaluation?.passed){
          try{const active=await this.onCandidate(candidate,preflight.root);await this.store.append({recordType:'promotion',candidateId:lease.id,datasetVersion:candidate.datasetVersion,active,createdAt:new Date().toISOString(),recoveredAfterRestart:true});await this.status({stage:'promoted',id:lease.id});}
          finally{await fs.rm(lockFile,{force:true});}
        }else await fs.rm(lockFile,{force:true});
      }
      if(previous?.identity===identity)return;
      let lock;
      try{lock=await fs.open(lockFile,'wx',0o600);}catch(e){if(e.code==='EEXIST'){await this.status({stage:'blocked',reason:'worker lease exists; inspect status before clearing a stale lease'});return;}throw e;}
      const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8);
      const directory=path.join(preflight.root,'qwen-candidates',id);
      try{
        const datasetVersion=await writeSnapshot(directory,split);
        const job={id,directory,baseModel:path.resolve(this.config.QWEN_TRAINING_MODEL_PATH),python:preflight.python,
          datasetVersion,trainFile:path.join(directory,'train.jsonl'),holdoutFile:path.join(directory,'holdout.jsonl'),replayFile:path.join(directory,'replay.jsonl'),
          regressionFile:path.join(this.directory,'../training/eval.planner.jsonl'),dataDirectory:path.dirname(this.directory),
          baselineModel:this.client.findModel(),llamaCppDirectory:path.resolve(this.config.LLAMA_CPP_DIR),
          todayKorea:new Date(Date.now()+9*3600000).toISOString().slice(0,10),workerLeaseFile:lockFile,
          method:this.config.QWEN_TRAIN_METHOD||'qlora',device:this.config.QWEN_TRAIN_DEVICE||'auto',maxLength:Number(this.config.QWEN_MAX_LENGTH||4096),
          rank:Number(this.config.QWEN_LORA_RANK||8),epochs:Number(this.config.QWEN_TRAIN_EPOCHS||2),sourceIds:split.sourceIds};
        const jobFile=path.join(directory,'job.json');await atomicJson(jobFile,job);
        await lock.writeFile(JSON.stringify({id,directory,pid:process.pid}));await lock.close();
        await atomicJson(path.join(this.directory,'last-attempt.json'),{identity,id,directory});
        const log=await fs.open(path.join(directory,'worker.log'),'a');
        this.child=spawn(process.execPath,[path.resolve(__dirname,'../../scripts/run-qwen-learning-job.js'),jobFile],{windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',UV_CACHE_DIR:this.config.UV_CACHE_DIR||'',PYTHONIOENCODING:'utf-8'},stdio:['ignore',log.fd,log.fd]});
        let earlyError,earlyExit;
        this.child.once('error',error=>{earlyError=error;});this.child.once('exit',code=>{earlyExit=code;});
        await atomicJson(lockFile,{id,directory,pid:this.child.pid,ownerPid:process.pid});
        await log.close();await this.status({stage:'training',id,directory});
        const child=this.child;
        const finished=async(code,error)=>{
          if(this.child!==child)return;this.child=null;
          try{
            if(code===0&&!this.closed){const candidate=await readJson(path.join(directory,'candidate.json'));const active=await this.onCandidate(candidate,preflight.root);await this.store.append({recordType:'promotion',candidateId:id,datasetVersion,sourceIds:split.sourceIds,active,createdAt:new Date().toISOString()});await this.status({stage:'promoted',id,directory});}
            else await this.status({stage:this.closed&&code===0?'candidate_ready':'failed',id,directory,exitCode:code,error:error?.message});
          }catch(e){await this.status({stage:'promotion_failed',id,directory,error:e.message});}
          finally{if(!(code===0&&this.closed))await fs.rm(lockFile,{force:true});}
        };
        child.once('error',error=>finished(null,error).catch(()=>{}));child.once('exit',code=>finished(code).catch(()=>{}));
        if(earlyError||earlyExit!==undefined)await finished(earlyExit??null,earlyError);
      }catch(e){await lock.close().catch(()=>{});await fs.rm(lockFile,{force:true});throw e;}
    }catch(error){
      await this.status({stage:'blocked',reason:'learning supervisor error',error:error.message});
      throw error;
    }finally{this.busy=false;}
  }
}
module.exports={LearningSupervisor};
