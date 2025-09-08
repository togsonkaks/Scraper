// scrapers/orchestrator.js
// Orchestrates per-field extraction with this precedence:
// 1) Selector Memory (if present for this host, per-field)
// 2) Custom handler for the site (custom.js)
// 3) Generic collectors (title.js, price.js, images.js, specs_tags.js)
//
// Contract (do not change shape):
// window.scrapeProduct() => {
//   title, brand, price, specs[], tags[], images[], gender, sku, url, timestamp
// }
//
// Requirements kept:
// - globalThis.__TAGGLO__ = { scrapeProduct }
// - Also expose legacy alias: window.scrapeProduct
// - Short await sleep(200) before returning
//
// Assumes globals from other modules are present:
// - getCustomHandlers()       (from custom.js)
// - getTitleGeneric(), getBrandGeneric()  (from title.js)
// - getPriceGeneric()         (from price.js)
// - collectImagesFromPDP()    (from images.js)
// - collectSpecsGeneric(), collectTagsGeneric(), guessGender(), pickSKU() (from specs_tags.js)
// - T(), uniq(), sleep(ms)    (from utils.js)
// Also assumes preload exposed window.api.* IPC for selector memory (contextBridge).

// Generic description extractor with selector tracking
function getDescriptionGeneric(doc = document) {
  // Common description selectors, ordered by priority
  const selectors = [
    // Meta description first (most reliable)
    'meta[name="description"]',
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
    
    // Product description containers
    '.product-description',
    '.product-details',
    '.description',
    '.product-info .description',
    '.product-summary',
    '.product-overview',
    
    // eCommerce platform specific
    '.pdp-product-description',
    '.product-description-content',
    '.product-long-description',
    '.rte' // Rich text editor content
  ];
  
  for (const sel of selectors) {
    try {
      const el = doc.querySelector(sel);
      if (!el) continue;
      
      let text = '';
      const attr = sel.includes('meta') ? 'content' : 'text';
      
      if (attr === 'content') {
        text = el.getAttribute('content') || '';
      } else {
        text = el.textContent || '';
      }
      
      text = T(text); // Use utility function to clean text
      
      // Valid description should be substantive
      if (text && text.length > 20 && text.length < 2000) {
        // Skip if it looks like JSON/technical data
        if (!/(props|pageProps|appConfig|apiHost|":|{|}|\[|\])/i.test(text.substring(0, 100))) {
          // Skip if it looks like navigation/menu text
          if (!/(home|shop|cart|checkout|login|menu|navigation|cookie|accept|decline)/i.test(text.substring(0, 50))) {
            return {
              text: text,
              selector: sel,
              attr: attr
            };
          }
        }
      }
    } catch {}
  }
  
  return null;
}

(function () {
  const HOST = (location.host || '').replace(/^www\./, '');

  // ---- Selector Memory bridge (optional if preload is present) ----
  const memAPI = (typeof window !== 'undefined' && window.api) ? window.api : null;

  async function loadSelectorMemory(host = HOST) {
    try {
      if (!memAPI || !memAPI.getSelectorMemory) return null;
      return await memAPI.getSelectorMemory(host);
    } catch { return null; }
  }

  // Tracks what was actually used this run (for Control UI to save/inspect)
  const __used = {
    title: null,
    price: null,
    brand: null,
    description: null,
    images: null,
    __fromMemory: [] // fields resolved from memory
  };
  // Expose for the control window to read after scrape
  Object.defineProperty(globalThis, '__tg_lastSelectorsUsed', {
    get() { return __used; },
    configurable: true
  });

  // ---- helpers for applying selector memory ----
  function q(sel, scope = document) { try { return scope.querySelector(sel); } catch { return null; } }
  function qa(sel, scope = document) { try { return Array.from(scope.querySelectorAll(sel)); } catch { return []; } }

  function extractByAttr(el, attr) {
    if (!el) return null;
    const a = (attr || 'text').toLowerCase();
    if (a === 'text') return T(el.textContent);
    if (a === 'content') return T(el.getAttribute('content'));
    if (a === 'src') {
      // prefer currentSrc for <img>, fall back to src/href/content
      if (el.currentSrc) return el.currentSrc;
      const s = el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('content');
      return s ? String(s) : null;
    }
    // generic
    const v = el.getAttribute(attr);
    return v == null ? null : String(v);
  }

  function tryMemoryText(memField, validators = []) {
    if (!memField || !Array.isArray(memField.selectors) || !memField.selectors.length) return null;
    for (const sel of memField.selectors) {
      const el = q(sel);
      const raw = extractByAttr(el, memField.attr || 'text');
      if (!raw) continue;
      const val = T(raw);
      if (!val) continue;
      if (validators.every(fn => fn(val))) {
        __used.__fromMemory.push('title'); // caller will correct field name if needed
        return { value: val, selUsed: { selectors: memField.selectors, attr: memField.attr || 'text' } };
      }
    }
    return null;
  }

  function tryMemoryPrice(memField) {
    if (!memField || !Array.isArray(memField.selectors) || !memField.selectors.length) return null;
    for (const sel of memField.selectors) {
      for (const el of qa(sel)) {
        const raw = extractByAttr(el, memField.attr || 'text');
        const val = normalizeMoney(raw || '');
        if (val) {
          __used.__fromMemory.push('price');
          return { value: val, selUsed: { selectors: memField.selectors, attr: memField.attr || 'text' } };
        }
      }
    }
    return null;
  }

  function biggestFromSrcset(srcset) {
    return (srcset || '')
      .split(',')
      .map(s => s.trim())
      .map(s => {
        const [u, d] = s.split(/\s+/);
        const m = (d || '').match(/(\d+)w/);
        return { u, w: m ? +m[1] : 0 };
      })
      .filter(x => x.u)
      .sort((a, b) => b.w - a.w)[0]?.u || null;
  }

  function tryMemoryImages(memField, limit = 10) {
    if (!memField || !Array.isArray(memField.selectors) || !memField.selectors.length) return null;
    const EXT_ALLOW = /\.(jpe?g|png|webp|avif)(\?|#|$)/i;
    const out = [];
    const push = (u) => { if (u && EXT_ALLOW.test(u)) out.push(u); };
    for (const sel of memField.selectors) {
      for (const el of qa(sel)) {
        if (el.tagName === 'IMG') {
          push(el.currentSrc || el.src || null);
          const u = biggestFromSrcset(el.getAttribute('srcset'));
          if (u) push(u);
        } else if (el.tagName === 'SOURCE') {
          const u = biggestFromSrcset(el.getAttribute('srcset'));
          if (u) push(u);
        } else {
          const got = extractByAttr(el, memField.attr || 'src');
          if (got) push(got);
        }
      }
    }
    const uniq = [...new Set(out)].slice(0, limit);
    if (uniq.length) {
      __used.__fromMemory.push('images');
      return { value: uniq, selUsed: { selectors: memField.selectors, attr: memField.attr || 'src' } };
    }
    return null;
  }

  // ---- main orchestrator ----
  async function scrapeProduct() {
    const start = Date.now();

    // Load selector memory (if available) once per run
    const mem = await loadSelectorMemory(HOST);

    // Resolve site-specific handlers
    const custom = (typeof getCustomHandlers === 'function') ? getCustomHandlers() : {};
    const customOrNoop = (fn) => (typeof fn === 'function' ? fn : (() => null));
    const cTitle = customOrNoop(custom.title);
    const cBrand = customOrNoop(custom.brand);
    const cPrice = customOrNoop(custom.price);
    const cSpecs = customOrNoop(custom.specs);
    const cTags  = customOrNoop(custom.tags);
    const cImages = (typeof custom.images === 'function') ? custom.images : (async () => null);

    // ------------- TITLE -------------
    let title = null;
    // memory-first
    if (mem?.title) {
      const got = tryMemoryText(mem.title, [v => v.length > 1]);
      if (got) {
        title = got.value;
        __used.title = got.selUsed;
      }
    }
    if (!title) {
      // custom
      const customTitle = cTitle(document);
      if (customTitle) {
        title = customTitle;
        __used.title = {
          selector: 'custom-handler',
          attr: 'text', 
          method: 'custom'
        };
      }
    }
    if (!title && typeof getTitleGeneric === 'function') {
      const titleResult = getTitleGeneric(document);
      if (titleResult) {
        if (typeof titleResult === 'string') {
          title = titleResult;
        } else {
          title = titleResult.text;
          __used.title = {
            selector: titleResult.selector,
            attr: titleResult.attr,
            method: 'generic'
          };
        }
      }
    }
    if (!title) title = 'Title not found';

    // ------------- BRAND -------------
    let brand = null;
    const customBrand = cBrand(document);
    if (customBrand) {
      brand = customBrand;
      __used.brand = {
        selector: 'custom-handler',
        attr: 'text',
        method: 'custom'
      };
    }
    if (!brand && typeof getBrandGeneric === 'function') {
      const brandResult = getBrandGeneric(document);
      if (brandResult) {
        if (typeof brandResult === 'string') {
          brand = brandResult;
        } else {
          brand = brandResult.text;
          __used.brand = {
            selector: brandResult.selector,
            attr: brandResult.attr,
            method: 'generic'
          };
        }
      }
    }

    // ------------- PRICE -------------
    let price = null;
    if (mem?.price) {
      const got = tryMemoryPrice(mem.price);
      if (got) {
        price = got.value;
        __used.price = got.selUsed;
      }
    }
    if (!price) {
      const customPrice = cPrice(document);
      if (typeof customPrice === 'string' && customPrice) {
        price = customPrice;
        __used.price = {
          selector: 'custom-handler',
          attr: 'text',
          method: 'custom'
        };
      }
    }
    if (!price && typeof getPriceGeneric === 'function') {
      const priceResult = getPriceGeneric();
      if (priceResult) {
        if (typeof priceResult === 'string') {
          price = priceResult;
          __used.price = {
            selector: 'generic-text-selector',
            attr: 'text',
            method: 'generic'
          };
        } else {
          price = priceResult.text;
          __used.price = {
            selector: priceResult.selector,
            attr: priceResult.attr,
            method: 'generic'
          };
        }
      }
    }
    if (!price) price = 'Price not found';

    // ------------- IMAGES -------------
    let images = null;
    if (mem?.images) {
      const got = tryMemoryImages(mem.images, 10);
      if (got && Array.isArray(got.value) && got.value.length) {
        images = got.value;
        __used.images = got.selUsed;
      }
    }
    if (!images) {
      const customImages = await cImages(document);
      if (Array.isArray(customImages) && customImages.length) {
        images = customImages;
        __used.images = {
          selector: 'custom-handler',
          attr: 'src',
          method: 'custom'
        };
      }
    }
    if (!images && typeof collectImagesFromPDP === 'function') {
      const genericImages = await collectImagesFromPDP();
      if (Array.isArray(genericImages) && genericImages.length > 0) {
        images = genericImages;
        __used.images = {
          selector: 'generic-images',
          attr: 'src',
          method: 'generic'
        };
      }
    }
    if (!Array.isArray(images)) images = [];
    images = images.slice(0, 20);
    
    // Only track images if we actually found some
    if (images.length === 0) {
      __used.images = null;
    }

    // ------------- DESCRIPTION -------------
    let description = null;
    if (mem?.description) {
      const got = tryMemoryText(mem.description);
      if (got) {
        description = got.value;
        __used.description = got.selUsed;
      }
    }
    if (!description) {
      // Try custom description handler first
      const cDescription = customOrNoop(custom.description);
      const customDesc = cDescription(document);
      if (customDesc) {
        description = customDesc;
        __used.description = {
          selector: 'custom-handler',
          attr: 'text',
          method: 'custom'
        };
      }
    }
    if (!description) {
      // Generic description extraction
      const descResult = getDescriptionGeneric(document);
      if (descResult) {
        if (typeof descResult === 'string') {
          description = descResult;
        } else {
          description = descResult.text;
          __used.description = {
            selector: descResult.selector,
            attr: descResult.attr,
            method: 'generic'
          };
        }
      }
    }

    // ------------- SPECS / TAGS / GENDER / SKU -------------
    let specs = [];
    let tags  = [];
    try { 
      const customSpecs = cSpecs(document); 
      if (Array.isArray(customSpecs)) {
        specs = customSpecs;
        __used.specs = {
          selector: 'custom-handler',
          attr: 'text',
          method: 'custom'
        };
      }
    } catch {}
    try { 
      const customTags = cTags(document);  
      if (Array.isArray(customTags)) {
        tags = customTags;
        __used.tags = {
          selector: 'custom-handler',
          attr: 'text',
          method: 'custom'
        };
      }
    } catch {}
    if (!specs.length && typeof collectSpecsGeneric === 'function') {
      try { specs = collectSpecsGeneric(document) || []; } catch {}
    }
    if (!tags.length && typeof collectTagsGeneric === 'function') {
      try { tags = collectTagsGeneric(document) || []; } catch {}
    }
    specs = (specs || []).slice(0, 20);
    tags  = (tags  || []).slice(0, 12);

    let gender = null;
    if (typeof guessGender === 'function') { try { gender = guessGender(document) || null; } catch {} }
    let sku = null;
    if (typeof pickSKU === 'function') { try { sku = pickSKU(document) || null; } catch {} }

    // throttle as promised
    await sleep(200);

    const payload = {
      title,
      brand: brand || null,
      price,
      description: description || null,
      specs,
      tags,
      images,
      gender,
      sku,
      url: location.href,
      timestamp: new Date().toISOString()
    };

    // Trim any accidental huge arrays
    if (payload.images && payload.images.length > 20) payload.images = payload.images.slice(0,20);
    if (payload.specs && payload.specs.length > 20) payload.specs = payload.specs.slice(0,20);
    if (payload.tags  && payload.tags.length  > 12) payload.tags  = payload.tags.slice(0,12);

    // De-dup images by base (path without query) to cut obvious CDN variants
    try {
      const key = (u) => {
        const a = document.createElement('a'); a.href = u;
        return a.protocol + '//' + a.host + a.pathname;
      };
      const seen = new Set();
      payload.images = payload.images.filter(u => {
        const k = key(u);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    } catch {}

    // Store selectors for main.js to pick up
    globalThis.__tg_lastSelectorsUsed = __used;
    
    return payload;
  }

  // expose
  const api = { scrapeProduct };
  Object.assign(globalThis, { __TAGGLO__: api });
  Object.assign(globalThis, { scrapeProduct }); // legacy alias
})();
