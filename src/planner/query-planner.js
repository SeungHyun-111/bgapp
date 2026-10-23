const {randomUUID}=require('crypto');
const {createTools}=require('./bi-tool-catalog');
const {applyTurn}=require('./dialogue-state');
const {validatePlan,schemaErrors}=require('./query-validator');
const turnSchema=require('./turn-schema.json');
const planSchema=require('./plan-schema.json');
const {plannerPrompt}=require('./planner-prompt');
// The provider is injected. A scripted provider tests plumbing, not language understanding.
class QueryPlanner{
  constructor({provider,catalog,entities=[],executor,record=async()=>{},now=()=>new Date(),onStatus=()=>{},maxRepairs=0}){
    if(executor.mode!=='fake')throw Error('This sandbox accepts only a fake executor');
    this.provider=provider;this.catalog=catalog;this.entities=entities;this.executor=executor;this.record=record;this.now=now;this.state={plan:null,pending:null};this.conversationId=randomUUID();this.previousTurnId=null;
    this.history=[];
    this.onStatus=onStatus;this.maxRepairs=maxRepairs;
  }
  async run(text){
    if(typeof text!=='string'||!text.trim()||text.length>2000)throw Error('Invalid planner input');
    const event={conversationId:this.conversationId,turnId:randomUUID(),previousTurnId:this.previousTurnId,input:text,previousState:structuredClone(this.state),tools:[],queryExecuted:false,executionMode:this.executor.mode};
    this.previousTurnId=event.turnId;
    const tools=createTools(this.catalog,this.entities);
    const today=new Date(this.now().getTime()+9*3600000).toISOString().slice(0,10);
    const messages=[{role:'system',content:plannerPrompt(today)},...structuredClone(this.history),{role:'user',content:JSON.stringify({text,todayKorea:today,previousState:this.state,tools:tools.definitions})}];
    let repairs=0;
    try{
      for(let step=0;step<8+this.maxRepairs;step++){
        const raw=await this.provider.complete({messages:structuredClone(messages),turnSchema,planSchema});
        (event.modelOutputs??=[]).push(structuredClone(raw));
        const response=typeof raw==='string'?JSON.parse(raw):raw;
        if(response?.tool){
          if(Object.keys(response).some(k=>k!=='tool'))throw Error('A tool request cannot also execute a plan');
          this.onStatus('BI 설명 탐색: '+response.tool.name+' 🐰');
          let result;try{result=await tools.call(response.tool.name,response.tool.arguments);}catch(error){result={error:error.message};}
          event.tools.push({request:structuredClone(response.tool),result:structuredClone(result)});
          messages.push({role:'assistant',content:JSON.stringify(response)},{role:'user',content:JSON.stringify({toolResult:result})});continue;
        }
        event.rawPrediction=structuredClone(response);
        const errors=schemaErrors(response,turnSchema);
        if(response.action==='clarify'&&!response.question)errors.push('Clarification requires a question');
        if(errors.length){event.validation={ok:false,errors};return {kind:'invalid',errors};}
        const next=applyTurn(this.state,response);event.resolvedState=structuredClone(next);
        if(next.cancelled||next.pending){this.state=next;return {kind:next.cancelled?'cancelled':'clarify',question:next.pending,options:response.options||[]};}
        const validation=validatePlan(next.plan,this.catalog,this.entities);event.validation=validation;
        if(!validation.ok){if(repairs++<this.maxRepairs){messages.push({role:'assistant',content:JSON.stringify(response)},{role:'user',content:JSON.stringify({validationErrors:validation.errors,previousState:this.state,instruction:'Repair using catalog tools, or ask a focused clarification. Do not guess missing business definitions.'})});continue;}return {kind:'invalid',errors:validation.errors};}
        this.state=next;event.finalPlan=validation.plan;
        event.queryExecuted=true;
        const result=await this.executor.execute(validation.plan);event.result=result;
        return {kind:'result',plan:validation.plan,result};
      }
      throw Error('Planner exceeded tool-call limit');
    }catch(error){event.error={code:error.code||'PLANNER_ERROR',message:error.message};return {kind:'error',error:event.error};}
    finally{
      this.history.push({role:'user',content:text},{role:'assistant',content:JSON.stringify({turn:event.rawPrediction,validation:event.validation&&{ok:event.validation.ok,errors:event.validation.errors},result:event.result&&{synthetic:true,matchedRows:event.result.matchedRows,rows:event.result.rows.slice(0,2)},error:event.error})});
      this.history=this.history.slice(-8);
      await this.record(event);
    }
  }
}
module.exports={QueryPlanner};
