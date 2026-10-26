const fs=require('fs/promises');
const path=require('path');
const {randomUUID,createHash}=require('crypto');
async function readJson(file,fallback=null){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function atomicJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';const handle=await fs.open(tmp,'wx',0o600);try{await handle.writeFile(JSON.stringify(value,null,2));await handle.sync();}finally{await handle.close();}try{await fs.rename(tmp,file);}catch(e){await fs.rm(tmp,{force:true});throw e;}}
async function fileHash(file){const hash=createHash('sha256');const handle=await fs.open(file,'r');try{for await(const chunk of handle.createReadStream())hash.update(chunk);}finally{await handle.close().catch(()=>{});}return hash.digest('hex');}
module.exports={readJson,atomicJson,fileHash};
