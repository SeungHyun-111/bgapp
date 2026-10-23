const test=require('node:test');
const assert=require('node:assert/strict');
const {resolveEntities}=require('../src/commands/entity-resolver');
const {Dialogue}=require('../src/commands/dialogue');
const {createMetricQuery,buildQuery}=require('../src/commands/bi-query');
const entities=['문화서비스','편성팀'].map(value=>({kind:'organization',field:'표준조직',value}));
test('confirmed aliases resolve culture; metric stems never select scheduling team',()=>{
  assert.equal(resolveEntities('문화팀 편성비중',entities)[0].value,'문화서비스');
  assert.equal(resolveEntities('9월 조직별 편성비중',entities).length,0);
  assert.equal(resolveEntities('편성팀 9월 가중분',entities)[0].value,'편성팀');
});
test('model grouping intent removes previous fixed target, preserves period and renders organizations',async()=>{
  const calls=[];
  const dialogue=new Dialogue({nlu:{parse:async()=>({intent:{name:'change_grouping',confidence:.99},entities:[{entity:'groupBy',value:'organization',confidence_entity:.99}]})},store:{append:async()=>({id:'fixture'})},getEntities:async()=>entities,queryMetric:createMetricQuery({query:async dax=>{
    calls.push(dax);return {results:[{tables:[{rows:[{'BO[표준조직]':'문화서비스','[matchedRows]':2,'[metric0]':.2},{'BO[표준조직]':'헬쓰푸드','[matchedRows]':3,'[metric0]':.3}]}]}]};
  }})});
  dialogue.lastActivity=Date.now();dialogue.state={target:entities[1],metrics:['organization_weighted_share'],metric:'organization_weighted_share',period:{year:2026,month:9}};
  const answer=await dialogue.execute('각 부서가 얼마나 차지했는지 보여줘');
  assert.equal(answer.outcome,'success');assert.match(answer.message,/문화서비스.*20%/);assert.match(answer.message,/헬쓰푸드.*30%/);
  assert.match(calls[0],/SUMMARIZECOLUMNS\('BO'\[표준조직\]/);assert(!calls[0].includes('= "편성팀"'));assert.match(calls[0],/DATE\(2026,9,1\)/);
  assert.match(calls[0],/CALCULATE\(SUM\('BO'\[가중분\]\),\s*FILTER\(ALL\('BO'\)/);
});
test('organization grouping cannot execute arbitrary columns or unaggregated raw metrics',()=>{
  assert.throws(()=>buildQuery({target:{kind:'organization_group',field:'untrusted',value:'all'},groupBy:'organization',metrics:['weighted_minutes'],period:{year:2026}}));
});
test('month typo offers a choice and confirmation resumes the complete organization query',async()=>{
  const requests=[];
  const dialogue=new Dialogue({nlu:{parse:async()=>({intent:{name:'change_grouping',confidence:.99},entities:[{entity:'groupBy',value:'organization',confidence_entity:.99}]})},store:{append:async()=>({id:'fixture'})},getEntities:async()=>entities,now:()=>new Date('2026-10-23T00:00:00Z'),queryMetric:async r=>{requests.push(r);return {basis:'fixture',values:[]};}});
  assert.match((await dialogue.execute('9얼 조직별 편성비중')).message,/9월/);
  assert.equal(requests.length,0);
  await dialogue.execute('1');
  assert.equal(requests[0].target.kind,'organization_group');assert.equal(requests[0].period.month,9);assert.equal(requests[0].period.year,2026);
});
