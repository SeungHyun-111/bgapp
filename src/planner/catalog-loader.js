const fs=require('fs');
const path=require('path');
const additions=require('./catalog-additions.json');
function extendPlannerCatalog(catalog){
  for(const [id,metric] of Object.entries(additions.metrics)){
    if(catalog.metrics[id]&&JSON.stringify(catalog.metrics[id])!==JSON.stringify(metric))throw Error('Conflicting planner metric definition: '+id);
    catalog.metrics[id]=structuredClone(metric);
  }
  for(const [id,extension] of Object.entries(additions.metricExtensions||{})){
    const metric=catalog.metrics[id];if(!metric)continue;
    metric.aliases=[...new Set([...(metric.aliases||[]),...(extension.aliases||[])])];
    metric.calculation=structuredClone(extension.calculation);
    // Replace stale capture-era scope prose with the current structured definition.
    metric.definition={...metric.definition,denominator:extension.calculation.description};
  }
  return catalog;
}
function loadPlannerCatalog(directory){
  const catalog=extendPlannerCatalog(JSON.parse(fs.readFileSync(path.join(directory,'bi-catalog.json'),'utf8')));
  const file=path.join(directory,'training/decisions.json');
  catalog.businessDefinitions=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')).facts:[];
  return catalog;
}
module.exports={loadPlannerCatalog,extendPlannerCatalog};
