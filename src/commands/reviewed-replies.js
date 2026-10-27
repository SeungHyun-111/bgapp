const fs=require('fs');
const path=require('path');
const replies=require('./rule-replies.json');
const {metrics}=require('./bi-metrics');
const normalize=text=>String(text).normalize('NFKC').toLocaleLowerCase().replace(/[\s.!?？,，/<>~]+/g,'');

function createReviewedReplies(directory){
  const reviewed=new Map();
  try{
    for(const row of JSON.parse(fs.readFileSync(path.join(directory,'training/annotations.json'),'utf8'))){
      if(row.replyKey&&row.oldReplyUsedAsGold===false&&row.category!=='unreviewed')reviewed.set(normalize(row.input),row.replyKey);
    }
  }catch{/* Base rule replies remain available before annotations are prepared. */}
  return {
    keyFor(input){
      const key=reviewed.get(normalize(input));if(key)return key;
      if(/^(야|di|우사기(?:야)?|안녕(?:하세요)?|하이)[.!?？\s]*$/i.test(input.trim()))return 'greet';
      if(/^(?:다시\s*시작(?:해보자|하자|할래)?|취소|처음부터|초기화)[.!?？\s]*$/.test(input.trim()))return 'reset';
      if(/^(?:조회항목|지표목록|BI목록|뭐조회할수있어)[?？!\s]*$/i.test(input.replace(/\s/g,'')))return 'capabilities';
      return null;
    },
    message(key,{entities=[]}={}){
      if(key==='capabilities'){
        const names=metrics.filter(m=>(!m.raw&&m.column)||m.reportTemplate).map(m=>m.label);
        return '조회 가능한 기본 항목은 '+names.join(' · ')+'이야.\n기간과 팀·상품·브랜드를 알려줘. 편성비중은 조직 기준이며 월별·조직별 집계도 가능해. 예: 7월 헬스푸드팀 가중분. 연도가 없으면 올해로 볼게.';
      }
      if(key==='organization_list'){
        const names=[...new Set(entities.filter(e=>e.kind==='organization').map(e=>e.value))];
        return names.length?'저장된 표준조직 목록은 '+names.join(' · ')+'이야. 최신 BI 목록을 다시 조회한 결과는 아니야.':'저장된 조직 목록이 없어. 조직 목록을 갱신하려면 BI에 연결해야 해.';
      }
      return replies[key]||null;
    },
  };
}
module.exports={createReviewedReplies};
