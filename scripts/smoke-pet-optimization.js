const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('path');
const assert=require('node:assert/strict');
let windows=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
  try {
    ipcMain.handle('schedule:load',()=>({items:[]}));
    ipcMain.handle('pets:team-performance',()=>({teams:[]}));
    ipcMain.handle('pets:momonga-report',()=>({products:[]}));
    for(const layer of ['usagi','friends']) {
      const win=new BrowserWindow({width:layer==='usagi'?120:800,height:layer==='usagi'?164:600,show:false,frame:false,
        webPreferences:{preload:path.resolve(__dirname,'../src/pets-preload.js'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
      windows.push(win);
      win.webContents.on('console-message',(_e,_l,message)=>{if(/PETS_.*FAILED|PETS_FRAME_ERROR/.test(message))console.error(message);});
      await win.loadFile(path.resolve(__dirname,'../src/renderer/pets.html'),{query:{layer,worldWidth:'1920',worldHeight:'1032'}});
      for(let attempt=0;attempt<30;attempt++) {if(await win.webContents.executeJavaScript('initialized'))break;await delay(100);}
      await win.webContents.executeJavaScript('renderFrame(performance.now())');
      const state=await win.webContents.executeJavaScript('({initialized,count:pets.length,cells:pets.map(p=>p.cellW),width:canvas.width,height:canvas.height,viewport,setsLoaded:sets.filter(s=>s.frames).length})');
      assert(state.initialized);assert.equal(state.count,layer==='usagi'?1:7);assert(state.cells.every(s=>s<=192));
      const hasPixels=await win.webContents.executeJavaScript('ctx.getImageData(0,0,canvas.width,canvas.height).data.some((value,index)=>index%4===3&&value>0)');
      assert(hasPixels,'Sprite canvas should contain visible pixels');
      if(layer==='usagi')assert(state.width<=240&&state.height<=328);
      assert.equal(state.setsLoaded,0);
      win.webContents.send('pets:paused',true);await delay(50);
      assert(await win.webContents.executeJavaScript('renderPaused&&frameRequest===0'));
      win.webContents.send('pets:paused',false);await delay(50);
      assert(await win.webContents.executeJavaScript('!renderPaused&&frameRequest>0'));
      if(layer==='friends') {
        await win.webContents.executeJavaScript('loadShared(sets[0]); sets[0].loading');
        assert(await win.webContents.executeJavaScript('sets[0].frames.length===9'));
        await win.webContents.executeJavaScript('releaseShared(sets[0])');
        assert(await win.webContents.executeJavaScript('sets[0].frames===null'));
      }
      console.log(JSON.stringify({layer,...state,pass:true}));
      win.destroy();
    }
  } catch(error){console.error(error.stack);process.exitCode=1;}
  finally{for(const win of windows)if(!win.isDestroyed())win.destroy();app.exit(process.exitCode||0);}
});
