const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('path');
const {QueryPlanner}=require('../src/planner/query-planner');
const {emptyPlan}=require('../src/planner/dialogue-state');
const {loadPlannerCatalog}=require('../src/planner/catalog-loader');
const {createPlannerDialogue}=require('../src/planner/chat-dialogue');
const {SemanticCatalog}=require('../src/planner/semantic-catalog');
const catalog=loadPlannerCatalog(path.resolve(__dirname,'../data'));
const entities=require('../data/bi-entity-catalog.json').entities;
const plan=()=>({...emptyPlan(),operation:'aggregate',metrics:['sales'],filters:[{field:'BO[방송일시]',operator:'gte',value:'2026-10-01'},{field:'BO[방송일시]',operator:'lt',value:'2026-11-01'}]});

test('BI failure preserves last result, active plan and clarification; failed proposal stays separate',async()=>{
  const responses=[{action:'new',patch:plan()},{action:'modify',patch:{metrics:['profit']}}];let calls=0;
  const planner=new QueryPlanner({catalog,entities,provider:{complete:async()=>responses.shift()},executor:{mode:'live',execute:async()=>{if(calls++)throw Object.assign(Error('BI offline'),{code:'BI_QUERY_FAILED'});return {mode:'live',synthetic:false,rows:[{sales:123}],matchedRows:1};}}});
  await planner.run('first');
  planner.state.pending='choose';planner.state.pendingClarification={question:'choose',options:[{label:'profit',patch:{metrics:['profit']}}]};
  const before=structuredClone(planner.state);
  const result=await planner.run('correction');
  assert.equal(result.error.code,'BI_QUERY_FAILED');assert.deepEqual(planner.state.plan,before.plan);
  assert.deepEqual(planner.state.biContext,before.biContext);assert.deepEqual(planner.state.pendingClarification,before.pendingClarification);
  assert.deepEqual(planner.state.lastFailedQuery.plan.metrics,['profit']);
});

test('real rows are published before explanation and survive explanation and log-write failure',async()=>{
  let published=false;const events=[];
  const client={complete:async args=>{
    if(args.purpose==='result-explanation'){assert(published);throw Error('Explanation failed');}
    return {action:'new',patch:plan()};
  }};
  const dialogue=createPlannerDialogue({directory:path.resolve(__dirname,'../data'),learning:false,provider:client,
    query:async()=>({results:[{tables:[{rows:[{'[__out0]':123,'[__matched]':1}]}]}]}),
    onProgress:async e=>{published=true;events.push(e);},store:{file:'unused',appendLine:async()=>{throw Error('disk full');}}});
  const result=await dialogue.execute('question',{requestId:'request-1'});
  assert.equal(events[0].requestId,'request-1');assert.equal(events[0].biResult.rawRows[0].sales,123);
  assert.equal(result.biResult.rawRows[0].sales,123);assert.equal(result.biResult.synthetic,false);
  assert.equal(result.narration.ok,false);assert(result.loggingError);
  assert.equal(dialogue.planner.state.biContext.result.rows[0].sales,123);
});

test('semantic search judges one bounded local shortlist per page, without selecting the metric',async()=>{
  let calls=0;const metrics=Object.fromEntries(Array.from({length:100},(_,i)=>['m'+i,{id:'m'+i,label:'metric '+i,businessMeaning:'description '+i}]));
  const semantic=new SemanticCatalog({catalog:{metrics,tables:[]},provider:{complete:async args=>{calls++;const input=JSON.parse(args.messages[1].content);assert(input.documents.length<=16);return {candidates:[{id:input.documents[0].id,reason:'candidate only'}]};}}});
  const result=await semantic.search({query:'metric 73'});
  assert.equal(calls,1);assert.equal(result.automaticSelection,false);assert.equal(result.retrieval.examined,16);assert(result.hasMore);
  await semantic.search({query:'metric 73'});assert.equal(calls,1);
});
