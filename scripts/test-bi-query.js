const test = require('node:test');
const assert = require('node:assert/strict');
const { buildQuery, periodBounds, createMetricQuery } = require('../src/commands/bi-query');
const { detectMetrics } = require('../src/commands/bi-metrics');
const { metrics } = require('../src/commands/bi-metrics');
const model = require('../src/power-bi-model.json');
test('all 127 BO columns are selectable and margin uses the explicitly confirmed field', () => {
  const columns = model.tables.find(t=>t.name==='BO').columns;
  assert.equal(columns.length,127);
  for (const column of columns) {
    const m=metrics.find(item=>item.column===column.name);
    assert(m,column.name);
    assert(detectMetrics(`상품 ${column.name} 알려줘`).includes(m.id),'field extraction: '+column.name);
    const plan=buildQuery({product:'상품',metrics:[m.id],period:'current_month'});
    assert((plan.dax+(plan.detailDax||'')).includes("'BO'["+column.name+']'),column.name);
  }
  assert.equal(metrics.find(m=>m.id==='commission_rate').column,'(전체/방송중)제휴포인트');
  assert.deepEqual(detectMetrics('홀베리 마진 알려줘'),['commission_rate']);
  assert.deepEqual(detectMetrics('분당혼합비 알려줘'),['mix_per_minute']);
});
test('metric extraction keeps specific targets separate and supports multiple metrics', () => {
  assert.deepEqual(detectMetrics('목표취급액과 한계이익 알려줘'), ['target_sales','profit']);
  assert.deepEqual(new Set(detectMetrics('홀베리 취급액이랑 주문량')), new Set(['orders','sales']));
});
test('Korean month boundaries include year rollover independently of host timezone', () => {
  const now = new Date('2025-12-31T15:01:00Z');
  assert.deepEqual(periodBounds('current_month',now), {start:'DATE(2026,1,1)',end:'DATE(2026,2,1)',label:'2026년 1월'});
  assert.equal(periodBounds('previous_month',now).start,'DATE(2025,12,1)');
});
test('DAX only uses registered metrics, exact escaped product and bounded dates', () => {
  const p = buildQuery({product:'상품" OR TRUE()', metrics:['sales','mix_per_minute'],period:'current_month'},new Date('2026-10-22T00:00:00Z'));
  assert(p.dax.includes('상품"" OR TRUE()'));
  assert(p.dax.includes("'BO'[편성코드] ="));
  assert(p.dax.includes("SUM('BO'[(전체)예상취급액])"));
  assert(p.dax.includes('"metric1", \'BO\'[분당혼합비]'));
  assert.throws(()=>buildQuery({product:'a',metrics:['user DAX'],period:'current_month'}));
});
test('empty, zero and missing values remain distinguishable', async () => {
  const rows = value => ({results:[{tables:[{rows:[value]}]}]});
  const request = {product:'상품',metrics:['sales','orders'],period:'current_month'};
  let response = rows({'[matchedRows]':2,'[metric0]':0,'[metric1]':null});
  const query = createMetricQuery({query:async ()=>response});
  const result = await query(request);
  assert.equal(result.values[0].formattedValue,'0원');
  assert.equal(result.values[1].formattedValue,'값 없음');
  response = rows({'[matchedRows]':0});
  assert.equal((await query(request)).empty,true);
});
