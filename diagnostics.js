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
    const mkPane = (id, title) => {
      const box = document.createElement('div');
      box.className = 'box';
      box.innerHTML = `<div class="label">${title}</div><div id="${id}" style="font-size:12px"></div>`;
      return box;
    };
    wrap.appendChild(mkPane('orchPane','🔧 Orchestrator')); // left
    wrap.appendChild(mkPane('origPane','📝 Original Logic')); // right
    const panel = document.getElementById('panel') || document.body;
    panel.parentNode.insertBefore(wrap, (panel.nextSibling));
    return wrap;
  }
  function renderResult(el, result, err) {
    if (err) { el.innerHTML = `<div style="color:#b22;">Error: ${err}</div>`; return; }
    const imgs = Array.isArray(result?.images) ? result.images.slice(0,8) : [];
    el.innerHTML = `
      <div><b>Title:</b> ${result?.title||'null'}</div>
      <div><b>Price:</b> ${result?.price||'null'}</div>
      <div><b>Brand:</b> ${result?.brand||'null'}</div>
      <div><b>URL:</b> ${result?.url||''}</div>
      <div><b>Description:</b> ${(result?.description||'').slice(0,200)}${result?.description?.length > 200 ? '...' : ''}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">${imgs.map(u=>`<img referrerpolicy="no-referrer" src="${u}" style="height:64px;border:1px solid #eee;border-radius:6px;cursor:pointer;" onclick="openImageOverlay('${u}')">`).join('')}</div>`;
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
      orchEl.textContent = 'Running Orchestrator…';
      origEl.textContent = 'Running Original Logic…';
      
      // Show debug panel and clear previous debug logs
      const showDebugPanel = window.showDebugPanel;
      const clearDebugOutput = window.clearDebugOutput;
      const addDebugOutput = window.addDebugOutput;
      
      if (showDebugPanel) showDebugPanel();
      if (clearDebugOutput) clearDebugOutput(); // Clear stale debug info
      
      if (addDebugOutput) {
        addDebugOutput('🔍 Starting side-by-side comparison...', 'info');
        addDebugOutput('🚀 Running both Orchestrator and Original Logic simultaneously', 'info');
      }
      
      const [orch, orig] = await Promise.allSettled([
        window.api.scrapeCurrent({ mode: 'normal' }),
        window.api.scrapeOriginal()
      ]);
      
      // Render results in UI panels
      if (orch.status === 'fulfilled') renderResult(orchEl, orch.value?.result || orch.value, null);
      else renderResult(orchEl, null, orch.reason?.message || String(orch.reason));
      if (orig.status === 'fulfilled') renderResult(origEl, orig.value?.result || orig.value, null);
      else renderResult(origEl, null, orig.reason?.message || String(orig.reason));
      
      // Extract and display detailed debug logs from both approaches (shape-agnostic)
      if (addDebugOutput) {
        const orchLog = orch.status === 'fulfilled' && (orch.value?.result?.__debugLog || orch.value?.__debugLog);
        const origLog = orig.status === 'fulfilled' && (orig.value?.result?.__debugLog || orig.value?.__debugLog);
        
        // Display Orchestrator debug logs
        if (Array.isArray(orchLog)) {
          addDebugOutput('🔧 ORCHESTRATOR DEBUG LOG:', 'info');
          orchLog.forEach(entry => {
            const colors = { info: 'info', warn: 'warning', warning: 'warning', error: 'error', debug: 'debug' };
            addDebugOutput(`[ORCHESTRATOR] ${entry.message}`, colors[entry.level] || 'info');
          });
          addDebugOutput('✅ Orchestrator trace complete', 'success');
        }
        
        // Display Original Logic debug logs  
        if (Array.isArray(origLog)) {
          addDebugOutput('📝 ORIGINAL LOGIC DEBUG LOG:', 'info');
          origLog.forEach(entry => {
            const colors = { info: 'info', warn: 'warning', warning: 'warning', error: 'error', debug: 'debug' };
            addDebugOutput(`[ORIGINAL LOGIC] ${entry.message}`, colors[entry.level] || 'info');
          });
          addDebugOutput('✅ Original Logic trace complete', 'success');
        }
        
        addDebugOutput('✅ Side-by-side comparison complete', 'success');
      }
      
      wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();