const fs=require('fs');
const path=require('path');
const additions=require('./catalog-additions.json');
function loadPlannerCatalog(directory){
  const catalog=JSON.parse(fs.readFileSync(path.join(directory,'bi-catalog.json'),'utf8'));
  for(const [id,metric] of Object.entries(additions.metrics)){
    if(catalog.metrics[id]&&JSON.stringify(catalog.metrics[id])!==JSON.stringify(metric))throw Error('Conflicting planner metric definition: '+id);
    catalog.metrics[id]=structuredClone(metric);
  }
  const file=path.join(directory,'training/decisions.json');
  catalog.businessDefinitions=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')).facts:[];
  return catalog;
}
module.exports={loadPlannerCatalog};
