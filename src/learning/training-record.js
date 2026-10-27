// Only explicit review can turn an execution candidate into a training answer.
const clone=value=>structuredClone(value);
function labelsFromPlan(plan){
  if(!plan)return null;
  const metrics=new Set(),operations=new Set(),targets=[];
  function visit(value){
    if(!value||typeof value!=='object')return;
    if(typeof value.metric==='string')metrics.add(value.metric);
    if(value.operator)operations.add(value.operator);
    for(const child of Object.values(value)){
      if(Array.isArray(child))child.forEach(visit);else visit(child);
    }
  }
  visit(plan);
  for(const scope of [plan,...(plan.datasets||[])]){
    for(const target of scope.targets||(scope.target?[scope.target]:[]))targets.push(clone(target));
  }
  return {intent:'bi_query',metrics:[...metrics],operations:[...operations],entityTypes:[...new Set(targets.map(t=>t.type))],targets};
}
function finalizeTrainingRecord(record){
  record.trainingSchemaVersion=1;
  record.question=record.input;
  record.validator=clone(record.validation||{ok:false,reason:'validation_not_completed'});
  record.execution={attempted:!!record.executionAttempted,sourceQuerySucceeded:!!record.queryExecuted,succeeded:record.stage==='completed'&&record.action==='execute',error:record.error||null};
  record.candidatePlan=clone(record.validator.ok?record.geminiPlan||null:null);
  record.finalPlan=null;
  record.labels=null;
  record.confirmed=false;
  record.confirmation={status:'unreviewed',reason:null};
  return record;
}
module.exports={finalizeTrainingRecord,labelsFromPlan};
