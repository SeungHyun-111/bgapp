// LEGACY DISABLED 2026-10-27: preserved during Gemini migration.
// const {withinBudget}=require('./request-budget');
// async function readResponse(response,signal,trace,started){
//   if(!response.headers?.get('content-type')?.includes('text/event-stream')||!response.body?.getReader)return JSON.parse(await withinBudget(()=>response.text(),signal));
//   const reader=response.body.getReader(),decoder=new TextDecoder(),toolCalls=new Map();let buffer='',content='',reasoning='',finish=null,usage,timings;
//   const line=text=>{
//     if(!text.startsWith('data:'))return;const data=text.slice(5).trim();if(!data||data==='[DONE]')return;
//     const packet=JSON.parse(data),choice=packet.choices?.[0],delta=choice?.delta||{};
//     if(delta.content||delta.reasoning_content||delta.tool_calls?.length){trace.firstTokenMs??=Date.now()-started;}
//     content+=delta.content||'';reasoning+=delta.reasoning_content||'';
//     for(const part of delta.tool_calls||[]){
//       if(!Number.isInteger(part.index)||part.index<0||part.index>7)throw Error('Invalid streamed tool call index');
//       const call=toolCalls.get(part.index)||{id:'',type:'function',function:{name:'',arguments:''}};
//       call.id+=part.id||'';call.function.name+=part.function?.name||'';call.function.arguments+=part.function?.arguments||'';
//       toolCalls.set(part.index,call);
//     }
//     if(content.length+reasoning.length+JSON.stringify([...toolCalls.values()]).length>200000)throw Error('Model response exceeded bounded size');
//     if(choice?.finish_reason)finish=choice.finish_reason;
//     if(packet.usage)usage=packet.usage;if(packet.timings)timings=packet.timings;
//     trace.partialContent=content;trace.reasoningCharacters=reasoning.length;
//     if(toolCalls.size)trace.partialToolCalls=[...toolCalls.values()];
//   };
//   try{
//     while(true){const {value,done}=await withinBudget(()=>reader.read(),signal);if(done)break;trace.firstResponseMs??=Date.now()-started;buffer+=decoder.decode(value,{stream:true});const parts=buffer.split(/\r?\n/);buffer=parts.pop();for(const part of parts)line(part);}
//     buffer+=decoder.decode();if(buffer)line(buffer);
//   }finally{reader.cancel().catch(()=>{});}
//   return {choices:[{finish_reason:finish,message:{content,...(toolCalls.size?{tool_calls:[...toolCalls.entries()].sort((a,b)=>a[0]-b[0]).map(([,call])=>call)}:{})}}],usage,timings};
// }
// module.exports={readResponse};
throw Object.assign(new Error('Legacy local LLM path is disabled during Gemini migration.'), {code:'LEGACY_LLM_DISABLED'});
