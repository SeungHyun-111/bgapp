const { metrics } = require('./bi-metrics');
/*
 * 최우선 개발 방향 — 사용자 합의, 2026-10-23
 * 문장별 alias/정규식 확장보다 실제 사용 데이터로 로컬 NLU의 일반화 성능을 높인다.
 * 질문 → 모델 예측 → 최종 BI 조건 → 결과/수정 관찰 → 정답 후보 → 정답 확정 →
 * 재학습 → 기존/신규 모델 비교 → 개선 시 버전별 적용. 기존 모델과 롤백을 보존한다.
 * conversation-history.jsonl에 최초 predicted와 finalQuery를 별도로 보존하고,
 * 대화/턴 ID, 모델 버전, 수정·취소·조건 추가, 승인 근거, 학습 사용 이력을 확장한다.
 * 조회 성공·침묵은 정답 확정이 아니다. 후속 조건 추가도 이전 예측 오류로 단정하지 않는다.
 * 행동에서 추론한 약한 신호와 확정 정답을 구분한다. 매번 승인 버튼을 강요하지 않되,
 * 미승인 예측을 자동 정답 처리하여 모델의 자기 오류를 재학습하지 않는다.
 * 승인 데이터가 설정량 쌓이면 별도 후보 모델을 학습한다(100건은 예시일 뿐).
 * 고정 미학습 평가셋에서 의도·개체·최종 조건 정확도와 회귀를 비교해 적용을 결정한다.
 * 업무 기본값·BI 계산식·권한 검증은 명시적 규칙으로 유지한다. 학습/추론은 로컬이며,
 * 개발 검증용 BI 로그인·실조회는 자동 실행하지 않는다.
 * 정리된 annotations.json 변경 → learning-loop → 후보 재학습·회귀 검증 → 통과 시 교체.
 * 원본 대화를 자동 정답으로 삼지 않으며, 아직 실행할 수 없는 정답은 학습에서 보류한다.
 * 이후 개발의 기준 문서: USAGI_NLU.md '최우선 개발 방향'.
 */
const {connectionMessage}=require('./connection-errors');
const {interpretQuery}=require('./query-interpreter');
const {applyQueryState}=require('./query-state');
const {randomUUID}=require('crypto');
const { resolveEntities, normalize, isEntityReply } = require('./entity-resolver');
class Dialogue {
  constructor({ nlu, store, codes = () => [], getEntities = null, queryMetric = null, now = () => new Date() }) {
    this.nlu=nlu;this.store=store;this.codes=codes;this.getEntities=getEntities;this.queryMetric=queryMetric;this.now=now;this.reset();
  }
  reset() { this.state={};this.lastActivity=0;this.revision=(this.revision||0)+1;this.conversationId=randomUUID();this.turnId=null; }
  async unknown(input,message='우응… 질문을 잘 모르겠어. 팀이나 상품 이름과 궁금한 항목을 조금 더 자세히 알려줄래?') {
    if(this.store.appendConversation)return {kind:'reply',saved:true,message};
    const saved=await this.store.append(input,'talk');return {kind:'reply',saved:!saved.blocked,id:saved.id,message};
  }
  async execute(input) {
    const previousContext=JSON.parse(JSON.stringify(this.state));
    const previousTurnId=this.turnId;
    const previousConversationId=this.conversationId;
    this.interpretation=null;
    const result=await this.executeTurn(input);
    this.turnId=randomUUID();
    if(this.store.appendConversation) {
      try {const saved=await this.store.appendConversation(input,result,this.state,{conversationId:this.conversationId,turnId:this.turnId,previousTurnId:previousConversationId===this.conversationId?previousTurnId:null,previousContext:previousConversationId===this.conversationId?previousContext:{},predicted:this.interpretation?.predicted,action:this.interpretation?.action,slotPatch:this.interpretation?.patch,correction:this.interpretation?.correction});if(saved?.id)result.id=saved.id;}
      catch {result.saved=false;result.message+='\n대화 기록은 저장하지 못했어.';}
    }
    return result;
  }
  async executeTurn(input) {
    if(Date.now()-this.lastActivity>15*60000)this.reset();
    this.lastActivity=Date.now();const revision=this.revision;
    if(/^(취소|처음부터|초기화)[.! ]*$/.test(input)){this.reset();return {kind:'reply',message:'하! 앞 이야기는 비웠어. 새로 물어봐 🐰'};}
    if(this.state.periodSuggestions){
      const selected=input.trim().match(/^([1-3])(?:번)?[.!]?$/);
      const option=selected?this.state.periodSuggestions[Number(selected[1])-1]:this.state.periodSuggestions.find(item=>input.trim()===item.label);
      if(option){input=option.input;delete this.state.periodSuggestions;}
      else if(selected)return {kind:'reply',message:'아? 보여준 번호 중에서 골라줘. 다른 연도를 직접 말해도 돼 🐰'};
      else {const year=input.trim().match(/^(?:아니\s*)?(\d{2}|\d{4})\s*년[.!? ]*$/);if(year)input=this.state.periodSuggestions[0].input.replace(/\d+\s*년/,year[1]+'년');delete this.state.periodSuggestions;}
    }
    if(/^(조회항목|지표목록|BI목록|뭐조회할수있어)[?？! ]*$/i.test(input.replace(/\s/g,'')))return {kind:'reply',message:'하! 팀이나 상품, 기간, 궁금한 항목을 알려줘 🐰\n'+metrics.map(m=>m.label).join(' · ')+'\n예: 9월 헬스푸드팀 가중분. 연도가 없으면 올해로 볼게!'};
    let detected=[];
    let date={};
    const shareMention=/편성\s*(?:비중|비율)|가중분\s*비중|방송\s*(?:횟수|건수)\s*비중/.test(input);
    const shareRequest=shareMention;
    const nluInput=input;
    let parsed;
    try{parsed=await this.nlu.parse(nluInput);}catch(error){return this.unknown(input,connectionMessage(error,'nlu'));}
    if(revision!==this.revision)return {kind:'reply',message:'하! 앞 대화는 비웠어. 다시 물어봐 🐰'};
    const interpretation=interpretQuery(input,parsed,this.state,this.now());
    this.interpretation=interpretation;detected=interpretation.metrics;date=interpretation.period;
    if(interpretation.recognized&&interpretation.action==='cancel'){this.reset();return {kind:'reply',message:'하! 앞 이야기는 비웠어. 새로 물어봐 🐰'};}
    if(interpretation.recognized&&interpretation.action==='confirm')return {kind:'reply',message:this.state.pending?'아? 아직 필요한 조건이 남아 있어. '+({target:'대상',period:'기간',metric:'항목'}[this.state.pending]||'조건')+'을 알려줘 🐰':'응! 지금 조건을 유지할게 🐰'};
    if(date.error){
      if(date.suggestions?.length){
        const pendingPatch={};
        if(detected.length)pendingPatch.metrics=detected;
        if(interpretation.targetScope==='organizations'){pendingPatch.target={kind:'organization_group',field:'표준조직',value:'전체 조직',name:'조직별'};pendingPatch.groupBy='organization';}
        if(interpretation.action!=='remove_condition')try{this.state=applyQueryState(this.state,{action:interpretation.action,patch:pendingPatch});}catch{}
        this.state.periodSuggestions=date.suggestions;
      }
      return {kind:'reply',message:date.error};
    }
    if(detected.length>8)return {kind:'reply',message:'한 번에 지표 8개까지 볼 수 있어! 조금 나눠줘 🐰'};
    if(interpretation.unsupported)return this.unknown(input,'아? 조회 항목은 살펴봤는데, 비교·원인 분석이나 순위 계산은 아직 연결되지 않았어 🐰');
    if(interpretation.unsupportedDate)return this.unknown(input,'우응… 일·주 단위 조회는 아직 연결되지 않았어. 월이나 연도 단위로 볼 수 있어 🐰');
    if(/제외/.test(input)&&interpretation.action!=='remove_condition'&&!detected.some(id=>metrics.find(m=>m.id===id)?.aliases.some(alias=>alias.includes('제외')&&input.replace(/\s/g,'').includes(alias.replace(/\s/g,'')))))return this.unknown(input);
    const continuing=Boolean(this.state.pending||this.state.metric);
    let entities;
    try {
      entities=this.getEntities&&(detected.length||shareRequest||continuing||interpretation.recognized)?await this.getEntities():[...this.codes()].map(value=>({kind:'product',field:'편성코드',value,name:value}));
    }catch(error){return {kind:'reply',message:connectionMessage(error,'catalog'),retryable:true};}
    if(revision!==this.revision)return {kind:'reply',message:'하! 앞 대화는 비웠어. 다시 물어봐 🐰'};
    const entityInput=interpretation.targetScope==='brand'?interpretation.positive+' 브랜드':interpretation.positive;
    let matches=interpretation.targetScope==='organizations'?[{kind:'organization_group',field:'표준조직',value:'전체 조직',name:'조직별'}]:resolveEntities(entityInput,entities),target=null;
    if(interpretation.organization&&interpretation.targetScope!=='organizations'){
      const verified=entities.filter(e=>e.kind==='organization'&&e.value===interpretation.organization);
      if(verified.length)matches=verified;
    }
    if(interpretation.brand&&interpretation.targetScope!=='organizations'){
      const verified=resolveEntities(interpretation.brand+' 브랜드',entities);if(verified.length)matches=verified;
    }
    if(interpretation.product&&interpretation.targetType==='product'){
      const verified=entities.filter(e=>e.kind==='product'&&e.value===interpretation.product);if(verified.length)matches=verified;
    }
    if(interpretation.targetScope==='brand'&&!matches.length&&this.state.target){
      const brand=this.state.target.kind==='brand'?this.state.target.value:this.state.target.value.match(/^\[([^\]]+)\]/)?.[1];
      if(brand)matches=[{kind:'brand',field:'편성코드',value:brand,name:`${brand} 브랜드 전체`}];
    }
    if(matches.some(e=>e.kind==='brand'))detected=detected.filter(id=>id!=='column:브랜드');
    const candidates=this.state.candidates||[],selection=input.trim().match(/^([1-9]\d?)(?:번)?[.!]?$/);
    if(!matches.length&&candidates.length&&(interpretation.targetScope==='brand'||/브랜드|전체\s*상품|모든\s*상품/.test(input))) {
      const brands=[...new Set(candidates.filter(e=>e.kind==='product').map(e=>e.value.match(/^\[([^\]]+)\]/)?.[1]).filter(Boolean))];
      if(brands.length===1){target={kind:'brand',field:'편성코드',value:brands[0],name:`${brands[0]} 브랜드 전체`};matches=[target];detected=detected.filter(id=>id!=='column:브랜드');}
    }
    if(selection&&candidates[Number(selection[1])-1]){target=candidates[Number(selection[1])-1];matches=[target];}
    if(!matches.length&&candidates.length&&normalize(input).length>=2)matches=candidates.filter(e=>normalize(e.value).includes(normalize(input)));
    if(continuing&&interpretation.correction&&!detected.length&&!date.period&&!matches.length&&!/유형|무형/.test(input))return {kind:'reply',message:'아? 앞에서 잡은 조건 중 어떤 부분을 바꿀까? 대상·기간·항목 중 바꾸려는 부분만 말해줘 🐰'};
    const slotReply=continuing&&Boolean(target||isEntityReply(input,matches)||(matches.some(e=>e.kind==='brand')&&(/브랜드|모든\s*상품|전체\s*상품/.test(input)||interpretation.targetScope))||detected.length||date.period||shareRequest);
    const completeSlots=(detected.length>0||shareRequest)&&Boolean(matches.length||this.state.target);
    if(!interpretation.recognized&&!slotReply&&!completeSlots&&!shareRequest)return this.unknown(input);
    const patch={};
    if(date.period){if(date.groupBy==='month')patch.groupBy=date.groupBy;patch.period=date.period;patch.defaultedYear=Boolean(date.defaultedYear);}
    if(interpretation.groupBy!==undefined)patch.groupBy=interpretation.groupBy;
    if(interpretation.limit)patch.limit=interpretation.limit;else if(interpretation.groupBy!==undefined)patch.limit=null;
    if(detected.length)patch.metrics=detected;
    if(matches.length===1)patch.target=matches[0];
    if(interpretation.filters)patch.filters=interpretation.filters;
    const typeMatch=input.match(/(?:^|\s)(무형|유형)(?=\s|$)/);
    if(typeMatch)patch.filters={productType:typeMatch[1]};
    if(/유\/?무형\s*전체/.test(input))patch.filters={productType:'all'};
    if(['add_condition','change_grouping'].includes(interpretation.action)&&!Object.keys(patch).length)return {kind:'reply',message:interpretation.action==='add_condition'?'아? 어떤 항목이나 조건을 추가할까? 요청한 항목을 BI 지표에 연결하지 못했어 🐰':'아? 어떤 기준으로 나눠볼까? 월별·조직별 중 알려줘 🐰'};
    if(patch.groupBy==='month'&&this.state.target?.kind==='organization_group'&&!patch.target)return {kind:'reply',message:'아? 조직과 월을 함께 나누는 집계는 아직 지원하지 않아. 한 조직의 월별 추이를 볼지, 한 기간의 조직별 비중을 볼지 알려줘 🐰'};
    if(interpretation.action==='remove_condition'&&!interpretation.removeFields.length&&!interpretation.removeMetrics.length)return {kind:'reply',message:'아? 어떤 조건을 뺄까? 지표·기간·대상 중 뺄 부분을 알려줘 🐰'};
    interpretation.patch=patch;
    try{this.state=applyQueryState(this.state,{action:interpretation.action,patch,removeFields:interpretation.removeFields,removeMetrics:interpretation.removeMetrics});}
    catch(error){return {kind:'reply',message:error.message};}
    if((this.state.metrics||[]).length>8)return {kind:'reply',message:'한 번에 지표 8개까지 볼 수 있어! 조금 나눠줘 🐰'};
    if(matches.length>1){this.state.candidates=matches.slice(0,10);this.state.pending='target';return {kind:'reply',message:'아? 후보가 여러 개야! 번호나 더 자세한 이름으로 골라줘 🐰\n'+this.state.candidates.map((e,i)=>`${i+1}. [${e.kind==='organization'?'조직':'상품'}] ${e.name||e.value}`).join('\n')+(matches.length>10?'\n다른 대상이면 이름을 더 자세히 알려줘!':'')};}
    if(matches.length===1)delete this.state.candidates;
    if(!this.state.target){this.state.pending='target';return {kind:'reply',message:'어떤 팀이나 상품이 궁금해? BI 목록에서 확인할 수 있게 이름을 알려줘 🐰'};}
    if(this.state.metrics?.some(id=>id.startsWith('organization_'))&&!['organization','organization_group'].includes(this.state.target.kind)){
      delete this.state.target;delete this.state.product;this.state.pending='target';return {kind:'reply',message:'팀별 편성비중을 볼게! 어떤 팀인지 알려줘 🐰'};
    }
    if(!this.state.metric){this.state.pending='metric';return {kind:'reply',message:'아? 어떤 항목이 궁금해? 가중분·취급액·주문량·마진처럼 알려줘 🐰'};}
    if(!this.state.period){this.state.pending='period';return {kind:'reply',message:'하! 어느 기간으로 볼까? 9월, 2026년 9월, 이번 달, 지난달처럼 알려줘 🐰'};}
    if(this.state.groupBy==='month' && this.state.metrics?.some(id=>metrics.find(m=>m.id===id)?.raw))return {kind:'reply',message:'아? 이 항목은 방송별 원본 값이야. 월별 합계나 평균 기준을 먼저 정해줘!'};
    delete this.state.pending;
    if(!this.queryMetric)return this.unknown(input,'앗! BI 연결이 아직 준비되지 않았어. 질문은 노트에 적어둘게 🐰');
    const request={...this.state,target:{...this.state.target},metrics:[...(this.state.metrics||[this.state.metric])]};
    try{
      const result=await this.queryMetric(request);
      if(revision!==this.revision)return {kind:'reply',message:'하! 앞 대화는 비웠어. 다시 물어봐 🐰'};
      const name=request.target.name||request.target.value;
      if(result.empty)return {kind:'reply',message:`아? ${name}의 ${result.basis} 데이터가 없어. 다른 기간으로 볼까?`};
      return {kind:'reply',outcome:'success',message:`찾았다! ${name}\n${result.series ? result.series.map(bucket=>`${bucket.label}: ${bucket.empty?'데이터 없음':bucket.values.map(v=>`${v.label} ${v.formattedValue}`).join(' / ')}`).join('\n') : result.values.map(v=>`${v.label}: ${v.formattedValue}`).join('\n')}\n${result.basis} 기준이야.${request.defaultedYear?' 연도는 올해로 적용했어.':''} 뿌륽!`};
    }catch(error){return {kind:'reply',message:connectionMessage(error,'query'),retryable:true};}
  }
}
module.exports={Dialogue};
