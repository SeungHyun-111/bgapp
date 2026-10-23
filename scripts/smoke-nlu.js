const assert = require('node:assert/strict');
const { RasaClient } = require('../src/commands/rasa-client');
const { Dialogue } = require('../src/commands/dialogue');
const client = new RasaClient();
async function main() {
  const examples = [
    ['홀베리 마진 몇 퍼센트인지 알려줄래?', 'get_commission_rate'],
    ['수수료율 좀 알려줄래 홀베리', 'get_commission_rate'],
    ['홀베리 수수료가 내려간 이유가 뭐야?', 'explain_commission_change'],
    ['그러면 지난달은?', 'change_period'],
    ['내일 점심 뭐 먹을까?', 'out_of_scope'],
    ['당근주스 취급액하고 한익은 얼마나 나왔어?', 'get_product_metric'],
    ['선일금고 분당혼합비 궁금한데', 'get_product_metric'],
    ['홀베리 대표업체명 좀 알려줄래?', 'get_product_metric'],
    ['이번달 상품 취급액이랑 한계이익 알려줘', 'get_product_metric'],
  ];
  for (const [input, expected] of examples) {
    const parsed = await client.parse(input);
    console.log(JSON.stringify({ input, intent: parsed.intent }));
    assert.equal(parsed.intent.name, expected);
  }
  const notes = [];
  const dialogue = new Dialogue({ nlu: client, store: { append: async input => { notes.push(input); return { id: 'smoke' }; } }, codes: () => ['[홀베리]당근주스','[홀베리]레몬즙'],queryMetric:async()=>({basis:'test',values:[{label:'마진',formattedValue:'32'}]}) });
  assert.match((await dialogue.execute('홀베리 마진 몇 퍼센트인지 알려줄래?')).message, /여러 개/);
  assert.match((await dialogue.execute('1')).message, /어느 기간/);
  assert.match((await dialogue.execute('지난달')).message, /마진: 32/);
  assert.equal(dialogue.state.product, '[홀베리]당근주스');
  assert.equal(dialogue.state.period, 'previous_month');
  console.log('실제 Rasa 모델 + 로컬 대화 연결 확인 완료');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => client.stop());
