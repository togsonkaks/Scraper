// main.js — FULL (with Inspect-at + warm-up + compare + DevTools)
try { require('dotenv').config(); } catch {}
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');

// File-based selector storage helpers
const SELECTORS_DIR = path.join(app.getPath('userData'), 'selectors');
const LLM_CACHE_DIR = path.join(app.getPath('userData'), 'llm_cache');
const crypto = require('crypto');

// Unified domain normalization - consistent with orchestrator.js
function normalizeHost(hostname) {
  if (!hostname) return '';
  return hostname.toLowerCase().replace(/^www\./, '');
}

function sanitizeHostname(host) {
  // First normalize the host, then sanitize for filename
  const normalized = normalizeHost(host);
  return normalized.replace(/[^a-zA-Z0-9.-]/g, '_');
}

function getSelectorFilePath(host) {
  return path.join(SELECTORS_DIR, `${sanitizeHostname(host)}.json`);
}

function readSelectorFile(host) {
  try {
    const filePath = getSelectorFilePath(host);
    if (!fs.existsSync(filePath)) return null;
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error('Error reading selector file:', e);
    return null;
  }
}

function writeSelectorFile(host, data) {
  try {
    // Ensure directory exists
    if (!fs.existsSync(SELECTORS_DIR)) {
      fs.mkdirSync(SELECTORS_DIR, { recursive: true });
    }
    
    const filePath = getSelectorFilePath(host);
    const fileData = {
      host,
      updated: new Date().toISOString(),
      ...data
    };
    fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));
    return true;
  } catch (e) {
    console.error('Error writing selector file:', e);
    return false;
  }
}

function deleteSelectorFile(host) {
  try {
    const filePath = getSelectorFilePath(host);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  } catch (e) {
    console.error('Error deleting selector file:', e);
    return false;
  }
}

// LLM Cache storage helpers
function createUrlHash(url) {
  // Create a hash of the URL for consistent file naming
  return crypto.createHash('md5').update(url).digest('hex');
}

function getLLMCacheFilePath(url) {
  const urlHash = createUrlHash(url);
  const host = new URL(url).hostname;
  const sanitizedHost = sanitizeHostname(host);
  return path.join(LLM_CACHE_DIR, `${sanitizedHost}_${urlHash}.json`);
}

function readLLMCache(url) {
  try {
    const filePath = getLLMCacheFilePath(url);
    if (!fs.existsSync(filePath)) return null;
    const data = fs.readFileSync(filePath, 'utf8');
    const cached = JSON.parse(data);
    
    // Check if cache is not too old (e.g., 7 days)
    const cacheAge = Date.now() - new Date(cached.timestamp).getTime();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    
    if (cacheAge > maxAge) {
      // Cache is too old, delete it
      fs.unlinkSync(filePath);
      return null;
    }
    
    return cached;
  } catch (e) {
    console.error('Error reading LLM cache file:', e);
    return null;
  }
}

function writeLLMCache(url, results, optimization = {}) {
  try {
    // Ensure directory exists
    if (!fs.existsSync(LLM_CACHE_DIR)) {
      fs.mkdirSync(LLM_CACHE_DIR, { recursive: true });
    }
    
    const filePath = getLLMCacheFilePath(url);
    const cacheData = {
      url,
      timestamp: new Date().toISOString(),
      results,
      optimization,
      host: new URL(url).hostname
    };
    
    fs.writeFileSync(filePath, JSON.stringify(cacheData, null, 2));
    console.log('LLM cache saved for:', url);
    return true;
  } catch (e) {
    console.error('Error writing LLM cache file:', e);
    return false;
  }
}

function checkLLMCacheExists(url) {
  try {
    const cached = readLLMCache(url);
    return cached !== null;
  } catch (e) {
    return false;
  }
}

function deleteLLMCache(url) {
  try {
    const filePath = getLLMCacheFilePath(url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  } catch (e) {
    console.error('Error deleting LLM cache file:', e);
    return false;
  }
}

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
  
  // Add error handling for network failures
  productWin.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`Navigation failed for ${validatedURL}: ${errorCode} - ${errorDescription}`);
    if (controlWin && !controlWin.isDestroyed()) {
      controlWin.webContents.send('navigation-error', {
        url: validatedURL,
        errorCode,
        errorDescription: errorDescription || `Network error (${errorCode})`
      });
    }
  });
  
  productWin.webContents.on('did-fail-navigate', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`Navigation failed for ${validatedURL}: ${errorCode} - ${errorDescription}`);
    if (controlWin && !controlWin.isDestroyed()) {
      controlWin.webContents.send('navigation-error', {
        url: validatedURL,
        errorCode,
        errorDescription: errorDescription || `Navigation failed (${errorCode})`
      });
    }
  });
  
  productWin.on('closed', () => { productWin = null; });
  return productWin;
}

// Migration from localStorage to file-based storage
function migrateFromLocalStorage() {
  try {
    console.log('Starting localStorage migration check...');
    
    // Create a hidden window to access localStorage
    const migrationWin = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
      }
    });
    
    // Navigate to a data URL to have a valid origin for localStorage
    migrationWin.loadURL('data:text/html,<html><body>Migration</body></html>');
    
    migrationWin.webContents.once('dom-ready', async () => {
      try {
        const localStorageData = await migrationWin.webContents.executeJavaScript(`
          (() => {
            try {
              const raw = localStorage.getItem('selector_memory_v2');
              return raw ? JSON.parse(raw) : null;
            } catch (e) {
              console.error('Migration localStorage read error:', e);
              return null;
            }
          })()
        `);
        
        if (localStorageData && Object.keys(localStorageData).length > 0) {
          console.log('Found localStorage data, migrating:', Object.keys(localStorageData));
          let migratedCount = 0;
          
          for (const [host, hostData] of Object.entries(localStorageData)) {
            try {
              // Check if file already exists to avoid overwriting
              if (!readSelectorFile(host)) {
                const success = writeSelectorFile(host, {
                  ...hostData,
                  __migrated: true,
                  __migrationDate: new Date().toISOString()
                });
                if (success) {
                  migratedCount++;
                  console.log(`Migrated data for host: ${host}`);
                }
              }
            } catch (e) {
              console.error(`Failed to migrate data for host ${host}:`, e);
            }
          }
          
          if (migratedCount > 0) {
            console.log(`Successfully migrated ${migratedCount} host configurations`);
          }
        } else {
          console.log('No localStorage data found to migrate');
        }
      } catch (e) {
        console.error('Migration error:', e);
      } finally {
        migrationWin.destroy();
      }
    });
  } catch (e) {
    console.error('Failed to start migration:', e);
  }
}

/* ========= App lifecycle ========= */
app.whenReady().then(() => {
  // Run migration first
  setTimeout(migrateFromLocalStorage, 1000);
  
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
  
  // Get current URL to determine host
  const currentURL = await win.webContents.executeJavaScript('location.href');
  const host = normalizeHost(new URL(currentURL).hostname);
  
  // Load memory data for injection
  const allMemory = {};
  try {
    const files = fs.readdirSync(SELECTORS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const sanitizedHost = file.replace('.json', '');
      // Convert sanitized filename back to normalized host
      const fileHost = sanitizedHost.replace(/_/g, '.');
      const data = readSelectorFile(fileHost);
      if (data) {
        // Convert to orchestrator-compatible format
        const { __history, host: hostField, updated, __migrated, __migrationDate, ...selectorData } = data;
        // Use normalized host as key for consistency
        const normalizedFileHost = normalizeHost(fileHost);
        allMemory[normalizedFileHost] = selectorData;
      }
    }
  } catch (e) {
    console.log('Error loading memory for injection:', e);
  }
  
  const orchPath = path.join(__dirname, 'scrapers', 'orchestrator.js');
  const customPath = path.join(__dirname, 'scrapers', 'custom.js');
  const orchSource = fs.readFileSync(orchPath, 'utf8');
  const customSource = fs.readFileSync(customPath, 'utf8');
  const injected = `
    (async () => {
      try {
        // Inject memory data
        globalThis.__tg_injectedMemory = ${JSON.stringify(allMemory)};
        
        
        ${warmupScrollJS()}
        
        // CRITICAL: Load custom.js FIRST to expose getCustomHandlers
        ${customSource}
        
        // Then load orchestrator.js which uses getCustomHandlers
        ${orchSource}
        
        const out = await scrapeProduct(Object.assign({}, ${JSON.stringify({ mode:'control' })}, ${JSON.stringify(opts)}));
        return { result: out, selectorsUsed: (globalThis.__tg_lastSelectorsUsed||null) };
      } catch(e) { return { result: { __error: String(e) }, selectorsUsed: null }; }
    })();
  `;
  return win.webContents.executeJavaScript(injected, true);
});

ipcMain.handle('scrape-original', async (_e, opts = {}) => {
  const win = ensureProduct();
  
  // Load your modular scripts
  const utilsPath = path.join(__dirname, 'scrapers', 'utils.js');
  const titlePath = path.join(__dirname, 'scrapers', 'title.js');
  const pricePath = path.join(__dirname, 'scrapers', 'price.js');
  const imagesPath = path.join(__dirname, 'scrapers', 'images.js');
  const specsTagsPath = path.join(__dirname, 'scrapers', 'specs_tags.js');
  
  const utilsSource = fs.readFileSync(utilsPath, 'utf8');
  const titleSource = fs.readFileSync(titlePath, 'utf8');
  const priceSource = fs.readFileSync(pricePath, 'utf8');
  const imagesSource = fs.readFileSync(imagesPath, 'utf8');
  const specsTagsSource = fs.readFileSync(specsTagsPath, 'utf8');
  
  const injected = `
    (async () => {
      try {
        ${warmupScrollJS()}
        
        // Load your modular scripts in order
        ${utilsSource}
        ${titleSource}
        ${priceSource}
        ${imagesSource}
        ${specsTagsSource}
        
        // Call your original functions directly
        const titleResult = getTitleGeneric();
        const brandResult = getBrandGeneric(); 
        const priceResult = getPriceGeneric();
        const images = await collectImagesFromPDP();
        const specs = collectSpecs();
        const tags = collectTags();
        const gender = guessGender();
        const sku = getSKU();
        
        const result = {
          title: titleResult?.text || titleResult || '',
          brand: brandResult?.text || brandResult || '',
          price: priceResult?.text || priceResult || '',
          images: Array.isArray(images) ? images : [],
          specs: Array.isArray(specs) ? specs : [],
          tags: Array.isArray(tags) ? tags : [],
          gender: gender || '',
          sku: sku || '',
          url: location.href,
          timestamp: new Date().toISOString(),
          mode: 'original-modular'
        };
        
        return { result, selectorsUsed: null };
      } catch(e) { 
        return { result: { __error: String(e) }, selectorsUsed: null }; 
      }
    })();
  `;
  return win.webContents.executeJavaScript(injected, true);
});

/* ========= LLM agent ========= */
ipcMain.handle('llm-propose', async (_e, payload) => {
  try {
    const { proposeSelectors } = require(path.join(__dirname, 'scrapers', 'llm_agent'));
    const url = payload.url;
    
    // Check for cached results first
    if (url && !payload.forceFresh) {
      const cached = readLLMCache(url);
      if (cached) {
        console.log('Using cached LLM results for:', url);
        return {
          ok: true,
          results: cached.results,
          optimization: cached.optimization,
          fromCache: true,
          cacheTimestamp: cached.timestamp
        };
      }
    }
    
    // Create eval function that can test selectors in the product window
    const evalFunction = async (code) => {
      const win = ensureProduct();
      return await win.webContents.executeJavaScript(code, true);
    };
    
    // Use the new intelligent validation system
    const result = await proposeSelectors({
      ...(payload || {}),
      evalFunction
    });
    
    // Save results to cache if successful and URL provided
    if (result && result.ok && url) {
      writeLLMCache(url, result.results || result, result.optimization || {});
    }
    
    // Handle new response format
    if (result && typeof result === 'object' && result.hasOwnProperty('ok')) {
      return result; // New format with validation results
    } else {
      return { ok: true, selectors: result }; // Backwards compatibility for array response
    }
  } catch (e) { 
    return { ok: false, error: String(e) }; 
  }
});

// LLM Cache management IPC handlers
ipcMain.handle('llm-cache-check', async (_e, url) => {
  try {
    return checkLLMCacheExists(url);
  } catch (e) {
    return false;
  }
});

ipcMain.handle('llm-cache-get', async (_e, url) => {
  try {
    return readLLMCache(url);
  } catch (e) {
    return null;
  }
});

ipcMain.handle('llm-cache-delete', async (_e, url) => {
  try {
    return deleteLLMCache(url);
  } catch (e) {
    return false;
  }
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
      
      // Load memory data for injection
      const allMemory = {};
      try {
        const files = fs.readdirSync(SELECTORS_DIR).filter(f => f.endsWith('.json'));
        for (const file of files) {
          const fileHost = file.replace('.json', '').replace(/_/g, '.');
          const data = readSelectorFile(fileHost);
          if (data) {
            // Convert to orchestrator-compatible format
            const { __history, host: hostField, updated, __migrated, __migrationDate, ...selectorData } = data;
            allMemory[fileHost] = selectorData;
          }
        }
      } catch (e) {
        console.log('Error loading memory for injection:', e);
      }
      
      const orchSource = fs.readFileSync(path.join(__dirname, 'scrapers', 'orchestrator.js'), 'utf8');
      const customSource = fs.readFileSync(path.join(__dirname, 'scrapers', 'custom.js'), 'utf8');
      const injected = `
        (async () => {
          try {
            // Inject memory data
            globalThis.__tg_injectedMemory = ${JSON.stringify(allMemory)};
            
            ${warmupScrollJS()}
            
            // CRITICAL: Load custom.js FIRST to expose getCustomHandlers
            ${customSource}
            
            // Then load orchestrator.js which uses getCustomHandlers
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
  try {
    const hostData = readSelectorFile(host);
    if (!hostData) return false;
    const fields = Object.keys(hostData).filter(k => !['__history', 'host', 'updated'].includes(k));
    return fields.length > 0;
  } catch {
    return false;
  }
});

ipcMain.handle('memory-get', async (_e, host) => {
  return readSelectorFile(host);
});

ipcMain.handle('memory-set', async (_e, { host, data, note }) => {
  try {
    const current = readSelectorFile(host) || {};
    
    // Update with new data
    Object.assign(current, data);
    
    // Add history entry
    if (!current.__history) current.__history = [];
    current.__history.unshift({
      timestamp: new Date().toISOString(),
      note: note || 'Updated',
      fields: Object.keys(data)
    });
    current.__history = current.__history.slice(0, 10); // Keep last 10
    
    return writeSelectorFile(host, current);
  } catch {
    return false;
  }
});

ipcMain.handle('memory-clear', async (_e, host) => {
  return deleteSelectorFile(host);
});

ipcMain.handle('memory-clear-fields', async (_e, { host, fields }) => {
  try {
    const current = readSelectorFile(host) || {};
    
    // Remove specified fields
    fields.forEach(field => delete current[field]);
    
    // Check if any fields remain (except __history, host, updated)
    const remainingFields = Object.keys(current).filter(k => !['__history', 'host', 'updated'].includes(k));
    if (remainingFields.length === 0) {
      return deleteSelectorFile(host);
    } else {
      return writeSelectorFile(host, current);
    }
  } catch {
    return false;
  }
});

ipcMain.handle('validate-selectors', async (_e, host) => {
  const win = ensureProduct();
  
  // Get the saved selectors from file
  const savedSelectors = readSelectorFile(host) || {};
  const testResults = {};
  
  // Test each saved field
  for (const [field, selectorConfig] of Object.entries(savedSelectors)) {
    if (['__history', 'host', 'updated'].includes(field)) continue;
    
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
    return { ok: true, base, llm };
  } catch(e) { return { ok: false, error: String(e) }; }
});

// Migration IPC handler
ipcMain.handle('trigger-migration', async () => {
  try {
    migrateFromLocalStorage();
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

// Enhanced memory-get that provides compatibility format
ipcMain.handle('memory-get-all', async () => {
  try {
    const files = fs.readdirSync(SELECTORS_DIR).filter(f => f.endsWith('.json'));
    const allData = {};
    
    for (const file of files) {
      const host = file.replace('.json', '').replace(/_/g, '.');
      const data = readSelectorFile(host);
      if (data) {
        // Convert to localStorage-compatible format for backwards compatibility
        const { __history, host: hostField, updated, __migrated, __migrationDate, ...selectorData } = data;
        allData[host] = selectorData;
      }
    }
    
    return allData;
  } catch (e) {
    console.error('Error reading all memory data:', e);
    return {};
  }
});
