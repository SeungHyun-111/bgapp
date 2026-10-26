const test=require('node:test');
const assert=require('node:assert/strict');
const catalog=require('../src/planner/catalog-loader').loadPlannerCatalog(require('path').resolve(__dirname,'../data'));
const entities=require('../data/bi-entity-catalog.json').entities;
const {emptyPlan}=require('../src/planner/dialogue-state');
const {compilePlan,createLiveExecutor}=require('../src/planner/live-bi-executor');
const {QueryPlanner}=require('../src/planner/query-planner');
const {formatAnswer}=require('../src/planner/chat-dialogue');
const filters=[{field:'BO[방송일시]',operator:'gte',value:'2026-09-01'},{field:'BO[방송일시]',operator:'lt',value:'2026-10-01'}];
const plan=()=>({...emptyPlan(),operation:'aggregate',metrics:['organization_weighted_share'],filters,groupBy:[{field:'BO[표준조직]',unit:'value'}]});

test('organization share compiles a grouped numerator and whole-period denominator without requiring a target',()=>{
  const {dax}=compilePlan(plan(),catalog,entities);
  assert.match(dax,/VAR __group0/);
  assert.match(dax,/'BO'\[표준조직\] == __group0/);
  const denominator=dax.slice(dax.indexOf('DIVIDE(')).split('REMOVEFILTERS')[2];
  assert.ok(denominator);
  assert.doesNotMatch(denominator.split('"__matched"')[0],/표준조직.*== __group0/);
  assert.match(dax,/DATE\(2026,9,1\)/);
});

test('temporal grouping, broadcast counts and model measures use registered expressions',()=>{
  const p={...plan(),metrics:['broadcast_count','profit_per_minute'],groupBy:[{field:'BO[방송일시]',unit:'month'}]};
  const {dax}=compilePlan(p,catalog,entities);
  assert.match(dax,/FORMAT\('BO'\[방송일시\], "yyyy-MM"\)/);
  assert.match(dax,/DISTINCTCOUNT\('BO'\[방송일시\]\)/);
  assert.match(dax,/'BO'\[\(전체\)한계\(분\)\]/);
  assert.throws(()=>compilePlan({...p,metrics:['invented']},catalog,entities),/Unknown metric/);
});

test('actual planner delegates to BI adapter and labels returned values as live; no network used',async()=>{
  let calls=0,event;
  const executor=createLiveExecutor({catalog,entities,query:async dax=>{calls++;assert.match(dax,/EVALUATE TOPN/);return {results:[{tables:[{rows:[{'[__out0]':'문화서비스','[__out1]':0.25,'[__matched]':3}]}]}]};}});
  const planner=new QueryPlanner({catalog,entities,executor,record:async e=>{event=e;},provider:{complete:async()=>({action:'new',patch:plan()})}});
  const out=await planner.run('9월 조직별 편성비중');
  assert.equal(calls,1);assert.equal(out.result.synthetic,false);
  assert.equal(out.result.rows[0].organization_weighted_share,0.25);
  assert.equal(event.executionMode,'live');assert.equal(event.queryExecuted,true);
  assert.match(formatAnswer(out,catalog),/25.00%/);
  assert.doesNotMatch(formatAnswer(out,catalog),/가짜 데이터/);
});

test('BI failure remains distinguishable from Qwen failure and is never replaced by fixture data',async()=>{
  const executor=createLiveExecutor({catalog,entities,query:async()=>{throw Error('offline');}});
  await assert.rejects(executor.execute(plan()),e=>e.code==='BI_QUERY_FAILED');
  assert.match(formatAnswer({kind:'error',error:{code:'BI_QUERY_FAILED'}},catalog),/실제 BI 조회에 실패/);
});
