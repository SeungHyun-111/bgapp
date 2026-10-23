const test = require('node:test');
const assert = require('node:assert/strict');
const { Dialogue } = require('../src/commands/dialogue');
const { createCommandSystem } = require('../src/commands/handlers');
function fixture() {
  const records = []; let calls = 0;
  const store = { append: async input => { records.push(input); return { id: String(records.length) }; } };
  let intent = 'get_commission_rate', confidence = 0.95;
  const nlu = { parse: async () => { calls++; return { intent: { name: intent, confidence }, intent_ranking: [{ name: intent, confidence }, { name: 'out_of_scope', confidence: 0.02 }] }; } };
  const dialogue = new Dialogue({ nlu, store, codes: () => ['[홀베리]당근주스','[홀베리]레몬즙','[선일금고]스페셜에디션'], queryMetric: async () => ({basis:'지난달 방송별 원본',values:[{label:'마진',formattedValue:'32'}]}) });
  return { dialogue, records, store, calls: () => calls, classify: (name, score = 0.95) => { intent = name; confidence = score; } };
}
test('product selection and period followup route to the user-confirmed margin mapping', async () => {
  const f = fixture();
  assert.match((await f.dialogue.execute('홀베리 수수료 몇프로인데?')).message, /여러 개/);
  f.classify('nlu_fallback', 0.2);
  assert.match((await f.dialogue.execute('당근주스')).message, /어느 기간/);
  assert.equal(f.dialogue.state.product, '[홀베리]당근주스');
  assert.match((await f.dialogue.execute('지난달')).message, /마진: 32/);
  assert.equal(f.dialogue.state.period, 'previous_month');
  assert.equal(f.records.length, 0);
});
test('causes, unsupported dates and unrelated questions are not lookups', async () => {
  const f = fixture();
  for (const input of ['홀베리 수수료 왜 내려갔어','홀베리 오늘 수수료']) {
    assert.equal((await f.dialogue.execute(input)).saved, true);
    assert.equal(f.dialogue.state.metric, undefined);
  }
  await f.dialogue.execute('홀베리 마진');
  f.classify('out_of_scope');
  assert.equal((await f.dialogue.execute('홀베리 날씨 이상해')).saved, true);
});
test('credential inputs are rejected before local engine; search path stays intact', async () => {
  const f = fixture(), commands = createCommandSystem(f.store, { dialogue: f.dialogue });
  assert.equal((await commands.execute('password secret', { mode: 'talk' })).blocked, true);
  assert.equal(f.calls(), 0); assert.equal(f.records.length, 0);
  assert.equal((await commands.execute('홀베리 실적', { mode: 'search' })).kind, 'search');
});
test('reset and expiry remove product and metric context', async () => {
  const f = fixture();
  await f.dialogue.execute('선일금고 수수료');
  f.dialogue.reset(); assert.deepEqual(f.dialogue.state, {});
  f.dialogue.state = { product: 'old', metric: 'commission_rate' };
  f.dialogue.lastActivity = 1;
  f.classify('change_period');
  assert.match((await f.dialogue.execute('지난달')).message, /팀이나 상품/);
  assert.equal(f.dialogue.state.product, undefined);
});
test('multiple BI metrics, metric switch and period followups use structured requests', async () => {
  const requests = [];
  const nlu = { parse:async () => ({intent:{name:'get_product_metric',confidence:0.99}}) };
  const dialogue = new Dialogue({nlu,store:{append:async ()=>({id:'x'})},codes:()=>['[홀베리]당근주스'],queryMetric:async request=>{
    requests.push(request); return {basis:'2026년 10월',values:[{label:'취급액',formattedValue:'100원'}]};
  }});
  assert.match((await dialogue.execute('이번달 홀베리 취급액이랑 한계이익')).message,/100원/);
  assert.deepEqual(new Set(requests[0].metrics),new Set(['sales','profit']));
  await dialogue.execute('그럼 지난달은?');
  assert.equal(requests[1].period,'previous_month');
  assert.equal(requests[1].product,'[홀베리]당근주스');
  await dialogue.execute('주문량은?');
  assert.deepEqual(requests[2].metrics,['orders']);
  assert.equal(requests[2].period,'previous_month');
});
test('verified product and named BI fields can route despite unknown-product classifier fallback', async () => {
  const requests=[];
  const dialogue=new Dialogue({nlu:{parse:async()=>({intent:{name:'nlu_fallback',confidence:0.65},intent_ranking:[{name:'out_of_scope',confidence:0.4}]})},
    store:{append:async()=>({id:'x'})},codes:()=>['[바디앤]EMS괄사마사지'],queryMetric:async request=>{
      requests.push(request);return {basis:'test',values:[{label:'취급액',formattedValue:'100원'}]};
    }});
  assert.match((await dialogue.execute('이번달 [바디앤]EMS괄사마사지 취급액 알려줘')).message,/100원/);
  assert.equal(requests[0].product,'[바디앤]EMS괄사마사지');
  assert.equal((await dialogue.execute('[바디앤]EMS괄사마사지 취급액 왜 내려갔어')).saved,true);
  assert.equal(requests.length,1);
});
