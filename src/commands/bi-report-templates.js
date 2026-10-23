const catalog=require('../bi-reference/catalog.json');
const weighted=catalog.queries.find(q=>q.outputs.some(o=>/DIVIDE\(SUM\('BO'\[가중분\]\)/.test(o.expression.replace(/\s+/g,''))&&o.contextSensitive));
const count=catalog.queries.find(q=>q.outputs.some(o=>/DIVIDE\(DISTINCTCOUNT\('BO'\[방송일시\]\)/.test(o.expression.replace(/\s+/g,''))&&o.contextSensitive));
const pie=catalog.queries.find(q=>q.visualType==='pieChart'&&q.allReferences.includes("'BO'[가중분]")&&q.allReferences.includes("'BO'[조직명]"));
if(!weighted||!count||!pie)throw Error('Required report evidence missing');
const templates=[
  {id:'organization_weighted_share',label:'가중분 기준 편성비중',aliases:['가중분편성비중','가중분비중','가중편성비중'],basis:'가중분',aggregate:"SUM('BO'[가중분])",sources:[weighted.id,pie.id]},
  {id:'organization_broadcast_share',label:'방송횟수 기준 편성비중',aliases:['방송횟수편성비중','방송횟수비중','방송건수비중','횟수기준편성비중'],basis:'방송일시 고유 개수(동일 시각은 1회)',aggregate:"DISTINCTCOUNT('BO'[방송일시])",sources:[count.id]}
];
function templateExpression(id,periodFilter) {
  const template=templates.find(t=>t.id===id);if(!template)throw Error('Unknown report template');
  // Numerator is scoped to the requested team. Denominator keeps the requested
  // month/type, removes team/product filters, and includes all organizations.
  return `DIVIDE(${template.aggregate}, CALCULATE(${template.aggregate}, ${periodFilter}))`;
}
module.exports={templates,templateExpression};
