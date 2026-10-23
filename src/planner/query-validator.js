const schema=require('./plan-schema.json');
function schemaErrors(value,definition,path='$'){
  const errors=[];
  const type=value===null?'null':Array.isArray(value)?'array':Number.isInteger(value)?'integer':typeof value;
  const allowed=Array.isArray(definition.type)?definition.type:[definition.type];
  if(definition.type&&!allowed.includes(type)&&!(type==='integer'&&allowed.includes('number')))return [`${path}: invalid type`];
  if(definition.enum&&!definition.enum.includes(value))errors.push(`${path}: invalid enum`);
  if(type==='object'){
    for(const key of definition.required||[])if(!Object.hasOwn(value,key))errors.push(`${path}.${key}: required`);
    for(const [key,item]of Object.entries(value)){
      if(definition.properties?.[key])errors.push(...schemaErrors(item,definition.properties[key],`${path}.${key}`));
      else if(definition.additionalProperties===false)errors.push(`${path}.${key}: unknown property`);
    }
  }
  if(type==='array'){
    if(value.length>(definition.maxItems??Infinity))errors.push(`${path}: too many items`);
    value.forEach((item,i)=>errors.push(...schemaErrors(item,definition.items,`${path}[${i}]`)));
  }
  if(type==='string'&&(value.length<(definition.minLength||0)||value.length>(definition.maxLength??Infinity)))errors.push(`${path}: invalid length`);
  if(['integer','number'].includes(type)&&(!Number.isFinite(value)||value<(definition.minimum??-Infinity)||value>(definition.maximum??Infinity)))errors.push(`${path}: invalid number`);
  return errors;
}
const fieldMap=catalog=>new Map(catalog.tables.flatMap(t=>t.columns).map(c=>[c.id,c]));
function validatePlan(plan,catalog,entities=[]){
  const errors=schemaErrors(plan,schema);if(errors.length)return {ok:false,errors};
  const fields=fieldMap(catalog);
  if(new Set(plan.metrics).size!==plan.metrics.length||new Set(plan.groupBy.map(g=>g.field)).size!==plan.groupBy.length)errors.push('Duplicate metric or grouping output');
  for(const field of [...plan.fields,...plan.filters.map(f=>f.field),...plan.groupBy.map(g=>g.field)])if(!fields.has(field))errors.push(`Unknown field: ${field}`);
  for(const metric of plan.metrics){const m=catalog.metrics[metric];if(!m)errors.push(`Unknown metric: ${metric}`);else if(m.aggregation==='raw')errors.push(`Aggregation undefined: ${metric}`);}
  for(const filter of plan.filters){
    if(filter.operator==='hour'&&(fields.get(filter.field)?.type!=='datetime'||!Number.isInteger(filter.value)||filter.value<0||filter.value>23))errors.push('Invalid hour filter');
    if(fields.get(filter.field)?.type==='datetime'&&filter.operator!=='hour'){
      const text=String(filter.value),match=text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2})?$/);
      const date=new Date(text.length===10?text+'T00:00:00Z':text+'Z');
      if(!match||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==text.slice(0,10)||!['eq','ne','gte','lt'].includes(filter.operator))errors.push('Invalid date filter');
    }
  }
  for(const group of plan.groupBy)if(group.unit!=='value'&&fields.get(group.field)?.type!=='datetime')errors.push('Temporal grouping requires a datetime field');
  const outputs=plan.operation==='list'?plan.fields:[...plan.metrics,...plan.groupBy.map(g=>g.field)];
  for(const sort of plan.sort)if(!outputs.includes(sort.field))errors.push('Sort field must be an output');
  if(plan.operation==='list'&&(!plan.fields.length||plan.metrics.length||plan.groupBy.length))errors.push('List requires fields, without metrics/grouping');
  if(plan.operation==='aggregate'&&(!plan.metrics.length||plan.fields.length))errors.push('Aggregate requires metrics, without fields');
  if(plan.target){
    const target=plan.target;
    const exists=entities.some(e=>target.kind==='brand'?e.kind==='product'&&e.value.match(/^\[([^\]]+)\]/)?.[1]===target.value:e.kind===target.kind&&(e.value===target.value||e.aliases?.includes(target.value)));
    if(!exists)errors.push(`Target not in supplied catalog: ${target.kind}`);
  }
  const dates=plan.filters.filter(f=>fields.get(f.field)?.type==='datetime');
  const start=dates.find(f=>f.operator==='gte'),end=dates.find(f=>f.operator==='lt');
  if(!start||!end||start.field!==end.field||start.value>=end.value)errors.push('A bounded datetime range is required');
  if(plan.metrics.some(id=>catalog.metrics[id]?.aggregation==='share')&&plan.target?.kind!=='organization')errors.push('Verified share templates currently require an organization');
  const normalized=structuredClone(plan);
  if(plan.target?.kind==='organization'){
    const entity=entities.find(e=>e.kind==='organization'&&(e.value===plan.target.value||e.aliases?.includes(plan.target.value)));
    if(entity)normalized.target.value=entity.value;
  }
  return {ok:!errors.length,errors,plan:errors.length?undefined:normalized};
}
module.exports={validatePlan,schemaErrors,fieldMap};
