// main.js — FULL (with Inspect-at + warm-up + compare + DevTools)
try { require('dotenv').config(); } catch {}
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');

function openDevtools(win){ try { win.webContents.openDevTools({ mode: 'detach' }); } catch {} }
function warmupScrollJS(){
  return `
  (async () => {
    if (document.readyState !== 'complete') {
      await new Promise(r => window.addEventListener('load', r, { once: true }));
    }
    await new Promise(r => setTimeout(r, 600));
    const H = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    let y = 0;
    while (y < H) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 120));
      y += Math.max(600, innerHeight * 0.9);
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 250));
  })();
  `;
}

/* ========= Windows ========= */
let controlWin = null;
function createControl(){
  controlWin = new BrowserWindow({
    width: 1200, height: 860, show: true,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  controlWin.on('closed', () => { controlWin = null; });
  controlWin.loadFile(path.join(__dirname, 'control.html'));
  // Dev tools only open on right-click or Ctrl+Shift+I
  return controlWin;
}

let productWin = null;
function ensureProduct(){
  if (productWin && !productWin.isDestroyed()) return productWin;
  productWin = new BrowserWindow({
    width: 1300, height: 950, show: true,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  productWin.on('closed', () => { productWin = null; });
  return productWin;
}

/* ========= App lifecycle ========= */
app.whenReady().then(() => {
  createControl();
  try {
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      const w = BrowserWindow.getFocusedWindow();
      if (w) w.webContents.openDevTools({ mode: 'detach' });
    });
  } catch {}
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!controlWin) createControl(); });

/* ========= IPC: Inspect at cursor (right-click) ========= */
ipcMain.handle('inspect-at', async (_e, { x, y }) => {
  try {
    const w = BrowserWindow.getFocusedWindow();
    if (!w) return false;
    w.webContents.inspectElement(x, y);
    if (!w.webContents.isDevToolsOpened()) w.webContents.openDevTools({ mode: 'detach' });
    return true;
  } catch { return false; }
});

/* ========= IPC: navigation & scraping ========= */
ipcMain.handle('open-product', async (_e, url) => {
  const win = ensureProduct();
  if (!/^https?:/i.test(url)) throw new Error('Invalid URL');
  await win.loadURL(url);
  win.show(); win.focus();
  return true;
});

ipcMain.handle('eval-in-product', async (_e, js) => {
  const win = ensureProduct();
  return win.webContents.executeJavaScript(js, true);
});

ipcMain.handle('scrape-current', async (_e, opts = {}) => {
  const win = ensureProduct();
  const orchPath = path.join(__dirname, 'scrapers', 'orchestrator.js');
  const orchSource = fs.readFileSync(orchPath, 'utf8');
  const injected = `
    (async () => {
      try {
        ${warmupScrollJS()}
        ${orchSource}
        const out = await scrapeProduct(Object.assign({}, ${JSON.stringify({ mode:'control' })}, ${JSON.stringify(opts)}));
        return { result: out, selectorsUsed: (globalThis.__tg_lastSelectorsUsed||null) };
      } catch(e) { return { result: { __error: String(e) }, selectorsUsed: null }; }
    })();
  `;
  return win.webContents.executeJavaScript(injected, true);
});

/* ========= LLM agent ========= */
ipcMain.handle('llm-propose', async (_e, payload) => {
  try {
    const { proposeSelectors } = require(path.join(__dirname, 'scrapers', 'llm_agent'));
    const selectors = await proposeSelectors(payload || {});
    return { ok: true, selectors };
  } catch (e) { return { ok:false, error: String(e) }; }
});

/* ========= Compare window ========= */
let compareWin = null;
function createCompare(){
  compareWin = new BrowserWindow({
    width: 1300, height: 900, show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  compareWin.on('closed', () => { compareWin = null; });
  compareWin.loadFile(path.join(__dirname, 'compare.html'));
  // Dev tools only open on right-click or Ctrl+Shift+I
  return compareWin;
}

ipcMain.handle('open-compare', async (_e, url) => {
  if (!compareWin) createCompare();
  compareWin.webContents.send('compare-target-url', url || '');
  compareWin.show(); compareWin.focus();
  return true;
});

async function runScrapeInEphemeral(url, opts){
  return new Promise(async (resolve) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true, nodeIntegration: false,
        preload: path.join(__dirname, 'preload.js'),
        backgroundThrottling: false
      }
    });
    try {
      await win.loadURL(url);
      const orchSource = fs.readFileSync(path.join(__dirname, 'scrapers', 'orchestrator.js'), 'utf8');
      const injected = `
        (async () => {
          try {
            ${warmupScrollJS()}
            ${orchSource}
            const out = await scrapeProduct(Object.assign({}, ( ${JSON.stringify(opts)} || {} ), { mode:'compare' }));
            return { result: out, selectorsUsed: (globalThis.__tg_lastSelectorsUsed||null) };
          } catch(e) { return { result: { __error: String(e) }, selectorsUsed: null }; }
        })();
      `;
      const out = await win.webContents.executeJavaScript(injected, true);
      resolve(out);
    } catch(e) {
      resolve({ result: { __error: String(e) }, selectorsUsed: null });
    } finally { try { win.destroy(); } catch {} }
  });
}

// Selector Memory IPC handlers
ipcMain.handle('has-selector-memory', async (_e, host) => {
  const win = ensureProduct();
  const checkScript = `
    (function() {
      try {
        const raw = localStorage.getItem('selector_memory_v2');
        if (!raw) return false;
        const all = JSON.parse(raw);
        const hostData = all[${JSON.stringify(host)}];
        if (!hostData) return false;
        const fields = Object.keys(hostData).filter(k => k !== '__history');
        return fields.length > 0;
      } catch {
        return false;
      }
    })()
  `;
  return await win.webContents.executeJavaScript(checkScript, true);
});

ipcMain.handle('memory-get', async (_e, host) => {
  const win = ensureProduct();
  const getScript = `
    (function() {
      try {
        const raw = localStorage.getItem('selector_memory_v2');
        if (!raw) return null;
        const all = JSON.parse(raw);
        return all[${JSON.stringify(host)}] || null;
      } catch {
        return null;
      }
    })()
  `;
  return await win.webContents.executeJavaScript(getScript, true);
});

ipcMain.handle('memory-set', async (_e, { host, data, note }) => {
  const win = ensureProduct();
  const setScript = `
    (function() {
      try {
        const raw = localStorage.getItem('selector_memory_v2') || '{}';
        const all = JSON.parse(raw);
        const current = all[${JSON.stringify(host)}] || {};
        
        // Update with new data
        Object.assign(current, ${JSON.stringify(data)});
        
        // Add history entry
        if (!current.__history) current.__history = [];
        current.__history.unshift({
          timestamp: new Date().toISOString(),
          note: ${JSON.stringify(note || 'Updated')},
          fields: Object.keys(${JSON.stringify(data)})
        });
        current.__history = current.__history.slice(0, 10); // Keep last 10
        
        all[${JSON.stringify(host)}] = current;
        localStorage.setItem('selector_memory_v2', JSON.stringify(all));
        return true;
      } catch {
        return false;
      }
    })()
  `;
  return await win.webContents.executeJavaScript(setScript, true);
});

ipcMain.handle('memory-clear', async (_e, host) => {
  const win = ensureProduct();
  const clearScript = `
    (function() {
      try {
        const raw = localStorage.getItem('selector_memory_v2') || '{}';
        const all = JSON.parse(raw);
        delete all[${JSON.stringify(host)}];
        localStorage.setItem('selector_memory_v2', JSON.stringify(all));
        return true;
      } catch {
        return false;
      }
    })()
  `;
  return await win.webContents.executeJavaScript(clearScript, true);
});

ipcMain.handle('memory-clear-fields', async (_e, { host, fields }) => {
  const win = ensureProduct();
  const clearFieldsScript = `
    (function() {
      try {
        const raw = localStorage.getItem('selector_memory_v2') || '{}';
        const all = JSON.parse(raw);
        const current = all[${JSON.stringify(host)}] || {};
        
        // Remove specified fields
        ${JSON.stringify(fields)}.forEach(field => delete current[field]);
        
        // Check if any fields remain (except __history)
        const remainingFields = Object.keys(current).filter(k => k !== '__history');
        if (remainingFields.length === 0) {
          delete all[${JSON.stringify(host)}];
        } else {
          all[${JSON.stringify(host)}] = current;
        }
        
        localStorage.setItem('selector_memory_v2', JSON.stringify(all));
        return true;
      } catch {
        return false;
      }
    })()
  `;
  return await win.webContents.executeJavaScript(clearFieldsScript, true);
});

ipcMain.handle('validate-selectors', async (_e, host) => {
  const win = ensureProduct();
  
  // First get the saved selectors
  const getScript = `
    (function() {
      try {
        const raw = localStorage.getItem('selector_memory_v2');
        if (!raw) return {};
        const all = JSON.parse(raw);
        return all[${JSON.stringify(host)}] || {};
      } catch {
        return {};
      }
    })()
  `;
  
  const savedSelectors = await win.webContents.executeJavaScript(getScript, true);
  const testResults = {};
  
  // Test each saved field
  for (const [field, selectorConfig] of Object.entries(savedSelectors)) {
    if (field === '__history') continue;
    
    const testScript = `
      (function() {
        const selectors = ${JSON.stringify(Array.isArray(selectorConfig.selectors) ? selectorConfig.selectors : [selectorConfig.selectors])};
        const attr = ${JSON.stringify(selectorConfig.attr || 'text')};
        const field = ${JSON.stringify(field)};
        
        for (const selector of selectors) {
          try {
            const elements = document.querySelectorAll(selector);
            if (elements.length === 0) continue;
            
            let values = [];
            for (const el of elements) {
              let value = null;
              if (attr === 'text') {
                value = (el.textContent || '').trim();
              } else if (attr === 'src') {
                value = el.currentSrc || el.src || el.getAttribute('src');
              } else if (attr === 'content') {
                value = el.getAttribute('content');
              } else {
                value = el.getAttribute(attr) || (el.textContent || '').trim();
              }
              
              if (value) values.push(value);
            }
            
            if (values.length > 0) {
              return {
                success: true,
                value: field === 'images' ? values : values[0],
                source: 'memory', 
                selector: selector,
                count: values.length
              };
            }
          } catch (e) {
            console.error('Selector test error for', selector, ':', e);
          }
        }
        
        return {
          success: false,
          value: null,
          source: 'none',
          error: 'No elements found or no valid values extracted'
        };
      })()
    `;
    
    try {
      testResults[field] = await win.webContents.executeJavaScript(testScript, true);
    } catch (e) {
      testResults[field] = {
        success: false,
        value: null,
        source: 'none',
        error: e.message
      };
    }
  }
  
  return { savedSelectors, testResults };
});

ipcMain.handle('compare-run', async (_e, url) => {
  try {
    if (!/^https?:/i.test(url)) throw new Error('Invalid URL');
    const base = await runScrapeInEphemeral(url, { llm:false });
    const llm  = await runScrapeInEphemeral(url, { llm:true });
    return { result: { base, llm }, selectorsUsed: null };
  } catch(e) { return { result: { __error: String(e) }, selectorsUsed: null }; }
});
