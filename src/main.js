const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, shell } = require('electron');
const fs = require('fs');
const path = require('path');
require('./planner/environment').loadEnvironment();
const startPets = require('./pets');
const { loadSchedule, refreshFutureOpsVersions, searchRemainingSchedules, refreshGlobalPerformance, searchPerformanceHistory, searchCompetitorInfo, warmPerformanceCache, getPerformanceCacheStatus, configureCacheDirectory, getRtdbProjects } = require('./schedule');

let mainWindow;
let floatingWindow;
let performanceWindow;
let searchWindow;
let historyWindow;
let competitorWindow;
let tray;
let saveTimer;
let floatingSaveTimer;
let performanceSaveTimer;
let searchSaveTimer;
let historySaveTimer;
let competitorSaveTimer;

app.setAppUserModelId('BroadcastOverlayWidget');

function enableAutoLaunch() {
  const isPackaged = app.isPackaged;
  app.setLoginItemSettings({
    name: 'BroadcastOverlayWidget',
    openAtLogin: true,
    path: process.execPath,
    args: isPackaged ? [] : [app.getAppPath()]
  });
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
}

function getStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function getFloatingStatePath() {
  return path.join(app.getPath('userData'), 'floating-window-state.json');
}

function getSearchStatePath() {
  return path.join(app.getPath('userData'), 'search-window-state.json');
}

function getPerformanceStatePath() {
  return path.join(app.getPath('userData'), 'performance-window-state.json');
}

function getHistoryStatePath() {
  return path.join(app.getPath('userData'), 'history-window-state.json');
}

function getCompetitorStatePath() {
  return path.join(app.getPath('userData'), 'competitor-window-state.json');
}

function getDefaultBounds() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const panelWidth = 476;
  const panelHeight = Math.max(560, height - 24);

  return {
    width: panelWidth,
    height: panelHeight,
    x: width - panelWidth - 16,
    y: 12
  };
}

function isVisibleOnAnyDisplay(bounds) {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    const hasHorizontalOverlap = bounds.x < area.x + area.width && bounds.x + bounds.width > area.x;
    const hasVerticalOverlap = bounds.y < area.y + area.height && bounds.y + bounds.height > area.y;

    return hasHorizontalOverlap && hasVerticalOverlap;
  });
}

function loadBounds() {
  const fallback = getDefaultBounds();

  try {
    const saved = JSON.parse(fs.readFileSync(getStatePath(), 'utf8'));
    const bounds = {
      width: fallback.width,
      height: fallback.height,
      x: Number(saved.x),
      y: Number(saved.y)
    };

    if (Number.isFinite(bounds.x) && Number.isFinite(bounds.y) && isVisibleOnAnyDisplay(bounds)) {
      return bounds;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function saveBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const { x, y } = mainWindow.getBounds();
  fs.writeFileSync(getStatePath(), JSON.stringify({ x, y }, null, 2));
}

function getDefaultFloatingBounds() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;

  return {
    width: 168,
    height: 52,
    x: width - 188,
    y: Math.max(24, height - 92)
  };
}

function getDefaultSearchBounds() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;

  return {
    width: 380,
    height: 104,
    x: width - 400,
    y: Math.max(24, height - 210)
  };
}

function getDefaultPerformanceBounds() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;

  return {
    width: 132,
    height: 52,
    x: width - 340,
    y: Math.max(24, height - 92)
  };
}

function getDefaultHistoryBounds() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  return { width: 520, height: 180, x: width - 540, y: Math.max(24, height - 760) };
}

function getDefaultCompetitorBounds() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  return { width: 760, height: 186, x: width - 780, y: Math.max(24, height - 570) };
}

function loadFloatingBounds() {
  const fallback = getDefaultFloatingBounds();

  try {
    const saved = JSON.parse(fs.readFileSync(getFloatingStatePath(), 'utf8'));
    const bounds = {
      ...fallback,
      x: Number(saved.x),
      y: Number(saved.y)
    };

    if (Number.isFinite(bounds.x) && Number.isFinite(bounds.y) && isVisibleOnAnyDisplay(bounds)) {
      return bounds;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function saveFloatingBounds() {
  if (!floatingWindow || floatingWindow.isDestroyed()) {
    return;
  }

  const { x, y } = floatingWindow.getBounds();
  fs.writeFileSync(getFloatingStatePath(), JSON.stringify({ x, y }, null, 2));
}

function scheduleSaveFloatingBounds() {
  clearTimeout(floatingSaveTimer);
  floatingSaveTimer = setTimeout(saveFloatingBounds, 300);
}

function loadSearchBounds() {
  const fallback = getDefaultSearchBounds();

  try {
    const saved = JSON.parse(fs.readFileSync(getSearchStatePath(), 'utf8'));
    const bounds = {
      ...fallback,
      x: Number(saved.x),
      y: Number(saved.y)
    };

    if (Number.isFinite(bounds.x) && Number.isFinite(bounds.y) && isVisibleOnAnyDisplay(bounds)) {
      return bounds;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function saveSearchBounds() {
  if (!searchWindow || searchWindow.isDestroyed()) return;
  const { x, y } = searchWindow.getBounds();
  fs.writeFileSync(getSearchStatePath(), JSON.stringify({ x, y }, null, 2));
}

function scheduleSaveSearchBounds() {
  clearTimeout(searchSaveTimer);
  searchSaveTimer = setTimeout(saveSearchBounds, 300);
}

function loadPerformanceBounds() {
  const fallback = getDefaultPerformanceBounds();

  try {
    const saved = JSON.parse(fs.readFileSync(getPerformanceStatePath(), 'utf8'));
    const bounds = { ...fallback, x: Number(saved.x), y: Number(saved.y) };
    if (Number.isFinite(bounds.x) && Number.isFinite(bounds.y) && isVisibleOnAnyDisplay(bounds)) return bounds;
  } catch {
    return fallback;
  }

  return fallback;
}

function savePerformanceBounds() {
  if (!performanceWindow || performanceWindow.isDestroyed()) return;
  const { x, y } = performanceWindow.getBounds();
  fs.writeFileSync(getPerformanceStatePath(), JSON.stringify({ x, y }, null, 2));
}

function scheduleSavePerformanceBounds() {
  clearTimeout(performanceSaveTimer);
  performanceSaveTimer = setTimeout(savePerformanceBounds, 300);
}

function loadHistoryBounds() {
  const fallback = getDefaultHistoryBounds();
  try {
    const saved = JSON.parse(fs.readFileSync(getHistoryStatePath(), 'utf8'));
    const bounds = { ...fallback, x: Number(saved.x), y: Number(saved.y) };
    if (Number.isFinite(bounds.x) && Number.isFinite(bounds.y) && isVisibleOnAnyDisplay(bounds)) return bounds;
  } catch {
    return fallback;
  }
  return fallback;
}

function saveHistoryBounds() {
  if (!historyWindow || historyWindow.isDestroyed()) return;
  const { x, y } = historyWindow.getBounds();
  fs.writeFileSync(getHistoryStatePath(), JSON.stringify({ x, y }, null, 2));
}

function scheduleSaveHistoryBounds() {
  clearTimeout(historySaveTimer);
  historySaveTimer = setTimeout(saveHistoryBounds, 300);
}

function loadCompetitorBounds() {
  const fallback = getDefaultCompetitorBounds();
  try {
    const saved = JSON.parse(fs.readFileSync(getCompetitorStatePath(), 'utf8'));
    const bounds = { ...fallback, x: Number(saved.x), y: Number(saved.y) };
    if (Number.isFinite(bounds.x) && Number.isFinite(bounds.y) && isVisibleOnAnyDisplay(bounds)) return bounds;
  } catch {
    return fallback;
  }
  return fallback;
}

function saveCompetitorBounds() {
  if (!competitorWindow || competitorWindow.isDestroyed()) return;
  const { x, y } = competitorWindow.getBounds();
  fs.writeFileSync(getCompetitorStatePath(), JSON.stringify({ x, y }, null, 2));
}

function scheduleSaveCompetitorBounds() {
  clearTimeout(competitorSaveTimer);
  competitorSaveTimer = setTimeout(saveCompetitorBounds, 300);
}

function scheduleSaveBounds() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveBounds, 300);
}

function createWindow() {
  const bounds = loadBounds();

  mainWindow = new BrowserWindow({
    ...bounds,
    // Keep legacy renderers loaded for their services, without desktop visuals.
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setSkipTaskbar(true);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('moved', scheduleSaveBounds);
  mainWindow.on('move', scheduleSaveBounds);
  mainWindow.on('close', saveBounds);
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createFloatingWindow() {
  const bounds = loadFloatingBounds();

  floatingWindow = new BrowserWindow({
    ...bounds,
    // Keep legacy renderers loaded for their services, without desktop visuals.
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  floatingWindow.setSkipTaskbar(true);
  floatingWindow.loadFile(path.join(__dirname, 'renderer', 'floating.html'));
  floatingWindow.on('moved', scheduleSaveFloatingBounds);
  floatingWindow.on('move', scheduleSaveFloatingBounds);
  floatingWindow.on('close', saveFloatingBounds);
}

function createSearchWindow() {
  const bounds = loadSearchBounds();

  searchWindow = new BrowserWindow({
    ...bounds,
    // Keep legacy renderers loaded for their services, without desktop visuals.
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  searchWindow.setSkipTaskbar(true);
  searchWindow.loadFile(path.join(__dirname, 'renderer', 'search.html'));
  searchWindow.on('moved', scheduleSaveSearchBounds);
  searchWindow.on('move', scheduleSaveSearchBounds);
  searchWindow.on('close', saveSearchBounds);
}

function createPerformanceWindow() {
  const bounds = loadPerformanceBounds();

  performanceWindow = new BrowserWindow({
    ...bounds,
    // Keep legacy renderers loaded for their services, without desktop visuals.
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  performanceWindow.setSkipTaskbar(true);
  performanceWindow.loadFile(path.join(__dirname, 'renderer', 'performance.html'));
  performanceWindow.on('moved', scheduleSavePerformanceBounds);
  performanceWindow.on('move', scheduleSavePerformanceBounds);
  performanceWindow.on('close', savePerformanceBounds);
}

function createHistoryWindow() {
  const bounds = loadHistoryBounds();
  historyWindow = new BrowserWindow({
    ...bounds,
    // Keep legacy renderers loaded for their services, without desktop visuals.
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  historyWindow.setSkipTaskbar(true);
  historyWindow.loadFile(path.join(__dirname, 'renderer', 'history.html'));
  historyWindow.on('moved', scheduleSaveHistoryBounds);
  historyWindow.on('move', scheduleSaveHistoryBounds);
  historyWindow.on('close', saveHistoryBounds);
}

function createCompetitorWindow() {
  const bounds = loadCompetitorBounds();
  competitorWindow = new BrowserWindow({
    ...bounds,
    // Keep legacy renderers loaded for their services, without desktop visuals.
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  competitorWindow.setSkipTaskbar(true);
  competitorWindow.loadFile(path.join(__dirname, 'renderer', 'competitor.html'));
  competitorWindow.on('moved', scheduleSaveCompetitorBounds);
  competitorWindow.on('move', scheduleSaveCompetitorBounds);
  competitorWindow.on('close', saveCompetitorBounds);
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAQElEQVR4AWMYNmzYf2RgYGBg+P//PwMDA8OAAf9RzgxAjIyMCiYGA4ygGgYGBoZJkyYxMDAwMErhQJUDAwMAh6sPEb3WfRUAAAAASUVORK5CYII='
  );

  tray = new Tray(icon);
  tray.setToolTip('방송 편성표 위젯');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '보이기', click: () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
        mainWindow.once('ready-to-show', () => mainWindow?.show());
      } else mainWindow.show();
    } },
    { label: '숨기기', click: () => mainWindow?.hide() },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() }
  ]));
}

app.whenReady().then(() => {
  // Legacy background training disabled during Gemini migration; retained for reference.
  // const stopLearningLoop=!require('./planner/environment').useQwen()&&process.env.USAGI_AUTO_TRAIN==='true'?require('./commands/learning-loop').startLearningLoop():()=>{};
  const stopLearningLoop=()=>{};
  app.on('before-quit',stopLearningLoop);
  enableAutoLaunch();
  configureCacheDirectory(path.join(app.getPath('userData'), 'data-cache'));
  require('./data-cache').configureCache(path.join(app.getPath('userData'), 'data-cache', 'shared'));

  ipcMain.handle('schedule:load', loadSchedule);
  ipcMain.handle('schedule:rtdb-projects', getRtdbProjects);
  ipcMain.handle('pgmdr:refresh-future-ops', refreshFutureOpsVersions);
  ipcMain.handle('pgmdr:refresh-global-performance', refreshGlobalPerformance);
  ipcMain.handle('pgmdr:search-remaining-schedules', (_event, keyword) => searchRemainingSchedules(keyword));
  ipcMain.handle('pgmdr:search-performance-history', (_event, keyword) => searchPerformanceHistory(keyword));
  ipcMain.handle('pgmdr:search-competitor-info', (_event, payload) => searchCompetitorInfo(payload));
  ipcMain.handle('pgmdr:performance-cache-status', getPerformanceCacheStatus);
  ipcMain.handle('floating:get-cursor-position', () => screen.getCursorScreenPoint());
  ipcMain.handle('floating:get-window-position', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.getPosition() || [0, 0];
  });
  ipcMain.handle('floating:set-window-position', (event, x, y) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && Number.isFinite(x) && Number.isFinite(y)) {
      win.setPosition(Math.round(x), Math.round(y), false);
      if (win === floatingWindow) {
        scheduleSaveFloatingBounds();
      }
      if (win === searchWindow) {
        scheduleSaveSearchBounds();
      }
      if (win === performanceWindow) {
        scheduleSavePerformanceBounds();
      }
      if (win === historyWindow) {
        scheduleSaveHistoryBounds();
      }
      if (win === competitorWindow) {
        scheduleSaveCompetitorBounds();
      }
    }
  });
  ipcMain.handle('floating:set-window-height', (event, height) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const nextHeight = Math.max(86, Math.min(980, Math.round(Number(height) || 104)));
    if (win) {
      const bounds = win.getBounds();
      win.setBounds({ ...bounds, height: nextHeight }, false);
    }
  });
  ipcMain.handle('open:external', async (_event, url) => {
    if (typeof url === 'string' && url.startsWith('https://www.skstoa.com/')) {
      await shell.openExternal(url);
    }
  });

  // Data IPC/services live in the main process. Legacy UI windows are created
  // only when opened, rather than keeping six invisible renderers resident.
  createTray();
  const stopWallpaper = require('./day-night-wallpaper').startDayNightWallpaper();
  app.on('before-quit', stopWallpaper);
  startPets();
  warmPerformanceCache();
});

app.on('second-instance', () => {
  // Relaunching must not bring back the legacy desktop widgets.
});

app.on('before-quit', () => {
  saveBounds();
  saveFloatingBounds();
  savePerformanceBounds();
  saveSearchBounds();
  saveHistoryBounds();
  saveCompetitorBounds();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
