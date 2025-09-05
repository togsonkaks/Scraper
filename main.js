// main.js — Electron bootstrap + IPC + selector memory + Pinterest-style flow + HISTORY NOTES

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let controlWindow = null;
let productWindow = null;

// ------------------------ Selector Memory (persisted) ------------------------
const MEM_FILE = path.join(app.getPath('userData'), 'selectorMemory.json');
function loadMem() {
  try { return JSON.parse(fs.readFileSync(MEM_FILE, 'utf8')); } catch { return {}; }
}
function saveMem(obj) {
  try { fs.writeFileSync(MEM_FILE, JSON.stringify(obj, null, 2), 'utf8'); } catch {}
}
function hostKeyFromUrl(u) {
  try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; }
}

/**
 * Schema:
 * {
 *   "<host>": {
 *     title:  { selectors: [...], attr: "text", updatedAt: 1736030000000 },
 *     price:  { selectors: [...], attr: "text", updatedAt: ... },
 *     images: { selectors: [...], attr: "src",  updatedAt: ... },
 *     __history: [
 *       {
 *         field: "images",
 *         previous: { selectors:[...], attr:"src", updatedAt: 17360... },
 *         note: "Tweaked after PDP redesign",
 *         savedAt: 17360...
 *       },
 *       ...
 *     ]
 *   }
 * }
 */
const selectorMemory = {
  get(host) {
    const all = loadMem();
    return all[host] || null;
  },
  getHistory(host) {
    const all = loadMem();
    return (all[host] && all[host].__history) ? all[host].__history : [];
  },
  set(host, fields, note) {
    const all = loadMem();
    const entry = all[host] || {};
    if (!entry.__history) entry.__history = [];

    const now = Date.now();
    for (const field of Object.keys(fields || {})) {
      const incoming = { ...fields[field] };
      // stamp
      incoming.updatedAt = now;

      // if we have an existing value for this field, push it to history with note
      if (entry[field]) {
        entry.__history.push({
          field,
          previous: entry[field],
          note: (typeof note === 'string' && note.trim()) ? note.trim() : null,
          savedAt: now
        });
      } else {
        // even first-time saves can carry a note if provided
        entry.__history.push({
          field,
          previous: null,
          note: (typeof note === 'string' && note.trim()) ? note.trim() : null,
          savedAt: now
        });
      }

      // overwrite current (last write wins)
      entry[field] = incoming;
    }

    all[host] = entry;
    saveMem(all);
    return all[host];
  },
  clear(host, keys) {
    const all = loadMem();
    if (!all[host]) return;
    if (Array.isArray(keys) && keys.length) {
      for (const k of keys) delete all[host][k];
    } else {
      delete all[host];
    }
    saveMem(all);
  }
};

// ------------------------ Create Windows ------------------------
function createWindows() {
  controlWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  productWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  controlWindow.loadFile(path.join(__dirname, 'control.html'));
  controlWindow.on('closed', () => (controlWindow = null));
  productWindow.on('closed', () => (productWindow = null));
}

app.whenReady().then(() => {
  // Disable security warnings for development
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
  
  createWindows();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ------------------------ IPC: Product window control ------------------------
ipcMain.handle('open-product', async (_evt, url) => {
  if (!productWindow) return false;
  await productWindow.loadURL(url);
  return true;
});

ipcMain.handle('eval-in-product', async (_evt, js) => {
  if (!productWindow) throw new Error('No product window');
  return await productWindow.webContents.executeJavaScript(js);
});

// ------------------------ Injection: keep order + IIFE safety ----------------
const INJECT_ORDER = [
  'scrapers/utils.js',
  'scrapers/title.js',
  'scrapers/price.js',
  'scrapers/images.js',
  'scrapers/specs_tags.js',
  'scrapers/custom.js',
  'scrapers/orchestrator.js'
];

async function injectScraperFilesInOrder(wc) {
  for (const rel of INJECT_ORDER) {
    const abs = path.join(__dirname, rel);
    const code = fs.readFileSync(abs, 'utf8');
    const wrapped = `
      (function(){
        try { ${code} }
        catch (e) { console.error('Tagglo inject failed for ${rel}:', e && e.message); }
      })();
    `;
    await wc.executeJavaScript(wrapped);
  }
}

// ------------------------ Page-ready probe (Pinterest flow) ------------------
const WAIT_READY_SNIPPET = `
(function(){
  if (globalThis.__taggloWaitReady) return;
  globalThis.__taggloWaitReady = function waitForPDPReady(opts = {}) {
    const { timeoutMs = 15000, quietMs = 800, minImgNodes = 1 } = opts;

    const hasProductJSONLD = () => {
      try {
        for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
          const data = JSON.parse(s.textContent || "null");
          const arr = Array.isArray(data) ? data : [data];
          if (arr.some(n => {
            const t = [].concat(n?.["@type"] || []).map(String);
            return t.some(x => /product/i.test(x));
          })) return true;
        }
      } catch {}
      return false;
    };

    const keySelectors = [
      "h1,[itemprop='name']",
      "[itemprop='price'],[data-price],[class*='price'] .money",
      "picture source[srcset], img[src], [data-zoom-image], [data-large-image]"
    ];

    const hasAny = (sel) => !!document.querySelector(sel);
    const hasImages = () => document.querySelectorAll("img[src], picture source[srcset], [data-zoom-image], [data-large-image]").length >= minImgNodes;

    return new Promise((resolve) => {
      const start = Date.now();
      let lastMut = Date.now();
      const mo = new MutationObserver(() => { lastMut = Date.now(); });
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

      const tick = () => {
        const gotKeys = keySelectors.some(hasAny);
        const gotJSON = hasProductJSONLD();
        theImgs = hasImages();
        const quiet = (Date.now() - lastMut) >= quietMs;
        if ((gotKeys || gotJSON) && theImgs && quiet) {
          mo.disconnect(); resolve(true); return;
        }
        if (Date.now() - start > timeoutMs) {
          mo.disconnect(); resolve(false); return;
        }
        setTimeout(tick, 150);
      };
      tick();
    });
  };
})();`;

// ------------------------ IPC: Scrape on Save (no auto) ----------------------
ipcMain.handle('scrape-current', async () => {
  if (!productWindow) throw new Error('No product window');
  const wc = productWindow.webContents;

  await injectScraperFilesInOrder(wc);
  await wc.executeJavaScript(WAIT_READY_SNIPPET);
  await wc.executeJavaScript(`__taggloWaitReady ? __taggloWaitReady({ timeoutMs: 12000, quietMs: 700, minImgNodes: 1 }) : true`);

  const result = await wc.executeJavaScript(`
    (async () => {
      const fn = (globalThis.scrapeProduct || (globalThis.__TAGGLO__ && globalThis.__TAGGLO__.scrapeProduct));
      if (!fn) throw new Error("scrapeProduct not found");
      return await fn();
    })();
  `);

  let selectorsUsed = null;
  try { selectorsUsed = await wc.executeJavaScript(`(globalThis.__tg_lastSelectorsUsed || null)`); } catch {}
  return { result, selectorsUsed };
});

// ------------------------ IPC: Selector memory (main-owned) ------------------
ipcMain.handle('selector-memory:get', async (_evt, urlOrHost) => {
  const host = urlOrHost.includes('://') ? hostKeyFromUrl(urlOrHost) : urlOrHost.replace(/^www\./,'');
  return selectorMemory.get(host);
});
ipcMain.handle('selector-memory:getHistory', async (_evt, urlOrHost) => {
  const host = urlOrHost.includes('://') ? hostKeyFromUrl(urlOrHost) : urlOrHost.replace(/^www\./,'');
  return selectorMemory.getHistory(host);
});
ipcMain.handle('selector-memory:set', async (_evt, urlOrHost, fields, note) => {
  const host = urlOrHost.includes('://') ? hostKeyFromUrl(urlOrHost) : urlOrHost.replace(/^www\./,'');
  return selectorMemory.set(host, fields || {}, note);
});
ipcMain.handle('selector-memory:clear', async (_evt, urlOrHost, keys) => {
  const host = urlOrHost.includes('://') ? hostKeyFromUrl(urlOrHost) : urlOrHost.replace(/^www\./,'');
  selectorMemory.clear(host, keys);
  return true;
});
