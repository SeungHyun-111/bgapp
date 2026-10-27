const fs=require('fs');
const path=require('path');
const {createHash}=require('crypto');
function loadCatalog(file=path.resolve(__dirname,'../../new-bi-catalog.json')){
  const master=JSON.parse(fs.readFileSync(file,'utf8'));
  // Fixed projection of ALL choices, independent of the user's question.
  const omit=new Set(['provenance','referenceEvidence','workStatus','evidenceRetention','typeEvidence','source','sourceQueries','evidence','masterFile','file','sourceColumn']);
  function compact(value){
    if(Array.isArray(value))return value.map(compact);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!omit.has(key)).map(([key,v])=>[key,compact(v)]));
    return value;
  }
  const catalog=compact({version:master.version,fields:master.fields,metrics:master.metrics,
    entities:master.entities,dimensions:master.dimensions,businessRules:master.businessRules,
    denominatorConflict:master.denominatorConflict,formulaContract:master.formulaContract,
    unresolved:master.unresolved,runtimeCapabilities:master.runtimeCapabilities,
    geminiResponseContract:master.geminiResponseContract});
  return {catalog,version:createHash('sha256').update(JSON.stringify(catalog)).digest('hex'),masterVersion:master.version};
}
module.exports={loadCatalog};
