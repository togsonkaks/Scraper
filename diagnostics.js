// diagnostics.js - Copy Diagnostics functionality
// Provides structured troubleshooting information for Tagglo

function summarizeDebug() {
  // Try to get debug log from multiple sources
  let debugEntries = [];
  
  // Source 1: Global debug log
  if (window.__tg_debugLog && Array.isArray(window.__tg_debugLog)) {
    debugEntries = window.__tg_debugLog;
  }
  
  // Source 2: Parse debug output from UI if no global log
  if (debugEntries.length === 0) {
    const debugOutput = document.getElementById('debugOutput');
    if (debugOutput) {
      const debugText = debugOutput.textContent || '';
      // Parse basic debug info from text
      const lines = debugText.split('\n').filter(line => line.trim());
      debugEntries = lines.map(line => ({
        message: line,
        level: line.includes('ERROR') ? 'error' : line.includes('WARN') ? 'warn' : 'info',
        timestamp: 'unknown'
      }));
    }
  }
  
  // Categorize debug entries
  const imageEntries = debugEntries.filter(entry => 
    entry.isImage || 
    entry.message.toLowerCase().includes('image') || 
    entry.message.includes('🖼️') || 
    entry.message.includes('📏') ||
    entry.message.includes('🔧')
  );
  
  const priceEntries = debugEntries.filter(entry => 
    entry.isPrice || 
    entry.message.toLowerCase().includes('price') || 
    entry.message.includes('💰')
  );
  
  const errorEntries = debugEntries.filter(entry => entry.level === 'error');
  const warnEntries = debugEntries.filter(entry => entry.level === 'warn');
  
  // Count kept vs rejected images
  const keptImages = imageEntries.filter(entry => entry.kept === true).length;
  const rejectedImages = imageEntries.filter(entry => entry.kept === false).length;
  
  // Get recent rejection reasons
  const rejectionReasons = imageEntries
    .filter(entry => entry.kept === false && entry.message)
    .map(entry => entry.message)
    .slice(-10); // Last 10 rejections
    
  return {
    totalEntries: debugEntries.length,
    imageEntries: imageEntries.length,
    priceEntries: priceEntries.length,
    errorEntries: errorEntries.length,
    warnEntries: warnEntries.length,
    keptImages,
    rejectedImages,
    rejectionReasons,
    recentErrors: errorEntries.slice(-5).map(entry => entry.message)
  };
}

function extractFieldResults() {
  const results = {};
  const fields = ['title', 'brand', 'price', 'description', 'images'];
  
  fields.forEach(field => {
    // Try multiple selectors to find field data
    let container = document.querySelector(`[data-field="${field}"]`) ||
                   document.querySelector(`.${field}`) ||
                   document.querySelector(`#${field}`);
    
    if (container) {
      const valueDiv = container.querySelector('.value') || 
                      container.querySelector('.content') ||
                      container;
      
      if (valueDiv) {
        if (field === 'images') {
          // For images, collect all img sources
          const imgs = valueDiv.querySelectorAll('img');
          const urls = Array.from(imgs).map(img => img.src).filter(src => src);
          results[field] = {
            found: urls.length > 0,
            count: urls.length,
            urls: urls.slice(0, 10), // Limit to first 10
            hasMore: urls.length > 10
          };
        } else {
          const text = valueDiv.textContent ? valueDiv.textContent.trim() : '';
          results[field] = {
            found: !!text,
            value: text,
            length: text.length,
            preview: text.length > 100 ? text.substring(0, 100) + '...' : text
          };
        }
      }
    } else {
      // Field container not found
      results[field] = {
        found: false,
        value: field === 'images' ? [] : 'Not found',
        count: field === 'images' ? 0 : undefined
      };
    }
  });
  
  return results;
}

function getSystemInfo() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: `${screen.width}x${screen.height}`,
    timestamp: new Date().toLocaleString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    host: location.host
  };
}

function getAICacheInfo() {
  return {
    aiCacheReady: window.aiCacheReady ?? false,
    llmCacheExists: window.llmCacheExists ?? false,
    cachedResultsStatus: window.cachedLLMResults?.status || 'none',
    cachedResultsCount: window.cachedLLMResults?.results ? 
      Object.keys(window.cachedLLMResults.results).length : 0
  };
}

function getSelectorsInfo() {
  const selectors = {};
  
  // Get selectors from global variables
  if (window.__tg_lastSelectorsUsed) {
    Object.assign(selectors, window.__tg_lastSelectorsUsed);
  }
  
  // Get selectors from lastPayload if available
  if (window.lastPayload && window.lastPayload.selectors) {
    Object.assign(selectors, window.lastPayload.selectors);
  }
  
  return selectors;
}

function buildDiagnostics() {
  const urlInput = document.getElementById('urlInput');
  const currentUrl = urlInput ? urlInput.value.trim() : '';
  
  let hostname = '';
  try {
    hostname = currentUrl ? new URL(currentUrl).hostname.replace(/^www\./, '') : '';
  } catch (e) {
    hostname = 'invalid-url';
  }
  
  const debugSummary = summarizeDebug();
  const fieldResults = extractFieldResults();
  const systemInfo = getSystemInfo();
  const aiCacheInfo = getAICacheInfo();
  const selectorsInfo = getSelectorsInfo();
  
  const diagnostics = {
    metadata: {
      timestamp: new Date().toISOString(),
      generated: new Date().toLocaleString(),
      version: 'Tagglo v1.0',
      type: 'diagnostic_report'
    },
    
    pageInfo: {
      url: currentUrl,
      hostname: hostname,
      currentHost: window.currentHost || hostname,
      pageTitle: document.title,
      lastPayloadUrl: window.lastPayload?.url || null
    },
    
    fieldResults: fieldResults,
    
    selectorsUsed: selectorsInfo,
    
    aiCache: aiCacheInfo,
    
    debugSummary: debugSummary,
    
    systemInfo: systemInfo,
    
    summary: {
      fieldsFound: Object.values(fieldResults).filter(field => field.found).length,
      totalFields: Object.keys(fieldResults).length,
      hasErrors: debugSummary.errorEntries > 0,
      hasWarnings: debugSummary.warnEntries > 0,
      imagesFoundCount: fieldResults.images?.count || 0,
      debugActivityLevel: debugSummary.totalEntries > 50 ? 'high' : 
                          debugSummary.totalEntries > 10 ? 'medium' : 'low'
    }
  };
  
  return diagnostics;
}

function formatDiagnosticsText(diagnostics) {
  const d = diagnostics;
  
  return `TAGGLO DIAGNOSTICS REPORT
Generated: ${d.metadata.generated}
Report ID: ${d.metadata.timestamp}

═══ PAGE INFO ═══
URL: ${d.pageInfo.url}
Hostname: ${d.pageInfo.hostname}
Page Title: ${d.pageInfo.pageTitle}

═══ SCRAPING RESULTS ═══
Fields Found: ${d.summary.fieldsFound}/${d.summary.totalFields}

Title: ${d.fieldResults.title?.found ? '✅ FOUND' : '❌ NOT FOUND'} ${d.fieldResults.title?.length ? `(${d.fieldResults.title.length} chars)` : ''}
${d.fieldResults.title?.preview || 'Not extracted'}

Brand: ${d.fieldResults.brand?.found ? '✅ FOUND' : '❌ NOT FOUND'}
${d.fieldResults.brand?.preview || 'Not extracted'}

Price: ${d.fieldResults.price?.found ? '✅ FOUND' : '❌ NOT FOUND'}
${d.fieldResults.price?.preview || 'Not extracted'}

Description: ${d.fieldResults.description?.found ? '✅ FOUND' : '❌ NOT FOUND'} ${d.fieldResults.description?.length ? `(${d.fieldResults.description.length} chars)` : ''}
${d.fieldResults.description?.preview || 'Not extracted'}

Images: ${d.fieldResults.images?.found ? '✅ FOUND' : '❌ NOT FOUND'} (${d.fieldResults.images?.count || 0} total)
${d.fieldResults.images?.urls?.slice(0, 3).join('\n') || 'No images extracted'}
${d.fieldResults.images?.hasMore ? '... and more' : ''}

═══ DEBUG ACTIVITY ═══
Total Debug Entries: ${d.debugSummary.totalEntries} (${d.summary.debugActivityLevel} activity)
Image Processing: ${d.debugSummary.imageEntries} entries (${d.debugSummary.keptImages} kept, ${d.debugSummary.rejectedImages} rejected)
Price Processing: ${d.debugSummary.priceEntries} entries
Errors: ${d.debugSummary.errorEntries}
Warnings: ${d.debugSummary.warnEntries}

Recent Errors:
${d.debugSummary.recentErrors.slice(0, 3).map(err => `• ${err}`).join('\n') || '(none)'}

Image Rejection Reasons (recent):
${d.debugSummary.rejectionReasons.slice(0, 5).map(reason => `• ${reason}`).join('\n') || '(none)'}

═══ SELECTORS USED ═══
${Object.entries(d.selectorsUsed).map(([field, selectors]) => 
  `${field}: ${Array.isArray(selectors) ? selectors.join(', ') : selectors || 'none'}`
).join('\n') || '(no selectors recorded)'}

═══ AI CACHE STATUS ═══
Cache Ready: ${d.aiCache.aiCacheReady ? '✅ Yes' : '❌ No'}
LLM Cache Exists: ${d.aiCache.llmCacheExists ? '✅ Yes' : '❌ No'}
Cached Results: ${d.aiCache.cachedResultsCount} fields

═══ SYSTEM INFO ═══
Viewport: ${d.systemInfo.viewport}
Platform: ${d.systemInfo.platform}
Browser: ${d.systemInfo.userAgent.split(' ').pop()}
Timezone: ${d.systemInfo.timezone}
Generated: ${d.systemInfo.timestamp}

═══ RAW DATA (JSON) ═══
${JSON.stringify(d, null, 2)}
`;
}

async function copyDiagnostics(e) {
  const button = e.target;
  const originalText = button.textContent;
  
  try {
    // Disable button during processing
    button.disabled = true;
    button.textContent = '📋 Generating...';
    
    const diagnostics = buildDiagnostics();
    const diagnosticText = formatDiagnosticsText(diagnostics);
    
    // Copy to clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(diagnosticText);
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = diagnosticText;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    
    // Success feedback
    button.textContent = '✅ Copied!';
    button.style.background = '#4CAF50';
    
    // Also log to console for debugging
    console.log('Diagnostics copied:', diagnostics);
    
    setTimeout(() => {
      button.textContent = originalText;
      button.style.background = '';
      button.disabled = false;
    }, 1500);
    
  } catch (error) {
    console.error('Error generating diagnostics:', error);
    
    // Error feedback
    button.textContent = '❌ Error';
    button.style.background = '#f44336';
    
    setTimeout(() => {
      button.textContent = originalText;
      button.style.background = '';
      button.disabled = false;
    }, 2000);
    
    // Show error to user
    alert(`❌ Error generating diagnostics: ${error.message}`);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  const copyBtn = document.getElementById('copyDiagnosticsBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', copyDiagnostics);
    console.log('Diagnostics: Copy button listener attached');
  } else {
    console.warn('Diagnostics: Copy button not found');
  }
});

// Also try immediate attachment in case DOM is already loaded
if (document.readyState === 'loading') {
  // DOM not ready, wait for DOMContentLoaded
} else {
  // DOM already loaded, attach immediately
  const copyBtn = document.getElementById('copyDiagnosticsBtn');
  if (copyBtn && !copyBtn.onclick) {
    copyBtn.addEventListener('click', copyDiagnostics);
    console.log('Diagnostics: Copy button listener attached (immediate)');
  }
}

// Compare Both functionality - runs both approaches simultaneously
(() => {
  function ensureCompareUI() {
    let wrap = document.getElementById('compareWrap');
    if (wrap) return wrap;
    wrap = document.createElement('div');
    wrap.id = 'compareWrap';
    wrap.style.cssText = 'margin-top:12px; display:grid; grid-template-columns:1fr 1fr; gap:10px;';
    const mkPane = (id, title, debugId) => {
      const box = document.createElement('div');
      box.className = 'box';
      box.innerHTML = `
        <div class="label">${title}</div>
        <div id="${id}" style="font-size:12px"></div>
        <div class="label" style="margin-top:10px; font-size:11px;">Debug Output:</div>
        <div id="${debugId}" style="font-size:10px; max-height:200px; overflow-y:auto; background:#f9f9f9; padding:6px; border-radius:4px; font-family:monospace;"></div>
      `;
      return box;
    };
    wrap.appendChild(mkPane('orchPane','🔧 Orchestrator', 'orchDebug')); // left
    wrap.appendChild(mkPane('origPane','📝 Original Logic', 'origDebug')); // right
    const panel = document.getElementById('panel') || document.body;
    panel.parentNode.insertBefore(wrap, (panel.nextSibling));
    return wrap;
  }
  function renderResult(el, result, err, config = {}) {
    if (err) { el.innerHTML = `<div style="color:#b22;">Error: ${err}</div>`; return; }
    if (!result) { el.innerHTML = `<div style="color:#666;">No result</div>`; return; }
    
    // Define field order and formatting per approach
    const defaultOrder = ['title', 'price', 'brand', 'description', 'specs', 'tags', 'gender', 'sku', 'images'];
    const orchOrder = ['title', 'brand', 'price', 'price_original', 'currency', 'availability', 'description', 'images', 'specs', 'tags', 'sku', 'mpn', 'upc', 'breadcrumbs', 'category', 'rating', 'review_count', 'variants'];
    const hideKeys = ['url', '__debugLog', 'selectorsUsed', '__error'];
    
    const fieldOrder = config.isOrchestrator ? orchOrder : defaultOrder;
    
    // Get all available fields, ordered by preference
    const resultKeys = Object.keys(result || {});
    const visibleKeys = resultKeys.filter(k => !hideKeys.includes(k) && !k.startsWith('__'));
    const orderedKeys = fieldOrder.filter(k => visibleKeys.includes(k))
      .concat(visibleKeys.filter(k => !fieldOrder.includes(k)));
    
    
    // Render all fields dynamically with safe DOM methods
    el.innerHTML = ''; // Clear first
    
    orderedKeys.forEach(key => {
      const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
      const value = result[key];
      
      const row = document.createElement('div');
      row.style.marginBottom = '4px';
      
      const labelEl = document.createElement('b');
      labelEl.textContent = label + ': ';
      row.appendChild(labelEl);
      
      if (key === 'images' && Array.isArray(value)) {
        const imgContainer = document.createElement('div');
        imgContainer.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;';
        value.slice(0,8).forEach(url => {
          const img = document.createElement('img');
          img.src = url;
          img.style.cssText = 'height:64px;border:1px solid #eee;border-radius:4px;cursor:pointer;';
          img.referrerPolicy = 'no-referrer';
          img.addEventListener('click', () => openImageOverlay(url));
          imgContainer.appendChild(img);
        });
        row.appendChild(imgContainer);
      } else {
        const valueEl = document.createElement('span');
        row.style.cssText += 'word-wrap:break-word; white-space:normal; max-width:100%;';
        
        if (!value && value !== 0) {
          valueEl.textContent = 'null';
        } else if (Array.isArray(value)) {
          valueEl.textContent = value.length <= 5 ? value.join(', ') : `${value.slice(0,3).join(', ')}... (+${value.length-3} more)`;
        } else if (typeof value === 'object') {
          valueEl.textContent = JSON.stringify(value).slice(0,100) + (JSON.stringify(value).length > 100 ? '...' : '');
        } else {
          const str = String(value);
          valueEl.textContent = key === 'description' && str.length > 200 ? str.slice(0,200) + '...' : str;
        }
        
        row.appendChild(valueEl);
      }
      
      el.appendChild(row);
    });
  }
  function syncButtonState(compareBtn) {
    const saveBtn = document.getElementById('saveBtn');
    if (!saveBtn) return;
    const apply = () => { compareBtn.disabled = saveBtn.disabled; };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(saveBtn, { attributes:true, attributeFilter:['disabled'] });
  }
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('compareBothBtn');
    if (!btn) return;
    syncButtonState(btn);
    btn.addEventListener('click', async () => {
      const wrap = ensureCompareUI();
      const orchEl = document.getElementById('orchPane');
      const origEl = document.getElementById('origPane');
      const orchDebug = document.getElementById('orchDebug');
      const origDebug = document.getElementById('origDebug');
      
      orchEl.textContent = 'Running Orchestrator…';
      origEl.textContent = 'Running Original Logic…';
      orchDebug.textContent = 'Waiting for debug output...';
      origDebug.textContent = 'Waiting for debug output...';
      
      // Helper to add debug to specific container
      const addDebugToContainer = (container, message, level = 'info') => {
        const colors = { info: '#333', warning: '#f57c00', error: '#d32f2f', success: '#388e3c', debug: '#7b1fa2' };
        const div = document.createElement('div');
        div.style.color = colors[level] || '#333';
        div.style.marginBottom = '2px';
        div.textContent = message;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
      };
      
      // Run sequentially to avoid debug log race condition
      const orch = await window.api.scrapeCurrent({ mode: 'normal' }).then(r => ({ status: 'fulfilled', value: r })).catch(e => ({ status: 'rejected', reason: e }));
      const orig = await window.api.scrapeOriginal({}).then(r => ({ status: 'fulfilled', value: r })).catch(e => ({ status: 'rejected', reason: e }));
      
      // Render results in UI panels with approach-specific configs
      if (orch.status === 'fulfilled') renderResult(orchEl, orch.value?.result || orch.value, null, { isOrchestrator: true });
      else renderResult(orchEl, null, orch.reason?.message || String(orch.reason), { isOrchestrator: true });
      if (orig.status === 'fulfilled') renderResult(origEl, orig.value?.result || orig.value, null, { isOrchestrator: false });
      else renderResult(origEl, null, orig.reason?.message || String(orig.reason), { isOrchestrator: false });
      
      // Extract and display debug logs in separate containers
      const orchLog = orch.status === 'fulfilled' && (orch.value?.result?.__debugLog || orch.value?.__debugLog);
      const origLog = orig.status === 'fulfilled' && (orig.value?.result?.__debugLog || orig.value?.__debugLog);
      
      // Clear and display Orchestrator debug logs in left container
      orchDebug.innerHTML = '';
      if (Array.isArray(orchLog) && orchLog.length > 0) {
        orchLog.forEach(entry => {
          addDebugToContainer(orchDebug, entry.message, entry.level);
        });
        addDebugToContainer(orchDebug, `✅ Complete (${orchLog.length} entries)`, 'success');
      } else {
        addDebugToContainer(orchDebug, 'No debug logs found', 'warning');
      }
      
      // Clear and display Original Logic debug logs in right container  
      origDebug.innerHTML = '';
      if (Array.isArray(origLog) && origLog.length > 0) {
        origLog.forEach(entry => {
          addDebugToContainer(origDebug, entry.message, entry.level);
        });
        addDebugToContainer(origDebug, `✅ Complete (${origLog.length} entries)`, 'success');
      } else {
        addDebugToContainer(origDebug, 'No debug logs found', 'warning');
      }
      
      wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();