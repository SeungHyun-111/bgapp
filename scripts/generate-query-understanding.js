const fs=require('fs');
const path=require('path');
const {annotate,slot,yaml}=require('./lib/nlu-examples');
const root=path.resolve(__dirname,'..');
const examples={
 query:[
 '레이델 브랜드 전체 26년 가중분 알려줘','문화서비스팀 올해 매달 방송 점유율 보여줘','헬스푸드 달마다 방송 비중 어떻게 돼','홀베리 이번달 취급액 알려줘','헬스푸드팀 9월 편성비중','문화서비스 월 단위로 편성 점유율 보고 싶어','헬스 월마다 편성 비율 얼마야','홀베리 수수료 몇프로인데?','홀베리 마진이 어떻게 돼','헬쓰푸드팀 가중분이 궁금해','선일금고 지난달 한계이익','레이델 올해 가중분과 한계이익 알려줘','당근주스 취급액이랑 한계이익 같이 보여줘','9월 조직별 편성비중','부서별 가중분 알려줘',
 `6월 편성비중 ${slot('제일','limit',1)} 많이 쓴 ${slot('팀','groupBy','organization')}`,
 `올해 ${slot('전체 조직','groupBy','organization')} 편성비중 ${slot('1위','limit',1)} 알려줘`,
 ],
 modify_condition:[
 '그게 아니라 브랜드 전체 말하는 거야','아니 하나 말고 소속 상품 전부 합쳐서','같은 브랜드 상품 다 보자는 거야','그 제품 하나 말고 브랜드 단위로 묶어줘','레이델 제품 전부 합산해 달라고','아니 브랜드에 속한 모든 상품이라고','소속 제품 전체 기준으로 바꿔','그게 아니라 취급고가 궁금해','취급액 말고 한계이익으로 바꿔','마진 말고 한계이익 알려달라고','그 항목 대신 가중분으로 바꿔줘','아니 방송횟수 기준이야','가중분 기준 말한 거야','그게 아니라 횟수로 센 비중이야','아니 25년','그럼 지난달은','9월로 바꿔줘','2026년 9월','문화팀 찾으라니까 왜 편성팀을 찾았어','아니 문화서비스팀 얘기잖아','문화팀으로 대상을 정정해','잘못 찾았어 문화서비스로 바꿔','제품 하나가 아니라 소속 상품 전부를 보고 싶어','상품 한 가지 말고 소속 상품 모두 합산해줘','상품별로 고르라는 게 아니고 브랜드 전체 합계야','단일 상품이 아니라 브랜드에 속한 모든 상품이 대상이야',
 ],
 add_condition:[
 '취급액도 같이','한계이익도 추가해줘','가중분하고 취급액 둘 다 보여줘','수수료율도 함께 알려줘','지금 결과에 매출액도 넣어줘','가중분도 더해줘','기존 항목에 주문량을 추가해','한계이익도 빼먹지 말고 같이 봐','이번 결과에 취급액 하나 더','노출분까지 포함해줘','마진도 함께 보고 싶어','목표취급액도 덧붙여줘','한익까지 같이 보여달라고','그대로 두고 취급고도 넣어봐','기존 지표 유지하고 PG수수료 추가해',
 ],
 remove_condition:[
 '취급액 빼줘','가중분은 제외해','한계이익은 지워줘','매출액은 더 이상 안 볼래','주문량만 결과에서 빼','수수료율 제외해줘','취급고는 삭제해','목표취급액 빼고 나머지는 그대로','노출분을 제외하고 보여줘',
 slot('브랜드 조건','field','target')+' 빼',slot('기간 조건','field','period')+' 없애줘',slot('팀 조건','field','target')+' 지워',slot('유무형 필터','field','productType')+' 해제해',slot('월별 집계','field','groupBy')+' 풀어줘',slot('모든 지표','field','metric')+' 비워줘',slot('대상 조건','field','target')+' 제외하고 보여줘',
 ],
 change_grouping:[
 '월별로','매달 나눠서 봐','그게 아니라 월 단위로 나눠서 봐','한 달씩 따로 보고 싶은 거야','아니 매달 추이로 보자','월마다 나눠줘','달마다 보고 싶다고','26년 월별','조직별로 보여달라고','전체 조직을 한 줄씩 보여줘','아니 한 팀 말고 모든 팀의 편성비중이야','조직별로 나눠달라는 말이야','각 조직의 비중을 나눠서 보고 싶어',
 slot('합계 하나','groupBy','none')+'로 보여줘',slot('월 구분 없이','groupBy','none')+' 합쳐줘',
 ],
 confirm:['응 맞아','그래 그렇게 해','맞아 그 조건이야','확인','네 맞습니다','그걸로 해줘','좋아 진행해','응 그대로 조회해','그 조건으로 보여줘','맞다고'],
 cancel:['취소','처음부터','초기화','됐어 그만','앞 이야기 잊어','조회 취소해','그 요청은 없던 걸로 해','다 지우고 다시 시작하자','이번 요청 중단해','그만 찾아도 돼'],
 greet:['야','우사기야','안녕','안녕하세요','하이','듣고 있어?','di'],
 mood:['오늘 기분 어때','잘 지내','오늘 어때','뭐하고 있어','심심한데 이야기하자'],
 capabilities:['조회할 수 있는 건 뭐가 있어','무슨 지표를 볼 수 있어','어떤 실적을 조회해','지원하는 항목 알려줘','조회 가능한 항목 목록 보여줘'],
 organization_list:['표준조직명 종류 말해봐','어떤 팀들이 있어','조직 목록 보여줘','팀 이름 목록 알려줘','표준조직 종류가 뭐야'],
 conversation_feedback:['말투가 어색해','맥락이 이상하다는 뜻이야','그 인사말 좀 이상해','너무 똑같은 말만 해','자연스럽게 말해줘'],
 complaint:['뭔 소리 하는 거야','아니 대답이 이상하잖아','질문하고 다른 말만 하네','제대로 듣고 있는 거야','앞에서 말한 걸 왜 또 물어봐'],
 system_status:['너 이제 대화 잘해','로컬 엔진 준비됐어','어떤 방식으로 대답해','너 말할 수 있는 건 맞아','지금 준비된 상태야'],
 requirements:['그 기능은 나중에 정리하자','지금 조회하지 말고 기능으로 기록해','다음에 만들 기능이야','요구사항으로 남겨줘','이건 당장 실행하라는 뜻이 아니야'],
 unsupported_request:['잔여편성을 조회하고 싶어','광고비 마진구조가 궁금해','분당 취급액 계산해줘','브랜드 편성비중과 분당 이익액 보여줘','어제 여덟시 방송 목록 알려줘'],
 out_of_scope:['오늘 날씨 어때','점심 뭐 먹지','심심해','홀베리 뭐가 좀 이상한데','수수료가 떨어진 원인을 설명해줘','왜 마진이 달라졌어','다른 이야기 해보자'],
};
const groups=new Map(Object.entries(examples).map(([intent,texts])=>[intent,texts.map(t=>t.includes(']{')?t:annotate(t))]));
// DIET can tag a head word within a scope phrase. Normalize typed entity values
// to the same canonical slot; this does not select or alter an action intent.
const scopeSynonyms='  - synonym: all_products\n    examples: |\n      - 소속\n      - 전부\n';
fs.writeFileSync(path.join(root,'nlu/data/query-understanding.yml'),yaml(groups)+scopeSynonyms);
// Replace obsolete base/report files so they cannot silently reintroduce old labels.
for(const name of ['nlu.yml','report-queries.yml'])fs.writeFileSync(path.join(root,'nlu/data',name),'version: "3.1"\nnlu: []\n');
console.log('Action/slot examples: '+Object.values(examples).flat().length);
