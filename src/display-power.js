const {spawn,execFile}=require('child_process');
const fs=require('fs');
const path=require('path');
const readline=require('readline');
function watchDisplayPower(directory,onChange) {
  if(process.platform!=='win32')return ()=>{};
  let child=null,stopped=false;
  const source=path.join(__dirname,'display-power.cs');
  const binary=path.join(directory,'display-power.exe');
  const launch=()=>{
    if(stopped)return;
    child=spawn(binary,[String(process.pid)],{windowsHide:true,stdio:['ignore','pipe','ignore']});
    const lines=readline.createInterface({input:child.stdout});
    lines.on('line',line=>{if(line==='on'||line==='off')onChange(line==='off');});
    child.on('error',()=>{});child.on('exit',()=>{lines.close();onChange(false);});
  };
  try {
    fs.mkdirSync(directory,{recursive:true});
    if(fs.existsSync(binary)&&fs.statSync(binary).mtimeMs>=fs.statSync(source).mtimeMs)launch();
    else {
      const compiler=path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
      execFile(compiler,['/nologo','/target:exe','/r:System.Windows.Forms.dll','/out:'+binary,source],{windowsHide:true,timeout:15000},error=>{if(!error)launch();});
    }
  } catch { /* Lock/suspend events still work if the Windows listener is unavailable. */ }
  return ()=>{stopped=true;if(child)child.kill();};
}
module.exports={watchDisplayPower};
