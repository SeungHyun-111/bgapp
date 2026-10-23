const fs=require('fs');
const path=require('path');
const assert=require('node:assert/strict');
const {PowerBiBridge}=require('../src/power-bi-bridge');
const {extractRows}=require('../src/power-bi-search');
const {EntityCatalog}=require('../src/commands/entity-catalog');
const {resolveEntities}=require('../src/commands/entity-resolver');
const {createMetricQuery}=require('../src/commands/bi-query');
const {metrics}=require('../src/commands/bi-metrics');
const catalog=require('../src/bi-reference/catalog.json');
const bridge=new PowerBiBridge({onStatus:event=>{if(event==='sign-in')console.log('Microsoft 로그인 창이 나타나면 직접 로그인해주세요.');}});
async function main(){
  const entities=await new EntityCatalog(path.resolve(__dirname,'../data/bi-entity-catalog.json')).ensure(bridge);
  const targets=resolveEntities('헬스푸드팀',entities);assert.equal(targets.length,1);
  const target=targets[0],period={year:2026,month:9};
  const query=createMetricQuery(bridge);
  const result=await query({target,period,metrics:['organization_weighted_share','organization_broadcast_share','weighted_minutes']});
  assert(!result.empty);console.log(JSON.stringify({result}));
  const pie=catalog.queries.find(q=>q.visualType==='pieChart'&&q.allReferences.includes("'BO'[가중분]"));
  const captured=extractRows(await bridge.query(fs.readFileSync(path.resolve(__dirname,'..',pie.queryFile),'utf8')));
  assert(captured.length<1002);
  const names=new Set([target.value,...target.aliases]);
  const total=captured.reduce((s,r)=>s+Number(r['[Sum가중분]']||0),0);
  const numerator=captured.filter(r=>names.has(r['BO[조직명]'])).reduce((s,r)=>s+Number(r['[Sum가중분]']||0),0);
  const actual=result.values.find(v=>v.id==='organization_weighted_share').value;
  assert(total>0);assert(Math.abs(actual-numerator/total)<1e-9);
  console.log(JSON.stringify({sourcePieRows:captured.length,numerator,total,share:actual,sourceMatches:true}));
  const added=catalog.measures.filter(m=>!m.alreadyRegistered).map(m=>metrics.find(item=>item.expression===m.reference).id);
  for(let at=0;at<added.length;at+=8){const probe=await query({target,period,metrics:added.slice(at,at+8)});assert(!probe.empty);console.log(JSON.stringify({additionalMeasures:probe.values.map(v=>({id:v.id,value:v.value}))}));}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>bridge.stop());
