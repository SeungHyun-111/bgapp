// LEGACY DISABLED 2026-10-27: preserved during Gemini migration.
// const os=require('os');
// const path=require('path');
// const fs=require('fs');
// const {execFile}=require('child_process');
// const {promisify}=require('util');
// async function runtimeConfiguration(directory,{cpuOnly=false}={}){
//   const logical=os.availableParallelism?.()||os.cpus().length;
//   const integer=(name,fallback,min,max)=>{const n=Number(process.env[name]||fallback);if(!Number.isInteger(n)||n<min||n>max)throw Error('Invalid '+name);return n;};
//   const runtimeDirectory=cpuOnly?path.join(directory,'runtime'):process.env.LOCAL_LLM_RUNTIME_DIR||path.join(directory,'runtime');
//   const executable=path.join(runtimeDirectory,'llama-server.exe');
//   let probe;try{probe=await promisify(execFile)(executable,['--list-devices'],{windowsHide:true,timeout:30000,maxBuffer:128*1024});}
//   catch(cause){throw Object.assign(Error('Installed model backend could not enumerate devices'),{code:'MODEL_BACKEND_ERROR',cause});}
//   const deviceOutput=(probe.stdout+'\n'+probe.stderr).trim();
//   const gpu=!cpuOnly&&deviceOutput.match(/(Vulkan\d+):\s*(Intel[^\r\n]+)\s*\((\d+) MiB, (\d+) MiB free\)/i);
//   const useGpu=Boolean(gpu&&Number(gpu[4])>=3072);
//   // Auto offload is bounded by the backend's real memory budget and fit margin.
//   return {backend:useGpu?'Vulkan':'CPU',executable,runtimeDirectory,gpuLayers:useGpu?'auto':0,gpuDevice:useGpu?gpu[1]:null,gpuName:useGpu?gpu[2].trim():null,deviceOutput,logicalProcessors:logical,
//     threads:integer('LOCAL_LLM_THREADS',Math.max(2,Math.min(8,Math.floor(logical/2))),1,logical),
//     threadsBatch:integer('LOCAL_LLM_THREADS_BATCH',Math.max(2,Math.min(12,logical-4)),1,logical),
//     contextSize:integer('LOCAL_LLM_CONTEXT_SIZE',8192,4096,16384),batchSize:256,ubatchSize:128,cacheRamMiB:256};
// }
// function appendBounded(file,text){
//   fs.mkdirSync(path.dirname(file),{recursive:true});
//   if(fs.existsSync(file)&&fs.statSync(file).size>2*1024*1024){try{fs.renameSync(file,file+'.previous');}catch{fs.writeFileSync(file,'');}}
//   fs.appendFileSync(file,text);
// }
// module.exports={runtimeConfiguration,appendBounded};
throw Object.assign(new Error('Legacy local LLM path is disabled during Gemini migration.'), {code:'LEGACY_LLM_DISABLED'});
