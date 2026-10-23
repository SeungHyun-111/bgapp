const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs/promises');
const os=require('os');
const path=require('path');
const {QueryStore}=require('../src/commands/query-store');
const {applyReviews}=require('./mark-reviewed-conversations');
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'usagi-review-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return {dir,store:new QueryStore(dir)};}
test('review hides only reviewed items and preserves original records; new questions default to unreviewed',async t=>{
  const {store}=await fixture(t);const first=await store.append('첫 질문'),second=await store.append('둘째 질문');const original=await fs.readFile(store.file,'utf8');
  await store.markReviewed({id:first.id,category:'needs_capability',annotationFile:'training/reviews/v1.json',annotationVersion:'v1'});
  assert((await fs.readFile(store.file,'utf8')).startsWith(original));
  assert.deepEqual((await store.conversations({review:'unreviewed'})).map(r=>r.id),[second.id]);
  assert.equal((await store.conversations({review:'reviewed'}))[0].trainingStatus,'not_used');
  await store.append('새 질문');assert.equal((await store.conversations({review:'unreviewed'})).length,2);
  const again=await store.markReviewed({id:first.id,category:'needs_capability',annotationFile:'training/reviews/v1.json',annotationVersion:'v1'});assert.equal(again.changed,false);
});
test('evaluation use is distinct from model training; actual-run metadata is required and repeated events deduplicate',async t=>{
  const {store}=await fixture(t);const {id}=await store.append('모델용 질문');
  await assert.rejects(store.markModelUsage({ids:[id],role:'training',modelVersion:'m1',datasetVersion:'d1'}));
  await store.markReviewed({id,category:'ready',annotationFile:'training/reviews/v1.json',annotationVersion:'v1'});
  await store.markModelUsage({ids:[id],role:'evaluation',modelVersion:'m1',datasetVersion:'d1'});
  assert.equal((await store.conversations())[0].trainingStatus,'not_used');
  await store.markModelUsage({ids:[id],role:'training',modelVersion:'m1',datasetVersion:'d1'});
  const before=(await store.readLines(store.file)).length;
  await store.markModelUsage({ids:[id],role:'training',modelVersion:'m1',datasetVersion:'d1'});
  assert.equal((await store.readLines(store.file)).length,before);assert.equal((await store.conversations({training:'used'})).length,1);
});
test('review import keeps an immutable annotation snapshot, skips unreviewed data and remains idempotent',async t=>{
  const {dir,store}=await fixture(t);const a=await store.append('정리한 질문'),b=await store.append('아직 모르는 질문');
  await fs.mkdir(path.join(dir,'training'));
  const file=path.join(dir,'training/annotations.json');
  await fs.writeFile(file,JSON.stringify([{sourceId:a.id,input:'정리한 질문',category:'ready'},{sourceId:b.id,input:'아직 모르는 질문',category:'unreviewed'}]));
  const result=await applyReviews(dir);assert.equal(result.reviewed,1);assert.equal(result.pending,1);assert.equal(result.trainingUsed,0);
  assert.equal((await applyReviews(dir)).newReviewEvents,0);
  const reviewed=(await store.conversations({review:'reviewed'}))[0];assert(await fs.readFile(path.join(dir,reviewed.reviewSource),'utf8'));
  await fs.writeFile(file,JSON.stringify([{sourceId:a.id,input:'다른 원문',category:'ready'}]));await assert.rejects(applyReviews(dir));
});
