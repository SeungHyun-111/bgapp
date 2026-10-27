const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs/promises');
const os=require('os');
const path=require('path');
const vm=require('vm');
const {createRequire}=require('module');
const {EventEmitter}=require('events');
const {QueryStore}=require('../src/commands/query-store');

async function fixture(t,{authenticate=async()=>({authenticated:true})}={}){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'usagi-auth-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const handles=new Map(),windows=[],events=[],answers=[];
  const ipcMain=new EventEmitter();ipcMain.handle=(name,handler)=>handles.set(name,handler);
  class Window extends EventEmitter{
    constructor(){super();this.visible=false;this.webContents=new EventEmitter();this.webContents.send=()=>{};this.webContents.setWindowOpenHandler=()=>{};windows.push(this);}
    isDestroyed(){return false;}
    isVisible(){return this.visible;}
    show(){this.visible=true;this.emit('show');}
    hide(){this.visible=false;this.emit('hide');}
    setMenu(){} setBounds(){} setAlwaysOnTop(){} focus(){} loadFile(){} destroy(){}
    getBounds(){return {height:230};}
  }
  class Bridge{
    async ensureAuthenticated(){events.push('auth');return authenticate();}
    async query(){events.push('query');return {results:[{tables:[{rows:[]}]}]};}
    stop(){}
  }
  class Client{
    model='test';
    async create(args){
      if(JSON.parse(args.input).kind==='BASE')return {id:'base',output:{ready:true}};
      assert(args.responseSchema);
      assert(answers.length,'unexpected Gemini request');
      return {id:'response-'+Math.random(),output:answers.shift()};
    }
  }
  const file=path.resolve(__dirname,'../src/power-bi.js');
  const originalRequire=createRequire(file);
  const dependencies={
    electron:{app:Object.assign(new EventEmitter(),{isPackaged:false}),BrowserWindow:Window,ipcMain,screen:{getDisplayNearestPoint:()=>({workArea:{x:0,y:0,width:1920,height:1080}})}},
    './power-bi-bridge':{PowerBiBridge:Bridge},
    './commands/rtdb-query-store':{RtdbQueryStore:QueryStore},
    './gemini/client':{GeminiClient:Client},
    './gemini/usage':{createUsageTracker:()=>({subscribe:()=>()=>{},snapshot:()=>({})})},
    './planner/environment':{loadEnvironment(){}},
  };
  const module={exports:{}};
  const load=vm.runInThisContext('(function(require,module,exports,__dirname){'+await fs.readFile(file,'utf8')+'\n})',{filename:file});
  load(name=>Object.hasOwn(dependencies,name)?dependencies[name]:originalRequire(name),module,module.exports,path.dirname(file));
  const instance=module.exports({dataDirectory:directory});
  t.after(()=>instance.stop());
  const startupEvents=[...events];
  await new Promise(setImmediate);
  const pet={isDestroyed:()=>false,isAlwaysOnTop:()=>false,getBounds:()=>({x:0,y:0}),webContents:{send(){}}};
  instance.open(pet);
  const window=windows[0];window.emit('ready-to-show');
  return {events,startupEvents,answers,instance,pet,command:input=>handles.get('bi:command')({sender:window.webContents},input)};
}
const reply=(action='reply',overrides={})=>({action,conversation:{mode:'continue',reset:false},message:'안녕',plan:null,responseTemplate:null,...overrides});

test('app startup authenticates once before opening; reopening and ordinary conversation do not reauthenticate',async t=>{
  const f=await fixture(t);
  assert.deepEqual(f.startupEvents,['auth']);
  f.instance.open(f.pet); // hide
  f.instance.open(f.pet); // reopen
  for(const [question,answer] of [['너 제미나이 맞냐?',reply()],['안녕',reply()],['가전 가중분',reply('clarify',{message:'어느 기간?'})]]){
    f.answers.push(answer);
    const result=await f.command({text:question});
    assert.equal(result.loggingError,false);
    assert.equal(result.message,answer.message);
  }
  assert.deepEqual(f.events,['auth']);
});

test('execute IPC authenticates immediately before BI, once for multiple datasets; search still authenticates',async t=>{
  const f=await fixture(t);
  const period={start:'2026-09-01',endExclusive:'2026-10-01',timezone:'Asia/Seoul'};
  f.answers.push(reply('execute',{message:null,plan:{datasets:[{id:'a',period},{id:'b',period}],calculations:[{id:'count',formula:{operator:'count'}}]},responseTemplate:'{{value}}'}));
  const result=await f.command({text:'9월 방송 건수'});
  assert.equal(result.loggingError,false);
  assert.deepEqual(f.events,['auth','auth','query','query']);
  f.answers.push(reply());
  await f.command({text:'고마워'});
  assert.deepEqual(f.events,['auth','auth','query','query']);
  const search=await f.command({text:'가전',mode:'search'});
  assert.equal(search.kind,'search');
  assert.deepEqual(f.events,['auth','auth','query','query','auth']);
});

test('startup sign-in failure leaves ordinary chat available and retries on BI search',async t=>{
  let attempts=0;
  const f=await fixture(t,{authenticate:async()=>{
    if(attempts++===0)throw Error('startup login cancelled');
    return {authenticated:true};
  }});
  f.answers.push(reply());
  const conversation=await f.command({text:'안녕'});
  assert.equal(conversation.message,'안녕');
  assert.deepEqual(f.events,['auth']);
  const search=await f.command({text:'가전',mode:'search'});
  assert.equal(search.kind,'search');
  assert.deepEqual(f.events,['auth','auth']);
});
