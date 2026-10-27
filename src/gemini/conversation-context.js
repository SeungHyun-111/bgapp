// Project local full-fidelity history into interpretation-only Gemini state.
// Never spread a turn/model response: results, answers and source rows stay local.
const planKeys=new Set(['period','start','endExclusive','timezone','target','targets','type','value','values','requestedName','status','filters','field','operator','conditions','requiredFields','datasets','dataset','id','groupBy','unit','calculations','label','formula','format','decimals','scope','arguments','direction','ties','metricLabel','outputFormat','sort','having','limit','includeTies']);
function planState(value){
  if(Array.isArray(value))return value.map(planState);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>planKeys.has(key)).map(([key,v])=>[key,planState(v)]));
  return value;
}
function clarificationState(pending){
  return pending?{turnId:pending.turnId,originalQuestion:pending.originalQuestion,question:pending.question,partialPlan:planState(pending.partialPlan||null)}:null;
}
function validatedState(turn){
  return {
    turnId:turn.turnId,question:turn.question,
    action:turn.gemini?.action,
    plan:turn.validation?.ok?planState(turn.gemini?.plan||null):null,
    validation:{ok:!!turn.validation?.ok,executionAllowed:!!turn.validation?.executionAllowed},
    executionStatus:turn.actualExecution,
  };
}
function branchContext(branch,{latestOnly=false}={}){
  const turns=branch?.turns||[];
  return (latestOnly?turns.slice(-1):turns).map(validatedState);
}
module.exports={branchContext,clarificationState};
