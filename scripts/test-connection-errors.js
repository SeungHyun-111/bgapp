const test=require('node:test');
const assert=require('node:assert/strict');
const {connectionMessage}=require('../src/commands/connection-errors');
const {Dialogue}=require('../src/commands/dialogue');
test('errors distinguish local engine, BI auth, permission, query and unknown failures',()=>{
  assert.match(connectionMessage({code:'NLU_START_TIMEOUT'},'nlu'),/ローカル|로컬 엔진.*90초/);
  assert.match(connectionMessage({code:'BI_AUTH_REQUIRED'},'query'),/인증/);
  assert.match(connectionMessage({code:'BI_PERMISSION_DENIED'},'query'),/접근을 거부/);
  assert.match(connectionMessage({code:'BI_QUERY_ERROR'},'query'),/조회문/);
  assert.match(connectionMessage({code:'BI_TIMEOUT'},'query'),/대기 시간/);
  assert.match(connectionMessage({},'query'),/로그인 문제인지는 확인되지/);
});
test('local engine failure never reaches BI and reports the failed stage',async()=>{
  let queried=false;
  const dialogue=new Dialogue({nlu:{parse:async()=>{throw {code:'NLU_START_TIMEOUT'};}},store:{append:async()=>({id:'x'})},queryMetric:async()=>{queried=true;}});
  const answer=await dialogue.execute('헬스푸드팀 월별 가중분');
  assert.match(answer.message,/로컬 엔진.*90초/);assert.equal(queried,false);
});
