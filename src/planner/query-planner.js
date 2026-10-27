// LEGACY DISABLED 2026-10-27: preserved during Gemini migration.
// const {randomUUID}=require('crypto');
// const {createTools}=require('./bi-tool-catalog');
// const {applyTurn}=require('./dialogue-state');
// const {validatePlan,schemaErrors}=require('./query-validator');
// const turnSchema=require('./turn-schema.json');
// const planSchema=require('./plan-schema.json');
// const {get,equal}=require('../learning/json-fields');
// const {confirmedChanges}=require('../learning/corrections');
// const {withinBudget}=require('./request-budget');
// const {turnContract,toolContract}=require('./conversation-contract');
// const {conversationMessages,biContext}=require('./conversation-context');
// const {validateClarification}=require('./clarification');
// const {capabilitySummary}=require('./catalog-capabilities');
// const {appendToolExchange,appendValidationFeedback,toolRequestKey}=require('./tool-messages');
// // The provider is injected. A scripted provider tests plumbing, not language understanding.
// class QueryPlanner{
//   constructor({provider,catalog,entities=[],executor,semanticCatalog,record=async()=>{},now=()=>new Date(),onStatus=()=>{},maxRepairs=2,requestTimeoutMs=120000}){
//     if(!['fake','live'].includes(executor.mode))throw Error('A registered fake or live executor is required');
//     this.provider=provider;this.catalog=catalog;this.entities=entities;this.executor=executor;this.record=record;this.now=now;this.state={plan:null,pending:null};this.conversationId=randomUUID();this.previousTurnId=null;
//     this.history=[];
//     this.capabilities=capabilitySummary(catalog);
//     this.onStatus=onStatus;this.maxRepairs=maxRepairs;
//     this.semanticCatalog=semanticCatalog;this.acceptedTurns=[];this.fieldProvenance={};
//     this.requestTimeoutMs=requestTimeoutMs;
//   }
//   reset(){this.state={plan:null,pending:null};this.history=[];this.conversationId=randomUUID();this.previousTurnId=null;this.acceptedTurns=[];this.fieldProvenance={};}
//   rememberExchange(text,message){
//     this.history.push({role:'user',content:text},{role:'assistant',content:message});
//     this.history=this.history.slice(-8);
//   }
//   async run(text,{initialResponse,initialMessages,startedAt=Date.now(),signal:parentSignal}={}){
//     if(typeof text!=='string'||!text.trim()||text.length>2000)throw Error('Invalid planner input');
//     const event={conversationId:this.conversationId,turnId:randomUUID(),previousTurnId:this.previousTurnId,input:text,previousState:structuredClone(this.state),tools:[],queryExecuted:false,executionMode:this.executor.mode};
//     this.previousTurnId=event.turnId;
//     const tools=createTools(this.catalog,this.entities,{semanticCatalog:this.semanticCatalog,executionMode:this.executor.mode,valueSearch:this.executor.searchValues});
//     const toolDefinitions=tools.definitions.filter(d=>!['listFields','searchTarget'].includes(d.name));
//     const messages=initialMessages?structuredClone(initialMessages):conversationMessages(this,text,tools);
//     event.catalogContext={executionMode:this.executor.mode,protocol:'native_function_calls',contextCharacters:messages[0].content.length,toolDefinitions:toolDefinitions.map(({name,description,input})=>({name,description,input}))};
//     event.attempts=[];
//     let outcome,stage='response';
//     const finish=result=>{outcome=result;return result;};
//     const failures=new Set();
//     const repair=(response,errors,stage)=>{
//       event.validation={ok:false,errors};
//       const fingerprint=JSON.stringify([response,errors]);
//       const repeated=failures.has(fingerprint);failures.add(fingerprint);
//       if(repeated||repairs++>=this.maxRepairs)return false;
//       appendValidationFeedback(messages,response,stage,errors);
//       return true;
//     };
//     let repairs=0;
//     const controller=new AbortController(),signal=parentSignal?AbortSignal.any([controller.signal,parentSignal]):controller.signal;
//     const timeout=setTimeout(()=>controller.abort(Object.assign(new Error('로컬 조회 계획의 전체 대기 시간이 초과됐어. BI에는 접속하지 않았어.'),{code:'LLM_REQUEST_TIMEOUT'})),this.requestTimeoutMs);
//     const started=Date.now();
//     const progress=setInterval(()=>this.onStatus(`로컬 Qwen이 계획을 검토 중이야 (${Math.floor((Date.now()-started)/1000)}초 / 최대 ${Math.ceil(this.requestTimeoutMs/1000)}초) 🐰`),10000);
//     try{
//       for(let step=0;step<8+this.maxRepairs;step++){
//         stage='response';
//         const attemptStarted=Date.now();
//         // Retain the actual last model input even when the turn ends in a tool
//         // loop or parse failure, before a final plan prediction exists.
//         event.decisionMessages=structuredClone(messages);
//         const raw=step===0&&initialResponse!==undefined?initialResponse:await withinBudget(()=>this.provider.complete({messages:structuredClone(messages),turnSchema,planSchema,toolDefinitions,signal,maxTokens:800}),signal);
//         (event.modelOutputs??=[]).push(structuredClone(raw));
//         const response=typeof raw==='string'?JSON.parse(raw):raw;
//         const attempt={step,response:structuredClone(response),stage:'response',durationMs:step===0&&initialResponse!==undefined?Date.now()-startedAt:Date.now()-attemptStarted};event.attempts.push(attempt);
//         if(response?.tool){
//           if(Object.keys(response).some(k=>k!=='tool'))throw Error('A tool request cannot also execute a plan');
//           stage='tool';
//           attempt.stage='tool';
//           const definition=tools.definitions.find(d=>d.name===response.tool.name);
//           const toolErrors=definition?schemaErrors(response.tool,toolContract(definition)):['Unknown or unavailable tool'];
//           if(toolErrors.length){attempt.errors=toolErrors;if(repair(response,toolErrors,'tool'))continue;return finish({kind:'invalid',errors:toolErrors});}
//           const previousCall=event.tools.find(t=>toolRequestKey(t.request)===toolRequestKey(response.tool));
//           if(previousCall){
//             attempt.errors=['Identical tool request repeated'];
//             appendToolExchange(messages,response.tool,previousCall.result,{cached:true,callId:raw?.toolCallId,previousCallId:previousCall.callId});
//             if(repair(response,attempt.errors,'tool'))continue;
//             return finish({kind:'invalid',errors:attempt.errors});
//           }
//           this.onStatus('BI 설명 탐색: '+response.tool.name+' 🐰');
//           const toolStarted=Date.now();
//           if(response.tool.name==='searchValues')event.biExplorationAttempted=true;
//           let result;try{result=await withinBudget(()=>tools.call(response.tool.name,response.tool.arguments,{signal}),signal);}catch(error){if(signal.aborted)throw signal.reason;result={error:error.message,code:error.code||'TOOL_ERROR'};}
//           attempt.stage='tool';attempt.toolDurationMs=Date.now()-toolStarted;
//           const callId=appendToolExchange(messages,response.tool,result,{callId:raw?.toolCallId});
//           event.tools.push({callId,request:structuredClone(response.tool),result:structuredClone(result),durationMs:attempt.toolDurationMs});continue;
//         }
//         event.rawPrediction=structuredClone(response);
//         event.decisionMessages=structuredClone(messages);
//         stage='contract';
//         const branch=turnContract().oneOf.find(b=>b.properties.action.enum.includes(response?.action));
//         const errors=branch?schemaErrors(response,branch):[typeof response?.unparsed==='string'?'The terminal response must be a JSON object with action reply/new/modify/add/remove/confirm/cancel/clarify. To explore evidence, call an advertised API function.':'Unknown response action'];
//         if(response?.action==='confirm'&&this.state.pendingClarification?.options?.length)errors.push('Resolve the pending choice with an explicit plan patch before executing');
//         if(!errors.length&&response.action==='clarify')errors.push(...validateClarification(response,this.catalog,this.entities,[...(this.state.pendingClarification?.evidence||[]),...event.tools]));
//         attempt.stage='contract';attempt.errors=errors;
//         if(errors.length){if(repair(response,errors,'contract'))continue;return finish({kind:'invalid',errors});}
//         if(response.action==='reply')return finish({kind:'reply',message:response.message});
//         const next=applyTurn(this.state,response);event.resolvedState=structuredClone(next);
//         if(next.cancelled||next.pending){this.state={...next,lastFailedQuery:null};if(next.pending)this.state.pendingClarification.evidence=structuredClone(event.tools);return finish({kind:next.cancelled?'cancelled':'clarify',question:next.pending,options:response.options||[]});}
//         stage='plan';
//         const validation=validatePlan(next.plan,this.catalog,this.entities);event.validation=validation;
//         attempt.stage='plan';attempt.errors=validation.errors;
//         if(!validation.ok){if(repair(response,validation.errors,'plan'))continue;return finish({kind:'invalid',errors:validation.errors});}
//         event.finalPlan=validation.plan;
//         event.sharePlans=validation.sharePlans;
//         const refers=response.interpretation?.refersToTurnId;
//         event.correctionOrigin=structuredClone(typeof refers==='string'?this.acceptedTurns.find(t=>t.turnId===refers)||null:null);
//         const facts=confirmedChanges(event);
//         const provenance=structuredClone(this.fieldProvenance);
//         for(const [pointer,source] of Object.entries(provenance))if(!equal(get(validation.plan,pointer),source.value))delete provenance[pointer];
//         for(const fact of facts)provenance[fact.path]={source:fact.source,value:fact.after,quote:fact.quote,turnId:event.turnId,userConfirmed:true,confirmationBasis:fact.confirmationBasis};
//         event.fieldValidation={schemaValid:true,catalogValid:true,wholePlanUserConfirmed:false,confirmedFields:facts,provenance};
//         clearTimeout(timeout);clearInterval(progress);
//         event.executionAttempted=true;
//         stage='execution';
//         const executionStarted=Date.now();
//         const result=await this.executor.execute(validation.plan);event.queryExecuted=true;event.result=result;
//         this.state={...next,plan:validation.plan,lastFailedQuery:null};this.fieldProvenance=provenance;
//         event.executionDurationMs=Date.now()-executionStarted;this.state.biContext=biContext(event,this.catalog,result);
//         this.acceptedTurns.push({turnId:event.turnId,input:text,previousState:event.previousState,finalPlan:event.finalPlan,rawPrediction:event.rawPrediction,decisionMessages:event.decisionMessages,validation:{ok:true}});
//         this.acceptedTurns=this.acceptedTurns.slice(-12);
//         return finish({kind:'result',plan:validation.plan,result});
//       }
//       throw Error('Planner exceeded tool-call limit');
//     }catch(error){event.error={code:error.code||'PLANNER_ERROR',message:error.message};return finish({kind:'error',error:event.error});}
//     finally{
//       clearTimeout(timeout);clearInterval(progress);
//       if(['invalid','error'].includes(outcome?.kind)&&this.conversationId===event.conversationId){
//         // Only a compact failure status crosses turns. Raw plans, tool outputs and
//         // validation errors stay in the diagnostic event, never dialogue history.
//         this.state.lastFailedQuery={question:text,stage,code:outcome.kind==='invalid'?'PLAN_VALIDATION_FAILED':event.error.code,queryExecuted:event.queryExecuted};
//       }
//       event.totalDurationMs=Date.now()-startedAt;event.resolvedState=structuredClone(this.state);
//       this.lastEvent=event;await this.record(event);
//     }
//   }
// }
// module.exports={QueryPlanner};
throw Object.assign(new Error('Legacy local LLM path is disabled during Gemini migration.'), {code:'LEGACY_LLM_DISABLED'});
