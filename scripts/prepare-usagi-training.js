// Offline curation only. Not imported by runtime and never trains/downloads a model.
const fs=require('fs');
const path=require('path');
const {createHash}=require('crypto');
const {emptyPlan}=require('../src/planner/dialogue-state');
const {validatePlan,schemaErrors}=require('../src/planner/query-validator');
const turnSchema=require('../src/planner/turn-schema.json');
const root=path.resolve(__dirname,'..');
const sourceFile=path.join(root,'data/conversation-history.jsonl');
const source=fs.readFileSync(sourceFile,'utf8');
const rows=source.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(r=>typeof r.input==='string');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/bi-catalog.json'),'utf8'));
const health={kind:'organization',value:'헬쓰푸드'},culture={kind:'organization',value:'문화서비스'};
const entities=[{kind:'organization',value:'헬쓰푸드'},{kind:'organization',value:'문화서비스'}];
const dates=(year,month)=>{const start=month?`${year}-${String(month).padStart(2,'0')}-01`:`${year}-01-01`;const d=new Date(Date.UTC(year,month||12,1));const end=month?d.toISOString().slice(0,10):`${year+1}-01-01`;return [{field:'BO[방송일시]',operator:'gte',value:start},{field:'BO[방송일시]',operator:'lt',value:end}];};
const monthly=[{field:'BO[방송일시]',unit:'month'}];
const aggregate=(target,metric,month=null,group=false)=>({...emptyPlan(),operation:'aggregate',target,metrics:[metric],filters:dates(2026,month),groupBy:group?monthly:[]});
const clarifyPeriod=(target,metric)=>({action:'clarify',question:'하! 어느 기간으로 볼까? 올해 전체나 월별로도 볼 수 있어 🐰',patch:{operation:'aggregate',target,fields:[],metrics:[metric],filters:[],groupBy:[],sort:[],limit:30}});
const broadcast=date=>({...emptyPlan(),operation:'list',fields:['BO[방송일시]','BO[편성코드]','BO[대표상품명]'],filters:[{field:'BO[방송일시]',operator:'gte',value:date},{field:'BO[방송일시]',operator:'lt',value:new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10)}]});
const askTime=date=>({action:'clarify',question:'아? 오전 8시와 오후 8시 중 어느 시간일까? 🐰',patch:broadcast(date),options:[{label:'오전 8시',patch:{filters:[...broadcast(date).filters,{field:'BO[방송일시]',operator:'hour',value:8}]}},{label:'오후 8시',patch:{filters:[...broadcast(date).filters,{field:'BO[방송일시]',operator:'hour',value:20}]}}]});
// Explicit curator decisions: historical bot replies/outcome flags are NOT labels.
const labels={
 'd0341303-1c61-41f5-98b4-f3fbefeee3ef':{category:'needs_clarification',group:'month_typo',reason:'9얼을 9월로 제안하고 선택 후 원래 조직별 조회를 이어감. 오타를 확정 정답으로 자동 처리하지 않음'},
 'f5f798b0-ed20-42d8-85c2-ec2b3d9d1e41':{category:'runtime_ready',group:'organization_share_ranking',desired:{action:'modify',period:{year:2026,month:9},groupBy:[{field:'BO[표준조직]',unit:'value'}]},reason:'9월로 기간 정정. 앞선 조직별 가중분 편성비중 유지. UI 제안 요구를 BI 지표로 해석하지 않음'},
 '7a4fbb7e-3d94-4bac-ba68-2d1a3c4fa251':{category:'runtime_ready',group:'organization_share_ranking',desired:{action:'new',period:{year:2026,month:9},metrics:['organization_weighted_share'],groupBy:[{field:'BO[표준조직]',unit:'value'}]},reason:'같은 기간 전체 조직을 분모로 각 조직의 가중분 편성비중 집계'},
 '0c6e3a7f-0598-446a-88cd-bae700fb65e4':{category:'runtime_ready',group:'organization_share_ranking',desired:{action:'modify',period:{year:2026,month:9},metrics:['organization_weighted_share'],groupBy:[{field:'BO[표준조직]',unit:'value'}]},reason:'왜라는 단어가 있어도 원인 분석이 아닌 잘못 선택한 팀의 정정. 편성팀 단일 대상을 해제하고 9월 조직별로 조회'},
 '822eb169-ad5b-472b-8428-6daa738aa1b1':{category:'requirements',group:'product_margin_design',reason:'나중에 기능을 정리하자는 요구사항이며 즉시 조회 요청이 아님'},
 'c12c4fb1-6e73-4d22-befe-77123b728750':{category:'needs_definition',group:'remaining_schedule',reason:'잔여편성의 기간·계획/확정·집계 기준 미확인'},
 '0b3341b5-030f-4bd1-904c-52b46c55b208':{category:'needs_definition',group:'advertising_margin',reason:'광고비·마진구조의 계산 정의와 데이터 근거 미확인'},
 '874513f6-2655-48f7-80d0-83339c45e2a3':{category:'ready',group:'health_share',gold:{action:'new',patch:aggregate(health,'organization_weighted_share',null,true)},reason:'연도 생략은 발화일 기준 올해. 편성비중 기본은 사용자 합의 가중분'},
 '9a469144-706c-41a0-988d-df98e1663056':{category:'ready',group:'health_share',gold:{action:'new',patch:aggregate(health,'organization_weighted_share',9)}},
 'f24c19f9-39c7-4620-8c2b-976cd34d3d96':{category:'ready',group:'health_share',gold:{action:'new',patch:aggregate(health,'organization_weighted_share',9)},reason:'못만들어?도 조회 요청. 부정 표현만 보고 거절하지 않음'},
 'e7d20d24-b947-4a30-9b3e-48790420d2ac':{category:'ready',group:'health_weighted',gold:{action:'new',patch:aggregate(health,'weighted_minutes',9)}},
 'f84d6633-9365-4774-a91d-8ac3171b9cc1':{category:'duplicate',group:'health_share',duplicateOf:'9a469144-706c-41a0-988d-df98e1663056',reason:'동일 질문은 학습 가중치를 중복 부여하지 않고 출처만 보존'},
 'ca1c7927-f064-4f1f-96ab-ca7c48308b02':{category:'app_issue',group:'ui_disabled',reason:'버튼 비활성화 오류 신고. BI 지표 조회 학습에 섞지 않음'},
 '9f2603e5-52ad-4471-b102-6f05458ef0b1':{category:'ready',group:'health_weighted',gold:{action:'new',patch:aggregate(health,'weighted_minutes',null,true)}},
 'aa7507ba-593d-457f-a14a-2f375feaa466':{category:'duplicate',group:'health_weighted',duplicateOf:'9f2603e5-52ad-4471-b102-6f05458ef0b1',reason:'동일 질문 중복'},
 'cdea05b4-03d5-40a7-8914-4647822f1f0e':{category:'smalltalk',group:'free_chat',reason:'일반 대화 유도. 의미 없는 BI 조회를 실행하지 않음'},
 '874abcea-744f-49ce-a44d-c1e91194b72f':{category:'exclude',group:'pasted_explanation',reason:'과거 설명문·코드 변경 안내를 붙여넣은 내용. success였지만 실제 조회 질문이 아니므로 정답 제외'},
 'd608a3ea-33c9-4415-aa50-02a465abd200':{category:'needs_capability',group:'brand_ratios',desired:{action:'new',target:{kind:'brand',value:'레이델'},year:2026,metrics:['brand_weighted_share','weighted_sales_per_minute','weighted_profit_per_minute']},reason:'두 분당 정의와 전체 조직·전체 브랜드 대비 비중은 사용자 확인 완료. 현재 조직 전용 비중의 브랜드 확장 및 새 비율 지표 등록 필요'},
 '054c335f-d7dc-43d6-ab2f-47383e995126':{category:'needs_capability',group:'brand_ratios',desired:{action:'new',target:{kind:'brand',value:'레이델'},year:2026,operations:['distinct product count','product names','weighted_minutes','weighted_sales_per_minute','weighted_profit_per_minute']},reason:'복합 결과·고유 상품 수 및 확인된 두 비율의 실행 계약 확장 필요'},
 '18326c80-9508-49a5-8744-3a4327ee18aa':{category:'needs_capability',group:'brand_ratios',desired:{action:'new',target:{kind:'brand',value:'레이델'},year:2026,metrics:['weighted_minutes','weighted_sales_per_minute','weighted_profit_per_minute']},reason:'브랜드 전체를 상품 하나 선택으로 바꾸면 안 됨. 비율 지표는 정의 확정·실행 등록 대기'},
 'f0131805-aa85-4412-aef7-61025b9ffca7':{category:'needs_capability',group:'brand_ratios',desired:{action:'modify',patch:{target:{kind:'brand',value:'레이델'}}},contextFrom:'18326c80-9508-49a5-8744-3a4327ee18aa',reason:'브랜드 전체 범위만 수정하며 이전 연도·복수 지표 유지. 이전 복합 계획은 실행 등록 대기'},
 '6c022a41-ae0e-4ddb-9cdd-77377118e2b3':{category:'ready',group:'broadcast_time',gold:askTime('2026-10-08'),reason:'한글 여덟시도 8시. 오전/오후만 확인하고 날짜는 유지'},
 '8996aa0f-0c71-47f5-ab3e-d127c8f8f712':{category:'system_status',group:'engine_health',desired:{operation:'health-check',component:'local-engine'},reason:'실제 health 결과를 답해야 하므로 BI Planner 정답이나 무조건 준비됐다는 답변으로 학습하지 않음'},
 '191c88ea-6ebd-4a12-956c-295db5450d4a':{category:'ready',group:'broadcast_time',gold:askTime('2026-10-21'),reason:'엇그제는 엊그제의 오타로 해석하는 정리안. 발화일 2026-10-23에서 이틀 전. 시간만 확인'},
 '2637ca78-2079-4339-a4c0-1c8eb6ee3600':{category:'ready',group:'broadcast_time',gold:askTime('2026-10-21'),contextFrom:'191c88ea-6ebd-4a12-956c-295db5450d4a',reason:'날짜를 명확하게 재진술한 요청. 월 단위만 강요하지 않음'},
 '1764c08a-eece-47ca-8f08-b66d3e4c1f27':{category:'ready',group:'broadcast_time',gold:askTime('2026-10-21'),contextFrom:'2637ca78-2079-4339-a4c0-1c8eb6ee3600',reason:'앞선 방송 검색 의도를 유지. 불만을 새 지표 요청으로 분류하지 않음'},
 '3d13dcaa-eb99-4e3d-ad4b-0537942fe411':{category:'ready',group:'broadcast_time',gold:askTime('2026-10-21'),contextFrom:'1764c08a-eece-47ca-8f08-b66d3e4c1f27',reason:'이전 방송 요청과 해결되지 않은 오전/오후를 유지. 무관한 팀·상품 질문 금지'},
 '857ad560-8374-4140-a95c-ac374dc7176d':{category:'ready',group:'culture_correction',gold:clarifyPeriod(culture,'weighted_minutes'),reason:'문화팀=문화서비스팀 사용자 확인. 기간 정보는 아직 없음'},
 'bf4a424a-7aa2-4842-9091-6653e5672c80':{category:'ready',group:'culture_correction',gold:clarifyPeriod(culture,'organization_weighted_share'),reason:'편성비중 단어의 편성을 조직명 편성팀으로 오인하면 안 됨'},
 'df565883-1c7f-4d44-a052-f23fed34651f':{category:'ready',group:'culture_correction',gold:{action:'modify',patch:{filters:dates(2026),groupBy:monthly}},contextFrom:'bf4a424a-7aa2-4842-9091-6653e5672c80',reason:'문화서비스 대상·편성비중 지표를 유지하고 연도·집계만 채움. 과거 편성팀 조회 숫자는 학습 금지'},
 'fa23ae11-0799-4379-984b-a0e133997ced':{category:'ready',group:'culture_correction',gold:{action:'modify',patch:{target:culture}},actualPrevious:true,reason:'왜가 있어도 원인 분석이 아니라 잘못 선택한 조직의 정정. 연도·월별·비중 유지'},
 'a7c518dc-f4bb-4e84-abc1-a03145d5c8b7':{category:'needs_capability',group:'organization_share_ranking',desired:{action:'new',operation:'aggregate',target:null,period:{year:2026,month:6},metrics:['organization_weighted_share'],groupBy:[{field:'BO[표준조직]',unit:'value'}],sort:[{field:'organization_weighted_share',direction:'desc'}],limit:1},reason:'전 조직을 그룹별 집계·내림차순 정렬. 편성팀 하나를 고르는 요청이 아님. 현재 비중 Validator의 단일 조직 제한 확장 필요'},
 '80a8f2b7-eef2-4804-a471-c4635df0df68':{category:'needs_capability',group:'organization_share_ranking',desired:{action:'new',operation:'aggregate',target:null,period:{year:2026,month:6},metrics:['organization_weighted_share'],groupBy:[{field:'BO[표준조직]',unit:'value'}]},reason:'조직별 전체 표 요청. success였지만 편성팀 하나 0%를 반환했으므로 정답 제외'},
 '70e5ab50-60cb-4110-865d-f91cd4a72f85':{category:'needs_capability',group:'organization_share_ranking',desired:{action:'modify',patch:{target:null,groupBy:[{field:'BO[표준조직]',unit:'value'}]}},contextFrom:'80a8f2b7-eef2-4804-a471-c4635df0df68',reason:'조직별 집계를 다시 요구한 수정 발화. 6월·지표 유지, 잘못된 편성팀 단일 대상 제거'},
};
const out=path.join(root,'data/training');fs.mkdirSync(out,{recursive:true});
const decisions={version:1,date:'2026-10-23',facts:[{id:'culture_alias',aliases:['문화팀','문화서비스팀'],canonical:'문화서비스',status:'user-confirmed'},{id:'weighted_sales_per_minute',expression:"DIVIDE(SUM('BO'[(전체)예상취급액]), SUM('BO'[가중분]))",meaning:'전체 예상취급액 합계 / 가중분 합계',status:'user-confirmed-definition; not-registered-in-current-executor'},{id:'weighted_profit_per_minute',expression:"DIVIDE(SUM('BO'[(전체)한계이익]), SUM('BO'[가중분]))",meaning:'전체 한계이익 합계 / 가중분 합계',status:'user-confirmed-definition; not-registered-in-current-executor'},{id:'brand_weighted_share',meaning:'해당 브랜드 전체 상품의 가중분 합계 / 같은 기간 전체 조직·전체 브랜드 가중분 합계',status:'user-confirmed-definition; brand scope not supported by current share validator'}],unknowns:['잔여편성의 기간·확정/계획 기준','광고비 마진구조의 정확한 계산 정의','가중분이 0일 때 두 분당 지표의 표시 방식'],warning:'기존 모델 측정값 내부 식과 사용자 확인 비율이 동일하다고 추정하지 않음'};
const annotations=rows.map(row=>({sampleId:row.id,sourceId:row.id,input:row.input,timestamp:row.timestamp,oldBotOutcome:row.outcome||row.status,oldReplyUsedAsGold:false,...labels[row.id],...(labels[row.id]?{}:{category:'unreviewed',group:'unreviewed',reason:'새 기록: 자동 정답 생성하지 않음'})}));
const byId=new Map(annotations.map(r=>[r.sampleId,r]));
function previousPlan(item){
  if(item.actualPrevious){const sourceRow=rows.find(r=>r.id===item.sourceId);const old=sourceRow.previousContext;return {...emptyPlan(),operation:'aggregate',target:{kind:old.target.kind,value:old.target.value},metrics:old.metrics,filters:dates(old.period.year),groupBy:old.groupBy==='month'?monthly:[]};}
  const prior=byId.get(item.contextFrom);return prior?.gold?.patch||null;
}
const datasets={train:[],eval:[]};
for(const item of annotations.filter(r=>r.category==='ready')){
  const errors=schemaErrors(item.gold,turnSchema);if(errors.length)throw Error(item.sampleId+': '+errors.join(';'));
  if(item.gold.action==='new'){const check=validatePlan(item.gold.patch,catalog,entities);if(!check.ok)throw Error(item.sampleId+': '+check.errors.join(';'));}
  const context=[];let prior=byId.get(item.contextFrom);for(let i=0;prior&&i<4;i++){context.unshift({input:prior.input,desiredTurn:prior.gold});prior=byId.get(prior.contextFrom);}
  const system='너는 BI 조회 계획을 만드는 모델이다. 질문과 앞 대화를 해석해 JSON turn만 반환한다. 기존 조건을 유지하며 수정한 부분만 patch한다. 과거 봇의 성공 표시나 조회 숫자는 정답 근거가 아니다. 한국 기준 발화일로 상대 날짜를 해석한다. 문화팀은 문화서비스팀, 편성비중 기본은 가중분이다. 불명확한 부분만 귀엽고 간결하게 물으며 입력 형식을 강요하지 않는다.';
  const payload={text:item.input,todayKorea:item.timestamp.slice(0,10),context,previousState:{plan:previousPlan(item),pending:null},catalogContext:{targetMetadata:entities,metricDefinitions:item.gold.patch?.metrics?.map(id=>catalog.metrics[id])||[],columnMetadata:catalog.tables[0].columns.filter(c=>['BO[방송일시]','BO[편성코드]','BO[대표상품명]'].includes(c.id))}};
  const split=item.group==='broadcast_time'?'eval':'train';item.split=split;
  datasets[split].push({sampleId:item.sampleId,sourceGroup:item.group,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(payload)},{role:'assistant',content:JSON.stringify(item.gold)}]});
}
for(const [name,value]of Object.entries({decisions,annotations}))fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,null,2)+'\n');
for(const split of ['train','eval'])fs.writeFileSync(path.join(out,split+'.planner.jsonl'),datasets[split].map(r=>JSON.stringify(r)).join('\n')+'\n');
const categories=Object.fromEntries([...new Set(annotations.map(r=>r.category))].map(k=>[k,annotations.filter(r=>r.category===k).length]));
const manifest={source:'data/conversation-history.jsonl',preparedAt:new Date().toISOString(),sourceSha256:createHash('sha256').update(source).digest('hex'),sourceRecords:rows.length,categories,train:datasets.train.length,eval:datasets.eval.length,splitPolicy:'broadcast_time group held out in full; duplicate questions excluded; linked turns stay in same split',trainingExecuted:false,modelDownloaded:false,biQueried:false};
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const md=['# 우사기 커스텀 Planner 학습자료 정리','',`원본 ${rows.length}건. 학습 초안 ${manifest.train}건, 평가 초안 ${manifest.eval}건. 실제 모델 학습·다운로드·BI 조회는 실행하지 않았다.`,
  '', '## 사용자 확인 정의','', '문화팀 = 문화서비스팀(문화서비스). 분당 취급고 = 전체 예상취급액 합계 / 가중분 합계. 분당 이익액 = 전체 한계이익 합계 / 가중분 합계. 비율은 행별 평균이 아니다. 브랜드 편성비중은 같은 기간 전체 조직·전체 브랜드 가중분 대비다. 새 비율과 브랜드 비중은 현재 실행 지표 등록·범위 확장이 필요해 복합 질문을 SFT에서 보류한다.',
  '', '## 반드시 피할 과거 오류','', '- 긴 설명문을 BI 질문으로 오인해 숫자를 반환한 success 기록은 학습 제외.','- 문화팀을 편성팀으로 선택하고 0%를 답한 기록은 정답이 아니다.','- 브랜드 전체 요청을 개별 상품 하나 선택으로 바꾸지 않는다.','- 왜 편성팀을 찾았냐는 말은 조직 정정이며 원인 분석 거절 대상이 아니다.','- 엇그제/여덟시/26년 같은 표현을 이해하고 필요한 시간 구분만 확인한다.',
  '', '## 원문별 정리','', '| 번호 | 원문 | 분류 | 정리 |','|---|---|---|---|',...annotations.map((r,i)=>`| ${i+1} | ${r.input.length>100?'긴 붙여넣기 설명문 (원본 ID로 보존)':r.input.replace(/\|/g,'/')} | ${r.category} | ${r.reason||'확인된 기본값과 지표를 사용한 계획'} |`),
  '', '## 파일과 사용 범위','', '`data/training/annotations.json`: 원본 전체의 출처 ID·원문·의도·보류 근거. 새 대화 목록이 아니라 원본에서 파생한 학습 주석이다.','`decisions.json`: 이번 사용자 확인과 미확인 업무 정의.','`train.planner.jsonl` / `eval.planner.jsonl`: messages 형식의 계획 생성용 초안. 학습 도구에 맞는 포맷 변환은 모델 선택 후 수행한다.','`manifest.json`: 원본 해시, 분할 기준, 개수.',
  '', '표본 수가 적고 표현·업무 범위가 좁아 커스텀 모델 성능을 보장하지 않는다. 이 초안의 평가군은 이번에 처음 정한 분할이며, 과거 개발 중 이미 본 대화여서 완전한 독립 평가로 볼 수 없다. 새 사용자 질문으로 별도 회귀 평가를 더 모아야 한다. 기존 잘못된 봇 답변과 실제 BI 수치는 messages 정답에 넣지 않는다. 합성 데이터·이전 데모는 섞지 않았다.',
  '', '현재 실행 모델을 바꾸거나 중단했던 LLM 연결 작업을 재개하지 않는다. 모델 종류·학습 자원·추가 데이터가 준비된 뒤 실제 학습을 별도 진행한다.'];
fs.mkdirSync(path.join(root,'docs'),{recursive:true});fs.writeFileSync(path.join(root,'docs/usagi-training-review.md'),md.join('\n')+'\n');
console.log(JSON.stringify(manifest,null,2));
