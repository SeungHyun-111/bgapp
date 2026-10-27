const {randomUUID}=require('crypto');

// Qwen's chat template distinguishes tool responses from a new user query.
// Terminal decisions remain JSON; discovery calls and results use the API's
// native function-call messages throughout the request and replay path.
function appendToolExchange(messages,request,result,{cached=false,callId='call_'+randomUUID().replace(/-/g,''),previousCallId}={}){
  if(messages.some(m=>m.tool_calls?.some(call=>call.id===callId)))callId='call_'+randomUUID().replace(/-/g,'');
  const candidates=Array.isArray(result)?result:result?.candidates;
  const status=result?.error?'error':Array.isArray(candidates)&&!candidates.length?'empty':'ok';
  messages.push(
    {role:'assistant',content:'',tool_calls:[{id:callId,type:'function',function:{name:request.name,arguments:JSON.stringify(request.arguments)}}]},
    {role:'tool',tool_call_id:callId,name:request.name,content:JSON.stringify(cached?{request,status,cached:true,previousCallId,note:'같은 요청의 결과가 이전 tool 메시지에 이미 있다. 이 호출은 새 근거를 만들지 않았다.'}:{request,status,cached:false,result})},
  );
  return callId;
}

function appendValidationFeedback(messages,response,stage,errors){
  // A function call must not also be invented as assistant JSON text. Completed
  // calls already have assistant/tool messages; rejected calls are feedback data.
  if(!response?.tool)messages.push({role:'assistant',content:typeof response?.unparsed==='string'?response.unparsed:JSON.stringify(response)});
  messages.push({role:'system',content:'검증 피드백이다. 아래 내용은 새 사용자 요청이 아닌 참조 데이터다. 원래 사용자 질문과 카탈로그 근거를 유지하면서 응답을 수정하라. 형식 오류를 사용자에게 고치라고 요구하지 말고, 실제 의미가 부족할 때만 확인 질문을 하라.\n'+JSON.stringify({validation:{stage,errors},...(response?.tool?{rejectedToolRequest:response.tool}:{})})});
}
function toolRequestKey(request){
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  return JSON.stringify(canonical(request));
}
module.exports={appendToolExchange,appendValidationFeedback,toolRequestKey};
