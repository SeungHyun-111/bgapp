const test=require('node:test');
const assert=require('node:assert/strict');
const {Dialogue}=require('../src/commands/dialogue');
const {buildQuery,createMetricQuery}=require('../src/commands/bi-query');
const {buildMonthlyQuery}=require('../src/commands/bi-monthly-query');
const target={kind:'organization',field:'표준조직',value:'헬쓰푸드',aliases:['헬스푸드팀']};
test('monthly slots compose with year, metric and explicit-month followups',async()=>{
  const requests=[];
  const dialogue=new Dialogue({now:()=>new Date('2026-10-23T00:00:00Z'),nlu:{parse:async()=>({intent:{name:'nlu_fallback'}})},store:{append:async()=>({id:'x'})},getEntities:async()=>[target],queryMetric:async r=>{
    requests.push(r);return {basis:'local fixture',series:[{label:'1월',values:[{label:'가중분',formattedValue:'0분'}]},{label:'2월',empty:true}]};
  }});
  assert.match((await dialogue.execute('헬스푸드팀 월별 가중분')).message,/1월: 가중분 0분\n2월: 데이터 없음/);
  assert.deepEqual(requests[0].period,{year:2026});assert.equal(requests[0].groupBy,'month');
  await dialogue.execute('작년은?');assert.deepEqual(requests[1].period,{year:2025});assert.equal(requests[1].groupBy,'month');
  await dialogue.execute('취급액은?');assert.equal(requests[2].metric,'sales');assert.equal(requests[2].period.year,2025);
  // A period change cannot implicitly remove a separately selected grouping.
  await dialogue.execute('2026년 9월');assert.equal(requests[3].groupBy,'month');assert.deepEqual(requests[3].period,{year:2026,month:9});
});
test('monthly shares reuse each month denominator; no captured month leaks',()=>{
  const plan=buildMonthlyQuery({target,metrics:['organization_weighted_share'],period:{year:2026}},buildQuery);
  assert.equal((plan.dax.match(/ADDCOLUMNS\(/g)||[]).length,12);
  assert(plan.dax.includes('DATE(2027,1,1)'));assert(plan.dax.includes('"bucketMonth", 9'));
  assert.throws(()=>buildMonthlyQuery({target,metrics:['commission_rate'],period:{year:2026}},buildQuery));
});
test('one fake bridge call preserves zero and distinguishes months with no rows',async()=>{
  let calls=0;
  const query=createMetricQuery({query:async()=>{calls++;return {results:[{tables:[{rows:[{'[bucketMonth]':1,'[matchedRows]':2,'[metric0]':0},{'[bucketMonth]':2,'[matchedRows]':0}]}]}]};}});
  const result=await query({target,metrics:['weighted_minutes'],period:{year:2026},groupBy:'month'});
  assert.equal(calls,1);assert.equal(result.series.length,12);assert.equal(result.series[0].empty,false);assert.equal(result.series[0].values[0].value,0);assert.equal(result.series[1].empty,true);
});
