const path = require('path');
const { ProgramCodeIndex } = require('../src/program-code-index');
const { PowerBiBridge } = require('../src/power-bi-bridge');
const bridge = new PowerBiBridge({ onStatus: event => { if (event === 'sign-in') console.error('Complete Microsoft sign-in if prompted.'); } });
(async () => {
  try { console.log(JSON.stringify(await new ProgramCodeIndex(path.join(__dirname, '../data/program-codes.json')).refresh(bridge))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { bridge.stop(); }
})();
