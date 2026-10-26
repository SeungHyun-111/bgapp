const {plannerPrompt}=require('./planner-prompt');
const {definitions}=require('./bi-tool-catalog');
const primary=new Set(['searchCatalog','searchMetrics','searchColumns','searchTargets','searchValues','getMetricDefinition','getBusinessDefinitions','getCapabilities']);
function conversationMessages(planner,text){
  const today=new Date(planner.now().getTime()+9*3600000).toISOString().slice(0,10);
  const state=planner.state;
  const pending=state.pendingClarification;
  const summary=state.biContext?structuredClone(state.biContext):null;
  if(summary&&JSON.stringify(summary.plan)===JSON.stringify(state.plan))delete summary.plan;
  const context={plan:state.plan,pendingClarification:pending?{question:pending.question,options:pending.options}:null,biContext:summary,
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
