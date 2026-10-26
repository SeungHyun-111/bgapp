const {conversationMessages}=require('./conversation-context');
const {responseContract}=require('./conversation-contract');
const {definitions}=require('./bi-tool-catalog');
const {schemaErrors}=require('./query-validator');
const {withinBudget}=require('./request-budget');
const {randomUUID}=require('crypto');
class ConversationOrchestrator{
  constructor({planner,client}){this.planner=planner;this.client=client;this.controller=null;this.generation=0;}
  reset(){this.generation++;this.controller?.abort(Object.assign(Error('Conversation reset'),{code:'LLM_CANCELLED'}));this.planner.reset();}
  stop(){this.reset();this.client.stop?.();}
  async run(text){
    if(typeof text!=='string'||!text.trim()||text.length>2000)throw Error('Invalid conversation input');
    const started=Date.now(),generation=this.generation,controller=new AbortController();this.controller=controller;
    const timer=setTimeout(()=>controller.abort(Object.assign(Error('Conversation timed out'),{code:'LLM_REQUEST_TIMEOUT'})),this.planner.requestTimeoutMs);
    const messages=conversationMessages(this.planner,text),previousState=structuredClone(this.planner.state);
    try{
      const raw=await withinBudget(()=>this.client.complete({messages,responseSchema:responseContract(definitions),purpose:'conversation',maxTokens:700,signal:controller.signal}),controller.signal);
      const response=typeof raw==='string'?JSON.parse(raw):raw;
      if(generation!==this.generation)throw Object.assign(Error('Conversation reset'),{code:'LLM_CANCELLED'});
      if(response?.action==='reply'&&!schemaErrors(response,{type:'object',additionalProperties:false,required:['action','message'],properties:{action:{enum:['reply']},message:{type:'string',minLength:1,maxLength:1500}}}).length){
        const event={conversationId:this.planner.conversationId,turnId:randomUUID(),previousTurnId:this.planner.previousTurnId,input:text,previousState,rawPrediction:response,decisionMessages:messages,executionMode:this.planner.executor.mode,queryExecuted:false,resolvedState:structuredClone(this.planner.state),attempts:[{stage:'conversation',durationMs:Date.now()-started,response}],totalDurationMs:Date.now()-started};
        this.planner.previousTurnId=event.turnId;this.planner.lastEvent=event;
        this.planner.history.push({role:'user',content:text},{role:'assistant',content:response.message});this.planner.history=this.planner.history.slice(-4);
        return {kind:'reply',message:response.message};
      }
      return await this.planner.run(text,{initialResponse:raw,initialMessages:messages,startedAt:started,signal:controller.signal});
    }catch(error){
      this.planner.lastEvent={conversationId:this.planner.conversationId,turnId:randomUUID(),input:text,previousState,resolvedState:structuredClone(this.planner.state),queryExecuted:false,executionMode:this.planner.executor.mode,error:{code:error.code||'LLM_ERROR',message:error.message},totalDurationMs:Date.now()-started};
      return {kind:'error',error:this.planner.lastEvent.error};
    }finally{clearTimeout(timer);if(this.controller===controller)this.controller=null;}
  }
}
module.exports={ConversationOrchestrator};
