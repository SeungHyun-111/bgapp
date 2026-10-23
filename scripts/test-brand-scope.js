const test=require('node:test');
const assert=require('node:assert/strict');
const {resolveEntities}=require('../src/commands/entity-resolver');
const {Dialogue}=require('../src/commands/dialogue');
const {buildQuery}=require('../src/commands/bi-query');
const entities=['[레이델]폴리코사놀5','[레이델]더블액션','[레이델플러스]별도상품'].map(value=>({kind:'product',field:'편성코드',value}));
test('explicit brand aggregates exact bracket prefix; bare name remains ambiguous',()=>{
  const [target]=resolveEntities('레이델 브랜드의 26년 전체 가중분',entities);
  assert.equal(target.kind,'brand');assert.equal(target.value,'레이델');
  assert.equal(resolveEntities('레이델 가중분',entities).length,2);
  const plan=buildQuery({target,metrics:['weighted_minutes'],period:{year:2026}});
  assert(plan.dax.includes(`LEFT('BO'[편성코드], 5) = "[레이델]"`));
  assert(plan.dax.includes('DATE(2027,1,1)'));
});
test('brand explanation resolves pending product choices and preserves year and metrics',async()=>{
  const requests=[];
  const dialogue=new Dialogue({nlu:{parse:async()=>({intent:{name:'nlu_fallback'}})},store:{append:async()=>({id:'x'})},getEntities:async()=>entities,queryMetric:async r=>{requests.push(r);return {basis:'2026년',values:[{label:'가중분',formattedValue:'100분'}]};}});
  assert.match((await dialogue.execute('레이델 26년 가중분')).message,/후보/);
  assert.match((await dialogue.execute('브랜드는 [] 안에가 브랜드야 레이델이면 [레이델]이 들어가 모든 상품을 말해')).message,/100분/);
  assert.equal(requests[0].target.kind,'brand');assert.deepEqual(requests[0].period,{year:2026});assert.deepEqual(requests[0].metrics,['weighted_minutes']);
});
