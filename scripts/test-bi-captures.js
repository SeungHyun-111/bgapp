const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const catalog=require('../src/bi-reference/catalog.json');
const model=require('../src/power-bi-model.json');
const {metrics,detectMetrics}=require('../src/commands/bi-metrics');
const {outputsOf}=require('./lib/dax-capture');
const {buildQuery,createMetricQuery}=require('../src/commands/bi-query');
const {Dialogue}=require('../src/commands/dialogue');
const root=path.resolve(__dirname,'..');
test('six original captures and 42 queries have traceable unchanged archives',()=>{
  assert.equal(catalog.sources.length,6);assert.equal(catalog.queryCount,42);
  for(const source of catalog.sources){
    const raw=fs.readFileSync(path.join(root,source.file));
    assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),source.sha256);
    assert(raw.equals(fs.readFileSync(path.join(root,source.archiveFile))));
  }
  for(const q of catalog.queries){assert(fs.existsSync(path.join(root,q.queryFile)));assert(q.sourceFile);}
  assert(catalog.queries.some(q=>q.outputs.some(o=>o.contextSensitive)));
});
test('imported model measures are registered by reference without inventing definitions',()=>{
  const existing=new Set(model.measures.map(m=>m.reference));
  const added=catalog.measures.filter(m=>!existing.has(m.reference));assert.equal(added.length,11);
  for(const m of added){assert.equal(m.definition,null);assert(metrics.some(item=>item.expression===m.reference));assert(m.sourceQueries.length);}
  const found=detectMetrics('헬스푸드팀 분당취급액이랑 매출달성률 알려줘');
  assert(found.some(id=>metrics.find(m=>m.id===id).expression==="'BO'[(전체)취급(분)]"));
  assert(found.some(id=>metrics.find(m=>m.id===id).expression==="'BO'[(전체)매출달성률(%)]"));
});
test('DAX nested argument parser preserves commas, escaped quotes and scalar expressions',()=>{
  const values=outputsOf('EVALUATE ROW("a", CALCULATE(SUM(\'BO\'[가중분])), "a""b", DIVIDE(1, 2))');
  assert.equal(values.length,2);assert.equal(values[1].alias,'a"b');assert.equal(values[1].expression,'DIVIDE(1, 2)');
});
const target={kind:'organization',field:'표준조직',value:'헬쓰푸드',name:'헬쓰푸드',aliases:['헬스푸드팀']};
test('share denominator removes entity but preserves month/type, never captured constants',()=>{
  const plan=buildQuery({target,metrics:['organization_weighted_share'],period:{year:2024,month:2},filters:{productType:'무형'}});
  assert(plan.dax.includes('DATE(2024,2,1)'));assert(plan.dax.includes('DATE(2024,3,1)'));assert(!plan.dax.includes('DATE(2025,11'));
  assert.equal((plan.dax.match(/표준조직/g)||[]).length,1);
  assert.equal((plan.dax.match(/유\/무형/g)||[]).length,2);
  const counts=buildQuery({target,metrics:['organization_broadcast_share'],period:'current_month'});
  assert(counts.dax.includes("DISTINCTCOUNT('BO'[방송일시])"));
  assert.throws(()=>buildQuery({product:'상품',metrics:['organization_weighted_share'],period:'current_month'}));
});
test('generic share defaults to weighted minutes and explicit broadcast count overrides',async()=>{
  const requests=[];
  const dialogue=new Dialogue({nlu:{parse:async()=>({intent:{name:'out_of_scope',confidence:0.9}})},store:{append:async()=>({id:'x'})},
    getEntities:async()=>[target],now:()=>new Date('2026-10-23T00:00:00Z'),queryMetric:async request=>{requests.push(request);return{basis:'2026년 9월 · 전 조직 대비',values:[{label:'편성비중',formattedValue:'20%'}]};}});
  assert.match((await dialogue.execute('헬스푸드팀 9월 편성비중')).message,/20%/);assert.equal(requests.length,1);
  assert.deepEqual(requests[0].metrics,['organization_weighted_share']);
  await dialogue.execute('방송횟수 비중은?');assert.deepEqual(requests[1].metrics,['organization_broadcast_share']);
});
test('null/zero percentages are preserved and source query identifiers travel with results',async()=>{
  const query=createMetricQuery({query:async()=>({results:[{tables:[{rows:[{'[matchedRows]':4,'[metric0]':0}]}]}]})});
  const result=await query({target,metrics:['organization_weighted_share'],period:{year:2026,month:9}});
  assert.equal(result.values[0].formattedValue,'0%');assert(result.values[0].sourceQueries.length);assert.match(result.basis,/전 조직 대비/);
});
