const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('petsAPI', {
  loadSchedule: () => ipcRenderer.invoke('schedule:load'),
  loadTeamPerformance: () => ipcRenderer.invoke('pets:team-performance'),
  loadMomongaReport: () => ipcRenderer.invoke('pets:momonga-report'),
  setAbove: value => ipcRenderer.send('pets:set-above', value),
  dragging: value => ipcRenderer.send('pets:dragging', value),
  regions: regions => ipcRenderer.send('pets:hit-regions', regions),
  onCursor: callback => ipcRenderer.on('pets:cursor', (_event, point) => callback(point))
});
