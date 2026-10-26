function withinBudget(operation,signal){
  if(!signal)return Promise.resolve().then(operation);
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const aborted=()=>reject(signal.reason);
    signal.addEventListener('abort',aborted,{once:true});
    Promise.resolve().then(()=>{signal.throwIfAborted();return operation();}).then(resolve,reject).finally(()=>signal.removeEventListener('abort',aborted));
  });
}
module.exports={withinBudget};
