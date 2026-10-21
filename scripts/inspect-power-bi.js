const fs = require('fs');
const path = require('path');
const { PowerBiBridge } = require('../src/power-bi-bridge');
const modelPath = path.join(__dirname, '../src/power-bi-model.json');
const bridge = new PowerBiBridge({ onStatus: event => {
  if (event === 'sign-in') console.error('Complete Microsoft sign-in if prompted.');
} });

async function main() {
  try {
    const response = await bridge.query("EVALUATE SAMPLE(1, 'BO', 1)");
    const rows = response?.results?.[0]?.tables?.[0]?.rows;
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Expected one BO sample row.');
    const columns = Object.keys(rows[0]).map(key => {
      const match = key.match(/^BO\[(.*)\]$/s);
      if (!match) throw new Error('Unexpected column identifier.');
      return { name: match[1], reference: key };
    });
    const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
    model.metadataStatus = 'BO-columns-observed';
    model.inspectedAt = new Date().toISOString();
    model.tables = [...model.tables.filter(table => table.name !== 'BO'), {
      name: 'BO', source: 'executeQueries:SAMPLE(1)', columns,
      note: 'Observed column names only. Types, measures, and relationships are not inferred.'
    }];
    fs.writeFileSync(modelPath, JSON.stringify(model, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify({ table: 'BO', columnCount: columns.length, columns: columns.map(c => c.name) }, null, 2));
  } catch (error) { console.error('FAIL: ' + error.message); process.exitCode = 1; }
  finally { bridge.stop(); }
}
main();
