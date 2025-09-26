// Load Button Fix
// Copy this code and paste it into the browser console when Electron is running
// Or add it to the end of control.html before the closing </script> tag

console.log('🔧 Applying Load button fix...');

// Ensure the Load button event handler is working
function fixLoadButton() {
  const visitBtn = document.getElementById('visitBtn');
  const urlInput = document.getElementById('urlInput');
  const statusEl = document.getElementById('status');
  
  if (!visitBtn) {
    console.error('❌ visitBtn not found!');
    return;
  }
  
  console.log('✅ Found Load button, attaching fixed event handler...');
  
  // Clear any existing event handlers
  visitBtn.onclick = null;
  
  // Add robust event handler
  visitBtn.onclick = async function() {
    console.log('🔥 Load button clicked - fixed handler!');
    
    const url = urlInput.value.trim();
    if (!url) {
      alert('Please enter a URL first');
      return;
    }
    
    console.log('Processing URL:', url);
    
    try {
      // Set loading state
      statusEl.innerHTML = '<span class="pill">Loading...</span>';
      visitBtn.disabled = true;
      visitBtn.textContent = 'Loading...';
      
      // Call the original functionality
      currentUrl = url;
      currentHost = hostFrom(url);
      
      // Clear panels
      const panel = document.getElementById('panel');
      const out = document.getElementById('out');
      const images = document.getElementById('images');
      const summary = document.getElementById('summary');
      
      if (panel) panel.style.display = 'none';
      if (out) out.textContent = '';
      if (images) images.innerHTML = '';
      if (summary) summary.innerHTML = '';
      
      statusEl.innerHTML = `<span class="pill">Loading ${currentHost}</span>`;
      
      // Open product window
      await window.api.openProduct(url);
      
      // Check for LLM cache
      if (typeof checkLLMCache === 'function') {
        await checkLLMCache();
      }
      
      // Enable save button and poll for readiness
      if (typeof setSaveState === 'function') {
        setSaveState(true, 'Waiting for page…');
      }
      
      const iv = setInterval(async () => {
        const ok = await window.api.evalInProduct(`
          (async () => {
            const h1 = document.querySelector("h1,[itemprop='name']");
            const price = document.querySelector("[itemprop='price'],[data-price],[class*='price'] .money");
            const imgs = document.querySelector("img[src], picture source[srcset], [data-zoom-image], [data-large-image]");
            return !!(h1 && (price || imgs));
          })();
        `);
        if (ok) {
          clearInterval(iv);
          statusEl.innerHTML = '<span class="pill">Ready</span>';
          if (typeof setSaveState === 'function') {
            setSaveState(false);
          }
          if (typeof autoValidateIfNeeded === 'function') {
            setTimeout(autoValidateIfNeeded, 500);
          }
        }
      }, 700);
      
    } catch (error) {
      console.error('Load button error:', error);
      statusEl.innerHTML = '<span class="pill" style="background:#ffcccc; color:#990000;">Error</span>';
      alert('Error loading page: ' + error.message);
    } finally {
      visitBtn.disabled = false;
      visitBtn.textContent = 'Load';
    }
  };
  
  console.log('✅ Load button fix applied successfully!');
}

// Apply the fix
fixLoadButton();

// Also try to apply after a short delay in case DOM isn't ready
setTimeout(fixLoadButton, 100);