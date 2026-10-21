const assert = require('node:assert/strict');
const { PowerBiBridge } = require('../src/power-bi-bridge');
const { searchDax, detailDax, extractRows } = require('../src/power-bi-search');
const main = require('../src/power-bi-visuals.json').visuals.find(v => v.filterContext === 'program-code');
const bridge = new PowerBiBridge({ onStatus: event => {
  if (event === 'sign-in') console.error('Complete Microsoft sign-in if prompted.');
} });
(async () => {
  try {
    const search = extractRows(await bridge.query(searchDax('[홀베리]당근주스')));
    const original = extractRows(await bridge.query(main.queryText));
    assert.deepEqual(search, original, 'Search must match the captured report table for this program.');
    const row = search.find(r => !r['[IsGrandTotalRowTotal]']);
    assert(row, 'Expected a broadcast row.');
    const worker = bridge.child.pid;
    const detail = extractRows(await bridge.query(detailDax(row)));
    assert.equal(detail.length, 1);
    for (let i = 0; i < 6; i++) assert('[card' + i + ']' in detail[0]);
    assert.equal(bridge.child.pid, worker);
    assert.equal(detail[0]['[card3]'], row['[v_전체_한계_분_]']);
    console.log(JSON.stringify({ pass: true, reportRows: search.length, detailCards: 6, sameWorker: true, matchingReportQuery: true }));
  } catch (error) { console.error('FAIL: ' + error.message); process.exitCode = 1; }
  finally { bridge.stop(); }
})();
