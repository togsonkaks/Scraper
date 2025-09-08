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

// ------------------------ Developer Tools Setup ------------------------
function addContextMenu(window) {
  window.webContents.on('context-menu', (e, params) => {
    const { Menu, MenuItem } = require('electron');
    const menu = new Menu();
    
    // Add "Inspect Element" option
    menu.append(new MenuItem({
      label: 'Inspect Element',
      click: () => {
        window.webContents.inspectElement(params.x, params.y);
      }
    }));
    
    // Add "Open DevTools" option
    menu.append(new MenuItem({
      label: 'Open Developer Tools',
      accelerator: 'F12',
      click: () => {
        window.webContents.openDevTools();
      }
    }));
    
    menu.popup();
  });
}

function setupDevToolsShortcuts() {
  const { globalShortcut } = require('electron');
  
  // F12 - Toggle DevTools for focused window
  globalShortcut.register('F12', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      focusedWindow.webContents.toggleDevTools();
    }
  });
  
  // Ctrl+Shift+I - Toggle DevTools for focused window  
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      focusedWindow.webContents.toggleDevTools();
    }
  });
}

// ------------------------ Create Windows ------------------------
function createWindows() {
  controlWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow local resource access for debugging
      devTools: true      // Enable developer tools
    }
  });

  productWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow local resource access for debugging  
      devTools: true      // Enable developer tools
    }
  });

  controlWindow.loadFile(path.join(__dirname, 'control.html'));
  controlWindow.on('closed', () => (controlWindow = null));
  productWindow.on('closed', () => (productWindow = null));
  
  // Add context menu for both windows
  addContextMenu(controlWindow);
  addContextMenu(productWindow);
}

app.whenReady().then(() => {
  // Disable security warnings for development
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
  
  createWindows();
  setupDevToolsShortcuts(); // Enable keyboard shortcuts

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  // Clean up global shortcuts
  const { globalShortcut } = require('electron');
  globalShortcut.unregisterAll();
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

// ------------------------ IPC: Selector Validation -------------------------
ipcMain.handle('validate-selectors', async (_evt, urlOrHost) => {
  if (!productWindow) throw new Error('No product window');
  
  const host = urlOrHost.includes('://') ? hostKeyFromUrl(urlOrHost) : urlOrHost.replace(/^www\./,'');
  const savedSelectors = selectorMemory.get(host);
  
  const wc = productWindow.webContents;
  
  // Inject all scraper files first (like actual scraping does)
  await injectScraperFilesInOrder(wc);
  await wc.executeJavaScript(WAIT_READY_SNIPPET);
  await wc.executeJavaScript(`__taggloWaitReady ? __taggloWaitReady({ timeoutMs: 8000, quietMs: 500, minImgNodes: 1 }) : true`);
  
  // Now run the SAME logic as actual scraping but return detailed results per field
  const validationScript = `
    (async () => {
      const savedSelectors = ${JSON.stringify(savedSelectors || {})};
      const host = ${JSON.stringify(host)};
      const results = {};
      
      // Use the SAME memory functions that orchestrator uses
      const tryMemoryText = (memField, validators = []) => {
        if (!memField?.selectors) return null;
        const selectors = Array.isArray(memField.selectors) ? memField.selectors : [memField.selectors];
        const attr = memField.attr || 'text';
        
        for (const sel of selectors) {
          try {
            // Special handling for JSON-LD
            if (sel === 'script[type="application/ld+json"]' && attr === 'json') {
              const scripts = document.querySelectorAll('script[type="application/ld+json"]');
              for (const script of scripts) {
                try {
                  const data = JSON.parse(script.textContent.trim());
                  const arr = Array.isArray(data) ? data : [data];
                  for (const node of arr) {
                    const types = [].concat(node?.["@type"] || []).map(String);
                    if (types.some(t => /product/i.test(t))) {
                      const brand = node.brand?.name || node.brand || node.manufacturer?.name || "";
                      if (brand && typeof brand === 'string' && brand.trim()) {
                        const value = brand.trim();
                        if (validators.every(v => v(value))) {
                          return { value, selUsed: { selector: sel, attr, method: 'memory' } };
                        }
                      }
                    }
                  }
                } catch (e) {}
              }
              continue;
            }
            
            const elements = document.querySelectorAll(sel);
            if (elements.length === 0) continue;
            
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
              
              if (value && validators.every(v => v(value))) {
                return { value, selUsed: { selector: sel, attr, method: 'memory' } };
              }
            }
          } catch (e) {}
        }
        return null;
      };
      
      const tryMemoryImages = (memField, limit = 10) => {
        if (!memField?.selectors) return null;
        const selectors = Array.isArray(memField.selectors) ? memField.selectors : [memField.selectors];
        
        for (const sel of selectors) {
          try {
            if (sel === 'generic-images' && typeof collectImagesFromPDP === 'function') {
              const images = await collectImagesFromPDP();
              if (Array.isArray(images) && images.length > 0) {
                return { 
                  value: images.slice(0, limit), 
                  selUsed: { selector: sel, attr: 'src', method: 'memory-generic' } 
                };
              }
              continue;
            }
            
            const elements = document.querySelectorAll(sel);
            if (elements.length === 0) continue;
            
            const images = [];
            for (const el of elements) {
              let src = null;
              if (memField.attr === 'src') {
                src = el.currentSrc || el.src || el.getAttribute('src');
              } else if (memField.attr === 'content') {
                src = el.getAttribute('content');
              } else {
                src = el.getAttribute(memField.attr || 'src');
              }
              if (src) images.push(src);
            }
            
            if (images.length > 0) {
              return { 
                value: images.slice(0, limit), 
                selUsed: { selector: sel, attr: memField.attr || 'src', method: 'memory' } 
              };
            }
          } catch (e) {}
        }
        return null;
      };
      
      const tryMemoryPrice = (memField) => {
        if (!memField?.selectors) return null;
        const selectors = Array.isArray(memField.selectors) ? memField.selectors : [memField.selectors];
        const attr = memField.attr || 'text';
        
        for (const sel of selectors) {
          try {
            if (sel === 'script[type="application/ld+json"]' && attr === 'json') {
              const scripts = document.querySelectorAll('script[type="application/ld+json"]');
              for (const script of scripts) {
                try {
                  const data = JSON.parse(script.textContent.trim());
                  const arr = Array.isArray(data) ? data : [data];
                  for (const node of arr) {
                    const types = [].concat(node?.["@type"] || []).map(String);
                    if (types.some(t => /product/i.test(t))) {
                      const offers = [].concat(node.offers || []);
                      for (const offer of offers) {
                        const price = offer.price || offer.lowPrice || offer.highPrice || "";
                        if (price) {
                          return { value: String(price), selUsed: { selector: sel, attr, method: 'memory' } };
                        }
                      }
                    }
                  }
                } catch (e) {}
              }
              continue;
            }
            
            const elements = document.querySelectorAll(sel);
            if (elements.length === 0) continue;
            
            for (const el of elements) {
              let value = null;
              if (attr === 'text') {
                value = (el.textContent || '').trim();
              } else if (attr === 'content') {
                value = el.getAttribute('content');
              } else {
                value = el.getAttribute(attr) || (el.textContent || '').trim();
              }
              
              if (value) {
                return { value, selUsed: { selector: sel, attr, method: 'memory' } };
              }
            }
          } catch (e) {}
        }
        return null;
      };
      
      // Test TITLE with same logic as orchestrator
      let titleResult = null;
      try {
        if (savedSelectors?.title) {
          const got = tryMemoryText(savedSelectors.title, [v => v.length > 1]);
          if (got) {
            titleResult = { success: true, value: got.value, source: 'memory', selector: got.selUsed };
          }
        }
        if (!titleResult && typeof getTitleGeneric === 'function') {
          const genericTitle = getTitleGeneric(document);
          if (genericTitle) {
            titleResult = { 
              success: true, 
              value: typeof genericTitle === 'string' ? genericTitle : genericTitle.text,
              source: 'generic-fallback',
              selector: typeof genericTitle === 'object' ? genericTitle : { method: 'generic' }
            };
          }
        }
      } catch (e) {
        console.error('Title validation error:', e);
      }
      if (!titleResult) {
        titleResult = { success: false, value: 'Title not found', source: 'none' };
      }
      results.title = titleResult;
      
      // Test PRICE with same logic as orchestrator
      let priceResult = null;
      try {
        if (savedSelectors?.price) {
          const got = tryMemoryPrice(savedSelectors.price);
          if (got) {
            priceResult = { success: true, value: got.value, source: 'memory', selector: got.selUsed };
          }
        }
        if (!priceResult && typeof getPriceGeneric === 'function') {
          const genericPrice = getPriceGeneric();
          if (genericPrice) {
            priceResult = { 
              success: true, 
              value: typeof genericPrice === 'string' ? genericPrice : genericPrice.text,
              source: 'generic-fallback',
              selector: typeof genericPrice === 'object' ? genericPrice : { method: 'generic' }
            };
          }
        }
      } catch (e) {
        console.error('Price validation error:', e);
      }
      if (!priceResult) {
        priceResult = { success: false, value: 'Price not found', source: 'none' };
      }
      results.price = priceResult;
      
      // Test IMAGES with same logic as orchestrator
      let imagesResult = null;
      try {
        if (savedSelectors?.images) {
          const got = tryMemoryImages(savedSelectors.images, 10);
          if (got && Array.isArray(got.value) && got.value.length) {
            imagesResult = { success: true, value: got.value, source: 'memory', selector: got.selUsed };
          }
        }
        if (!imagesResult && typeof collectImagesFromPDP === 'function') {
          const genericImages = await collectImagesFromPDP();
          if (Array.isArray(genericImages) && genericImages.length > 0) {
            imagesResult = { 
              success: true, 
              value: genericImages.slice(0, 20),
              source: 'generic-fallback',
              selector: { selector: 'generic-images', attr: 'src', method: 'generic' }
            };
          }
        }
      } catch (e) {
        console.error('Images validation error:', e);
      }
      if (!imagesResult) {
        imagesResult = { success: false, value: [], source: 'none' };
      }
      results.images = imagesResult;
      
      // Test BRAND with same logic as orchestrator
      let brandResult = null;
      try {
        if (savedSelectors?.brand) {
          const got = tryMemoryText(savedSelectors.brand);
          if (got) {
            brandResult = { success: true, value: got.value, source: 'memory', selector: got.selUsed };
          }
        }
        if (!brandResult && typeof getBrandGeneric === 'function') {
          const genericBrand = getBrandGeneric();
          if (genericBrand) {
            brandResult = { 
              success: true, 
              value: typeof genericBrand === 'string' ? genericBrand : genericBrand.text,
              source: 'generic-fallback',
              selector: typeof genericBrand === 'object' ? genericBrand : { method: 'generic' }
            };
          }
        }
      } catch (e) {
        console.error('Brand validation error:', e);
      }
      if (!brandResult) {
        brandResult = { success: false, value: 'Brand not found', source: 'none' };
      }
      results.brand = brandResult;
      
      // Test DESCRIPTION with same logic as orchestrator
      let descResult = null;
      try {
        if (savedSelectors?.description) {
          const got = tryMemoryText(savedSelectors.description);
          if (got) {
            descResult = { success: true, value: got.value, source: 'memory', selector: got.selUsed };
          }
        }
        if (!descResult && typeof getDescriptionGeneric === 'function') {
          const genericDesc = getDescriptionGeneric(document);
          if (genericDesc) {
            descResult = { 
              success: true, 
              value: typeof genericDesc === 'string' ? genericDesc : genericDesc.text,
              source: 'generic-fallback',
              selector: typeof genericDesc === 'object' ? genericDesc : { method: 'generic' }
            };
          }
        }
      } catch (e) {
        console.error('Description validation error:', e);
      }
      if (!descResult) {
        descResult = { success: false, value: 'Description not found', source: 'none' };
      }
      results.description = descResult;
      
      return {
        savedSelectors,
        testResults: results
      };
    })();
  `;
  
  try {
    const result = await wc.executeJavaScript(validationScript);
    return result;
  } catch (error) {
    return {
      savedSelectors: savedSelectors || {},
      testResults: {},
      error: error.message
    };
  }
});
