const copy=value=>structuredClone(value);
const emptyPlan=()=>({operation:'list',target:null,share:null,fields:[],metrics:[],filters:[],groupBy:[],sort:[],limit:30});
// State transitions operate on a model-generated structured patch, never on text.
function applyTurn(previous,turn){
  if(turn.action==='cancel')return {plan:null,pending:null,cancelled:true};
  if(turn.action==='clarify')return {plan:{...copy(previous.plan||emptyPlan()),...copy(turn.patch||{})},pending:turn.question};
  if(turn.action==='confirm')return {...copy(previous),pending:null};
  if(!['new','modify','add','remove'].includes(turn.action))throw Error('Unknown dialogue action');
  const plan=turn.action==='new'?emptyPlan():copy(previous.plan||emptyPlan());
  if(turn.action==='remove'){
    for(const key of turn.remove||[]){
      if(!Object.hasOwn(emptyPlan(),key))throw Error('Unknown removal key');
      plan[key]=copy(emptyPlan()[key]);
    }
    for(const field of turn.removeFilters||[])plan.filters=plan.filters.filter(f=>f.field!==field);
  }
  for(const [key,value] of Object.entries(turn.patch||{})){
    if(!Object.hasOwn(emptyPlan(),key))throw Error('Unknown plan field');
    if(turn.action==='add'&&Array.isArray(plan[key])&&Array.isArray(value)){
      const items=[...plan[key],...value];plan[key]=[...new Map(items.map(x=>[JSON.stringify(x),x])).values()];
    }else if(key==='filters'&&turn.action==='modify'){
      const changed=new Set(value.map(f=>f.field));plan.filters=[...plan.filters.filter(f=>!changed.has(f.field)),...copy(value)];
    }else plan[key]=copy(value);
  }
  return {plan,pending:null};
}
module.exports={applyTurn,emptyPlan};
