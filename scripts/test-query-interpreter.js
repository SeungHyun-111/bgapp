const test=require('node:test');
const assert=require('node:assert/strict');
const {interpretQuery}=require('../src/commands/query-interpreter');
const {Dialogue}=require('../src/commands/dialogue');
const prediction=entities=>({intent:{name:'modify_condition',confidence:0.95},entities:entities.map(([entity,value])=>({entity,value,confidence_entity:0.96}))});
test('learned capability intents select metrics and context operations without keyword matches',()=>{
  const parsed={intent:{name:'query',confidence:0.99},entities:[{entity:'metric',value:'organization_weighted_share',confidence_entity:.99}]};
  const query=interpretQuery('어느 정도 차지하는지',parsed);
  assert.deepEqual(query.metrics,['organization_weighted_share']);assert.equal(query.recognized,true);
  const change=interpretQuery('그게 아니라 같은 상표끼리 묶어',prediction([['scope','all_products']]));
  assert.equal(change.targetScope,'brand');
});
test('learned metric, scope and grouping slots select registered capabilities without literal aliases',()=>{
  const result=interpretQuery('같은 상표끼리 묶어 달마다 얼마나 차지했는지',prediction([['metric','organization_weighted_share'],['scope','all_products'],['groupBy','month']]),{},new Date('2026-10-23T00:00:00Z'));
  assert.deepEqual(result.metrics,['organization_weighted_share']);assert.equal(result.targetScope,'brand');assert.equal(result.period.groupBy,'month');assert.equal(result.period.period.year,2026);
  assert.deepEqual(interpretQuery('아무거나',prediction([['metric','unregistered_dax']])).metrics,[]);
});
test('a learned metric span takes priority over a shorter keyword and keeps other requested metrics',()=>{
  const input='가중분당 취급고 그리고 한계이익';
  const parsed=prediction([]);parsed.entities=[{entity:'metric',value:'measure:(전체)취급(분)',start:0,end:8,confidence_entity:0.99}];
  const result=interpretQuery(input,parsed);
  assert(result.metrics.includes('measure:(전체)취급(분)'));assert(result.metrics.includes('profit'));assert(!result.metrics.includes('weighted_minutes'));
});
test('correction replaces only the metric and uses the positive clause, retaining other slots',async()=>{
  const requests=[],history=[];
  const dialogue=new Dialogue({nlu:{parse:async()=>prediction([])},store:{append:async()=>({id:'x'}),appendConversation:async(...args)=>history.push(args)},getEntities:async()=>[{kind:'product',field:'편성코드',value:'[홀베리]당근주스'}],queryMetric:async r=>{requests.push(r);return {basis:'fixture',values:[{label:'값',formattedValue:'100'}]};}});
  await dialogue.execute('홀베리 26년 취급액');
  await dialogue.execute('그게 아니라 취급액 말고 한계이익');
  assert.equal(requests[1].metric,'profit');assert.deepEqual(requests[1].period,{year:2026});assert.equal(requests[1].target.value,'[홀베리]당근주스');
  assert.equal(history[1][3].correction,true);assert.equal(history[1][3].previousContext.metric,'sales');assert(history[1][3].previousTurnId);
  assert.match((await dialogue.execute('그게 아니라')).message,/어떤 부분/);assert.equal(requests.length,2);
});
test('model scope correction resolves previous product candidates without requiring a literal brand phrase',async()=>{
  let parseCalls=0;const requests=[];
  const dialogue=new Dialogue({nlu:{parse:async()=>prediction(++parseCalls===1?[]:[['scope','all_products']])},store:{append:async()=>({id:'x'})},getEntities:async()=>['[레이델]A','[레이델]B'].map(value=>({kind:'product',field:'편성코드',value})),queryMetric:async r=>{requests.push(r);return {basis:'fixture',values:[{label:'값',formattedValue:'100'}]};}});
  await dialogue.execute('레이델 26년 가중분');
  await dialogue.execute('그게 아니라 같은 상표 제품끼리 묶어');
  assert.equal(requests[0].target.kind,'brand');assert.equal(requests[0].target.value,'레이델');
});
