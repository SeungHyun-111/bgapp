const fs=require('fs');
const path=require('path');
const {spawn}=require('child_process');
const {randomBytes}=require('crypto');
const turnSchema=require('./turn-schema.json');
const {definitions}=require('./bi-tool-catalog');
const {withinBudget}=require('./request-budget');
const fail=(code,message)=>Object.assign(new Error(message),{code});
function localUrl(value){const url=new URL(value);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw fail('LLM_CONFIG','Only http://127.0.0.1:<port> is allowed');return url.origin;}
function responseSchema(){return {oneOf:[turnSchema,{type:'object',additionalProperties:false,required:['tool'],properties:{tool:{type:'object',additionalProperties:false,required:['name','arguments'],properties:{name:{type:'string',enum:definitions.map(t=>t.name)},arguments:{type:'object'}}}}}]};}
class LocalLlmClient{
  constructor({directory=path.resolve(__dirname,'../../data/llm'),baseUrl=process.env.LLAMA_SERVER_URL,modelPath=process.env.LOCAL_LLM_MODEL_PATH||process.env.LLAMA_MODEL_PATH,activeManifest=path.resolve(directory,'../learning/active-model.json'),port=Number(process.env.LOCAL_LLM_PORT||8080),timeoutMs=90000,startupMs=90000,idleMs=5*60000,onStatus=()=>{},recordRaw=async()=>{},fetchImpl=fetch}={}){
    this.directory=directory;this.external=Boolean(baseUrl);this.base=baseUrl?localUrl(baseUrl):null;this.modelPath=modelPath;this.timeoutMs=timeoutMs;this.startupMs=startupMs;this.idleMs=idleMs;this.onStatus=onStatus;this.recordRaw=recordRaw;this.fetch=fetchImpl;this.key=process.env.LLAMA_API_KEY||randomBytes(24).toString('hex');this.child=null;this.starting=null;this.timer=null;this.inFlight=0;this.generation=0;
    this.activeManifest=activeManifest;this.port=port;this.pinnedModelPath=null;
  }
  async health(){
    if(!this.base)return {ready:false,code:'LLM_NOT_RUNNING'};
    try{const r=await this.fetch(this.base+'/health',{headers:this.headers(),redirect:'error',signal:AbortSignal.timeout(1500)});if(!r.ok)return {ready:false,code:r.status===503?'LLM_LOADING':'LLM_HTTP_ERROR'};const j=await r.json();return {ready:j.status==='ok',code:j.status==='ok'?'LLM_READY':'LLM_LOADING'};}catch{return {ready:false,code:'LLM_NOT_RUNNING'};}
  }
  headers(){return {'Content-Type':'application/json',...(this.external&&!process.env.LLAMA_API_KEY?{}:{Authorization:'Bearer '+this.key})};}
  findModel(){
    let active=null;
    if(!this.pinnedModelPath&&this.activeManifest&&fs.existsSync(this.activeManifest)){
      try{active=JSON.parse(fs.readFileSync(this.activeManifest,'utf8')).modelPath;}catch{throw fail('LLM_CONFIG','활성 모델 기록을 읽지 못했어.');}
      if(!active||!fs.existsSync(active))throw fail('LLM_MODEL_MISSING','승격된 로컬 모델 파일을 찾지 못했어. 이전 모델 복원이 필요해.');
    }
    const paths=this.pinnedModelPath?[this.pinnedModelPath]:active?[active]:[this.modelPath,path.join(this.directory,'models/Qwen3-1.7B-Q4_K_M.gguf'),path.join(this.directory,'models/Qwen3-0.6B-Q4_K_M.gguf')].filter(Boolean);
    const model=paths.find(file=>fs.existsSync(file)&&fs.statSync(file).size>100000000);
    if(!model)throw fail('LLM_MODEL_MISSING','Qwen GGUF 파일이 없어. LOCAL_LLM_MODEL_PATH에 승인된 로컬 모델 경로를 지정해줘.');
    const fd=fs.openSync(model,'r');try{const magic=Buffer.alloc(4);fs.readSync(fd,magic,0,4,0);if(magic.toString()!=='GGUF')throw fail('LLM_MODEL_INVALID','모델 파일의 GGUF 헤더를 확인할 수 없어.');}finally{fs.closeSync(fd);}
    return model;
  }
  async start(){
    if(this.starting)return this.starting;
    this.starting=this.startWorker().finally(()=>{this.starting=null;});return this.starting;
  }
  async startWorker(){
    if(this.external){if(!(await this.health()).ready)throw fail('LLM_NOT_RUNNING','127.0.0.1의 llama-server가 준비되지 않았어.');return;}
    if(this.child&&(await this.health()).ready)return;
    const executable=path.join(this.directory,'runtime/llama-server.exe'),model=this.findModel();
    if(!fs.existsSync(executable))throw fail('LLM_RUNTIME_MISSING','로컬 llama-server 실행 파일이 없어.');
    this.onStatus('로컬 Qwen 모델을 메모리에 올리는 중이야 🐰');
    const port=this.port;
    if(!Number.isInteger(port)||port<1||port>65535)throw fail('LLM_CONFIG','로컬 서버 포트 설정이 올바르지 않아.');
    const generation=this.generation;this.base='http://127.0.0.1:'+port;if(generation!==this.generation)throw fail('LLM_CANCELLED','모델 시작이 취소됐어.');
    const child=spawn(executable,['--model',model,'--host','127.0.0.1','--port',new URL(this.base).port,'--api-key',this.key,'--ctx-size','8192','--parallel','1','--batch-size','128','--ubatch-size','128','--threads','4','--n-gpu-layers','0','--offline','--no-webui','--jinja'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    this.child=child;let exited=false;
    child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
    child.on('error',()=>{exited=true;});child.on('exit',()=>{exited=true;if(this.child===child)this.child=null;});
    const deadline=Date.now()+this.startupMs;
    while(Date.now()<deadline){if(exited||this.child!==child)throw fail('LLM_START_FAILED','llama-server가 모델을 불러오지 못하고 종료됐어.');if((await this.health()).ready){this.modelName=path.basename(model);return;}await new Promise(resolve=>setTimeout(resolve,300));}
    this.stop();throw fail('LLM_START_TIMEOUT','Qwen 모델 시작 대기 시간이 초과됐어.');
  }
  async complete({messages,responseSchema:customSchema,purpose='planner',maxTokens=1400,signal:parentSignal}){
    clearTimeout(this.timer);this.inFlight++;
    const trace={timestamp:new Date().toISOString(),purpose,model:this.modelName||'configured-local-Qwen',response:null};
    const signal=parentSignal?AbortSignal.any([parentSignal,AbortSignal.timeout(this.timeoutMs)]):AbortSignal.timeout(this.timeoutMs);
    try{
      await withinBudget(()=>this.start(),signal);signal.throwIfAborted();
      this.onStatus(purpose.startsWith('catalog-')?'로컬 Qwen이 BI 지표 설명에서 관련 후보를 찾는 중이야 🐰':'로컬 Qwen이 조회 계획을 만드는 중이야 🐰');
      trace.model=this.modelName;trace.modelPath=this.external?null:this.findModel();
      let response;
      try{response=await withinBudget(()=>this.fetch(this.base+'/v1/chat/completions',{method:'POST',headers:this.headers(),redirect:'error',signal,body:JSON.stringify({messages,stream:false,temperature:0,max_tokens:Math.min(2400,Math.max(100,maxTokens)),cache_prompt:true,chat_template_kwargs:{enable_thinking:false},response_format:{type:'json_schema',json_schema:{name:'bi_structured_response',strict:true,schema:customSchema||responseSchema()}}})}),signal);}
      catch(error){throw fail(error.name==='TimeoutError'||error.name==='AbortError'?'LLM_TIMEOUT':'LLM_NOT_RUNNING',error.name==='TimeoutError'||error.name==='AbortError'?'로컬 Qwen 응답 시간이 초과됐어.':'로컬 Qwen 서버와 연결이 끊겼어.');}
      trace.response=await withinBudget(()=>response.text(),signal);
      if(!response.ok)throw fail('LLM_HTTP_ERROR',`로컬 Qwen 서버 오류 (${response.status})`);
      let envelope;try{envelope=JSON.parse(trace.response);}catch{throw fail('LLM_MALFORMED_JSON','로컬 서버 응답이 JSON 형식이 아니야.');}
      const message=envelope.choices?.[0]?.message;trace.content=message?.content;
      if(envelope.choices?.[0]?.finish_reason==='length')throw fail('LLM_OUTPUT_TRUNCATED','조회 계획이 출력 길이 제한으로 잘렸어.');
      if(typeof message?.content!=='string')throw fail('LLM_MALFORMED_JSON','모델이 계획 JSON을 반환하지 않았어.');
      try{return JSON.parse(message.content);}catch{throw fail('LLM_MALFORMED_JSON','모델이 만든 계획 JSON을 해석하지 못했어.');}
    }catch(error){if(signal.aborted){error=parentSignal?.aborted?parentSignal.reason:fail('LLM_TIMEOUT','로컬 Qwen 응답 시간이 초과됐어.');if(!this.external)this.stop();}trace.error={code:error.code||'LLM_ERROR',message:error.message};throw error;}
    finally{
      try{await this.recordRaw(trace);}finally{this.inFlight--;if(!this.external&&!this.inFlight){this.timer=setTimeout(()=>this.stop(),this.idleMs);this.timer.unref?.();}}
    }
  }
  stop(){this.generation++;clearTimeout(this.timer);this.timer=null;const child=this.child;this.child=null;if(child)child.kill();if(!this.external)this.base=null;}
  async close(){const child=this.child;this.stop();if(!child||child.exitCode!==null)return;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(fail('LLM_STOP_TIMEOUT','기존 로컬 모델 종료를 기다리는 중이야.')),5000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}
  async useModel(modelPath){if(this.external||this.inFlight)throw fail('LLM_BUSY','모델 교체는 로컬 요청이 끝난 뒤에만 가능해.');await this.close();this.pinnedModelPath=path.resolve(modelPath);this.modelPath=this.pinnedModelPath;await this.start();}
}
module.exports={LocalLlmClient,localUrl,responseSchema};
