const assert = require('node:assert/strict');
const { PowerBiBridge } = require('../src/power-bi-bridge');
const { searchDax, reportFilter, optionsDax, visualDax, extractRows, slicerFields } = require('../src/power-bi-search');
const bridge = new PowerBiBridge({ onStatus: event => {
  if (event === 'sign-in') console.error('Complete Microsoft sign-in if prompted.');
} });
(async () => {
  try {
    const keyword = '[선일금고]스페셜에디션';
    const rows = extractRows(await bridge.query(searchDax(keyword)));
    const options = extractRows(await bridge.query(optionsDax(keyword)));
    assert(options.length > 0);
    const filters = Object.fromEntries(Object.entries(slicerFields).map(([key, field]) => [key, String(options[0]['BO['+field+']'] ?? '')]));
    const filtered = extractRows(await bridge.query(searchDax(keyword, filters)));
    assert(filtered.some(row => !row['[IsGrandTotalRowTotal]']));
    for (const section of ['cards', 'year', 'month', 'hour', 'image']) {
      const values = extractRows(await bridge.query(visualDax(section, reportFilter(keyword, filters))));
      console.log(JSON.stringify({ section, rows: values.length, pass: true }));
    }
    console.log(JSON.stringify({ pass: true, reportRows: rows.length, optionCombinations: options.length, filteredRows: filtered.length }));
  } catch (error) { console.error('FAIL: '+error.message); process.exitCode = 1; }
  finally { bridge.stop(); }
})();
