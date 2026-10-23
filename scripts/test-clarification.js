const test=require('node:test');
const assert=require('node:assert/strict');
const {parsePeriod}=require('../src/commands/period-parser');
const {Dialogue}=require('../src/commands/dialogue');
test('year typo offers nearby valid years and does not silently change the request',()=>{
  const parsed=parsePeriod('헬스푸드팀 20266년 가중분',new Date('2026-10-23T00:00:00Z'));
  assert.match(parsed.error,/1\. 2026년/);assert.equal(parsed.period,undefined);assert.equal(parsed.suggestions[0].input,'헬스푸드팀 2026년 가중분');
  assert.deepEqual(parsePeriod('26년').period,{year:2026});
});
test('number reply confirms the proposed year while preserving the original question',async()=>{
  const requests=[];
  const dialogue=new Dialogue({now:()=>new Date('2026-10-23T00:00:00Z'),nlu:{parse:async()=>({intent:{name:'nlu_fallback'}})},store:{append:async()=>({id:'x'})},getEntities:async()=>[{kind:'organization',field:'표준조직',value:'헬쓰푸드',aliases:['헬스푸드팀']}],queryMetric:async request=>{requests.push(request);return {basis:'2026년',values:[{label:'가중분',formattedValue:'100분'}]};}});
  assert.match((await dialogue.execute('헬스푸드팀 20266년 가중분')).message,/2026년/);assert.equal(requests.length,0);
  assert.match((await dialogue.execute('1번')).message,/100분/);assert.deepEqual(requests[0].period,{year:2026});assert.equal(requests[0].target.value,'헬쓰푸드');
});
