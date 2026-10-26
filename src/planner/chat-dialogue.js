const fs=require('fs');
const path=require('path');
const {LocalLlmClient}=require('./local-llm-client');
const {QueryPlanner}=require('./query-planner');
const {createFakeExecutor}=require('./fake-bi-executor');
const {createLiveExecutor}=require('./live-bi-executor');
const {syntheticRows}=require('./synthetic-fixtures');
const {containsCredential}=require('../commands/privacy');
const {SemanticCatalog}=require('./semantic-catalog');
const {LearningSupervisor}=require('../learning/supervisor');
const {promote}=require('../learning/promotion');
const {loadPlannerCatalog}=require('./catalog-loader');
const {ConversationOrchestrator}=require('./conversation-orchestrator');

function formatAnswer(out,catalog){
  if(out.kind==='reply')return out.message;
  if(out.kind==='clarify')return `아? ${out.question}\n${(out.options||[]).map((o,i)=>`${i+1}. ${o.label}`).join('\n')}`.trim();
  if(out.kind==='cancelled')return '하! 이번 조회는 취소했어 🐰';
  if(out.kind==='invalid')return '아? 내가 조회 계획을 제대로 완성하지 못했어. 실제 조회는 실행하지 않았고, 네가 입력 형식을 바꿀 필요는 없어 🐰';
  if(out.kind==='error'){
    const code=out.error.code;
    if(code==='BI_QUERY_FAILED')return '아? 실제 BI 조회에 실패했어. 로그인 상태나 BI 연결을 확인해줘 🐰';
    if(code==='BI_METRIC_UNSUPPORTED')return '아? 이 지표의 실행 가능한 계산식을 아직 확인하지 못했어. 실제 BI 조회는 실행하지 않았어 🐰';
    if(code==='LLM_MODEL_MISSING')return '아? 로컬 모델 파일을 찾지 못했어. 모델 경로 설정을 확인해줘 🐰';
    if(code.includes('TIMEOUT'))return '아? 로컬 모델의 응답 대기시간이 지났어. BI 연결 오류는 아니야 🐰';
    if(code==='LLM_NOT_RUNNING'||code==='LLM_START_FAILED')return '아? 로컬 Qwen 엔진을 실행하지 못했어. BI에는 접속하지 않았어 🐰';
    return `아? 대화나 조회 계획을 처리하다 문제가 생겼어 (${code}) 🐰`;
  }
  const p=out.plan;
  const label=key=>catalog.metrics[key]?.label||key.replace(/^BO\[|\]$/g,'');
  const value=(key,v)=>v==null?'데이터 없음':catalog.metrics[key]?.unit==='%'?`${(v*100).toFixed(2)}%`:typeof v==='number'?v.toLocaleString('ko-KR'):String(v);
  const lines=out.result.rows.map(row=>Object.entries(row).map(([k,v])=>`${label(k)}: ${value(k,v)}`).join(' · '));
  return [out.result.synthetic?'하! [가짜 데이터로 연결 테스트 중 — 실제 BI 실적 아님]':'하! 실제 BI에서 찾았어 🐰',p.target?`${p.target.kind}: ${p.target.value}`:'전체 대상',...p.filters.map(f=>`${label(f.field)} ${f.operator} ${f.value}`),...(lines.length?lines:['조건에 맞는 데이터가 없어.']),out.result.limited?'표시 개수 제한에 도달했어.':'','뿌륽! 🐰'].filter(Boolean).join('\n');
}

function createPlannerDialogue({directory,store,onStatus=()=>{},provider,now,learning=true,query,executor}={}){
  const catalog=loadPlannerCatalog(directory);
  const entities=JSON.parse(fs.readFileSync(path.join(directory,'bi-entity-catalog.json'),'utf8')).entities;
  let raw=[];
  const client=provider||new LocalLlmClient({directory:path.join(directory,'llm'),onStatus,recordRaw:async trace=>{raw.push(trace);}});
  const semanticCatalog=new SemanticCatalog({catalog,provider:client});
  const selectedExecutor=executor||(query?createLiveExecutor({catalog,entities,query,onStatus}):provider?createFakeExecutor({catalog,entities,rows:syntheticRows()}):null);
  if(!selectedExecutor)throw Error('Actual chat requires a live BI query function; fake execution must be explicitly injected for tests');
  const planner=new QueryPlanner({provider:client,catalog,entities,semanticCatalog,executor:selectedExecutor,onStatus,now,maxRepairs:2});
  const orchestrator=new ConversationOrchestrator({planner,client});
  let queue=Promise.resolve(),generation=0;
  const learner=learning&&!provider?new LearningSupervisor({dataDirectory:directory,client,onCandidate:(candidate,allowedModelRoot)=>{
    const task=queue.then(()=>promote({directory:path.join(directory,'learning'),client,candidate,allowedModelRoot}));queue=task.catch(()=>{});return task;
  }}):null;
  learner?.start();
  return {
    planner,client,learner,orchestrator,
    reset(){generation++;orchestrator.reset();},
    stop(){generation++;learner?.stop();orchestrator.stop();},
    execute(text){
      const requested=generation;
      const task=queue.then(async()=>{
        if(requested!==generation)return {kind:'reply',message:'이번 대화는 닫혔어 🐰'};
        if(containsCredential(text))return {kind:'reply',blocked:true,message:'인증 정보는 대화에 적지 말아줘 🐰'};
        raw=[];const out=await orchestrator.run(text),event=planner.lastEvent;
        let correctionCapture=null;
        if(requested===generation&&learner)try{correctionCapture=await learner.capture(event);}catch(error){correctionCapture={queued:false,error:error.message};}
        if(requested!==generation)planner.reset();
        const message=formatAnswer(out,catalog)+(correctionCapture?.queued?'\n수정한 항목은 교정 노트에도 기록했어 🐰':'');
        await store.appendLine(store.file,{recordType:'conversation',id:event.turnId,timestamp:new Date().toISOString(),source:'qwen-conversation',input:text,question:text,reply:message,previousState:event.previousState,catalogContext:{bootstrap:event.catalogContext,toolCalls:event.tools},llmRawResponse:raw,llmPlan:event.rawPrediction,validation:event.validation||null,attempts:event.attempts||[],totalDurationMs:event.totalDurationMs,executionDurationMs:event.executionDurationMs,fieldValidation:event.fieldValidation||null,correctionCapture,executedPlan:event.executionAttempted?event.finalPlan:null,clarification:out.kind==='clarify'?{question:out.question,options:out.options}:null,finalAnswer:message,executionMode:selectedExecutor.mode,synthetic:selectedExecutor.mode==='fake',queryExecuted:event.queryExecuted,executionAttempted:!!event.executionAttempted,resolvedState:event.resolvedState,error:event.error||null,conversationId:event.conversationId,previousTurnId:event.previousTurnId});
        return {kind:'reply',message,engine:'qwen-local',synthetic:selectedExecutor.mode==='fake',retryable:out.kind==='error'};
      });
      queue=task.catch(()=>{});return task;
    }
  };
}
module.exports={createPlannerDialogue,formatAnswer};
