const {schemaErrors}=require('./query-validator');
const {rankDocuments}=require('./catalog-index');
const object=(properties={},required=[])=>({type:'object',additionalProperties:false,required,properties});
const query={type:'string',minLength:1,maxLength:300};
const limit={type:'integer',minimum:1,maximum:20};
const id={type:'string',minLength:1,maxLength:300};
const targetInput=object({query,kind:{type:'string',enum:['brand','organization','product']}},['query']);
const searchInput=object({query,limit},['query']);
const definitions=[
  {name:'searchMetrics',description:'Find metric IDs by business name in local metadata.',input:searchInput},
  {name:'searchTargets',description:'Find local target candidates across organizations, brands and products. kind is optional. Similar names are retrieval hints; Qwen chooses their meaning.',input:targetInput},
  {name:'searchColumns',description:'Find column IDs by name in local metadata.',input:searchInput},
  {name:'getMetricDefinition',description:'Read one metric calculation and evidence by its registered ID.',input:object({id},['id'])},
  {name:'searchCatalog',description:'Shortlist local metadata then ask Qwen to compare meanings.',input:object({query:{type:'string',minLength:1,maxLength:500},kind:{type:'string',enum:['metric','column']},limit,offset:{type:'integer',minimum:0}},['query'])},
  {name:'getBusinessDefinitions',description:'Read confirmed business definitions and share calculations.',input:object()},
  {name:'getCapabilities',description:'Read supported operations and limits.',input:object()},
  {name:'searchValues',description:'Read distinct dimension VALUES from live BI using a known column ID. Does not discover or aggregate metrics. Prefer local searchTargets first.',input:object({field:id,query:{type:'string',maxLength:300},limit},['field'])},
  {name:'listFields',description:'Alias of searchColumns.',input:searchInput},
  {name:'searchTarget',description:'Alias of searchTargets.',input:targetInput},
  {name:'getAvailableAggregations',description:'Read supported aggregation for a registered metric ID.',input:object({id},['id'])},
];
const operators={filter:{planKey:'filters',description:'Combine typed column predicates with AND'},aggregate:{planKey:'metrics',description:'Evaluate registered sum/share metrics; opaque model measures are unavailable in fake mode'},groupBy:{planKey:'groupBy',description:'Group by column or datetime year/month/day/hour'},sort:{planKey:'sort',description:'Order projected outputs'},listRows:{planKey:'fields',description:'Project selected fields with row limit'}};
function createTools(catalog,entities=[],{semanticCatalog,executionMode="fake",valueSearch}={}){
  const shareDefaults=Object.values(catalog.metrics).filter(m=>m.aggregation==='share').map(({id,label,calculation})=>({id,label,calculation}));
  const columns=catalog.tables.flatMap(t=>t.columns),columnIds=columns.map(c=>c.id),metricIds=Object.keys(catalog.metrics);
  const commonMetrics=Object.values(catalog.metrics).filter(m=>['sum','share','count_distinct'].includes(m.aggregation));
  const initialFields=new Set([...Object.values(catalog.dimensions||{}).flatMap(d=>[d.source,d.fallback]),...commonMetrics.map(m=>m.column)]);
  let targetDocuments;
  function searchTargets(args){
    if(!targetDocuments){
      const brands=[...new Set(entities.filter(e=>e.kind==='product').map(e=>e.value.match(/^\[([^\]]+)\]/)?.[1]).filter(Boolean))].map(value=>({kind:'brand',value}));
      targetDocuments=[...entities,...brands].map(e=>({label:e.name||e.value,aliases:e.aliases||[],entity:e}));
    }
    // Lexical retrieval only supplies bounded hints, including spelling variants.
    // A scoped miss does not select another kind or rewrite the user's target.
    const ranked=rankDocuments(targetDocuments,args.query).filter(r=>r.score>0);
    const kinds=[...new Set(targetDocuments.map(d=>d.entity.kind))];
    const compact=entity=>{
      const aliases=rankDocuments((entity.aliases||[]).map(label=>({label})),args.query).slice(0,2).map(r=>r.document.label);
      return {kind:entity.kind,field:entity.field,value:entity.value,...(entity.name&&entity.name!==entity.value?{name:entity.name}:{}),
        aliases:aliases.filter(a=>a.length<=120),
        ...(aliases.some(a=>a.length>120)?{aliasPreviews:aliases.filter(a=>a.length>120).map(a=>({text:a.slice(0,120),truncated:true}))}:{}),
        ...((entity.aliases?.length||0)>aliases.length?{additionalAliasCount:entity.aliases.length-aliases.length}:{}),
      };
    };
    const shortlist=(kind,count)=>ranked.filter(r=>r.document.entity.kind===kind).slice(0,count).map(r=>compact(r.document.entity));
    const candidates=args.kind?shortlist(args.kind,5):kinds.flatMap(kind=>shortlist(kind,3));
    const otherKindCandidates=args.kind?kinds.filter(kind=>kind!==args.kind).flatMap(kind=>shortlist(kind,3)):[];
    return {query:args.query,scope:{kind:args.kind||null},candidates,otherKindCandidates,automaticSelection:false,
      instruction:'후보는 표기 유사도로 모은 참고 자료이며 정답이 아니다. 사용자 의미와 후보의 종류·별칭을 비교해 판단한다. 현재 검색 범위에서 비어 있어도 다른 종류나 표기에 존재하지 않는다는 뜻은 아니다.'};
  }
  const availableDefinitions=definitions.filter(d=>d.name!=='searchValues'||valueSearch).map(definition=>{
    const bound={...definition,inputSchema:structuredClone(definition.input)};
    if(bound.name==='searchValues')bound.inputSchema.properties.field.enum=columnIds;
    if(['getMetricDefinition','getAvailableAggregations'].includes(bound.name))bound.inputSchema.properties.id.enum=metricIds;
    return bound;
  });
  return {definitions:availableDefinitions,bootstrap(){return {
      columns:columns.filter(c=>c.type==='datetime'||initialFields.has(c.id)).map(({id,name,type})=>({id,name,type})),
      commonMetrics:commonMetrics.map(({id,label,aggregation,column,unit})=>({id,label,aggregation,column,unit})),
      shareDefaults:shareDefaults.map(({id,calculation})=>({id,basisMetric:calculation?.basisMetric,scope:calculation?.description})),
      furtherEvidence:'Use getMetricDefinition and getBusinessDefinitions for full definitions and provenance.',
      execution:executionMode==='live'?'Actual Power BI read-only queries; registered model measures supported':'synthetic fixtures only; opaque model measures unavailable'
    };},async call(name,args={},options={}){
    const definition=availableDefinitions.find(d=>d.name===name);
    if(!definition)throw Object.assign(Error('Unknown or unavailable tool'),{code:'INVALID_TOOL_ARGUMENTS'});
    const errors=schemaErrors(args,definition.inputSchema);
    if(errors.length)throw Object.assign(Error(errors.join('; ')),{code:'INVALID_TOOL_ARGUMENTS'});
    if(name==='searchValues'){if(!valueSearch)throw Error('Actual BI value exploration is unavailable in this executor');return valueSearch(args);}
    if(name==='getBusinessDefinitions')return {definitions:catalog.businessDefinitions||[],shareDefaults};
    if(name==='searchCatalog'){
      if(!semanticCatalog)throw Error('Semantic search is unavailable; lexical tools remain discovery only');
      return semanticCatalog.search({...args,signal:options.signal});
    }
    if(name==='searchColumns')name='listFields';
    if(name==='searchTargets')name='searchTarget';
    if(name==='getAvailableAggregations'){const m=catalog.metrics[args.id];if(!m)throw Error('Unknown metric');return {id:m.id,aggregation:m.aggregation,allowed:m.aggregation==='raw'?[]:[m.aggregation],availableInFake:['sum','share','count_distinct'].includes(m.aggregation),unit:m.unit,definition:m.definition,calculation:m.calculation};}
    if(name==='listFields')return catalog.tables.flatMap(t=>t.columns).filter(c=>!args.query||c.name.toLowerCase().includes(String(args.query).toLowerCase())).slice(0,Math.max(1,Math.min(20,Number(args.limit)||5)));
    if(name==='getMetricDefinition'){const metric=catalog.metrics[args.id];if(!metric)throw Error('Unknown metric');return metric;}
    if(name==='searchMetrics')return Object.values(catalog.metrics).filter(m=>!args.query||[m.id,m.label,...(m.aliases||[]),m.businessMeaning||'',JSON.stringify(m.definition||''),JSON.stringify(m.calculation||''),JSON.stringify(m.examples||[]),JSON.stringify(m.questionExamples||[])].some(v=>v.toLowerCase().includes(String(args.query).toLowerCase()))).slice(0,Math.max(1,Math.min(20,Number(args.limit)||5))).map(m=>({id:m.id,label:m.label,aggregation:m.aggregation,description:m.businessMeaning,definition:m.definition,calculation:m.calculation,verificationStatus:m.status}));
    if(name==='searchTarget')return searchTargets(args);
    if(name==='getCapabilities')return {operations:['list','aggregate'],dimensions:catalog.dimensions,metrics:commonMetrics.map(({id,label,aggregation,unit})=>({id,label,aggregation,unit})),filters:['eq','ne','gte','lt','contains','prefix','hour','in','prefix_any'],groupUnits:['value','year','month','day','hour'],maxRows:100,dateInterpretation:'Korea business wall clock; half-open date ranges',liveExecution:executionMode==='live',metricDiscovery:'Use searchMetrics, then getMetricDefinition/getAvailableAggregations for specific IDs',limitations:catalog.limitations};
    throw Error('Unknown tool');
  }};
}
module.exports={definitions,operators,createTools};
