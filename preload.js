// preload.js — safe IPC surface for control & product windows (with history + notes)

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // navigation / eval
  openProduct: (url) => ipcRenderer.invoke('open-product', url),
  evalInProduct: (js) => ipcRenderer.invoke('eval-in-product', js),

  // scrape (Save button)
  scrapeCurrent: () => ipcRenderer.invoke('scrape-current'),

  // selector memory
  getSelectorMemory: (hostOrUrl) => ipcRenderer.invoke('selector-memory:get', hostOrUrl),
  getSelectorMemoryHistory: (hostOrUrl) => ipcRenderer.invoke('selector-memory:getHistory', hostOrUrl),
  setSelectorMemory: (hostOrUrl, fields, note) => ipcRenderer.invoke('selector-memory:set', hostOrUrl, fields, note),
  clearSelectorMemory: (hostOrUrl, keys) => ipcRenderer.invoke('selector-memory:clear', hostOrUrl, keys),
  
  // selector validation
  validateSelectors: (hostOrUrl) => ipcRenderer.invoke('validate-selectors', hostOrUrl),
});
