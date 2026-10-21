const assert = require('node:assert/strict');
const { PowerBiBridge } = require('../src/power-bi-bridge');
const { visualDax, searchFilter, extractRows } = require('../src/power-bi-search');
const bridge = new PowerBiBridge({ onStatus: event => {
  if (event === 'sign-in') console.error('Complete Microsoft sign-in if prompted.');
} });
(async () => {
  try {
    const filter = searchFilter('[홀베리]당근주스');
    for (const section of ['cards', 'year', 'month', 'hour', 'image']) {
      const dax = visualDax(section, filter);
      assert.equal((dax.match(/\bEVALUATE\b/g) || []).length, 1);
      const rows = extractRows(await bridge.query(dax));
      assert(rows.length > 0, section + ': expected data.');
      console.log(JSON.stringify({ section, rowCount: rows.length, pass: true }));
    }
  } catch (error) { console.error('FAIL: ' + error.message); process.exitCode = 1; }
  finally { bridge.stop(); }
})();
