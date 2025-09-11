
/**
 * orchestrator.js — FINAL w/ memoryOnly mode
 * - mode: 'memoryOnly' => use ONLY saved selectors (no fallbacks)
 * - currency-aware price + ancestor scan
 * - images strict filtering + urls tracking
 * - __tg_lastSelectorsUsed populated for all fields
 */
(function () {
  const DEBUG = true;
  const TAG = '[TG]';
  const log = (...a) => { if (DEBUG) try { console.log(TAG, ...a); } catch(_){} };
  const warn = (...a) => { if (DEBUG) try { console.warn(TAG, ...a); } catch(_){} };
  const debug = (...a) => { if (DEBUG) try { console.debug(TAG + '[DEBUG]', ...a); } catch(_){} };
  const error = (...a) => { if (DEBUG) try { console.error(TAG + '[ERROR]', ...a); } catch(_){} };
  
  // Enhanced debug helpers
  const debugElement = (el, context = '') => {
    if (!DEBUG || !el) return;
    const preview = el.outerHTML ? el.outerHTML.slice(0, 200) + '...' : String(el);
    debug(context, {
      tagName: el.tagName,
      id: el.id,
      className: el.className,
      textContent: (el.textContent || '').slice(0, 100),
      innerHTML: (el.innerHTML || '').slice(0, 150),
      preview
    });
  };
  
  const debugSelector = (selector, found, context = '') => {
    if (!DEBUG) return;
    if (found) {
      debug(`✅ SELECTOR SUCCESS [${context}]:`, selector, 'found:', found.length || 1, 'elements');
      if (found.length) {
        found.slice(0, 3).forEach((el, i) => debugElement(el, `Element ${i+1}`));
      } else {
        debugElement(found, 'Single element');
      }
    } else {
      debug(`❌ SELECTOR FAILED [${context}]:`, selector, 'found: 0 elements');
    }
  };

  const __used = {};
  const mark = (field, info) => { __used[field] = info; };

  const q  = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const txt  = (el) => (el && (el.textContent || '').trim()) || null;
  const attr = (el,a) => (el ? el.getAttribute(a) : null);

  /* ---------- PRICE (currency-aware) ---------- */
  function parseMoneyTokens(s) {
    if (!s) return [];
    s = String(s);
    const re = /(?:\b(?:USD|EUR|GBP|AUD|CAD|NZD|CHF|JPY|CNY|RMB|INR|SAR|AED)\b|[\p{Sc}$€£¥])\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\s*(?:[\p{Sc}$€£¥])/giu;
    const tokens = [];
    let m;
    while ((m = re.exec(s)) !== null) tokens.push(m[0]);
    const nums = tokens.map(t => {
      t = t.replace(/[^\d.,]/g,'');
      if (t.includes('.') && t.includes(',')) t = t.replace(/,/g,'');
      else if (!t.includes('.') && t.includes(',')) t = t.replace(',', '.');
      else t = t.replace(/,/g,'');
      const n = parseFloat(t);
      return Number.isFinite(n) ? n : null;
    }).filter(n => n != null && n > 0);
    return nums;
  }
  function bestPriceFromString(s, preferFirst = false) {
    debug('🔍 PRICE PARSING:', { 
      input: s, 
      preferFirst,
      inputType: typeof s,
      inputLength: String(s).length 
    });
    
    const monetary = parseMoneyTokens(s);
    debug('💰 MONETARY TOKENS:', monetary);
    
    if (monetary.length) {
      const result = preferFirst ? monetary[0] : Math.min(...monetary);
      debug('✅ PRICE FROM MONETARY:', { 
        result, 
        method: preferFirst ? 'FIRST' : 'MINIMUM',
        allTokens: monetary 
      });
      return result;
    }
    
    const fallback = [];
    String(s).replace(/(\d+(?:\.\d+)?)(?!\s*%)/g, (m, g1) => { 
      const n = parseFloat(g1); 
      if (isFinite(n)) fallback.push(n); 
      return m; 
    });
    
    debug('🔢 FALLBACK NUMBERS:', fallback);
    
    const result = fallback.length ? (preferFirst ? fallback[0] : Math.min(...fallback)) : null;
    debug('✅ FINAL PRICE RESULT:', { 
      result, 
      method: preferFirst ? 'FIRST_FALLBACK' : 'MIN_FALLBACK',
      allNumbers: fallback 
    });
    
    return result;
  }
  function normalizeMoneyPreferSale(raw, preferFirst = false) {
    if (raw == null) return null;
    const val = bestPriceFromString(String(raw), preferFirst);
    return val == null ? null : String(val);
  }
  function refinePriceWithContext(el, baseVal, fromMemory = false) {
    debug('🎯 REFINING PRICE:', { 
      baseVal, 
      fromMemory,
      hasElement: !!el,
      elementTag: el?.tagName 
    });
    
    try {
      if (!el) {
        debug('❌ NO ELEMENT - returning baseVal:', baseVal);
        return baseVal;
      }
      
      debugElement(el, 'Price element');
      
      const attrFirst = attr(el, 'content') || attr(el, 'data-price') || attr(el, 'aria-label');
      debug('📋 CHECKING ATTRIBUTES:', { 
        content: attr(el, 'content'),
        'data-price': attr(el, 'data-price'),
        'aria-label': attr(el, 'aria-label'),
        attrFirst 
      });
      
      const attrVal = normalizeMoneyPreferSale(attrFirst, fromMemory);
      if (attrVal) {
        debug('✅ PRICE FROM ATTRIBUTES:', attrVal);
        return attrVal;
      }
      
      // If this is from memory selector, don't override - trust the user's selector
      if (fromMemory && baseVal) {
        debug('🔒 MEMORY MODE - trusting user selector, returning:', baseVal);
        return baseVal;
      }
      
      debug('🔍 GENERIC MODE - hunting for better prices in ancestors...');
      
      // Only hunt for "better" prices in generic mode
      let node = el;
      let best = baseVal != null ? parseFloat(baseVal) : Infinity;
      
      for (let i=0; i<3 && node; i++, node = node.parentElement) {
        const t = (node.textContent || '').trim();
        debug(`📍 ANCESTOR ${i}:`, { 
          tagName: node.tagName,
          id: node.id,
          className: node.className,
          textContent: t.slice(0, 100)
        });
        
        const cand = bestPriceFromString(t);
        debug(`💰 ANCESTOR ${i} PRICE:`, cand);
        
        if (cand != null && cand < best) {
          debug(`🔄 NEW BEST PRICE: ${cand} (was ${best})`);
          best = cand;
        }
      }
      
      const result = isFinite(best) && best !== Infinity ? String(best) : baseVal;
      debug('✅ CONTEXT REFINEMENT RESULT:', { result, originalBase: baseVal });
      return result;
    } catch (e) { 
      error('Price refinement error:', e);
      return baseVal; 
    }
  }

  /* ---------- MEMORY ---------- */
  function loadMemory(host) {
    try {
      // First try injected memory data (new file-based system)
      if (globalThis.__tg_injectedMemory && globalThis.__tg_injectedMemory[host]) {
        const v = globalThis.__tg_injectedMemory[host];
        const out = {};
        for (const k of Object.keys(v)) {
          const val = v[k];
          if (typeof val === 'string') out[k] = { selectors: [val], attr: 'text' };
          else if (val && typeof val === 'object') {
            const sels = Array.isArray(val.selectors) ? val.selectors.filter(Boolean)
                         : (val.selector ? [val.selector] : []);
            out[k] = { selectors: sels, attr: val.attr || 'text' };
          }
        }
        return out;
      }
      
      // Fallback to localStorage for backwards compatibility during transition
      const raw = localStorage.getItem('selector_memory_v2');
      const all = raw ? JSON.parse(raw) : {};
      const v = all[host] || {};
      const out = {};
      for (const k of Object.keys(v)) {
        const val = v[k];
        if (typeof val === 'string') out[k] = { selectors: [val], attr: 'text' };
        else if (val && typeof val === 'object') {
          const sels = Array.isArray(val.selectors) ? val.selectors.filter(Boolean)
                       : (val.selector ? [val.selector] : []);
          out[k] = { selectors: sels, attr: val.attr || 'text' };
        }
      }
      return out;
    } catch { return {}; }
  }

  /* ---------- JSON-LD ---------- */
  function scanJSONLDProducts() {
    const out = [];
    for (const node of qa('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(node.textContent);
        const arr = Array.isArray(data) ? data : [data];
        for (const d of arr) {
          if (d && typeof d === 'object') {
            if (d['@type'] === 'Product') out.push(d);
            if (Array.isArray(d.itemListElement)) {
              for (const it of d.itemListElement) {
                const item = it && (it.item || it);
                if (item && item['@type'] === 'Product') out.push(item);
              }
            }
          }
        }
      } catch {}
    }
    return out;
  }
  const ldPickPrice = (prod) => {
    const o = prod.offers || prod.aggregateOffer || prod.aggregateOffers;
    const pick = (x) => {
      if (!x) return null;
      if (typeof x === 'number' || typeof x === 'string') return x;
      if (x.price != null) return x.price;
      if (x.priceSpecification && x.priceSpecification.price != null) return x.priceSpecification.price;
      if (x.lowPrice != null) return x.lowPrice;
      if (x.highPrice != null) return x.highPrice;
      return null;
    };
    if (Array.isArray(o)) { for (const e of o){ const p = pick(e); if (p!=null) return p; } return null; }
    return pick(o);
  };
  const ldPickImages = (prod) => {
    const im = prod.image || prod.images;
    if (!im) return [];
    if (Array.isArray(im)) return im.filter(Boolean);
    if (typeof im === 'string') return [im];
    return [];
  };

  /* ---------- IMAGES ---------- */
  const JUNK_IMG = /(\.svg($|\?))|sprite|logo|icon|badge|placeholder|thumb|spinner|loading|prime|favicon|video\.jpg|\b(visa|mastercard|paypal|amex|discover|apple-?pay|google-?pay|klarna|afterpay|jcb|unionpay|maestro|diners-?club)\b|(payment|credit-?card|pay-?method|checkout|billing)[-_]?(icon|logo|img|image)/i;
  const BASE64ISH_SEG = /\/[A-Za-z0-9+/_-]{80,}($|\?)/;
  const IMG_EXT = /\.(?:jpg|jpeg|png|webp|gif|avif)(?:$|\?)/i;
  function looksLikeImageURL(u) {
    if (!u) return false;
    if (/^data:/i.test(u)) return false;
    if (IMG_EXT.test(u)) return true;
    if (/\b(format|fm)=(jpg|jpeg|png|webp|gif|avif)\b/i.test(u)) return true;
    return false;
  }
  const pickFromSrcset = (srcset) => {
    if (!srcset) return null;
    const parts = srcset.split(',').map(s => s.trim());
    const last = parts[parts.length-1] || '';
    const url = last.split(' ')[0];
    return url || null;
  };
  const toAbs = (u) => { try { return new URL(u, location.href).toString(); } catch { return u; } };
  const canonicalKey = (u) => {
    try {
      const url = new URL(u, location.href);
      url.hash = ''; url.search='';
      let p = url.pathname;
      p = p.replace(/\/((w|h|c|q|dpr|ar|f)_[^/]+)/g,'/');
      return url.origin + p;
    } catch { return u.replace(/[?#].*$/,''); }
  };
  function uniqueImages(urls) {
    debug('🖼️ FILTERING IMAGES:', { inputCount: urls.length });
    
    const seen = new Set(); 
    const out = [];
    const filtered = { empty: 0, invalid: 0, junk: 0, duplicate: 0, kept: 0 };
    
    for (const u of urls) {
      if (!u) {
        filtered.empty++;
        continue;
      }
      
      const abs = toAbs(u);
      
      if (!looksLikeImageURL(abs)) {
        debug('❌ NOT IMAGE URL:', abs.slice(0, 100));
        filtered.invalid++;
        continue;
      }
      
      if (JUNK_IMG.test(abs) || BASE64ISH_SEG.test(abs)) {
        debug('🗑️ JUNK IMAGE FILTERED:', abs.slice(0, 100));
        filtered.junk++;
        continue;
      }
      
      const key = canonicalKey(abs);
      if (!seen.has(key)) { 
        seen.add(key); 
        out.push(abs);
        filtered.kept++;
        debug('✅ KEPT IMAGE:', abs.slice(0, 100));
      } else {
        filtered.duplicate++;
        debug('🔄 DUPLICATE IMAGE:', abs.slice(0, 100));
      }
    }
    
    debug('🖼️ IMAGE FILTERING RESULTS:', filtered);
    debug('🖼️ FINAL IMAGES:', out.slice(0, 5).map(url => url.slice(0, 80)));
    
    return out;
  }
  function gatherImagesBySelector(sel) {
    debug('🔍 GATHERING IMAGES with selector:', sel);
    
    const elements = qa(sel);
    debug(`📊 Found ${elements.length} elements for selector:`, sel);
    
    const urls = [];
    
    for (const el of elements) {
      debugElement(el, `Image element`);
      
      const attrs = {
        src: el.getAttribute('src') || el.currentSrc,
        'data-src': el.getAttribute('data-src'),
        'data-image': el.getAttribute('data-image'),
        'data-zoom-image': el.getAttribute('data-zoom-image'),
        'data-large': el.getAttribute('data-large'),
        srcset: el.getAttribute('srcset')
      };
      
      debug('📋 Image attributes:', attrs);
      
      const s1 = attrs.src || attrs['data-src'] || attrs['data-image'] || 
                 attrs['data-zoom-image'] || attrs['data-large'];
      if (s1) {
        debug('✅ Found image URL from attributes:', s1.slice(0, 100));
        urls.push(s1);
      }
      
      const ss = attrs.srcset;
      const best = pickFromSrcset(ss); 
      if (best) {
        debug('✅ Found image URL from srcset:', best.slice(0, 100));
        urls.push(best);
      }
      
      // Check picture parent
      if (el.parentElement && el.parentElement.tagName.toLowerCase()==='picture') {
        debug('📸 Checking picture parent for sources...');
        for (const src of el.parentElement.querySelectorAll('source')) {
          const b = pickFromSrcset(src.getAttribute('srcset')); 
          if (b) {
            debug('✅ Found image URL from picture source:', b.slice(0, 100));
            urls.push(b);
          }
        }
      }
    }
    
    debug(`🖼️ Raw URLs collected: ${urls.length}`);
    const filtered = uniqueImages(urls);
    debug(`🖼️ After filtering: ${filtered.length} images`);
    
    return filtered;
  }

  /* ---------- MEMORY RESOLUTION ---------- */
  function fromMemory(field, memEntry) {
    debug('🧠 FROM MEMORY:', { 
      field, 
      hasMemEntry: !!memEntry,
      selectors: memEntry?.selectors,
      attr: memEntry?.attr 
    });
    
    if (!memEntry || !Array.isArray(memEntry.selectors)) {
      debug('❌ NO MEMORY ENTRY or invalid selectors for field:', field);
      return null;
    }

    if (memEntry.selectors.some(s => /^script\[type="application\/ld\+json"\]$/i.test(s))) {
      debug('🔍 TRYING JSON-LD for field:', field);
      const prod = scanJSONLDProducts()[0];
      
      if (!prod) {
        debug('❌ NO JSON-LD PRODUCT DATA FOUND');
        return null;
      }
      
      debug('✅ JSON-LD PRODUCT DATA:', Object.keys(prod));
      
      if (field === 'price') {
        const rawPrice = ldPickPrice(prod);
        debug('💰 JSON-LD RAW PRICE:', rawPrice);
        const v = normalizeMoneyPreferSale(rawPrice);
        debug('💰 JSON-LD NORMALIZED PRICE:', v);
        if (v) mark('price', { selectors:['script[type="application/ld+json"]'], attr:'text', method:'jsonld' });
        return v;
      }
      if (field === 'brand') {
        const v = (prod.brand && (prod.brand.name || prod.brand)) || null;
        if (v) mark('brand', { selectors:['script[type="application/ld+json"]'], attr:'text', method:'jsonld' });
        return v;
      }
      if (field === 'description') {
        const v = prod.description || null;
        if (v) mark('description', { selectors:['script[type="application/ld+json"]'], attr:'text', method:'jsonld' });
        return v;
      }
      if (field === 'images') {
        const arr = ldPickImages(prod);
        if (arr.length) {
          mark('images', { selectors:['script[type="application/ld+json"]'], attr:'text', method:'jsonld' });
          return uniqueImages(arr).slice(0,30);
        }
        const og = q('meta[property="og:image"]')?.content;
        return og ? [og] : null;
      }
    }

    debug('🔍 TRYING CSS SELECTORS:', memEntry.selectors);
    
    for (const sel of memEntry.selectors) {
      try {
        if (!sel) {
          debug('❌ EMPTY SELECTOR, skipping');
          continue;
        }
        
        debug(`🎯 TRYING SELECTOR [${field}]:`, sel);
        
        if (field === 'images') {
          const urls = gatherImagesBySelector(sel);
          if (urls.length) { 
            debug(`✅ MEMORY IMAGES SUCCESS: ${urls.length} images found`);
            mark('images', { selectors:[sel], attr:'src', method:'css', urls: urls.slice(0,30) }); 
            return urls.slice(0,30); 
          } else {
            debug('❌ MEMORY IMAGES: No images found for selector:', sel);
          }
        } else {
          const el = q(sel); 
          debugSelector(sel, el, `Memory ${field}`);
          
          if (!el) {
            debug('❌ ELEMENT NOT FOUND for selector:', sel);
            continue;
          }
          
          const a = memEntry.attr || 'text';
          const raw = a === 'text' ? txt(el) : attr(el, a);
          
          debug('📋 RAW VALUE:', { 
            selector: sel,
            attr: a,
            rawValue: raw,
            element: el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ')[0] : '')
          });
          
          let val = field === 'price' ? normalizeMoneyPreferSale(raw, true) : raw;  // preferFirst=true for memory selectors
          debug('💰 AFTER NORMALIZATION:', val);
          
          if (field === 'price') {
            val = refinePriceWithContext(el, val, true);  // fromMemory=true
            debug('💰 AFTER CONTEXT REFINEMENT:', val);
          }
          
          if (val) { 
            debug(`✅ MEMORY SUCCESS [${field}]:`, val);
            mark(field, { selectors:[sel], attr:a, method:'css' }); 
            return val; 
          } else {
            debug(`❌ NO VALUE after processing for [${field}]`);
          }
        }
      } catch (e) {
        error('Memory selector error:', e);
      }
    }
    return null;
  }

  /* ---------- GENERIC EXTRACTORS ---------- */
  function getTitle() {
    const sels = ['h1', '.product-title', '[itemprop="name"]'];
    for (const sel of sels) { const v = txt(q(sel)); if (v) { mark('title', { selectors:[sel], attr:'text', method:'generic' }); return v; } }
    const v = (document.title || '').trim(); if (v) mark('title', { selectors:['document.title'], attr:'text', method:'fallback' });
    return v || null;
  }
  function getBrand() {
    const pairs = [['meta[name="brand"]','content'], ['meta[property="og:brand"]','content']];
    for (const [sel,at] of pairs) { const v = attr(q(sel),at); if (v) { mark('brand', { selectors:[sel], attr:at, method:'generic' }); return v; } }
    const prod = scanJSONLDProducts()[0];
    if (prod) { const v = (prod.brand && (prod.brand.name || prod.brand)) || null; if (v) { mark('brand', { selectors:['script[type="application/ld+json"]'], attr:'text', method:'jsonld-fallback' }); return v; } }
    return null;
  }
  function getDescription() {
    const pairs = [
      ['meta[name="description"]','content'],
      ['meta[property="og:description"]','content'],
      ['.product-description, [itemprop="description"], #description','text']
    ];
    for (const [sel,at] of pairs) { const v = at==='text' ? txt(q(sel)) : attr(q(sel),at); if (v) { mark('description', { selectors:[sel], attr:at, method:'generic' }); return v; } }
    const prod = scanJSONLDProducts()[0];
    if (prod && prod.description) { mark('description', { selectors:['script[type="application/ld+json"]'], attr:'text', method:'jsonld-fallback' }); return prod.description; }
    return null;
  }
  function getPriceGeneric() {
    const pairs = [
      ['[itemprop="price"]','content'],
      ['[data-test*=price]','text'],
      ['[data-testid*=price]','text'],
      ['.price','text'],
      ['.product-price','text']
    ];
    for (const [sel,at] of pairs) {
      const el = q(sel);
      const raw = at==='text' ? txt(el) : attr(el,at);
      let val = normalizeMoneyPreferSale(raw);
      if (val && el) val = refinePriceWithContext(el, val);
      if (val) { mark('price', { selectors:[sel], attr:at, method:'generic' }); return val; }
    }
    const prod = scanJSONLDProducts()[0];
    if (prod) {
      const val = normalizeMoneyPreferSale(ldPickPrice(prod));
      if (val) { mark('price', { selectors:['script[type="application/ld+json"]'], attr:'text', method:'jsonld-fallback' }); return val; }
    }
    return null;
  }
  function getImagesGeneric() {
    const gallerySels = [
      '.product-media img','.gallery img','.image-gallery img','.product-images img','.product-gallery img',
      '[class*=gallery] img','.slider img','.thumbnails img','.pdp-gallery img','[data-testid*=image] img'
    ];
    for (const sel of gallerySels) {
      const urls = gatherImagesBySelector(sel);
      if (urls.length >= 3) { mark('images', { selectors:[sel], attr:'src', method:'generic', urls: urls.slice(0,30) }); return urls.slice(0,30); }
    }
    const og = q('meta[property="og:image"]')?.content;
    const all = gatherImagesBySelector('img');
    const combined = (og ? [og] : []).concat(all);
    const uniq = uniqueImages(combined);
    mark('images', { selectors:['img'], attr:'src', method:'generic-fallback', urls: uniq.slice(0,30) });
    return uniq.slice(0,30);
  }

  /* ---------- ENTRY ---------- */
  async function scrapeProduct(opts) {
    try {
      const host = location.hostname.replace(/^www\./,'');
      const mode = (opts && opts.mode) || 'normal';
      log('🚀 SCRAPE START', { host, href: location.href, mode });

      const mem = loadMemory(host);
      debug('🧠 LOADED MEMORY:', {
        host,
        hasMemory: Object.keys(mem).length > 0,
        fields: Object.keys(mem),
        memoryData: mem
      });

      let title=null, brand=null, description=null, price=null, images=null;

      if (mode === 'memoryOnly') {
        debug('🔒 MEMORY-ONLY MODE - using saved selectors only');
        title = fromMemory('title', mem.title);
        brand = fromMemory('brand', mem.brand);
        description = fromMemory('description', mem.description);
        price = fromMemory('price', mem.price);
        images = fromMemory('images', mem.images);
      } else {
        debug('🔄 NORMAL MODE - memory + fallbacks');
        
        title = fromMemory('title', mem.title);
        debug('📝 TITLE FROM MEMORY:', title);
        if (!title) {
          debug('📝 TITLE: Falling back to generic...');
          title = getTitle();
          debug('📝 TITLE FROM GENERIC:', title);
        }
        
        brand = fromMemory('brand', mem.brand);
        debug('🏷️ BRAND FROM MEMORY:', brand);
        if (!brand) {
          debug('🏷️ BRAND: Falling back to generic...');
          brand = getBrand();
          debug('🏷️ BRAND FROM GENERIC:', brand);
        }
        
        description = fromMemory('description', mem.description);
        debug('📄 DESCRIPTION FROM MEMORY:', description);
        if (!description) {
          debug('📄 DESCRIPTION: Falling back to generic...');
          description = getDescription();
          debug('📄 DESCRIPTION FROM GENERIC:', description);
        }
        
        price = fromMemory('price', mem.price);
        debug('💰 PRICE FROM MEMORY:', price);
        if (!price) {
          debug('💰 PRICE: Falling back to generic...');
          price = getPriceGeneric();
          debug('💰 PRICE FROM GENERIC:', price);
        }
        
        images = fromMemory('images', mem.images);
        debug('🖼️ IMAGES FROM MEMORY:', { count: images?.length || 0, images: images?.slice(0, 3) });
        
        if (!images || images.length < 3) {
          debug('🖼️ IMAGES: Need more images (have ' + (images?.length || 0) + ', need 3+)');
          const memoryImages = images || [];
          debug('🖼️ IMAGES: Getting generic images...');
          const genericImages = getImagesGeneric();
          debug('🖼️ GENERIC IMAGES:', { count: genericImages.length, images: genericImages.slice(0, 3) });
          
          // Append and deduplicate generic images to memory images instead of replacing
          debug('🖼️ IMAGES: Appending and deduplicating...');
          images = uniqueImages(memoryImages.concat(genericImages)).slice(0, 30);
          debug('🖼️ FINAL IMAGES:', { count: images.length, images: images.slice(0, 3) });
        }
      }

      const payload = { title, brand, description, price, url: location.href, images, timestamp: new Date().toISOString(), mode };
      
      debug('✅ SCRAPE COMPLETE - FINAL RESULTS:', {
        title: title?.slice(0, 50),
        brand,
        description: description?.slice(0, 50),
        price,
        imageCount: images?.length || 0,
        firstImages: images?.slice(0, 3),
        selectorsUsed: __used
      });
      
      log('✅ SCRAPE SUCCESS:', {
        title: !!title,
        brand: !!brand, 
        description: !!description,
        price: !!price,
        images: images?.length || 0
      });
      
      globalThis.__tg_lastSelectorsUsed = __used;
      return payload;
    } catch (e) {
      return { __error: (e && e.stack) || String(e), __stage: 'scrapeProduct' };
    }
  }

  Object.assign(globalThis, { scrapeProduct });
})();
