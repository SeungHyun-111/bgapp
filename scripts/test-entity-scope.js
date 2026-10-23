const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs/promises');
const os=require('os');
const path=require('path');
const {parsePeriod}=require('../src/commands/period-parser');
const {resolveEntities}=require('../src/commands/entity-resolver');
const {EntityCatalog}=require('../src/commands/entity-catalog');
const {Dialogue}=require('../src/commands/dialogue');
const {buildQuery}=require('../src/commands/bi-query');
const entities=[
  {kind:'organization',field:'표준조직',value:'헬쓰푸드',name:'헬쓰푸드',aliases:['건강식품']},
  {kind:'organization',field:'표준조직',value:'식품',name:'식품',aliases:[]},
  {kind:'product',field:'편성코드',value:'[홀베리]당근주스',name:'[홀베리]당근주스',aliases:['유기농 당근주스 8박스']},
  {kind:'product',field:'편성코드',value:'[헬스]식단',name:'[헬스]식단',aliases:[]}
];
test('yearless month uses current Korean year, explicit year overrides and invalid periods ask',()=>{
  const now=new Date('2025-12-31T15:01:00Z');
  assert.deepEqual(parsePeriod('9월 헬스 가중분',now),{period:{year:2026,month:9},groupBy:null,defaultedYear:true});
  assert.deepEqual(parsePeriod('2025년 9월',now).period,{year:2025,month:9});
  assert.deepEqual(parsePeriod('작년 9월',now).period,{year:2025,month:9});
  assert.deepEqual(parsePeriod('26년 9월',now).period,{year:2026,month:9});
  assert.deepEqual(parsePeriod('레이델 브랜드 26년 편성비중/가중분당취급고/이익액 말해봐',now).period,{year:2026});
  assert.deepEqual(parsePeriod('25년 월별',now).period,{year:2025});
  for(const text of ['13월','8월부터 9월'])assert(parsePeriod(text,now).error,text);
});
test('actual organizations, standard names, product names, shorthand and ambiguity',()=>{
  assert.equal(resolveEntities('9월 헬스푸드팀 가중분',entities)[0].value,'헬쓰푸드');
  assert.equal(resolveEntities('건강식품팀 가중분',entities)[0].value,'헬쓰푸드');
  assert.equal(resolveEntities('당근주스 주문량',entities)[0].value,'[홀베리]당근주스');
  assert.equal(resolveEntities('헬스 가중분',entities).length,2);
  assert.equal(resolveEntities('없는팀 가중분',entities).length,0);
});
test('catalog merges historical organization names by actual standard and caches BI lists',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'usagi-entities-'));
  const file=path.join(dir,'catalog.json');
  t.after(async()=>{await fs.unlink(file).catch(()=>{});await fs.rmdir(dir);});
  let calls=0;
  const bridge={query:async dax=>{calls++;return {results:[{tables:[{rows:dax.includes('[조직명]')?[
    {'BO[조직명]':'건강식품','BO[표준조직]':'헬쓰푸드'},
    {'BO[조직명]':'헬쓰푸드','BO[표준조직]':'헬쓰푸드'}
  ]:[{'BO[편성코드]':'[홀베리]당근주스','BO[대표상품명]':'유기농 주스','BO[브랜드]':'홀베리'}]}]}]};}};
  const catalog=new EntityCatalog(file);
  const rows=await catalog.ensure(bridge);
  assert.equal(rows.filter(r=>r.kind==='organization').length,1);
  assert.equal(resolveEntities('헬스푸드팀',rows).length,1);
  assert.equal(resolveEntities('유기농 주스',rows)[0].kind,'product');
  await new EntityCatalog(file).ensure(bridge);
  assert.equal(calls,2);
});
test('team month noun phrase works with classifier fallback and retains context',async()=>{
  const requests=[];
  const dialogue=new Dialogue({nlu:{parse:async()=>({intent:{name:'nlu_fallback',confidence:0.65}})},store:{append:async()=>({id:'x'})},
    getEntities:async()=>entities,now:()=>new Date('2026-10-22T00:00:00Z'),queryMetric:async request=>{
      requests.push(request);return {basis:`${request.period.year}년 ${request.period.month}월`,values:[{label:'가중분',formattedValue:'100분'}]};
    }});
  const answer=await dialogue.execute('9월 헬스푸드팀 가중분');
  assert.match(answer.message,/100분/);assert.match(answer.message,/올해/);
  assert.deepEqual(requests[0].period,{year:2026,month:9});
  assert.equal(requests[0].target.field,'표준조직');
  await dialogue.execute('그럼 식품은?');assert.equal(requests[1].target.value,'식품');
  await dialogue.execute('2025년 8월');assert.deepEqual(requests[2].period,{year:2025,month:8});
  assert.equal((await dialogue.execute('헬스푸드팀 날씨 이상해')).saved,true);
  assert.equal(requests.length,3);
});
test('organization query uses validated scope and exact calendar boundaries',()=>{
  const plan=buildQuery({target:entities[0],metrics:['weighted_minutes'],period:{year:2026,month:9}});
  assert(plan.dax.includes("'BO'[표준조직] = \"헬쓰푸드\""));
  assert(plan.dax.includes('DATE(2026,9,1)'));assert(plan.dax.includes('DATE(2026,10,1)'));
  assert(plan.dax.includes("SUM('BO'[가중분])"));
  assert.throws(()=>buildQuery({target:{kind:'organization',field:'injected',value:'x'},metrics:['weighted_minutes'],period:'current_month'}));
});
