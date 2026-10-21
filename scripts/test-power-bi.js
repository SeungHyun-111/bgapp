const assert = require('node:assert/strict');
const { PowerBiBridge } = require('../src/power-bi-bridge');

const bridge = new PowerBiBridge({ onStatus: event => {
  if (event === 'sign-in') console.error('Microsoft sign-in may open. Complete it yourself; no password is read by this app.');
  if (event === 'signed-in') console.error('Signed in. Running DAX.');
} });

async function main() {
  try {
    const result = await bridge.query('EVALUATE ROW("test", 1)');
    assert.equal(result?.results?.[0]?.tables?.[0]?.rows?.[0]?.['[test]'], 1);
    console.log(JSON.stringify(result, null, 2));
    const worker = bridge.child.pid;
    const second = await bridge.query('EVALUATE ROW("test", 1)');
    assert.equal(second?.results?.[0]?.tables?.[0]?.rows?.[0]?.['[test]'], 1);
    assert.equal(bridge.child.pid, worker);
    console.log('PASS: app received test=1 twice using the same PowerShell sign-in session.');
  } catch (error) {
    console.error('FAIL: ' + error.message);
    process.exitCode = 1;
  } finally { bridge.stop(); }
}
main();
