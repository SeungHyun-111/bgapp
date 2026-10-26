const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs/promises');
const os=require('os');
const path=require('path');
const {QueryPlanner}=require('../src/planner/query-planner');
const {loadPlannerCatalog}=require('../src/planner/catalog-loader');
const {createFakeExecutor}=require('../src/planner/fake-bi-executor');
const {syntheticRows}=require('../src/planner/synthetic-fixtures');
const {CorrectionStore,confirmedChanges}=require('../src/learning/corrections');
const {samplesFor,partition}=require('../src/learning/dataset-builder');
const {SemanticCatalog}=require('../src/planner/semantic-catalog');
const {LearningSupervisor}=require('../src/learning/supervisor');
const {promote}=require('../src/learning/promotion');
const {fileHash}=require('../src/learning/files');
const {gate}=require('./evaluate-qwen-candidate');
const catalog=loadPlannerCatalog(path.resolve(__dirname,'../data'));
const entities=require('../data/bi-entity-catalog.json').entities;
const plan={operation:'aggregate',target:{kind:'brand',value:'레이델'},fields:[],metrics:['weighted_minutes'],filters:[{field:'BO[방송일시]',operator:'gte',value:'2026-01-01'},{field:'BO[방송일시]',operator:'lt',value:'2027-01-01'}],groupBy:[{field:'BO[방송일시]',unit:'month'}],sort:[],limit:30,share:null};
async function fixture(){
  const responses=[{action:'new',patch:plan},{action:'modify',patch:{metrics:['broadcast_count']},interpretation:{kind:'correction',fields:[{path:'/metrics/0',quote:'방송횟수',source:'explicit_user_correction'},{path:'/target/value',quote:'레이델',source:'model_inference'}]}}];
  const planner=new QueryPlanner({provider:{complete:async()=>{const response=responses.shift();if(response.interpretation)response.interpretation.refersToTurnId=planner.acceptedTurns[0].turnId;return response;}},catalog,entities,executor:createFakeExecutor({catalog,entities,rows:syntheticRows()}),maxRepairs:0});
  await planner.run('레이델 올해 얼마나 자주 밀어줬어?');
  const result=await planner.run('아니 방송횟수');return {planner,result,event:planner.lastEvent};
}
test('structured correction immediately reexecutes, preserves conditions, and confirms only the changed scalar',async()=>{
  const {result,event}=await fixture();assert.equal(result.kind,'result');
  assert.deepEqual(result.plan.metrics,['broadcast_count']);assert.deepEqual(result.plan.filters,plan.filters);assert.deepEqual(result.plan.target,plan.target);assert.deepEqual(result.plan.groupBy,plan.groupBy);
  assert.equal(event.queryExecuted,true);assert.equal(event.fieldValidation.wholePlanUserConfirmed,false);
  assert.deepEqual(event.fieldValidation.confirmedFields.map(f=>f.path),['/metrics/0']);
  assert.equal(event.fieldValidation.provenance['/target/value'],undefined);
  assert.equal(result.result.rows[0].broadcast_count,1); // two product rows at the same timestamp
});
test('correction queue retains source/context and never treats inferred fields or an entire array as gold',async()=>{
  const {event}=await fixture(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'qwen-correction-'));
  try{
    const store=new CorrectionStore(dir);assert.equal((await store.capture(event)).queued,true);assert.equal((await store.capture(event)).queued,false);
    const records=await store.records();assert.equal(records.length,1);const record=records[0];
    assert.equal(record.originalInput,'레이델 올해 얼마나 자주 밀어줬어?');assert.equal(record.wholePlanUserConfirmed,false);
    const samples=samplesFor(record);assert.equal(samples.length,2);
    assert(samples.every(s=>s.supervisedPaths.length===1&&s.supervisedPaths[0]==='/patch/metrics/0'));
    const broken=structuredClone(event);broken.rawPrediction.interpretation.fields[0].quote='not actually said';assert.deepEqual(confirmedChanges(broken),[]);
    broken.rawPrediction.interpretation.fields[0]={path:'/metrics',quote:'방송횟수',source:'explicit_user_correction'};assert.deepEqual(confirmedChanges(broken),[]);
    broken.rawPrediction.interpretation.fields[0]={path:'/metrics/length',quote:'방송횟수',source:'explicit_user_correction'};assert.deepEqual(confirmedChanges(broken),[]);
    broken.validation.ok=false;assert.equal((await store.capture(broken)).queued,false);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('train/holdout split groups original/followup pairs, including repeated questions across conversations',async()=>{
  const {event}=await fixture(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'qwen-split-'));
  try{
    const store=new CorrectionStore(dir);await store.capture(event);const record=(await store.records())[0];
    const records=Array.from({length:60},(_,i)=>({...structuredClone(record),id:'r'+i,originalInput:'independent context '+i}));
    const split=partition(records);assert.equal(split.ready,true);
    const held=new Set(split.holdout.map(s=>s.groupId));assert(split.train.every(s=>!held.has(s.groupId)));
    const duplicate={...record,id:'different-turn',conversationId:'other'};
    assert.equal(samplesFor(duplicate)[0].groupId,samplesFor(record)[0].groupId);
    const grown=partition([...records,{...record,id:'more',originalInput:'another independent context'}]);
    assert(split.holdout.every(s=>grown.holdout.some(g=>g.groupId===s.groupId)));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('semantic retrieval asks a model about descriptions and returns candidates, never an executable metric decision',async()=>{
  let calls=0;
  const semantic=new SemanticCatalog({catalog:{metrics:{m:{id:'m',label:'등록 지표',aliases:[],businessMeaning:'frequency definition',definition:{verified:true},status:'user-confirmed'}},tables:[]},provider:{complete:async args=>{calls++;assert(args.messages[1].content.includes('frequency definition'));return {candidates:[{id:'invented',reason:'invalid'},{id:'m',reason:'semantic evidence'}]};}}});
  const result=await semantic.search({query:'an expression absent from every alias'});assert.equal(result.mode,'local_qwen_semantic');assert.equal(result.automaticSelection,false);assert.deepEqual(result.candidates.map(c=>c.id),['m']);
  await semantic.search({query:'an expression absent from every alias'});assert.equal(calls,1);
});
test('promotion gate fails closed for empty evaluations, regressions, invalid output and lack of actual improvement',()=>{
  const cases=[{id:'a',category:'regression',passed:true,allSchema:true},{id:'b',category:'replay',sequence:true,passed:false,allSchema:true},{id:'c',category:'holdout',sequence:true,passed:false,allSchema:true}];
  const old={completed:true,cases},next={completed:true,cases:cases.map(c=>({...c,passed:true}))};
  assert.equal(gate(old,next).passed,true);assert.equal(gate({completed:true,cases:[]},{completed:true,cases:[]}).passed,false);
  assert.equal(gate(old,old).passed,false);next.cases[0].passed=false;assert.equal(gate(old,next).passed,false);
});
test('failed model activation rolls back the pointer and leaves both immutable GGUF files intact',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'qwen-promotion-'));
  try{
    const old=path.join(dir,'old.gguf'),next=path.join(dir,'candidate.gguf');await fs.writeFile(old,'GGUFold-fixture');await fs.writeFile(next,'GGUFcandidate-fixture');
    const used=[];const client={external:false,inFlight:0,findModel:()=>old,useModel:async file=>{used.push(file);if(file===next)throw Error('simulated load failure');}};
    const candidate={id:'fixture-only',modelPath:next,baselineModel:old,baselineSha256:await fileHash(old),sha256:await fileHash(next),evaluation:{passed:true},training:{completed:true,adapterUpdateL2:1}};
    await assert.rejects(promote({directory:path.join(dir,'state'),client,candidate,allowedModelRoot:dir}));
    assert.deepEqual(used,[next,old]);assert.equal(await fs.readFile(old,'utf8'),'GGUFold-fixture');assert.equal(await fs.readFile(next,'utf8'),'GGUFcandidate-fixture');
    assert.equal(JSON.parse(await fs.readFile(path.join(dir,'state/active-model.json'),'utf8')).modelPath,old);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('automatic training disabled by configuration never spawns a worker or alters the inference model',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'qwen-disabled-'));
  try{
    const worker=new LearningSupervisor({dataDirectory:dir,client:{findModel:()=>{throw Error('must not inspect model');}},config:{QWEN_AUTO_TRAIN:'false'}});
    await worker.tick();assert.equal(worker.child,null);assert.equal(JSON.parse(await fs.readFile(path.join(dir,'learning/status.json'),'utf8')).stage,'paused_by_configuration');worker.stop();
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
