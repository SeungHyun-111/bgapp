const {randomUUID}=require('crypto');
const {createTools}=require('./bi-tool-catalog');
const {applyTurn}=require('./dialogue-state');
const {validatePlan,schemaErrors}=require('./query-validator');
const turnSchema=require('./turn-schema.json');
const planSchema=require('./plan-schema.json');
const {get,equal}=require('../learning/json-fields');
const {confirmedChanges}=require('../learning/corrections');
const {withinBudget}=require('./request-budget');
const {turnContract,responseContract}=require('./conversation-contract');
const {conversationMessages,biContext}=require('./conversation-context');
const {validateClarification}=require('./clarification');
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
  async run(text,{initialResponse,initialMessages,startedAt=Date.now(),signal:parentSignal}={}){
    if(typeof text!=='string'||!text.trim()||text.length>2000)throw Error('Invalid planner input');
    const event={conversationId:this.conversationId,turnId:randomUUID(),previousTurnId:this.previousTurnId,input:text,previousState:structuredClone(this.state),tools:[],queryExecuted:false,executionMode:this.executor.mode};
    this.previousTurnId=event.turnId;
    const tools=createTools(this.catalog,this.entities,{semanticCatalog:this.semanticCatalog,executionMode:this.executor.mode,valueSearch:this.executor.searchValues});
    const messages=initialMessages?structuredClone(initialMessages):conversationMessages(this,text);
    event.catalogContext={executionMode:this.executor.mode,contextCharacters:messages[0].content.length};
    event.attempts=[];
    const failures=new Set();
    const repair=(response,errors,stage)=>{
      event.validation={ok:false,errors};
      const fingerprint=JSON.stringify([response,errors]);
      const repeated=failures.has(fingerprint);failures.add(fingerprint);
      if(repeated||repairs++>=this.maxRepairs)return false;
      messages.push({role:'assistant',content:JSON.stringify(response)},{role:'user',content:JSON.stringify({validation:{stage,errors},instruction:'Repair your response using context or catalog tools. Do not ask the user to repair JSON. Clarify only missing meaning with a question and catalog-grounded options.'})});
      return true;
    };
    let repairs=0;
    const controller=new AbortController(),signal=parentSignal?AbortSignal.any([controller.signal,parentSignal]):controller.signal;
    const timeout=setTimeout(()=>controller.abort(Object.assign(new Error('로컬 조회 계획의 전체 대기 시간이 초과됐어. BI에는 접속하지 않았어.'),{code:'LLM_REQUEST_TIMEOUT'})),this.requestTimeoutMs);
    const started=Date.now();
    const progress=setInterval(()=>this.onStatus(`로컬 Qwen이 계획을 검토 중이야 (${Math.floor((Date.now()-started)/1000)}초 / 최대 ${Math.ceil(this.requestTimeoutMs/1000)}초) 🐰`),10000);
    try{
      for(let step=0;step<8+this.maxRepairs;step++){
        const attemptStarted=Date.now();
        const raw=step===0&&initialResponse!==undefined?initialResponse:await withinBudget(()=>this.provider.complete({messages:structuredClone(messages),turnSchema,planSchema,responseSchema:responseContract(tools.definitions),signal,maxTokens:800}),signal);
        (event.modelOutputs??=[]).push(structuredClone(raw));
        const response=typeof raw==='string'?JSON.parse(raw):raw;
        const attempt={step,response:structuredClone(response),stage:'response',durationMs:step===0&&initialResponse!==undefined?Date.now()-startedAt:Date.now()-attemptStarted};event.attempts.push(attempt);
        if(response?.tool){
          if(Object.keys(response).some(k=>k!=='tool'))throw Error('A tool request cannot also execute a plan');
          if(event.tools.some(t=>JSON.stringify(t.request)===JSON.stringify(response.tool))){attempt.errors=['Identical tool request repeated'];if(repair(response,attempt.errors,'tool'))continue;return {kind:'invalid',errors:attempt.errors};}
          this.onStatus('BI 설명 탐색: '+response.tool.name+' 🐰');
          const toolStarted=Date.now();
          if(response.tool.name==='searchValues')event.biExplorationAttempted=true;
          let result;try{result=await withinBudget(()=>tools.call(response.tool.name,response.tool.arguments,{signal}),signal);}catch(error){if(signal.aborted)throw signal.reason;result={error:error.message,code:error.code||'TOOL_ERROR'};}
          attempt.stage='tool';attempt.toolDurationMs=Date.now()-toolStarted;
          event.tools.push({request:structuredClone(response.tool),result:structuredClone(result),durationMs:attempt.toolDurationMs});
          messages.push({role:'assistant',content:JSON.stringify(response)},{role:'user',content:JSON.stringify({toolResult:result})});continue;
        }
        event.rawPrediction=structuredClone(response);
        event.decisionMessages=structuredClone(messages);
        const branch=turnContract().oneOf.find(b=>b.properties.action.enum.includes(response?.action));
        const errors=branch?schemaErrors(response,branch):['Unknown response action'];
        if(response?.action==='confirm'&&this.state.pendingClarification?.options?.length)errors.push('Resolve the pending choice with an explicit plan patch before executing');
        if(!errors.length&&response.action==='clarify')errors.push(...validateClarification(response,this.catalog,this.entities,[...(this.state.pendingClarification?.evidence||[]),...event.tools]));
        attempt.stage='contract';attempt.errors=errors;
        if(errors.length){if(repair(response,errors,'contract'))continue;return {kind:'invalid',errors};}
        if(response.action==='reply')return {kind:'reply',message:response.message};
        const next=applyTurn(this.state,response);event.resolvedState=structuredClone(next);
        if(next.cancelled||next.pending){this.state=next;if(next.pending)this.state.pendingClarification.evidence=structuredClone(event.tools);return {kind:next.cancelled?'cancelled':'clarify',question:next.pending,options:response.options||[]};}
        const validation=validatePlan(next.plan,this.catalog,this.entities);event.validation=validation;
        attempt.stage='plan';attempt.errors=validation.errors;
        if(!validation.ok){if(repair(response,validation.errors,'plan'))continue;return {kind:'invalid',errors:validation.errors};}
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
        const executionStarted=Date.now();
        const result=await this.executor.execute(validation.plan);event.queryExecuted=true;event.result=result;
        event.executionDurationMs=Date.now()-executionStarted;this.state.biContext=biContext(event,this.catalog,result);
        return {kind:'result',plan:validation.plan,result};
      }
      throw Error('Planner exceeded tool-call limit');
    }catch(error){event.error={code:error.code||'PLANNER_ERROR',message:error.message};return {kind:'error',error:event.error};}
    finally{
      clearTimeout(timeout);clearInterval(progress);
      event.totalDurationMs=Date.now()-startedAt;event.resolvedState=structuredClone(this.state);
      this.history.push({role:'user',content:text},{role:'assistant',content:JSON.stringify({turn:event.rawPrediction,validation:event.validation&&{ok:event.validation.ok,errors:event.validation.errors},result:event.result&&{synthetic:event.result.synthetic,matchedRows:event.result.matchedRows,rows:event.result.rows.slice(0,2)},error:event.error})});
      this.history=this.history.slice(-8);
      this.lastEvent=event;await this.record(event);
    }
  }
}
module.exports={QueryPlanner};
