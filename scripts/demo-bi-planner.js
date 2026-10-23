const fs=require('fs/promises');
const path=require('path');
const {buildCatalog}=require('./build-bi-catalog');
const {QueryPlanner}=require('../src/planner/query-planner');
const {createFakeExecutor}=require('../src/planner/fake-bi-executor');
const catalog=buildCatalog();
const rows=[
  {'BO[방송일시]':'2026-10-21T08:00:00','BO[편성코드]':'[레이델]가상상품A','BO[대표상품명]':'가짜 오전 상품','BO[표준조직]':'문화서비스','BO[가중분]':10},
  {'BO[방송일시]':'2026-10-21T20:00:00','BO[편성코드]':'[레이델]가상상품B','BO[대표상품명]':'가짜 오후 상품','BO[표준조직]':'문화서비스','BO[가중분]':20},
  {'BO[방송일시]':'2026-10-21T20:30:00','BO[편성코드]':'[다른브랜드]가상상품C','BO[대표상품명]':'가짜 다른 상품','BO[표준조직]':'식품','BO[가중분]':30},
];
const entities=rows.map(r=>({kind:'product',field:'편성코드',value:r['BO[편성코드]']}));
entities.push({kind:'organization',field:'표준조직',value:'문화서비스'});
const filters=[{field:'BO[방송일시]',operator:'gte',value:'2026-10-21'},{field:'BO[방송일시]',operator:'lt',value:'2026-10-22'}];
async function demo(){
  // These are predetermined model responses, not a natural-language parser.
  const responses=[
    {tool:{name:'listFields',arguments:{query:'방송'}}},
    {action:'clarify',question:'8시는 오전이야, 오후야?'},
    {action:'new',patch:{operation:'list',fields:['BO[방송일시]','BO[대표상품명]'],metrics:[],filters:[...filters,{field:'BO[방송일시]',operator:'hour',value:20}],groupBy:[],sort:[{field:'BO[방송일시]',direction:'asc'}],limit:10}},
    {tool:{name:'searchTarget',arguments:{query:'레이델',kind:'brand'}}},
    {tool:{name:'getMetricDefinition',arguments:{id:'weighted_minutes'}}},
    {action:'new',patch:{operation:'aggregate',target:{kind:'brand',value:'레이델'},fields:[],metrics:['weighted_minutes'],filters,groupBy:[],sort:[],limit:10}},
    {action:'modify',patch:{groupBy:[{field:'BO[방송일시]',unit:'month'}]}},
    {action:'add',patch:{metrics:['orders']}},
    {action:'remove',patch:{},remove:['groupBy']},
    {action:'cancel'},
  ];
  const trace=path.resolve(__dirname,'../data/planner-demo-history.jsonl');
  const planner=new QueryPlanner({provider:{complete:async()=>{if(!responses.length)throw Error('Scripted responses exhausted');return responses.shift();}},catalog,entities,executor:createFakeExecutor({catalog,rows,entities}),now:()=>new Date('2026-10-23T00:00:00Z'),record:async event=>{await fs.mkdir(path.dirname(trace),{recursive:true});await fs.appendFile(trace,JSON.stringify({...event,scriptedProvider:true})+'\n');}});
  const output=[];
  for(const text of ['엊그제 8시 방송 뭐였어?','오후','레이델 브랜드 가중분','월별로','주문량도','월별 구분은 빼줘','취소'])output.push({input:text,...await planner.run(text)});
  console.log(JSON.stringify({notice:'합성 데이터 + 미리 작성한 계획. LLM 없음, 실제 BI 접속 없음.',output,trace},null,2));
}
if(require.main===module)demo().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={catalog,rows,entities,filters};
