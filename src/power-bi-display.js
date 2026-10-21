const visuals = require('./power-bi-visuals.json').visuals;
const main = visuals.find(v => v.filterContext === 'program-code');
const fieldName = ref => ref.slice(ref.indexOf('[')+1,-1);
const metric = output => ({
  key: '['+output.alias+']', label: fieldName(output.references[0]),
  percent: output.references[0].includes('(%)'), expression: output.expression
});
const cards = visuals.filter(v => v.type === 'card').map((v,i) => ({...metric(v.outputs[0]), key:'[card'+i+']'}));
module.exports = {
  columns: [...main.groupingFields.map(ref=>({key:ref.replace(/^'BO'/,'BO'),label:fieldName(ref)})), ...main.outputs.map(metric)],
  metrics: main.outputs.map(metric), cards,
  year: visuals.find(v=>v.id==='4d44c16cb5cd964873d8').outputs.map(metric),
  month: visuals.find(v=>v.id==='f5c437d5797bbbbf2b46').outputs.map(metric),
  hour: visuals.find(v=>v.type==='pivotTable').outputs.map(metric)
};
