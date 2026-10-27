const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs/promises');
const os=require('os');
const path=require('path');
const {QueryStore}=require('../src/commands/query-store');
const {createGeminiDialogue,validateOutput}=require('../src/gemini/dialogue');
const {branchContext,clarificationState}=require('../src/gemini/conversation-context');
const {createExecutor}=require('../src/gemini/analysis-engine');
const {loadCatalog}=require('../src/gemini/catalog');
const {GeminiClient}=require('../src/gemini/client');
const catalog=loadCatalog().catalog;
const schema={type:'object',properties:{ready:{type:'boolean',enum:[true]}},required:['ready'],additionalProperties:false};
const period={start:'2026-08-01',endExclusive:'2026-09-01',timezone:'Asia/Seoul'};
const plan=()=>({period:{...period},target:{type:'brand',value:'가전'},formula:{operator:'sum',field:'field:가중분'},outputFormat:'number',groupBy:[]});
const response=(action='reply',overrides={})=>({action,conversation:{mode:'continue',reset:false},message:action==='execute'?null:'안녕',plan:action==='execute'?plan():null,responseTemplate:action==='execute'?'합계 {{value}}':null,...overrides});
const SENTINEL=987654321.125;
async function fixture(t,answer){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'usagi-boundaries-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const store=new QueryStore(directory),calls=[],events=[];
  const client={model:'test',create:async args=>{
    const input=JSON.parse(args.input);calls.push({...args,input});
    if(input.kind==='BASE'){
      assert.deepEqual(args.responseSchema,schema);
      return {id:'base-'+calls.length,output:{ready:true}};
    }
    assert.equal(args.responseSchema,undefined,'Question and repair calls must use the original unconstrained JSON mode');
    const output=await answer(input,args,calls);
    return {id:'turn-'+calls.length,output};
  }};
  const executor=createExecutor({beforeQuery:async()=>events.push('auth'),query:async dax=>{
    events.push('query');
    const raw=Object.fromEntries([...dax.matchAll(/"raw(\d+)", 'BO'\[([^\]]+)\]/g)].map(([,i,name])=>['[raw'+i+']',name==='가중분'?SENTINEL:name==='방송일시'?'2026-08-03T10:00:00':'[가전]상품']));
    return {results:[{tables:[{rows:[raw]}]}]};
  }});
  return {directory,store,calls,events,dialogue:createGeminiDialogue({directory,store,client,executor})};
}

test('GeminiClient serializes responseSchema into the actual API request',async t=>{
  const previous=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-only';
  t.after(()=>{if(previous===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previous;});
  let body;
  const client=new GeminiClient({fetchImpl:async(_url,options)=>{
    body=JSON.parse(options.body);
    return {ok:true,json:async()=>({status:'completed',id:'test',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(response())}]}]})};
  }});
  await client.create({input:'hello',previousId:'parent',responseSchema:schema});
  assert.deepEqual(body.response_format.schema,schema);
  assert.equal(body.response_format.mime_type,'application/json');
  assert.equal(body.previous_interaction_id,'parent');
});

test('HTTP 400 schema-complexity diagnosis is safe and does not blame the API key or quota',async t=>{
  const previous=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-only';
  t.after(()=>{if(previous===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previous;});
  const client=new GeminiClient({fetchImpl:async()=>({ok:false,status:400,json:async()=>({error:{message:'The specified schema produces a constraint that has too many states for serving. private-provider-detail'}})})});
  await assert.rejects(client.create({input:'hello',responseSchema:schema}),error=>{
    assert.equal(error.code,'GEMINI_SCHEMA_TOO_COMPLEX');
    assert(!error.message.includes('private-provider-detail'));
    assert(!error.message.includes('사용 한도'));
    return true;
  });
});

test('follow-up/repair uses original JSON mode and projected Plan context; full results stay in learning logs',async t=>{
  let questions=0;
  const f=await fixture(t,input=>{
    if(input.kind==='validation_feedback')return response('execute');
    if(questions++===0)return response('execute');
    const previous=input.appContext.at(-1);
    assert.deepEqual(previous.plan.period,period);
    assert.equal(previous.plan.target.value,'가전');
    assert.equal(previous.plan.formula.field,'field:가중분');
    assert.equal(previous.executionStatus,'executed');
    return response('reply',{message:''}); // Existing second validator requests repair.
  });
  await f.dialogue.execute('8월 가전 가중분');
  await f.dialogue.execute('그럼 9월은?');
  assert.equal(f.events.filter(e=>e==='auth').length,2);
  assert(f.calls.some(c=>c.input.kind==='validation_feedback'));
  for(const call of f.calls){
    const encoded=JSON.stringify(call.input);
    assert(!encoded.includes('calculationResult'));
    assert(!encoded.includes('finalAnswer'));
    assert(!encoded.includes(String(SENTINEL)));
  }
  const logs=await f.store.readLines(f.store.file);
  assert.equal(logs[0].calculationResult.rows[0].value,SENTINEL);
  assert.match(logs[0].finalAnswer,/987,654,321/);
  assert.equal(logs[1].context[0].calculationResult.rows[0].value,SENTINEL);
  assert.equal(logs[1].context[0].finalAnswer,logs[0].finalAnswer);
  assert.equal(logs[0].confirmed,false);
});

test('expired interaction restores only projected context in original JSON mode and does not replay BI',async t=>{
  let questions=0;
  const f=await fixture(t,input=>{
    if(questions++===0)return response('execute');
    if(questions===2)throw Object.assign(Error('expired'),{code:'GEMINI_STATE_EXPIRED'});
    assert.deepEqual(input.appContext[0].plan.period,period);
    assert(!JSON.stringify(input).includes('finalAnswer'));
    assert(!JSON.stringify(input).includes(String(SENTINEL)));
    return response('reply');
  });
  await f.dialogue.execute('8월 가전 가중분');
  await f.dialogue.execute('이번엔 가전으로');
  assert.equal(f.calls.filter(c=>c.input.kind==='BASE').length,2);
  assert.deepEqual(f.events,['auth','query']);
  const logs=await f.store.readLines(f.store.file);
  assert.equal(logs[1].contextRestored,true);
});

test('clarification survives expiry and new-branch interpretation uses original JSON mode',async t=>{
  let questions=0;
  const f=await fixture(t,input=>{
    questions++;
    if(questions===1)return response('clarify',{message:'어느 기간?',plan:{target:plan().target,formula:plan().formula}});
    if(questions===2)throw Object.assign(Error('expired'),{code:'GEMINI_STATE_EXPIRED'});
    if(questions===3){
      assert.equal(input.pendingClarification.question,'어느 기간?');
      assert.equal(input.pendingClarification.partialPlan.target.value,'가전');
      return response('reply',{conversation:{mode:'new',reset:false}});
    }
    assert.deepEqual(input.appContext,[]);
    assert.equal(input.pendingClarification,null);
    return response();
  });
  await f.dialogue.execute('가전 가중분');
  await f.dialogue.execute('안녕');
  assert.deepEqual(f.events,[]);
  assert.equal(questions,4);
});

test('projection drops old result/answer/source fields including unexpected nested metadata',()=>{
  const dirty={turnId:'old',question:'가중분 말고 취급액',gemini:response('execute',{plan:{...plan(),calculationResult:{value:SENTINEL}}}),validation:{ok:true},actualExecution:'executed',sourceRows:[{value:SENTINEL}],calculationResult:{value:SENTINEL},finalAnswer:String(SENTINEL)};
  const encoded=JSON.stringify(branchContext({turns:[dirty]}));
  assert(!encoded.includes(String(SENTINEL)));
  assert(!encoded.includes('finalAnswer'));
  assert.equal(clarificationState({partialPlan:dirty.gemini.plan}).partialPlan.calculationResult,undefined);
});

test('pre-projection saved interactions are renewed once without losing local full history',async t=>{
  const f=await fixture(t,()=>response('execute'));
  await f.dialogue.execute('8월 가전 가중분');
  const file=path.join(f.directory,'gemini-conversation-state.json');
  const saved=JSON.parse(await fs.readFile(file,'utf8'));
  delete saved.contextPolicyVersion;
  const oldId=saved.branches[saved.activeBranchId].lastInteractionId;
  await fs.writeFile(file,JSON.stringify(saved));
  let initialized=false;
  const client={create:async args=>{
    const input=JSON.parse(args.input);
    if(input.kind==='BASE'){initialized=true;return {id:'clean-base',output:{ready:true}};}
    assert(initialized);
    assert.notEqual(args.previousId,oldId);
    assert.equal(args.previousId,'clean-base');
    assert.equal(input.appContext[0].plan.target.value,'가전');
    assert(!JSON.stringify(input).includes(String(SENTINEL)));
    return {id:'clean-turn',output:response()};
  }};
  const dialogue=createGeminiDialogue({directory:f.directory,store:f.store,client});
  await dialogue.execute('그럼 9월은?');
  const state=JSON.parse(await fs.readFile(file,'utf8'));
  assert.equal(state.contextPolicyVersion,2);
  assert.equal(state.branches[saved.activeBranchId].turns[0].calculationResult.rows[0].value,SENTINEL);
});

test('multiple datasets authenticate once; failed authentication never queries',async()=>{
  const events=[];
  const executor=createExecutor({beforeQuery:async()=>events.push('auth'),query:async()=>{events.push('query');return {results:[{tables:[{rows:[]}]}]};}});
  await executor.execute({plan:{datasets:[{id:'a',period},{id:'b',period}],calculations:[{id:'n',formula:{operator:'count'}}]},catalog,responseTemplate:'{{value}}',signal:new AbortController().signal,record:{}});
  assert.deepEqual(events,['auth','query','query']);
  const broken=createExecutor({beforeQuery:async()=>{throw Error('no login');},query:async()=>assert.fail('query before login')});
  await assert.rejects(broken.execute({plan:plan(),catalog,responseTemplate:'{{value}}',signal:new AbortController().signal,record:{}}),/no login/);
});

test('repair retains original feedback contract; failed question remains follow-up context',async t=>{
  let requests=0;
  const broken=response('execute',{plan:{datasets:[{id:'a',period:'2026',target:'라포레',filters:['청소기']}],calculations:[{id:'n',formula:'sum(field:가중분)'}]}});
  const f=await fixture(t,input=>{
    requests++;
    if(input.kind==='validation_feedback'){
      assert.equal(input.formatErrors,undefined);
      assert.equal(input.proposed.plan.datasets[0].period,'2026');
      assert.match(input.error,/날짜/);
      return broken;
    }
    if(requests===1)return broken;
    assert.equal(input.appContext.at(-1).question,'라포레 실적');
    assert.equal(input.appContext.at(-1).executionStatus,'failed');
    assert.equal(input.appContext.at(-1).plan,null);
    return response('clarify',{message:'라포레의 어떤 지표를 볼까요?'});
  });
  const failed=await f.dialogue.execute('라포레 실적');
  assert.match(failed.message,/날짜/);
  await f.dialogue.execute('26년');
  assert.deepEqual(f.events,[]);
  const logs=await f.store.readLines(f.store.file);
  assert.equal(logs[1].parentTurnId,logs[0].turnId);
  assert.equal(logs[0].confirmed,false);
});
