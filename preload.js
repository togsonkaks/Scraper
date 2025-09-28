// preload.js — FULL BRIDGE for Control + Compare + Product
const { contextBridge, ipcRenderer } = require('electron');

/** SAFETY: tiny helper to wrap IPC calls */
const call = (ch, ...args) => ipcRenderer.invoke(ch, ...args);

// Incoming events (compare window target URL)
ipcRenderer.on('compare-target-url', (_evt, url) => {
  try { window.__compareTargetURL = url; } catch {}
});

// Navigation error handling
ipcRenderer.on('navigation-error', (_evt, errorData) => {
  try {
    const { url, errorCode, errorDescription } = errorData;
    console.error('Navigation error received:', errorData);
    
    // Update status display
    const statusEl = document.getElementById('status');
    if (statusEl) {
      statusEl.innerHTML = `<span class="pill" style="background:#ffcccc; color:#990000;">Network Error</span>`;
    }
    
    // Show user-friendly error message
    let hostname = 'the website';
    try { hostname = new URL(url).hostname; } catch(e) {}
    
    let userMessage = `❌ Failed to load ${hostname}`;
    
    if (errorCode === -3) {
      userMessage += `\n\nThis appears to be a network connectivity issue. This can happen when:\n• The site blocks automated requests\n• DNS resolution fails\n• SSL/certificate issues occur\n\nTry visiting the URL manually in the product window, or try a different product page from the same site.`;
    } else {
      userMessage += `\n\nError: ${errorDescription}`;
    }
    
    alert(userMessage);
  } catch (e) {
    console.error('Error handling navigation error:', e);
  }
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

  // ---- LLM Cache management
  checkLLMCache: (url) => call('llm-cache-check', url),
  getLLMCache: (url) => call('llm-cache-get', url),
  deleteLLMCache: (url) => call('llm-cache-delete', url),

  // ---- Right-click Inspect
  inspectAt: (x, y) => call('inspect-at', { x, y }),

  // ---- Debug logging
  debugSaveLogs: (query) => call('debug-save-logs', { query }),
  debugQueryLogs: (query) => call('debug-query-logs', { query }),
  saveDebugFile: (filename, content) => call('save-debug-file', { filename, content })
});

// Right-click context menu with Inspect Element option
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  
  // Create context menu
  const menu = document.createElement('div');
  menu.style.cssText = `
    position: fixed;
    top: ${e.clientY}px;
    left: ${e.clientX}px;
    background: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    padding: 4px 0;
    font: 13px system-ui, -apple-system, sans-serif;
    z-index: 99999;
    min-width: 140px;
  `;
  
  // Add Inspect Element option
  const inspectItem = document.createElement('div');
  inspectItem.textContent = 'Inspect Element';
  inspectItem.style.cssText = `
    padding: 6px 12px;
    cursor: pointer;
    color: #333;
  `;
  inspectItem.addEventListener('mouseenter', () => {
    inspectItem.style.background = '#0066cc';
    inspectItem.style.color = 'white';
  });
  inspectItem.addEventListener('mouseleave', () => {
    inspectItem.style.background = 'transparent';
    inspectItem.style.color = '#333';
  });
  inspectItem.addEventListener('click', () => {
    try { window.api.inspectAt(e.x, e.y); } catch {}
    document.body.removeChild(menu);
  });
  
  menu.appendChild(inspectItem);
  document.body.appendChild(menu);
  
  // Remove menu when clicking elsewhere
  const removeMenu = () => {
    if (document.body.contains(menu)) {
      document.body.removeChild(menu);
    }
    document.removeEventListener('click', removeMenu);
    document.removeEventListener('keydown', escapeHandler);
  };
  
  // Remove menu on Escape key
  const escapeHandler = (e) => {
    if (e.key === 'Escape') removeMenu();
  };
  
  setTimeout(() => {
    document.addEventListener('click', removeMenu);
    document.addEventListener('keydown', escapeHandler);
  }, 100);
}, { capture: true });
