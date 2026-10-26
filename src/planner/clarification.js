const {schemaErrors,fieldMap}=require('./query-validator');
const turn=require('./turn-schema.json');
function validateClarification(response,catalog,entities,evidence=[]){
  const errors=[],fields=fieldMap(catalog);
  function partial(patch){
    const shapeErrors=schemaErrors(patch,turn.properties.patch);errors.push(...shapeErrors);if(shapeErrors.length)return;
    for(const id of patch.metrics||[])if(!catalog.metrics[id]||catalog.metrics[id].aggregation==='raw')errors.push('Clarification metric is not executable: '+id);
    for(const id of [...(patch.fields||[]),...(patch.filters||[]).map(f=>f.field),...(patch.groupBy||[]).map(g=>g.field)])if(!fields.has(id))errors.push('Clarification column not in catalog: '+id);
    if(patch.target){const t=patch.target;const found=entities.some(e=>t.kind==='brand'?e.kind==='product'&&e.value.startsWith('['+t.value+']'):e.kind===t.kind&&(e.value===t.value||e.aliases?.includes(t.value)));if(!found)errors.push('Clarification target not in catalog');}
  }
  partial(response.patch||{});
  const documents=JSON.stringify(evidence.map(e=>e.result));
  for(const option of response.options||[]){
    partial(option.patch);
    const ids=[...(option.patch.metrics||[]),...(option.patch.fields||[]),...(option.patch.filters||[]).map(f=>f.field),...(option.patch.target?[option.patch.target.value]:[])];
    if(!ids.length||ids.some(id=>!documents.includes(JSON.stringify(id))))errors.push('Option requires a matching catalog tool result; search before proposing candidates');
  }
  return errors;
}
module.exports={validateClarification};
