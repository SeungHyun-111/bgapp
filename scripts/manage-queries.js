const path = require('path');
const { QueryStore } = require('../src/commands/query-store');
const store = new QueryStore(path.join(__dirname, '../data'));
(async () => {
  try {
    if (process.argv[2] === 'converted') {
      await store.markConverted(process.argv[3], process.argv[4]);
      console.log('Converted status appended. Original learning note preserved.');
    } else console.log(JSON.stringify(await store.list(), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
})();
