// LEGACY DISABLED 2026-10-27: preserved during Gemini migration.
// const fs=require('fs');
// const path=require('path');
// const {spawn}=require('child_process');
// const {randomBytes}=require('crypto');
// const {definitions}=require('./bi-tool-catalog');
// const {responseContract}=require('./conversation-contract');
// const {withinBudget}=require('./request-budget');
// const {runtimeConfiguration,appendBounded}=require('./llm-runtime');
// const {readResponse}=require('./llm-stream');
// const fail=(code,message)=>Object.assign(new Error(message),{code});
// function localUrl(value){const url=new URL(value);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw fail('LLM_CONFIG','Only http://127.0.0.1:<port> is allowed');return url.origin;}
// function responseSchema(){return responseContract(definitions);}
// class LocalLlmClient{
//   constructor({directory=path.resolve(__dirname,'../../data/llm'),baseUrl=process.env.LLAMA_SERVER_URL,modelPath=process.env.LOCAL_LLM_MODEL_PATH||process.env.LLAMA_MODEL_PATH,activeManifest=path.resolve(directory,'../learning/active-model.json'),port=Number(process.env.LOCAL_LLM_PORT||8080),timeoutMs=90000,startupMs=90000,idleMs=0,onStatus=()=>{},recordRaw=async()=>{},fetchImpl=fetch}={}){
//     Object.assign(this,{directory,modelPath,activeManifest,port,timeoutMs,startupMs,idleMs,onStatus,recordRaw});
//     this.external=Boolean(baseUrl);this.base=baseUrl?localUrl(baseUrl):null;this.fetch=fetchImpl;this.diagnostics=fetchImpl===fetch;this.key=process.env.LLAMA_API_KEY||randomBytes(24).toString('hex');
//     this.child=null;this.starting=null;this.timer=null;this.inFlight=0;this.generation=0;this.pinnedModelPath=null;this.lifecycle='stopped';this.runtime=null;this.recentLog=[];
//   }
//   log(event,detail={}){if(!this.diagnostics)return;try{appendBounded(path.join(this.directory,'lifecycle.jsonl'),JSON.stringify({timestamp:new Date().toISOString(),event,lifecycle:this.lifecycle,...detail})+'\n');}catch{/* Diagnostics cannot break model service. */}}
//   output(chunk){const text=String(chunk).split(this.key).join('[redacted]');this.recentLog.push(...text.split(/\r?\n/).filter(Boolean));this.recentLog=this.recentLog.slice(-150);try{appendBounded(path.join(this.directory,'runtime.log'),text);}catch{}}
//   async health(){
//     if(!this.base)return {ready:false,code:'MODEL_NOT_RUNNING'};
//     try{const r=await this.fetch(this.base+'/health',{headers:this.headers(),redirect:'error',signal:AbortSignal.timeout(1500)});if(!r.ok)return {ready:false,code:r.status===503?'MODEL_LOADING':'MODEL_HEALTH_ERROR'};const j=await r.json();return {ready:j.status==='ok',code:j.status==='ok'?'MODEL_READY':'MODEL_LOADING'};}catch{return {ready:false,code:'MODEL_NOT_RUNNING'};}
//   }
//   headers(){return {'Content-Type':'application/json',...(this.external&&!process.env.LLAMA_API_KEY?{}:{Authorization:'Bearer '+this.key})};}
//   findModel(){
//     let active=null;
//     if(!this.pinnedModelPath&&this.activeManifest&&fs.existsSync(this.activeManifest)){
//       try{active=JSON.parse(fs.readFileSync(this.activeManifest,'utf8')).modelPath;}catch{throw fail('LLM_CONFIG','활성 모델 기록을 읽지 못했어.');}
//       if(!active||!fs.existsSync(active))throw fail('MODEL_FILE_NOT_FOUND','승격된 로컬 모델 파일을 찾지 못했어.');
//     }
//     const paths=this.pinnedModelPath?[this.pinnedModelPath]:active?[active]:[this.modelPath,path.join(this.directory,'models/Qwen3-1.7B-Q4_K_M.gguf'),path.join(this.directory,'models/Qwen3-0.6B-Q4_K_M.gguf')].filter(Boolean);
//     const model=paths.find(file=>fs.existsSync(file)&&fs.statSync(file).size>100000000);
//     if(!model)throw fail('MODEL_FILE_NOT_FOUND','Qwen GGUF 파일을 찾지 못했어. 모델 경로를 확인해줘.');
//     const fd=fs.openSync(model,'r');try{const magic=Buffer.alloc(4);fs.readSync(fd,magic,0,4,0);if(magic.toString()!=='GGUF')throw fail('MODEL_FILE_INVALID','모델 파일의 GGUF 헤더를 확인하지 못했어.');}finally{fs.closeSync(fd);}
//     return model;
//   }
//   async start(){
//     if(this.starting)return this.starting;
//     this.starting=this.startWorker().catch(async error=>{
//       if(!this.cpuFallbackUsed&&(this.runtime?.backend==='Vulkan'||(!this.runtime&&process.env.LOCAL_LLM_RUNTIME_DIR))&&error.code!=='LLM_CANCELLED'){
//         this.cpuFallbackUsed=true;this.log('gpu_startup_failed_cpu_fallback',{code:error.code,message:error.message,recent:this.recentLog.slice(-12)});await this.close();this.runtime=await runtimeConfiguration(this.directory,{cpuOnly:true});return this.startWorker();
//       }
//       this.lifecycle='error';this.log('startup_failed',{code:error.code,message:error.message,recent:this.recentLog.slice(-12)});throw error;
//     }).finally(()=>{this.starting=null;});return this.starting;
//   }
//   async startWorker(){
//     if(this.external){if(!(await this.health()).ready)throw fail('MODEL_HEALTH_TIMEOUT','외부 로컬 서버가 준비되지 않았어.');this.lifecycle='ready';return;}
//     if(this.child&&(await this.health()).ready){this.lifecycle='ready';return;}
//     if(this.child)await this.close();
//     const started=Date.now(),model=this.findModel();
//     if(!Number.isInteger(this.port)||this.port<1||this.port>65535)throw fail('LLM_CONFIG','포트 설정을 확인해줘.');
//     this.lifecycle='starting';this.onStatus('로컬 Qwen을 준비하는 중이야. 준비되면 바로 이어서 답할게 🐰');this.log('starting',{model});
//     const generation=this.generation;
//     this.runtime??=await runtimeConfiguration(this.directory);const c=this.runtime;
//     const executable=c.executable;
//     if(!fs.existsSync(executable))throw fail('MODEL_BACKEND_ERROR','llama-server 실행 파일이 없어.');
//     if(generation!==this.generation)throw fail('LLM_CANCELLED','모델 시작이 취소됐어.');
//     this.log('configuration',c);
//     this.base='http://127.0.0.1:'+this.port;
//     const child=spawn(executable,['--model',model,'--host','127.0.0.1','--port',String(this.port),'--api-key',this.key,'--ctx-size',String(c.contextSize),'--parallel','1','--batch-size',String(c.batchSize),'--ubatch-size',String(c.ubatchSize),'--threads',String(c.threads),'--threads-batch',String(c.threadsBatch),'--n-gpu-layers',String(c.gpuLayers),...(c.gpuDevice?['--device',c.gpuDevice,'--fit','on','--fit-target','1024']:[]),'--cache-ram',String(c.cacheRamMiB),'--reasoning','off','--reasoning-budget','0','--offline','--no-webui','--jinja','-lv','4'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
//     this.child=child;let exited=false;this.log('process_spawned',{pid:child.pid,elapsedMs:Date.now()-started});
//     child.stdout.on('data',data=>this.output(data));child.stderr.on('data',data=>this.output(data));
//     child.on('error',error=>{exited=true;this.log('process_error',{message:error.message});});
//     child.on('exit',(code,signal)=>{exited=true;if(this.child===child){this.child=null;this.lifecycle='error';}this.log('process_exit',{pid:child.pid,code,signal});});
//     this.log('health_waiting');
//     while(Date.now()-started<this.startupMs){
//       if(generation!==this.generation)throw fail('LLM_CANCELLED','모델 시작이 취소됐어.');
//       if(exited||this.child!==child)throw fail('MODEL_PROCESS_EXIT','llama-server가 모델 준비 중 종료됐어.');
//       if((await this.health()).ready){this.modelName=path.basename(model);this.lifecycle='ready';this.readyMs=Date.now()-started;this.log('ready',{pid:child.pid,readyMs:this.readyMs});return;}
//       await new Promise(resolve=>setTimeout(resolve,250));
//     }
//     this.stop();throw fail('MODEL_STARTUP_TIMEOUT','모델을 메모리에 준비하는 시간이 초과됐어.');
//   }
//   async complete({messages,responseSchema:customSchema,toolDefinitions,purpose='planner',maxTokens=1400,signal:parentSignal}){
//     clearTimeout(this.timer);this.inFlight++;
//     const nativeTools=Array.isArray(toolDefinitions)&&toolDefinitions.length>0;
//     const trace={timestamp:new Date().toISOString(),purpose,protocol:nativeTools?'native_function_calls':'json_schema',model:this.modelName||'configured-local-Qwen',response:null};
//     let signal=parentSignal,inferenceStarted=null;
//     try{
//       const waitStarted=Date.now();await withinBudget(()=>this.start(),parentSignal);trace.startupWaitMs=Date.now()-waitStarted;
//       parentSignal?.throwIfAborted();trace.stage='inference';
//       signal=parentSignal?AbortSignal.any([parentSignal,AbortSignal.timeout(this.timeoutMs)]):AbortSignal.timeout(this.timeoutMs);
//       this.onStatus(purpose==='warmup'?'로컬 Qwen의 첫 응답을 미리 준비하는 중이야 🐰':purpose==='result-explanation'?'실제 BI 결과에 설명을 덧붙이는 중이야 🐰':purpose==='conversation'?'우응, 답을 생각하고 있어 🐰':purpose.startsWith('catalog-')?'관련 BI 항목을 살펴보고 있어 🐰':'조회 계획을 만들고 있어 🐰');
//       trace.model=this.modelName;trace.modelPath=this.external?null:this.findModel();inferenceStarted=Date.now();
//       this.log('inference_started',{purpose,messageCharacters:messages.reduce((n,m)=>n+m.content.length,0),pid:this.child?.pid});
//       const format=nativeTools?{tools:toolDefinitions.map(({name,description,input})=>({type:'function',function:{name,description,parameters:input}})),tool_choice:'auto',parallel_tool_calls:false}
//         :{response_format:{type:'json_schema',json_schema:{name:'usagi_response',strict:true,schema:customSchema||responseSchema()}}};
//       const response=await withinBudget(()=>this.fetch(this.base+'/v1/chat/completions',{method:'POST',headers:this.headers(),redirect:'error',signal,body:JSON.stringify({messages,stream:true,stream_options:{include_usage:true},temperature:0,max_tokens:Math.min(2400,Math.max(64,maxTokens)),cache_prompt:true,chat_template_kwargs:{enable_thinking:false},...format})}),signal);
//       trace.httpHeadersMs=Date.now()-inferenceStarted;
//       if(!response.ok){trace.response=await withinBudget(()=>response.text(),signal);throw fail('INFERENCE_HTTP_ERROR',`로컬 모델 서버 오류 (${response.status})`);}
//       let envelope;try{envelope=await readResponse(response,signal,trace,inferenceStarted);}catch(error){if(signal.aborted)throw error;throw fail('INVALID_MODEL_RESPONSE','로컬 모델 응답 형식을 읽지 못했어.');}
//       trace.response=JSON.stringify(envelope);trace.content=envelope.choices?.[0]?.message?.content;trace.timings=envelope.timings;
//       if(envelope.choices?.[0]?.finish_reason==='length')throw fail('INVALID_MODEL_RESPONSE','모델 출력이 길이 제한으로 잘렸어.');
//       const calls=envelope.choices?.[0]?.message?.tool_calls;
//       if(nativeTools&&calls?.length){
//         if(calls.length!==1||calls[0].type!=='function'||typeof calls[0].function?.name!=='string')throw fail('INVALID_MODEL_RESPONSE','한 번에 하나의 등록된 도구 호출이 필요해.');
//         const call=calls[0];let args=call.function.arguments;
//         if(typeof args==='string')try{args=JSON.parse(args);}catch{/* The planner reports argument validation feedback. */}
//         const decision={tool:{name:call.function.name,arguments:args}};
//         if(call.id)Object.defineProperty(decision,'toolCallId',{value:call.id});
//         return decision;
//       }
//       if(typeof trace.content!=='string')throw fail('INVALID_MODEL_RESPONSE','모델 응답이 비어 있어.');
//       const content=trace.content.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/,'$1');
//       try{return JSON.parse(content);}catch{
//         // Native tool use leaves terminal text unconstrained. Return invalid text
//         // to the planner for contract repair; never execute or treat it as a result.
//         if(nativeTools)return {unparsed:trace.content};
//         throw fail('INVALID_MODEL_RESPONSE','모델이 반환한 JSON을 해석하지 못했어.');
//       }
//     }catch(error){
//       if(signal?.aborted||error.name==='TimeoutError'||error.name==='AbortError'){error=parentSignal?.aborted?parentSignal.reason:fail('INFERENCE_TIMEOUT','모델은 준비됐지만 답변 생성 시간이 초과됐어.');const health=await this.health();this.log('request_aborted',{code:error.code,serverHealthy:health.ready});if(!health.ready&&!this.external)this.stop();}
//       trace.error={code:error.code||'MODEL_CONNECTION_ERROR',message:error.message};throw Object.assign(error,{code:trace.error.code});
//     }finally{
//       if(inferenceStarted!==null)trace.inferenceMs=Date.now()-inferenceStarted;
//       this.log('inference_finished',{purpose,inferenceMs:trace.inferenceMs,startupWaitMs:trace.startupWaitMs,firstResponseMs:trace.firstResponseMs,firstTokenMs:trace.firstTokenMs,code:trace.error?.code,pid:this.child?.pid});
//       try{await this.recordRaw(trace);}finally{this.inFlight--;if(this.idleMs>0&&!this.external&&!this.inFlight){this.timer=setTimeout(()=>this.stop(),this.idleMs);this.timer.unref?.();}}
//     }
//   }
//   stop(){this.generation++;clearTimeout(this.timer);this.timer=null;const child=this.child;this.child=null;this.lifecycle='stopped';if(child)child.kill();if(!this.external)this.base=null;}
//   async close(){const child=this.child;this.stop();if(!child||child.exitCode!==null)return;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(fail('MODEL_STOP_TIMEOUT','기존 모델 종료를 기다리는 중이야.')),5000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}
//   async useModel(modelPath){if(this.external||this.inFlight)throw fail('LLM_BUSY','요청이 끝난 뒤 모델을 교체할 수 있어.');await this.close();this.pinnedModelPath=path.resolve(modelPath);this.modelPath=this.pinnedModelPath;await this.start();}
// }
// module.exports={LocalLlmClient,localUrl,responseSchema};
throw Object.assign(new Error('Legacy local LLM path is disabled during Gemini migration.'), {code:'LEGACY_LLM_DISABLED'});
