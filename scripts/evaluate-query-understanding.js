// Local NLU only: never imports or calls the Power BI bridge.
const fs=require('fs');
const path=require('path');
const {RasaClient}=require('../src/commands/rasa-client');
const {interpretQuery}=require('../src/commands/query-interpreter');
const {Dialogue}=require('../src/commands/dialogue');
const cases=[
  {text:'레이델 브랜드 26년 전체 가중분',metric:'weighted_minutes',scope:'brand'},
  {text:'그게 아니라 브랜드 전체로 합쳐봐',scope:'brand'},
  {text:'상품 하나 말고 소속 상품 전부 보고 싶어',scope:'brand'},
  {text:'그게 아니라 월 단위로 나눠서 봐',group:'month'},
  {text:'매달 편성 점유율 어떻게 돼',metric:'organization_weighted_share',group:'month'},
  {text:'문화서비스 올해 방송 점유율 알려줄래',metric:'organization_weighted_share'},
  {text:'취급액 말고 한계이익으로 바꿔',metric:'profit'},
  {text:'그게 아니라 방송횟수 기준이야',metric:'organization_broadcast_share',share:true},
  {text:'2025년 9월 가중분 알려줘',metric:'weighted_minutes'},
  {text:'홀베리 수수료 몇프로인데?',metric:'commission_rate'},
  {text:'취급액도 같이 보여줄래',metric:'sales',action:'add_condition'},
  {text:'한계이익은 빼줄래',metric:'profit',action:'remove_condition'},
  {text:'이 요청 취소할게',action:'cancel'},
  {text:'응 그걸로 하자',action:'confirm'},
  {text:'아니 26년 말고 25년으로 보자',action:'modify_condition'},
  {text:'레이델 올해 가중분 알려줘',metric:'weighted_minutes',action:'query'},
  {text:'그럼 월별로 바꿔봐',group:'month',action:'change_grouping'},
];
async function evaluate(modelPath,existingClient=null){
  const client=existingClient||new RasaClient({modelPath});const results=[];
  try {
    for(const example of cases){
      const parsed=await client.parse(example.text);
      const context=example.share?{metrics:['organization_weighted_share']}:{};
      const query=interpretQuery(example.text,parsed,context,new Date('2026-10-23T00:00:00Z'));
      const pass=(!example.metric||query.metrics.includes(example.metric))&&(!example.scope||query.targetScope===example.scope)&&(!example.group||query.period.groupBy===example.group)&&(!example.action||(query.recognized&&query.action===example.action));
      results.push({text:example.text,pass,intent:parsed.intent,entities:parsed.entities,actual:{action:query.action,metrics:query.metrics,scope:query.targetScope,group:query.period.groupBy}});
    }
    const requests=[],frames=[];
    const entities=['[레이델]폴리코사놀','[레이델]더블액션'].map(value=>({kind:'product',field:'편성코드',value}));
    entities.push({kind:'organization',field:'표준조직',value:'문화서비스',aliases:['문화서비스팀']});
    const dialogue=new Dialogue({nlu:{parse:async text=>{const parsed=await client.parse(text);frames.push({text,intent:parsed.intent,entities:parsed.entities});return parsed;}},store:{append:async()=>({id:'fixture'})},now:()=>new Date('2026-10-23T00:00:00Z'),getEntities:async()=>entities,queryMetric:async request=>{requests.push(request);return {basis:'LOCAL FIXTURE',values:[{label:'로컬 점검값',formattedValue:'1'}]};}});
    const replies=[];
    for(const text of ['레이델 26년 가중분','상품 하나 말고 소속 상품 전부 보고 싶어','그게 아니라 월 단위로 나눠서 봐','취급액 말고 한계이익으로 바꿔','취급액도 같이 보여줄래','한계이익은 빼줄래','아니 25년','브랜드 조건 빼','이 요청 취소할게'])replies.push((await dialogue.execute(text)).message);
    const transitions=[
      {name:'product candidates to whole brand',pass:requests[0]?.target.kind==='brand'&&requests[0]?.target.value==='레이델'},
      {name:'grouping update retains year and metric',pass:requests[1]?.groupBy==='month'&&requests[1]?.period.year===2026&&requests[1]?.metric==='weighted_minutes'},
      {name:'metric correction retains brand and grouping',pass:requests[2]?.metric==='profit'&&requests[2]?.target.kind==='brand'&&requests[2]?.groupBy==='month'},
      {name:'add metric preserves existing metric',pass:JSON.stringify(requests[3]?.metrics)===JSON.stringify(['profit','sales'])},
      {name:'remove metric preserves other conditions',pass:JSON.stringify(requests[4]?.metrics)===JSON.stringify(['sales'])&&requests[4]?.target.kind==='brand'&&requests[4]?.groupBy==='month'},
      {name:'period modification preserves metrics and grouping',pass:requests[5]?.period.year===2025&&requests[5]?.metric==='sales'&&requests[5]?.groupBy==='month'},
      {name:'remove target expands scope explicitly',pass:requests[6]?.target.kind==='all_products'&&requests[6]?.metric==='sales'},
      {name:'cancel clears state without BI query',pass:!dialogue.state.target&&requests.length===7},
    ];
    return {modelVersion:client.modelVersion,passed:results.filter(r=>r.pass).length,total:cases.length,results,transitions,replies,frames};
  }finally{if(!existingClient)client.stop();}
}
if(require.main===module)(async()=>{
  const modelPath=path.resolve(process.argv[2]||'nlu/models/usagi.tar.gz');
  const result=await evaluate(modelPath);
  const output=path.resolve('nlu/results/query-understanding-'+(process.argv[3]||'candidate')+'.json');
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2));
  console.log(JSON.stringify({passed:result.passed,total:result.total,results:result.results.map(r=>({text:r.text,pass:r.pass,actual:r.actual})),transitions:result.transitions,output},null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={evaluate};
