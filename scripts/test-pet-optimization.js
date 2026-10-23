const test=require('node:test');
const assert=require('node:assert/strict');
const {compactOrigin,COMPACT_WIDTH,COMPACT_HEIGHT}=require('../src/pet-geometry');
const {RasaClient}=require('../src/commands/rasa-client');
test('compact viewport preserves world hit coordinates at all screen edges',()=>{
  const area={width:1920,height:1032};
  for(const [x,y] of [[0,28],[1900,1000],[900,500],[20,40]]){
    const origin=compactOrigin(x,y,area);
    assert(origin.x>=0&&origin.x+COMPACT_WIDTH<=area.width);
    assert(origin.y>=0&&origin.y+COMPACT_HEIGHT<=area.height);
    assert.equal((x-origin.x)+origin.x,x);assert.equal((y-origin.y)+origin.y,y);
  }
});
test('NLU idle eviction waits for active work and starts again on next question',async()=>{
  const client=new RasaClient({idleMs:20});let starts=0,kills=0,resolveRequest;
  client.start=async()=>{if(!client.child){starts++;client.child={kill:()=>{kills++;}};}};
  client.request=async()=>new Promise(resolve=>{resolveRequest=resolve;});
  const pending=client.parse('test');
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(kills,0);resolveRequest({intent:'ok'});await pending;
  await new Promise(resolve=>setTimeout(resolve,35));assert.equal(kills,1);assert.equal(client.child,null);
  client.request=async()=>({intent:'ok'});await client.parse('again');assert.equal(starts,2);client.stop();
});
