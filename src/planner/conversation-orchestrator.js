// LEGACY DISABLED 2026-10-27: preserved during Gemini migration.
// const {entryMessages}=require('./conversation-context');
// const {schemaErrors}=require('./query-validator');
// const {withinBudget}=require('./request-budget');
// const {randomUUID}=require('crypto');
// function entrySchema(){return {oneOf:[{type:'object',additionalProperties:false,required:['action','confidence','message'],properties:{action:{type:'string',enum:['reply']},confidence:{type:'string',enum:['high']},message:{type:'string',minLength:1,maxLength:600}}},{type:'object',additionalProperties:false,required:['action'],properties:{action:{type:'string',enum:['bi']}}}]};}
// class ConversationOrchestrator{
//   constructor({planner,client}){this.planner=planner;this.client=client;this.controller=null;this.generation=0;}
//   prepare(){
//     if(!this.client.start)return Promise.resolve();
//     if(this.preparing)return this.preparing;
//     this.preparing=(async()=>{
//       await this.client.start();this.client.onStatus?.('로컬 Qwen의 첫 응답을 미리 준비하는 중이야 🐰');this.client.log?.('entry_warmup_started');
//       const started=Date.now();
//       await this.client.complete({messages:entryMessages(this.planner,''),responseSchema:entrySchema(),purpose:'warmup',maxTokens:64});
//       this.client.log?.('entry_warmup_ready',{durationMs:Date.now()-started});
//     })().catch(error=>{this.preparing=null;throw error;});
//     return this.preparing;
//   }
//   reset(){this.generation++;this.controller?.abort(Object.assign(Error('Conversation reset'),{code:'LLM_CANCELLED'}));this.planner.reset();}
//   stop(){this.reset();this.client.stop?.();}
//   async run(text){
//     if(typeof text!=='string'||!text.trim()||text.length>2000)throw Error('Invalid conversation input');
//     const started=Date.now(),generation=this.generation,controller=new AbortController();this.controller=controller;
//     let timer;
//     const messages=entryMessages(this.planner,text),previousState=structuredClone(this.planner.state);
//     try{
//       await withinBudget(()=>this.prepare(),controller.signal);
//       timer=setTimeout(()=>controller.abort(Object.assign(Error('Conversation timed out'),{code:'LLM_REQUEST_TIMEOUT'})),this.planner.requestTimeoutMs);
//       const raw=await withinBudget(()=>this.client.complete({messages,responseSchema:entrySchema(),purpose:'conversation',maxTokens:220,signal:controller.signal}),controller.signal);
//       let response;
//       try{response=typeof raw==='string'?JSON.parse(raw):raw;}catch{response=null;}
//       if(generation!==this.generation)throw Object.assign(Error('Conversation reset'),{code:'LLM_CANCELLED'});
//       if(response?.action==='reply'&&!schemaErrors(response,entrySchema()).length){
//         const event={conversationId:this.planner.conversationId,turnId:randomUUID(),previousTurnId:this.planner.previousTurnId,input:text,previousState,rawPrediction:response,decisionMessages:messages,executionMode:this.planner.executor.mode,queryExecuted:false,resolvedState:structuredClone(this.planner.state),attempts:[{stage:'conversation',durationMs:Date.now()-started,response}],totalDurationMs:Date.now()-started};
//         this.planner.previousTurnId=event.turnId;this.planner.lastEvent=event;
//         return {kind:'reply',message:response.message};
//       }
//       // Uncertain or malformed entry decisions must not terminate a possible BI request.
//       const out=await this.planner.run(text,{startedAt:started,signal:controller.signal});
//       this.planner.lastEvent.entryDecision={response:structuredClone(response),messages:structuredClone(messages)};
//       return out;
//     }catch(error){
//       this.planner.lastEvent={conversationId:this.planner.conversationId,turnId:randomUUID(),input:text,previousState,resolvedState:structuredClone(this.planner.state),queryExecuted:false,executionMode:this.planner.executor.mode,error:{code:error.code||'LLM_ERROR',message:error.message},totalDurationMs:Date.now()-started};
//       return {kind:'error',error:this.planner.lastEvent.error};
//     }finally{clearTimeout(timer);if(this.controller===controller)this.controller=null;}
//   }
// }
// module.exports={ConversationOrchestrator};
throw Object.assign(new Error('Legacy local LLM path is disabled during Gemini migration.'), {code:'LEGACY_LLM_DISABLED'});
