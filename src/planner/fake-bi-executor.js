const {validatePlan}=require('./query-validator');
function matches(row,filter){
  const value=row[filter.field];
  if(filter.operator==='in')return filter.value.includes(value);
  if(filter.operator==='prefix_any')return value!=null&&filter.value.some(v=>String(value).startsWith(v));
  if(filter.operator==='hour')return Number(String(value).slice(11,13))===filter.value;
  if(filter.operator==='eq')return value===filter.value;
  if(filter.operator==='ne')return value!==filter.value;
  if(filter.operator==='gte')return value!=null&&value>=filter.value;
  if(filter.operator==='lt')return value!=null&&value<filter.value;
  if(filter.operator==='contains')return value!=null&&String(value).includes(filter.value);
  if(filter.operator==='prefix')return value!=null&&String(value).startsWith(filter.value);
  throw Error('Unsupported filter');
}
function groupValue(row,group){
  const value=row[group.field];
  if(group.unit==='value'||value==null)return value;
  const text=String(value);
  return group.unit==='year'?text.slice(0,4):group.unit==='month'?text.slice(0,7):group.unit==='day'?text.slice(0,10):text.slice(0,13);
}
function createFakeExecutor({catalog,rows,entities=[]}){
  return {mode:'fake',async execute(plan){
    const validation=validatePlan(plan,catalog,entities);if(!validation.ok)throw Object.assign(Error(validation.errors.join('; ')),{code:'INVALID_PLAN'});
    plan=validation.plan;
    const periodRows=rows.filter(row=>plan.filters.every(filter=>matches(row,filter)));
    const target=plan.target;
    const selected=periodRows.filter(row=>!target||(target.kind==='brand'?String(row['BO[편성코드]']||'').startsWith(`[${target.value}]`):target.kind==='product'?row['BO[편성코드]']===target.value:row['BO[표준조직]']===target.value||row['BO[조직명]']===target.value));
    let result;
    function metricValue(id,items,groupValues=[]){
      const metric=catalog.metrics[id];
      if(metric.aggregation==='count_distinct'){
        const values=items.map(row=>row[metric.column]).filter(v=>v!=null);
        return values.length?new Set(values).size:null;
      }
      if(metric.aggregation==='sum'){
        const values=items.map(row=>row[metric.column]).filter(v=>v!=null);
        if(values.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('Synthetic fixture has a nonnumeric sum value');
        return values.length?values.reduce((a,b)=>a+b,0):null;
      }
      if(metric.aggregation==='share'){
        const spec=validation.sharePlans[id];
        const denominator=rows.filter(row=>spec.denominator.filters.every(f=>matches(row,f))&&spec.denominator.groupBy.every(g=>groupValue(row,g)===groupValues[plan.groupBy.findIndex(p=>p.field===g.field&&p.unit===g.unit)]));
        const total=metricValue(spec.denominator.metric,denominator);
        const numerator=metricValue(spec.numerator.metric,items.filter(row=>spec.numerator.filters.every(f=>matches(row,f))));
        return total&&numerator!=null?numerator/total:null;
      }
      throw Object.assign(Error(`Fake execution cannot evaluate opaque model measure: ${id}`),{code:'FAKE_MEASURE_UNAVAILABLE'});
    }
    if(plan.operation==='list')result=selected.map(row=>Object.fromEntries(plan.fields.map(field=>[field,row[field]??null])));
    else{
      const groups=new Map();
      for(const row of selected){const values=plan.groupBy.map(g=>groupValue(row,g)),key=JSON.stringify(values);if(!groups.has(key))groups.set(key,{values,items:[]});groups.get(key).items.push(row);}
      if(!plan.groupBy.length&&!groups.size)groups.set('[]',{values:[],items:[]});
      result=[...groups.values()].map(group=>{
        return {...Object.fromEntries(plan.groupBy.map((g,i)=>[g.field,group.values[i]])),...Object.fromEntries(plan.metrics.map(id=>[id,metricValue(id,group.items,group.values)]))};
      });
    }
    result.sort((a,b)=>{for(const sort of plan.sort){const x=a[sort.field],y=b[sort.field];const order=x==null?(y==null?0:-1):y==null?1:typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'ko');if(order)return sort.direction==='desc'?-order:order;}return 0;});
    return {mode:'fake',synthetic:true,rows:result.slice(0,plan.limit),limited:result.length>plan.limit,matchedRows:selected.length};
  }};
}
module.exports={createFakeExecutor};
