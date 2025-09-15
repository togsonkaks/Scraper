
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
        enrichedUrls.push({ url: s1, element: el, index: i });
      }
      
      const ss = attrs.srcset;
      const best = pickFromSrcset(ss); 
      if (best) {
        debug('✅ Found image URL from srcset:', best.slice(0, 100));
        enrichedUrls.push({ url: best, element: el, index: i });
      }
      
      // Check picture parent
      if (el.parentElement && el.parentElement.tagName.toLowerCase()==='picture') {
        debug('📸 Checking picture parent for sources...');
        for (const src of el.parentElement.querySelectorAll('source')) {
          const b = pickFromSrcset(src.getAttribute('srcset')); 
          if (b) {
            debug('✅ Found image URL from picture source:', b.slice(0, 100));
            enrichedUrls.push({ url: b, element: el, index: i });
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
        title = await fromMemory('title', mem.title);
        brand = await fromMemory('brand', mem.brand);
        description = await fromMemory('description', mem.description);
        price = await fromMemory('price', mem.price);
        // images = await fromMemory('images', mem.images);  // Skip memory for images
      } else {
        debug('🔄 NORMAL MODE - memory + fallbacks');
        
        title = await fromMemory('title', mem.title);
        debug('📝 TITLE FROM MEMORY:', title);
        if (!title) {
          debug('📝 TITLE: Falling back to generic...');
          title = getTitle();
          debug('📝 TITLE FROM GENERIC:', title);
        }
        
        brand = await fromMemory('brand', mem.brand);
        debug('🏷️ BRAND FROM MEMORY:', brand);
        if (!brand) {
          debug('🏷️ BRAND: Falling back to generic...');
          brand = getBrand();
          debug('🏷️ BRAND FROM GENERIC:', brand);
        }
        
        description = await fromMemory('description', mem.description);
        debug('📄 DESCRIPTION FROM MEMORY:', description);
        if (!description) {
          debug('📄 DESCRIPTION: Falling back to generic...');
          description = getDescription();
          debug('📄 DESCRIPTION FROM GENERIC:', description);
        }
        
        price = await fromMemory('price', mem.price);
        debug('💰 PRICE FROM MEMORY:', price);
        if (!price) {
          debug('💰 PRICE: Falling back to generic...');
          price = getPriceGeneric();
          debug('💰 PRICE FROM GENERIC:', price);
        }
        
        // images = await fromMemory('images', mem.images);  // Skip memory for images
        debug('🖼️ IMAGES: Skipping memory in normal mode');
        images = [];
        
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
