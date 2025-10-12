// main.js — FULL (with Inspect-at + warm-up + compare + DevTools)
try { require('dotenv').config(); } catch {}
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const http = require('http');

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
    await new Promise(r => setTimeout(r, 300));
    
    // Optimized scroll - trigger lazy loading quickly
    const originalY = window.scrollY;
    console.log('🔄 Quick scroll to trigger lazy loading...');
    
    // Scroll down 300px to trigger lazy loading
    window.scrollTo({ top: originalY + 300, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 300));
    
    // Scroll back to original
    window.scrollTo({ top: originalY, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 400));
    
    console.log('✅ Scroll complete - lazy loading triggered! (1000ms total)');
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

// Clear old localStorage data (fresh start)
function clearOldLocalStorage() {
  try {
    console.log('Clearing old localStorage memory data...');
    
    // Create a hidden window to access localStorage
    const clearWin = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
      }
    });
    
    // Navigate to a data URL to have a valid origin for localStorage
    clearWin.loadURL('data:text/html,<html><body>Clear</body></html>');
    
    clearWin.webContents.once('dom-ready', async () => {
      try {
        const cleared = await clearWin.webContents.executeJavaScript(`
          (() => {
            try {
              const existed = localStorage.getItem('selector_memory_v2') !== null;
              localStorage.removeItem('selector_memory_v2');
              return existed;
            } catch (e) {
              console.error('localStorage clear error:', e);
              return false;
            }
          })()
        `);
        
        if (cleared) {
          console.log('✅ Cleared old localStorage memory data');
        } else {
          console.log('No old localStorage data found');
        }
      } catch (e) {
        console.error('Clear error:', e);
      } finally {
        clearWin.destroy();
      }
    });
  } catch (e) {
    console.error('Failed to clear localStorage:', e);
  }
}

/* ========= App lifecycle ========= */
app.whenReady().then(() => {
  // Clear old localStorage on startup
  setTimeout(clearOldLocalStorage, 1000);
  
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
  
  // Get current URL for automatic debug logging
  const currentURL = await win.webContents.executeJavaScript('location.href');
  
  // Start automatic debug logging
  await win.webContents.executeJavaScript(`
    if (typeof window.startDebugLogging === 'function') {
      window.startDebugLogging('${currentURL}');
      console.log('🤖 AUTO: Debug logging started for scrape operation');
    }
  `);
  
  // Get host from the current URL
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
  const debugLoggerPath = path.join(__dirname, 'scrapers', 'debug_logger.js');
  const orchSource = fs.readFileSync(orchPath, 'utf8');
  const customSource = fs.readFileSync(customPath, 'utf8');
  const debugLoggerSource = fs.readFileSync(debugLoggerPath, 'utf8');
  const injected = `
    (async () => {
      try {
        // Inject memory data
        globalThis.__tg_injectedMemory = ${JSON.stringify(allMemory)};
        
        
        ${warmupScrollJS()}
        
        // FIRST: Load debug logger for automatic logging
        ${debugLoggerSource}
        
        // CRITICAL: Load custom.js FIRST to expose getCustomHandlers
        ${customSource}
        
        // Then load orchestrator.js which uses getCustomHandlers
        ${orchSource}
        
        const out = await scrapeProduct(Object.assign({}, ${JSON.stringify({ mode:'control' })}, ${JSON.stringify(opts)}));
        return { result: out, selectorsUsed: (globalThis.__tg_lastSelectorsUsed||null) };
      } catch(e) { return { result: { __error: String(e) }, selectorsUsed: null }; }
    })();
  `;
  
  try {
    const result = await win.webContents.executeJavaScript(injected, true);
    
    // Stop automatic debug logging after scrape completes
    await win.webContents.executeJavaScript(`
      if (typeof window.stopDebugLogging === 'function') {
        window.stopDebugLogging();
        console.log('🤖 AUTO: Debug logging stopped after scrape operation');
      }
    `);
    
    return result;
  } catch (error) {
    // Stop debug logging even if scrape fails
    await win.webContents.executeJavaScript(`
      if (typeof window.stopDebugLogging === 'function') {
        window.stopDebugLogging();
        console.log('🤖 AUTO: Debug logging stopped after scrape error');
      }
    `);
    throw error;
  }
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

ipcMain.handle('memory-delete-field', async (_e, { host, field }) => {
  try {
    const current = readSelectorFile(host);
    if (!current) return false;
    
    // Remove the specified field
    delete current[field];
    
    // Check if any fields remain (except __history, host, updated)
    const remainingFields = Object.keys(current).filter(k => !['__history', 'host', 'updated'].includes(k));
    if (remainingFields.length === 0) {
      // If no fields left, delete the entire file
      return deleteSelectorFile(host);
    }
    
    // Otherwise, save the updated data
    return writeSelectorFile(host, current);
  } catch (error) {
    console.error('Error deleting field:', error);
    return false;
  }
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

// Debug Logging IPC handlers - Simple file-based approach
ipcMain.handle('save-debug-file', async (_e, { filename, content }) => {
  try {
    // Save in project directory for easy access in Replit
    const debugLogsDir = path.join(__dirname, 'debug-logs');
    
    // Ensure debug-logs directory exists
    if (!fs.existsSync(debugLogsDir)) {
      fs.mkdirSync(debugLogsDir, { recursive: true });
    }
    
    const filePath = path.join(debugLogsDir, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    
    console.log(`✅ Saved debug log file: ${filePath}`);
    return { success: true, path: filePath };
  } catch (error) {
    console.error('❌ Error saving debug file:', error);
    return { success: false, error: error.message };
  }
});

// Legacy database handlers (keeping for compatibility)
ipcMain.handle('debug-save-logs', async (_e, { query }) => {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ query });
    const options = {
      hostname: 'localhost',
      port: 8000,
      path: '/api/save-debug-logs',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ success: true });
        }
      });
    });

    req.on('error', (error) => {
      console.error('Debug save error:', error);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
});

ipcMain.handle('debug-query-logs', async (_e, { query }) => {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ query });
    const options = {
      hostname: 'localhost',
      port: 8000,
      path: '/api/query-debug-logs',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      });
    });

    req.on('error', (error) => {
      console.error('Debug query error:', error);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
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

// Auto-tagging handler
ipcMain.handle('auto-tag-product', async (_e, productData) => {
  try {
    const { autoTag } = require(path.join(__dirname, 'scrapers', 'auto-tagger'));
    return autoTag(productData);
  } catch (e) {
    console.error('Error auto-tagging product:', e);
    throw e;
  }
});

// LLM tagging handler
ipcMain.handle('llm-tag-product', async (_e, productData) => {
  try {
    const { extractTagsWithLLM } = require(path.join(__dirname, 'server', 'llm-tagger'));
    return await extractTagsWithLLM(productData);
  } catch (e) {
    console.error('Error LLM tagging product:', e);
    throw e;
  }
});

// LLM retry with feedback handler
ipcMain.handle('llm-retry-with-feedback', async (_e, productData, feedback) => {
  try {
    const { retryWithFeedback } = require(path.join(__dirname, 'server', 'llm-tagger'));
    return await retryWithFeedback(productData, feedback);
  } catch (e) {
    console.error('Error LLM retry:', e);
    throw e;
  }
});

// Database save handler (legacy - with tags)
ipcMain.handle('save-to-database', async (_e, productData, tagResults) => {
  try {
    const { saveProduct } = require(path.join(__dirname, 'server', 'storage'));
    return await saveProduct(productData, tagResults);
  } catch (e) {
    console.error('Error saving to database:', e);
    throw e;
  }
});

// Save raw product (Phase 1: No tags - LLM will add later)
ipcMain.handle('save-raw-product', async (_e, productData) => {
  try {
    const { saveRawProduct } = require(path.join(__dirname, 'server', 'storage'));
    return await saveRawProduct(productData);
  } catch (e) {
    console.error('Error saving raw product:', e);
    throw e;
  }
});

// Update product with LLM tags (Phase 2: After AI analysis)
ipcMain.handle('update-product-tags', async (_e, productId, tagResults) => {
  try {
    const { updateProductTags } = require(path.join(__dirname, 'server', 'storage'));
    return await updateProductTags(productId, tagResults);
  } catch (e) {
    console.error('Error updating product tags:', e);
    throw e;
  }
});

// Seed full taxonomy (358 categories + 955 tags)
ipcMain.handle('seed-full-taxonomy', async (_e) => {
  try {
    const { seedFullTaxonomy } = require(path.join(__dirname, 'server', 'storage'));
    return await seedFullTaxonomy();
  } catch (e) {
    console.error('Error seeding taxonomy:', e);
    throw e;
  }
});

// Database query handler
ipcMain.handle('get-products', async (_e, filters) => {
  try {
    const { getProducts } = require(path.join(__dirname, 'server', 'storage'));
    return await getProducts(filters);
  } catch (e) {
    console.error('Error getting products:', e);
    throw e;
  }
});

// Database stats handler
ipcMain.handle('get-product-stats', async (_e) => {
  try {
    const { getProductStats } = require(path.join(__dirname, 'server', 'storage'));
    return await getProductStats();
  } catch (e) {
    console.error('Error getting stats:', e);
    throw e;
  }
});