const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const {ACTION_INTENTS}=require('../src/commands/query-capabilities');
const {Dialogue}=require('../src/commands/dialogue');
const {applyQueryState}=require('../src/commands/query-state');
test('training labels are fixed actions plus out_of_scope; metrics never create intents',()=>{
 const labels=new Set(fs.readdirSync('nlu/data').flatMap(f=>[...fs.readFileSync('nlu/data/'+f,'utf8').matchAll(/- intent: (\S+)/g)].map(m=>m[1])));
 assert.deepEqual([...labels].sort(),[...ACTION_INTENTS,'out_of_scope'].sort());
});
test('actual chat adds/removes metrics, edits period/grouping, removes target and cancels with independent slots',async()=>{
 const frames=[['query',[['metric','weighted_minutes'],['scope','all_products']]],['add_condition',[['metric','sales']]],['add_condition',[['metric','profit']]],['remove_condition',[['metric','sales']]],['modify_condition',[]],['change_grouping',[['groupBy','month']]],['remove_condition',[['field','target']]],['confirm',[]],['cancel',[]]];
 const requests=[];
 const d=new Dialogue({nlu:{parse:async()=>{const [name,slots]=frames.shift();return {intent:{name,confidence:.99},entities:slots.map(([entity,value])=>({entity,value,confidence_entity:.99}))};}},store:{append:async()=>({id:'fixture'})},getEntities:async()=>['[레이델]A','[레이델]B'].map(value=>({kind:'product',field:'편성코드',value})),queryMetric:async r=>{requests.push(r);return {basis:'fixture',values:[]};}});
 for(const text of ['레이델 26년 가중분','이것도 함께','다른 값도 추가','이 항목은 빼','아니 25년','달마다','브랜드 조건 빼','맞아','없던 걸로 해'])await d.execute(text);
 assert.deepEqual(requests[1].metrics,['weighted_minutes','sales']);assert.deepEqual(requests[2].metrics,['weighted_minutes','sales','profit']);assert.deepEqual(requests[3].metrics,['weighted_minutes','profit']);
 assert.equal(requests[4].period.year,2025);assert.equal(requests[4].target.kind,'brand');assert.equal(requests[5].groupBy,'month');
 assert.equal(requests[6].target.kind,'all_products');assert.deepEqual(requests[6].metrics,['weighted_minutes','profit']);assert.equal(requests.length,7);assert.deepEqual(d.state,{});
});
test('unsupported additive filters and too many metrics leave previous state unchanged',()=>{
 const before={filters:{productType:'유형'},metrics:['sales']};
 assert.throws(()=>applyQueryState(before,{action:'add_condition',patch:{filters:{productType:'무형'}}}));assert.deepEqual(before,{filters:{productType:'유형'},metrics:['sales']});
 assert.throws(()=>applyQueryState(before,{action:'add_condition',patch:{metrics:Array.from({length:9},(_,i)=>'m'+i)}}));
});
test('a period-only correction keeps organization grouping; unknown additions never repeat the old result',async()=>{
 let name='modify_condition';const requests=[];
 const d=new Dialogue({nlu:{parse:async()=>({intent:{name,confidence:.99}})},store:{append:async()=>({id:'fixture'})},getEntities:async()=>[],queryMetric:async r=>{requests.push(r);return {basis:'fixture',values:[]};}});
 d.lastActivity=Date.now();d.state={target:{kind:'organization_group',field:'표준조직',value:'전체 조직'},metrics:['organization_weighted_share'],metric:'organization_weighted_share',groupBy:'organization',period:{year:2026,month:6}};
 await d.execute('9월 말이야');assert.equal(requests[0].groupBy,'organization');assert.equal(requests[0].period.month,9);
 name='add_condition';assert.match((await d.execute('이름을 모르는 값도 함께')).message,/연결하지 못했어/);assert.equal(requests.length,1);
});
