// Assemble arithmetic from repository-owned catalog metadata, not user text.
// Defaults are derived afresh for each metric/turn, so changing period or adding
// another share metric cannot inherit an old generated denominator or basis.
function buildSharePlans(plan,catalog){
  const fields=new Map(catalog.tables.flatMap(t=>t.columns).map(c=>[c.id,c]));
  const shares={};
  const shareMetrics=plan.metrics.filter(id=>catalog.metrics[id]?.aggregation==='share');
  if(plan.share&&new Set(shareMetrics.map(id=>catalog.metrics[id].calculation?.basisMetric)).size>1){
    throw Error('A shared explicit ratio cannot override metrics with different bases; use their catalog defaults or separate the requests');
  }
  for(const id of plan.metrics){
    const metric=catalog.metrics[id];if(metric?.aggregation!=='share')continue;
    if(plan.share){shares[id]=structuredClone(plan.share);continue;}
    const definition=metric.calculation;
    if(definition?.type!=='share'||definition.numeratorScope!=='query'||!Array.isArray(definition.denominatorFilterTypes)||!Array.isArray(definition.denominatorGroupTypes)){
      throw Error('Missing structured share calculation: '+id);
    }
    shares[id]={
      numerator:{metric:definition.basisMetric,filters:structuredClone(plan.filters)},
      denominator:{metric:definition.basisMetric,
        filters:structuredClone(plan.filters.filter(f=>definition.denominatorFilterTypes.includes(fields.get(f.field)?.type))),
        groupBy:structuredClone(plan.groupBy.filter(g=>definition.denominatorGroupTypes.includes(fields.get(g.field)?.type)))},
    };
  }
  return shares;
}
module.exports={buildSharePlans};
