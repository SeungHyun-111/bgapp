const definitions=[
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
function createTools(catalog,entities=[]){
  return {definitions,async call(name,args={}){
    if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Tool arguments must be an object');
    if(name==='searchColumns')name='listFields';
    if(name==='searchTargets')name='searchTarget';
    if(name==='getAvailableAggregations'){const m=catalog.metrics[args.id];if(!m)throw Error('Unknown metric');return {id:m.id,aggregation:m.aggregation,allowed:m.aggregation==='raw'?[]:[m.aggregation],availableInFake:['sum','share'].includes(m.aggregation),unit:m.unit,definition:m.definition};}
    if(name==='listFields')return catalog.tables.flatMap(t=>t.columns).filter(c=>!args.query||c.name.toLowerCase().includes(String(args.query).toLowerCase())).slice(0,Math.max(1,Math.min(20,Number(args.limit)||20)));
    if(name==='getMetricDefinition'){const metric=catalog.metrics[args.id];if(!metric)throw Error('Unknown metric');return metric;}
    if(name==='searchMetrics')return Object.values(catalog.metrics).filter(m=>!args.query||[m.id,m.label,...m.aliases].some(v=>v.toLowerCase().includes(String(args.query).toLowerCase()))).slice(0,Math.max(1,Math.min(20,Number(args.limit)||20))).map(m=>({id:m.id,label:m.label,aggregation:m.aggregation}));
    if(name==='searchTarget'){
      if(!['brand','product','organization'].includes(args.kind)||typeof args.query!=='string'||!args.query.trim())throw Error('Target kind/query required');
      const options=args.kind==='brand'?[...new Set(entities.filter(e=>e.kind==='product').map(e=>e.value.match(/^\[([^\]]+)\]/)?.[1]).filter(Boolean))].map(value=>({kind:'brand',value})):entities.filter(e=>e.kind===args.kind);
      return options.filter(e=>[e.value,e.name,...(e.aliases||[])].filter(Boolean).some(v=>v.includes(args.query))).slice(0,20);
    }
    if(name==='getCapabilities')return {operations:['list','aggregate'],filters:['eq','ne','gte','lt','contains','prefix','hour'],groupUnits:['value','year','month','day','hour'],maxRows:100,dateInterpretation:'Korea business wall clock; half-open date ranges',liveExecution:false,metricDiscovery:'Use searchMetrics, then getMetricDefinition/getAvailableAggregations for specific IDs',limitations:catalog.limitations};
    throw Error('Unknown tool');
  }};
}
module.exports={definitions,operators,createTools};
