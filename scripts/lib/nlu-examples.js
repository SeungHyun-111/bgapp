const {metrics}=require('../../src/commands/bi-metrics');
const facts=require('../../data/training/decisions.json').facts;
const slot=(text,entity,value)=>`[${text}]${JSON.stringify({entity,value})}`;
// This is supervised slot vocabulary, not intent selection at runtime.
const vocabulary=[
 ...metrics.flatMap(m=>m.aliases.map(text=>({text,entity:'metric',value:m.id}))),
 ...facts.filter(f=>f.aliases&&f.canonical).flatMap(f=>f.aliases.map(text=>({text,entity:'organization',value:f.canonical}))),
 ...['브랜드 전체','소속 상품 전부','소속 상품 모두','같은 브랜드 상품 다','브랜드 단위로','제품 전부 합산','소속 제품 전체','같은 상표끼리','제품 다 합쳐서','브랜드에 속한 모든 상품'].map(text=>({text,entity:'scope',value:'all_products'})),
 ...['월별','매달','매월','달마다','월마다','월 단위로','달마다 나눠서','한 달씩 따로'].map(text=>({text,entity:'groupBy',value:'month'})),
 ...['조직별','팀별','각 부서','각 조직','모든 팀','전체 조직','팀들의'].map(text=>({text,entity:'groupBy',value:'organization'})),
 ...['편성 점유율','방송 점유율','방송 비중','편성 비율','차지하는 방송 비율'].map(text=>({text,entity:'metric',value:'organization_weighted_share'})),
 {text:'취급고',entity:'metric',value:'sales'},
 {text:'방송횟수 기준',entity:'shareBasis',value:'broadcast_count'},
 {text:'횟수로 센 비중',entity:'shareBasis',value:'broadcast_count'},
 {text:'가중분 기준',entity:'shareBasis',value:'weighted_minutes'},
];
function annotate(text,extra=[]){
  const spans=[];
  for(const v of [...extra,...vocabulary].sort((a,b)=>b.text.length-a.text.length)){
    let at=text.indexOf(v.text);
    while(at>=0){const end=at+v.text.length;if(!spans.some(s=>at<s.end&&end>s.at))spans.push({...v,at,end});at=text.indexOf(v.text,at+1);}
  }
  for(const s of spans.sort((a,b)=>b.at-a.at))text=text.slice(0,s.at)+slot(text.slice(s.at,s.end),s.entity,s.value)+text.slice(s.end);
  return text;
}
function yaml(groups){return 'version: "3.1"\nnlu:\n'+[...groups].map(([intent,items])=>`  - intent: ${intent}\n    examples: |\n`+items.map(text=>'      - '+text.replace(/\r?\n/g,' ')+'\n').join('')).join('');}
module.exports={slot,annotate,yaml};
