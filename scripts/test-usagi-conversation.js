const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('path');
const {loadPlannerCatalog}=require('../src/planner/catalog-loader');
const {QueryPlanner}=require('../src/planner/query-planner');
const {ConversationOrchestrator}=require('../src/planner/conversation-orchestrator');
const {conversationMessages}=require('../src/planner/conversation-context');
const {emptyPlan}=require('../src/planner/dialogue-state');
const {schemaErrors}=require('../src/planner/query-validator');
const {turnContract}=require('../src/planner/conversation-contract');
const {plannerPrompt}=require('../src/planner/planner-prompt');
const catalog=loadPlannerCatalog(path.resolve(__dirname,'../data'));
const entities=require('../data/bi-entity-catalog.json').entities;
const plan=()=>({...emptyPlan(),operation:'aggregate',metrics:['sales'],target:{kind:'brand',value:'레이델'},filters:[{field:'BO[방송일시]',operator:'gte',value:'2026-09-01'},{field:'BO[방송일시]',operator:'lt',value:'2026-11-01'}],groupBy:[{field:'BO[방송일시]',unit:'month'}]});
function fixture(responses){
  const messages=[];let executions=0;
  const client={complete:async args=>{messages.push(args.messages);const response=responses.shift();if(!response)throw Error('Unexpected model call');return response;}};
  const planner=new QueryPlanner({catalog,entities,provider:client,executor:{mode:'live',execute:async()=>{executions++;return {mode:'live',synthetic:false,rows:[],matchedRows:0};}},now:()=>new Date('2026-10-26T00:00:00Z')});
  const engine=new ConversationOrchestrator({planner,client});
  return {planner,engine,messages,get executions(){return executions;}};
}
test('normal conversation answers in one Qwen call without entering the planner or reading catalog',async()=>{
  const f=fixture([{action:'reply',message:'우응, 잠깐 쉬었다 하자 🐰'}]);
  f.planner.run=()=>{throw Error('General chat must not enter BI planner');};
  const result=await f.engine.run('오늘 일하기 싫다');
  assert.equal(result.kind,'reply');assert.equal(f.executions,0);assert.equal(f.messages.length,1);
  assert(!f.messages[0][0].content.includes('commonMetrics'));
  assert(!f.messages[0][0].content.includes('businessDefinitions'));
  assert(!plannerPrompt('2026-10-26','live').includes('가짜 데이터'));
});
test('BI interpretation survives explanation without requery and a later metric correction changes only that metric',async()=>{
  const f=fixture([{action:'new',patch:plan()},{action:'reply',message:'아까는 예상취급액 기준으로 봤어 🐰'},{action:'modify',patch:{metrics:['profit']}}]);
  await f.engine.run('브랜드 두 달 실적');
  const before=structuredClone(f.planner.state.plan);
  await f.engine.run('아까 쓴 기준 뭐였지?');
  assert.equal(f.executions,1);
  assert(f.messages[1][0].content.includes('예상취급액'));
  await f.engine.run('그럼 한계이익으로');
  assert.equal(f.executions,2);
  assert.deepEqual(f.planner.state.plan,{...before,metrics:['profit']});
  assert.equal(f.planner.state.biContext.sourceQuestion,'브랜드 두 달 실적');
  assert.equal(f.planner.state.biContext.lastUtterance,'그럼 한계이익으로');
});
test('catalog-grounded choices persist through chat; Qwen interprets numbered or natural answers',async()=>{
  for(const answer of ['2번','두 번째 거','한계이익','이익으로 봐']){
    const f=fixture([{action:'new',patch:plan()},
      {tool:{name:'getMetricDefinition',arguments:{id:'sales'}}},
      {tool:{name:'getMetricDefinition',arguments:{id:'profit'}}},
      {action:'clarify',question:'어떤 실적을 볼까?',options:[{label:'예상취급액',patch:{metrics:['sales']}},{label:'한계이익',patch:{metrics:['profit']}}]},
      {action:'reply',message:'하! 듣고 있어 🐰'},
      {action:'modify',patch:{metrics:['profit']}}]);
    await f.engine.run('브랜드 두 달');await f.engine.run('기준을 골라볼까');
    assert.equal(f.executions,1);assert.equal(f.planner.state.pendingClarification.options.length,2);
    await f.engine.run('잠깐만');assert(f.planner.state.pendingClarification);
    const result=await f.engine.run(answer);
    assert.equal(result.kind,'result');assert.equal(f.executions,2);
    assert.deepEqual(result.plan.filters,plan().filters);assert.deepEqual(result.plan.target,plan().target);
    assert.deepEqual(result.plan.metrics,['profit']);assert.equal(f.planner.state.pendingClarification,null);
  }
});
test('unsupported clarification candidates are rejected before state or execution changes',async()=>{
  const f=fixture([{action:'clarify',question:'골라줘',options:[{label:'없는 지표',patch:{metrics:['invented']}}]},{action:'reply',message:'아? 관련 항목을 아직 못 찾았어. 무엇을 확인하고 싶은지 더 알려줄래?'}]);
  const result=await f.engine.run('모호한 질문');
  assert.equal(result.kind,'reply');assert.equal(f.executions,0);assert.equal(f.planner.state.plan,null);
  assert(f.planner.lastEvent.attempts[0].errors.some(e=>e.includes('invented')));
});
test('repeated invalid responses stop early, record every error, and leave state intact',async()=>{
  const invalid={action:'clarify',patch:{fields:['broadcast_count'],metrics:[]}};
  const f=fixture([invalid,invalid]);const result=await f.engine.run('어떤 질문');
  assert.equal(result.kind,'invalid');assert.equal(f.messages.length,2);assert.equal(f.executions,0);
  assert(f.planner.lastEvent.attempts.every(a=>a.errors.some(e=>e.includes('question'))));
  assert.equal(f.planner.lastEvent.resolvedState.plan,null);
});
test('new queries require explicit operation and complete plan; no list default substitutes for missing intent',()=>{
  const schema=turnContract().oneOf.find(b=>b.properties.action.enum.includes('new'));
  assert(schemaErrors({action:'new',patch:{target:{kind:'organization',value:'가전팀'},metrics:[],fields:[]}},schema).length);
  assert.equal(schemaErrors({action:'new',patch:plan()},schema).length,0);
  const f=fixture([]);const initial=conversationMessages(f.planner,'test')[0].content;
  assert(initial.length<2500);assert(!initial.includes('organization_weighted_share'));
});

test('candidate lookup retrieves a standard organization without forcing a target normalization rule',async()=>{
  const tools=require('../src/planner/bi-tool-catalog').createTools(catalog,entities);
  const results=await tools.call('searchTargets',{kind:'organization',query:'가전팀'});
  assert(results.some(e=>e.value==='가전'));
  const p={...plan(),target:{kind:'organization',value:'가전팀'}};
  assert.equal(require('../src/planner/query-validator').validatePlan(p,catalog,entities).ok,false);
});
