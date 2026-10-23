const path = require('path');
const { QueryStore } = require('../src/commands/query-store');
const store = new QueryStore(path.join(__dirname, '../data'));
(async () => {
  try {
    if (process.argv[2] === 'converted') {
      await store.markConverted(process.argv[3], process.argv[4]);
      console.log('Converted status appended. Original learning note preserved.');
    } else {
      const mode=process.argv[2]||'pending';
      if(!['pending','reviewed','all','unhandled','trained'].includes(mode))throw Error('Use pending, reviewed, all, unhandled or trained');
      const records=mode==='unhandled'?await store.list():await store.conversations({review:mode==='pending'?'unreviewed':mode==='reviewed'?'reviewed':'all',training:mode==='trained'?'used':'all'});
      console.log(JSON.stringify(records,null,2));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
})();
