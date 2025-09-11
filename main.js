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
  openDevtools(controlWin);
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
        return { ok:true, res: out, used: (globalThis.__tg_lastSelectorsUsed||null) };
      } catch(e) { return { ok:false, error: String(e) }; }
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
  openDevtools(compareWin);
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
            return { ok:true, res: out, used: (globalThis.__tg_lastSelectorsUsed||null) };
          } catch(e) { return { ok:false, error:String(e) }; }
        })();
      `;
      const out = await win.webContents.executeJavaScript(injected, true);
      resolve(out);
    } catch(e) {
      resolve({ ok:false, error: String(e) });
    } finally { try { win.destroy(); } catch {} }
  });
}

ipcMain.handle('compare-run', async (_e, url) => {
  try {
    if (!/^https?:/i.test(url)) throw new Error('Invalid URL');
    const base = await runScrapeInEphemeral(url, { llm:false });
    const llm  = await runScrapeInEphemeral(url, { llm:true });
    return { ok:true, base, llm };
  } catch(e) { return { ok:false, error:String(e) }; }
});
