const path=require('path');
require('../src/planner/environment').loadEnvironment();
const {LearningSupervisor}=require('../src/learning/supervisor');
const {readJson}=require('../src/learning/files');
async function main(){
  const worker=new LearningSupervisor({dataDirectory:path.resolve(__dirname,'../data'),client:null});
  const records=await worker.store.records();
  console.log(JSON.stringify({trainingEnabled:process.env.QWEN_AUTO_TRAIN==='true',readyCorrections:records.filter(r=>r.recordType==='correction'&&r.status==='ready').length,pendingContextReview:records.filter(r=>r.status==='needs_context_review').length,preflight:await worker.preflight(),lastStatus:await readJson(path.join(worker.directory,'status.json')),notice:'Read-only status. No inference, training, installation or BI request.'},null,2));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
