// Runs only when explicitly invoked by the learning worker. Never connects to BI.
const fs=require('fs/promises');
const path=require('path');
const net=require('net');
const {LocalLlmClient}=require('../src/planner/local-llm-client');
const {QueryPlanner}=require('../src/planner/query-planner');
const {SemanticCatalog}=require('../src/planner/semantic-catalog');
const {createFakeExecutor}=require('../src/planner/fake-bi-executor');
const {syntheticRows}=require('../src/planner/synthetic-fixtures');
const {applyTurn}=require('../src/planner/dialogue-state');
const {get,set,equal}=require('../src/learning/json-fields');
const {atomicJson}=require('../src/learning/files');
const {loadPlannerCatalog}=require('../src/planner/catalog-loader');
async function lines(file){return (await fs.readFile(file,'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);}
function normalized(value){
  if(Array.isArray(value))return value.map(normalized);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,normalized(value[k])]));
  return value;
}
function planEqual(a,b){
  if(!a||!b)return false;
  const clean=p=>{p=structuredClone(p);delete p.limit;delete p.sort;p.share??=null;p.target??=null;p.metrics?.sort();p.filters?.sort((x,y)=>JSON.stringify(normalized(x)).localeCompare(JSON.stringify(normalized(y))));return normalized(p);};
  return equal(clean(a),clean(b));
}
function correctionCases(samples,category){
  const groups=new Map();for(const s of samples){if(!groups.has(s.groupId))groups.set(s.groupId,[]);groups.get(s.groupId).push(s);}
  const out=[];
  for(const [id,items] of groups){
    const original=items.find(s=>s.kind==='corrected_original'),followup=items.find(s=>s.kind==='correction_followup');
    if(original&&followup)out.push({id:category+':'+id,category,steps:[{text:original.text,initialState:original.previousState,expectedFields:original.expectedFields},{text:followup.text,expectedFields:followup.expectedFields,preserveOtherFields:true}],sequence:true});
    else for(const s of items)out.push({id:category+':'+s.id,category,steps:[{text:s.text,initialState:s.previousState,expectedFields:s.expectedFields}],sequence:false});
  }
  return out;
}
async function makeCases(job){
  const curated=await lines(job.regressionFile),regressions=[];
  for(const row of curated){
    const user=row.messages.filter(m=>m.role==='user').at(-1),answer=row.messages.filter(m=>m.role==='assistant').at(-1);
    if(!user||!answer)throw Error('Incomplete curated regression');
    const input=JSON.parse(user.content),gold=JSON.parse(answer.content);
    const initialState=input.previousState||{plan:null,pending:null};
    regressions.push({id:'regression:'+row.sampleId,category:'regression',steps:[{text:input.text,initialState,todayKorea:input.todayKorea,expectedTurn:gold}]});
  }
  if(!regressions.length)throw Error('A nonempty curated regression set is required');
  return [...regressions,...correctionCases(await lines(job.replayFile),'replay'),...correctionCases(await lines(job.holdoutFile),'holdout')];
}
const freePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(e=>e?reject(e):resolve(port));});});
async function evaluate(job,modelPath,label){
  const catalog=loadPlannerCatalog(job.dataDirectory);
  const entities=JSON.parse(await fs.readFile(path.join(job.dataDirectory,'bi-entity-catalog.json'),'utf8')).entities;
  const client=new LocalLlmClient({directory:path.join(job.dataDirectory,'llm'),modelPath,activeManifest:false,port:await freePort(),baseUrl:null});
  const cases=await makeCases(job),results=[];
  try{
    for(const c of cases){
      const today=c.steps[0].todayKorea||job.todayKorea;
      const planner=new QueryPlanner({provider:client,catalog,entities,semanticCatalog:new SemanticCatalog({catalog,provider:client}),executor:createFakeExecutor({catalog,entities,rows:syntheticRows()}),now:()=>new Date((today||'2026-01-01')+'T00:00:00Z'),maxRepairs:2});
      let passed=true,allSchema=true;const steps=[];
      for(const step of c.steps){
        if(step.initialState)planner.state=structuredClone(step.initialState);
        const before=structuredClone(planner.state),reply=await planner.run(step.text),event=planner.lastEvent;
        let ok;
        if(step.expectedTurn){
          const expected=applyTurn(before,step.expectedTurn);
          ok=expected.pending?reply.kind==='clarify':expected.cancelled?reply.kind==='cancelled':event.validation?.ok&&planEqual(event.finalPlan,expected.plan);
        }else{
          ok=Boolean(event.validation?.ok)&&step.expectedFields.every(f=>equal(get(event.finalPlan,f.path),f.value));
          if(ok&&step.preserveOtherFields){
            const expected=structuredClone(before.plan);
            try{for(const f of step.expectedFields)set(expected,f.path,f.value);ok=planEqual(expected,event.finalPlan);}catch{ok=false;}
          }
        }
        const schemaValid=!['invalid','error'].includes(reply.kind)||Boolean(event.validation?.ok);
        passed=passed&&Boolean(ok);allSchema=allSchema&&schemaValid;
        steps.push({text:step.text,passed:Boolean(ok),schemaValid,plan:event.finalPlan||null,kind:reply.kind,error:event.error||null});
      }
      results.push({id:c.id,category:c.category,sequence:Boolean(c.sequence),passed,allSchema,steps});
      await atomicJson(path.join(job.directory,label+'-evaluation.json'),{modelPath,cases:results,completed:false});
    }
  }finally{await client.close();}
  const report={modelPath,cases:results,completed:true};await atomicJson(path.join(job.directory,label+'-evaluation.json'),report);return report;
}
function gate(baseline,candidate){
  const reasons=[];
  if(!baseline?.completed||!candidate?.completed)reasons.push('incomplete real model evaluation');
  const old=new Map((baseline?.cases||[]).map(c=>[c.id,c])),next=candidate?.cases||[];
  if(!next.length||next.length!==old.size||new Set(next.map(c=>c.id)).size!==next.length||next.some(c=>!old.has(c.id)))reasons.push('evaluation cases mismatch');
  for(const category of ['regression','replay','holdout'])if(!next.some(c=>c.category===category))reasons.push('missing '+category+' evaluation');
  if(!next.some(c=>c.sequence))reasons.push('missing actual multi-turn evaluation');
  if(next.some(c=>!c.allSchema))reasons.push('candidate produced invalid structured output');
  if(next.some(c=>old.get(c.id)?.passed&&!c.passed))reasons.push('previously passing case regressed');
  if(next.some(c=>c.category==='replay'&&!c.passed))reasons.push('corrected training contexts are not reproduced');
  if(next.some(c=>c.category==='holdout'&&!c.passed))reasons.push('independent held-out corrections are not passed');
  if(!next.some(c=>c.category!=='regression'&&c.passed&&!old.get(c.id)?.passed))reasons.push('no correction improvement over the active model');
  return {passed:!reasons.length,reasons,independentHoldout:true,trainingReplayIsNotIndependentAccuracy:true};
}
if(require.main===module)(async()=>{const [jobFile,model,label]=process.argv.slice(2);const job=JSON.parse(await fs.readFile(jobFile,'utf8'));await evaluate(job,model,label);})().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={evaluate,gate,planEqual,correctionCases};
