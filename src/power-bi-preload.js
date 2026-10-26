const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('powerBi', {
  schema: () => ipcRenderer.invoke('bi:schema'),
  command: input => ipcRenderer.invoke('bi:command', input),
  engine: () => ipcRenderer.invoke('bi:engine'),
  onReplyProgress: callback => ipcRenderer.on('bi:reply-progress', (_event,value) => callback(value)),
  suggestions: value => ipcRenderer.invoke('bi:suggestions', value),
  refreshCodes: () => ipcRenderer.invoke('bi:refresh-codes'),
  search: keyword => ipcRenderer.invoke('bi:search', keyword),
  visual: input => ipcRenderer.invoke('bi:visual', input),
  reset: () => ipcRenderer.invoke('bi:reset'),
  resize: (height, expanded) => ipcRenderer.send('bi:resize', { height, expanded }),
  hide: () => ipcRenderer.send('bi:hide'),
  onReset: callback => ipcRenderer.on('bi:reset', () => callback()),
  onStatus: callback => ipcRenderer.on('bi:status', (_event,message) => callback(message)),
  onFocus: callback => ipcRenderer.on('bi:focus', () => callback())
});
