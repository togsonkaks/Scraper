
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let controlWin = null;
let productWin = null;

function createWindows() {
  controlWin = new BrowserWindow({
    width: 1100, height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });
  controlWin.loadFile(path.join(__dirname, 'control.html'));

  productWin = new BrowserWindow({
    width: 1280, height: 900, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload_product.js' ), // optional; not required
      contextIsolation: false,
      nodeIntegration: false,
    }
  });
}

app.whenReady().then(createWindows);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// Helpers
function getOrchestratorCode() {
  const p = path.join(__dirname, 'scrapers', 'orchestrator.js');
  return fs.readFileSync(p, 'utf8');
}
function getMemoryFor(host) {
  // read from control window's localStorage via evaluate (simplest cross-window store)
  return productWin.webContents.executeJavaScript(`(function(){
    try{
      const all = JSON.parse(localStorage.getItem('selector_memory_v2')||'{}');
      return all['${host}'] || {};
    }catch(e){ return {}; }
  })();`);
}
function setMemoryFor(host, data, note) {
  return productWin.webContents.executeJavaScript(`(function(){
    try{
      const all = JSON.parse(localStorage.getItem('selector_memory_v2')||'{}');
      all['${host}'] = Object.assign({}, all['${host}']||{}, ${JSON.stringify(data)}, { __history: (all['${host}']?.__history||[]).concat([{ savedAt: new Date().toISOString(), note: ${JSON.stringify(note||'')} }]) });
      localStorage.setItem('selector_memory_v2', JSON.stringify(all));
      return true;
    }catch(e){ return false; }
  })();`);
}
function clearMemoryFor(host) {
  return productWin.webContents.executeJavaScript(`(function(){
    try{
      const all = JSON.parse(localStorage.getItem('selector_memory_v2')||'{}');
      delete all['${host}'];
      localStorage.setItem('selector_memory_v2', JSON.stringify(all));
      return true;
    }catch(e){ return false; }
  })();`);
}

// IPC
ipcMain.handle('open-product', async (_e, url) => {
  if (!/^https?:\/\//i.test(url)) throw new Error('URL must start with http/https');
  await productWin.loadURL(url);
  return true;
});

ipcMain.handle('eval-in-product', async (_e, code) => {
  return await productWin.webContents.executeJavaScript(code, true);
});

ipcMain.handle('scrape-current', async (_e, opts = {}) => {
  const mode = (opts.mode || '').toLowerCase(); // 'memoryonly' or 'normal'
  const orch = getOrchestratorCode();
  const js = `
    (async () => {
      try {
        ${orch}
        const opt = ${JSON.stringify(mode==='memoryonly' ? { mode:'memoryOnly' } : { mode:'normal' })};
        const result = await (typeof scrapeProduct==='function' ? scrapeProduct(opt) : (async()=>({__error:'scrapeProduct missing'}))());
        const selectorsUsed = globalThis.__tg_lastSelectorsUsed || null;
        return { result, selectorsUsed };
      } catch (e) {
        return { result: { __error: String(e) }, selectorsUsed: null };
      }
    })();`;
  return await productWin.webContents.executeJavaScript(js, true);
});

ipcMain.handle('memory-get', async (_e, host) => await getMemoryFor(host));
ipcMain.handle('memory-set', async (_e, {host, data, note}) => await setMemoryFor(host, data, note));
ipcMain.handle('memory-clear', async (_e, host) => await clearMemoryFor(host));
ipcMain.handle('memory-has', async (_e, host) => {
  const mem = await getMemoryFor(host);
  return mem && Object.keys(mem).some(k => k !== '__history');
});

ipcMain.handle('memory-validate', async (_e, host) => {
  const mem = await getMemoryFor(host);
  const testResults = {};
  const savedSelectors = {};
  const fields = ['title','price','brand','description','images'];
  const js = (field, cfg) => {
    const selectors = Array.isArray(cfg.selectors) ? cfg.selectors : (cfg.selector ? [cfg.selector] : []);
    const attr = cfg.attr || 'text';
    return `(function(){
      const sels = ${JSON.stringify(selectors)};
      let ok=false, val=null, err=null;
      try{
        if ('${field}'==='images'){
          const urls = [];
          for (const s of sels){
            document.querySelectorAll(s).forEach(el=>{
              const u = el.getAttribute('src') || el.currentSrc || el.getAttribute('data-src') || el.getAttribute('data-image') || el.getAttribute('data-zoom-image') || el.getAttribute('data-large');
              if (u) urls.push(u);
              const ss = el.getAttribute('srcset'); if (ss){ const p = ss.split(',').pop().trim().split(' ')[0]; if (p) urls.push(p); }
            });
          }
          ok = urls.length>0; val = ok ? urls.slice(0,20) : null;
        }else{
          for (const s of sels){
            const el = document.querySelector(s);
            if (el){ ok=true; val = ('${attr}'==='text') ? (el.textContent||'').trim() : el.getAttribute('${attr}'); break; }
          }
        }
      }catch(e){ err=String(e); }
      return { success: ok, value: val, error: err, source: 'memory' };
    })()`;
  };

  for (const f of fields) {
    if (mem[f]) {
      savedSelectors[f] = mem[f];
      try {
        testResults[f] = await productWin.webContents.executeJavaScript(js(f, mem[f]), true);
      } catch (e) {
        testResults[f] = { success:false, error:String(e) };
      }
    }
  }
  return { savedSelectors, testResults };
});

ipcMain.handle('memory-clear-fields', async (_e, args) => {
  const { host, fields } = args;
  const current = await getMemoryFor(host);
  if (!current) return true;
  
  // Remove specified fields
  for (const field of fields) {
    delete current[field];
  }
  
  // If no fields left (except __history), clear everything
  const remainingFields = Object.keys(current).filter(k => k !== '__history');
  if (remainingFields.length === 0) {
    return await clearMemoryFor(host);
  }
  
  // Save the updated memory
  return await setMemoryFor(host, current, `Removed fields: ${fields.join(', ')}`);
});
