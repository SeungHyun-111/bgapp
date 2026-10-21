const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('petsAPI', {
  loadSchedule: () => ipcRenderer.invoke('schedule:load'),
  loadTeamPerformance: () => ipcRenderer.invoke('pets:team-performance'),
  loadMomongaReport: () => ipcRenderer.invoke('pets:momonga-report'),
  setAbove: value => ipcRenderer.send('pets:set-above', value),
  showContextMenu: () => ipcRenderer.send('pets:context-menu'),
  openPowerBi: point => ipcRenderer.send('pets:power-bi', point),
  onSearchVisible: callback => ipcRenderer.on('pets:search-visible', (_event, value) => callback(value)),
  onAboveChanged: callback => ipcRenderer.on('pets:above-changed', (_event, value) => callback(value)),
  dragging: value => ipcRenderer.send('pets:dragging', value),
  regions: regions => ipcRenderer.send('pets:hit-regions', regions),
  onCursor: callback => ipcRenderer.on('pets:cursor', (_event, point) => callback(point))
});
