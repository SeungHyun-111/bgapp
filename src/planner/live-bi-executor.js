const {validatePlan,fieldMap}=require('./query-validator');
const {extractRows}=require('../power-bi-search');
const {metrics:registeredMetrics}=require('../commands/bi-metrics');
const literal=value=>typeof value==='number'?String(value):'"'+String(value).replace(/"/g,'""')+'"';

// Compile only validated structure and repository-owned metric expressions.
// Natural language and model-supplied executable DAX never enter this compiler.
function compilePlan(input,catalog,entities=[]){
  const checked=validatePlan(input,catalog,entities);
  if(!checked.ok)throw Object.assign(Error(checked.errors.join('; ')),{code:'INVALID_PLAN'});
  const plan=checked.plan,fields=fieldMap(catalog);
  const column=id=>{
    if(!fields.has(id)||!id.startsWith('BO[')||!id.endsWith(']'))throw Error('Unsupported BI column');
    return "'BO'["+id.slice(3,-1).replace(/\]/g,']]')+']';
  };
  function predicate(f){
    const col=column(f.field);
    if(f.operator==='in')return `${col} IN {${f.value.map(literal).join(', ')}}`;
    if(f.operator==='prefix_any')return '('+f.value.map(v=>`LEFT(${col}, ${v.length}) = ${literal(v)}`).join(' || ')+')';
    let value=literal(f.value);
    if(fields.get(f.field).type==='datetime'&&f.operator!=='hour'){
      const d=new Date(String(f.value).length===10?f.value+'T00:00:00Z':f.value+'Z');
      value=`(DATE(${d.getUTCFullYear()},${d.getUTCMonth()+1},${d.getUTCDate()}) + TIME(${d.getUTCHours()},${d.getUTCMinutes()},${d.getUTCSeconds()}))`;
    }
    if(f.operator==='hour')return `HOUR(${col}) = ${value}`;
    if(f.operator==='contains')return `CONTAINSSTRING(${col}, ${literal(String(f.value).replace(/[~*?]/g,'~$&'))})`;
    if(f.operator==='prefix')return `LEFT(${col}, ${String(f.value).length}) = ${value}`;
    const op={eq:'==',ne:'<>',gte:'>=',lt:'<'}[f.operator];
    if(!op)throw Error('Unsupported BI operator');
    return `${col} ${op} ${value}`;
  }
  function targetPredicate(){
    if(!plan.target)return null;
    const t=plan.target;
    if(t.kind==='brand')return predicate({field:'BO[편성코드]',operator:'prefix',value:`[${t.value}]`});
    if(t.kind==='product')return predicate({field:'BO[편성코드]',operator:'eq',value:t.value});
    return predicate({field:'BO[표준조직]',operator:'eq',value:t.value});
  }
  function bucket(g){
    const c=column(g.field);
    return g.unit==='value'?c:`FORMAT(${c}, ${literal({year:'yyyy',month:'yyyy-MM',day:'yyyy-MM-dd',hour:'yyyy-MM-dd\\THH'}[g.unit])})`;
  }
  function condition(filters,{target=false,groups=[]}={}){
    return [...filters.map(predicate),...(target&&plan.target?[targetPredicate()]:[]),...groups.map(g=>`${bucket(g)} == __group${plan.groupBy.findIndex(p=>p.field===g.field&&p.unit===g.unit)}`)].join(' && ')||'TRUE()';
  }
  const filtered=(filters,options)=>`FILTER(ALL('BO'), ${condition(filters,options)})`;
  function baseMetric(id){
    const m=catalog.metrics[id];
    if(m?.aggregation==='sum')return `SUM(${column(m.column)})`;
    if(m?.aggregation==='count_distinct')return `DISTINCTCOUNT(${column(m.column)})`;
    const known=registeredMetrics.find(r=>r.id===id);
    if(m?.aggregation==='model-measure'&&known?.expression===m.expression)return known.expression;
    throw Object.assign(Error(`실행할 계산식이 확인되지 않은 지표야: ${m?.label||id}`),{code:'BI_METRIC_UNSUPPORTED'});
  }
  const scoped=(expression,filters,options)=>`CALCULATE(${expression}, REMOVEFILTERS('BO'), ${filtered(filters,options)})`;
  function metric(id){
    const m=catalog.metrics[id];
    if(m.aggregation!=='share')return scoped(baseMetric(id),plan.filters,{target:true,groups:plan.groupBy});
    const spec=checked.sharePlans[id];
    const numeratorFilters=[...new Map([...plan.filters,...spec.numerator.filters].map(f=>[JSON.stringify(f),f])).values()];
    const numerator=scoped(baseMetric(spec.numerator.metric),numeratorFilters,{target:true,groups:plan.groupBy});
    const denominator=scoped(baseMetric(spec.denominator.metric),spec.denominator.filters,{groups:spec.denominator.groupBy});
    return `DIVIDE(${numerator}, ${denominator})`;
  }
  let expression,outputs;
  if(plan.operation==='list'){
    outputs=plan.fields;
    expression=`SELECTCOLUMNS(${filtered(plan.filters,{target:true})}, ${outputs.map((id,i)=>`${literal('__out'+i)}, ${column(id)}`).join(', ')})`;
  }else{
    outputs=[...plan.groupBy.map(g=>g.field),...plan.metrics];
    const declarations=plan.groupBy.map((_,i)=>`VAR __group${i} = [__bucket${i}]`).join(' ');
    const wrap=expr=>declarations?`${declarations} RETURN ${expr}`:expr;
    const values=plan.metrics.map((id,i)=>`${literal('__metric'+i)}, ${wrap(metric(id))}`);
    const matched=`${literal('__matched')}, ${wrap(scoped("COUNTROWS('BO')",plan.filters,{target:true,groups:plan.groupBy}))}`;
    const source=plan.groupBy.length?`ADDCOLUMNS(DISTINCT(SELECTCOLUMNS(${filtered(plan.filters,{target:true})}, ${plan.groupBy.map((g,i)=>`${literal('__bucket'+i)}, ${bucket(g)}`).join(', ')})), ${[...values,matched].join(', ')})`:`ROW(${[...values,matched].join(', ')})`;
    expression=`SELECTCOLUMNS(${source}, ${[...plan.groupBy.map((_,i)=>`${literal('__out'+i)}, [__bucket${i}]`),...plan.metrics.map((_,i)=>`${literal('__out'+(plan.groupBy.length+i))}, [__metric${i}]`),`${literal('__matched')}, [__matched]`].join(', ')})`;
  }
  const sort=plan.sort.length?plan.sort:outputs.map(field=>({field,direction:'asc'}));
  const order=sort.map(s=>`[__out${outputs.indexOf(s.field)}], ${s.direction.toUpperCase()}`).join(', ');
  const finalOrder=sort.map(s=>`[__out${outputs.indexOf(s.field)}] ${s.direction.toUpperCase()}`).join(', ');
  return {plan,sharePlans:checked.sharePlans,outputs,dax:`EVALUATE TOPN(${plan.limit+1}, ${expression}, ${order})\nORDER BY ${finalOrder}`};
}

function createLiveExecutor({catalog,entities=[],query,onStatus=()=>{}}){
  if(typeof query!=='function')throw Error('A live BI query function is required');
  return {mode:'live',async searchValues({field,query:term='',limit=5}){
    if(!fieldMap(catalog).has(field)||!field.startsWith('BO[')||!field.endsWith(']')||typeof term!=='string'||term.length>300||!Number.isInteger(limit)||limit<1||limit>20)throw Error('Invalid BI value discovery request');
    const col="'BO'["+field.slice(3,-1).replace(/\]/g,']]')+']';
    const predicate=term?` && CONTAINSSTRING(${col}, ${literal(term.replace(/[~*?]/g,'~$&'))})`:'';
    onStatus('하! BI에서 실제 항목 후보를 찾는 중이야 🐰');
    try{const dax=`EVALUATE TOPN(${limit}, DISTINCT(SELECTCOLUMNS(FILTER(ALL('BO'), NOT ISBLANK(${col})${predicate}), "__value", ${col})), [__value], ASC)`;
      return extractRows(await query(dax)).slice(0,limit).map(row=>({field,value:row['[__value]']??row.__value}));
    }catch(cause){throw Object.assign(Error('BI 항목 후보를 가져오지 못했어.'),{code:'BI_QUERY_FAILED',cause});}
  },async execute(plan){
    const compiled=compilePlan(plan,catalog,entities);
    onStatus('하! 실제 BI에서 값을 가져오는 중이야 🐰');
    let rows;
    try{rows=extractRows(await query(compiled.dax));}
    catch(cause){throw Object.assign(Error('실제 BI 조회에 실패했어. 로그인 상태나 BI 연결을 확인해줘.'),{code:'BI_QUERY_FAILED',cause});}
    const limited=rows.length>plan.limit;
    return {mode:'live',synthetic:false,rows:rows.slice(0,plan.limit).map(row=>Object.fromEntries(compiled.outputs.map((key,i)=>[key,row[`[__out${i}]`]??row[`__out${i}`]??null]))),limited,matchedRows:limited?null:plan.operation==='list'?rows.length:rows.reduce((n,r)=>n+Number(r['[__matched]']??r.__matched??0),0)};
  }};
}
module.exports={compilePlan,createLiveExecutor};
