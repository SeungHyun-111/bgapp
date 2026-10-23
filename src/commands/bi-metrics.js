// Only verified BO columns and model measures are executable. No user-supplied DAX.
const model = require('../power-bi-model.json');
const referenceCatalog=require('../bi-reference/catalog.json');
const referenceAliases=require('../bi-reference/metric-aliases.json');
const {templates}=require('./bi-report-templates');
const knownColumns = new Set(model.tables.flatMap(t => t.columns.map(c => c.reference)));
const allMeasures=[...new Map([...model.measures,...referenceCatalog.measures].map(m=>[m.reference,m])).values()];
const knownMeasures = new Set(allMeasures.map(m => m.reference));
const metrics = [
  ['sales', '예상취급액', '(전체)예상취급액', ['취급액', '예상취급액'], '원'],
  ['orders', '총주문량', '(전체)총주문량', ['주문량', '총주문량', '주문수량'], '개'],
  ['revenue', '예상매출액(V-)', '(전체)예상매출액(V-)', ['매출액', '예상매출액'], '원'],
  ['gross_profit', '예상매출총이익액(V-)', '(전체)예상매출총이익액(V-)', ['매출총이익', '매총'], '원'],
  ['profit', '한계이익', '(전체)한계이익', ['한계이익', '한익'], '원'],
  ['weighted_minutes', '가중분', '가중분', ['가중분', '가중시간'], '분'],
  ['exposure_minutes', '노출분', '노출분', ['노출분', '노출시간'], '분'],
  ['target_sales', '목표취급액', '(전체)목표취급액', ['목표취급액', '취급목표'], '원'],
  ['target_profit', '한계이익목표', '(전체)한계이익목표', ['한계이익목표', '한익목표'], '원'],
  ['fixed_fee', '정액수수료', '정액수수료(원)', ['정액수수료'], '원'],
  ['pg_fee', 'PG수수료', '(전체)PG수수료', ['PG수수료', '피지수수료'], '원'],
  ['affiliate_fee', '제휴수수료', '(전체)제휴수수료', ['제휴수수료'], '원'],
].map(([id,label,column,aliases,unit]) => {
  if (!knownColumns.has(`BO[${column}]`)) throw Error('Unverified column: ' + column);
  return { id, label, aliases, unit, column, expression: `SUM('BO'[${column}])` };
});
for (const [id,label,reference,aliases,unit] of [
  ['mix_per_minute','분당혼합비(BI 원본값)',"'BO'[분당혼합비]",['분당혼합비','혼합비'],''],
  ['profit_per_minute','한계(분)(BI 원본값)',"'BO'[(전체)한계(분)]",['분당한계이익','분당한익','한계(분)'],''],
  ['sales_achievement','취급달성률',"'BO'[(전체)취급달성률(%)]",['취급달성률'],'%'],
  ['profit_achievement','한계달성률',"'BO'[(전체)한계달성률(%)]",['한계달성률','한익달성률'],'%'],
]) {
  if (!knownMeasures.has(reference)) throw Error('Unverified measure: ' + reference);
  metrics.push({ id,label,aliases,unit,expression: reference });
}
// Every observed column is queryable; undefined aggregations remain raw by broadcast.
for (const column of model.tables.find(t=>t.name==='BO').columns) {
  const mapped = metrics.find(m=>m.column===column.name);
  if (mapped) { if (!mapped.aliases.includes(column.name)) mapped.aliases.unshift(column.name); continue; }
  const margin = column.name === '(전체/방송중)제휴포인트';
  metrics.push({id:margin?'commission_rate':'column:'+column.name,label:margin?'마진 / 상품 수수료율(BI 원본값)':column.name,
    aliases:margin?[column.name,'상품수수료율','수수료율','수수료','마진']:[column.name],column:column.name,raw:true,unit:''});
}
for (const measure of allMeasures) if (!metrics.some(m=>m.expression===measure.reference)) {
  const name=measure.reference.slice(measure.reference.indexOf('[')+1,-1);
  metrics.push({id:'measure:'+name,label:name,aliases:[name,...(referenceAliases[name]||[])],expression:measure.reference,unit:name.includes('(%)')?'%':'',sourceQueries:referenceCatalog.measures.find(m=>m.reference===measure.reference)?.sourceQueries||[]});
}
for(const template of templates)metrics.push({id:template.id,label:template.label,aliases:template.aliases,reportTemplate:template.id,unit:'%',sourceQueries:template.sources});
const normalize = text => String(text).normalize('NFKC').replace(/\s/g,'').toLowerCase();
function detectMetrics(input) {
  const value = normalize(input), found = [];
  const aliases = metrics.flatMap(m => m.aliases.map(alias => ({ metric:m, alias:normalize(alias) }))).sort((a,b)=>b.alias.length-a.alias.length);
  let rest = value;
  // Exact BI names take priority over generic aliases.
  for (const metric of metrics.filter(m=>m.column).sort((a,b)=>b.column.length-a.column.length)) {
    const name=normalize(metric.column);
    if (name.length>=2 && rest.includes(name)) { found.push(metric.id); rest=rest.split(name).join(''); }
  }
  for (const {metric,alias} of aliases) if ((alias.length>=2 || rest===alias || (alias==='분' && /(^|\s)분(?=\s|[?？!]|은|을|이|$)/.test(input))) && rest.includes(alias)) {
    if (!found.includes(metric.id)) found.push(metric.id);
    rest = rest.split(alias).join('');
  }
  return found;
}
module.exports = { metrics, detectMetrics };
