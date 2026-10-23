const test=require('node:test');
const assert=require('node:assert/strict');
const {catalog,rows,entities,filters}=require('./demo-bi-planner');
const {emptyPlan,applyTurn}=require('../src/planner/dialogue-state');
const {validatePlan}=require('../src/planner/query-validator');
const {createFakeExecutor}=require('../src/planner/fake-bi-executor');
const {QueryPlanner}=require('../src/planner/query-planner');
const {createTools}=require('../src/planner/bi-tool-catalog');
const plan=()=>({...emptyPlan(),operation:'aggregate',metrics:['weighted_minutes'],filters,target:{kind:'brand',value:'레이델'}});
test('catalog preserves observed columns, evidence and opaque formulas',()=>{
  assert.equal(catalog.tables[0].columns.length,127);assert.equal(catalog.captures.queryCount,42);
  assert.equal(catalog.metrics.commission_rate.aggregation,'raw');
  assert(Object.values(catalog.metrics).filter(m=>m.aggregation==='model-measure').every(m=>!m.expression.includes('=')));
  assert(catalog.unresolved.some(x=>x.includes('취소')));
});
test('generic tools discover fields, metric definition and exact bracket brands',async()=>{
  const tools=createTools(catalog,entities);
  assert((await tools.call('listFields',{query:'방송일시'})).length);
  assert.equal((await tools.call('getMetricDefinition',{id:'weighted_minutes'})).aggregation,'sum');
  assert.deepEqual(await tools.call('searchTarget',{kind:'brand',query:'레이델'}),[{kind:'brand',value:'레이델'}]);
  await assert.rejects(tools.call('runDax',{text:'arbitrary'}));
});
test('new/add/modify/remove/confirm/cancel operate on plans without reinterpreting text',()=>{
  const original={plan:plan(),pending:null};
  const added=applyTurn(original,{action:'add',patch:{metrics:['orders']}});assert.deepEqual(added.plan.metrics,['weighted_minutes','orders']);
  const modified=applyTurn(added,{action:'modify',patch:{groupBy:[{field:'BO[방송일시]',unit:'month'}]}});assert.equal(modified.plan.target.value,'레이델');
  const removed=applyTurn(modified,{action:'remove',remove:['groupBy'],removeFilters:['BO[방송일시]']});assert.deepEqual(removed.plan.groupBy,[]);assert.deepEqual(removed.plan.filters,[]);
  assert.equal(applyTurn(original,{action:'confirm'}).plan.target.value,'레이델');assert.equal(applyTurn(original,{action:'cancel'}).plan,null);assert.deepEqual(original.plan.metrics,['weighted_minutes']);
});
test('validator rejects unknown columns, raw aggregation, invented targets, unbounded dates and executable payloads',()=>{
  for(const p of [{...plan(),metrics:['commission_rate']},{...plan(),filters:[]},{...plan(),target:{kind:'brand',value:'미등록'}},{...plan(),groupBy:[{field:'invented',unit:'month'}]},{...plan(),dax:'arbitrary'},{...plan(),limit:101},{...plan(),filters:[...filters,{field:'BO[방송일시]',operator:'hour',value:25}]}])assert.equal(validatePlan(p,catalog,entities).ok,false);
});
test('list by date and hour requires no team/product and uses only synthetic rows',async()=>{
  const executor=createFakeExecutor({catalog,rows,entities});
  const p={...emptyPlan(),fields:['BO[대표상품명]'],filters:[...filters,{field:'BO[방송일시]',operator:'hour',value:8}]};
  const result=await executor.execute(p);assert.deepEqual(result.rows,[{'BO[대표상품명]':'가짜 오전 상품'}]);assert.equal(result.synthetic,true);
  const total=await executor.execute(plan());assert.equal(total.rows[0].weighted_minutes,30);
});
test('share denominator uses all organizations in the same bucket, and opaque model measures are not fabricated',async()=>{
  const executor=createFakeExecutor({catalog,rows,entities});
  const result=await executor.execute({...plan(),target:{kind:'organization',value:'문화서비스'},metrics:['organization_weighted_share'],groupBy:[{field:'BO[방송일시]',unit:'month'}]});
  assert.equal(result.rows[0].organization_weighted_share,0.5);
  const filtered=await executor.execute({...plan(),target:{kind:'organization',value:'문화서비스'},metrics:['organization_weighted_share'],filters:[...filters,{field:'BO[표준조직]',operator:'eq',value:'문화서비스'}]});assert.equal(filtered.rows[0].organization_weighted_share,0.5);
  const opaque=Object.values(catalog.metrics).find(m=>m.aggregation==='model-measure');
  await assert.rejects(executor.execute({...plan(),metrics:[opaque.id]}),{code:'FAKE_MEASURE_UNAVAILABLE'});
});
test('planner records tools, raw plan, validation, execution and failures; clarification never executes',async()=>{
  let calls=0;const events=[];
  const responses=[{tool:{name:'listFields',arguments:{query:'방송'}}},{action:'clarify',question:'오전이야 오후야?'},{action:'new',patch:plan()},{action:'modify',patch:{metrics:['invented']}}];
  const contexts=[];
  const planner=new QueryPlanner({catalog,entities,provider:{complete:async args=>{contexts.push(args.messages);return responses.shift();}},executor:{mode:'fake',execute:async()=>{calls++;return {synthetic:true,rows:[]};}},record:async e=>events.push(e)});
  assert.equal((await planner.run('첫 질문')).kind,'clarify');assert.equal(calls,0);assert.equal(events[0].tools.length,1);
  assert.equal((await planner.run('추가 설명')).kind,'result');assert.equal(calls,1);assert.equal(events[1].queryExecuted,true);
  assert(contexts[2].some(m=>m.role==='user'&&m.content==='첫 질문'));
  assert.equal((await planner.run('수정')).kind,'invalid');assert.equal(calls,1);assert.equal(events[2].queryExecuted,false);assert.equal(events[2].validation.ok,false);
  assert.equal(planner.state.plan.metrics[0],'weighted_minutes');assert.equal(events[1].previousTurnId,events[0].turnId);
});
