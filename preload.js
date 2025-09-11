// preload.js — FULL BRIDGE for Control + Compare + Product
const { contextBridge, ipcRenderer } = require('electron');

/** SAFETY: tiny helper to wrap IPC calls */
const call = (ch, ...args) => ipcRenderer.invoke(ch, ...args);

// Incoming events (compare window target URL)
ipcRenderer.on('compare-target-url', (_evt, url) => {
  try { window.__compareTargetURL = url; } catch {}
});

contextBridge.exposeInMainWorld('api', {
  // ---- Core product flow
  openProduct: (url) => call('open-product', url),
  evalInProduct: (js) => call('eval-in-product', js),
  scrapeCurrent: (opts) => call('scrape-current', opts),

  // ---- LLM + compare
  openCompare: (url) => call('open-compare', url),
  compareRun: (url) => call('compare-run', url),
  llmPropose: (payload) => call('llm-propose', payload),

  // ---- Selector memory (no-ops if you haven’t wired the store yet)
  hasSelectorMemory: (host) => call('has-selector-memory', host),
  getSelectorMemory: (host) => call('memory-get', host),
  setSelectorMemory: (host, data, note) => call('memory-set', { host, data, note }),
  clearSelectorMemory: (host) => call('memory-clear', host),
  validateSelectors: (host) => call('validate-selectors', host),
  clearSpecificSelectors: (host, fields) => call('memory-clear-fields', { host, fields }),

  // ---- Right-click Inspect
  inspectAt: (x, y) => call('inspect-at', { x, y })
});

// Right-click anywhere in a renderer to open Inspect at cursor
window.addEventListener('contextmenu', (e) => {
  try { window.api.inspectAt(e.x, e.y); } catch {}
}, { capture: true });
