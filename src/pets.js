const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

// Independent from the hidden legacy widgets and their data services.
module.exports = function startPets() {
  const log = message => require('fs').appendFileSync(path.join(require('os').tmpdir(), 'bgapp-pets.log'), new Date().toISOString() + ' ' + message + '\n');
  const windows = new Set();
  ipcMain.handle('pets:team-performance', () => require('./team-performance').loadTeamPerformance());
  ipcMain.handle('pets:momonga-report', () => require('./schedule').loadMomongaReport());
  let controlWindow = null;
  let aboveWindows = true;
  function monitorOne(displays) {
    if (process.platform === 'win32') {
      try {
        const script = "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | Where-Object { $_.DeviceName -match 'DISPLAY1$' } | ForEach-Object { @{ x = $_.Bounds.X; y = $_.Bounds.Y } } | ConvertTo-Json -Compress";
        const point = JSON.parse(require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, encoding: 'utf8', timeout: 5000 }));
        return screen.getDisplayNearestPoint(screen.screenToDipPoint(point));
      } catch { /* Fall back to the primary display if Windows numbering is unavailable. */ }
    }
    return screen.getPrimaryDisplay();
  }
  function applyLayer(win) {
    const above = win.petMonitorOne && aboveWindows;
    win.setAlwaysOnTop(Boolean(above));
    if (!above && process.platform === 'win32') {
      const handle = win.getNativeWindowHandle();
      const hwnd = handle.length === 8 ? handle.readBigUInt64LE().toString() : String(handle.readUInt32LE());
      require('child_process').execFile('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', path.join(__dirname, 'lower-pet-window.ps1'), '-WindowHandle', hwnd
      ], { windowsHide: true, timeout: 5000 }, error => {
        if (win.isDestroyed()) return;
        // A rapid re-check must win over an in-flight lowering request.
        if (win.petMonitorOne && aboveWindows) win.setAlwaysOnTop(true);
        if (error) log('LOWER_FAILED ' + error.message);
        else log('PET_LOWERED ' + hwnd);
      });
    }
  }
  ipcMain.on('pets:set-above', (event, value) => {
    if (event.sender !== controlWindow?.webContents) return;
    aboveWindows = Boolean(value);
    for (const win of windows) applyLayer(win);
  });
  ipcMain.on('pets:hit-regions', (event, regions) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (windows.has(win) && Array.isArray(regions)) win.petRegions = regions;
  });
  ipcMain.on('pets:dragging', (event, value) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (windows.has(win)) win.petDragging = Boolean(value);
  });
  function create(display, monitorId) {
    const win = new BrowserWindow({
      ...display.workArea, frame: false, transparent: true, hasShadow: false,
      resizable: false, skipTaskbar: true, alwaysOnTop: false, focusable: false,
      show: true, backgroundColor: '#00000000',
      webPreferences: { preload: path.join(__dirname, 'pets-preload.js'),
        contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
    });
    win.petMonitorOne = display.id === monitorId;
    applyLayer(win);
    log("PET_CREATED visible=" + win.isVisible() + " top=" + win.isAlwaysOnTop());
    windows.add(win);
    win.webContents.on('console-message', (_event, _level, message) => {
      if (message.includes('PETS_')) require('fs').appendFileSync(path.join(require('os').tmpdir(), 'bgapp-pets.log'), message + '\n');
    });
    win.setIgnoreMouseEvents(true, { forward: true });
    win.loadFile(path.join(__dirname, 'renderer/pets.html')).catch(error => log('PET_LOAD_ERROR ' + error.message));
    win.webContents.once('did-finish-load', () => { win.showInactive(); applyLayer(win); log('PET_WINDOW ' + JSON.stringify(win.getBounds()) + ' top=' + win.isAlwaysOnTop()); });
    win.on('closed', () => windows.delete(win));
  }
  function createAll() {
    const displays = screen.getAllDisplays();
    const first = displays.length > 1 ? monitorOne(displays) : null;
    log('DISPLAYS ' + displays.length + ' FIRST ' + first?.id);
    displays.forEach(display => create(display, first?.id));
    if (first) {
      controlWindow = new BrowserWindow({
        x: first.workArea.x + first.workArea.width - 210, y: first.workArea.y + 12,
        width: 198, height: 42, frame: false, transparent: true, hasShadow: false,
        resizable: false, skipTaskbar: true, alwaysOnTop: true, focusable: false, show: true,
        webPreferences: { preload: path.join(__dirname, 'pets-preload.js'), contextIsolation: true, nodeIntegration: false }
      });
      controlWindow.loadFile(path.join(__dirname, 'renderer/pets-control.html'), { query: { above: String(aboveWindows) } });
      const control = controlWindow;
      log("CONTROL_CREATED visible=" + control.isVisible());
      control.webContents.once('did-finish-load', () => { control.showInactive(); log('CONTROL_VISIBLE ' + control.isVisible()); });
    }
  }
  createAll();
  const timer = setInterval(() => {
    const cursor = screen.getCursorScreenPoint();
    for (const win of windows) {
      const bounds = win.getBounds();
      const x = cursor.x - bounds.x, y = cursor.y - bounds.y;
      const hit = (win.petRegions || []).some(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      const ignore = !(hit || win.petDragging);
      if (win.petIgnore !== ignore) {
        win.setIgnoreMouseEvents(ignore, { forward: true });
        win.petIgnore = ignore;
      }
      win.webContents.send('pets:cursor', { x, y });
      // Keep ordinary application windows above the desktop pets.

    }
  }, 50);
  const rebuild = () => {
    for (const win of [...windows]) win.close();
    if (controlWindow) { controlWindow.close(); controlWindow = null; }
    createAll();
  };
  screen.on('display-added', rebuild);
  screen.on('display-removed', rebuild);
  screen.on('display-metrics-changed', rebuild);
  return { stop() { clearInterval(timer); controlWindow?.close(); for (const win of [...windows]) win.close(); } };
};
