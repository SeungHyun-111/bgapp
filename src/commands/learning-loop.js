const fs=require('fs');
const path=require('path');
const {spawn}=require('child_process');
// Watch curated annotations, not raw answers. New conversations remain candidates.
function startLearningLoop(root=path.resolve(__dirname,'../..')){
  const directory=path.join(root,'data/training');fs.mkdirSync(directory,{recursive:true});
  let timer,child,closed=false,pending=false;
  const logFile=path.join(root,'nlu/results/learning-loop.log');fs.mkdirSync(path.dirname(logFile),{recursive:true});
  function run(){
    if(closed)return;
    if(child){pending=true;return;}
    child=spawn(process.execPath,[path.join(root,'scripts/train-reviewed-nlu.js')],{cwd:root,windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','pipe','pipe']});
    for(const stream of [child.stdout,child.stderr])stream.on('data',data=>fs.appendFileSync(logFile,data));
    child.on('error',e=>fs.appendFileSync(logFile,e.message+'\n'));
    child.on('close',()=>{child=null;if(pending){pending=false;run();}});
  }
  const watcher=fs.watch(directory,(_event,name)=>{if(String(name)==='annotations.json'){clearTimeout(timer);timer=setTimeout(run,3000);timer.unref?.();}});
  watcher.unref();
  // Reconcile reviewed changes made while the app was closed; unchanged data skips training.
  timer=setTimeout(run,15000);timer.unref?.();
  return ()=>{closed=true;clearTimeout(timer);watcher.close();};
}
module.exports={startLearningLoop};
