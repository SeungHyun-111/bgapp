// Reviewed examples only: never train on an inferred label automatically.
const fs = require('fs/promises');
const path = require('path');
const { QueryStore } = require('../src/commands/query-store');
const allowed = ['get_commission_rate','explain_commission_change','get_product_metric','change_period','out_of_scope'];
async function main() {
  const [id, intent] = process.argv.slice(2);
  if (!id || !allowed.includes(intent)) throw Error('사용법: npm run nlu:label -- 질문UUID ' + allowed.join('|'));
  const store = new QueryStore(path.resolve(__dirname, '../data'));
  const row = (await store.list()).find(item => item.id === id);
  if (!row) throw Error('질문 ID를 찾을 수 없습니다.');
  const file = path.resolve(__dirname, '../nlu/reviewed-examples.json');
  let document = { version: '3.1', nlu: [] };
  try { document = JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const all = document.nlu.flatMap(item => item.examples.split('\n').filter(line => line.startsWith('- ')).map(line => line.slice(2)));
  const example = row.input.replace(/[\r\n]+/g, ' ');
  if (/[\[\]{}]/.test(example)) throw Error('Rasa 개체 표기와 충돌할 수 있는 문자는 학습 파일에서 직접 검토해주세요.');
  if (all.includes(example)) throw Error('이미 검토된 예시입니다. 수정은 reviewed.yml에서 해주세요.');
  let group = document.nlu.find(item => item.intent === intent);
  if (!group) { group = { intent, examples: '' }; document.nlu.push(group); }
  group.examples += '- ' + example + '\n';
  await fs.writeFile(file, JSON.stringify(document, null, 2) + '\n', 'utf8');
  const yaml='version: "3.1"\nnlu:\n'+document.nlu.map(group=>`  - intent: ${group.intent}\n    examples: |\n`+group.examples.trimEnd().split('\n').map(line=>'      '+line+'\n').join('')).join('');
  await fs.writeFile(path.resolve(__dirname,'../nlu/data/reviewed.yml'),yaml,'utf8');
  console.log('학습 예시 추가 완료. npm run nlu:train 후 검증하고 앱을 다시 시작해주세요. 원문 및 미구현 상태는 유지합니다.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
