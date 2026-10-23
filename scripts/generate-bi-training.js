const fs = require('fs');
const path = require('path');
const { metrics } = require('../src/commands/bi-metrics');
const annotate=(text,entity,value)=>`[${text}]${JSON.stringify({entity,value})}`;
const groups = new Map();
for (const metric of metrics) {
  const intent='query';
  if (!groups.has(intent)) groups.set(intent,new Set());
  for (const alias of metric.aliases) {
    const slot=annotate(alias,'metric',metric.id);
    groups.get(intent).add(`이번달 상품 ${slot} 알려줘`);
    groups.get(intent).add(`상품 ${slot} 궁금해`);
  }
}
const yaml='version: "3.1"\nnlu:\n'+[...groups].map(([intent,examples])=>`  - intent: ${intent}\n    examples: |\n`+[...examples].map(text=>'      - '+text+'\n').join('')).join('');
fs.writeFileSync(path.resolve(__dirname,'../nlu/data/bi-catalog.yml'),yaml,'utf8');
console.log('BI catalog training examples: ' + [...groups.values()].reduce((n,s)=>n+s.size,0));
