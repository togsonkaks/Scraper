// Original Logic Button Handler
document.addEventListener('DOMContentLoaded', function() {
  const originalBtn = document.getElementById('originalBtn');
  const statusEl = document.getElementById('status');
  const panel = document.getElementById('panel');
  const summary = document.getElementById('summary');
  const images = document.getElementById('images');
  const out = document.getElementById('out');
  
  // Make original button get disabled/enabled along with save button
  const originalSetSaveState = window.setSaveState;
  if (originalSetSaveState) {
    window.setSaveState = function(disabled, label) {
      originalSetSaveState(disabled, label);
      if (originalBtn) originalBtn.disabled = disabled;
    };
  }
  
  if (originalBtn) {
    originalBtn.onclick = async () => {
      // Get current URL from input
      const url = document.getElementById('urlInput')?.value?.trim();
      if (!url) {
        alert('Please paste a URL first.');
        return;
      }
      
      // Show debug panel and clear previous output (same as Save button)
      showDebugPanel();
      clearDebugOutput();
      addDebugOutput('🔧 Starting Original Logic for: ' + url, 'info');
      
      statusEl.innerHTML = `<span class="pill">Loading & scraping...</span>`;
      panel.style.display = 'none'; images.innerHTML=''; summary.innerHTML=''; out.textContent='';
      
      try {
        // Navigate to the target URL first
        addDebugOutput('📍 Navigating to: ' + url, 'info');
        await window.api.openProduct(url);
        
        // Wait a moment for navigation to complete
        await new Promise(r => setTimeout(r, 500));
        
        addDebugOutput('🔧 Running Original Logic scrapers...', 'info');
        statusEl.innerHTML = `<span class="pill">Original Logic</span>`;
        
        const { result, selectorsUsed } = await window.api.scrapeOriginal({ url });
        
        if (result.__error) {
          throw new Error(result.__error);
        }
        
        window.lastPayload = result || {}; 
        const imgs = Array.isArray(result?.images) ? result.images : [];
        
        summary.innerHTML = `
          <div><b>Title:</b> ${result?.title || ''}</div>
          <div><b>Price:</b> ${result?.price || ''}</div>
          <div><b>Brand:</b> ${result?.brand || ''}</div>
          <div><b>URL:</b> ${result?.url || ''}</div>
          <div><b>Specs:</b> ${result?.specs?.join(', ') || ''}</div>
          <div><b>Tags:</b> ${result?.tags?.join(', ') || ''}</div>
          <div><b>Gender:</b> ${result?.gender || ''}</div>
          <div><b>SKU:</b> ${result?.sku || ''}</div>`;
          
        images.innerHTML = imgs.map(u => `<img referrerpolicy="no-referrer" src="${u}" title="${u}" onclick="openImageOverlay('${u}')">`).join('');
        
        // Simple URL display  
        out.innerHTML = '';
        imgs.forEach((url, index) => {
          const div = document.createElement('div');
          div.style.cssText = 'padding: 4px; font-family: monospace; font-size: 11px; word-break: break-all; border-bottom: 1px solid #eee;';
          div.textContent = url;
          out.appendChild(div);
        });
        
        // Display debug log (same as orchestrator approach)
        if (result && result.__debugLog && Array.isArray(result.__debugLog)) {
          result.__debugLog.forEach(entry => {
            const colors = { info: 'info', warning: 'warning', error: 'error', debug: 'debug' };
            addDebugOutput(entry.message, colors[entry.level] || 'info');
          });
          addDebugOutput('✅ Original Logic trace complete', 'success');
        }
        
        panel.style.display = 'grid';
        statusEl.innerHTML = `<span class="pill">Done (Original)</span>`;
        
      } catch (e) {
        out.textContent = 'Error: ' + (e?.message || String(e));
        statusEl.innerHTML = `<span class="pill" style="background:#fdd; color:#900;">Error</span>`;
      }
    };
  }
});