const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scheduleApi', {
  load: () => ipcRenderer.invoke('schedule:load'),
  reload: () => ipcRenderer.invoke('schedule:load'),
  refreshFutureOps: () => ipcRenderer.invoke('pgmdr:refresh-future-ops'),
  refreshGlobalPerformance: () => ipcRenderer.invoke('pgmdr:refresh-global-performance'),
  searchRemainingSchedules: (keyword) => ipcRenderer.invoke('pgmdr:search-remaining-schedules', keyword),
  searchPerformanceHistory: (keyword) => ipcRenderer.invoke('pgmdr:search-performance-history', keyword),
  searchCompetitorInfo: (payload) => ipcRenderer.invoke('pgmdr:search-competitor-info', payload),
  getPerformanceCacheStatus: () => ipcRenderer.invoke('pgmdr:performance-cache-status'),
  getCursorPosition: () => ipcRenderer.invoke('floating:get-cursor-position'),
  getWindowPosition: () => ipcRenderer.invoke('floating:get-window-position'),
  setWindowPosition: (x, y) => ipcRenderer.invoke('floating:set-window-position', x, y),
  setWindowHeight: (height) => ipcRenderer.invoke('floating:set-window-height', height),
  openExternal: (url) => ipcRenderer.invoke('open:external', url)
});
