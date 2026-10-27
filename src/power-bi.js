const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { PowerBiBridge } = require('./power-bi-bridge');
const { searchDax, extractRows, reportFilter, selectedFilter, visualDax, optionsDax, slicerFields } = require('./power-bi-search');
const schema = require('./power-bi-display');
const { RtdbQueryStore } = require('./commands/rtdb-query-store');
const { createCommandSystem } = require('./commands/handlers');
const { containsCredential } = require('./commands/privacy');
const { ProgramCodeIndex } = require('./program-code-index');
// Legacy disabled: const { RasaClient } = require('./commands/rasa-client');
// Legacy disabled: const { Dialogue } = require('./commands/dialogue');
// Legacy disabled: const { createMetricQuery } = require('./commands/bi-query');
const { EntityCatalog } = require('./commands/entity-catalog');

module.exports = function createPowerBi(options = {}) {
  const dataDirectory = options.dataDirectory || (app.isPackaged ? path.join(app.getPath('userData'), 'data') : path.join(__dirname, '../data'));
  const queryStore = new RtdbQueryStore(dataDirectory,{fetchImpl:(...args)=>require('electron').net.fetch(...args)});
  const codeIndex = new ProgramCodeIndex(path.join(dataDirectory, 'program-codes.json'));
// Legacy disabled:   const nlu = new RasaClient({idleMs:0});
  const nlu = {stop(){}}; // Legacy lifecycle compatibility; no local process.
  const entityCatalog = new EntityCatalog(path.join(dataDirectory,'bi-entity-catalog.json'));
  require('./planner/environment').loadEnvironment();
  const geminiUsage=require('./gemini/usage').createUsageTracker(dataDirectory);
// Legacy disabled:   const usePlanner=require('./planner/environment').useQwen();
// Legacy disabled:   const dialogue = usePlanner ? require('./planner/chat-dialogue').createPlannerDialogue({directory:dataDirectory,store:queryStore,onStatus:message=>status(message),onProgress:message=>{if(win&&!win.isDestroyed())win.webContents.send('bi:reply-progress',message);},query:async dax=>{try{return await bridge.query(dax);}finally{auth=false;}}}) : new Dialogue({ nlu, store: queryStore, codes: () => codeIndex.codes,
// Legacy disabled:     replies:require('./commands/reviewed-replies').createReviewedReplies(dataDirectory),getLocalEntities:()=>entityCatalog.entities,
// Legacy disabled:     getEntities: async () => {
// Legacy disabled:       status('하! BI의 실제 팀·상품 목록을 확인할게 🐰');
// Legacy disabled:       try { return await entityCatalog.ensure(bridge); } finally { auth=false; }
// Legacy disabled:     },
// Legacy disabled:     queryMetric: async request => {
// Legacy disabled:       status('하! BI에서 실제 값을 가져올게 🐰');
// Legacy disabled:       try { return await createMetricQuery(bridge)(request); } finally { auth = false; }
// Legacy disabled:     }
// Legacy disabled:   });
  const dialogue = require('./gemini/dialogue').createGeminiDialogue({
    directory:dataDirectory,store:queryStore,onStatus:message=>status(message),
    client:new (require('./gemini/client').GeminiClient)({usageTracker:geminiUsage}),
    executor:require('./gemini/analysis-engine').createExecutor({beforeQuery:()=>ensureLogin(),query:dax=>bridge.query(dax),onStatus:message=>status(message)})
  });
  const commands = createCommandSystem(queryStore, { dialogue });
  let refreshingCodes = null;
  let win = null, anchor = null, area = null, auth = false, rows = [], filter = null, generation = 0, petOwner = null, expanded = false;
  const pausePet = value => { if (petOwner && !petOwner.isDestroyed()) petOwner.webContents.send('pets:search-visible', value); };
  const status = message => { if (win && !win.isDestroyed()) win.webContents.send('bi:status', message); };
// Legacy disabled:   if(!usePlanner)setImmediate(()=>nlu.start().then(()=>status('규칙 · 로컬 NLU 준비 완료')).catch(()=>status('로컬 NLU 준비에 실패했어. 인사와 기본 안내는 계속 답할 수 있어.')));
  const reset = (notify = true) => {
    dialogue.reset();
    generation++; rows = []; filter = null; expanded = false;
    if (notify && win && !win.isDestroyed()) win.webContents.send('bi:reset');
  };
  const bridge = new PowerBiBridge({ onStatus: event => {
    if (event === 'sign-in') { auth = true; status('Microsoft 계정으로 로그인해주세요.'); }
    if (event === 'signed-in') { auth = false; status('Power BI 로그인 완료'); if (win?.isVisible()) win.focus(); }
  } });
  let authenticationPending=null;
  function ensureLogin(){
    if(authenticationPending)return authenticationPending;
    status('Power BI 로그인 상태를 확인하는 중이야 🐰');
    authenticationPending=bridge.ensureAuthenticated().then(result=>{
      if(!result?.authenticated)throw Error('Power BI 로그인을 완료하지 못했어.');
      status('Power BI 로그인 확인 완료 · 질문해줘 🐰');
      return result;
    }).catch(error=>{
      status('Power BI 로그인을 완료하지 못했어. 실제 BI 조회나 검색 시 다시 시도할게.');
      throw error;
    }).finally(()=>{auth=false;authenticationPending=null;});
    return authenticationPending;
  }
  const owner = event => win && !win.isDestroyed() && event.sender === win.webContents;
  ipcMain.handle('bi:gemini-usage',event=>owner(event)?geminiUsage.snapshot(dialogue.model):null);
  const stopUsageUpdates=geminiUsage.subscribe(()=>{if(win&&!win.isDestroyed())win.webContents.send('bi:gemini-usage-changed');});
  app.once('before-quit',stopUsageUpdates);
  function place(height) {
    if (!win || !area) return;
    const width = Math.min(expanded ? 1320 : 460, area.width), h = Math.min(height, area.height);
    const right = anchor.x + 84;
    const x = right + width <= area.x + area.width ? right : anchor.x - width - 8;
    win.setBounds({
      x: Math.max(area.x, Math.min(area.x + area.width - width, Math.round(x))),
      y: Math.max(area.y, Math.min(area.y + area.height - h, Math.round(anchor.y - h + 60))),
      width, height: h
    });
  }
  ipcMain.handle('bi:schema', event => owner(event) ? schema : null);
  ipcMain.handle('bi:engine',event=>owner(event)?{engine:dialogue.model,execution:'Power BI source data + app calculation'}:null);
  ipcMain.handle('bi:command', async (event, input) => {
    if (!owner(event)) return { error: '허용되지 않은 요청입니다.' };
    try {
      if (input?.mode === 'search') await ensureLogin();
      if (input?.mode !== 'search') status('Gemini API: interpreting question...');
      return await commands.execute(input?.text, { mode: input?.mode === 'search' ? 'search' : 'talk',requestId:typeof input?.requestId==='string'?input.requestId.slice(0,100):null });
    }
    catch(error) { return { error: error.message || '로그인 또는 대화 처리 중 문제가 생겼어.' }; }
  });
  ipcMain.handle('bi:suggestions', (event, value) => owner(event) ? { codes: codeIndex.suggest(value), count: codeIndex.codes.size } : { codes: [], count: 0 });
  ipcMain.handle('bi:refresh-codes', async event => {
    if (!owner(event)) return { error: '허용되지 않은 요청입니다.' };
    try {
      if (!refreshingCodes) refreshingCodes = codeIndex.refresh(bridge).finally(() => { refreshingCodes = null; });
      const result=await refreshingCodes;
      await entityCatalog.ensure(bridge,{force:true});
      return result;
    } catch { return { error: '편성코드 목록을 불러오지 못했어요. 로그인 상태를 확인하고 다시 시도해주세요.' }; }
    finally { auth = false; }
  });
  ipcMain.handle('bi:reset', event => { if (owner(event)) reset(false); });
  ipcMain.handle('bi:search', async (event, input) => {
    if (!owner(event)) return { error: '허용되지 않은 요청입니다.' };
    const current = ++generation;
    rows = []; filter = null;
    try {
      const keyword = typeof input === 'string' ? input : input?.keyword;
      if (typeof keyword !== 'string' || containsCredential(keyword)) throw Error('로그인 정보나 인증 정보는 검색하지 않습니다.');
      const filters = typeof input === 'string' ? {} : (input?.filters || {});
      const dax = searchDax(keyword, filters);
      const nextFilter = reportFilter(keyword, filters);
      const result = extractRows(await bridge.query(dax));
      if (current !== generation) return { stale: true };
      const choices = extractRows(await bridge.query(optionsDax(keyword)));
      if (current !== generation) return { stale: true };
      const options = Object.fromEntries(Object.entries(slicerFields).map(([key, field]) => [key, [...new Set(choices.map(row => row['BO['+field+']']).filter(value => value != null).map(String))].sort((a,b)=>a.localeCompare(b,'ko'))]));
      await codeIndex.add(options.program).catch(() => {});
      rows = result.filter(row => !row['[IsGrandTotalRowTotal]']);
      filter = nextFilter;
      return { searchId: current, rows, options, optionsLimited: choices.length >= 1001, total: result.find(row => row['[IsGrandTotalRowTotal]']) || null, limited: rows.length >= 501 };
    } catch (error) { return current === generation ? { error: error.message } : { stale: true }; }
    finally { auth = false; }
  });
  ipcMain.handle('bi:visual', async (event, input) => {
    if (!owner(event) || !filter || input?.searchId !== generation) return { stale: true };
    const current = generation;
    try {
      const context = input.index == null ? filter : (Number.isInteger(input.index) && rows[input.index] ? selectedFilter(rows[input.index]) : null);
      if (!context) return { error: '방송 항목을 다시 선택해주세요.' };
      const result = extractRows(await bridge.query(visualDax(input.section, context)));
      return current === generation ? { rows: result } : { stale: true };
    } catch (error) { return current === generation ? { error: error.message } : { stale: true }; }
    finally { auth = false; }
  });
  ipcMain.on('bi:hide', event => { if (owner(event)) win.hide(); });
  ipcMain.on('bi:resize', (event, input) => {
    if (!owner(event)) return;
    const height = typeof input === 'number' ? input : input?.height;
    if (Number.isFinite(height)) {
      expanded = typeof input === 'number' ? height > 300 : Boolean(input.expanded);
      place(Math.max(210,Math.min(900,Math.ceil(height))));
    }
  });
  function open(pet, point = {}) {
    if (petOwner === pet && win && !win.isDestroyed() && win.isVisible()) { win.hide(); return; }
    if (petOwner !== pet) { pausePet(false); petOwner = pet; }
    const bounds = pet.getBounds();
    anchor = { x: bounds.x + (Number.isFinite(point?.x) ? point.x : 100), y: bounds.y + (Number.isFinite(point?.y) ? point.y : 100) };
    area = screen.getDisplayNearestPoint(anchor).workArea;
    if (win && !win.isDestroyed()) {
      place(win.getBounds().height); win.setAlwaysOnTop(pet.isAlwaysOnTop()); win.show(); win.focus(); win.webContents.send('bi:focus');
      return;
    }
    win = new BrowserWindow({
      width: 780, height: 230, frame: false, transparent: true, hasShadow: false,
      resizable: false, skipTaskbar: true, show: false, alwaysOnTop: pet.isAlwaysOnTop(),
      title: '우사기 실적 검색', backgroundColor: '#00000000',
      webPreferences: { preload: path.join(__dirname,'power-bi-preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true }
    });
    win.setMenu(null); place(230);
    win.on('show', () => pausePet(true));
    win.on('hide', () => pausePet(false));
    win.once('ready-to-show', () => { win.show(); win.focus(); });
    // Keep the conversation visible during screenshots and other focus changes.
    // Close explicitly through the pet toggle, the close button or window close.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.on('close', event => { event.preventDefault(); win.hide(); });
    win.on('closed', () => { win = null; });
    win.loadFile(path.join(__dirname,'renderer/power-bi.html'));
  }
  const stop = () => { pausePet(false); dialogue.stop?.(); nlu.stop(); bridge.stop(); if (win && !win.isDestroyed()) win.destroy(); };
  app.once('before-quit',stop);
  // startPets creates this service at app startup. Begin sign-in once without
  // waiting for the chat window or blocking ordinary Gemini conversation.
  // A BI request arriving during sign-in shares authenticationPending.
  ensureLogin().catch(()=>{});
  return { open, stop };
};
