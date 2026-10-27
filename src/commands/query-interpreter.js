const {metrics,detectMetrics}=require('./bi-metrics');
const {parsePeriod,currentYear}=require('./period-parser');
const {actionIntents,SLOT_FIELDS}=require('./query-capabilities');
const {canonicalField}=require('./slot-schema');
const known=new Set(metrics.map(m=>m.id));
function interpretQuery(input,parsed,context={},now=new Date()){
  const ranking=(parsed.intent_ranking||[]).filter(i=>i.name!=='nlu_fallback');
  const top=parsed.intent||ranking[0]||{};
  const confident=top.name!=='nlu_fallback'&&(top.confidence||0)>=.65&&(!ranking[1]||top.confidence-ranking[1].confidence>=.15);
  const action=confident&&actionIntents.has(top.name)?top.name:'query';
  const correction=action==='modify_condition';
  const pivot=action!=='remove_condition'?[...input.matchAll(/그게\s*아니라|말고|대신/g)].pop():null;
  const offset=pivot?pivot.index+pivot[0].length:0,positive=input.slice(offset);
  const entities=(parsed.entities||[]).filter(e=>(e.confidence_entity??e.confidence??1)>=.65&&(!Number.isInteger(e.start)||e.start>=offset));
  const value=name=>entities.find(e=>e.entity===name)?.value;
  const metricEntities=entities.filter(e=>e.entity==='metric'&&known.has(e.value));
  let remaining=positive;
  for(const e of [...metricEntities].sort((a,b)=>b.start-a.start))if(Number.isInteger(e.start)&&Number.isInteger(e.end)&&e.end<=input.length)remaining=remaining.slice(0,e.start-offset)+' '.repeat(e.end-e.start)+remaining.slice(e.end-offset);
  // Model slots own their spans. Vocabulary fills unclaimed spans only and
  // never changes the model's add/remove/modify action.
  let selected=[...new Set([...metricEntities.map(e=>e.value),...detectMetrics(remaining)])];
  const grouping=['month','organization','none'].includes(value('groupBy'))?value('groupBy'):undefined;
  const targetType=['brand','organization','product'].includes(value('targetType'))?value('targetType'):undefined;
  const scope=['all_products','all_organizations'].includes(value('scope'))?value('scope'):undefined;
  const targetScope=scope==='all_organizations'||grouping==='organization'||/조직별|팀별|각\s*팀|팀들의/.test(positive)?'organizations':targetType==='brand'||scope==='all_products'||/브랜드/.test(positive)?'brand':undefined;
  if(targetScope)selected=selected.filter(id=>id!=='column:브랜드');
  const basis=value('shareBasis');
  const share=selected.some(id=>id.startsWith('organization_'))||/편성\s*(비중|비율)|방송\s*점유율/.test(positive);
  if(action!=='remove_condition'&&(share||(context.metrics?.some(id=>id.startsWith('organization_'))&&(basis||/횟수\s*기준|가중분\s*기준/.test(positive))))){
    const count=basis==='broadcast_count'||selected.includes('organization_broadcast_share')||/횟수|건수/.test(positive);
    const independent=positive.replace(/가중분\s*(?:기준\s*)?(?:편성\s*)?(?:비중|비율)/g,'').replace(/가중분\s*기준/g,'');
    const separateWeighted=detectMetrics(independent).includes('weighted_minutes');
    selected=selected.filter(id=>!id.startsWith('organization_')&&(id!=='weighted_minutes'||separateWeighted));selected.push(count?'organization_broadcast_share':'organization_weighted_share');
  }
  let period=parsePeriod(positive,now,context);
  const year=Number(value('year')),month=Number(value('month'));
  if(!period.error&&Number.isInteger(year)&&year>=0&&year<=2100&&value('year')!==undefined){const normalized=year<100?2000+year:year;if(normalized>=1900)period.period={...(period.period||context.period||{}),year:normalized};}
  if(!period.error&&Number.isInteger(month)&&month>=1&&month<=12&&value('month')!==undefined)period.period={year:period.period?.year||context.period?.year||currentYear(now),month};
  if(grouping==='month'){period.groupBy='month';if(!period.period)period.period={year:context.period?.year||currentYear(now)};}
  const groupBy=grouping==='none'?null:targetScope==='organizations'?'organization':grouping;
  const fields=entities.filter(e=>e.entity==='field').map(e=>canonicalField(e.value,Number.isInteger(e.start)&&Number.isInteger(e.end)?input.slice(e.start,e.end):undefined)).filter(Boolean);
  const limit=Number(value('limit'))===1?1:undefined;
  return {action,metrics:selected,period,targetScope,targetType,scope,organization:value('organization'),brand:value('brand'),product:value('product'),groupBy,limit,
    filters:['all','유형','무형'].includes(value('productType'))?{productType:value('productType')}:undefined,
    removeFields:action==='remove_condition'?fields:[],removeMetrics:action==='remove_condition'?selected:[],correction,positive,
    recognized:confident&&actionIntents.has(top.name),
    predicted:{modelVersion:parsed.modelVersion,intent:top,action,entities:parsed.entities||[],metrics:metricEntities.map(e=>e.value),targetType,scope,groupBy},
    unsupported:((action==='query')&&/왜|이유|원인/.test(positive))||/비교|대비|광고비|잔여|연별|요일별/.test(positive)||(!limit&&/순위|상위|하위|제일|가장/.test(positive)),
    unsupportedDate:/어제|오늘|이번\s*주|지난\s*주|최근|\d+\s*일/.test(positive)};
}
module.exports={interpretQuery};
