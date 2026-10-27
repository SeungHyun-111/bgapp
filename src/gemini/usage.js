const fs=require('fs');
const path=require('path');
const {randomUUID}=require('crypto');
const quotaFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Los_Angeles'});
const quotaDate=time=>quotaFormatter.format(new Date(time));
const number=value=>Number.isFinite(value)&&value>=0?value:0;
function createUsageTracker(directory){
  const file=path.join(directory,'gemini-usage.json');
  const listeners=new Set();
  let state={version:1,startedAt:new Date().toISOString(),calls:[],historicalPartial:true},storageError=false;
  try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved.version===1&&Array.isArray(saved.calls))state=saved;}catch{}
  function save(){
    try{fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(state),'utf8');fs.renameSync(file+'.tmp',file);storageError=false;}
    catch{storageError=true;}
    for(const listener of listeners)try{listener();}catch{}
  }
  // Recover known historical API interactions once, without making API calls.
  if(!state.historyImported){
    const seen=new Set(state.calls.map(c=>c.id));
    try{for(const line of fs.readFileSync(path.join(directory,'conversation-history.jsonl'),'utf8').split(/\r?\n/)){
      if(!line.trim())continue;let r;try{r=JSON.parse(line);}catch{continue;}
      if(r.source!=='gemini'||!Number.isFinite(Date.parse(r.timestamp)))continue;
      const known=[...(r.baseResponses||[]),...(r.planRepairs||[]),...(r.interactionId?[{interactionId:r.interactionId,model:r.model,usage:r.usage}]:[])];
      for(const item of known){
        if(!item.interactionId||seen.has(item.interactionId))continue;seen.add(item.interactionId);
        state.calls.push({id:item.interactionId,time:Date.parse(r.timestamp),model:item.model||r.model||process.env.GEMINI_MODEL||'gemini-3.5-flash-lite',status:'recovered',usage:item.usage||null});
      }
    }}catch{}
    state.historyImported=true;save();
  }
  function start(model){
    const call={id:randomUUID(),time:Date.now(),model,status:'pending'};state.calls.push(call);save();return call.id;
  }
  function finish(id,{status,usage,httpStatus}={}){
    const call=state.calls.find(c=>c.id===id);if(!call)return;
    Object.assign(call,{status,usage:usage||null,httpStatus,finishedAt:Date.now()});save();
  }
  function snapshot(model){
    const now=Date.now(),day=quotaDate(now);
    const calls=state.calls.filter(c=>c.model===model&&quotaDate(c.time)===day);
    const recent=calls.filter(c=>c.time>now-60000);
    const limit=Number(process.env.GEMINI_REQUESTS_PER_DAY);
    const dailyLimit=Number.isInteger(limit)&&limit>0?limit:null;
    const sum=key=>calls.reduce((total,c)=>total+number(c.usage?.[key]),0);
    return {model,quotaDay:day,quotaTimezone:'America/Los_Angeles',requests:calls.length,
      succeeded:calls.filter(c=>['success','recovered'].includes(c.status)).length,
      failed:calls.filter(c=>['http_error','network_error','response_error'].includes(c.status)).length,
      pending:calls.filter(c=>c.status==='pending'&&c.time>now-120000).length,
      interrupted:calls.filter(c=>c.status==='pending'&&c.time<=now-120000).length,
      rateLimited:calls.filter(c=>c.httpStatus===429).length,rpm:recent.length,
      minuteInputTokens:recent.reduce((n,c)=>n+number(c.usage?.total_input_tokens),0),
      inputTokens:sum('total_input_tokens'),outputTokens:sum('total_output_tokens'),cachedTokens:sum('total_cached_tokens'),totalTokens:sum('total_tokens'),
      missingTokenReports:calls.filter(c=>!c.usage).length,dailyLimit,remainingEstimate:dailyLimit===null?null:Math.max(0,dailyLimit-calls.length),
      limitSource:dailyLimit===null?'not_configured':'manual_env',scope:'this_app_only',historicalPartial:state.historicalPartial,storageError};
  }
  return {start,finish,snapshot,subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);}};
}
module.exports={createUsageTracker};
