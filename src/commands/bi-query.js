const { metrics } = require('./bi-metrics');
const { extractRows } = require('../power-bi-search');
const {templateExpression,templates}=require('./bi-report-templates');
const literal = value => '"' + String(value).replace(/"/g,'""') + '"';
function periodBounds(period, now = new Date()) {
  if(period && Number.isInteger(period.year) && period.year>=1900 && period.year<=2100 && period.month===undefined)return {start:`DATE(${period.year},1,1)`,end:`DATE(${period.year+1},1,1)`,label:`${period.year}년`};
  const local = new Date(now.getTime() + 9 * 3600000);
  let y = local.getUTCFullYear(), m = local.getUTCMonth();
  if (period === 'previous_month') m--;
  else if (period && typeof period==='object' && Number.isInteger(period.year) && period.year>=1900 && period.year<=2100 && Number.isInteger(period.month) && period.month>=1 && period.month<=12) {y=period.year;m=period.month-1;}
  else if (period !== 'current_month') throw Error('지원하지 않는 기간입니다.');
  const start = new Date(Date.UTC(y,m,1)), end = new Date(Date.UTC(y,m+1,1));
  const date = d => `DATE(${d.getUTCFullYear()},${d.getUTCMonth()+1},${d.getUTCDate()})`;
  return { start: date(start), end: date(end), label: `${start.getUTCFullYear()}년 ${start.getUTCMonth()+1}월` };
}
function buildQuery(request, now) {
  const target=request.target || {kind:'product',field:'편성코드',value:request.product};
  const grouped=target.kind==='organization_group'&&target.field==='표준조직'&&request.groupBy==='organization';
  const allProducts=target.kind==='all_products'&&target.field==='편성코드';
  if (!(grouped||allProducts||(target.kind==='organization' && ['조직명','표준조직'].includes(target.field)) || (['product','brand'].includes(target.kind) && target.field==='편성코드')) || typeof target.value!=='string' || !target.value.trim() || target.value.length>300) throw Error('팀이나 상품을 다시 골라줘!');
  const ids = request.metrics || [request.metric];
  if (!Array.isArray(ids) || !ids.length || ids.length > 8 || new Set(ids).size !== ids.length) throw Error('한 번에 지표 1~8개를 조회할 수 있어!');
  const selected = ids.map(id => {
    const metric = metrics.find(m => m.id === id);
    if (!metric) throw Error('확인되지 않은 BI 지표입니다.');
    return metric;
  });
  const period = periodBounds(request.period, now);
  const filters=request.filters||{};
  if(typeof filters!=='object'||Array.isArray(filters)||Object.keys(filters).some(k=>k!=='productType')||![undefined,'all','유형','무형'].includes(filters.productType))throw Error('Unsupported report filters');
  const typeFilter=filters.productType&&filters.productType!=='all'?` && 'BO'[유/무형] = ${literal(filters.productType)}`:'';
  const dateCondition=`'BO'[방송일시] >= ${period.start} && 'BO'[방송일시] < ${period.end}${typeFilter}`;
  const periodFilter=`FILTER(ALL('BO'), ${dateCondition})`;
  const brandPrefix=`[${target.value}]`;
  const targetCondition=target.kind==='brand'?`LEFT('BO'[편성코드], ${brandPrefix.length}) = ${literal(brandPrefix)}`:`'BO'[${target.field}] = ${literal(target.value)}`;
  const filter = grouped||allProducts?periodFilter:`FILTER(ALL('BO'), ${targetCondition} && ${dateCondition})`;
  if(selected.some(m=>m.reportTemplate)&&!['organization','organization_group'].includes(target.kind))throw Error('편성비중은 조회할 팀을 선택해주세요.');
  if(grouped&&selected.some(m=>m.raw))throw Error('조직별 원본 열 집계 기준이 필요해.');
  const outputs = ['"matchedRows", COUNTROWS(\'BO\')',...selected.flatMap((m,i)=>m.raw?[]:[`"metric${i}", ${m.reportTemplate?templateExpression(m.reportTemplate,periodFilter):m.expression}`])];
  const raw = selected.map((m,i)=>({m,i})).filter(({m})=>m.raw);
  const detailDax = raw.length ? `EVALUATE SELECTCOLUMNS(TOPN(6, ${filter}, 'BO'[방송일시], DESC), "broadcast", 'BO'[방송일시], ${raw.map(({m,i})=>`"metric${i}", 'BO'[${m.column.replace(/\]/g,']]')}]`).join(', ')})` : null;
  return { dax: `EVALUATE SUMMARIZECOLUMNS(${grouped?"'BO'[표준조직], ":''}${filter}, ${outputs.join(', ')})`, selected, period, detailDax, target,productType:filters.productType||'all' };
}
function createMetricQuery(bridge) {
  return async request => {
    if(request.groupBy==='month')return require('./bi-monthly-query').queryMonthly(bridge,request,buildQuery);
    if(request.groupBy&&request.groupBy!=='organization')throw Error('Unsupported grouping');
    const plan = buildQuery(request);
    const rows = extractRows(await bridge.query(plan.dax));
    if(request.groupBy==='organization'){
      if(request.limit!==undefined&&request.limit!==1)throw Error('Unsupported ranking limit');
      const groups=rows.filter(r=>Number(r['[matchedRows]'])>0&&r['BO[표준조직]']);
      if(request.limit)groups.sort((a,b)=>(b['[metric0]']??-Infinity)-(a['[metric0]']??-Infinity));
      return {empty:!groups.length,basis:`${plan.period.label} · 조직별 · 같은 기간 전체 조직 대비 · 유/무형 ${plan.productType==='all'?'전체':plan.productType}`,series:groups.slice(0,request.limit||groups.length).map(r=>({label:r['BO[표준조직]'],values:plan.selected.map((m,i)=>{
        const value=r[`[metric${i}]`];if(value!=null&&(typeof value!=='number'||!Number.isFinite(value)))throw Error('Invalid BI value');
        return {id:m.id,label:m.label,value,formattedValue:value==null?'값 없음':new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(m.unit==='%'?value*100:value)+m.unit};
      })}))};
    }
    const row = rows[0];
    if (!row || !Number(row['[matchedRows]'])) return { empty: true, basis: plan.period.label };
    const detailRows = plan.detailDax ? extractRows(await bridge.query(plan.detailDax)).sort((a,b)=>String(b['[broadcast]']||'').localeCompare(String(a['[broadcast]']||''))) : [];
    const shares=plan.selected.filter(m=>m.reportTemplate);
    const scope=shares.length?` · 전 조직 대비 · ${shares.map(m=>templates.find(t=>t.id===m.reportTemplate).basis).join(' / ')} 기준`:'';
    return { basis: `${plan.period.label}${plan.target.kind==='organization'?' · '+plan.target.field+' '+plan.target.value:''}${scope} · 유/무형 ${plan.productType==='all'?'전체':plan.productType} · 합산 지표는 전체 실적 집계 / 원본 열은 방송별 최근 5행`, values: plan.selected.map((m,i)=> {
      if (m.raw) {
        const items = detailRows.slice(0,5).map(r=>`${r['[broadcast]'] || '방송일시 없음'}: ${r[`[metric${i}]`] == null ? '값 없음' : String(r[`[metric${i}]`])}`);
        return {id:m.id,label:m.label,formattedValue:'\n'+items.join('\n')+(detailRows.length>5?'\n최근 5행만 표시했어.':''),raw:true};
      }
      const value = row[`[metric${i}]`];
      if (value != null && (typeof value !== 'number' || !Number.isFinite(value))) throw Error('BI 지표 값의 형식을 확인하지 못했어.');
      const formattedValue = value == null ? '값 없음' : new Intl.NumberFormat('ko-KR', { maximumFractionDigits:2 }).format(m.unit === '%' ? value * 100 : value) + m.unit;
      return { id:m.id, label:m.label, value, formattedValue,sourceQueries:m.sourceQueries||[] };
    }) };
  };
}
module.exports = { buildQuery, periodBounds, createMetricQuery };
