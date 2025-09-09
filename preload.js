
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openProduct: (url) => ipcRenderer.invoke('open-product', url),
  evalInProduct: (code) => ipcRenderer.invoke('eval-in-product', code),
  scrapeCurrent: (opts) => ipcRenderer.invoke('scrape-current', opts || {}),
  getSelectorMemory: (host) => ipcRenderer.invoke('memory-get', host),
  setSelectorMemory: (host, data, note) => ipcRenderer.invoke('memory-set', { host, data, note }),
  clearSelectorMemory: (host) => ipcRenderer.invoke('memory-clear', host),
  validateSelectors: (host) => ipcRenderer.invoke('memory-validate', host),
  hasSelectorMemory: (host) => ipcRenderer.invoke('memory-has', host),
});
