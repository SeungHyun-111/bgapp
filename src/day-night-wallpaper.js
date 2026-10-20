const path = require('path');
const { execFile } = require('child_process');

function wallpaperPhase(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23' }).format(now));
  return hour >= 6 && hour < 18 ? 'day' : 'night';
}
function startDayNightWallpaper() {
  let applied = null, running = false;
  function update() {
    if (process.platform !== 'win32' || running) return;
    const phase = wallpaperPhase();
    if (phase === applied) return;
    running = true;
    const image = path.join(__dirname, 'assets/backgrounds', `${phase}.png`);
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(__dirname, 'set-wallpaper.ps1'), '-WallpaperPath', image],
    { windowsHide: true, timeout: 10000 }, error => {
      running = false;
      if (error) console.error('Wallpaper update failed:', error.message);
      else applied = phase;
    });
  }
  update();
  const timer = setInterval(update, 60000);
  return () => clearInterval(timer);
}
module.exports = { wallpaperPhase, startDayNightWallpaper };
