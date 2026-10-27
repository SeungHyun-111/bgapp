const {extractRows}=require('../power-bi-search');
const error=message=>Object.assign(new Error(message),{code:'GEMINI_EXECUTION_INVALID'});
const operators=['field','metric','sum','count','distinct_count','average','min','max','median','add','subtract','multiply','divide','power','abs','negate','round','floor','ceil','sqrt','rank'];
const aggregates=new Set(['sum','count','distinct_count','average','min','max','median']);
const literal=value=>{
  if(typeof value==='number'&&Number.isFinite(value))return String(value);
  if(typeof value==='boolean')return value?'TRUE()':'FALSE()';
  if(typeof value!=='string')throw error('조회 조건 값의 형식이 올바르지 않아.');
  return '"'+value.replace(/"/g,'""')+'"';
};
function prepare(plan,catalog,template){
  if(!plan||typeof plan!=='object')throw error('조회 계획이 없어.');
  const fields=new Map(catalog.fields.map(f=>[f.id,f]));
  const col=id=>{
    const f=fields.get(id);if(!f||f.table!=='BO')throw error(`등록되지 않은 원천 항목이야: ${id}`);
    return "'BO'["+f.name.replace(/\]/g,']]')+']';
  };
  if(plan.comparisonTargets?.length&&!plan.targets?.length&&!plan.datasets?.length)throw error('비교 대상은 targets 또는 별도 datasets로 표현하고, 대상별 결과를 구분할 groupBy를 명시해줘.');
  const datasets=plan.datasets?.length?plan.datasets:[{id:'query',period:plan.period,target:plan.target,targets:plan.targets,filters:plan.filters||[],requiredFields:plan.requiredFields||[]}];
  const ids=new Set();
  const normalized=datasets.map(d=>{
    if(typeof d.id!=='string'||!d.id||ids.has(d.id))throw error('조회 데이터 범위의 ID가 없거나 중복됐어.');ids.add(d.id);
    const period=d.period||plan.period;
    function date(v){
      if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?)?$/.test(v))throw error('조회 시작·종료 날짜를 확인해줘.');
      const time=Date.parse(v.includes('T')?v+'Z':v+'T00:00:00Z');
      if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==v.slice(0,10))throw error('존재하지 않는 조회 날짜야.');return time;
    }
    if(!period||period.timezone&&period.timezone!=='Asia/Seoul')throw error('한국 업무 시각 기준의 조회 기간이 필요해.');
    const start=date(period.start),end=date(period.endExclusive);if(start>=end)throw error('종료 날짜가 시작 날짜보다 뒤여야 해.');
    const required=new Set([...(plan.requiredFields||[]),...(d.requiredFields||[]),'field:방송일시']);
    const targets=d.targets?.length?d.targets:d.target?[d.target]:[];
    const targetConditions=targets.map(t=>{
      if(!t||t.type==='all')return 'TRUE()';
      const value=t.value??t.values;
      if(t.type==='organization'){
        const values=Array.isArray(value)?value:[value];
        if(!values.length||values.some(v=>!catalog.entities.organizations.some(e=>e.value===v)))throw error('조회 대상 표준조직 이름을 확인해야 해.');
        required.add('field:표준조직');return `${col('field:표준조직')} IN {${values.map(literal).join(',')}}`;
      }
      const field={brand:'field:편성코드',product:'field:편성코드',program:'field:프로그램명'}[t.type];
      if(!field||typeof value!=='string'||!value)throw error('대상 종류와 실제 항목값을 확인해야 해.');required.add(field);
      if(t.type==='brand'){const prefix='['+value+']';return `LEFT(${col(field)}, ${prefix.length}) == ${literal(prefix)}`;}
      return `${col(field)} == ${literal(value)}`;
    });
    let predicateCount=0;
    function predicate(f,depth=0){
      if(!f||typeof f!=='object'||Array.isArray(f))throw error('조회 조건은 객체로 표현해줘.');
      if(++predicateCount>10000||depth>100)throw error('조회 조건의 크기나 중첩이 처리 범위를 넘었어.');
      if(['or','and'].includes(f.operator)){
        if(!Array.isArray(f.conditions)||!f.conditions.length)throw error('OR/AND 묶음에 조회 조건을 넣어줘.');
        return '('+f.conditions.map(child=>predicate(child,depth+1)).join(f.operator==='or'?' || ':' && ')+')';
      }
      required.add(f.field);const c=col(f.field),op=f.operator;
      if(['is_null','not_null'].includes(op))return `${op==='not_null'?'NOT ':''}ISBLANK(${c})`;
      if(op==='in'||op==='not_in'){
        if(!Array.isArray(f.value)||!f.value.length)throw error('선택 조건이 비어 있어.');
        return `${op==='not_in'?'NOT ':''}(${c} IN {${f.value.map(literal).join(',')}})`;
      }
      if(['contains','prefix'].includes(op)){
        if(typeof f.value!=='string')throw error('문자 조건 값이 필요해.');
        const v=f.value.replace(/[~*?]/g,'~$&');
        return op==='prefix'?`LEFT(${c}, ${f.value.length}) == ${literal(f.value)}`:`CONTAINSSTRING(${c}, ${literal(v)})`;
      }
      const symbol={eq:'==',ne:'<>',gte:'>=',lt:'<',gt:'>',lte:'<='}[op];
      if(!symbol)throw error('알 수 없는 조회 조건 연산자야.');return `${c} ${symbol} ${literal(f.value)}`;
    }
    if(d.filters!==undefined&&!Array.isArray(d.filters))throw error('조회 조건은 배열이어야 해.');
    const conditions=[...(targetConditions.length?['('+targetConditions.join(' || ')+')']:[]),...(d.filters||[]).map(f=>predicate(f))];
    return {...d,period,start,end,required,conditions};
  });
  const byId=new Map(normalized.map(d=>[d.id,d]));
  const defaultDataset=plan.dataset||normalized[0].id;
  if(!byId.has(defaultDataset))throw error('기본 조회 범위 ID가 없어.');
  const groups=(plan.groupBy||[]).map(g=>typeof g==='string'?{field:g,unit:'value'}:{unit:'value',...g});
  for(const g of groups){col(g.field);if(!['value','year','month','day','hour'].includes(g.unit))throw error('그룹의 날짜 단위를 확인해줘.');for(const d of normalized)d.required.add(g.field);}
  const calculations=plan.calculations?.length?plan.calculations:[{id:'value',label:plan.metricLabel||'값',formula:plan.formula,format:plan.outputFormat||'number'}];
  const calcIds=new Set();
  calculations.forEach(c=>{if(typeof c.id!=='string'||!c.id||calcIds.has(c.id)||['__rank','__groupKey'].includes(c.id)||fields.has(c.id))throw error('계산 ID가 없거나 중복됐어.');calcIds.add(c.id);});
  let count=0;
  function inspect(node,stack=[],depth=0,inheritedDataset=defaultDataset){
    if(++count>10000||depth>100)throw error('계산식의 크기나 중첩이 처리 범위를 넘었어.');
    if(typeof node==='number'){if(!Number.isFinite(node))throw error('유효하지 않은 계산 상수야.');return;}
    if(!node||typeof node!=='object'||!operators.includes(node.operator))throw error('계산식에 등록되지 않은 연산자가 있어.');
    if(node.scope&&!['query','selected_scope','selected_target_and_filters','group','all'].includes(node.scope))throw error('계산 범위는 명시적인 dataset ID와 group/all로 지정해줘.');
    const d=byId.get(node.dataset||inheritedDataset);if(!d)throw error('산식에 없는 조회 범위 ID가 있어.');
    if(node.field){col(node.field);d.required.add(node.field);}
    if(node.operator==='metric'){
      if(!calcIds.has(node.id)||stack.includes(node.id))throw error('계산 참조가 없거나 순환하고 있어.');
      inspect(calculations.find(c=>c.id===node.id).formula,[...stack,node.id],depth+1,defaultDataset);return;
    }
    const args=node.arguments||[];if(!Array.isArray(args))throw error('산식 인수는 배열이어야 해.');
    if(node.operator==='field'&&!node.field)throw error('원천 필드가 없는 산식이야.');
    if(node.operator==='field'&&args.length)throw error('field 노드에는 계산 인수를 넣지 말고 실제 field ID를 지정해줘.');
    if(aggregates.has(node.operator)&&node.field&&args.length)throw error('집계 노드는 field와 arguments 중 하나만 지정해줘.');
    if(node.operator==='count'&&args.length>1)throw error('count의 행 계산식은 하나로 표현해줘.');
    if(aggregates.has(node.operator)&&node.operator!=='count'&&!node.field&&args.length!==1)throw error('집계할 필드 또는 행 계산식 하나를 지정해줘.');
    if(['add','multiply'].includes(node.operator)&&args.length<2)throw error('계산 인수가 두 개 이상 필요해.');
    if(['subtract','divide','power'].includes(node.operator)&&args.length!==2)throw error('계산 인수가 두 개 필요해.');
    if(['abs','negate','floor','ceil','sqrt','rank'].includes(node.operator)&&args.length!==1)throw error('계산 인수가 한 개 필요해.');
    if(node.operator==='round'&&![1,2].includes(args.length))throw error('반올림 인수를 확인해줘.');
    args.forEach(n=>inspect(n,stack,depth+1,d.id));
  }
  calculations.forEach(c=>inspect(c.formula,[c.id]));
  const units=new Map(catalog.metrics.filter(m=>m.sourceField&&m.unit).map(m=>[m.sourceField,m.unit]));
  function infer(node,seen=new Set()){
    if(typeof node==='number')return 'scalar';
    if(node.operator==='metric')return infer(calculations.find(c=>c.id===node.id).formula,new Set([...seen,node.id]));
    if(['count','distinct_count','rank'].includes(node.operator))return 'scalar';
    const args=node.arguments||[];
    if(node.field)return units.get(node.field)||null;
    const u=args.map(n=>infer(n,seen));
    if(['add','subtract'].includes(node.operator)){
      const known=u.filter(Boolean);if(new Set(known).size>1)throw error('더하거나 뺄 항목의 단위가 달라. 카탈로그 단위와 원래 질문에 맞게 산식을 수정해줘.');return known[0]||null;
    }
    if(node.operator==='divide')return u[0]&&u[0]===u[1]?'scalar':null;
    if(node.operator==='multiply'){const real=u.filter(v=>v&&v!=='scalar');return real.length===1?real[0]:null;}
    return u[0]||null;
  }
  calculations.forEach(c=>{
    infer(c.formula);
    if(c.format&&!['number','percent','text'].includes(c.format))throw error('계산 표시 형식은 number/percent/text로 지정해줘.');
    if(c.decimals!==undefined&&(!Number.isInteger(c.decimals)||c.decimals<0||c.decimals>20))throw error('소수점 표시 자릿수는 0~20 정수로 지정해줘.');
  });
  if(plan.limit!==undefined&&(!Number.isInteger(plan.limit)||plan.limit<1))throw error('결과 개수는 양의 정수여야 해.');
  const sort=plan.sort||[];
  const having=plan.having||[];
  if(!Array.isArray(having))throw error('집계 후 조건은 having 배열로 전달해줘.');
  for(const h of having){
    if(!calcIds.has(h.field)||!['gt','gte','lt','lte','eq','ne','not_null','is_null'].includes(h.operator))throw error('집계 후 조건의 계산 ID나 연산자를 확인해줘.');
    if(!['not_null','is_null'].includes(h.operator)&&!['number','string','boolean'].includes(typeof h.value))throw error('집계 후 조건의 비교값을 확인해줘.');
  }
  for(const s of sort)if((!calcIds.has(s.field)&&!groups.some(g=>g.field===s.field))||(s.direction&&!['asc','desc'].includes(s.direction)))throw error('정렬 기준이나 방향이 올바르지 않아.');
  if(typeof template!=='string'||!template.match(/\{\{[^{}]+\}\}/))throw error('앱 계산 결과를 넣을 답변 틀이 필요해.');
  const allowed=new Set(['value','results','rows','table','topLabel','topValue','count','periodLabel','targetLabel',...calculations.map(c=>'metric:'+c.id),...groups.map(g=>g.field)]);
  for(const m of template.matchAll(/\{\{([^{}]+)\}\}/g))if(!allowed.has(m[1]))throw error(`답변 틀의 결과 자리 이름을 확인해줘: ${m[1]}`);
  normalized.forEach(d=>{d.ids=[...d.required];d.ids.forEach(col);d.cap=Math.min(20000,Math.floor(900000/d.ids.length));});
  return {datasets:normalized,defaultDataset,groups,calculations,sort,having,plan,col,template,units};
}

const numeric=v=>{if(typeof v!=='number'||!Number.isFinite(v))throw error('계산할 원천값이 숫자가 아니거나 유효하지 않아.');return v;};
const dateLiteral=time=>{
  const d=new Date(time);return `(DATE(${d.getUTCFullYear()},${d.getUTCMonth()+1},${d.getUTCDate()}) + TIME(${d.getUTCHours()},${d.getUTCMinutes()},${d.getUTCSeconds()}) + ${d.getUTCMilliseconds()}/86400000)`;
};
const groupValue=(row,g)=>{
  const v=row[g.field];if(g.unit==='value'||v==null)return v;
  const sizes={year:4,month:7,day:10,hour:13};return String(v).replace(' ','T').slice(0,sizes[g.unit]);
};
const keyFor=(row,groups)=>JSON.stringify(groups.map(g=>groupValue(row,g)));
function evaluate(node,context,visiting=new Set()){
  if(context.row||typeof node==='number'||!context.cache)return evaluateNode(node,context,visiting);
  let cached=context.cache.get(node);if(!cached){cached=new Map();context.cache.set(node,cached);}
  const key=JSON.stringify([context.dataset||context.prepared.defaultDataset,context.key]);
  if(cached.has(key))return cached.get(key);
  const value=evaluateNode(node,context,visiting);cached.set(key,value);return value;
}
function evaluateNode(node,context,visiting=new Set()){
  if(typeof node==='number')return node;
  const {prepared,data,key,row}=context,args=node.arguments||[];
  const dataset=node.dataset||context.dataset||prepared.defaultDataset;
  const all=data.get(dataset)||[];
  const rows=node.scope==='all'||key===null?all:context.buckets?.get(dataset)?.get(key)||all.filter(r=>keyFor(r,prepared.groups)===key);
  const exec=n=>evaluate(n,{...context,dataset},visiting);
  if(node.operator==='metric'){
    if(visiting.has(node.id))throw error('계산식 참조가 순환해.');
    return evaluate(prepared.calculations.find(c=>c.id===node.id).formula,{...context,dataset:prepared.defaultDataset},new Set([...visiting,node.id]));
  }
  if(node.operator==='field'){
    if(row)return row[node.field]??null;
    const values=[...new Set(rows.map(r=>r[node.field]).filter(v=>v!=null))];
    if(values.length>1)throw error('여러 원본값을 하나로 고를 수 없어. 그룹이나 집계 기준을 확인해줘.');return values[0]??null;
  }
  if(aggregates.has(node.operator)){
    if(node.operator==='count'&&!node.field&&!args.length)return rows.length;
    const values=rows.map(r=>node.field?r[node.field]:evaluate(args[0],{...context,dataset,row:r},visiting)).filter(v=>v!=null);
    if(node.operator==='count')return values.length;
    if(node.operator==='distinct_count')return new Set(values.map(v=>JSON.stringify(v))).size;
    if(!values.length)return null;
    values.forEach(numeric);
    if(node.operator==='sum')return numeric(values.reduce((a,b)=>a+b,0));
    if(node.operator==='average')return numeric(values.reduce((a,b)=>a+b,0)/values.length);
    if(node.operator==='min')return values.reduce((a,b)=>Math.min(a,b));
    if(node.operator==='max')return values.reduce((a,b)=>Math.max(a,b));
    values.sort((a,b)=>a-b);const middle=Math.floor(values.length/2);return values.length%2?values[middle]:(values[middle-1]+values[middle])/2;
  }
  if(node.operator==='rank'){
    const value=exec(args[0]);if(value===null)return null;numeric(value);
    const candidates=context.keys.map(k=>evaluate(args[0],{...context,key:k},visiting)).filter(v=>v!=null);candidates.forEach(numeric);
    const better=candidates.filter(v=>node.direction==='asc'?v<value:v>value);
    return (node.ties==='competition'?better.length:new Set(better).size)+1;
  }
  const values=args.map(exec);if(values.some(v=>v==null))return null;values.forEach(numeric);
  const [a,b]=values;
  if(node.operator==='divide'&&b===0)throw error('분모가 0이라 계산할 수 없어.');
  const operations={add:()=>values.reduce((x,y)=>x+y,0),subtract:()=>a-b,multiply:()=>values.reduce((x,y)=>x*y,1),divide:()=>a/b,power:()=>a**b,abs:()=>Math.abs(a),negate:()=>-a,round:()=>Math.round(a*10**(b||0))/10**(b||0),floor:()=>Math.floor(a),ceil:()=>Math.ceil(a),sqrt:()=>Math.sqrt(a)};
  const value=operations[node.operator]();if(!Number.isFinite(value))throw error('계산 결과가 유효한 숫자가 아니야.');return value;
}

function aggregate(prepared,data){
  const cache=new WeakMap(),buckets=new Map();
  if(prepared.groups.length)for(const [id,source]of data){
    const byKey=new Map();
    for(const row of source){const key=keyFor(row,prepared.groups);if(!byKey.has(key))byKey.set(key,[]);byKey.get(key).push(row);}
    buckets.set(id,byKey);
  }
  const keys=prepared.groups.length?[...new Set((data.get(prepared.defaultDataset)||[]).map(r=>keyFor(r,prepared.groups)))]:[null];
  let rows=keys.map(key=>{
    const values=key===null?[]:JSON.parse(key);
    const result=Object.fromEntries(prepared.groups.map((g,i)=>[g.field,values[i]]));
    for(const c of prepared.calculations)result[c.id]=evaluate(c.formula,{prepared,data,key,keys,row:null,cache,buckets});
    return result;
  });
  rows=rows.filter(row=>prepared.having.every(h=>{
    const value=row[h.field];
    if(h.operator==='is_null')return value==null;
    if(h.operator==='not_null')return value!=null;
    if(value==null)return false;
    return {gt:()=>value>h.value,gte:()=>value>=h.value,lt:()=>value<h.value,lte:()=>value<=h.value,eq:()=>value===h.value,ne:()=>value!==h.value}[h.operator]();
  }));
  const compare=(a,b)=>{
    for(const s of prepared.sort){
      if(a[s.field]==null&&b[s.field]!=null)return 1;if(b[s.field]==null&&a[s.field]!=null)return -1;
      const av=a[s.field],bv=b[s.field],v=typeof av==='number'&&typeof bv==='number'?av-bv:String(av??'').localeCompare(String(bv??''),'ko');
      if(v)return s.direction==='desc'?-v:v;
    }return 0;
  };
  if(prepared.sort.length)rows.sort(compare);
  if(prepared.plan.limit&&rows.length>prepared.plan.limit){
    let end=prepared.plan.limit;
    if(prepared.plan.includeTies!==false&&prepared.sort.length)while(end<rows.length&&compare(rows[end-1],rows[end])===0)end++;
    rows=rows.slice(0,end);
  }
  return rows;
}

function render(prepared,rows){
  const display=value=>typeof value==='string'?value.replace(/\b(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2}(?:\.\d+)?)?/g,(_,day,time,seconds)=>day+' '+time+(!seconds||/^:00(?:\.0+)?$/.test(seconds)?'':seconds)):String(value);
  const format=(value,c)=>{
    if(value==null)return '데이터 없음';if(typeof value!=='number')return display(value);
    const percent=c.format==='percent',digits=c.decimals??6;
    if(!Number.isInteger(digits)||digits<0||digits>20)throw error('소수점 표시 자릿수를 확인해줘.');
    const unit=c.unit??(['sum','field'].includes(c.formula.operator)?prepared.units.get(c.formula.field):'');
    return new Intl.NumberFormat('ko-KR',{maximumFractionDigits:digits}).format(percent?value*100:value)+(percent?'%':unit||'');
  };
  const labels=row=>prepared.groups.map(g=>display(row[g.field]??'미분류')).join(' · ');
  const lines=rows.map(row=>[labels(row),...prepared.calculations.map(c=>(prepared.calculations.length>1?(c.label||c.id)+': ':'')+format(row[c.id],c))].filter(Boolean).join(' · '));
  const first=rows[0],firstCalc=prepared.calculations[0];
  const periods=prepared.datasets.map(d=>d.period.start+'~'+d.period.endExclusive+' 미만').join(', ');
  const targets=prepared.datasets.flatMap(d=>d.targets?.length?d.targets:d.target?[d.target]:[]).map(t=>Array.isArray(t.value)?t.value.join(', '):t.value||'전체').join(', ')||'전체';
  const text=lines.join('\n')||'데이터 없음';
  const replacements={value:rows.length===1&&!prepared.groups.length?format(first[firstCalc.id],firstCalc):text,results:text,rows:text,table:text,topLabel:first?labels(first):'데이터 없음',topValue:first?format(first[firstCalc.id],firstCalc):'데이터 없음',count:String(rows.length),periodLabel:periods,targetLabel:targets};
  for(const c of prepared.calculations)replacements['metric:'+c.id]=first?format(first[c.id],c):'데이터 없음';
  for(const g of prepared.groups)replacements[g.field]=first?display(first[g.field]??'미분류'):'데이터 없음';
  return display(prepared.template.replace(/\{\{([^{}]+)\}\}/g,(match,name,offset,template)=>{
    const value=replacements[name];
    if(name==='topValue'||name.startsWith('metric:')||(name==='value'&&!prepared.groups.length)){
      const suffix=template.slice(offset+match.length);
      for(const unit of ['원/분','원','분','회','%'])if(value.endsWith(unit)&&suffix.startsWith(unit))return value.slice(0,-unit.length);
    }
    return value;
  }));
}

function createExecutor({query,onStatus=()=>{}}){
  return {async execute({plan,catalog,responseTemplate,signal,record}){
    const p=prepare(plan,catalog,responseTemplate);signal.throwIfAborted();
    record.validation={ok:true,executionAllowed:true,scope:'datasets_groups_and_app_formulas',blankPolicy:'exclude_nulls_aggregate_all_blank_is_null'};
    record.actualBiQueryConditions=p.datasets.map(d=>({id:d.id,period:d.period,target:d.target,targets:d.targets,filters:d.filters||[],fields:d.ids}));
    record.actualCalculation={groupBy:p.groups,calculations:p.calculations,having:p.having,sort:p.sort,limit:plan.limit,includeTies:plan.includeTies!==false};
    record.sourceQueries=[];const data=new Map();
    async function fetchRange(d,start,end){
      signal.throwIfAborted();record.stage='source_query';record.executionAttempted=true;
      const conditions=[`${p.col('field:방송일시')} >= ${dateLiteral(start)}`,`${p.col('field:방송일시')} < ${dateLiteral(end)}`,...d.conditions];
      const dax=`EVALUATE SELECTCOLUMNS(TOPN(${d.cap+1}, FILTER(ALL('BO'), ${conditions.join(' && ')}), ${p.col('field:방송일시')}, ASC), ${d.ids.map((id,i)=>`${literal('raw'+i)}, ${p.col(id)}`).join(', ')})`;
      const raw=extractRows(await query(dax));record.queryExecuted=true;signal.throwIfAborted();
      record.sourceQueries.push({dataset:d.id,start:new Date(start).toISOString(),endExclusive:new Date(end).toISOString(),rows:raw.length,split:raw.length>d.cap});
      if(raw.length>d.cap){
        const middle=start+Math.floor((end-start)/2);
        if(middle<=start)throw error('동일 시각의 원천 행이 전송 한도를 넘어 안전하게 분할할 수 없어. 원천 행 고유 키가 필요해. 부분값으로 계산하지 않았어.');
        return [...await fetchRange(d,start,middle),...await fetchRange(d,middle,end)];
      }
      return raw.map(row=>Object.fromEntries(d.ids.map((id,i)=>{
        const key='[raw'+i+']',plain='raw'+i;
        if(!(key in row)&&!(plain in row))throw error('필요한 원천 항목이 BI 응답에서 누락됐어.');return [id,row[key]??row[plain]??null];
      })));
    }
    for(const d of p.datasets){onStatus(`BI에서 ${d.id} 원천값을 가져오는 중이야 🐰`);data.set(d.id,await fetchRange(d,d.start,d.end));}
    record.sourceRowCount=Object.fromEntries([...data].map(([id,rows])=>[id,rows.length]));
    record.stage='app_calculation';onStatus('원천값으로 그룹별 집계와 계산을 하는 중이야 🐰');
    const rows=aggregate(p,data);record.calculationResult={rows,sourceRowCount:record.sourceRowCount};
    return render(p,rows);
  }};
}
module.exports={createExecutor,prepare,evaluate,aggregate,render,operators};
