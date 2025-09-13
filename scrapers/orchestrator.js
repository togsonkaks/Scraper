
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
  
  // Collect debug logs to send back to UI
  if (typeof window !== 'undefined') {
    window.__tg_debugLog = window.__tg_debugLog || [];
  }
  
  const safeStringify = (obj) => {
    try {
      if (typeof obj === 'string') return obj;
      if (obj && obj.tagName) return `<${obj.tagName}${obj.id ? '#' + obj.id : ''}${obj.className ? '.' + obj.className.split(' ')[0] : ''}>`;
      if (obj instanceof Error) return obj.message;
      if (typeof obj === 'object') return JSON.stringify(obj).slice(0, 200);
      return String(obj);
    } catch {
      return String(obj).slice(0, 100);
    }
  };
  
  const addToDebugLog = (level, ...args) => {
    if (typeof window !== 'undefined' && window.__tg_debugLog) {
      window.__tg_debugLog.push({
        timestamp: new Date().toLocaleTimeString(),
        level,
        message: args.map(safeStringify).join(' ')
      });
    }
  };
  
  const addImageDebugLog = (level, message, imageUrl, score, kept) => {
    if (typeof window !== 'undefined' && window.__tg_debugLog) {
      window.__tg_debugLog.push({
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
        imageUrl,
        score,
        kept,
        isImage: true
      });
    }
  };
  
  const addPriceDebugLog = (level, message, price, method, kept) => {
    if (typeof window !== 'undefined' && window.__tg_debugLog) {
      window.__tg_debugLog.push({
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
        price,
        method,
        kept,
        isPrice: true
      });
    }
  };
  
  const log = (...a) => { 
    if (DEBUG) {
      try { 
        console.log(TAG, ...a);
        addToDebugLog('info', ...a);
      } catch(_){} 
    }
  };
  const warn = (...a) => { 
    if (DEBUG) {
      try { 
        console.warn(TAG, ...a);
        addToDebugLog('warning', ...a);
      } catch(_){} 
    }
  };
  const debug = (...a) => { 
    if (DEBUG) {
      try { 
        console.debug(TAG + '[DEBUG]', ...a);
        addToDebugLog('debug', ...a);
      } catch(_){} 
    }
  };
  const error = (...a) => { 
    if (DEBUG) {
      try { 
        console.error(TAG + '[ERROR]', ...a);
        addToDebugLog('error', ...a);
      } catch(_){} 
    }
  };
  
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
    
    // Traditional file extensions
    if (IMG_EXT.test(u)) return true;
    
    // Format parameters
    if (/\b(format|fm)=(jpg|jpeg|png|webp|gif|avif)\b/i.test(u)) return true;
    
    // CDN patterns with image processing params
    if (/\b(quality|max|w|h|width|height|resize|scale|crop)=[0-9]/i.test(u)) return true;
    
    // ASOS and similar CDN optimization patterns
    if (/\?\$[a-z0-9_-]+/i.test(u)) return true; // ASOS: ?$n_640w, ?$
    if (/[?&]\$[a-z0-9_-]*/i.test(u)) return true; // ASOS variations
    
    // Known image CDNs (expanded)
    if (/\b(mozu\.com|shopify\.com|cloudinary\.com|imgix\.net|fastly\.com|amazonaws\.com\/.*\/(images?|media|assets)|cloudfront\.net|asos-media\.com|scene7\.com)\b/i.test(u)) return true;
    
    // Image-related paths (expanded)
    if (/\/(images?|media|assets|photos?|pics?|gallery|products)\//i.test(u)) return true;
    
    return false;
  }
  
  // Enhanced image quality scoring function with aggressive filtering
  function scoreImageURL(url, element = null, elementIndex = 0) {
    if (!url) return 0;
    let score = 50; // Base score
    
    // Aggressive dimension penalties for thumbnails
    const amazonThumbMatch = url.match(/_(?:AC_)?(?:US|SS|SY|SR|UL)(\d+)(?:_|\.)/i);
    if (amazonThumbMatch) {
      const size = parseInt(amazonThumbMatch[1]);
      if (size <= 40) score -= 60; // 40px thumbnails
      else if (size <= 64) score -= 50; // 64px thumbnails  
      else if (size <= 100) score -= 40; // 100px thumbnails
      else if (size <= 200) score -= 20; // Small images
      else if (size >= 800) score += 25; // Good size
      else if (size >= 400) score += 15; // Decent size
    }
    
    // Enhanced size detection (multiple patterns)
    const sizePatterns = [
      /(?:max|w|width|imwidth|imageWidth)=([0-9]+)/i,
      /_(\d+)x\d*(?:_|\.|$)/i, // _750x, _1024x1024
      /(\d+)x\d+(?:_|\.|$)/i,  // 750x750
      /\b([0-9]{3,4})(?:w|h|px)(?:_|\.|$)/i, // 750w, 1200px
      /[?&]\$n_(\d+)w?\b/i  // ASOS patterns: ?$n_640w, ?$n_1920
    ];
    
    let detectedSize = 0;
    for (const pattern of sizePatterns) {
      const match = url.match(pattern);
      if (match) {
        detectedSize = Math.max(detectedSize, parseInt(match[1]));
      }
    }
    
    if (detectedSize > 0) {
      if (detectedSize >= 1200) score += 40;
      else if (detectedSize >= 800) score += 30; 
      else if (detectedSize >= 600) score += 20;
      else if (detectedSize >= 400) score += 10;
      else if (detectedSize < 200) score -= 40; // Strong penalty for tiny images
    }
    
    // Quality bonuses (enhanced patterns)
    const qualityPatterns = [
      /quality=([0-9]+)/i,
      /q_([0-9]+)/i, // Cloudinary
      /q([0-9]+)/i   // Some CDNs
    ];
    
    for (const pattern of qualityPatterns) {
      const match = url.match(pattern);
      if (match) {
        const quality = parseInt(match[1]);
        if (quality >= 90) score += 20;
        else if (quality >= 80) score += 15;
        else if (quality >= 70) score += 10;
        else if (quality < 50) score -= 15;
        break; // Only use first match
      }
    }
    
    // Format bonuses (enhanced)
    if (/\.(webp|avif)($|\?)/i.test(url)) score += 10;
    if (/(format|fm)=(webp|avif)/i.test(url)) score += 10;
    if (/f_auto/i.test(url)) score += 8; // Cloudinary auto format
    
    // Enhanced CDN bonuses
    if (/\b(assets?|static|cdn|media|img)\./i.test(url)) score += 25; // Asset subdomains
    if (/\b(mozu\.com|cloudinary\.com|imgix\.net|shopify\.com|fastly\.com)\b/i.test(url)) score += 15;
    
    // Product code detection bonuses
    if (/\b[A-Z]\d{4}[A-Z]?\b/i.test(url)) score += 40; // Product codes like M6169R, A0480U
    if (/\bproduct/i.test(url)) score += 20;
    
    // Path context bonuses and penalties  
    if (/\/(product|main|hero|detail|primary)/i.test(url)) score += 15;
    if (/\/(thumb|small|mini|icon)/i.test(url)) score -= 30;
    
    // Aggressive semantic penalties for navigation/UI elements
    if (/\b(womens?-clothing|mens?-clothing|best-sellers?|new-arrivals?|accessories|shop-by|featured-edit|wellness|searchburger)\b/i.test(url)) score -= 70;
    if (/\b(banner|logo|bg|background|header|footer|nav|navigation|menu)\b/i.test(url)) score -= 50;
    if (/\b(ad|advertisement|promo|campaign|marketing|sidebar|bullet-point)\b/i.test(url)) score -= 60;
    if (/\b(sprite|icon|badge|placeholder|loading|spinner|pixel\.gif|grey-pixel)\b/i.test(url)) score -= 80;
    if (/\b(warranty|insurance|coverage|support|claim)\b/i.test(url)) score -= 55;
    
    // Community/review image penalties
    if (/aicid=community/i.test(url)) score -= 45;
    if (/community-reviews/i.test(url)) score -= 45;
    
    // Position-based bonuses (first images more likely to be main product)
    if (elementIndex < 3) score += 20; // First few images get bonus
    if (elementIndex < 1) score += 10; // Very first image gets extra bonus
    
    // Element-based bonuses if element provided
    if (element) {
      const className = element.className || '';
      const id = element.id || '';
      const combined = (className + ' ' + id).toLowerCase();
      
      if (/\b(main|hero|primary|featured|product-image|gallery-main)\b/i.test(combined)) score += 30;
      if (/\b(thumb|thumbnail|small|mini|icon)\b/i.test(combined)) score -= 30;
      if (/\b(banner|ad|sidebar|nav|header|footer|menu)\b/i.test(combined)) score -= 45;
      
      // Aspect ratio penalties from element dimensions
      const width = element.naturalWidth || element.width || 0;
      const height = element.naturalHeight || element.height || 0;
      if (width > 0 && height > 0) {
        const aspectRatio = width / height;
        if (aspectRatio > 3) score -= 40; // Too wide (likely banner)
        if (aspectRatio < 0.3) score -= 40; // Too tall (likely sidebar)
        if (aspectRatio >= 0.8 && aspectRatio <= 1.5) score += 15; // Good product image ratio
      }
    }
    
    return Math.max(0, score);
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
  // Estimate file size from URL patterns (fast approximation)
  function estimateFileSize(url) {
    // Look for size indicators in URL
    const amazonThumbMatch = url.match(/_(?:AC_)?(?:US|SS|SY|SR|UL)(\d+)(?:_|\.)/i);
    if (amazonThumbMatch) {
      const size = parseInt(amazonThumbMatch[1]);
      if (size <= 40) return 2000;   // ~2KB for tiny thumbnails
      if (size <= 100) return 8000;  // ~8KB for small thumbs
      if (size <= 200) return 25000; // ~25KB for medium
      return 80000; // ~80KB for larger Amazon images
    }
    
    // Check for dimension patterns
    const sizePatterns = [
      /(?:max|w|width|imwidth|imageWidth)=([0-9]+)/i,
      /_(\d+)x\d*(?:_|\.|$)/i,
      /(\d+)x\d+(?:_|\.|$)/i,
      /\b([0-9]{3,4})(?:w|h|px)(?:_|\.|$)/i,
      /[?&]\$n_(\d+)w?\b/i  // ASOS patterns: ?$n_640w, ?$n_1920
    ];
    
    let maxSize = 0;
    for (const pattern of sizePatterns) {
      const match = url.match(pattern);
      if (match) {
        maxSize = Math.max(maxSize, parseInt(match[1]));
      }
    }
    
    if (maxSize > 0) {
      // CDN images get higher estimates even for medium sizes
      const isCDN = /(?:adoredvintage|alicdn|amazonaws|shopifycdn|akamaized|fastly|cloudfront|imgix|cloudinary|scene7|asos-media|cdn-tp3\.mozu|assets\.adidas)\.com/i.test(url);
      
      if (maxSize >= 1200) return 150000; // ~150KB for large images
      if (maxSize >= 800) return 100000;  // ~100KB for medium-large
      if (maxSize >= 400) return isCDN ? 100000 : 50000;   // CDN: ~100KB, others: ~50KB for medium
      if (maxSize >= 200) return isCDN ? 80000 : 25000;    // CDN: ~80KB, others: ~25KB for small
      return 8000; // ~8KB for tiny
    }
    
    // CDN-specific estimates (known to serve larger images)
    if (/(?:adoredvintage|alicdn|amazonaws|shopifycdn|akamaized|fastly|cloudfront|imgix|cloudinary|scene7|asos-media|cdn-tp3\.mozu|assets\.adidas)\.com/i.test(url)) {
      // Check for file extensions OR format parameters
      const isJPEG = /\.(jpg|jpeg)($|\?)/i.test(url) || /[?&](fmt|format|fm)=(jpg|jpeg)/i.test(url);
      const isPNG = /\.(png)($|\?)/i.test(url) || /[?&](fmt|format|fm)=png/i.test(url);
      const isWebP = /\.(webp)($|\?)/i.test(url) || /[?&](fmt|format|fm)=webp/i.test(url);
      
      if (isJPEG) return 150000; // ~150KB for CDN JPG (covers Scene7 fmt=jpeg)
      if (isPNG) return 180000;  // ~180KB for CDN PNG  
      if (isWebP) return 100000; // ~100KB for CDN WebP
      
      // Default to higher estimate for CDN images with any image indicators
      if (/\$pdp|image|product/i.test(url)) return 150000; // Product image indicators
    }
    
    // Default estimates based on file type
    if (/\.(jpg|jpeg)($|\?)/i.test(url)) return 80000;   // ~80KB default JPG (increased)
    if (/\.(png)($|\?)/i.test(url)) return 100000;       // ~100KB default PNG (increased)
    if (/\.(webp)($|\?)/i.test(url)) return 50000;       // ~50KB default WebP (increased)
    if (/\.(gif)($|\?)/i.test(url)) return 20000;        // ~20KB default GIF
    
    return 50000; // ~50KB default
  }

  // Check actual file size via HTTP HEAD request (expensive, use sparingly)
  async function checkFileSize(url) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentLength = response.headers.get('content-length');
      return contentLength ? parseInt(contentLength) : null;
    } catch (error) {
      debug('📏 FILE SIZE CHECK FAILED:', url, error.message);
      return null;
    }
  }

  // Hybrid unique images with score threshold and file size filtering
  async function hybridUniqueImages(enrichedUrls) {
    debug('🔄 HYBRID FILTERING UNIQUE IMAGES...', { inputCount: enrichedUrls.length });
    const groups = new Map(); // canonical URL -> array of enriched URLs
    const seenDebugLogs = new Set();
    const filtered = { empty: 0, invalid: 0, junk: 0, lowScore: 0, smallFile: 0, duplicateGroups: 0, kept: 0 };
    
    // Group enriched URLs by canonical form
    for (const enriched of enrichedUrls) {
      if (!enriched.url) {
        filtered.empty++;
        continue;
      }
      
      const abs = toAbs(enriched.url);
      
      // Basic image validation
      if (!looksLikeImageURL(abs)) {
        addImageDebugLog('debug', `❌ NOT IMAGE URL: ${abs.slice(0, 100)}`, abs, 0, false);
        filtered.invalid++;
        continue;
      }
      
      if (JUNK_IMG.test(abs) || BASE64ISH_SEG.test(abs)) {
        addImageDebugLog('debug', `🗑️ JUNK IMAGE: ${abs.slice(0, 80)}`, abs, 0, false);
        filtered.junk++;
        continue;
      }
      
      // Apply score threshold (minimum 50 points)
      const score = scoreImageURL(abs, enriched.element, enriched.index);
      if (score < 50) {
        addImageDebugLog('debug', `📉 LOW SCORE REJECTED (${score}): ${abs.slice(0, 100)}`, abs, score, false);
        filtered.lowScore++;
        continue;
      }
      
      // Normalize URL for grouping
      const canonical = canonicalKey(abs);
      
      if (!groups.has(canonical)) {
        groups.set(canonical, []);
      }
      
      groups.get(canonical).push({
        url: abs,
        element: enriched.element,
        index: enriched.index,
        score: score
      });
    }
    
    // Select best scoring image from each group, maintain DOM order
    const bestImages = [];
    for (const [canonical, candidates] of groups) {
      if (candidates.length === 1) {
        // Only one candidate, use it
        const candidate = candidates[0];
        bestImages.push({ ...candidate, canonical });
        addImageDebugLog('debug', `✅ SINGLE IMAGE (score: ${candidate.score}): ${candidate.url.slice(0, 100)}`, candidate.url, candidate.score, true);
        filtered.kept++;
      } else {
        // Multiple candidates, pick highest score
        let bestCandidate = candidates.reduce((best, current) => 
          current.score > best.score ? current : best
        );
        
        bestImages.push({ ...bestCandidate, canonical });
        addImageDebugLog('debug', `✅ BEST OF ${candidates.length} (score: ${bestCandidate.score}): ${bestCandidate.url.slice(0, 100)}`, bestCandidate.url, bestCandidate.score, true);
        filtered.duplicateGroups++;
        filtered.kept++;
        
        // Log rejected duplicates
        if (!seenDebugLogs.has(canonical)) {
          const rejectedCount = candidates.length - 1;
          addImageDebugLog('debug', `🔄 DUPLICATE GROUP: ${rejectedCount} lower-scored versions rejected`, bestCandidate.url, bestCandidate.score, false);
          seenDebugLogs.add(canonical);
        }
      }
    }
    
    // Sort by DOM order (index)
    bestImages.sort((a, b) => a.index - b.index);
    
    // Apply file size filtering (100KB minimum)
    const sizeFilteredImages = [];
    const fileSizeCheckPromises = [];
    
    for (const img of bestImages) {
      // Trusted CDNs bypass ALL size checks - HIGHEST PRIORITY  
      if (/(?:adoredvintage\.com|cdn-tp3\.mozu\.com|assets\.adidas\.com|cdn\.shop|shopify|cloudfront|amazonaws|scene7)/i.test(img.url)) {
        sizeFilteredImages.push(img);
        addImageDebugLog('debug', `🔒 TRUSTED CDN BYPASS: ${img.url.slice(0, 100)}`, img.url, img.score, true);
        continue;
      }
      // Trust high scores over file size limits (modern CDN optimization) - EARLY CHECK
      if (img.score >= 65 && estimateFileSize(img.url) >= 15000) {  // High score + minimum size check
        sizeFilteredImages.push(img);
        addImageDebugLog('debug', `🎯 HIGH SCORE + SIZE OK (${img.score}): ${img.url.slice(0, 100)}`, img.url, img.score, true);
        continue;
      } else if (img.score >= 50 && /[?&](f_auto|q_auto|w[_=]\d+|h[_=]\d+)/i.test(img.url)) {  // LOWERED FROM 85 TO 50
        // Good score + modern CDN optimization = keep it
        sizeFilteredImages.push(img);
        addImageDebugLog('debug', `🔧 CDN OPTIMIZED (${img.score}): ${img.url.slice(0, 100)}`, img.url, img.score, true);
        continue;
      }
      
      const estimatedSize = estimateFileSize(img.url);
      
      if (estimatedSize >= 50000) {  // LOWERED FROM 100KB TO 50KB
        // Estimated size is good, keep it
        sizeFilteredImages.push(img);
        addImageDebugLog('debug', `📏 SIZE OK (est: ${Math.round(estimatedSize/1000)}KB): ${img.url.slice(0, 100)}`, img.url, img.score, true);
      } else if (estimatedSize >= 20000 && img.score >= 40) {  // MUCH MORE GENEROUS - was 60KB & score 50
        // Borderline case with decent score, check actual size
        fileSizeCheckPromises.push(
          checkFileSize(img.url).then(actualSize => ({
            img,
            actualSize,
            estimatedSize
          }))
        );
      } else {
        // Too small, reject
        addImageDebugLog('debug', `📉 TOO SMALL (est: ${Math.round(estimatedSize/1000)}KB): ${img.url.slice(0, 100)}`, img.url, img.score, false);
        filtered.smallFile++;
      }
    }
    
    // Check actual file sizes for borderline cases
    if (fileSizeCheckPromises.length > 0) {
      debug(`📏 CHECKING ACTUAL FILE SIZES for ${fileSizeCheckPromises.length} borderline images...`);
      const sizeResults = await Promise.all(fileSizeCheckPromises);
      
      for (const { img, actualSize, estimatedSize } of sizeResults) {
        // Trust high scores over file size limits (modern CDN optimization)
        if (img.score >= 65 && estimateFileSize(img.url) >= 15000) {  // High score + minimum size check
          sizeFilteredImages.push(img);
          addImageDebugLog('debug', `🎯 HIGH SCORE + SIZE OK (${img.score}): ${img.url.slice(0, 100)}`, img.url, img.score, true);
        } else if (img.score >= 50 && /[?&](f_auto|q_auto|w[_=]\d+|h[_=]\d+)/i.test(img.url)) {  // LOWERED FROM 85 TO 50
          // Good score + modern CDN optimization = keep it
          sizeFilteredImages.push(img);
          addImageDebugLog('debug', `🔧 CDN OPTIMIZED (${img.score}): ${img.url.slice(0, 100)}`, img.url, img.score, true);
        } else if (actualSize && actualSize >= 100000) {
          sizeFilteredImages.push(img);
          addImageDebugLog('debug', `📏 SIZE VERIFIED (${Math.round(actualSize/1000)}KB): ${img.url.slice(0, 100)}`, img.url, img.score, true);
        } else if (!actualSize && (img.score >= 95 || /\b(assets?|cdn|media)\./i.test(img.url))) {
          // HEAD failed but high score or CDN - likely CORS issue, keep it
          sizeFilteredImages.push(img);
          addImageDebugLog('debug', `📏 SIZE CHECK FAILED (CORS?) - keeping high-score/CDN: ${img.url.slice(0, 100)}`, img.url, img.score, true);
        } else if (actualSize && actualSize < 5000 && !/w[_=]\d{3,}|h[_=]\d{3,}/i.test(img.url)) {
          // Only reject truly tiny images without dimension hints
          addImageDebugLog('debug', `📉 TRULY TINY REJECTED (${Math.round(actualSize/1000)}KB): ${img.url.slice(0, 100)}`, img.url, img.score, false);
          filtered.smallFile++;
        } else {
          // Keep borderline cases - better to include than exclude
          sizeFilteredImages.push(img);
          addImageDebugLog('debug', `📊 BORDERLINE KEPT (${actualSize ? Math.round(actualSize/1000) : '?'}KB): ${img.url.slice(0, 100)}`, img.url, img.score, true);
        }
      }
    }
    
    // Sort again by DOM order and limit to 50
    sizeFilteredImages.sort((a, b) => a.index - b.index);
    const finalUrls = sizeFilteredImages.slice(0, 50).map(img => img.url);
    
    if (sizeFilteredImages.length > 50) {
      addImageDebugLog('warn', `⚠️ IMAGE LIMIT REACHED (50), keeping first 50 by DOM order`, '', 0, false);
    }
    
    debug('🖼️ HYBRID FILTERING RESULTS:', filtered);
    debug('🖼️ FINAL IMAGES:', finalUrls.slice(0, 5).map(url => url.slice(0, 80)));
    
    return finalUrls;
  }

  // Legacy function for compatibility with existing code
  async function uniqueImages(urls) {
    debug('🖼️ LEGACY FILTERING IMAGES (converting to enriched):', { inputCount: urls.length });
    // Convert simple URLs to enriched format for hybrid processing
    const enriched = urls.map((url, index) => ({ url, element: null, index }));
    return await hybridUniqueImages(enriched);
  }
  async function gatherImagesBySelector(sel) {
    debug('🔍 GATHERING IMAGES with selector:', sel);
    
    const elements = qa(sel);
    debug(`📊 Found ${elements.length} elements for selector:`, sel);
    
    const enrichedUrls = []; // Now includes element info
    
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
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
        enrichedUrls.push({ url: upgradeUrl(s1), element: el, index: i });
      }
      
      const ss = attrs.srcset;
      const best = pickFromSrcset(ss); 
      if (best) {
        debug('✅ Found image URL from srcset:', best.slice(0, 100));
        enrichedUrls.push({ url: upgradeUrl(best), element: el, index: i });
      }
      
      // Check picture parent
      if (el.parentElement && el.parentElement.tagName.toLowerCase()==='picture') {
        debug('📸 Checking picture parent for sources...');
        for (const src of el.parentElement.querySelectorAll('source')) {
          const b = pickFromSrcset(src.getAttribute('srcset')); 
          if (b) {
            debug('✅ Found image URL from picture source:', b.slice(0, 100));
            enrichedUrls.push({ url: upgradeUrl(b), element: el, index: i });
          }
        }
      }
    }
    
    debug(`🖼️ Raw enriched URLs collected: ${enrichedUrls.length}`);
    const filtered = await hybridUniqueImages(enrichedUrls);
    debug(`🖼️ After hybrid filtering: ${filtered.length} images`);
    
    return filtered;
  }

  /* ---------- MEMORY RESOLUTION ---------- */
  async function fromMemory(field, memEntry) {
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
          return await uniqueImages(arr).slice(0,30);
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
          const urls = await gatherImagesBySelector(sel);
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
  async function getImagesGeneric() {
    const hostname = window.location.hostname.toLowerCase().replace(/^www\./, '');
    debug('🖼️ Getting generic images for hostname:', hostname);
    
    // Site-specific selectors for problematic sites
    const siteSpecificSelectors = {
      'adoredvintage.com': ['.product-gallery img', '.rimage__img', '[class*="product-image"] img'],
      'allbirds.com': ['.product-image-wrapper img', '.ProductImages img', 'main img[src*="shopify"]'],
      'amazon.com': [
        // New 2024+ Amazon gallery selectors (thumbnails + main)
        '[data-csa-c-element-id*="image"] img',
        '[class*="ivImages"] img', 
        '[id*="ivImage"] img',
        '.iv-tab img',
        '[id*="altImages"] img',
        '[class*="imagesThumbnail"] img',
        
        // Broader Amazon image patterns
        'img[src*="images-amazon.com"]',
        'img[src*="ssl-images-amazon.com"]',
        'img[src*="m.media-amazon.com"]',
        
        // Legacy selectors (fallback)
        '.a-dynamic-image',
        '#imageBlockContainer img', 
        '#imageBlock img'
      ],
      'adidas.com': ['.product-image-container img', '.product-media img[src*="assets.adidas.com"]'],
      'acehardware.com': ['.product-gallery img', '.mz-productimages img']
    };
    
    // Try site-specific selectors first
    const siteSelectors = siteSpecificSelectors[hostname] || [];
    for (const sel of siteSelectors) {
      debug(`🎯 Trying site-specific selector for ${hostname}:`, sel);
      const urls = await gatherImagesBySelector(sel);
      if (urls.length >= 1) {
        debug(`✅ Site-specific success: ${urls.length} images found`);
        mark('images', { selectors:[sel], attr:'src', method:'site-specific', urls: urls.slice(0,30) }); 
        return urls.slice(0,30); 
      }
    }
    const gallerySels = [
      '.product-media img','.gallery img','.image-gallery img','.product-images img','.product-gallery img',
      '[class*=gallery] img','.slider img','.thumbnails img','.pdp-gallery img','[data-testid*=image] img'
    ];
    for (const sel of gallerySels) {
      const urls = await gatherImagesBySelector(sel);
      if (urls.length >= 3) { mark('images', { selectors:[sel], attr:'src', method:'generic', urls: urls.slice(0,30) }); return urls.slice(0,30); }
    }
    const og = q('meta[property="og:image"]')?.content;
    const all = await gatherImagesBySelector('img');
    const combined = (og ? [og] : []).concat(all);
    const uniq = await uniqueImages(combined);
    mark('images', { selectors:['img'], attr:'src', method:'generic-fallback', urls: uniq.slice(0,30) });
    return uniq.slice(0,30);
  }

  // LLM FALLBACK: Use AI to discover image selectors when all else fails  
  async function tryLLMImageFallback(document) {
    debug('🤖 LLM FALLBACK: Starting AI-powered image selector discovery...');
    
    try {
      // Get HTML for LLM analysis (trim to reasonable size)
      const html = document.documentElement.outerHTML.slice(0, 120000);
      const url = document.location.href;
      
      debug('🤖 LLM FALLBACK: Sending request to LLM agent', { 
        htmlLength: html.length, 
        url: url.slice(0, 50) 
      });
      
      // Call LLM via IPC (we're in browser context, LLM agent is in main process)
      const llmResponse = await new Promise((resolve, reject) => {
        if (typeof window !== 'undefined' && window.ipc) {
          const timeoutId = setTimeout(() => reject(new Error('LLM timeout')), 30000);
          
          window.ipc.invoke('llm-propose', {
            html: html,
            label: 'images',
            url: url
          }).then(result => {
            clearTimeout(timeoutId);
            resolve(result);
          }).catch(err => {
            clearTimeout(timeoutId);
            reject(err);
          });
        } else {
          reject(new Error('IPC not available'));
        }
      });
      
      debug('🤖 LLM FALLBACK: Response received', { 
        ok: llmResponse.ok, 
        responseType: typeof llmResponse,
        keys: Object.keys(llmResponse)
      });
      
      if (!llmResponse.ok) {
        debug('🤖 LLM FALLBACK: Response not ok:', llmResponse.error || 'Unknown error');
        return [];
      }
      
      // Extract selectors from different response formats
      let selectors = [];
      if (llmResponse.selectors && Array.isArray(llmResponse.selectors)) {
        // Backwards compatibility format: { ok: true, selectors: [...] }
        selectors = llmResponse.selectors.filter(s => typeof s === 'string');
      } else if (llmResponse.results && Array.isArray(llmResponse.results)) {
        // New format: { ok: true, results: [...] } - may be objects or strings
        selectors = llmResponse.results
          .filter(r => r && (typeof r === 'string' || r.selector))
          .map(r => typeof r === 'string' ? r : r.selector)
          .filter(s => typeof s === 'string');
      } else if (llmResponse.results && llmResponse.results.candidates) {
        // New format with candidates: { ok: true, results: { candidates: [...] } }
        selectors = llmResponse.results.candidates.filter(s => typeof s === 'string');
      } else if (llmResponse.candidates && Array.isArray(llmResponse.candidates)) {
        // Direct candidates format: { ok: true, candidates: [...] }
        selectors = llmResponse.candidates.filter(s => typeof s === 'string');
      }
      
      debug('🤖 LLM FALLBACK: Extracted selectors', { count: selectors.length, selectors });
      
      if (!selectors.length) {
        debug('🤖 LLM FALLBACK: No valid selectors found in response');
        return [];
      }
      
      const foundImages = [];
      const maxImages = 30;
      
      // Test each suggested selector
      for (const selector of selectors) {
        debug('🤖 LLM FALLBACK: Testing selector:', selector);
        
        try {
          const urls = await gatherImagesBySelector(selector);
          if (urls.length > 0) {
            debug('🤖 LLM SUCCESS: Found', urls.length, 'images with selector:', selector);
            foundImages.push(...urls);
            
            // Mark the successful selector for memory 
            mark('images', { 
              selectors: [selector], 
              attr: 'AI-discovered', 
              method: 'llm-fallback',
              urls: urls.slice(0, 10)
            });
            
            // Stop if we have enough images
            if (foundImages.length >= maxImages) break;
          }
        } catch (e) {
          debug('🤖 LLM FALLBACK: Selector test failed:', selector, e.message);
        }
      }
      
      // Remove duplicates and limit
      const uniqueImages = [...new Set(foundImages)].slice(0, maxImages);
      
      debug('🤖 LLM FALLBACK: Final results', { 
        totalFound: foundImages.length,
        uniqueCount: uniqueImages.length,
        selectors: selectors
      });
      
      return uniqueImages;
      
    } catch (e) {
      debug('🤖 LLM FALLBACK: Critical error:', e.message);
      return [];
    }
  }

  // ========== ADVANCED FUNCTIONS FROM OTHER FILES ==========
  
  // Enhanced image extraction helpers
  function extractImageUrls(imgElement) {
    const urls = [];
    
    // Extract from src and currentSrc with quality upgrades
    if (imgElement.currentSrc) urls.push(upgradeUrl(imgElement.currentSrc));
    if (imgElement.src && imgElement.src !== imgElement.currentSrc) urls.push(upgradeUrl(imgElement.src));
    
    // Extract from lazy loading attributes  
    const lazyAttrs = ['data-src', 'data-zoom-image', 'data-large-image', 'data-zoom-src', 'data-full-src'];
    lazyAttrs.forEach(attr => {
      const lazyUrl = imgElement.getAttribute(attr);
      if (lazyUrl && !urls.includes(lazyUrl)) {
        urls.push(upgradeUrl(lazyUrl));
      }
    });
    
    // Extract from srcset (get largest)
    if (imgElement.srcset) {
      const srcsetUrls = imgElement.srcset.split(',').map(s => s.trim().split(' ')[0]);
      srcsetUrls.forEach(url => {
        if (url && !urls.includes(url)) {
          urls.push(upgradeUrl(url));
        }
      });
    }
    
    return urls.filter(Boolean);
  }

  function extractModalImages() {
    const modalUrls = [];
    
    // Look for modal containers
    const modalSelectors = [
      '.modal-overlay img', '.modal-content img', '.modal-dialog img',
      '.carousel-inner img', '.swiper-container img', '.swiper-wrapper img',
      '.lightbox img', '.gallery-modal img', '.zoom-container img'
    ];
    
    modalSelectors.forEach(selector => {
      try {
        const modalImages = document.querySelectorAll(selector);
        modalImages.forEach(img => {
          const urls = extractImageUrls(img);
          urls.forEach(url => {
            if (url && !modalUrls.includes(url)) {
              modalUrls.push(url);
            }
          });
        });
      } catch (e) {
        console.log(`[DEBUG] Modal selector failed: ${selector}`, e.message);
      }
    });
    
    return modalUrls;
  }

  function scoreImageUrlQuality(url) {
    let score = 0;
    const urlLower = url.toLowerCase();
    
    // Higher score for quality indicators in URL
    if (urlLower.includes('/large/') || urlLower.includes('/large_')) score += 20;
    if (urlLower.includes('/zoom/') || urlLower.includes('/zoom_')) score += 18;
    if (urlLower.includes('/high/') || urlLower.includes('/high_')) score += 16;
    if (urlLower.includes('/detail/') || urlLower.includes('/detail_')) score += 14;
    if (urlLower.includes('/full/') || urlLower.includes('/full_')) score += 12;
    
    // Lower score for thumbnail indicators
    if (urlLower.includes('/thumb/') || urlLower.includes('/thumb_')) score -= 15;
    if (urlLower.includes('/small/') || urlLower.includes('/small_')) score -= 12;
    if (urlLower.includes('/mini/') || urlLower.includes('/mini_')) score -= 10;
    if (urlLower.includes('_thumb') || urlLower.includes('-thumb')) score -= 8;
    
    // Dimension scoring from URL
    const dimensionMatch = url.match(/(\d+)x(\d+)/);
    if (dimensionMatch) {
      const width = parseInt(dimensionMatch[1]);
      const height = parseInt(dimensionMatch[2]);
      const area = width * height;
      if (area > 800 * 800) score += 10;
      else if (area > 400 * 400) score += 5;
      else if (area < 200 * 200) score -= 5;
    }
    
    return score;
  }

  // FROM images.js - collectImagesFromPDP with sophisticated scoring
  async function collectImagesFromPDP() {
    if (window.__TAGGLO_IMAGES_CACHE__) return window.__TAGGLO_IMAGES_CACHE__;
    window.__TAGGLO_IMAGES_ALREADY_RAN__ = true;
    console.log("[DEBUG] collectImagesFromPDP starting...");
    
    const keepBiggestFromSrcset = (srcset) =>
      (srcset || "")
        .split(",")
        .map((s) => s.trim())
        .map((s) => {
          const [u, d] = s.split(/\s+/);
          const m = (d || "").match(/(\d+)w/);
          return { u, w: m ? +m[1] : 0 };
        })
        .filter((x) => x.u)
        .sort((a, b) => b.w - a.w)
        .map((x) => x.u);


    // Image relevance scoring function
    function scoreImageRelevance(imgUrl, imgElement) {
      let score = 0;
      
      // Higher score for larger images (main product images are usually larger)
      const imgRect = imgElement.getBoundingClientRect();
      if (imgRect.width > 400) score += 20;
      else if (imgRect.width > 250) score += 10;
      else if (imgRect.width > 150) score += 5;
      
      // Higher score for images in main product containers
      const containerClasses = (imgElement.closest('[class*="product"], [class*="gallery"], [class*="main"], [class*="hero"]')?.className || '').toLowerCase();
      if (containerClasses.includes('main') || containerClasses.includes('hero')) score += 15;
      if (containerClasses.includes('product') && !containerClasses.includes('related')) score += 10;
      if (containerClasses.includes('gallery')) score += 8;
      
      // Lower score for images in sidebars, related products, recommendations
      const parentClasses = (imgElement.closest('[class*="sidebar"], [class*="related"], [class*="recommend"], [class*="similar"], [class*="you-may"], [class*="also-"]')?.className || '').toLowerCase();
      if (parentClasses.includes('sidebar')) score -= 15;
      if (parentClasses.includes('related') || parentClasses.includes('recommend')) score -= 10;
      if (parentClasses.includes('similar') || parentClasses.includes('you-may')) score -= 8;
      
      // Higher score for images near the product title
      const h1 = document.querySelector('h1');
      if (h1) {
        const h1Rect = h1.getBoundingClientRect();
        const distance = Math.abs(imgRect.top - h1Rect.top) + Math.abs(imgRect.left - h1Rect.left);
        if (distance < 500) score += 12;
        else if (distance < 1000) score += 6;
      }
      
      // Higher score for images in the main content area (not header/footer)
      const inMain = imgElement.closest('main, [role="main"], .main-content, .content');
      if (inMain) score += 8;
      
      // Lower score for very small images (likely icons/thumbnails)
      if (imgRect.width < 100 || imgRect.height < 100) score -= 10;
      
      // Higher score for square or portrait aspect ratios (typical for product photos)
      const aspectRatio = imgRect.width / imgRect.height;
      if (aspectRatio >= 0.7 && aspectRatio <= 1.3) score += 5; // Square-ish
      else if (aspectRatio >= 0.5 && aspectRatio <= 0.8) score += 3; // Portrait
      
      return Math.max(0, score);
    }

    const title = T(q("h1")?.textContent) || "";
    const titleTokens = uniq(
      title
        .toLowerCase()
        .replace(/[|–—\-_/,:(){}$+@™®©%^*<>]/g, " ")
        .split(" ")
        .filter(
          (w) =>
            w &&
            !/^\d+$/.test(w) &&
            !new Set([
              "the","a","an","and","or","for","with","of","to","in","on","by",
              "this","that","is","are","be","your","our","new","sale","now",
              "women","woman","womens","men","mens","girls","boys","unisex",
              "size","sizes","color","colours","colour",
            ]).has(w)
        )
    );

    // Enhanced product gallery detection
    function findProductGalleries() {
      const galleries = [];
      const hostname = window.location.hostname.toLowerCase().replace(/^www\./, '');
      
      // Site-specific selectors for problematic sites
      const siteSpecificSelectors = {
        'allbirds.com': [
          '.swiper-slide img',           // Swiper carousel - very common
          '.swiper-container img',       // Alternative swiper structure
          '.product-image-wrapper',
          '.ProductImages',
          '.product-images-container',
          '[data-testid="product-images"]',
          '.pdp-images',
          // Fallback to any reasonable image container in main content
          'main img[src*="cdn.shop"], main img[src*="shopify"]'
        ],
        'amazon.com': [
          '.ivThumb img',               // Amazon thumbnail gallery - the good stuff!
          '#ivLargeImage',              // Main product image
          '#imageBlockContainer',
          '#imageBlock img',
          '#altImages',
          '.a-dynamic-image',
          '#main-image-container',
          '[data-action="main-image-click"]',
          '[data-dp-carousel] img'
        ],
        'adidas.com': [
          '.product-image-container',
          '.pdp-image-carousel',
          '.image-container',
          '.product-media img[src*="assets.adidas.com"]'
        ],
        'acehardware.com': [
          '.product-gallery img',
          '.mz-productimages img', 
          '.product-images img'
        ]
      };
      
      // Priority 1: Site-specific selectors
      const siteSelectors = siteSpecificSelectors[hostname] || [];
      for (const sel of siteSelectors) {
        try {
          const containers = document.querySelectorAll(sel);
          containers.forEach(container => {
            let imgs = [];
            if (container.tagName === 'IMG') {
              imgs = [container];
            } else {
              imgs = Array.from(container.querySelectorAll('img'));
            }
            if (imgs.length >= 1) {
              console.log(`[DEBUG] Found site-specific product gallery: ${sel} (${imgs.length} images)`);
              galleries.push({ container, selector: sel, priority: 0, images: imgs }); // Highest priority
            }
          });
        } catch (e) {
          console.log(`[DEBUG] Site-specific selector failed: ${sel}`, e.message);
        }
      }
      
      // Priority 2: Explicit product image containers
      const highPrioritySelectors = [
        '.swiper-slide img',              // Swiper carousels - very common across e-commerce
        '.swiper-container img',          // Alternative swiper structure  
        '.product-gallery',
        '.product-images', 
        '.product-media',
        '.product-photos',
        '[class*="productgallery"] img',  // For sites like LARQ
        '[data-testid*="gallery"]',
        '[data-testid*="images"]',
        '[class*="ProductGallery"]',
        '[class*="ProductImages"]',
        '.pdp-gallery',
        '.pdp-images'
      ];
      
      for (const sel of highPrioritySelectors) {
        const containers = document.querySelectorAll(sel);
        containers.forEach(container => {
          let imgs = [];
          if (container.tagName === 'IMG') {
            imgs = [container];  // Handle direct IMG selectors like '.swiper-slide img'
          } else {
            imgs = Array.from(container.querySelectorAll('img'));
          }
          if (imgs.length >= 1) {
            console.log(`[DEBUG] Found high-priority product gallery: ${sel} (${imgs.length} images)`);
            galleries.push({ container, selector: sel, priority: 1, images: imgs });
          }
        });
      }
      
      // Priority 2: Image carousels/sliders in product context
      const carouselSelectors = [
        '.carousel .carousel-inner',
        '.swiper-wrapper',
        '.slick-track',
        '.slider-container',
        '[class*="carousel"]',
        '[class*="slider"]'
      ];
      
      for (const sel of carouselSelectors) {
        const containers = document.querySelectorAll(sel);
        containers.forEach(container => {
          // Check if this carousel is in a product context
          const productContext = container.closest('.product, .pdp, main, [class*="Product"]');
          if (productContext) {
            const imgs = container.querySelectorAll('img');
            if (imgs.length >= 1) { // Reduced threshold
              console.log(`[DEBUG] Found product carousel: ${sel} (${imgs.length} images)`);
              galleries.push({ container, selector: sel, priority: 2, images: Array.from(imgs) });
            }
          }
        });
      }
      
      // Priority 3: Fallback to product root if no galleries found
      if (galleries.length === 0) {
        const h1 = q("h1");
        let node = h1;
        while (node && node !== document.body) {
          const cls = (node.className || "") + " " + (node.id || "");
          if (/(pdp|product|__product|detail|details|main|container)/i.test(cls)) {
            const imgs = node.querySelectorAll('img');
            if (imgs.length >= 1) {
              console.log(`[DEBUG] Using product root fallback: ${node.className || node.tagName} (${imgs.length} images)`);
              galleries.push({ container: node, selector: 'product-root', priority: 3, images: Array.from(imgs) });
            }
            break;
          }
          node = node.parentElement;
        }
        
        // If still no galleries, try main content area
        if (galleries.length === 0) {
          const main = document.querySelector('main, [role="main"], .main-content, .content');
          if (main) {
            const imgs = main.querySelectorAll('img');
            if (imgs.length >= 1) {
              console.log(`[DEBUG] Using main content fallback (${imgs.length} images)`);
              galleries.push({ container: main, selector: 'main-content', priority: 4, images: Array.from(imgs) });
            }
          }
        }
      }
      
      return galleries.sort((a, b) => a.priority - b.priority); // Highest priority first
    }
    
    const productGalleries = findProductGalleries();
    console.log(`[DEBUG] Found ${productGalleries.length} product galleries`);
    
    // Use the first/best gallery as root, or document.body as ultimate fallback
    const root = productGalleries.length > 0 ? productGalleries[0].container : document.body;

    // Enhanced URL extraction with lazy loading and quality detection
    const foundUrls = [];
    
    // STEP 1: Extract from galleries with enhanced URL detection
    for (const gallery of productGalleries) {
      for (const img of gallery.images) {
        const urls = extractImageUrls(img);
        urls.forEach(url => {
          if (url && !foundUrls.includes(url)) {
            foundUrls.push(url);
          }
        });
      }
    }
    
    // STEP 2: Look for modal overlays with high-quality images
    const modalUrls = extractModalImages();
    modalUrls.forEach(url => {
      if (url && !foundUrls.includes(url)) {
        foundUrls.push(url);
      }
    });
    
    // STEP 3: Sort by URL quality (prefer large/zoom/high-res)
    const scoredUrls = foundUrls.map(url => ({
      url,
      score: scoreImageUrlQuality(url)
    })).sort((a, b) => b.score - a.score);
    
    const qualityUrls = scoredUrls.map(item => item.url);
    
    console.log("[DEBUG] collectImagesFromPDP found", qualityUrls.length, "images:", qualityUrls.slice(0, 3));
    console.log("[DEBUG] Image quality scores:", scoredUrls.slice(0, 5).map(item => `${item.url.split('/').pop()} (${item.score})`));
    const finalImages = qualityUrls.slice(0, 20); // Limit to 20 images
    window.__TAGGLO_IMAGES_CACHE__ = finalImages; // Cache results for subsequent calls
    return finalImages;
  }

  // FROM title.js - Advanced title and brand detection
  function getTitleGeneric() {
    // First, try to find the main product container
    const productContainers = [
      '.product-detail, .product-details, .product-main, .product-container',
      '#product, #product-detail, #product-main',
      '[data-product], [data-product-detail]',
      '.pdp, .product-page, .item-detail',
      'main .product, article .product',
      '.product-info, .product-content'
    ];
    
    let productContainer = null;
    for (const selector of productContainers) {
      productContainer = document.querySelector(selector);
      if (productContainer) break;
    }
    
    // If we found a product container, search within it first
    if (productContainer) {
      const scopedSelectors = [
        'h1', 'h2',
        '.product-title, .product__title, .product-name',
        '[data-product-title], [itemprop="name"]'
      ];
      
      for (const sel of scopedSelectors) {
        const el = productContainer.querySelector(sel);
        if (el) {
          const text = T(el.innerText || el.textContent);
          if (text && text.length > 5) {
            return {
              text: text,
              selector: sel,
              attr: 'text'
            };
          }
        }
      }
    }
    
    // Fallback: try document-wide search but prioritize product-related selectors
    const globalSelectors = [
      '.product-title, .product__title, .product-name',
      '[data-product-title], [itemprop="name"]',
      'h1:not(nav h1):not(header h1):not(.site-title)',
      'h1'
    ];
    
    for (const sel of globalSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = T(el.innerText || el.textContent);
        if (text && text.length > 5) {
          return {
            text: text,
            selector: sel,
            attr: 'text'
          };
        }
      }
    }
    
    // Final fallback: og:title meta tag
    const ogTitle = T(document.querySelector('meta[property="og:title"]')?.content);
    if (ogTitle) {
      return {
        text: ogTitle,
        selector: 'meta[property="og:title"]',
        attr: 'content'
      };
    }
    return null;
  }

  function getBrandGeneric() {
    // First try JSON-LD structured data
    for (const b of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(b.textContent.trim());
        const arr = Array.isArray(data) ? data : [data];
        for (const node of arr) {
          const types = [].concat(node?.["@type"]||[]).map(String);
          if (types.some(t=>/product/i.test(t))) {
            const brand = node.brand?.name || node.brand || node.manufacturer?.name || "";
            if (brand && T(brand)) {
              return {
                text: T(brand),
                selector: 'script[type="application/ld+json"]',
                attr: 'json'
              };
            }
          }
        }
      } catch {}
    }
    
    // Extended brand selectors with more variations
    const brandSelectors = [
      'meta[property="product:brand"]',
      'meta[name="brand"]', 
      'meta[property="og:brand"]',
      '[itemprop="brand"] [itemprop="name"]',
      '[itemprop="brand"]',
      '[data-brand]',
      '.brand, .product-brand, .product__brand',
      '.manufacturer, .product-manufacturer',
      '[class*="brand"]:not([class*="branding"])',
      '.vendor, .product-vendor'
    ];
    
    for (const sel of brandSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        let brandText = "";
        if (sel.includes('data-brand')) {
          brandText = el.getAttribute('data-brand') || "";
        } else {
          brandText = el.content || el.getAttribute("content") || el.textContent || "";
        }
        if (brandText && T(brandText)) {
          return {
            text: T(brandText),
            selector: sel,
            attr: el.content || el.getAttribute("content") ? 'content' : 'text'
          };
        }
      }
    }
    
    return null;
  }

  // FROM price.js - Advanced price detection  
  const CURRENCY = /[$€£¥₹]|\b(AED|AUD|BRL|CAD|CHF|CNY|DKK|EUR|GBP|HKD|IDR|ILS|INR|JPY|KRW|MXN|MYR|NOK|NZD|PHP|PLN|RON|RUB|SAR|SEK|SGD|THB|TRY|TWD|USD|VND|ZAR)\b/i;
  const NUM = /\d+[\d.,\s]*\d|\d/;

  const normalizeMoney = (raw) => {
    if (!raw) return null;
    let s = T(raw).replace(/\u00A0/g," ");
    if (/(was|list|regular|original|compare|mrp)/i.test(s)) return null;
    const m = s.match(/(\$|€|£|¥|₹|\b[A-Z]{3}\b)\s*([0-9][0-9.,\s]*)/i);
    if (!m) return null;
    let cur = m[1];
    let num = m[2];
    num = num.replace(/\s/g,"");
    const lastComma = num.lastIndexOf(",");
    const lastDot = num.lastIndexOf(".");
    if (lastComma > lastDot) {
      num = num.replace(/\./g,"").replace(/,/g,".");
    } else {
      num = num.replace(/,/g,"");
    }
    return `${cur}${num}`;
  };

  function getPriceGeneric() {
    // Try JSON-LD first
    for (const b of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(b.textContent.trim());
        const arr = Array.isArray(data) ? data : [data];
        for (const node of arr) {
          const types = [].concat(node?.["@type"]||[]).map(String);
          if (!types.some(t=>/product/i.test(t))) continue;
          const cur = node.priceCurrency || node.offers?.priceCurrency || "";
          const offers = []
            .concat(node.offers || [])
            .map(o => o?.priceSpecification?.price || o?.price || o?.lowPrice || o?.highPrice)
            .filter(Boolean);
          if (offers.length) {
            const val = offers.find(v => /\d/.test(String(v)));
            if (val != null) return {
              text: normalizeMoney(`${cur ? cur + " " : ""}${val}`),
              selector: 'script[type="application/ld+json"]',
              attr: 'json'
            };
          }
        }
      } catch {}
    }

    const meta = document.querySelector("meta[itemprop='price']")?.getAttribute("content");
    if (meta) {
      const m = normalizeMoney(meta);
      if (m) return {
        text: m,
        selector: "meta[itemprop='price']",
        attr: 'content'
      };
    }
    
    // Continue with more price detection logic...
    return null;
  }

  // FROM specs_tags.js - Product specifications and tags
  function collectSpecs(limit=10) {
    const items = [];
    const pushFrom = (root) => {
      if (!root) return;
      root.querySelectorAll("li").forEach(li => { const s=T(li.textContent); if (s) items.push(s); });
      root.querySelectorAll("tr").forEach(tr => {
        const k=T(tr.querySelector("th,td:first-child")?.textContent);
        const v=T(tr.querySelector("td:last-child")?.textContent);
        if (k && v) items.push(`${k}: ${v}`);
      });
      root.querySelectorAll("dt").forEach(dt=>{
        const dd=dt.nextElementSibling;
        const k=T(dt.textContent), v=T(dd?.textContent);
        if (k && v) items.push(`${k}: ${v}`);
      });
    };
    const LABEL=/(specs?|specifications?|details?|product details?|tech specs?|materials?|dimensions?|features?|warranty|composition)/i;
    document.querySelectorAll("section,div,article,details").forEach(sec=>{
      const head=sec.querySelector("h1,h2,h3,h4,h5,h6,summary,[role='heading']");
      if (!head || !LABEL.test(head.textContent||"")) return;
      pushFrom(sec);
    });
    return uniq(items).slice(0, limit);
  }

  function collectTags(limit = 12) {
    const tags = [];
    
    // Only collect from product-specific containers, not random UI elements
    const productContainers = document.querySelectorAll(
      '[class*="product"]:not([class*="related"]):not([class*="recommend"]), ' +
      '[class*="detail"], [class*="spec"], [class*="attribute"], ' +
      'main, [role="main"], .main-content'
    );
    
    productContainers.forEach(container => {
      // Look for actual product attribute chips/pills/tags within product containers
      container.querySelectorAll('[class*="chip"],[class*="pill"],[class*="tag"],[class*="badge"]').forEach(el => {
        const t = T(el.textContent);
        // Filter out common UI elements and navigation
        if (t && t.length <= 30 && !/^(save|add|buy|cart|checkout|login|menu|search|filter|sort|view|more|less|show|hide|close|accept|decline|ok|cancel|yes|no|prev|next|back|home|shop)$/i.test(t)) {
          tags.push(t);
        }
      });
    });
    
    return uniq(tags).slice(0, limit);
  }

  // Helper functions for advanced scraping
  const T = (s) => typeof s === 'string' ? s.trim() : '';
  const uniq = (arr) => [...new Set(arr)];

  // CDN URL upgrade function for higher quality images - GLOBAL SCOPE
  function upgradeUrl(u) {
    try {
      let url = u;
      // protocol-less → absolute
      if (url.startsWith("//")) url = location.protocol + url;

      // Shopify: .../files/xxx_640x640.jpg → 2048x2048
      if (/cdn\.shopify\.com/i.test(url)) {
        url = url.replace(/_(\d+)x(\d+)\.(jpe?g|png|webp|avif)(\?|#|$)/i, "_2048x2048.$3$4");
        url = url.replace(/[?&]width=\d+/i, "");
      }

      // SFCC (Demandware): Enhanced quality upgrades for Acme Tools
      if (/\/dw\/image\/v2\//i.test(url)) {
        // Remove existing size/quality params first
        url = url.replace(/[?&](sw|sh|quality|fmt)=\d*[^&]*/gi, "");
        
        // Add high quality parameters for crisp images
        const separator = url.includes('?') ? '&' : '?';
        url += `${separator}sw=1200&sh=1200&quality=90&fmt=webp`;
      }

      // Scene7: is/image/... ?wid=640 → drop size params to let server serve big
      if (/scene7\.com\/is\/image/i.test(url)) {
        url = url.replace(/[?&](wid|hei|fmt|qlt|op_sharpen)=\d*[^&]*/gi, "");
      }

      // Ace Hardware (Mozu): upgrade low quality images to higher quality
      if (/cdn-tp3\.mozu\.com/i.test(url) && url.includes('quality=60')) {
        // Upgrade quality from 60 to 90 and remove small size limits
        url = url.replace(/quality=60/g, 'quality=90');
        url = url.replace(/max=\d+/g, 'max=800');
      }

      // strip generic width/height query hints
      url = url.replace(/[?&](w|h|width|height|size)=\d+[^&]*/gi, "");
      // collapse trailing ? or & if empty
      url = url.replace(/\?(&|$)/, "").replace(/&$/, "");
      return url;
    } catch { return u; }
  }

  // Expandable logging system for detailed method traces
  const detailedLogs = {};
  
  function debugDetail(field, message) {
    if (!detailedLogs[field]) detailedLogs[field] = [];
    detailedLogs[field].push(`  📋 ${field.toUpperCase()}: ${message}`);
  }
  
  function getDetailedLogs(field) {
    return detailedLogs[field] || [];
  }
  
  function clearDetailedLogs() {
    Object.keys(detailedLogs).forEach(key => delete detailedLogs[key]);
  }
  
  function formatExpandableLog(field, summary, details) {
    return `${summary} ▼ [Show Details: ${details.length} steps]`;
  }

  // 🔄 AUDIT MODE: Enable generic-first for clean slate testing
  window.__TG_AUDIT_GENERIC_FIRST = true;

  // Generic-first audit helpers for all fields
  function handleTitleGenericFirst() {
    debug('🧪 TITLE: AUDIT MODE - Generic → Custom');
    debugDetail('title', 'Skipping memory (audit mode)');
    
    // STEP 1: Try advanced generic first
    debug('🧠 TITLE: Trying getTitleGeneric()...');
    debugDetail('title', 'Trying getTitleGeneric() - product container detection...');
    const advancedTitle = getTitleGeneric();
    if (advancedTitle?.text) {
      mark('title', { selectors: [advancedTitle.selector], attr: advancedTitle.attr, method: 'advanced-generic' });
      debug('🧠 TITLE ADVANCED GENERIC:', advancedTitle.text);
      debugDetail('title', `getTitleGeneric() found: "${advancedTitle.text}" via ${advancedTitle.selector}`);
      debugDetail('title', 'Skipping legacy getTitle() - advanced method succeeded');
      debugDetail('title', 'Skipping custom handler - generic sufficient');
      const details = getDetailedLogs('title');
      debug(formatExpandableLog('TITLE', `✅ TITLE FINAL: ${advancedTitle.text} (method: advanced-generic)`, details));
      return advancedTitle.text;
    }
    
    // STEP 2: Try legacy generic
    debug('🖼️ TITLE: Advanced failed, trying legacy getTitle()...');
    debugDetail('title', 'getTitleGeneric() failed - no product container or valid selectors');
    debugDetail('title', 'Trying legacy getTitle() - h1/h2 fallback selectors...');
    const legacyTitle = getTitle();
    if (legacyTitle) {
      debug('🖼️ TITLE LEGACY GENERIC:', legacyTitle);
      debugDetail('title', `getTitle() found: "${legacyTitle}" via legacy selectors`);
      debugDetail('title', 'Skipping custom handler - legacy method succeeded');
      const details = getDetailedLogs('title');
      debug(formatExpandableLog('TITLE', `✅ TITLE FINAL: ${legacyTitle} (method: legacy-generic)`, details));
      return legacyTitle;
    }
    
    debug('❌ TITLE: Both generic methods failed');
    debugDetail('title', 'getTitle() failed - no h1/h2 found');
    debugDetail('title', 'Both advanced and legacy generic methods failed');
    const details = getDetailedLogs('title');
    debug(formatExpandableLog('TITLE', `❌ TITLE FINAL: null (method: none-successful)`, details));
    return null;
  }

  function handleBrandGenericFirst() {
    debug('🧪 BRAND: AUDIT MODE - Generic → Custom');
    
    // STEP 1: Try advanced generic first
    debug('🧠 BRAND: Trying getBrandGeneric()...');
    const advancedBrand = getBrandGeneric();
    if (advancedBrand?.text) {
      mark('brand', { selectors: [advancedBrand.selector], attr: advancedBrand.attr, method: 'advanced-generic' });
      debug('🧠 BRAND ADVANCED GENERIC:', advancedBrand.text);
      return advancedBrand.text;
    }
    
    // STEP 2: Try legacy generic
    debug('🖼️ BRAND: Advanced failed, trying legacy getBrand()...');
    const legacyBrand = getBrand();
    if (legacyBrand) {
      debug('🖼️ BRAND LEGACY GENERIC:', legacyBrand);
      return legacyBrand;
    }
    
    debug('❌ BRAND: Both generic methods failed');
    return null;
  }

  function handlePriceGenericFirst() {
    debug('🧪 PRICE: AUDIT MODE - Generic → Custom');
    
    // STEP 1: Try advanced generic first
    debug('🧠 PRICE: Trying getPriceGeneric()...');
    const advancedPrice = getPriceGeneric();
    if (advancedPrice?.text) {
      mark('price', { selectors: [advancedPrice.selector], attr: advancedPrice.attr, method: 'advanced-generic' });
      debug('🧠 PRICE ADVANCED GENERIC:', advancedPrice.text);
      return advancedPrice.text;
    }
    
    // STEP 2: Try legacy generic (getPrice function)
    debug('🖼️ PRICE: Advanced failed, trying legacy getPrice()...');
    const legacyPrice = getPrice();
    if (legacyPrice) {
      debug('🖼️ PRICE LEGACY GENERIC:', legacyPrice);
      return legacyPrice;
    }
    
    debug('❌ PRICE: Both generic methods failed');
    return null;
  }

  function handleDescriptionGenericFirst() {
    debug('🧪 DESCRIPTION: AUDIT MODE - Generic only');
    
    // Only legacy generic available for description
    debug('🖼️ DESCRIPTION: Trying getDescription()...');
    const description = getDescription();
    if (description) {
      debug('🖼️ DESCRIPTION GENERIC:', description);
      return description;
    }
    
    debug('❌ DESCRIPTION: Generic method failed');
    return null;
  }

  // Generic-first audit helper for images
  async function handleImagesGenericFirst() {
    debug('🔄 IMAGES: AUDIT MODE - Generic → Custom');
    
    // STEP 1: Try advanced generic first (sophisticated gallery detection)
    debug('🧠 IMAGES: Trying advanced generic (collectImagesFromPDP)...');
    let advancedGenericImages = [];
    try {
      advancedGenericImages = await collectImagesFromPDP();
      if (advancedGenericImages.length > 0) {
        mark('images', { selectors: ['advanced-gallery-detection'], attr: 'src', method: 'advanced-generic' });
        debug('🧠 ADVANCED GENERIC:', { count: advancedGenericImages.length, images: advancedGenericImages.slice(0, 3) });
      }
    } catch (e) { debug('❌ Advanced generic error:', e.message); }
    
    // STEP 2: Try legacy generic if insufficient
    let legacyGenericImages = [];
    if (advancedGenericImages.length < 3) {
      debug('🖼️ IMAGES: Advanced insufficient, trying legacy generic...');
      try {
        legacyGenericImages = await getImagesGeneric();
        debug('🖼️ LEGACY GENERIC:', { count: legacyGenericImages.length, images: legacyGenericImages.slice(0, 3) });
      } catch (e) { debug('❌ Legacy generic error:', e.message); }
    }
    
    // STEP 3: Only try custom if generic still insufficient
    let customImages = [];
    const allGenericImages = await uniqueImages(advancedGenericImages.concat(legacyGenericImages));
    if (allGenericImages.length < 3) {
      debug('🧩 IMAGES: Generic insufficient (' + allGenericImages.length + ' < 3), trying custom fallback...');
      if (typeof getCustomHandlers === 'function') {
        try {
          const ch = getCustomHandlers();
          if (ch?.images && typeof ch.images === 'function') {
            const customResult = await Promise.resolve(ch.images(document));
            if (customResult && Array.isArray(customResult)) {
              customImages = customResult.filter(Boolean);
              mark('images', { selectors: ['custom'], attr: 'custom', method: 'custom-fallback' });
              debug('🧩 CUSTOM FALLBACK:', { count: customImages.length, images: customImages.slice(0, 3) });
            }
          }
        } catch (e) { debug('❌ Custom fallback error:', e.message); }
      }
    } else {
      debug('🎯 GENERIC SUCCESS! No custom handler needed');
    }
    
    const finalImages = await uniqueImages(allGenericImages.concat(customImages));
    debug('🔄 AUDIT FINAL IMAGES:', { count: finalImages.length, images: finalImages.slice(0, 3) });
    return finalImages.slice(0, 30);
  }

  /* ---------- ENTRY ---------- */
  async function scrapeProduct(opts) {
    try {
      const host = location.hostname.replace(/^www\./,'');
      const mode = (opts && opts.mode) || 'normal';
      log('🚀 SCRAPE START', { host, href: location.href, mode });
      clearDetailedLogs(); // Clear detailed logs from previous scrape

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
        title = await fromMemory('title', mem.title);
        brand = await fromMemory('brand', mem.brand);
        description = await fromMemory('description', mem.description);
        price = await fromMemory('price', mem.price);
        // images = await fromMemory('images', mem.images);  // Skip memory for images
      } else {
        debug('🔄 NORMAL MODE - memory + fallbacks');
        
        title = window.__TG_AUDIT_GENERIC_FIRST ? handleTitleGenericFirst() : await fromMemory('title', mem.title);
        debug('📝 TITLE FROM MEMORY:', title);
        if (!title) {
          debug('📝 TITLE: Falling back to generic...');
          title = getTitle();
          debug('📝 TITLE FROM GENERIC:', title);
        }
        
        brand = window.__TG_AUDIT_GENERIC_FIRST ? handleBrandGenericFirst() : await fromMemory('brand', mem.brand);
        debug('🏷️ BRAND FROM MEMORY:', brand);
        if (!brand) {
          debug('🏷️ BRAND: Falling back to generic...');
          brand = getBrand();
          debug('🏷️ BRAND FROM GENERIC:', brand);
        }
        
        description = window.__TG_AUDIT_GENERIC_FIRST ? handleDescriptionGenericFirst() : await fromMemory('description', mem.description);
        debug('📄 DESCRIPTION FROM MEMORY:', description);
        if (!description) {
          debug('📄 DESCRIPTION: Falling back to generic...');
          description = getDescription();
          debug('📄 DESCRIPTION FROM GENERIC:', description);
        }
        
        price = window.__TG_AUDIT_GENERIC_FIRST ? handlePriceGenericFirst() : await fromMemory('price', mem.price);
        debug('💰 PRICE FROM MEMORY:', price);
        if (!price) {
          debug('💰 PRICE: Falling back to generic...');
          price = getPriceGeneric();
          debug('💰 PRICE FROM GENERIC:', price);
        }
        
        // images = await fromMemory('images', mem.images);  // Skip memory for images
        debug('🖼️ IMAGES: Skipping memory in normal mode');
        images = [];
        
        // AUDIT: Generic-first image flow
        if (window.__TG_AUDIT_GENERIC_FIRST) {
          debug('🧪 AUDIT: Generic-first image flow enabled');
          try {
            images = await handleImagesGenericFirst();
          } catch (e) {
            debug('❌ AUDIT generic-first failed:', e?.message || e);
          }
        } else {
        
        // ALWAYS try custom handlers (regardless of memory count)
        {
          debug('🖼️ IMAGES: Need more images (have ' + (images?.length || 0) + ', need 3+)');
          const memoryImages = images || [];
          // Try custom handlers first
          let customImages = [];
          if (typeof getCustomHandlers === 'function') {
            try {
              const ch = getCustomHandlers();
              if (ch?.images && typeof ch.images === 'function') {
                debug('🧩 IMAGES: Trying custom handler...');
                const customResult = await Promise.resolve(ch.images(document));
                if (customResult && Array.isArray(customResult)) {
                  customImages = customResult.filter(Boolean);
                  mark('images', { selectors: ['custom'], attr: 'custom', method: 'custom-handler' });
                  debug('🧩 CUSTOM IMAGES:', { count: customImages.length, images: customImages.slice(0, 3) });
                }
              }
            } catch (e) { 
              debug('❌ Custom image handler error:', e.message); 
            }
          }
          
          // If we have custom images, use them (custom overrides memory)
          if (customImages.length > 0) {
            debug('🎯 USING CUSTOM IMAGES (overriding memory)');
            images = customImages.slice(0, 30);
          } else {
            // Merge and dedupe memory + custom
            let combinedImages = await uniqueImages(memoryImages.concat(customImages));
            
            // Fall back to generic only if still insufficient
            if (combinedImages.length < 3) {
              debug('🖼️ IMAGES: Custom insufficient, getting generic images...');
              const genericImages = await getImagesGeneric();
              debug('🖼️ GENERIC IMAGES:', { count: genericImages.length, images: genericImages.slice(0, 3) });
              combinedImages = await uniqueImages(combinedImages.concat(genericImages));
            }
          
            images = combinedImages.slice(0, 30);
          }
          debug('🖼️ FINAL IMAGES:', { count: images.length, images: images.slice(0, 3) });
        }  // end AUDIT else
          
          // LLM FALLBACK: If no images found, try AI-powered selector discovery
          if (images.length === 0 && mode !== 'memoryOnly') {
            debug('🤖 IMAGES: Zero images found, activating LLM fallback...');
            try {
              const llmImages = await tryLLMImageFallback(document);
              if (llmImages.length > 0) {
                images = llmImages.slice(0, 30);
                debug('🤖 LLM RESCUE SUCCESS:', { count: images.length, images: images.slice(0, 3) });
                mark('images', { selectors: ['llm-fallback'], attr: 'AI-discovered', method: 'llm-fallback' });
              } else {
                debug('🤖 LLM FALLBACK: No additional images found');
              }
            } catch (e) {
              debug('❌ LLM FALLBACK ERROR:', e.message);
            }
          }
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
      
      // Include debug log in response
      if (typeof window !== 'undefined' && window.__tg_debugLog) {
        payload.__debugLog = window.__tg_debugLog;
        window.__tg_debugLog = []; // Clear for next run
      }
      
      return payload;
    } catch (e) {
      return { __error: (e && e.stack) || String(e), __stage: 'scrapeProduct' };
    }
  }

  Object.assign(globalThis, { scrapeProduct });
})();
