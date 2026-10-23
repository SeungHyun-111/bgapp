// Local-only closed loop. No Power BI connection or model downloads.
const fs=require('fs');
const path=require('path');
const {spawn}=require('child_process');
const {createHash}=require('crypto');
const {buildReviewedNlu}=require('./build-reviewed-nlu');
const {applyReviews}=require('./mark-reviewed-conversations');
const {QueryStore}=require('../src/commands/query-store');
const {RasaClient}=require('../src/commands/rasa-client');
const {interpretQuery}=require('../src/commands/query-interpreter');
const {resolveEntities}=require('../src/commands/entity-resolver');
const root=path.resolve(__dirname,'..');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function run(exe,args,options={}){return new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],...options});
  const log=fs.createWriteStream(path.join(root,'nlu/results/training.log'),{flags:'a'});
  child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
  child.on('error',reject);child.on('close',code=>{log.end();code===0?resolve():reject(Error('Local training command failed: '+code+'; see nlu/results/training.log'));});
});}
async function evaluate(file,samples){
  const client=new RasaClient({modelPath:file});const results=[];
  try{for(const s of samples){
    const parsed=await client.parse(s.input);
    const q=interpretQuery(s.input,parsed,{metrics:['organization_weighted_share'],period:{year:2026,month:6}},new Date('2026-10-23T00:00:00Z'));
    const p=s.gold?.patch;
    let pass=!q.unsupported&&q.recognized&&q.action===s.intent;
    if(s.group==='organization_share_ranking'){
      if(s.desired?.action==='modify'&&s.desired.period&&!s.desired.metrics){
        // This utterance changes only the month. Organization grouping belongs
        // to the previous state, not to slots invented for the new utterance.
        const {Dialogue}=require('../src/commands/dialogue');const calls=[];
        const dialogue=new Dialogue({nlu:{parse:async()=>parsed},store:{append:async()=>({id:'fixture'})},getEntities:async()=>[],queryMetric:async r=>{calls.push(r);return {basis:'fixture',values:[]};}});
        dialogue.lastActivity=Date.now();dialogue.state={target:{kind:'organization_group',field:'표준조직',value:'전체 조직'},metrics:['organization_weighted_share'],metric:'organization_weighted_share',groupBy:'organization',period:{year:2026,month:6}};
        await dialogue.execute(s.input);pass=pass&&calls[0]?.period.month===9&&calls[0]?.groupBy==='organization'&&calls[0]?.target.kind==='organization_group';
      }else pass=pass&&q.targetScope==='organizations'&&q.groupBy==='organization'&&(s.desired.limit!==1||q.limit===1);
    }
    else if(p?.metrics)pass=pass&&p.metrics.every(m=>q.metrics.includes(m));
    else if(p?.target){
      const calls=[];
      const {Dialogue}=require('../src/commands/dialogue');
      const dialogue=new Dialogue({nlu:{parse:async()=>parsed},store:{append:async()=>({id:'fixture'})},getEntities:async()=>[{kind:'organization',field:'표준조직',value:'문화서비스'},{kind:'organization',field:'표준조직',value:'편성팀'}],queryMetric:async r=>{calls.push(r);return {basis:'fixture',values:[]};}});
      dialogue.lastActivity=Date.now();dialogue.state={target:{kind:'organization',field:'표준조직',value:'편성팀'},metrics:['organization_weighted_share'],metric:'organization_weighted_share',period:{year:2026},groupBy:'month'};
      await dialogue.execute(s.input);
      pass=pass&&q.correction&&calls[0]?.target.value===p.target.value&&calls[0]?.groupBy==='month'&&calls[0]?.period.year===2026;
    }
    else pass=pass&&q.period.groupBy==='month';
    results.push({id:s.id,input:s.input,pass,intent:parsed.intent,query:q});
  }const regression=await require('./evaluate-query-understanding').evaluate(file,client);
  return {modelVersion:client.modelVersion,results,passed:results.filter(r=>r.pass).length,regression};}finally{client.stop();}
}
async function main(){
  fs.mkdirSync(path.join(root,'nlu/results'),{recursive:true});
  const lock=path.join(root,'nlu/results/learning.lock');
  if(fs.existsSync(lock)){
    const pid=Number(fs.readFileSync(lock,'utf8'));
    if(!Number.isInteger(pid)||pid<=0)throw Error('Invalid learning lock');
    try{process.kill(pid,0);console.log('Learning already running');return;}catch(e){if(e.code!=='ESRCH')throw e;fs.unlinkSync(lock);}
  }
  const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,String(process.pid));
  try{
    await applyReviews(path.join(root,'data'));
    const dataset=buildReviewedNlu();
    if(!dataset.samples.length)throw Error('No reviewed supported examples');
    const active=path.join(root,'nlu/models/usagi.tar.gz');
    const stateFile=path.join(root,'data/training/active-nlu.json');
    const previous=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)):null;
    if(previous?.datasetVersion===dataset.datasetVersion&&previous.modelVersion===hash(active)){console.log('Reviewed data already active');return;}
    const baseline=await evaluate(active,dataset.samples);
    const evaluateOnly=process.argv.includes('--evaluate-only');
    if(!evaluateOnly){
    await run(process.execPath,['scripts/generate-bi-training.js']);
    await run(process.execPath,['scripts/generate-query-understanding.js']);
    const temp=path.join(process.env.PUBLIC||'C:/Users/Public','usagi-nlu-temp');fs.mkdirSync(temp,{recursive:true});
    // Verify file discovery, rather than assuming a generated .yml was consumed.
    const check="import sys,json; from rasa.shared.nlu.training_data.loading import load_data; data=load_data(sys.argv[1]); expected=json.load(open(sys.argv[2],encoding='utf-8')); actual={(e.get('text'),e.get('intent')) for e in data.training_examples}; assert all((s['input'].replace('\\n',' '),s['intent']) in actual for s in expected['samples']), 'Reviewed examples missing from Rasa input'; print('Verified reviewed Rasa examples:',len(expected['samples']))";
    await run(path.join(root,'.venv-rasa/Scripts/python.exe'),['-c',check,path.join(root,'nlu/data'),path.join(root,'data/training/nlu-dataset.json')],{env:{...process.env,RASA_TELEMETRY_ENABLED:'false',PYTHONIOENCODING:'utf-8'}});
    await run(path.join(root,'.venv-rasa/Scripts/python.exe'),['run_rasa.py','train','nlu','--config','config.yml','--nlu','data','--out','models/candidates','--fixed-model-name','reviewed'],{cwd:path.join(root,'nlu'),env:{...process.env,TEMP:temp,TMP:temp,TF_NUM_INTRAOP_THREADS:'1',TF_NUM_INTEROP_THREADS:'1',OMP_NUM_THREADS:'1',RASA_TELEMETRY_ENABLED:'false',SQLALCHEMY_SILENCE_UBER_WARNING:'1',PYTHONIOENCODING:'utf-8'}});
    }
    const candidate=path.join(root,'nlu/models/candidates/reviewed.tar.gz');
    const version=hash(candidate),store=new QueryStore(path.join(root,'data'));
    if(evaluateOnly){
      const records=await store.conversations();
      if(dataset.samples.some(s=>!records.find(r=>r.id===s.id)?.trainingRuns.some(r=>r.modelVersion===version&&r.datasetVersion===dataset.datasetVersion)))throw Error('Evaluation-only requires a candidate trained with this exact reviewed dataset');
    }else await store.markModelUsage({ids:dataset.samples.map(s=>s.id),role:'training',modelVersion:version,datasetVersion:dataset.datasetVersion});
    const report=await evaluate(candidate,dataset.samples);
    const regression=report.regression,oldRegression=baseline.regression;
    const accepted=report.results.every(r=>r.pass)&&baseline.results.every(r=>!r.pass||report.results.find(n=>n.id===r.id)?.pass)&&regression.results.every(r=>r.pass)&&regression.transitions.every(r=>r.pass)&&oldRegression.results.every(r=>!r.pass||regression.results.find(n=>n.text===r.text)?.pass);
    const result={timestamp:new Date().toISOString(),datasetVersion:dataset.datasetVersion,modelVersion:version,previousModelVersion:baseline.modelVersion,accepted,baseline,report,regressionPassed:regression.passed,baselineRegressionPassed:oldRegression.passed,note:'Reviewed training examples are training-fit checks, not held-out accuracy. Additional phrasing/context checks are development regression tests. No BI access.'};
    fs.writeFileSync(path.join(root,'nlu/results/reviewed-learning.json'),JSON.stringify(result,null,2));
    if(!accepted)throw Error('Candidate not activated: local regression checks failed; see nlu/results/reviewed-learning.json');
    if(hash(active)!==baseline.modelVersion||hash(candidate)!==report.modelVersion)throw Error('Model changed during evaluation');
    const archive=path.join(root,'nlu/models/archive',`usagi-${baseline.modelVersion}.tar.gz`);fs.mkdirSync(path.dirname(archive),{recursive:true});if(!fs.existsSync(archive))fs.copyFileSync(active,archive);
    fs.copyFileSync(candidate,active+'.next');fs.renameSync(active+'.next',active);
    fs.writeFileSync(stateFile,JSON.stringify({schemaVersion:3,contract:'action-slots',timestamp:result.timestamp,datasetVersion:dataset.datasetVersion,modelVersion:version},null,2));
    fs.appendFileSync(path.join(root,'data/nlu-model-versions.jsonl'),JSON.stringify({timestamp:result.timestamp,datasetVersion:dataset.datasetVersion,modelVersion:version,previousModelVersion:baseline.modelVersion,archive,source:'reviewed-learning-loop'})+'\n');
    console.log(JSON.stringify({activated:true,samples:dataset.samples.length,modelVersion:version}));
  }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={evaluate,main};
