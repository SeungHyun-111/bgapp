const fs=require('fs');
const path=require('path');
// Local environment file, ignored by git. Existing process variables win.
function loadEnvironment(file=path.resolve(__dirname,'../../.env')){
  if(!fs.existsSync(file))return;
  for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if(!match||Object.hasOwn(process.env,match[1]))continue;
    process.env[match[1]]=match[2].trim().replace(/^(["'])(.*)\1$/,'$2');
  }
}
module.exports={loadEnvironment};
