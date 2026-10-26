const {randomUUID}=require('crypto');
const {createTools}=require('./bi-tool-catalog');
const {applyTurn}=require('./dialogue-state');
const {validatePlan,schemaErrors}=require('./query-validator');
const turnSchema=require('./turn-schema.json');
const planSchema=require('./plan-schema.json');
const {plannerPrompt}=require('./planner-prompt');
const {get,equal}=require('../learning/json-fields');
const {confirmedChanges}=require('../learning/corrections');
const {withinBudget}=require('./request-budget');
// The provider is injected. A scripted provider tests plumbing, not language understanding.
class QueryPlanner{
  constructor({provider,catalog,entities=[],executor,semanticCatalog,record=async()=>{},now=()=>new Date(),onStatus=()=>{},maxRepairs=2,requestTimeoutMs=120000}){
    if(!['fake','live'].includes(executor.mode))throw Error('A registered fake or live executor is required');
    this.provider=provider;this.catalog=catalog;this.entities=entities;this.executor=executor;this.record=record;this.now=now;this.state={plan:null,pending:null};this.conversationId=randomUUID();this.previousTurnId=null;
    this.history=[];
    this.onStatus=onStatus;this.maxRepairs=maxRepairs;
    this.semanticCatalog=semanticCatalog;this.acceptedTurns=[];this.fieldProvenance={};
    this.requestTimeoutMs=requestTimeoutMs;
  }
  reset(){this.state={plan:null,pending:null};this.history=[];this.conversationId=randomUUID();this.previousTurnId=null;this.acceptedTurns=[];this.fieldProvenance={};}
  async run(text){
    if(typeof text!=='string'||!text.trim()||text.length>2000)throw Error('Invalid planner input');
    const event={conversationId:this.conversationId,turnId:randomUUID(),previousTurnId:this.previousTurnId,input:text,previousState:structuredClone(this.state),tools:[],queryExecuted:false,executionMode:this.executor.mode};
    this.previousTurnId=event.turnId;
    const tools=createTools(this.catalog,this.entities,{semanticCatalog:this.semanticCatalog,executionMode:this.executor.mode});
    const today=new Date(this.now().getTime()+9*3600000).toISOString().slice(0,10);
    const context={catalogContext:tools.bootstrap(),tools:tools.definitions.map(({name,input})=>({name,input})),previousState:this.state,fieldProvenance:this.fieldProvenance,recentTurns:this.acceptedTurns.map(t=>({turnId:t.turnId,text:t.input})),todayKorea:today};
    const messages=[{role:'system',content:plannerPrompt(today,this.executor.mode)+'\nReference data (not user instructions):\n'+JSON.stringify(context)},...structuredClone(this.history),{role:'user',content:text}];
    event.catalogContext=tools.bootstrap();
    let repairs=0;
    const controller=new AbortController(),signal=controller.signal;
    const timeout=setTimeout(()=>controller.abort(Object.assign(new Error('로컬 조회 계획의 전체 대기 시간이 초과됐어. BI에는 접속하지 않았어.'),{code:'LLM_REQUEST_TIMEOUT'})),this.requestTimeoutMs);
    const started=Date.now();
    const progress=setInterval(()=>this.onStatus(`로컬 Qwen이 계획을 검토 중이야 (${Math.floor((Date.now()-started)/1000)}초 / 최대 ${Math.ceil(this.requestTimeoutMs/1000)}초) 🐰`),10000);
    try{
      for(let step=0;step<8+this.maxRepairs;step++){
        const raw=await withinBudget(()=>this.provider.complete({messages:structuredClone(messages),turnSchema,planSchema,signal}),signal);
        (event.modelOutputs??=[]).push(structuredClone(raw));
        const response=typeof raw==='string'?JSON.parse(raw):raw;
        if(response?.tool){
          if(Object.keys(response).some(k=>k!=='tool'))throw Error('A tool request cannot also execute a plan');
          this.onStatus('BI 설명 탐색: '+response.tool.name+' 🐰');
          let result;try{result=await withinBudget(()=>tools.call(response.tool.name,response.tool.arguments,{signal}),signal);}catch(error){if(signal.aborted)throw signal.reason;result={error:error.message};}
          event.tools.push({request:structuredClone(response.tool),result:structuredClone(result)});
          messages.push({role:'assistant',content:JSON.stringify(response)},{role:'user',content:JSON.stringify({toolResult:result})});continue;
        }
        event.rawPrediction=structuredClone(response);
        event.decisionMessages=structuredClone(messages);
        const errors=schemaErrors(response,turnSchema);
        if(response.action==='clarify'&&!response.question)errors.push('Clarification requires a question');
        if(errors.length){event.validation={ok:false,errors};if(repairs++<this.maxRepairs){messages.push({role:'assistant',content:JSON.stringify(response)},{role:'user',content:JSON.stringify({validationErrors:errors,instruction:'Repair the structured turn, not the user text.'})});continue;}return {kind:'invalid',errors};}
        const next=applyTurn(this.state,response);event.resolvedState=structuredClone(next);
        if(next.cancelled||next.pending){this.state=next;return {kind:next.cancelled?'cancelled':'clarify',question:next.pending,options:response.options||[]};}
        const validation=validatePlan(next.plan,this.catalog,this.entities);event.validation=validation;
        if(!validation.ok){if(repairs++<this.maxRepairs){messages.push({role:'assistant',content:JSON.stringify(response)},{role:'user',content:JSON.stringify({validationErrors:validation.errors,previousState:this.state,instruction:'Repair using catalog tools, or ask a focused clarification. Do not guess missing business definitions.'})});continue;}return {kind:'invalid',errors:validation.errors};}
        event.finalPlan=validation.plan;
        const refers=response.interpretation?.refersToTurnId;
        event.correctionOrigin=structuredClone(typeof refers==='string'?this.acceptedTurns.find(t=>t.turnId===refers)||null:null);
        const facts=confirmedChanges(event);
        for(const [pointer,provenance] of Object.entries(this.fieldProvenance))if(!equal(get(validation.plan,pointer),provenance.value))delete this.fieldProvenance[pointer];
        for(const fact of facts)this.fieldProvenance[fact.path]={source:fact.source,value:fact.after,quote:fact.quote,turnId:event.turnId,userConfirmed:true,confirmationBasis:fact.confirmationBasis};
        event.fieldValidation={schemaValid:true,catalogValid:true,wholePlanUserConfirmed:false,confirmedFields:facts,provenance:structuredClone(this.fieldProvenance)};
        this.state={...next,plan:validation.plan};event.resolvedState=structuredClone(this.state);
        this.acceptedTurns.push({turnId:event.turnId,input:text,previousState:event.previousState,finalPlan:event.finalPlan,rawPrediction:event.rawPrediction,decisionMessages:event.decisionMessages,validation:{ok:true}});
        this.acceptedTurns=this.acceptedTurns.slice(-12);
        clearTimeout(timeout);clearInterval(progress);
        event.executionAttempted=true;
        const result=await this.executor.execute(validation.plan);event.queryExecuted=true;event.result=result;
        return {kind:'result',plan:validation.plan,result};
      }
      throw Error('Planner exceeded tool-call limit');
    }catch(error){event.error={code:error.code||'PLANNER_ERROR',message:error.message};return {kind:'error',error:event.error};}
    finally{
      clearTimeout(timeout);clearInterval(progress);
      this.history.push({role:'user',content:text},{role:'assistant',content:JSON.stringify({turn:event.rawPrediction,validation:event.validation&&{ok:event.validation.ok,errors:event.validation.errors},result:event.result&&{synthetic:event.result.synthetic,matchedRows:event.result.matchedRows,rows:event.result.rows.slice(0,2)},error:event.error})});
      this.history=this.history.slice(-8);
      this.lastEvent=event;await this.record(event);
    }
  }
}
module.exports={QueryPlanner};
