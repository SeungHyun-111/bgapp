const endpoint='https://generativelanguage.googleapis.com/v1beta/interactions';
const fail=(code,message)=>Object.assign(new Error(message),{code});
class GeminiClient{
  constructor({model=process.env.GEMINI_MODEL||'gemini-3.5-flash-lite',fetchImpl=fetch,usageTracker}={}){
    this.model=model;this.fetch=fetchImpl;this.usageTracker=usageTracker;
  }
  async create({input,previousId,system,signal,responseSchema}){
    const apiKey=process.env.GEMINI_API_KEY;
    if(!apiKey?.trim())throw fail('GEMINI_KEY_MISSING','.env의 GEMINI_API_KEY가 비어 있어.');
    const body={model:this.model,input,store:true,system_instruction:system,
      response_format:{type:'text',mime_type:'application/json',...(responseSchema?{schema:responseSchema}:{})},
      generation_config:{temperature:0.2,max_output_tokens:4096},
      ...(previousId?{previous_interaction_id:previousId}:{})};
    let response;
    const usageId=this.usageTracker?.start(this.model);
    try{response=await this.fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify(body),
      signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)});}
    catch(error){this.usageTracker?.finish(usageId,{status:'network_error'});throw fail(signal?.aborted?'GEMINI_CANCELLED':'GEMINI_NETWORK_ERROR','Gemini 요청이 취소됐거나 응답을 받지 못했어.');}
    if(!response.ok){
      this.usageTracker?.finish(usageId,{status:'http_error',httpStatus:response.status});
      // Do not expose raw provider errors, headers or credentials to UI/logs.
      if(previousId&&(response.status===404||response.status===410))throw fail('GEMINI_STATE_EXPIRED','이전 대화 상태를 다시 만들어야 해.');
      const code={400:'GEMINI_REQUEST_INVALID',401:'GEMINI_AUTH_FAILED',403:'GEMINI_ACCESS_DENIED',404:'GEMINI_MODEL_UNAVAILABLE',429:'GEMINI_QUOTA_EXCEEDED'}[response.status]||'GEMINI_API_ERROR';
      throw fail(code,`Gemini API가 요청을 처리하지 못했어 (HTTP ${response.status}). 키·모델·사용 한도를 확인해줘.`);
    }
    let raw;
    try{raw=await response.json();}catch{this.usageTracker?.finish(usageId,{status:'response_error',httpStatus:response.status});throw fail('GEMINI_INVALID_RESPONSE','Gemini 응답을 읽지 못했어.');}
    this.usageTracker?.finish(usageId,{status:'success',usage:raw.usage,httpStatus:response.status});
    if(raw.status!=='completed'||typeof raw.id!=='string')throw fail('GEMINI_INCOMPLETE','Gemini가 응답을 완성하지 못했어.');
    const text=(raw.steps||[]).filter(s=>s.type==='model_output').flatMap(s=>s.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('');
    let output;try{output=JSON.parse(text);}catch{throw fail('GEMINI_INVALID_JSON','Gemini의 JSON 응답을 읽지 못했어.');}
    return {id:raw.id,output,usage:raw.usage||null,model:this.model};
  }
}
module.exports={GeminiClient};
