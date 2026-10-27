// Legacy single-result interpreter retained as comments; generic engine is active.
// const {extractRows}=require('../power-bi-search');
// const error=message=>Object.assign(new Error(message),{code:'GEMINI_EXECUTION_INVALID'});
// const literal=value=>typeof value==='number'&&Number.isFinite(value)?String(value):'"'+String(value).replace(/"/g,'""')+'"';
//
// function prepare(plan,catalog,template){
//   const fields=new Map(catalog.fields.map(f=>[f.id,f]));
//   const required=new Set(plan.requiredFields);
//   const col=id=>{
//     const field=fields.get(id);
//     if(!field||field.table!=='BO')throw error('등록되지 않은 원천 항목이야.');
//     return "'BO'["+field.name.replace(/\]/g,']]')+']';
//   };
//   const date=value=>{
//     if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw error('조회 기간을 정확한 날짜로 확인해줘.');
//     const [y,m,d]=value.split('-').map(Number);return `DATE(${y},${m},${d})`;
//   };
//   if(!plan.period||!['Asia/Seoul',undefined].includes(plan.period.timezone))throw error('한국 업무 시각 기준의 조회 기간이 필요해.');
//   const start=date(plan.period.start),end=date(plan.period.endExclusive);
//   if(plan.period.start>=plan.period.endExclusive||Date.parse(plan.period.endExclusive)-Date.parse(plan.period.start)>366*86400000)throw error('조회 기간은 시작일보다 뒤의 종료일로, 최대 1년까지 지정해줘.');
//   if(plan.groupBy?.length||plan.comparisonTargets?.length)throw error('여러 대상 비교·그룹별 계산은 아직 실행할 수 없어. 우선 한 대상의 합계로 물어봐줘.');
//   required.add('field:방송일시');
//   const conditions=[`${col('field:방송일시')} >= ${start}`,`${col('field:방송일시')} < ${end}`];
//   const target=plan.target;
//   if(target&&target.type!=='all'){
//     if(target.type!=='organization')throw error('현재 원천 조회는 전체 또는 확인된 표준조직 대상을 지원해.');
//     const organizations=catalog.entities.organizations;
//     if(!organizations.some(e=>e.value===target.value))throw error('조회할 표준조직을 확인하지 못했어. 조직 이름을 다시 알려줘.');
//     required.add('field:표준조직');conditions.push(`${col('field:표준조직')} == ${literal(target.value)}`);
//   }
//   if(!Array.isArray(plan.filters)||plan.filters.length>20)throw error('조회 조건 형식이 올바르지 않아.');
//   for(const filter of plan.filters){
//     const id=filter.field;required.add(id);const c=col(id);
//     const op=filter.operator;
//     const scalar=v=>{if(!['string','number','boolean'].includes(typeof v)||String(v).length>300)throw error('조회 조건 값이 올바르지 않아.');return literal(v);};
//     if(op==='in'){
//       if(!Array.isArray(filter.value)||!filter.value.length||filter.value.length>30)throw error('조회 조건 선택값이 너무 많거나 비어 있어.');
//       conditions.push(`${c} IN {${filter.value.map(scalar).join(',')}}`);
//     }else if(['eq','ne','gte','lt','gt','lte'].includes(op))conditions.push(`${c} ${{eq:'==',ne:'<>',gte:'>=',lt:'<',gt:'>',lte:'<='}[op]} ${scalar(filter.value)}`);
//     else throw error('이 조회 조건 연산자는 아직 지원하지 않아.');
//   }
//   // Only established additive metrics may be summed. Raw rates and opaque
//   // model measures must not silently become additive source columns.
//   const sumFields=new Set(catalog.metrics.filter(m=>m.formula?.operation==='sum').map(m=>m.sourceField));
//   const units=new Map(catalog.metrics.filter(m=>m.sourceField&&m.unit).map(m=>[m.sourceField,m.unit]));
//   let nodeCount=0;
//   function validate(node,depth=0){
//     if(++nodeCount>200||depth>16)throw error('계산 산식이 너무 복잡해.');
//     if(typeof node==='number'){if(!Number.isFinite(node))throw error('계산 상수가 올바르지 않아.');return 'scalar';}
//     if(!node||typeof node!=='object')throw error('계산 산식이 올바르지 않아.');
//     if(node.scope&&!['query','selected_scope','selected_target_and_filters'].includes(node.scope))throw error('분모 범위 등 별도 계산 범위의 업무 정의를 먼저 확인해야 해.');
//     if(['sum','distinct_count','field'].includes(node.operator)){
//       if(!required.has(node.field))throw error('산식에 필요한 원천 항목이 조회 계획에서 누락됐어.');
//       col(node.field);
//       if(node.arguments?.length)throw error('원천 항목 집계에 불필요한 인수가 있어.');
//       if(node.operator==='sum'&&!sumFields.has(node.field))throw error('이 항목은 합산 가능한 업무 정의가 확인되지 않았어.');
//       if(node.operator==='distinct_count'&&node.field!=='field:방송일시')throw error('이 항목의 고유 개수 계산 기준은 아직 확인되지 않았어.');
//       return node.operator==='distinct_count'?'회':units.get(node.field)||'unknown:'+node.field;
//     }
//     if(!['add','subtract','multiply','divide'].includes(node.operator)||!Array.isArray(node.arguments)||node.arguments.length!==2)throw error('현재 지원하지 않거나 인수가 잘못된 계산 방식이야.');
//     const [a,b]=node.arguments.map(n=>validate(n,depth+1));
//     if(['add','subtract'].includes(node.operator)&&a!==b)throw error('단위가 다른 항목끼리는 더하거나 뺄 수 없어.');
//     if(['add','subtract'].includes(node.operator))return a;
//     if(node.operator==='divide')return a===b?'scalar':b==='scalar'?a:`${a}/${b}`;
//     return a==='scalar'?b:b==='scalar'?a:`${a}*${b}`;
//   }
//   const resultUnit=validate(plan.formula);
//   if(!['number','percent',undefined].includes(plan.outputFormat))throw error('숫자 또는 백분율 표시 형식을 선택해줘.');
//   if(plan.outputFormat==='percent'&&resultUnit!=='scalar')throw error('이 산식은 비율이 아니어서 백분율로 표시할 수 없어.');
//   if(typeof template!=='string'||!template.includes('{{value}}'))throw error('실제 결과값을 넣을 답변 틀이 없어.');
//   const slots=[...template.matchAll(/\{\{([^{}]+)\}\}/g)].map(m=>m[1]);
//   if(slots.some(s=>!['value','periodLabel','targetLabel'].includes(s)))throw error('답변 틀에 지원하지 않는 결과 항목이 있어.');
//   const ids=[...required];ids.forEach(col);
//   const cap=Math.min(20000,Math.floor(900000/ids.length));
//   const dax=`EVALUATE SELECTCOLUMNS(TOPN(${cap+1}, FILTER(ALL('BO'), ${conditions.join(' && ')}), ${col('field:방송일시')}, ASC), ${ids.map((id,i)=>`${literal('raw'+i)}, ${col(id)}`).join(', ')})`;
//   return {ids,cap,dax,units,conditions:{period:plan.period,target:plan.target,filters:plan.filters,fields:ids}};
// }
//
// function calculate(node,rows){
//   if(typeof node==='number')return node;
//   const values=node.field?rows.map(row=>row[node.field]).filter(v=>v!==null&&v!==undefined):null;
//   const numeric=value=>{if(typeof value!=='number'||!Number.isFinite(value))throw error('원천값이 숫자가 아니어서 임의 변환 없이 계산을 중단했어.');return value;};
//   if(node.operator==='sum')return values.length?values.reduce((total,v)=>total+numeric(v),0):null;
//   if(node.operator==='distinct_count'){
//     if(values.length!==rows.length)throw error('방송일시가 비어 있는 행이 있어 방송횟수를 확정할 수 없어.');
//     return new Set(values).size;
//   }
//   if(node.operator==='field'){
//     const distinct=[...new Set(values)];if(distinct.length>1)throw error('원본값이 여러 개라 하나의 수치로 답할 수 없어.');return distinct[0]??null;
//   }
//   const [a,b]=node.arguments.map(n=>calculate(n,rows));
//   if(a===null||b===null)return null;
//   numeric(a);numeric(b);
//   if(node.operator==='divide'&&b===0)throw error('분모가 0이라 계산할 수 없어.');
//   const result={add:()=>a+b,subtract:()=>a-b,multiply:()=>a*b,divide:()=>a/b}[node.operator]();
//   if(!Number.isFinite(result))throw error('계산 결과가 유효한 숫자가 아니야.');return result;
// }
//
// function createExecutor({query,onStatus=()=>{}}){
//   return {async execute({plan,catalog,responseTemplate,signal,record}){
//     const prepared=prepare(plan,catalog,responseTemplate);
//     signal.throwIfAborted();
//     record.validation={ok:true,executionAllowed:true,scope:'single_result_source_rows',blankPolicy:'exclude_nulls_sum_all_blank_is_null'};
//     record.actualBiQueryConditions=prepared.conditions;
//     record.actualCalculation=plan.formula;
//     record.stage='source_query';record.executionAttempted=true;
//     onStatus('BI에서 필요한 원천값을 가져오는 중이야 🐰');
//     const response=await query(prepared.dax);
//     record.queryExecuted=true;
//     signal.throwIfAborted();
//     const raw=extractRows(response);
//     if(raw.length>prepared.cap)throw error('원천 데이터가 조회 한도를 넘어서 일부 값으로 계산하지 않았어. 기간을 줄여줘.');
//     const rows=raw.map(row=>Object.fromEntries(prepared.ids.map((id,i)=>{
//       const bracket='[raw'+i+']',plain='raw'+i;
//       if(!(bracket in row)&&!(plain in row))throw error('필요한 원천 항목이 BI 응답에서 누락됐어.');
//       return [id,row[bracket]??row[plain]??null];
//     })));
//     record.sourceRowCount=rows.length;record.stage='app_calculation';
//     const value=rows.length?calculate(plan.formula,rows):null;
//     record.calculationResult={value,sourceRowCount:rows.length};
//     let formatted=value===null?'데이터 없음':typeof value==='number'?new Intl.NumberFormat('ko-KR',{maximumFractionDigits:6}).format(plan.outputFormat==='percent'?value*100:value):String(value);
//     if(value!==null&&plan.outputFormat==='percent'&&!responseTemplate.includes('{{value}}%'))formatted+='%';
//     if(value!==null&&plan.formula.operator==='sum'){
//       const unit=prepared.units.get(plan.formula.field);
//       if(unit&&!responseTemplate.includes('{{value}}'+unit)&&!responseTemplate.includes('{{value}} '+unit))formatted+=unit;
//     }
//     const replacements={value:formatted,periodLabel:plan.period.start+'~'+plan.period.endExclusive+' 미만',targetLabel:plan.target?.value||'전체'};
//     return responseTemplate.replace(/\{\{(value|periodLabel|targetLabel)\}\}/g,(_,key)=>replacements[key]);
//   }};
// }
// module.exports={createExecutor,prepare,calculate};
module.exports=require('./analysis-engine');
