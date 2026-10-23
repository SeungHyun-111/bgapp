const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs/promises');
const os=require('os');
const path=require('path');
const {QueryStore}=require('../src/commands/query-store');
const {Dialogue}=require('../src/commands/dialogue');
test('successful monthly query is persisted with resolved context and reply',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'usagi-history-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const store=new QueryStore(dir);
  const dialogue=new Dialogue({store,nlu:{parse:async()=>({intent:{name:'nlu_fallback'}})},getEntities:async()=>[{kind:'organization',field:'표준조직',value:'문화서비스',aliases:['문화서비스팀']}],queryMetric:async()=>({basis:'2026년 월별',values:[{label:'가중분 기준 편성비중',formattedValue:'13%'}]})});
  await dialogue.execute('문화서비스팀 월별 편성비중');
  const [record]=await store.readLines(store.conversationsFile);
  assert.equal(record.outcome,'success');assert.deepEqual(record.context.metrics,['organization_weighted_share']);assert.equal(record.context.groupBy,'month');assert.match(record.reply,/13%/);
  assert(record.conversationId);assert(record.turnId);assert.equal(record.previousTurnId,null);
  assert.deepEqual(record.finalQuery.metrics,['organization_weighted_share']);assert.equal(record.predicted.intent.name,'nlu_fallback');
  assert.equal((await store.list()).length,0);
});
