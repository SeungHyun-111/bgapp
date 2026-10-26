const definitions=[
  {name:'searchValues',description:'Read actual distinct BI values of a known column, only when needed to disambiguate a dimension.',input:{field:'catalog column ID',query:'string',limit:'integer <= 20'}},
  {name:'getBusinessDefinitions',description:'Read confirmed business definitions and default share basis.',input:{}},
  {name:'searchCatalog',description:'Local Qwen semantic search over metric/column descriptions, definitions, examples and verification status. Returns evidence candidates only.',input:{query:'semantic request, not necessarily a column label',kind:'metric | column',limit:'integer <= 20'}},
  {name:'listFields',description:'Find available columns and provenance; no live BI call.',input:{query:'string',limit:'integer <= 20'}},
  {name:'getMetricDefinition',description:'Inspect a registered metric, calculation evidence and unresolved business meaning.',input:{id:'metric ID'}},
  {name:'searchTarget',description:'Search supplied local entity metadata, including derived bracket brands. Does not fetch BI.',input:{query:'string',kind:'brand | organization | product'}},
  {name:'getCapabilities',description:'Inspect supported plan operators, grouping and limits.',input:{}},
  {name:'searchMetrics',description:'Find registered metric IDs and labels in local catalog metadata.',input:{query:'string',limit:'integer <= 20'}},
  {name:'searchColumns',description:'Search verified column IDs, names and type evidence. Alias of listFields.',input:{query:'string',limit:'integer <= 20'}},
  {name:'searchTargets',description:'Search local brand/organization/product metadata. Never requests BI.',input:{query:'string',kind:'brand | organization | product'}},
  {name:'getAvailableAggregations',description:'Get allowed aggregation and fake execution support for one metric.',input:{id:'metric ID'}},
];
const operators={filter:{planKey:'filters',description:'Combine typed column predicates with AND'},aggregate:{planKey:'metrics',description:'Evaluate registered sum/share metrics; opaque model measures are unavailable in fake mode'},groupBy:{planKey:'groupBy',description:'Group by column or datetime year/month/day/hour'},sort:{planKey:'sort',description:'Order projected outputs'},listRows:{planKey:'fields',description:'Project selected fields with row limit'}};
function createTools(catalog,entities=[],{semanticCatalog,executionMode="fake",valueSearch}={}){
  return {definitions,bootstrap(){return {
      columns:catalog.tables.flatMap(t=>t.columns).filter(c=>['방송일시','표준조직','편성코드','유/무형'].includes(c.name)).map(({id,name,type})=>({id,name,type})),
      commonMetrics:Object.values(catalog.metrics).filter(m=>['sum','share','count_distinct'].includes(m.aggregation)).map(({id,label,aggregation,unit})=>({id,label,aggregation,unit})),
      businessDefinitions:catalog.businessDefinitions||[],
      shareDefault:'weighted minutes; denominator same period across all organizations and brands, including all product types. Explicit share numerator/denominator may refine this.',
      execution:executionMode==='live'?'Actual Power BI read-only queries; registered model measures supported':'synthetic fixtures only; opaque model measures unavailable'
    };},async call(name,args={},options={}){
    if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Tool arguments must be an object');
    if(name==='searchValues'){if(!valueSearch)throw Error('Actual BI value exploration is unavailable in this executor');return valueSearch(args);}
    if(name==='getBusinessDefinitions')return {definitions:catalog.businessDefinitions||[],shareDefault:'weighted minutes; denominator same period across all organizations and brands, including all product types'};
    if(name==='searchCatalog'){
      if(!semanticCatalog)throw Error('Semantic search is unavailable; lexical tools remain discovery only');
      return semanticCatalog.search({...args,signal:options.signal});
    }
    if(name==='searchColumns')name='listFields';
    if(name==='searchTargets')name='searchTarget';
    if(name==='getAvailableAggregations'){const m=catalog.metrics[args.id];if(!m)throw Error('Unknown metric');return {id:m.id,aggregation:m.aggregation,allowed:m.aggregation==='raw'?[]:[m.aggregation],availableInFake:['sum','share','count_distinct'].includes(m.aggregation),unit:m.unit,definition:m.definition};}
    if(name==='listFields')return catalog.tables.flatMap(t=>t.columns).filter(c=>!args.query||c.name.toLowerCase().includes(String(args.query).toLowerCase())).slice(0,Math.max(1,Math.min(20,Number(args.limit)||5)));
    if(name==='getMetricDefinition'){const metric=catalog.metrics[args.id];if(!metric)throw Error('Unknown metric');return metric;}
    if(name==='searchMetrics')return Object.values(catalog.metrics).filter(m=>!args.query||[m.id,m.label,...(m.aliases||[]),m.businessMeaning||'',JSON.stringify(m.definition||''),JSON.stringify(m.examples||[]),JSON.stringify(m.questionExamples||[])].some(v=>v.toLowerCase().includes(String(args.query).toLowerCase()))).slice(0,Math.max(1,Math.min(20,Number(args.limit)||5))).map(m=>({id:m.id,label:m.label,aggregation:m.aggregation,description:m.businessMeaning,definition:m.definition,verificationStatus:m.status}));
    if(name==='searchTarget'){
      if(!['brand','product','organization'].includes(args.kind)||typeof args.query!=='string'||!args.query.trim())throw Error('Target kind/query required');
      const options=args.kind==='brand'?[...new Set(entities.filter(e=>e.kind==='product').map(e=>e.value.match(/^\[([^\]]+)\]/)?.[1]).filter(Boolean))].map(value=>({kind:'brand',value})):entities.filter(e=>e.kind===args.kind);
      // Symmetric text overlap retrieves candidates only; it never rewrites a target.
      const query=args.query.toLocaleLowerCase().trim();
      return options.map(e=>({entity:e,score:Math.max(...[e.value,e.name,...(e.aliases||[])].filter(Boolean).map(v=>{v=v.toLocaleLowerCase();return v===query?3:v.includes(query)||query.includes(v)?2:0;}))})).filter(e=>e.score>0).sort((a,b)=>b.score-a.score).slice(0,5).map(e=>e.entity);
    }
    if(name==='getCapabilities')return {operations:['list','aggregate'],filters:['eq','ne','gte','lt','contains','prefix','hour'],groupUnits:['value','year','month','day','hour'],maxRows:100,dateInterpretation:'Korea business wall clock; half-open date ranges',liveExecution:executionMode==='live',metricDiscovery:'Use searchMetrics, then getMetricDefinition/getAvailableAggregations for specific IDs',limitations:catalog.limitations};
    throw Error('Unknown tool');
  }};
}
module.exports={definitions,operators,createTools};
