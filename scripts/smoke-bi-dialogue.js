const { PowerBiBridge } = require('../src/power-bi-bridge');
const { createMetricQuery } = require('../src/commands/bi-query');
const { extractRows } = require('../src/power-bi-search');
const { RasaClient } = require('../src/commands/rasa-client');
const { Dialogue } = require('../src/commands/dialogue');
const assert = require('node:assert/strict');
const nlu = new RasaClient();
const bridge = new PowerBiBridge({onStatus:event => { if (event === 'sign-in') console.log('BI 로그인 창에서 직접 로그인해주세요.'); }});
async function main() {
  const rows = extractRows(await bridge.query("EVALUATE TOPN(1, SUMMARIZE('BO', 'BO'[방송일시], 'BO'[편성코드]), 'BO'[방송일시], DESC, 'BO'[편성코드], ASC)"));
  const row = rows[0];
  if (!row) throw Error('BI에 방송 데이터가 없습니다.');
  const product = row['BO[편성코드]'];
  console.log(JSON.stringify({latestBroadcast:row['BO[방송일시]'],product}));
  const result = await createMetricQuery(bridge)({product,metrics:['sales','orders','profit','mix_per_minute','commission_rate','column:대표상품명'],period:'current_month'});
  console.log(JSON.stringify(result));
  const dialogue = new Dialogue({nlu,store:{append:async ()=>({id:'smoke'})},codes:()=>[product],queryMetric:createMetricQuery(bridge)});
  const answer = await dialogue.execute(`이번달 ${product} 취급액이랑 한계이익 알려줘`);
  console.log(answer.message);
  assert.match(answer.message, /찾았다!/);
  assert.match(answer.message, /예상취급액/);
  assert.match(answer.message, /한계이익/);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>{nlu.stop();bridge.stop();});
