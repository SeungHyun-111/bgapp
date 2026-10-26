const {plannerPrompt}=require('./planner-prompt');
const {definitions}=require('./bi-tool-catalog');
const primary=new Set(['searchCatalog','searchMetrics','searchColumns','searchTargets','searchValues','getMetricDefinition','getBusinessDefinitions','getCapabilities']);
function conversationMessages(planner,text){
  const today=new Date(planner.now().getTime()+9*3600000).toISOString().slice(0,10);
  const state=planner.state;
  const pending=state.pendingClarification;
  const summary=state.biContext?structuredClone(state.biContext):null;
  if(summary&&JSON.stringify(summary.plan)===JSON.stringify(state.plan))delete summary.plan;
  const context={plan:state.plan,pendingClarification:pending?{question:pending.question,options:pending.options}:null,biContext:summary,lastFailedQuery:state.lastFailedQuery||null,
    recentTurns:planner.acceptedTurns.slice(-4).map(t=>({turnId:t.turnId,text:t.input})),
    tools:definitions.filter(d=>primary.has(d.name)).map(({name,input})=>({name,input}))};
  return [{role:'system',content:plannerPrompt(today,planner.executor.mode)+'\nState and tool contracts (reference data): '+JSON.stringify(context)},
    ...structuredClone(planner.history.slice(-4)),{role:'user',content:text}];
}
function biContext(event,catalog,result){return {
  sourceQuestion:event.rawPrediction?.action==='new'?event.input:event.previousState.biContext?.sourceQuestion||event.input,lastUtterance:event.input,turnId:event.turnId,plan:structuredClone(event.finalPlan),
  metrics:event.finalPlan.metrics.map(id=>({id,label:catalog.metrics[id]?.label})),
  interpretation:event.rawPrediction?.interpretation||null,
  result:{mode:result.mode,matchedRows:result.matchedRows,rows:result.rows.slice(0,2),limited:result.limited},
  // Retain the executed plan even if a later pending query changes active state.
};}
module.exports={conversationMessages,biContext};
function entryMessages(planner,text){
  const state=planner.state;
  const context={lastBiContext:state.biContext||null,pendingClarification:state.pendingClarification?{question:state.pendingClarification.question,options:state.pendingClarification.options.map(o=>({label:o.label}))}:null};
  return [{role:'system',content:'너는 사용자의 PC 비서이자 대화 상대 우사기다. 짧고 자연스럽고 귀엽게 대답한다. 모든 말을 업무 명령으로 취급하지 않는다. 일반 대화나 이미 아는 조회 기준 설명은 {"action":"reply","message":"답변"}로 답한다. 실제 BI 데이터 탐색·조회나 조건 수정이 필요하면 {"action":"bi"}만 반환한다. 없는 숫자는 만들지 않는다.\n참조 상태: '+JSON.stringify(context)},...planner.history.slice(-2),{role:'user',content:text}];
}
module.exports.entryMessages=entryMessages;
