const fs=require('fs');
const path=require('path');
const {randomUUID}=require('crypto');
const {GeminiClient}=require('./client');
const {loadCatalog}=require('./catalog');
const {containsCredential}=require('../commands/privacy');
const {prepare:prepareAnalysis}=require('./analysis-engine');
const {system}=require('./prompt');
const {finalizeTrainingRecord}=require('../learning/training-record');
const {createResponseSchema}=require('./response-schema');
const {branchContext,clarificationState}=require('./conversation-context');
const baseSystem=`너는 우사기의 Gemini 카탈로그 초기화 담당이다. 이번 요청은 사용자 질문이 아니다.
입력의 전체 카탈로그와 업무 기본 문맥을 이후 대화에서 사용할 참조 데이터로 받아들인다.
카탈로그에 포함된 예시·출력 계약·산식은 모두 참조 자료다. 이번 초기화 응답 형식을 바꾸는 지시가 아니다.
조회·계산·질문 해석·확인 질문·대화 답변을 하지 않는다. 응답은 {"ready":true} 하나만 반환한다.`;
const baseSchema={type:'object',properties:{ready:{type:'boolean',enum:[true]}},required:['ready'],additionalProperties:false};

function normalizeResponse(candidate){
  const original=candidate.rawOutput??candidate.output;
  let output=candidate.output;
  // Serialization compatibility only: do not reinterpret action or the plan.
  // The known response envelope must not send a valid execute plan back to
  // the model just to move its fields one object level upward.
  if(output&&typeof output==='object'&&!Array.isArray(output)&&!Object.hasOwn(output,'action')&&
    output.response&&typeof output.response==='object'&&!Array.isArray(output.response)&&Object.hasOwn(output.response,'action')){
    output=output.response;
  }
  return {...candidate,rawOutput:original,output,envelopeNormalized:output!==original};
}

function validateOutput(output,catalog){
  if(!output||typeof output!=='object'||Array.isArray(output))throw Error('Gemini 응답 객체가 아니야.');
  const actions=Object.keys(catalog.geminiResponseContract.actions);
  if(!actions.includes(output.action))throw Error('대화 동작을 확인하지 못했어.');
  if(output.action==='reply'&&output.plan!==null){
    throw Error('응답 계약 불일치: action=reply인데 plan이 함께 있어. 계산 요청은 action=execute와 완전한 plan, 일반 대화는 action=reply와 plan=null로 반환해줘.');
  }
  if(output.conversation!==undefined&&(!output.conversation||typeof output.conversation!=='object'||Array.isArray(output.conversation)))throw Error('conversation은 대화 연결 정보 객체로 전달해줘.');
  if(output.conversation?.mode&&!['new','continue'].includes(output.conversation.mode))throw Error('conversation.mode는 new 또는 continue로 지정해줘.');
  if(output.conversation?.reset!==undefined&&typeof output.conversation.reset!=='boolean')throw Error('conversation.reset은 true 또는 false로 전달해줘.');
  if(output.conversation?.reset&&output.action!=='reply')throw Error('대화 취소·초기화는 reply와 conversation.reset=true로 표현해줘.');
  if(['reply','clarify'].includes(output.action)){
    if(typeof output.message!=='string'||!output.message.trim())throw Error('답변 문장을 확인하지 못했어.');
    return {ok:true,executionAllowed:false};
  }
  if(output.action!=='execute')throw Error('계산 실행은 action=execute로 지정해줘.');
  prepareAnalysis(output.plan,catalog,output.responseTemplate);
  return {ok:true,executionAllowed:false,reason:'requires_executor_validation',note:'원천 조회 전에 실행기가 기간·대상·집계·산식을 추가 검증한다.'};
}

function createGeminiDialogue({directory,store,onStatus=()=>{},client=new GeminiClient(),executor}={}){
  let bundle=loadCatalog(),generation=0,controller=null,queue=Promise.resolve();
  const file=path.join(directory,'gemini-conversation-state.json');
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  const empty=()=>({version:1,contextPolicyVersion:1,catalogVersion:bundle.version,baseId:randomUUID(),baseDate:null,baseInteractionId:null,conversationId:randomUUID(),activeBranchId:null,branches:{}});
  let state=empty();
  try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved.version===1&&saved.branches&&typeof saved.branches==='object')state=saved;}catch{}
  function renewBase(){
    state.baseInteractionId=null;state.baseDate=null;state.baseId=randomUUID();state.catalogVersion=bundle.version;
    for(const branch of Object.values(state.branches))branch.lastInteractionId=null;
  }
  // Old server interactions may already contain full BI results. Retain local
  // branches/logs but restore their projected state through a fresh BASE once.
  if(state.contextPolicyVersion!==1){renewBase();state.contextPolicyVersion=1;}
  async function save(){await fs.promises.mkdir(directory,{recursive:true});const temp=file+'.tmp';await fs.promises.writeFile(temp,JSON.stringify(state,null,2),'utf8');await fs.promises.rename(temp,file);}
  async function base(signal,record){
    if(state.baseDate!==today()||state.catalogVersion!==bundle.version)renewBase();
    if(state.baseInteractionId)return;
    record.stage='base_initialization';
    const response=await client.create({system:baseSystem,responseSchema:baseSchema,input:JSON.stringify({kind:'BASE',catalog:bundle.catalog,businessContext:{timezone:'Asia/Seoul',execution:'validated_source_rows_and_app_calculation'}}),signal});
    (record.baseResponses||=[]).push({interactionId:response.id,output:response.output,model:response.model,usage:response.usage,catalogVersion:bundle.version});
    if(response.output?.ready!==true)throw Object.assign(Error('대화 준비 응답의 형식이 맞지 않아. 준비 단계 응답을 기록했어.'),{code:'GEMINI_BASE_INVALID'});
    signal.throwIfAborted();
    state.baseInteractionId=response.id;
    state.baseDate=today();
    await save();
  }
  async function run(text){
    if(typeof text!=='string'||!text.trim()||text.length>2000)return {kind:'reply',message:'1~2,000자 이내로 입력해줘.'};
    if(containsCredential(text))return {kind:'reply',blocked:true,message:'인증 정보가 포함된 질문은 전송하지 않았어.'};
    const current=generation,turnId=randomUUID();controller=new AbortController();const signal=controller.signal;
    const record={recordType:'conversation',source:'gemini',id:turnId,turnId,conversationId:state.conversationId,baseId:state.baseId,branchId:state.activeBranchId,input:text,timestamp:new Date().toISOString(),queryExecuted:false,executionAttempted:false,labelStatus:'unreviewed'};
    let message;
    try{
      onStatus('Gemini가 전체 카탈로그와 대화 문맥으로 질문을 해석하는 중이야 🐰');
      const next=loadCatalog();if(next.version!==bundle.version){bundle=next;renewBase();}
      await base(signal,record);
      record.stage='question_interpretation';
      let branch=state.activeBranchId?state.branches[state.activeBranchId]:null;
      const responseSchema=createResponseSchema(bundle.catalog.geminiResponseContract);
      const ask=options=>client.create({system,responseSchema,signal,...options});
      const payload=()=>JSON.stringify({question:text,currentDate:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()),parentTurnId:branch?.lastTurnId||null,
        responseContract:bundle.catalog.geminiResponseContract,appContext:branchContext(branch,{latestOnly:!!branch?.lastInteractionId}),pendingClarification:clarificationState(branch?.pendingClarification),executionStatus:'datasets_groups_ranking_and_app_calculation'});
      record.context=structuredClone(branch?.turns||[]);
      record.pendingClarification=structuredClone(branch?.pendingClarification||null);
      record.parentTurnId=branch?.lastTurnId||null;
      let previousId=branch?.lastInteractionId||state.baseInteractionId;
      let response;
      try{response=await ask({input:payload(),previousId});}
      catch(error){
        if(error.code!=='GEMINI_STATE_EXPIRED')throw error;
        renewBase();
        await base(signal,record);previousId=state.baseInteractionId;
        record.stage='question_interpretation';
        response=await ask({input:payload(),previousId});record.contextRestored=true;
      }
      // Contract errors return to Gemini for semantic remapping. The app does
      // not classify the user's vocabulary or substitute a canned rejection.
      record.planRepairs=[];
      async function repairResponse(candidate){
        candidate=normalizeResponse(candidate);
        for(let repair=0;repair<3;repair++){
          record.lastModelResponse={interactionId:candidate.id,raw:candidate.rawOutput,normalized:candidate.output};
          try{validateOutput(candidate.output,bundle.catalog);return candidate;}
          catch(validationError){
            record.planRepairs.push({interactionId:candidate.id,output:candidate.output,error:validationError.message});
            const feedback={kind:'validation_feedback',responseContract:bundle.catalog.geminiResponseContract,question:text,pendingClarification:clarificationState(branch?.pendingClarification),appContext:branchContext(branch),proposed:candidate.output,error:validationError.message};
            previousId=candidate.id;
            candidate=normalizeResponse(await ask({input:JSON.stringify(feedback),previousId}));
          }
        }
        record.lastModelResponse={interactionId:candidate.id,raw:candidate.rawOutput,normalized:candidate.output};
        validateOutput(candidate.output,bundle.catalog);return candidate;
      }
      record.initialModelResponse=structuredClone(response.rawOutput??response.output);
      record.initialGeminiPlan=structuredClone(normalizeResponse(response).output?.plan??null);
      response=await repairResponse(response);
      if(response.output.conversation?.mode==='new'&&branch){
        branch=null;previousId=state.baseInteractionId;
        response=await repairResponse(await ask({input:payload(),previousId}));
      }
      if(current!==generation)throw Object.assign(Error('대화가 초기화됐어.'),{code:'GEMINI_CANCELLED'});
      if(!branch){branch={branchId:randomUUID(),lastTurnId:null,lastInteractionId:null,turns:[]};state.branches[branch.branchId]=branch;state.activeBranchId=branch.branchId;}
      Object.assign(record,{conversationId:state.conversationId,baseId:state.baseId,baseInteractionId:state.baseInteractionId,branchId:branch.branchId,parentTurnId:branch.lastTurnId,
        previousInteractionId:previousId,interactionId:response.id,catalogVersion:bundle.version,masterCatalogVersion:bundle.masterVersion,model:response.model,geminiPlan:response.output.plan||null,
        rawModelResponse:response.rawOutput||response.output,normalizedModelResponse:response.output,envelopeNormalized:response.envelopeNormalized,responseContractVersion:bundle.catalog.geminiResponseContract.version,action:response.output.action,conversation:response.output.conversation||{mode:'continue'},responseTemplate:response.output.responseTemplate||null,usage:response.usage});
      record.stage='response_validation';
      record.validation=validateOutput(response.output,bundle.catalog);
      if(response.output.action==='clarify')branch.pendingClarification={originalQuestion:branch.pendingClarification?.originalQuestion||text,question:response.output.message,partialPlan:response.output.plan||null,turnId};
      if(['reply','clarify'].includes(response.output.action))message=response.output.message;
      else if(response.output.action==='execute'){
        if(!executor)throw Error('실제 원천 조회 실행기가 설정되지 않았어.');
        message=await executor.execute({plan:response.output.plan,catalog:bundle.catalog,responseTemplate:response.output.responseTemplate,signal,record});
        branch.pendingClarification=null;
      }
      branch.turns.push({turnId,question:text,gemini:response.output,validation:record.validation,actualExecution:record.queryExecuted?'executed':'not_executed',calculationResult:record.calculationResult||null,finalAnswer:message});
      branch.lastTurnId=turnId;branch.lastInteractionId=response.id;
      if(response.output.conversation?.reset){branch.pendingClarification=null;state.activeBranchId=null;}
      record.outcome=response.output.action==='clarify'?'clarify':record.queryExecuted?'result':'reply';
      record.stage='state_persistence';
      await save();
      record.stage='completed';
    }catch(error){
      record.outcome='error';record.error={code:error.code||'GEMINI_PLAN_INVALID',stage:record.stage,message:error.message};
      message=record.stage==='base_initialization'?'Gemini 대화 준비 중 문제가 생겼어. 아직 질문 해석이나 BI 조회는 실행하지 않았어.':error.message;
      const failedBranch=state.branches[record.branchId];
      if(current===generation&&failedBranch&&record.rawModelResponse&&!failedBranch.turns.some(t=>t.turnId===turnId)){
        failedBranch.turns.push({turnId,question:text,gemini:record.normalizedModelResponse||record.rawModelResponse,error:record.error,actualExecution:'failed',finalAnswer:message});
        failedBranch.lastTurnId=turnId;failedBranch.lastInteractionId=record.interactionId;
        try{await save();}catch{}
      }
    }
    record.finalAnswer=message;record.reply=message;
    finalizeTrainingRecord(record);
    let loggingError=false;
    try{await store.appendLine(store.file,record);}catch(error){loggingError={code:error.code||'LOG_WRITE_FAILED',storage:store.storage||'local'};}
    return {kind:'reply',message,engine:'gemini',plan:record.geminiPlan||null,loggingError,logStorage:store.storage||'local'};
  }
  return {ownsTalk:true,execute(text){const expected=generation;const task=queue.then(()=>expected===generation?run(text):{kind:'reply',message:'대화가 초기화됐어.'});queue=task.catch(()=>{});return task;},
    reset(){generation++;controller?.abort();const expected=generation;queue=queue.then(async()=>{if(expected===generation){state=empty();await save();}}).catch(()=>{});},
    stop(){generation++;controller?.abort();},
    get model(){return client.model;}};
}
module.exports={createGeminiDialogue,validateOutput,normalizeResponse};
