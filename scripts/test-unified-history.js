const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs/promises');
const os=require('os');
const path=require('path');
const {mergeRecords,migrate}=require('./merge-conversation-history');
const {QueryStore}=require('../src/commands/query-store');
const {Dialogue}=require('../src/commands/dialogue');
test('merge pairs duplicate unknown turns one-to-one, preserving old IDs and full replies',()=>{
  const legacy=[{id:'old1',input:'같은 질문',timestamp:'2026-10-23T01:00:00Z'},{id:'old2',input:'같은 질문',timestamp:'2026-10-23T01:00:01Z'}];
  const history=[{id:'new1',input:'같은 질문',timestamp:'2026-10-23T01:00:00.200Z',outcome:'unhandled',reply:'답변'}];
  const result=mergeRecords(history,legacy,[]);assert.equal(result.length,2);assert.equal(result[0].id,'old1');assert.equal(result[0].reply,'답변');assert(result[0].mergedIds.includes('new1'));assert.equal(result[1].id,'old2');
});
test('migration and new unknown turns use a single file, with no duplicate writes',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'usagi-unified-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  await fs.writeFile(path.join(dir,'unhandled-queries.jsonl'),JSON.stringify({id:'old',input:'예전 질문',status:'unhandled',timestamp:'2026-10-23T00:00:00Z'})+'\n');
  await migrate(dir);await assert.rejects(fs.access(path.join(dir,'unhandled-queries.jsonl')),{code:'ENOENT'});
  const store=new QueryStore(dir);const dialogue=new Dialogue({store,nlu:{parse:async()=>({intent:{name:'out_of_scope',confidence:1}})}});
  await dialogue.execute('뭐든 대답해봐');
  const records=await store.readLines(store.file);assert.equal(records.length,2);assert.equal(records[1].reply.includes('질문'),true);assert.equal(store.file,store.conversationsFile);
  await store.markConverted('old','LOOKUP');assert.equal((await store.list())[0].status,'converted');
  const rerun=await migrate(dir);assert.equal(rerun.after,3);
});
