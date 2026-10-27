// Authored review of the accumulated conversations, requested on 2026-10-26.
// Labels below are human/agent judgments, not labels copied from bot predictions.
const fs=require('fs');
const path=require('path');
const {createHash}=require('crypto');
const replies=require('../src/commands/rule-replies.json');
const root=path.resolve(__dirname,'..');
const directory=path.join(root,'data/training');
const file=path.join(root,'data/conversation-history.jsonl');
const raw=fs.readFileSync(file,'utf8');
const rows=raw.split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(r=>typeof r.input==='string');
const previous=JSON.parse(fs.readFileSync(path.join(directory,'annotations.json'),'utf8'));
const prior=new Map(previous.map(a=>[a.sourceId,a]));
const labels=new Map();
function label(ids,value){for(const id of ids.split(/\s+/).filter(Boolean))labels.set(id,value);}
const entity=(text,name,value)=>({text,entity:name,value});
const health=[entity('헬스푸드팀','organization','헬쓰푸드'),entity('헬스푸드','organization','헬쓰푸드')];
const query=(month,metricIds,target='헬쓰푸드')=>({target:{kind:'organization',field:'표준조직',value:target},period:{year:2026,month},metrics:metricIds});

label('822eb169-ad5b-472b-8428-6daa738aa1b1',{nluIntent:'requirements',replyKey:'requirements',reason:'나중에 정리하자는 요구사항이며 지금 실적을 조회하라는 요청이 아님'});
label('c12c4fb1-6e73-4d22-befe-77123b728750',{nluIntent:'unsupported_request',replyKey:'remaining_definition',reason:'잔여편성의 계획/확정 및 기준 기간이 미확인'});
label('0b3341b5-030f-4bd1-904c-52b46c55b208',{nluIntent:'unsupported_request',replyKey:'advertising_definition',reason:'광고비 마진구조는 확인된 계산 정의가 없음'});
label('874513f6-2655-48f7-80d0-83339c45e2a3 9a469144-706c-41a0-988d-df98e1663056 f24c19f9-39c7-4620-8c2b-976cd34d3d96 f84d6633-9365-4774-a91d-8ac3171b9cc1',{
  nluIntent:'query',nluEntities:health,expectedReply:'헬쓰푸드 조직의 지정 기간 가중분 기준 편성비중을 조회한다. 월별이면 월 단위로 나누고 실제 BI 값만 표시한다.'});
label('e7d20d24-b947-4a30-9b3e-48790420d2ac 9f2603e5-52ad-4471-b102-6f05458ef0b1 aa7507ba-593d-457f-a14a-2f375feaa466',{
  nluIntent:'query',nluEntities:health,expectedReply:'헬쓰푸드 조직의 가중분 합계를 조회한다. 편성비중으로 바꾸지 않는다. 월별 요청은 월별로 나눈다.'});
label('ca1c7927-f064-4f1f-96ab-ca7c48308b02',{nluIntent:'conversation_feedback',replyKey:'conversation_feedback',reason:'입력창 비활성화에 관한 앱 문제 제보이며 BI 요청이 아님'});
label('cdea05b4-03d5-40a7-8914-4647822f1f0e',{nluIntent:'greet',replyKey:'greet'});
label('874abcea-744f-49ce-a44d-c1e91194b72f',{category:'exclude',reason:'과거 개발 답변을 붙여넣은 설명문. 사용자 조회나 분류 학습 정답으로 사용하지 않는다.',expectedReply:'설정과 저장 방식에 관한 설명으로 읽고 BI 조회를 실행하지 않는다.'});
label('d608a3ea-33c9-4415-aa50-02a465abd200 054c335f-d7dc-43d6-ab2f-47383e995126 18326c80-9508-49a5-8744-3a4327ee18aa',{
  nluIntent:'unsupported_request',replyKey:'brand_ratios_unavailable',reason:'브랜드별 기본 합계는 가능하지만 복합 분당 계산·브랜드 편성비중·개수/목록 동시 실행은 현재 규칙 경로의 지원 범위를 넘음'});
label('f0131805-aa85-4412-aef7-61025b9ffca7',{
  nluIntent:'modify_condition',nluEntities:[entity('레이델','brand','레이델'),entity('모든 상품','scope','all_products'),entity('브랜드','targetType','brand')],
  expectedQuery:{target:{kind:'brand',field:'편성코드',value:'레이델'}},expectedReply:'맨 앞 [레이델]이 같은 상품 전체로 대상을 정정한다. 기간과 지원 지표는 유지하고 미연결 계산은 따로 안내한다.'});
label('6c022a41-ae0e-4ddb-9cdd-77377118e2b3 191c88ea-6ebd-4a12-956c-295db5450d4a 2637ca78-2079-4339-a4c0-1c8eb6ee3600',{
  nluIntent:'unsupported_request',replyKey:'broadcast_time_unavailable',reason:'일·시간별 방송 목록은 현재 월/연도 실적 집계 경로에서 지원하지 않음. 잘못된 팀이나 실적을 대신 조회하지 않는다.'});
label('1764c08a-eece-47ca-8f08-b66d3e4c1f27 3d13dcaa-eb99-4e3d-ad4b-0537942fe411 44466ba0-644d-4b0e-8e00-a03bb001e96d 0f18b94f-cba4-4603-bf4b-f4d55720b486 92f6c0f0-09f9-4a57-9925-107285a7496b',{
  nluIntent:'complaint',replyKey:'complaint',reason:'직전 응답에 대한 불만이며 새 BI 조건으로 해석하지 않음'});
label('8996aa0f-0c71-47f5-ab3e-d127c8f8f712 f9775b13-0faa-4c7c-a1b9-8dec3186a89e b5a8be5e-0ca2-462a-86b6-58aa699356e1',{
  nluIntent:'system_status',replyKey:'system_status'});
label('857ad560-8374-4140-a95c-ac374dc7176d bf4a424a-7aa2-4842-9091-6653e5672c80',{
  nluIntent:'query',nluEntities:[entity('문화팀','organization','문화서비스')],expectedReply:'대상은 문화서비스 조직이다. 가중분 또는 편성비중을 유지하고 빠진 기간만 확인한다.'});
label('df565883-1c7f-4d44-a052-f23fed34651f',{nluIntent:'change_grouping',expectedReply:'직전 대상과 편성비중을 유지하고 기간을 2026년, 집계를 월별로 바꾼다.'});
label('fa23ae11-0799-4379-984b-a0e133997ced',{
  nluIntent:'modify_condition',nluEntities:[entity('문화팀','organization','문화서비스')],expectedReply:'편성팀을 문화서비스 조직으로 정정하고 직전 기간·월별 집계·지표를 유지한다.'});
label('a7c518dc-f4bb-4e84-abc1-a03145d5c8b7',{
  category:'runtime_ready',nluIntent:'query',nluEntities:[entity('제일','limit',1),entity('팀','groupBy','organization')],expectedQuery:{period:{year:2026,month:6},groupBy:'organization',metrics:['organization_weighted_share'],limit:1},expectedReply:'6월 전체 조직의 가중분 편성비중을 집계해 가장 높은 한 조직을 표시한다. 편성팀 한 곳을 고르는 요청이 아니다.'});
label('80a8f2b7-eef2-4804-a471-c4635df0df68',{
  category:'runtime_ready',nluIntent:'query',expectedQuery:{period:{year:2026,month:6},groupBy:'organization',metrics:['organization_weighted_share']},expectedReply:'6월 모든 조직을 조직별로 나눠 가중분 편성비중을 조회한다.'});
label('70e5ab50-60cb-4110-865d-f91cd4a72f85 2b70adff-f1c9-4807-a7ec-84698e2d73e1',{
  category:'runtime_ready',nluIntent:'change_grouping',nluEntities:[entity('조직들 다','groupBy','organization')],expectedReply:'직전 기간·지표를 유지하고 단일 조직 대상을 전체 조직별 집계로 바꾼다.'});
label('d0341303-1c61-41f5-98b4-f3fbefeee3ef',{nluIntent:'query',expectedReply:'9얼은 9월인지 선택지로 확인한다. 임의의 다른 기간이나 조직을 조회하지 않는다.'});
label('f5f798b0-ed20-42d8-85c2-ec2b3d9d1e41',{nluIntent:'modify_condition',expectedReply:'직전 조직별 편성비중 조건을 유지하고 월만 9월로 바꾼다.'});
label('7a4fbb7e-3d94-4bac-ba68-2d1a3c4fa251 32eb0584-c294-4fed-9bf0-55e6ff896126 8fda914f-37c6-4cf8-93d4-42255c605e2d 877cd22b-8964-4176-b5f7-4e6971b8aa39',{
  category:'runtime_ready',nluIntent:'query',expectedQuery:{period:{year:2026,month:9},groupBy:'organization',metrics:['organization_weighted_share']},expectedReply:'2026년 9월 전체 조직의 가중분 편성비중을 조직별로 조회한다.'});
label('0c6e3a7f-0598-446a-88cd-bae700fb65e4 fe75aa33-dee0-40d0-a76a-fcda159448b9',{
  category:'runtime_ready',nluIntent:'modify_condition',expectedQuery:{period:{year:2026,month:9},groupBy:'organization',metrics:['organization_weighted_share']},expectedReply:'불만 속에 포함된 조회 조건을 반영해 9월 전체 조직별 편성비중을 조회한다.'});
label('c5d4466d-3658-43ae-9048-d3bb2fdb63d2 4567e8ba-445d-4b1c-9180-a09a21c4de7e ce63ce2f-11bb-461f-8fc9-c8ed4f23cfaa',{
  nluIntent:'unsupported_request',replyKey:'per_minute_unavailable',reason:'사용자 정의는 있지만 분당 취급액/이익액이 규칙 실행 지표로 등록되지 않아 별도 안내한다.'});
label('ff7e3b31-531a-4e6a-a9af-07bffb6924aa',{nluIntent:'confirm',expectedReply:'직전 조건을 유지한다. 불명확하거나 미지원인 조건을 동의만으로 실행하지 않는다.'});
label('57951209-350e-4706-b2da-82a5a37753ce',{nluIntent:'query',expectedQuery:{period:{year:2026,month:9},metrics:['organization_weighted_share'],filters:{productType:'무형'}},expectedReply:'9월·무형·가중분 편성비중 조건을 반영하고, 대상은 직전 명시된 조건을 유지하거나 없으면 확인한다.'});
label('8cd1a927-d887-4a51-b9b1-dff5fdbb7b9f d1736d55-fd2a-41fa-b96e-fd141bac2405',{nluIntent:'organization_list',replyKey:'organization_list',expectedReply:'로컬에 저장된 표준조직 목록을 보여주고 최신 BI 재조회 결과라고 주장하지 않는다.'});
label('ebc35ec7-6bf7-465b-a500-a6940d977c65',{nluIntent:'query',nluEntities:[entity('가전팀','organization','가전')],expectedQuery:query(10,['organization_weighted_share'],'가전'),expectedReply:'2026년 10월 가전 조직의 가중분 기준 편성비중을 조회한다.'});
label('4f5df940-93c5-4772-90bf-a7b9bd1bfa14 feab3c63-ec06-430f-9413-6eef8dc11d6c 6d95b093-bc71-40eb-9151-6eef2e4972fd ec5705c1-1061-48a7-a62f-dd5af619652b 6fcf2abc-21f2-4a9e-9f52-6910118b8a48 2719bad8-39d4-4f90-a2d2-b40ad03f1002 1debc32c-0535-40bd-9368-e088aa55a353 3f71dd58-7c2e-41c8-b4f8-edaeccddd8b6 4b988d2c-6cbe-4e9b-94c5-d3ca6a3bd9ea',{
  nluIntent:'greet',replyKey:'greet',reason:'짧은 호명/인사. di는 한글 야의 영문 자판 입력으로 검토했다. BI 탐색을 시작하지 않는다.'});
label('e8911ab1-8f48-4300-b64a-507dde04065d',{nluIntent:'mood',replyKey:'mood'});
label('ecc741e5-e231-47fc-aabf-ba53c488dca3',{nluIntent:'conversation_feedback',replyKey:'conversation_feedback',reason:'어느 나라 말인지 묻는 정보 질문이 아니라 어색한 인사말에 대한 지적'});
label('367d94d5-0975-4980-8eb9-6036f99b122c 749ef65e-e320-4a14-a6c6-ccc07677383a',{
  nluIntent:'query',nluEntities:health,expectedQuery:query(7,['weighted_minutes','organization_weighted_share']),expectedReply:'2026년 7월 헬쓰푸드 조직의 가중분 합계와 가중분 기준 편성비중을 함께 조회한다. 두 지표 중 하나를 누락하지 않는다.'});
label('0d2b70a1-5bb9-4497-80bf-4d0af182df69',{nluIntent:'cancel',replyKey:'reset'});
label('41734709-8728-4e5f-b8cc-c36bce76b5eb',{
  nluIntent:'modify_condition',nluEntities:[entity('가중부','metric','weighted_minutes')],expectedQuery:{metrics:['weighted_minutes','organization_weighted_share']},expectedReply:'직전 명시된 2026년 7월 헬쓰푸드 조건을 유지하고 가중분과 편성비중 조회를 재요청한 것으로 처리한다. 가중부는 문맥상 가중분의 오타로 검토했다.'});
label('a2dfa212-547d-453a-86a6-f8a2ee1af60f 7ab6c1bd-b82d-412e-842e-b12be6a44949 ab5567d9-6ecc-4dcb-9390-0ad99071d6cc 44b77264-8920-4a58-b4c4-2fcb640e31ba 595da224-2adb-40c1-80fb-f6171fd8d44a',{
  nluIntent:'query',nluEntities:health,expectedQuery:query(7,['weighted_minutes']),expectedReply:'2026년 7월 헬쓰푸드 조직의 가중분 합계를 실제 BI에 요청한다. 인증이 필요하면 로그인 안내로 이어지고, 값을 만들거나 요청을 되풀이하지 않는다.'});
label('791f767a-9694-4b4d-a080-9ad6c1be616a',{
  nluIntent:'modify_condition',nluEntities:health,expectedQuery:query(7,['weighted_minutes']),expectedReply:'정정/재요청으로 받아 7월 헬쓰푸드 가중분 조회 조건을 반영한다.'});
label('7acd32e3-691f-4e18-885d-b7add3415fe9',{nluIntent:'capabilities',replyKey:'capabilities',expectedReply:'등록된 조회 지표와 월별·조직별 집계 범위를 안내한다. 이전 실패 질의를 재실행하지 않는다.'});

const missing=rows.filter(row=>!labels.has(row.id));
if(missing.length)throw Error('Conversations still need authored review: '+missing.map(r=>r.id).join(', '));
const annotations=rows.map(row=>{
  const authored=labels.get(row.id),old=prior.get(row.id)||{};
  const result={...old,sampleId:row.id,sourceId:row.id,input:row.input,timestamp:row.timestamp,oldReplyUsedAsGold:false,
    category:authored.category||old.category||'ready',group:old.group||'reviewed-rule-recovery',...authored,
    reviewedBy:'codex',reviewBasis:'User requested analysis, authored corrections and local NLU training on 2026-10-26'};
  if(result.category==='unreviewed')result.category='ready';
  if(authored.replyKey&&!authored.expectedReply)result.expectedReply=replies[authored.replyKey];
  if(authored.nluIntent==='unsupported_request'&&result.gold){result.priorPlannerGold=result.gold;delete result.gold;}
  return result;
});
fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,'annotations.json'),JSON.stringify(annotations,null,2)+'\n');
const manifest={reviewedAt:new Date().toISOString(),sourceSha256:createHash('sha256').update(raw).digest('hex'),conversations:rows.length,
  nluSources:annotations.filter(a=>a.nluIntent).length,excluded:annotations.filter(a=>!a.nluIntent).length,
  intents:Object.fromEntries([...new Set(annotations.map(a=>a.nluIntent).filter(Boolean))].map(intent=>[intent,annotations.filter(a=>a.nluIntent===intent).length])),
  oldBotRepliesUsedAsGold:false,biValuesInvented:false,trainingExecuted:false,evaluationExecuted:false};
fs.writeFileSync(path.join(directory,'rule-review-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const table=annotations.map((a,i)=>`| ${i+1} | ${a.input.length>180?'긴 개발 설명 붙여넣기':a.input.replace(/[|\r\n]/g,' ')} | ${a.nluIntent||'학습 제외'} | ${(a.expectedReply||a.reason).replace(/[|\r\n]/g,' ')} |`);
fs.writeFileSync(path.join(root,'docs/rule-conversation-review-2026-10-26.md'),[
  '# 누적 대화 규칙/NLU 복구 검토','',`실제 대화 ${rows.length}건을 검토했다. 봇의 과거 답변과 BI 숫자는 정답으로 사용하지 않았다.`,
  '의도·개체는 Rasa 분류 학습에, replyKey 응답은 규칙 대화에 반영한다. 미지원 계산과 일·시간별 방송 목록은 지원된다고 학습하지 않는다.',
  '동일 문장의 반복 로그는 출처를 모두 보존하되 NLU 예문은 중복 제거한다. 과거의 Planner 정답과 현재 규칙 경로의 지원 범위는 다를 수 있다.',
  '', '| 번호 | 사용자 원문 | 의도 | 올바른 해석·응답 |','|---|---|---|---|',...table,'',
  '이 문서의 조회 응답은 기대 동작이다. 실제 BI 결과나 정확도 검증 결과가 아니다. 실제 학습·모델 적용 상태는 active-nlu.json 및 training-only.json에 별도로 기록한다.','',
].join('\n'));
console.log(JSON.stringify(manifest,null,2));
