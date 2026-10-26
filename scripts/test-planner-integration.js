const test=require('node:test');
const assert=require('node:assert/strict');
const catalog=require('../data/bi-catalog.json');
const entities=require('../data/bi-entity-catalog.json').entities;
const {syntheticRows}=require('../src/planner/synthetic-fixtures');
const {emptyPlan,applyTurn}=require('../src/planner/dialogue-state');
const {createFakeExecutor}=require('../src/planner/fake-bi-executor');
const {validatePlan}=require('../src/planner/query-validator');
const {LocalLlmClient,localUrl}=require('../src/planner/local-llm-client');
const {QueryPlanner}=require('../src/planner/query-planner');

test('whole request deadline releases a hung provider and permits the next turn',async()=>{
  let calls=0;
  const planner=new QueryPlanner({catalog,entities,requestTimeoutMs:25,provider:{complete:async()=>++calls===1?new Promise(()=>{}):({action:'cancel'})},executor:createFakeExecutor({catalog,entities,rows:syntheticRows()})});
  const result=await planner.run('대기 중인 질문');
  assert.equal(result.error.code,'LLM_REQUEST_TIMEOUT');
  assert.equal((await planner.run('취소')).kind,'cancelled');
});

test('client deadline includes a response body that never finishes',async()=>{
  const client=new LocalLlmClient({baseUrl:'http://127.0.0.1:8080',timeoutMs:25,fetchImpl:async url=>url.endsWith('/health')?{ok:true,json:async()=>({status:'ok'})}:{ok:true,text:()=>new Promise(()=>{})}});
  const keepAlive=setTimeout(()=>{},1000);
  try{await assert.rejects(client.complete({messages:[]}),error=>error.code==='INFERENCE_TIMEOUT');}
  finally{clearTimeout(keepAlive);}
});
const dates=[{field:'BO[방송일시]',operator:'gte',value:'2026-09-01'},{field:'BO[방송일시]',operator:'lt',value:'2026-10-01'}];
const p=()=>({...emptyPlan(),operation:'aggregate',metrics:['organization_weighted_share'],filters:dates});
test('target-free type share and organization buckets use whole-period denominator',async()=>{
  const executor=createFakeExecutor({catalog,entities,rows:syntheticRows()});
  const intangible={...p(),filters:[...dates,{field:'BO[유/무형]',operator:'eq',value:'무형'}]};
  assert.equal((await executor.execute(intangible)).rows[0].organization_weighted_share,.4);
  const grouped=await executor.execute({...p(),groupBy:[{field:'BO[표준조직]',unit:'value'}]});
  assert.deepEqual(grouped.rows.map(r=>r.organization_weighted_share),[.4,.6]);
  const brand=await executor.execute({...p(),target:{kind:'brand',value:'레이델'}});
  assert.equal(brand.rows[0].organization_weighted_share,.3);
});
test('typed numerator/denominator obey filters and reject invented basis',async()=>{
  const executor=createFakeExecutor({catalog,entities,rows:syntheticRows()});
  const plan={...p(),share:{numerator:{metric:'weighted_minutes',filters:[...dates,{field:'BO[유/무형]',operator:'eq',value:'무형'}]},denominator:{metric:'weighted_minutes',filters:dates,groupBy:[]}}};
  assert.equal((await executor.execute(plan)).rows[0].organization_weighted_share,.4);
  plan.share.denominator.metric='invented';assert.equal(validatePlan(plan,catalog,entities).ok,false);
});
test('year correction preserves unrelated type filter and grouping',()=>{
  const plan={...p(),filters:[...dates,{field:'BO[유/무형]',operator:'eq',value:'무형'}],groupBy:[{field:'BO[방송일시]',unit:'month'}]};
  const next=applyTurn({plan},{action:'modify',patch:{filters:dates.map(f=>({...f,value:f.value.replace('2026','2025')}))}});
  assert.equal(next.plan.filters.find(f=>f.field==='BO[유/무형]').value,'무형');
  assert.deepEqual(next.plan.groupBy,plan.groupBy);
});
test('local client has no external URL fallback and reports bad JSON/timeout/offline separately',async()=>{
  assert.throws(()=>localUrl('https://example.com'));
  for(const [body,code] of [['invalid','INVALID_MODEL_RESPONSE'],[JSON.stringify({choices:[{message:{content:'broken'}}]}),'INVALID_MODEL_RESPONSE']]){
    const c=new LocalLlmClient({baseUrl:'http://127.0.0.1:8080',fetchImpl:async url=>new Response(url.endsWith('/health')?'{"status":"ok"}':body)});
    await assert.rejects(c.complete({messages:[]}),{code});
  }
  const c=new LocalLlmClient({baseUrl:'http://127.0.0.1:8080',fetchImpl:async url=>{if(url.endsWith('/health'))return new Response('{"status":"ok"}');throw new DOMException('timeout','TimeoutError');}});
  await assert.rejects(c.complete({messages:[]}),{code:'INFERENCE_TIMEOUT'});
  const offline=new LocalLlmClient({baseUrl:'http://127.0.0.1:8080',fetchImpl:async()=>{throw Error('offline');}});
  await assert.rejects(offline.complete({messages:[]}),{code:'MODEL_HEALTH_TIMEOUT'});
});
