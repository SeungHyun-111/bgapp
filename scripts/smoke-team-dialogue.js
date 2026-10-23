const path=require('path');
const assert=require('node:assert/strict');
const {PowerBiBridge}=require('../src/power-bi-bridge');
const {EntityCatalog}=require('../src/commands/entity-catalog');
const {resolveEntities}=require('../src/commands/entity-resolver');
const {createMetricQuery}=require('../src/commands/bi-query');
const {RasaClient}=require('../src/commands/rasa-client');
const {Dialogue}=require('../src/commands/dialogue');
const bridge=new PowerBiBridge({onStatus:event=>{if(event==='sign-in')console.log('Microsoft 로그인 창이 뜨면 직접 로그인해주세요.');}});
const nlu=new RasaClient();
async function main(){
  const catalog=new EntityCatalog(path.resolve(__dirname,'../data/bi-entity-catalog.json'));
  const entities=await catalog.ensure(bridge,{force:true});
  console.log(JSON.stringify({organizations:entities.filter(e=>e.kind==='organization'),products:entities.filter(e=>e.kind==='product').length,limited:catalog.limited}));
  const targets=resolveEntities('9월 헬스푸드팀 가중분',entities);
  assert.equal(targets.length,1,'Expected one actual health-food organization');
  assert.equal(targets[0].kind,'organization');
  const queryMetric=createMetricQuery(bridge);
  console.log(JSON.stringify(await queryMetric({target:targets[0],metrics:['weighted_minutes'],period:{year:2026,month:9}})));
  const dialogue=new Dialogue({nlu,getEntities:async()=>entities,store:{append:async()=>({id:'smoke'})},queryMetric});
  const reply=await dialogue.execute('9월 헬스푸드팀 가중분');
  console.log(reply.message);
  assert.match(reply.message,/찾았다!/);assert.match(reply.message,/2026년 9월/);assert.match(reply.message,/가중분/);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>{nlu.stop();bridge.stop();});
