const { extractRows } = require('../power-bi-search');

// Each bucket reuses the scalar planner, preserving its own share denominator.
function buildMonthlyQuery(request, buildQuery) {
  const year = request.period?.year;
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw Error('Invalid monthly year');
  const months = request.period.month ? [request.period.month] : Array.from({length:12}, (_,i)=>i+1);
  const plans = months.map(month=>({month,plan:buildQuery({...request,groupBy:null,period:{year,month}})}));
  const selected=plans[0].plan.selected;
  if(selected.some(m=>m.raw))throw Error('Monthly raw values require an explicit aggregation');
  const tables=plans.map(({month,plan})=>`ADDCOLUMNS(${plan.dax.replace(/^EVALUATE\s+/, '')}, "bucketMonth", ${month})`);
  return {dax:`EVALUATE ${tables.length===1?tables[0]:`UNION(${tables.join(', ')})`}`,selected,year,months};
}

async function queryMonthly(bridge, request, buildQuery) {
  const plan=buildMonthlyQuery(request,buildQuery);
  const rows=extractRows(await bridge.query(plan.dax));
  const series=plan.months.map(month=>{
    const row=rows.find(r=>Number(r['[bucketMonth]'])===month);
    const empty=!row || !Number(row['[matchedRows]']);
    return {label:`${month}월`,empty,values:empty?[]:plan.selected.map((m,i)=>{
      const value=row[`[metric${i}]`];
      if(value!=null && (typeof value!=='number'||!Number.isFinite(value)))throw Error('Invalid BI value');
      return {id:m.id,label:m.label,value,formattedValue:value==null?'값 없음':new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(m.unit==='%'?value*100:value)+m.unit};
    })};
  });
  return {series,empty:series.every(b=>b.empty),basis:`${plan.year}년 월별 · ${request.target?.name||request.target?.value||request.product} · 유/무형 ${request.filters?.productType&&request.filters.productType!=='all'?request.filters.productType:'전체'}${plan.selected.some(m=>m.reportTemplate)?' · 각 월 전 조직 대비 비중':''}`};
}
module.exports={buildMonthlyQuery,queryMonthly};
