function presentResult(out,catalog){
  const keys=out.plan.operation==='list'?out.plan.fields:[...out.plan.groupBy.map(g=>g.field),...out.plan.metrics];
  const label=key=>catalog.metrics[key]?.label||key.replace(/^BO\[|\]$/g,'');
  const display=(key,v)=>v==null?'데이터 없음':typeof v==='number'?(catalog.metrics[key]?.unit==='%'?(v*100).toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':v.toLocaleString('ko-KR',{maximumFractionDigits:2})):String(v);
  const columns=keys.map(key=>({key,label:label(key),unit:catalog.metrics[key]?.unit||''}));
  const basis=[];
  if(out.plan.target)basis.push(out.plan.target.value);
  const dates=out.plan.filters.filter(f=>f.field==='BO[방송일시]');
  const start=dates.find(f=>f.operator==='gte'),end=dates.find(f=>f.operator==='lt');
  if(start&&end){const exclusive=new Date(end.value.length===10?end.value+'T00:00:00Z':end.value+'Z');const last=new Date(exclusive.getTime()-(end.value.length===10?86400000:1000));basis.push(`${start.value.replace('T',' ')} ~ ${last.toISOString().slice(0,end.value.length===10?10:19).replace('T',' ')}`);}
  for(const f of out.plan.filters.filter(f=>f.field!=='BO[방송일시]'))basis.push(`${label(f.field)} ${Array.isArray(f.value)?f.value.join(' / '):f.value}`);
  return {mode:out.result.mode,synthetic:out.result.synthetic,columns,
    rows:out.result.rows.map(row=>Object.fromEntries(keys.map(key=>[key,display(key,row[key])]))),
    rawRows:out.result.rows,basis:basis.join(' · '),limited:out.result.limited};
}
module.exports={presentResult};
