const fs=require('fs');
const path=require('path');
const {createHash}=require('crypto');
const {metrics}=require('../src/commands/bi-metrics');
const {annotate,yaml}=require('./lib/nlu-examples');
const root=path.resolve(__dirname,'..');
function buildReviewedNlu(){
 const annotations=JSON.parse(fs.readFileSync(path.join(root,'data/training/annotations.json'),'utf8'));
 const groups=new Map(),samples=[],skipped=[];
 for(const a of annotations){
  let intent;const p=a.gold?.patch,d=a.desired?.patch||a.desired;
  if(a.category==='ready'&&p&&p.operation!=='list'){
   if(p.metrics?.every(id=>metrics.some(m=>m.id===id))||a.gold.action==='modify')intent=a.gold.action==='modify'?(p.groupBy&&!p.target&&!p.metrics?'change_grouping':'modify_condition'):'query';
  }else if(['ready','runtime_ready','needs_capability'].includes(a.category)&&d?.groupBy?.some(g=>g.field==='BO[표준조직]'))intent=a.desired.action==='modify'?(d.period?'modify_condition':'change_grouping'):'query';
  if(!intent){skipped.push({id:a.sourceId,category:a.category,reason:'No supported reviewed runtime label'});continue;}
  const extra=[];
  if(d?.limit===1){extra.push({text:'제일',entity:'limit',value:1},{text:'팀',entity:'groupBy',value:'organization'});}
  if(!groups.has(intent))groups.set(intent,[]);groups.get(intent).push(annotate(a.input,extra));
  samples.push({id:a.sourceId,input:a.input,intent,gold:a.gold,desired:a.desired,group:a.group});
 }
 // Include generator/runtime schema changes in the version, not just source IDs.
 const inputs=['scripts/build-reviewed-nlu.js','scripts/generate-bi-training.js','scripts/generate-query-understanding.js','scripts/lib/nlu-examples.js','src/commands/query-capabilities.js','nlu/config.yml','nlu/korean_tokenizer.py'];
 const datasetVersion=createHash('sha256').update(JSON.stringify(samples)+inputs.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')).digest('hex');
 fs.writeFileSync(path.join(root,'nlu/data/reviewed-conversations.yml'),yaml(groups));
 const manifest={schemaVersion:3,datasetVersion,samples,skipped};fs.writeFileSync(path.join(root,'data/training/nlu-dataset.json'),JSON.stringify(manifest,null,2));return manifest;
}
if(require.main===module){const m=buildReviewedNlu();console.log(JSON.stringify({datasetVersion:m.datasetVersion,trainingSamples:m.samples.length,skipped:m.skipped.length}));}
module.exports={buildReviewedNlu};
