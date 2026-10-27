// Routing evidence comes from catalog metadata, never utterance keyword rules.
function capabilitySummary(catalog){
  const metrics=Object.values(catalog.metrics||{}).filter(m=>m.aggregation!=='raw');
  const priority={share:0,sum:1,count_distinct:2,'model-measure':3};
  metrics.sort((a,b)=>(priority[a.aggregation]??4)-(priority[b.aggregation]??4));
  let remaining=1800;
  const names=[];
  for(const metric of metrics){
    const name=[...new Set([metric.label,...(metric.aliases||[]).slice(0,2)])].filter(Boolean).join(' / ');
    if(name.length+4>remaining)continue;
    names.push(name);remaining-=name.length+4;
  }
  return {
    dimensions:Object.entries(catalog.dimensions||{}).map(([kind,d])=>({kind,source:d.source,meaning:d.definition})),
    periods:(catalog.tables||[]).flatMap(t=>t.columns).filter(c=>c.type==='datetime').map(c=>c.name),
    metrics:names,otherMetricsAvailable:names.length<metrics.length,
    operations:['조회','집계','비교','순위','기간·대상·조건 변경'],
  };
}
module.exports={capabilitySummary};
