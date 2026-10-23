const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const {schemaErrors,validatePlan}=require('../src/planner/query-validator');
const {applyTurn}=require('../src/planner/dialogue-state');
const turnSchema=require('../src/planner/turn-schema.json');
const read=name=>JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/training',name),'utf8'));
const lines=name=>fs.readFileSync(path.resolve(__dirname,'../data/training',name),'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
test('all source records are accounted for; duplicates and unsupported plans are excluded from SFT',()=>{
  const manifest=read('manifest.json'),annotations=read('annotations.json'),all=[...lines('train.planner.jsonl'),...lines('eval.planner.jsonl')];
  assert.equal(annotations.length,manifest.sourceRecords);assert.equal(new Set(annotations.map(a=>a.sourceId)).size,annotations.length);
  for(const row of all)assert.equal(annotations.find(a=>a.sampleId===row.sampleId).category,'ready');
  assert(!all.some(r=>r.sampleId==='874abcea-744f-49ce-a44d-c1e91194b72f'));
  assert(annotations.find(a=>a.sampleId==='80a8f2b7-eef2-4804-a471-c4635df0df68').desired.groupBy.some(g=>g.field==='BO[표준조직]'));
});
test('conversation families do not leak across training/evaluation splits',()=>{
  const train=lines('train.planner.jsonl'),evaluation=lines('eval.planner.jsonl');
  const groups=new Set(train.map(r=>r.sourceGroup));assert(evaluation.every(r=>!groups.has(r.sourceGroup)));
  assert.equal(new Set([...train,...evaluation].map(r=>r.sampleId)).size,train.length+evaluation.length);
});
test('gold turns satisfy schema; executable targets validate; corrections preserve other conditions',()=>{
  const catalog=require('../data/bi-catalog.json');
  for(const row of [...lines('train.planner.jsonl'),...lines('eval.planner.jsonl')]){
    const payload=JSON.parse(row.messages[1].content),gold=JSON.parse(row.messages[2].content);
    assert.deepEqual(schemaErrors(gold,turnSchema),[],row.sampleId);
    const next=applyTurn(payload.previousState,gold);
    if(gold.action!=='clarify')assert.equal(validatePlan(next.plan,catalog,payload.catalogContext.targetMetadata).ok,true,row.sampleId);
    if(row.sampleId==='fa23ae11-0799-4379-984b-a0e133997ced'){
      assert.equal(next.plan.target.value,'문화서비스');assert.deepEqual(next.plan.metrics,payload.previousState.plan.metrics);assert.deepEqual(next.plan.filters,payload.previousState.plan.filters);
    }
    assert(!row.messages[2].content.includes('찾았다! 편성팀'));
  }
});
test('confirmed formulas use ratio of sums and never assume opaque BI measures are equivalent',()=>{
  const decisions=read('decisions.json');
  for(const id of ['weighted_sales_per_minute','weighted_profit_per_minute']){
    const metric=decisions.facts.find(f=>f.id===id);assert.match(metric.expression,/DIVIDE\(SUM\(/);assert.match(metric.expression,/SUM\('BO'\[가중분\]\)/);assert(metric.status.includes('not-registered'));
  }
  assert.equal(decisions.facts.find(f=>f.id==='culture_alias').canonical,'문화서비스');
});
