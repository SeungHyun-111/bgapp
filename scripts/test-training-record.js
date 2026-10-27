const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs/promises');
const os=require('os');
const path=require('path');
const {QueryStore}=require('../src/commands/query-store');
const {finalizeTrainingRecord}=require('../src/learning/training-record');
test('successful execution remains unconfirmed; explicit reviews can be withdrawn',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'usagi-training-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const store=new QueryStore(directory);
  const plan={target:{type:'organization',value:'team'},calculations:[{operator:'sum',operand:{operator:'metric',metric:'weighted_minutes'}}]};
  const record=finalizeTrainingRecord({recordType:'conversation',id:'turn',input:'question',action:'execute',stage:'completed',validation:{ok:true},geminiPlan:plan,queryExecuted:true,executionAttempted:true});
  assert.equal(record.confirmed,false);assert.equal(record.finalPlan,null);assert.equal(record.execution.succeeded,true);
  await store.appendLine(store.file,record);
  await assert.rejects(store.reviewTraining({id:'turn',status:'confirmed',reviewer:'human',reason:'checked'}),/final plan/);
  await store.reviewTraining({id:'turn',status:'confirmed',finalPlan:plan,reviewer:'human',reason:'checked against expected result'});
  let [saved]=await store.conversations();
  assert.equal(saved.confirmed,true);assert.deepEqual(saved.labels.metrics,['weighted_minutes']);
  assert.equal(saved.reviewStatus,'unreviewed');
  await store.reviewTraining({id:'turn',status:'incorrect',reviewer:'human',reason:'wrong scope'});
  [saved]=await store.conversations();assert.equal(saved.confirmed,false);assert.equal(saved.finalPlan,null);
  assert.equal((await store.readLines(store.file)).filter(r=>r.recordType==='training_review_event').length,2);
});
test('partial source query success is not complete execution',()=>{
  const record=finalizeTrainingRecord({input:'question',action:'execute',stage:'source_query',queryExecuted:true,error:{message:'second dataset failed'},validation:{ok:true}});
  assert.equal(record.execution.succeeded,false);assert.equal(record.confirmed,false);
});
test('Gemini logging preserves original response before repair and prior context',async t=>{
  const {createGeminiDialogue}=require('../src/gemini/dialogue');
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'usagi-gemini-log-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const store=new QueryStore(directory);
  let calls=0;
  const client={create:async()=>{
    calls++;
    return {id:'response-'+calls,model:'test',output:calls===1?{ready:true}:calls===2?{action:'reply',plan:null,message:''}:{action:'reply',plan:null,message:'answer'}};
  }};
  const dialogue=createGeminiDialogue({directory,store,client});
  await dialogue.execute('first');
  await dialogue.execute('second');
  const [first,second]=await store.readLines(store.file);
  assert.equal(first.initialModelResponse.message,'');
  assert.equal(first.planRepairs.length,1);
  assert.equal(first.finalAnswer,'answer');
  assert.equal(first.confirmed,false);
  assert.equal(second.parentTurnId,first.turnId);
  assert.equal(second.context[0].question,'first');
});
