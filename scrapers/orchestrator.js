
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
    window.__tg_debugLineCounter = window.__tg_debugLineCounter || 0;
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
        if (typeof window !== 'undefined') {
          window.__tg_debugLineCounter = (window.__tg_debugLineCounter || 0) + 1;
          const lineNum = String(window.__tg_debugLineCounter).padStart(3, ' ');
          console.log(`${lineNum}${TAG}`, ...a);
          addToDebugLog('info', `${lineNum}`, ...a);
        } else {
          console.log(TAG, ...a);
          addToDebugLog('info', ...a);
        }
      } catch(_){} 
    }
  };
  const warn = (...a) => { 
    if (DEBUG) {
      try { 
        if (typeof window !== 'undefined') {
          window.__tg_debugLineCounter = (window.__tg_debugLineCounter || 0) + 1;
          const lineNum = String(window.__tg_debugLineCounter).padStart(3, ' ');
          console.warn(`${lineNum}${TAG}[WARN]`, ...a);
          addToDebugLog('warning', `${lineNum}`, ...a);
        } else {
          console.warn(TAG, ...a);
          addToDebugLog('warning', ...a);
        }
      } catch(_){} 
    }
  };
  const debug = (...a) => { 
    if (DEBUG) {
      try { 
        if (typeof window !== 'undefined') {
          window.__tg_debugLineCounter = (window.__tg_debugLineCounter || 0) + 1;
          const lineNum = String(window.__tg_debugLineCounter).padStart(3, ' ');
          console.debug(`${lineNum}${TAG}[DEBUG]`, ...a);
          addToDebugLog('debug', `${lineNum}`, ...a);
        } else {
          console.debug(TAG + '[DEBUG]', ...a);
          addToDebugLog('debug', ...a);
        }
      } catch(_){} 
    }
  };
  const error = (...a) => { 
    if (DEBUG) {
      try { 
        if (typeof window !== 'undefined') {
          window.__tg_debugLineCounter = (window.__tg_debugLineCounter || 0) + 1;
          const lineNum = String(window.__tg_debugLineCounter).padStart(3, ' ');
          console.error(`${lineNum}${TAG}[ERROR]`, ...a);
          addToDebugLog('error', `${lineNum}`, ...a);
        } else {
          console.error(TAG + '[ERROR]', ...a);
          addToDebugLog('error', ...a);
        }
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

  // Capture container context for performance tracking
  const captureContainerContext = (el) => {
    try {
      const context = {
        containerType: 'unknown',
        parentSelector: 'none',
        containerClasses: [],
        containerIds: [],
        depth: 0
      };

      let parent = el.parentElement;
      let depth = 0;

      // Walk up the DOM to find meaningful container context
      while (parent && depth < 5) {
        const classes = parent.className || '';
        const id = parent.id || '';
        const tagName = parent.tagName?.toLowerCase() || '';

        // Capture container information
        if (classes) context.containerClasses.push(classes);
        if (id) context.containerIds.push(id);

        // Identify container types based on common patterns
        if (tagName === 'section' || tagName === 'article') {
          context.containerType = tagName;
          context.parentSelector = `${tagName}${id ? '#' + id : ''}${classes ? '.' + classes.split(' ')[0] : ''}`;
          break;
        } else if (/gallery|carousel|slider|swiper|product-images?|image-container/i.test(classes)) {
          context.containerType = 'gallery';
          context.parentSelector = `.${classes.split(' ').find(c => /gallery|carousel|slider|swiper|product|image/i.test(c)) || classes.split(' ')[0]}`;
          break;
        } else if (/grid|list|collection|products?/i.test(classes)) {
          context.containerType = 'listing';
          context.parentSelector = `.${classes.split(' ').find(c => /grid|list|collection|product/i.test(c)) || classes.split(' ')[0]}`;
          break;
        } else if (id && /product|detail|main/i.test(id)) {
          context.containerType = 'product-detail';
          context.parentSelector = `#${id}`;
          break;
        }

        parent = parent.parentElement;
        depth++;
      }

      context.depth = depth;
      return context;
    } catch (err) {
      return {
        containerType: 'error',
        parentSelector: 'error',
        containerClasses: [],
        containerIds: [],
        depth: 0
      };
    }
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
      t = t.replace(/[^\d.,]/g,'').replace(/\u00A0/g,''); // Remove currency and spaces
      
      // Robust locale-aware decimal normalization
      const lastComma = t.lastIndexOf(',');
      const lastDot = t.lastIndexOf('.');
      
      if (lastComma > -1 && lastDot > -1) {
        // Both comma and dot present
        if (lastComma > lastDot) {
          // European format: "1.234,56" → "1234.56"
          t = t.replace(/\./g, '').replace(/,/g, '.');
        } else {
          // US format: "1,234.56" → "1234.56"
          t = t.replace(/,/g, '');
        }
      } else if (lastComma > -1 && lastDot === -1) {
        // Only comma present - check if it's decimal or thousands
        const afterComma = t.length - lastComma - 1;
        if (afterComma === 2 && !/,\d{3}/.test(t)) {
          // Looks like European decimal: "33,99" → "33.99"
          t = t.replace(/,/g, '.');
        } else {
          // Thousands separator: "1,234" → "1234"
          t = t.replace(/,/g, '');
        }
      }
      // If only dot present, keep as-is
      
      const n = parseFloat(t);
      return Number.isFinite(n) ? n : null;
    }).filter(n => n != null && n > 0);
    return nums;
  }
  function bestPriceFromString(s, preferFirst = false) {
    debug('🔍 PRICE PARSING:', { 
      input: s, 
      inputType: typeof s,
      inputLength: String(s).length 
    });
    
    // Early exit for "See price in cart" pages
    if (/(see price in cart|add to cart to see price|price shown in cart)/i.test(String(s))) {
      debug('🛒 CART-ONLY PRICING detected, returning null');
      return null;
    }
    
    // Pre-filter: Remove original/list price segments to focus on current/sale prices
    const originalPriceRegex = /(was|list|regular|original|compare|msrp|retail)\s*:?.{0,20}?[\p{Sc}$€£¥A-Z]{0,3}\s*\d[\d.,]*/giu;
    let cleanedInput = String(s).replace(originalPriceRegex, '');
    debug('🧹 CLEANED INPUT:', { original: s, cleaned: cleanedInput });
    
    // DECIMAL RECONSTRUCTION: Fix split cents like "$26 99" → "$26.99" and glued digits "$2699" → "$26.99"
    // Pattern 1: Currency + dollars + separator + 2-digit cents: "$26 99" → "$26.99"
    cleanedInput = cleanedInput.replace(/([\p{Sc}$€£¥]\s*\d{1,3}(?:[.,]\d{3})*)[^\d]{1,3}(\d{2})\b/giu, '$1.$2');
    
    // Pattern 2: Currency + 4-6 digit block without decimals: "$2699" → "$26.99" (FIXED: exclude 3-digit valid prices like $100)
    cleanedInput = cleanedInput.replace(/([\p{Sc}$€£¥]\s*)(\d{4,6})(?![.,]\d{2})(?=\D|$)/giu, (match, currency, digits) => {
      if (digits.includes('.') || digits.includes(',')) return match; // Already has decimal
      const intPart = digits.slice(0, -2);
      const centsPart = digits.slice(-2);
      return currency + intPart + '.' + centsPart;
    });
    
    debug('🔧 RECONSTRUCTED INPUT:', { cleaned: String(s).replace(originalPriceRegex, ''), reconstructed: cleanedInput });
    
    const monetary = parseMoneyTokens(cleanedInput);
    debug('💰 MONETARY TOKENS:', monetary);
    
    if (monetary.length) {
      // Separate decimal-bearing tokens from integers
      const decimalTokens = monetary.filter(price => price % 1 !== 0); // Has decimal places
      const integerTokens = monetary.filter(price => price % 1 === 0);  // No decimal places
      
      debug('🔢 TOKEN BREAKDOWN:', { 
        decimalTokens, 
        integerTokens,
        preferDecimals: decimalTokens.length > 0
      });
      
      // Smart selection: prefer plausible prices across ALL tokens first, then fallback to decimals preference
      const plausibleAll = monetary.filter(price => price >= 5 && price <= 100000);
      
      let result;
      if (plausibleAll.length > 0) {
        // Choose minimum plausible price (prevents $1.00 winning over $100)
        result = Math.min(...plausibleAll);
      } else {
        // Fallback: prefer decimal tokens over integers when no plausible prices exist
        const chosenTokens = decimalTokens.length > 0 ? decimalTokens : monetary;
        result = Math.min(...chosenTokens);
      }
      
      debug('✅ PRICE FROM MONETARY:', { 
        result, 
        method: 'MINIMUM_SMART',
        chosenFrom: decimalTokens.length > 0 ? 'DECIMAL_TOKENS' : 'ALL_TOKENS',
        allTokens: monetary 
      });
      return result;
    }
    
    // CURRENCY-CONTEXT FALLBACK: Only consider numbers near currency symbols, avoid random integers
    const fallback = [];
    const hasCurrency = /[\p{Sc}$€£¥]|USD|EUR|GBP|AUD|CAD|NZD|CHF|JPY|CNY|RMB|INR|SAR|AED/giu.test(cleanedInput);
    
    // Extract numbers from cleaned input without global reconstruction to avoid fake decimals
    String(cleanedInput).replace(/(\d+(?:\.\d+)?)(?!\s*%)/g, (m, g1) => {
      const n = parseFloat(g1);
      if (isFinite(n) && n > 0) {
        // Skip bare 3-digit integers (100-999) that might be SKUs/quantities when currency is present
        if (hasCurrency && n >= 100 && n <= 999 && n % 1 === 0) {
          debug('🚫 SKIPPING LIKELY SKU/QUANTITY:', n);
          return m;
        }
        fallback.push(n);
      }
      return m;
    });
    
    debug('🔢 CURRENCY-CONTEXT FALLBACK:', { hasCurrency, numbers: fallback });
    
    // Apply plausibility filter to fallback numbers too
    const plausibleFallback = fallback.filter(price => price >= 5 && price <= 100000);
    const result = plausibleFallback.length > 0 ? Math.min(...plausibleFallback) : (fallback.length ? Math.min(...fallback) : null);
    debug('✅ FINAL PRICE RESULT:', { 
      result, 
      method: 'MIN_FALLBACK',
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
      
      const attrFirst = attr(el, 'content') || attr(el, 'data-price') || attr(el, 'data-js-pricelabel') || attr(el, 'aria-label');
      debug('📋 CHECKING ATTRIBUTES:', { 
        content: attr(el, 'content'),
        'data-price': attr(el, 'data-price'),
        'data-js-pricelabel': attr(el, 'data-js-pricelabel'),
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
        
        // Filter out original price segments, then apply decimal reconstruction
        const originalPriceRegex = /(was|list|regular|original|compare|msrp|retail)\s*:?.{0,20}?[\p{Sc}$€£¥A-Z]{0,3}\s*\d[\d.,]*/giu;
        let cleanedText = t.replace(originalPriceRegex, '');
        
        // Apply same decimal reconstruction as in bestPriceFromString
        // Pattern 1: Currency + dollars + separator + 2-digit cents: "$26 99" → "$26.99"
        cleanedText = cleanedText.replace(/([\p{Sc}$€£¥]\s*\d{1,3}(?:[.,]\d{3})*)[^\d]{1,3}(\d{2})\b/giu, '$1.$2');
        
        // Pattern 2: Currency + 4-6 digit block without decimals: "$2699" → "$26.99" (FIXED: exclude 3-digit valid prices like $100)
        cleanedText = cleanedText.replace(/([\p{Sc}$€£¥]\s*)(\d{4,6})(?![.,]\d{2})(?=\D|$)/giu, (match, currency, digits) => {
          if (digits.includes('.') || digits.includes(',')) return match; // Already has decimal
          const intPart = digits.slice(0, -2);
          const centsPart = digits.slice(-2);
          return currency + intPart + '.' + centsPart;
        });
        
        debug(`🧹 ANCESTOR ${i} CLEANED & RECONSTRUCTED:`, { 
          original: t.slice(0, 100), 
          cleaned: t.replace(originalPriceRegex, '').slice(0, 100),
          reconstructed: cleanedText.slice(0, 100)
        });
        
        const monetaryTokens = parseMoneyTokens(cleanedText);
        // Smart selection: prefer plausible prices across ALL tokens first, then fallback to decimals preference
        let cand = null;
        if (monetaryTokens.length) {
          const decimalTokens = monetaryTokens.filter(price => price % 1 !== 0);
          const plausibleAll = monetaryTokens.filter(price => price >= 5 && price <= 100000);
          
          if (plausibleAll.length > 0) {
            // Choose minimum plausible price (prevents $1.00 winning over $100)
            cand = Math.min(...plausibleAll);
          } else {
            // Fallback: prefer decimal tokens over integers when no plausible prices exist
            const chosenTokens = decimalTokens.length > 0 ? decimalTokens : monetaryTokens;
            cand = Math.min(...chosenTokens);
          }
        }
        debug(`💰 ANCESTOR ${i} SMART PRICE:`, cand, 'from tokens:', monetaryTokens);
        
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
  
  // Smart Shopify files filtering - allow product images, block theme assets
  function shouldBlockShopifyFiles(url, element = null) {
    if (!/\/cdn\/shop\/files\//i.test(url)) return false; // Not a /files/ URL
    
    // Always block obvious theme assets
    if (/(logo|icon|sprite|theme|favicon|nav|header|footer|menu|swatch)\./i.test(url)) {
      return true;
    }
    
    // Allow if URL has product-scale size tokens or progressive format
    if (/_\d{3,4}x[\d.]*\.progressive\./i.test(url) || /_\d{3,4}x\d{3,4}/i.test(url)) {
      return false; // Allow - has size tokens indicating product image
    }
    
    // Allow if filename suggests product content (vs theme assets)
    if (!/^(theme|logo|icon|nav|menu|header|footer|sprite|favicon)/i.test(url.split('/').pop())) {
      return false; // Allow - doesn't start with theme asset names
    }
    
    // Default: block if no positive signals
    return true;
  }
  
  // Universal CDN URL upgrade function
  function upgradeCDNUrl(url) {
    let upgraded = url;
    
    // FREE PEOPLE/URBAN OUTFITTERS: Scene7 CDN upgrades
    if (/images\.urbndata\.com\/is\/image/i.test(url)) {
      // Upgrade detail shots to high-res zoom images  
      upgraded = upgraded.replace(/\$a15-pdp-detail-shot\$/g, '$redesign-zoom-5x$');
      upgraded = upgraded.replace(/\$pdp-detail-shot\$/g, '$redesign-zoom-5x$');
      
      // Remove small dimension constraints
      upgraded = upgraded.replace(/[?&]wid=\d+/gi, '');
      upgraded = upgraded.replace(/[?&]hei=\d+/gi, '');
      upgraded = upgraded.replace(/[?&]fit=constrain/gi, '');
      upgraded = upgraded.replace(/[?&]qlt=\d+/gi, '');
    }
    
    // SHOPIFY CDN: Upgrade small dimensions to high-quality versions
    if (/\/cdn\/shop\//i.test(url) || /cdn\.shopify\.com/i.test(url)) {
      // Upgrade single dimension: 523x → 1020x, 640x → 1020x, etc.
      upgraded = upgraded.replace(/_([1-9]\d{2})x(\.|\?|$)/gi, '_1020x$2');
      
      // Upgrade two dimensions only if both are small (avoid downgrading _640x1200 → _1020x1020)
      upgraded = upgraded.replace(/_([1-9]\d{2})x(\d{3,4})/gi, (match, w, h) => {
        const width = parseInt(w);
        const height = parseInt(h);
        if (width < 1020 && height < 1020) {
          return '_1020x1020';
        } else {
          // Keep larger dimension, upgrade smaller one
          const maxDim = Math.max(width, height, 1020);
          return `_${maxDim}x${maxDim}`;
        }
      });
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED Shopify URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
      }
    }
    
    // BBQ GUYS/SHOCHO CDN: Remove resize parameters for full-size images
    if (/cdn\.shocho\.co/i.test(url)) {
      // Remove resize parameters completely to get full-size images
      upgraded = upgraded.replace(/\?i10c=img\.resize\([^)]+\)/gi, '');
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED Shocho CDN URL: ${url.substring(url.lastIndexOf('/') + 1)} -> Full-size image`);
      }
    }
    
    
    // Clean up trailing ? or &
    upgraded = upgraded.replace(/\?(&|$)/, '').replace(/&$/, '');
    
    if (upgraded !== url && !/cdn\.shocho\.co/i.test(url)) {
      debug(`✨ UPGRADED CDN URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
    }
    
    return upgraded;
  }

  // Family deduplication for CDN variants (keeps only best per asset)
  function deduplicateImageFamilies(enrichedImages) {
    const families = new Map();
    
    // Group images by CDN provider and public ID
    for (const img of enrichedImages) {
      const meta = analyzeImageMetadata(img.url, img.element);
      let familyKey = img.url; // Default: treat as unique
      
      if (meta.isCloudinary && meta.publicId) {
        // Group Cloudinary images by public ID
        familyKey = `cloudinary:${meta.publicId}`;
      } else {
        // Group other CDN variants by base URL patterns
        const baseUrl = img.url
          .replace(/[?&]w(idth)?=\d+/gi, '')
          .replace(/[?&]h(eight)?=\d+/gi, '')
          .replace(/[?&]dpr=[\d.]+/gi, '')
          .replace(/[?&]q(uality)?=\d+/gi, '')
          .replace(/[?&]q_auto:\w+/gi, '')
          .replace(/[_](\d+)x\d*/gi, '')
          .replace(/(\d+)x\d+/gi, '');
        familyKey = baseUrl;
      }
      
      if (!families.has(familyKey)) {
        families.set(familyKey, []);
      }
      families.get(familyKey).push({ ...img, meta });
    }
    
    // Keep only the best image from each family
    const deduplicated = [];
    for (const [familyKey, variants] of families) {
      if (variants.length === 1) {
        deduplicated.push(variants[0]);
      } else {
        // Score all variants and keep the best using unified scoring
        let bestVariant = variants[0];
        let bestScore = computeAndScoreImage(bestVariant);
        
        for (let i = 1; i < variants.length; i++) {
          const score = computeAndScoreImage(variants[i]);
          if (score > bestScore) {
            bestScore = score;
            bestVariant = variants[i];
          }
        }
        
        debug(`👨‍👩‍👧‍👦 FAMILY DEDUP: Kept best variant (score: ${bestScore}) from ${variants.length} siblings for ${familyKey.substring(0, 50)}...`);
        deduplicated.push(bestVariant);
      }
    }
    
    return deduplicated;
  }

  // Enhanced CDN and quality metadata analysis
  function analyzeImageMetadata(url, element) {
    const metadata = {
      urlWidth: 0,
      urlHeight: 0,
      dpr: 1,
      quality: null,
      cdnProvider: null,
      isCloudinary: false,
      publicId: null,
      effectiveWidth: 0,
      transformParams: {}
    };
    
    // Detect Cloudinary CDN
    if (url.includes('/image/upload/') || url.includes('res.cloudinary.com')) {
      metadata.isCloudinary = true;
      metadata.cdnProvider = 'cloudinary';
      
      // Extract transformation parameters from Cloudinary URL
      const transformMatch = url.match(/\/image\/upload\/([^\/]+)/);
      if (transformMatch) {
        const transforms = transformMatch[1];
        
        // Parse w_, h_, dpr_, q_auto, q_, f_auto, c_ parameters
        const params = {
          w: transforms.match(/w_(\d+)/)?.[1],
          h: transforms.match(/h_(\d+)/)?.[1],
          dpr: transforms.match(/dpr_(\d+(?:\.\d+)?)/)?.[1],
          q_auto: transforms.match(/q_auto:(\w+)/)?.[1],
          q: transforms.match(/q_(\d+)/)?.[1],
          f_auto: transforms.includes('f_auto'),
          c: transforms.match(/c_(\w+)/)?.[1]
        };
        
        metadata.transformParams = params;
        if (params.w) metadata.urlWidth = parseInt(params.w);
        if (params.h) metadata.urlHeight = parseInt(params.h);
        if (params.dpr) metadata.dpr = parseFloat(params.dpr);
        if (params.q_auto) metadata.quality = params.q_auto;
        if (params.q) metadata.quality = parseInt(params.q);
        
        // Extract public ID for deduplication
        const publicIdMatch = url.match(/\/v\d+\/(.+?)(?:\.|$)/);
        if (publicIdMatch) metadata.publicId = publicIdMatch[1];
      }
    }
    
    // Enhanced size detection for non-Cloudinary URLs
    if (!metadata.urlWidth) {
      const sizePatterns = [
        /(?:max|w|width|h|height|imwidth|imageWidth|imheight)=([0-9]+)/i,
        /[\/]([wh])\/([0-9]+)/i,           // w/640, h/1920
        /[_]([wh])_([0-9]+)/i,             // w_1500, h_900
        /_(\d+)x\d*(?:_|\.|$)/i,           // _750x, _1024x1024
        /(\d+)x\d+(?:_|\.|$)/i,            // 750x750
        /\b([0-9]{3,4})(?:w|h|px)(?:_|\.|$)/i, // 750w, 1200px
        /[?&]\$n_(\d+)w?\b/i               // ASOS patterns
      ];
      
      for (const pattern of sizePatterns) {
        const match = url.match(pattern);
        if (match) {
          let size = 0;
          if (pattern.source.includes('[\/]([wh])\/') || pattern.source.includes('[_]([wh])_')) {
            size = parseInt(match[2]);
          } else {
            size = parseInt(match[1]);
          }
          if (!isNaN(size)) {
            metadata.urlWidth = Math.max(metadata.urlWidth, size);
          }
        }
      }
    }
    
    // Calculate effective resolution (width × DPR)
    let maxWidth = metadata.urlWidth;
    
    // Check element dimensions if available
    if (element) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0) maxWidth = Math.max(maxWidth, rect.width);
      
      // Check natural dimensions if available
      if (element.naturalWidth) maxWidth = Math.max(maxWidth, element.naturalWidth);
    }
    
    // FALLBACK QUALITY DETECTION for images without size info
    if (maxWidth === 0) {
      // Use DOM context clues
      if (element) {
        const classList = element.className.toLowerCase();
        const parent = element.parentElement;
        const parentClass = parent ? parent.className.toLowerCase() : '';
        
        // High-quality context indicators
        if (/hero|main|primary|large|zoom|detail|full/.test(classList + ' ' + parentClass)) {
          maxWidth = 1200; // Assume high quality
          metadata.quality = 'inferred-high';
        }
        // Medium-quality context indicators  
        else if (/gallery|product|image/.test(classList + ' ' + parentClass)) {
          maxWidth = 800; // Assume medium quality
          metadata.quality = 'inferred-medium';
        }
        // Low-quality context indicators
        else if (/thumb|small|mini|icon|preview/.test(classList + ' ' + parentClass)) {
          maxWidth = 200; // Assume low quality
          metadata.quality = 'inferred-low';
        }
      }
      
      // File path quality indicators
      if (maxWidth === 0) {
        if (/\/(hd|uhd|4k|full|original|master|hero)/i.test(url)) {
          maxWidth = 1920;
          metadata.quality = 'path-hd';
        } else if (/\/(large|big|zoom|detail)/i.test(url)) {
          maxWidth = 1200;
          metadata.quality = 'path-large';
        } else if (/\/(medium|med|standard)/i.test(url)) {
          maxWidth = 600;
          metadata.quality = 'path-medium';
        } else if (/\/(small|thumb|mini|icon)/i.test(url)) {
          maxWidth = 200;
          metadata.quality = 'path-small';
        }
      }
      
      // Format quality indicators
      if (maxWidth === 0) {
        if (/\.(webp|avif)($|\?)/i.test(url)) {
          maxWidth = 800; // Modern formats usually higher quality
          metadata.quality = 'format-modern';
        } else if (/\.(jpg|jpeg|png)($|\?)/i.test(url)) {
          maxWidth = 600; // Standard formats
          metadata.quality = 'format-standard';
        }
      }
      
      // Final fallback
      if (maxWidth === 0) {
        maxWidth = 400; // Conservative default
        metadata.quality = 'fallback-default';
      }
    }
    
    metadata.effectiveWidth = maxWidth * metadata.dpr;
    
    return metadata;
  }

  // Enhanced image quality scoring function with aggressive filtering  
  function scoreImageURL(url, enrichedData = null, elementIndex = 0) {
    if (!url) return 0;
    
    // Handle both old and new calling conventions
    let element = null;
    let containerSelector = null;
    
    if (enrichedData) {
      if (enrichedData.element !== undefined) {
        // New format: enriched object with { url, element, index, containerSelector }
        element = enrichedData.element;
        containerSelector = enrichedData.containerSelector;
      } else {
        // Old format: element passed directly
        element = enrichedData;
      }
    }
    
    // FREE PEOPLE/URBAN OUTFITTERS: Filter bad patterns and prioritize high-res
    if (/images\.urbndata\.com\/is\/image/i.test(url)) {
      // Block swatch URLs entirely
      if (/_swatch\//i.test(url) || /swatch\?/i.test(url)) {
        debug(`🚫 BLOCKED Free People swatch: ${url.substring(url.lastIndexOf('/') + 1)}`);
        return 0; // Block swatches completely
      }
      
      // Block category images (not product detail)
      if (/\$a15-category\$/i.test(url)) {
        debug(`🚫 BLOCKED Free People category image: ${url.substring(url.lastIndexOf('/') + 1)}`);
        return 0; // Block category thumbnails
      }
      
      // Block small dimension URLs (≤800px)
      const smallDimMatch = url.match(/[?&](?:wid|hei|w|h)=([0-9]+)/i);
      if (smallDimMatch) {
        const dimension = parseInt(smallDimMatch[1]);
        if (dimension <= 800) {
          debug(`🚫 BLOCKED Free People small image: ${dimension}px in ${url.substring(url.lastIndexOf('/') + 1)}`);
          return 0; // Block small images
        }
      }
      
      // High score for high-res zoom images (BEST QUALITY)
      if (/\$redesign-zoom-5x\$/i.test(url)) {
        debug(`🎯 FREE PEOPLE HIGH-RES: ${url.substring(url.lastIndexOf('/') + 1)}`);
        return 95; // High score for zoom images
      }
      
      // Penalty for non-upgraded Free People images (base images without zoom)
      if (!/\$redesign-zoom-5x\$/i.test(url) && !/\$a15-category\$/i.test(url)) {
        debug(`⚠️ FREE PEOPLE LOW-QUALITY: Non-upgraded base image ${url.substring(url.lastIndexOf('/') + 1)}`);
        return 55; // Low but passing score for non-upgraded images (below zoom's 95)
      }
    }
    
    // BBQ GUYS/SHOCHO CDN: Strict product-only filtering
    if (/cdn\.shocho\.co/i.test(url)) {
      // Only allow /sc-image/ paths - block everything else
      if (!/\/sc-image\//i.test(url)) {
        debug(`🚫 BLOCKED Shocho non-product: ${url.substring(url.lastIndexOf('/') + 1)}`);
        return 0; // Block all non-product images
      }
      
      // Block small resize parameters (≤800px)
      const shochoResizeMatch = url.match(/\?i10c=img\.resize\(width:([0-9]+),height:([0-9]+)\)/i);
      if (shochoResizeMatch) {
        const width = parseInt(shochoResizeMatch[1]);
        const height = parseInt(shochoResizeMatch[2]);
        if (width <= 800 || height <= 800) {
          debug(`🚫 BLOCKED Shocho small image: ${width}x${height} in ${url.substring(url.lastIndexOf('/') + 1)}`);
          return 0; // Block small images
        }
      }
      
      // High score for product images without resize params
      if (!/\?i10c=img\.resize/i.test(url)) {
        debug(`🎯 SHOCHO PRODUCT FULL-SIZE: ${url.substring(url.lastIndexOf('/') + 1)}`);
        return 90; // High score for full-size product images
      }
      
      // Medium score for larger product images with resize params
      if (shochoResizeMatch) {
        const width = parseInt(shochoResizeMatch[1]);
        const height = parseInt(shochoResizeMatch[2]);
        if (width > 800 || height > 800) {
          debug(`✅ SHOCHO PRODUCT LARGE: ${width}x${height} in ${url.substring(url.lastIndexOf('/') + 1)}`);
          return 75; // Good score for large product images
        }
      }
    }
    
    
    // SMART CDN AND QUALITY ANALYSIS
    const meta = analyzeImageMetadata(url, element);
    
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
    
    // EFFECTIVE RESOLUTION SCORING (replaces old size detection) - CALIBRATED
    if (meta.effectiveWidth > 0) {
      // Diminishing returns: max 40 points instead of 100
      const resolutionScore = Math.min(40, 12 * Math.log2(meta.effectiveWidth / 300));
      score += resolutionScore;
      debug(`🔍 EFFECTIVE RESOLUTION: ${meta.effectiveWidth}px (${meta.urlWidth}×${meta.dpr}) = +${resolutionScore.toFixed(1)} points`);
      
      // SMALL WIDTH PENALTY - anything under 300px drops to bottom
      if (meta.effectiveWidth < 300) {
        score -= 100; // Massive penalty to sink small images
        debug(`📉 SMALL WIDTH PENALTY: ${meta.effectiveWidth}px gets -100 points (under 300px threshold)`);
      }
    } else {
      // Fallback size detection for non-CDN URLs
      const sizePatterns = [
        /(?:max|w|width|h|height|imwidth|imageWidth|imheight)=([0-9]+)/i,
        /[\/]([wh])\/([0-9]+)/i,
        /[_]([wh])_([0-9]+)/i,
        /_(\d+)x\d*(?:_|\.|$)/i,
        /(\d+)x\d+(?:_|\.|$)/i,
        /\b([0-9]{3,4})(?:w|h|px)(?:_|\.|$)/i,
        /[?&]\$n_(\d+)w?\b/i
      ];
      
      let detectedSize = 0;
      for (const pattern of sizePatterns) {
        const match = url.match(pattern);
        if (match) {
          let size = 0;
          if (pattern.source.includes('[\/]([wh])\/') || pattern.source.includes('[_]([wh])_')) {
            size = parseInt(match[2]);
          } else {
            size = parseInt(match[1]);
          }
          if (!isNaN(size)) {
            detectedSize = Math.max(detectedSize, size);
          }
        }
      }
      
      if (detectedSize > 0) {
        if (detectedSize >= 1200) score += 40;
        else if (detectedSize >= 800) score += 30;
        else if (detectedSize >= 600) score += 20;
        else if (detectedSize >= 400) score += 10;
        else if (detectedSize < 200) score -= 40;
      }
    }
    
    // CLOUDINARY QUALITY SCORING
    if (meta.isCloudinary && meta.quality) {
      if (meta.quality === 'best') {
        score += 30;
        debug(`✨ CLOUDINARY QUALITY: q_auto:best = +30 points`);
      } else if (meta.quality === 'good') {
        score += 10;
        debug(`🟡 CLOUDINARY QUALITY: q_auto:good = +10 points`);
      } else if (meta.quality === 'eco') {
        score -= 20;
        debug(`📉 CLOUDINARY QUALITY: q_auto:eco = -20 points`);
      } else if (typeof meta.quality === 'number') {
        if (meta.quality >= 85) {
          score += 20;
          debug(`💎 CLOUDINARY QUALITY: q_${meta.quality} = +20 points`);
        } else if (meta.quality <= 60) {
          score -= 15;
          debug(`📉 CLOUDINARY QUALITY: q_${meta.quality} = -15 points`);
        }
      }
    }
    
    // CDN TRUST SCORING
    if (meta.cdnProvider === 'cloudinary') {
      score += 10;
      debug(`☁️ CDN TRUST: Cloudinary = +10 points`);
    }
    
    // DOMAIN PREFERENCE SCORING - boost same-domain images (CALIBRATED)
    const currentDomain = globalThis.location?.hostname?.replace(/^www\./, '') || '';
    try {
      const imgDomain = new URL(url).hostname.replace(/^www\./, '');
      if (currentDomain && imgDomain === currentDomain) {
        score += 15;
        debug(`🏠 SAME DOMAIN BONUS: +15 points (${currentDomain})`);
      } else if (currentDomain && url.includes(currentDomain)) {
        score += 10;
        debug(`🏠 DOMAIN REFERENCE BONUS: +10 points`);
      }
    } catch (e) {
      // Invalid URL, skip domain check
    }
    
    // UTILITY IMAGE PENALTIES - sink UI/utility images to bottom
    const fileName = url.substring(url.lastIndexOf('/') + 1).toLowerCase();
    
    if (/(frame|mockup|ui-|banner)/i.test(fileName)) {
      score -= 60;
      debug(`📉 FRAME/UI PENALTY: "${fileName}" gets -60 points`);
    }
    if (/(size-?chart|chart|guide)/i.test(fileName)) {
      score -= 50;
      debug(`📉 SIZE CHART PENALTY: "${fileName}" gets -50 points`);
    }
    if (/^0+\d*\.(jpg|jpeg|png|webp)$/i.test(fileName)) {
      score -= 40;
      debug(`📉 GENERIC NUMBER PENALTY: "${fileName}" gets -40 points`);
    }
    if (/(nav|menu|dropdown|header|footer)/i.test(fileName)) {
      score -= 30;
      debug(`📉 NAVIGATION PENALTY: "${fileName}" gets -30 points`);
    }
    
    // UNIFIED PRIMARY GALLERY BONUS SYSTEM - Use unified isPrimaryGallery detection
    if (enrichedData && enrichedData.isPrimaryGallery) {
      // Apply guards - don't give bonus to obvious utility images
      const isUtilityImage = /(frame|mockup|ui-|banner|size-?chart|chart|guide|nav|menu|dropdown|header|footer|ezgif|resize)/i.test(fileName);
      const isSmallImage = meta.effectiveWidth > 0 && meta.effectiveWidth < 250;
      
      if (!isUtilityImage && !isSmallImage) {
        score += 35;
        debug(`🏆 PRIMARY GALLERY BONUS: "${fileName}" from unified detection gets +35 points`);
      } else {
        debug(`🚫 PRIMARY GALLERY BONUS BLOCKED: "${fileName}" failed guards (utility: ${isUtilityImage}, small: ${isSmallImage})`);
      }
    } else {
      const contextInfo = enrichedData ? enrichedData.containerSelector || 'unknown' : 'legacy-call';
      debug(`📍 CONTAINER INFO: "${fileName}" from "${contextInfo}" (not primary gallery)`);
    }
    
    // Legacy ASOS bonus (keeping for backward compatibility, but reduced)
    if (/\$n_(\d+)w.*wid=(\d+)/i.test(url)) {
      const matches = url.match(/\$n_(\d+)w.*wid=(\d+)/i);
      const nSize = parseInt(matches[1]);
      const widSize = parseInt(matches[2]);
      const maxSize = Math.max(nSize, widSize);
      
      if (maxSize >= 1200) score += 30; // Reduced since effective resolution handles this
      else if (maxSize >= 800) score += 20;
      debug(`🎯 ASOS LEGACY BONUS: ${maxSize}px gets +${maxSize >= 1200 ? 30 : 20} points`);
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
    
    // Product code detection bonuses (CALIBRATED)
    if (/\b[A-Z]\d{4}[A-Z]?\b/i.test(url)) score += 20; // Product codes like M6169R, A0480U
    if (/\bproduct/i.test(url)) score += 10;
    
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

  // UNIFIED SCORING SYSTEM - combines A1 context detection + B1 preprocessing
  function computeAndScoreImage(imageData) {
    const { url, element, index, containerSelector } = imageData;
    
    // B1's preprocessing pipeline (ensures consistent URL handling)
    let processedUrl = url;
    try {
      processedUrl = new URL(url, location.href).toString();
    } catch {}
    
    // Apply CDN upgrades (B1 strength)
    const upgradedUrl = upgradeCDNUrl(processedUrl);
    
    // Analyze metadata (B1 strength)
    const metadata = analyzeImageMetadata(upgradedUrl, element);
    
    // A1's context detection strength - unified primary gallery detection
    const isPrimaryGallery = determineIsPrimaryGallery(containerSelector, element);
    
    // Unified scoring with consistent context
    const enrichedImageData = {
      ...imageData,
      url: upgradedUrl,
      isPrimaryGallery,
      metadata
    };
    
    const score = scoreImageURL(upgradedUrl, enrichedImageData, index);
    
    // Unified clamping to 0-205 range with integer rounding
    const clampedScore = Math.round(Math.max(0, Math.min(205, score)));
    
    debug(`🎯 UNIFIED SCORE: ${clampedScore} for ${upgradedUrl.substring(upgradedUrl.lastIndexOf('/') + 1).slice(0, 50)}`);
    
    return clampedScore;
  }
  
  // Unified primary gallery detection (A1 + unified selectors)
  function determineIsPrimaryGallery(containerSelector, element) {
    // Selector-based detection (A1 strength)
    if (containerSelector && (
      containerSelector.includes('.product-gallery') ||
      containerSelector.includes('#imageBlock') ||
      containerSelector.includes('#altImages') ||
      containerSelector.includes('.flickity-viewport') ||
      containerSelector.includes('.swiper-container') ||
      containerSelector.includes('[data-a-dynamic-image]')
    )) {
      return true;
    }
    
    // DOM-based detection (fallback)
    if (element && element.closest) {
      const galleryAncestor = element.closest('.product-gallery, #imageBlock, #altImages, .flickity-viewport, .swiper-container, [data-a-dynamic-image], .product-images, .image-gallery');
      if (galleryAncestor) return true;
    }
    
    return false;
  }

  // Parallel Image Collection: Runs both A1 and B1 simultaneously for comprehensive coverage
  async function collectImagesCombined({ doc = document, observeMs = 1200 } = {}) {
    debug('🔄 PARALLEL COLLECTION: Starting A1 + B1 simultaneous collection...');
    
    // Run both methods in parallel with error isolation
    const [a1Result, b1Result] = await Promise.allSettled([
      Promise.race([
        getImagesGeneric(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('A1 timeout')), 2000))
      ]),
      Promise.race([
        getImagesUnified({ doc, observeMs }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('B1 timeout')), 2000))
      ])
    ]);

    // Extract results safely with performance tracking
    const a1Images = a1Result.status === 'fulfilled' ? (a1Result.value || []) : [];
    const a1Error = a1Result.status === 'rejected' ? a1Result.reason.message : null;
    const b1Images = b1Result.status === 'fulfilled' ? (b1Result.value || []) : [];
    const b1Error = b1Result.status === 'rejected' ? b1Result.reason.message : null;
    
    debug(`📊 PARALLEL RESULTS: A1=${a1Images.length} images, B1=${b1Images.length} images`);
    
    if (a1Result.status === 'rejected') {
      debug('❌ A1 COLLECTION ERROR:', a1Result.reason?.message);
    }
    if (b1Result.status === 'rejected') {
      debug('❌ B1 COLLECTION ERROR:', b1Result.reason?.message);
    }
    
    // Collection method performance summary
    debug(`🎯 COLLECTION PERFORMANCE: A1 ${a1Error ? 'FAILED' : 'SUCCESS'} (${a1Images.length} images), B1 ${b1Error ? 'FAILED' : 'SUCCESS'} (${b1Images.length} images)`);
    
    if (a1Images.length === 0 && b1Images.length === 0) {
      debug('⚠️ BOTH COLLECTIONS FAILED: No images found by A1 or B1');
    }

    // Normalize outputs to common format
    const normalizedA1 = normalizeA1Images(a1Images);
    const normalizedB1 = normalizeB1Images(b1Images);
    
    // Merge and deduplicate
    const mergedImages = mergeImageCandidates(normalizedA1, normalizedB1);
    
    debug(`🎯 PARALLEL FINAL: ${mergedImages.length} images after merge/dedup (A1: ${normalizedA1.length}, B1: ${normalizedB1.length})`);
    
    return mergedImages.slice(0, 30);
  }

  // Normalize A1 images (already filtered/scored) to ImageCandidate format
  function normalizeA1Images(images) {
    return images.map((img, index) => ({
      url: typeof img === 'string' ? img : img.url,
      canonicalUrl: canonicalKey(typeof img === 'string' ? img : img.url),
      origin: 'A1',
      scoreByA1: typeof img === 'object' && img.score ? img.score : null,
      scoreByB1: null,
      scoreFinal: typeof img === 'object' && img.score ? img.score : 0,
      upgradedUrl: upgradeCDNUrl(typeof img === 'string' ? img : img.url),
      element: typeof img === 'object' ? img.element : null,
      index: index,
      context: { source: 'A1-getImagesGeneric', method: 'site-specific-or-fallback' }
    }));
  }

  // Normalize B1 images (already filtered/scored) to ImageCandidate format - LIKE A1
  function normalizeB1Images(images) {
    return images.map((img, index) => ({
      url: typeof img === 'string' ? img : img.url,
      canonicalUrl: canonicalKey(typeof img === 'string' ? img : img.url),
      origin: 'B1',
      scoreByA1: null,
      scoreByB1: typeof img === 'object' && img.score ? img.score : null,  // ← PRESERVE existing score (like A1)
      scoreFinal: typeof img === 'object' && img.score ? img.score : 0,    // ← PRESERVE existing score (like A1)
      upgradedUrl: upgradeCDNUrl(typeof img === 'string' ? img : img.url),
      element: typeof img === 'object' ? img.element : null,
      index: index,
      context: { source: 'B1-unifiedCollector', method: 'selector-based-like-A1' }
    }));
  }

  // Merge and deduplicate ImageCandidates, keeping highest scoring per canonical URL
  function mergeImageCandidates(a1Candidates, b1Candidates) {
    const candidateMap = new Map();
    
    // Process all candidates
    [...a1Candidates, ...b1Candidates].forEach(candidate => {
      const key = candidate.canonicalUrl;
      const existing = candidateMap.get(key);
      
      if (!existing) {
        candidateMap.set(key, candidate);
      } else {
        // Merge origins and keep highest score
        const mergedCandidate = {
          ...existing,
          origin: existing.origin === candidate.origin ? existing.origin : `${existing.origin}+${candidate.origin}`,
          scoreByA1: existing.scoreByA1 || candidate.scoreByA1,
          scoreByB1: existing.scoreByB1 || candidate.scoreByB1,
          scoreFinal: Math.max(existing.scoreFinal || 0, candidate.scoreFinal || 0),
          context: {
            ...existing.context,
            mergedFrom: [existing.origin, candidate.origin]
          }
        };
        candidateMap.set(key, mergedCandidate);
      }
    });
    
    // Convert to array and sort by final score
    const merged = Array.from(candidateMap.values())
      .sort((a, b) => (b.scoreFinal || 0) - (a.scoreFinal || 0));
    
    // Add diagnostic info
    const a1Only = merged.filter(c => c.origin === 'A1').length;
    const b1Only = merged.filter(c => c.origin === 'B1').length;
    const both = merged.filter(c => c.origin.includes('+')).length;
    
    debug(`🔍 MERGE BREAKDOWN: A1-only=${a1Only}, B1-only=${b1Only}, Both=${both}, Total=${merged.length}`);
    
    return merged;
  }


  // Hybrid unique images with score threshold and file size filtering
  async function hybridUniqueImages(enrichedUrls) {
    debug('🔄 HYBRID FILTERING UNIQUE IMAGES...', { inputCount: enrichedUrls.length });
    const groups = new Map(); // canonical URL -> array of enriched URLs
    const seenDebugLogs = new Set();
    const filtered = { empty: 0, invalid: 0, junk: 0, lowScore: 0, smallFile: 0, duplicateGroups: 0, kept: 0 };
    
    // Container performance tracking
    const containerScoreStats = new Map(); // containerSelector -> { scores: [], count: 0, avgScore: 0 }
    
    // Rejection tracking by selector
    const rejectionStats = new Map(); // containerSelector -> { notImageUrl: 0, lowScore: 0, junk: 0, smallFile: 0, scores: [] }
    
    // Helper function to track rejections by selector
    function trackRejection(enriched, type, score = 0) {
      const containerKey = enriched.containerSelector || 'unknown';
      if (!rejectionStats.has(containerKey)) {
        rejectionStats.set(containerKey, { notImageUrl: 0, lowScore: 0, junk: 0, smallFile: 0, scores: [] });
      }
      const stats = rejectionStats.get(containerKey);
      stats[type]++;
      if (score > 0) stats.scores.push(score);
    }
    
    // Group enriched URLs by canonical form
    for (const enriched of enrichedUrls) {
      if (!enriched.url) {
        filtered.empty++;
        continue;
      }
      
      // Apply CDN upgrades before scoring and processing
      enriched.url = upgradeCDNUrl(enriched.url);
      
      const abs = toAbs(enriched.url);
      
      // Basic image validation
      if (!looksLikeImageURL(abs)) {
        trackRejection(enriched, 'notImageUrl');
        const selectorInfo = enriched.containerSelector ? ` via [${enriched.containerSelector}]` : '';
        addImageDebugLog('debug', `❌ NOT IMAGE URL${selectorInfo}: ${abs.slice(0, 100)}`, abs, 0, false);
        filtered.invalid++;
        continue;
      }
      
      if (JUNK_IMG.test(abs) || BASE64ISH_SEG.test(abs)) {
        trackRejection(enriched, 'junk');
        const selectorInfo = enriched.containerSelector ? ` via [${enriched.containerSelector}]` : '';
        addImageDebugLog('debug', `🗑️ JUNK IMAGE${selectorInfo}: ${abs.slice(0, 80)}`, abs, 0, false);
        filtered.junk++;
        continue;
      }
      
      // Apply score threshold using unified scoring (minimum 50 points)
      const score = computeAndScoreImage(enriched);
      
      // Track container score performance
      const containerKey = enriched.containerSelector || 'unknown';
      if (!containerScoreStats.has(containerKey)) {
        containerScoreStats.set(containerKey, { scores: [], count: 0, avgScore: 0, highCount: 0, lowCount: 0 });
      }
      const stats = containerScoreStats.get(containerKey);
      stats.scores.push(score);
      stats.count++;
      if (score >= 100) stats.highCount++;
      if (score < 50) stats.lowCount++;
      
      if (score < 50) {
        trackRejection(enriched, 'lowScore', score);
        const selectorInfo = enriched.containerSelector ? ` via [${enriched.containerSelector}]` : '';
        addImageDebugLog('debug', `📉 LOW SCORE REJECTED (${score})${selectorInfo}: ${abs.slice(0, 100)}`, abs, score, false);
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
    
    // FAMILY DEDUPLICATION: Group CDN variants before selecting best images
    const allCandidates = [];
    for (const [canonical, candidates] of groups) {
      allCandidates.push(...candidates);
    }
    
    debug(`🔄 HYBRID UNIQUE: Applying family deduplication to ${allCandidates.length} candidates`);
    const familyDeduplicated = deduplicateImageFamilies(allCandidates);
    debug(`👨‍👩‍👧‍👦 HYBRID UNIQUE: ${familyDeduplicated.length} images after family deduplication`);
    
    // Regroup deduplicated images by canonical key
    const deduplicatedGroups = new Map();
    for (const img of familyDeduplicated) {
      const canonical = canonicalKey(img.url);
      if (!deduplicatedGroups.has(canonical)) {
        deduplicatedGroups.set(canonical, []);
      }
      deduplicatedGroups.get(canonical).push(img);
    }
    
    // Select best scoring image from each group, maintain DOM order
    const bestImages = [];
    for (const [canonical, candidates] of deduplicatedGroups) {
      if (candidates.length === 1) {
        // Only one candidate, use it
        const candidate = candidates[0];
        bestImages.push({ ...candidate, canonical });
        const selectorInfo = candidate.containerSelector ? ` via [${candidate.containerSelector}]` : '';
        addImageDebugLog('debug', `✅ SINGLE IMAGE (score: ${candidate.score})${selectorInfo}: ${candidate.url.slice(0, 100)}`, candidate.url, candidate.score, true);
        filtered.kept++;
      } else {
        // Multiple candidates, pick highest score
        let bestCandidate = candidates.reduce((best, current) => 
          current.score > best.score ? current : best
        );
        
        bestImages.push({ ...bestCandidate, canonical });
        const selectorInfo = bestCandidate.containerSelector ? ` via [${bestCandidate.containerSelector}]` : '';
        addImageDebugLog('debug', `✅ BEST OF ${candidates.length} (score: ${bestCandidate.score})${selectorInfo}: ${bestCandidate.url.slice(0, 100)}`, bestCandidate.url, bestCandidate.score, true);
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
    
    // Apply file size filtering (100KB minimum)
    const sizeFilteredImages = [];
    const fileSizeCheckPromises = [];
    
    for (const img of bestImages) {
      // Trusted CDNs bypass ALL size checks - HIGHEST PRIORITY  
      if (/(?:adoredvintage\.com|cdn-tp3\.mozu\.com|assets\.adidas\.com|cdn\.shop|shopify|cloudfront|amazonaws|scene7)/i.test(img.url)) {
        sizeFilteredImages.push(img);
        const selectorInfo = img.containerSelector ? ` via [${img.containerSelector}]` : '';
        addImageDebugLog('debug', `🔒 TRUSTED CDN BYPASS${selectorInfo}: ${img.url.slice(0, 100)}`, img.url, img.score, true);
        continue;
      }
      // Trust high scores over file size limits (modern CDN optimization) - EARLY CHECK
      if (img.score >= 65 && estimateFileSize(img.url) >= 15000) {  // High score + minimum size check
        sizeFilteredImages.push(img);
        const selectorInfo = img.containerSelector ? ` via [${img.containerSelector}]` : '';
        addImageDebugLog('debug', `🎯 HIGH SCORE + SIZE OK (${img.score})${selectorInfo}: ${img.url.slice(0, 100)}`, img.url, img.score, true);
        continue;
      } else if (img.score >= 50 && /[?&](f_auto|q_auto|w[_=]\d+|h[_=]\d+)/i.test(img.url)) {  // LOWERED FROM 85 TO 50
        // Good score + modern CDN optimization = keep it
        sizeFilteredImages.push(img);
        const selectorInfo = img.containerSelector ? ` via [${img.containerSelector}]` : '';
        addImageDebugLog('debug', `🔧 CDN OPTIMIZED (${img.score})${selectorInfo}: ${img.url.slice(0, 100)}`, img.url, img.score, true);
        continue;
      }
      
      const estimatedSize = estimateFileSize(img.url);
      
      if (estimatedSize >= 50000) {  // LOWERED FROM 100KB TO 50KB
        // Estimated size is good, keep it
        sizeFilteredImages.push(img);
        const selectorInfo = img.containerSelector ? ` via [${img.containerSelector}]` : '';
        addImageDebugLog('debug', `📏 SIZE OK (est: ${Math.round(estimatedSize/1000)}KB)${selectorInfo}: ${img.url.slice(0, 100)}`, img.url, img.score, true);
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
        const selectorInfo = img.containerSelector ? ` via [${img.containerSelector}]` : '';
        addImageDebugLog('debug', `📉 TOO SMALL (est: ${Math.round(estimatedSize/1000)}KB)${selectorInfo}: ${img.url.slice(0, 100)}`, img.url, img.score, false);
        
        // Track rejection by selector
        const containerKey = img.containerSelector || 'unknown';
        if (!rejectionStats.has(containerKey)) {
          rejectionStats.set(containerKey, { notImageUrl: 0, lowScore: 0, junk: 0, smallFile: 0, scores: [] });
        }
        rejectionStats.get(containerKey).smallFile++;
        
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
          const selectorInfo = img.containerSelector ? ` via [${img.containerSelector}]` : '';
          addImageDebugLog('debug', `🎯 HIGH SCORE + SIZE OK (${img.score})${selectorInfo}: ${img.url.slice(0, 100)}`, img.url, img.score, true);
        } else if (img.score >= 50 && /[?&](f_auto|q_auto|w[_=]\d+|h[_=]\d+)/i.test(img.url)) {  // LOWERED FROM 85 TO 50
          // Good score + modern CDN optimization = keep it
          sizeFilteredImages.push(img);
          const selectorInfo = img.containerSelector ? ` via [${img.containerSelector}]` : '';
          addImageDebugLog('debug', `🔧 CDN OPTIMIZED (${img.score})${selectorInfo}: ${img.url.slice(0, 100)}`, img.url, img.score, true);
        } else if (actualSize && actualSize >= 100000) {
          sizeFilteredImages.push(img);
          addImageDebugLog('debug', `📏 SIZE VERIFIED (${Math.round(actualSize/1000)}KB): ${img.url.slice(0, 100)}`, img.url, img.score, true);
        } else if (!actualSize && (img.score >= 95 || /\b(assets?|cdn|media)\./i.test(img.url))) {
          // HEAD failed but high score or CDN - likely CORS issue, keep it
          sizeFilteredImages.push(img);
          addImageDebugLog('debug', `📏 SIZE CHECK FAILED (CORS?) - keeping high-score/CDN: ${img.url.slice(0, 100)}`, img.url, img.score, true);
        } else if (actualSize && actualSize < 5000 && !/w[_=]\d{3,}|h[_=]\d{3,}/i.test(img.url)) {
          // Only reject truly tiny images without dimension hints
          const selectorInfo = img.containerSelector ? ` via [${img.containerSelector}]` : '';
          addImageDebugLog('debug', `📉 TRULY TINY REJECTED (${Math.round(actualSize/1000)}KB)${selectorInfo}: ${img.url.slice(0, 100)}`, img.url, img.score, false);
          
          // Track rejection by selector
          const containerKey = img.containerSelector || 'unknown';
          if (!rejectionStats.has(containerKey)) {
            rejectionStats.set(containerKey, { notImageUrl: 0, lowScore: 0, junk: 0, smallFile: 0, scores: [] });
          }
          rejectionStats.get(containerKey).smallFile++;
          
          filtered.smallFile++;
        } else {
          // Keep borderline cases - better to include than exclude
          sizeFilteredImages.push(img);
          addImageDebugLog('debug', `📊 BORDERLINE KEPT (${actualSize ? Math.round(actualSize/1000) : '?'}KB): ${img.url.slice(0, 100)}`, img.url, img.score, true);
        }
      }
    }
    
    // Sort by score (highest first), then by size estimate, then by DOM order for ties
    sizeFilteredImages.sort((a, b) => {
      // Primary sort: Score (highest first)
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      
      // Secondary sort: Estimated file size (largest first)
      const sizeA = estimateFileSize(a.url);
      const sizeB = estimateFileSize(b.url);
      const sizeDiff = sizeB - sizeA;
      if (sizeDiff !== 0) return sizeDiff;
      
      // Tertiary sort: DOM order (earlier first)
      return a.index - b.index;
    });
    
    debug('🏆 TOP SCORED IMAGES:', sizeFilteredImages.slice(0, 5).map(img => 
      `${img.url.substring(img.url.lastIndexOf('/') + 1)} (score: ${img.score})`));
    
    const finalUrls = sizeFilteredImages.slice(0, 50).map(img => img.url);
    
    if (sizeFilteredImages.length > 50) {
      addImageDebugLog('warn', `⚠️ IMAGE LIMIT REACHED (50), keeping first 50 by DOM order`, '', 0, false);
    }
    
    debug('🖼️ HYBRID FILTERING RESULTS:', filtered);
    debug('🖼️ FINAL IMAGES:', finalUrls.slice(0, 5).map(url => url.slice(0, 80)));
    
    // Report container performance statistics
    if (containerScoreStats.size > 0) {
      debug('🏆 CONTAINER PERFORMANCE ANALYSIS:');
      const sortedContainers = Array.from(containerScoreStats.entries())
        .map(([selector, stats]) => {
          stats.avgScore = stats.scores.length > 0 ? (stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length).toFixed(1) : '0.0';
          return [selector, stats];
        })
        .sort((a, b) => parseFloat(b[1].avgScore) - parseFloat(a[1].avgScore));
      
      sortedContainers.slice(0, 5).forEach(([selector, stats]) => {
        debug(`📊 ${selector}: ${stats.count} images, avg score ${stats.avgScore}, high-quality: ${stats.highCount}, junk: ${stats.lowCount}`);
      });
    }
    
    // Report rejection summary statistics
    if (rejectionStats.size > 0) {
      debug('📊 REJECTION SUMMARY:');
      const totalNotImageUrl = Array.from(rejectionStats.values()).reduce((sum, stats) => sum + stats.notImageUrl, 0);
      const totalLowScore = Array.from(rejectionStats.values()).reduce((sum, stats) => sum + stats.lowScore, 0);
      const totalJunk = Array.from(rejectionStats.values()).reduce((sum, stats) => sum + stats.junk, 0);
      const totalSmallFile = Array.from(rejectionStats.values()).reduce((sum, stats) => sum + stats.smallFile, 0);
      
      debug(`   ❌ NOT IMAGE URLs: ${totalNotImageUrl} total`);
      debug(`   📉 LOW SCORE REJECTED: ${totalLowScore} total`);
      debug(`   🗑️  JUNK IMAGES: ${totalJunk} total`);
      debug(`   📏 TOO SMALL: ${totalSmallFile} total`);
      
      // Show top offending selectors
      const sortedRejections = Array.from(rejectionStats.entries())
        .map(([selector, stats]) => {
          const totalRejections = stats.notImageUrl + stats.lowScore + stats.junk + stats.smallFile;
          const avgScore = stats.scores.length > 0 ? (stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length).toFixed(1) : '0.0';
          return { selector, stats, totalRejections, avgScore };
        })
        .filter(item => item.totalRejections > 0)
        .sort((a, b) => b.totalRejections - a.totalRejections);
      
      if (sortedRejections.length > 0) {
        debug('   🔍 TOP REJECTION SOURCES:');
        sortedRejections.slice(0, 5).forEach(({ selector, stats, totalRejections, avgScore }) => {
          const breakdown = [];
          if (stats.notImageUrl > 0) breakdown.push(`${stats.notImageUrl} not-image`);
          if (stats.lowScore > 0) breakdown.push(`${stats.lowScore} low-score (avg: ${avgScore})`);
          if (stats.junk > 0) breakdown.push(`${stats.junk} junk`);
          if (stats.smallFile > 0) breakdown.push(`${stats.smallFile} too-small`);
          
          debug(`      - [${selector}]: ${totalRejections} total (${breakdown.join(', ')})`);
        });
      }
    }
    
    return finalUrls;
  }

  // Legacy function for compatibility with existing code
  async function uniqueImages(urls) {
    debug('🖼️ LEGACY FILTERING IMAGES (converting to enriched):', { inputCount: urls.length });
    // Convert simple URLs to enriched format for hybrid processing
    const enriched = urls.map((url, index) => ({ 
      url, 
      element: null, 
      index,
      containerSelector: 'legacy' // Mark legacy/fallback URLs
    }));
    return await hybridUniqueImages(enriched);
  }
  async function gatherImagesBySelector(sel) {
    // Smart logging to avoid truncated mega-selectors
    const selectorDisplay = sel.length > 100 ? 
      `${sel.substring(0, 50)}... (${sel.split(',').length} selectors)` : 
      sel;
    debug('🔍 GATHERING IMAGES with selector:', selectorDisplay);
    
    const elements = qa(sel);
    debug(`📊 Found ${elements.length} elements for selector: ${selectorDisplay}`);
    
    const enrichedUrls = []; // Now includes element info
    
    // Track container context for performance analysis
    const containerStats = {
      selector: sel,
      elementsFound: elements.length,
      imagesExtracted: 0,
      containerTypes: new Set(),
      parentSelectors: new Set()
    };
    
    try {
      for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      debugElement(el, `Image element`);
      
      // Track container hierarchy for performance analysis
      const containerContext = captureContainerContext(el);
      containerStats.containerTypes.add(containerContext.containerType);
      containerStats.parentSelectors.add(containerContext.parentSelector);
      
      const attrs = {
        src: el.getAttribute('src') || el.currentSrc,
        'data-src': el.getAttribute('data-src'),
        'data-image': el.getAttribute('data-image'),
        'data-zoom-image': el.getAttribute('data-zoom-image'),
        'data-large': el.getAttribute('data-large'),
        srcset: el.getAttribute('srcset')
      };
      
      const s1 = attrs.src || attrs['data-src'] || attrs['data-image'] || 
                 attrs['data-zoom-image'] || attrs['data-large'];
      
      // Analyze image for actionable debugging info
      const fileName = s1 ? s1.substring(s1.lastIndexOf('/') + 1, s1.indexOf('?') > 0 ? s1.indexOf('?') : undefined) : 'unknown';
      const dimensions = `${el.naturalWidth || el.width || '?'}x${el.naturalHeight || el.height || '?'}px`;
      const classes = el.className || '';
      const utilityClasses = ['cookie', 'social', 'nav', 'menu', 'logo', 'icon', 'banner', 'footer', 'header'].filter(cls => classes.toLowerCase().includes(cls));
      if (s1) {
        debug(`🔍 INVESTIGATING: ${fileName} via [${sel}]`);
        debug(`   📏 Dimensions: ${dimensions}`);
        if (utilityClasses.length > 0) {
          debug(`   🏷️  Utility classes: ${utilityClasses.join(', ')} (likely not product image)`);
        }
        if (classes && !utilityClasses.length) {
          debug(`   🏷️  Classes: ${classes.substring(0, 50)}${classes.length > 50 ? '...' : ''}`);
        }
        
        // Determine verdict for this image investigation
        let verdict = '';
        if (utilityClasses.length > 0) {
          verdict = `❌ VERDICT: NOT PRODUCT IMAGE - utility/branding content (${utilityClasses.join(', ')})`;
        } else if ((el.naturalWidth || el.width || 0) < 100 && (el.naturalHeight || el.height || 0) < 100) {
          verdict = '❌ VERDICT: TOO SMALL - likely icon or thumbnail';
        } else if (/cookie|logo|nav|social|icon|banner/i.test(fileName)) {
          verdict = '❌ VERDICT: FILENAME SUGGESTS NON-PRODUCT IMAGE';
        } else {
          verdict = '✅ VERDICT: POTENTIAL PRODUCT IMAGE - proceeding to scoring';
        }
        debug(`   ${verdict}`);
        
        // Smart Shopify files filtering
        if (shouldBlockShopifyFiles(s1, el)) {
          debug('❌ BLOCKED: Shopify files path (theme asset):', s1.substring(s1.lastIndexOf('/') + 1));
          continue;
        }
        if (/\/cdn\/shop\/files\//i.test(s1)) {
          debug('✅ ALLOWED: Shopify files path (product image):', s1.substring(s1.lastIndexOf('/') + 1));
        }
        if (/(shop.?nav|memorial|collection|kova.?box|cust_)/i.test(s1)) {
          debug('❌ BLOCKED: Junk pattern:', s1.substring(s1.lastIndexOf('/') + 1));
          continue;
        }
        // COMPREHENSIVE JUNK PATTERNS
        if (/_web\.png/i.test(s1)) {
          debug('❌ BLOCKED: Feature icon:', s1.substring(s1.lastIndexOf('/') + 1));
          continue;
        }
        if (/_modal_/i.test(s1)) {
          debug('❌ BLOCKED: Material swatch:', s1.substring(s1.lastIndexOf('/') + 1));
          continue;
        }
        if (/yotpo\.com/i.test(s1)) {
          debug('❌ BLOCKED: Review image:', s1.substring(s1.lastIndexOf('/') + 1));
          continue;
        }
        if (/-\d{3}\.png/i.test(s1)) {
          debug('❌ BLOCKED: Technical sample:', s1.substring(s1.lastIndexOf('/') + 1));
          continue;
        }
        if (/(boucle|basketweave|velvet)/i.test(s1)) {
          debug('❌ BLOCKED: Fabric pattern:', s1.substring(s1.lastIndexOf('/') + 1));
          continue;
        }
        if (/cushion-image/i.test(s1)) {
          debug('❌ BLOCKED: Component image:', s1.substring(s1.lastIndexOf('/') + 1));
          continue;
        }
        if (/cld\.accentuate\.io/i.test(s1)) {
          debug('❌ BLOCKED: Accentuate CDN junk:', s1.substring(s1.lastIndexOf('/') + 1));
          continue;
        }
        
        const upgradedUrl = upgradeCDNUrl(s1); // Apply universal CDN URL upgrades
        containerStats.imagesExtracted++;
        
        enrichedUrls.push({ 
          url: upgradedUrl, 
          element: el, 
          index: i,
          containerSelector: sel, // Track which selector found this image
          containerContext: containerContext, // Full container hierarchy
          sourceMethod: 'A1' // Default to A1, will be overridden by B1
        });
      }
      
      const ss = attrs.srcset;
      const best = pickFromSrcset(ss); 
      if (best) {
        debug('✅ Found image URL from srcset:', best.slice(0, 100));
        
        // Smart Shopify files filtering
        if (shouldBlockShopifyFiles(best, el)) {
          debug('❌ BLOCKED: Shopify files path (theme asset):', best.substring(best.lastIndexOf('/') + 1));
          continue;
        }
        if (/\/cdn\/shop\/files\//i.test(best)) {
          debug('✅ ALLOWED: Shopify files path (product image):', best.substring(best.lastIndexOf('/') + 1));
        }
        if (/(shop.?nav|memorial|collection|kova.?box|cust_)/i.test(best)) {
          debug('❌ BLOCKED: Junk pattern:', best.substring(best.lastIndexOf('/') + 1));
          continue;
        }
        // COMPREHENSIVE JUNK PATTERNS
        if (/_web\.png/i.test(best)) {
          debug('❌ BLOCKED: Feature icon:', best.substring(best.lastIndexOf('/') + 1));
          continue;
        }
        if (/_modal_/i.test(best)) {
          debug('❌ BLOCKED: Material swatch:', best.substring(best.lastIndexOf('/') + 1));
          continue;
        }
        if (/yotpo\.com/i.test(best)) {
          debug('❌ BLOCKED: Review image:', best.substring(best.lastIndexOf('/') + 1));
          continue;
        }
        if (/-\d{3}\.png/i.test(best)) {
          debug('❌ BLOCKED: Technical sample:', best.substring(best.lastIndexOf('/') + 1));
          continue;
        }
        if (/(boucle|basketweave|velvet)/i.test(best)) {
          debug('❌ BLOCKED: Fabric pattern:', best.substring(best.lastIndexOf('/') + 1));
          continue;
        }
        if (/cushion-image/i.test(best)) {
          debug('❌ BLOCKED: Component image:', best.substring(best.lastIndexOf('/') + 1));
          continue;
        }
        if (/cld\.accentuate\.io/i.test(best)) {
          debug('❌ BLOCKED: Accentuate CDN junk:', best.substring(best.lastIndexOf('/') + 1));
          continue;
        }
        
        const upgradedBest = upgradeCDNUrl(best);
        containerStats.imagesExtracted++;
        
        const containerContext = captureContainerContext(el);
        containerStats.containerTypes.add(containerContext.containerType);
        containerStats.parentSelectors.add(containerContext.parentSelector);
        
        enrichedUrls.push({ 
          url: upgradedBest, 
          element: el, 
          index: i,
          containerSelector: sel, // Track which selector found this image
          containerContext: containerContext, // Full container hierarchy
          sourceMethod: 'A1' // Default to A1, will be overridden by B1
        });
      }
      
      // Check picture parent
      if (el.parentElement && el.parentElement.tagName.toLowerCase()==='picture') {
        debug('📸 Checking picture parent for sources...');
        for (const src of el.parentElement.querySelectorAll('source')) {
          const b = pickFromSrcset(src.getAttribute('srcset')); 
          if (b) {
            const sourceFileName = b.substring(b.lastIndexOf('/') + 1, b.indexOf('?') > 0 ? b.indexOf('?') : undefined);
            debug(`✅ Found image URL from picture source: ${sourceFileName}`);
            debug(`   📍 Source: <picture> element via [${sel}]`);
            
            // Smart Shopify files filtering
            if (shouldBlockShopifyFiles(b, src)) {
              debug('❌ BLOCKED: Shopify files path (theme asset):', b.substring(b.lastIndexOf('/') + 1));
              continue;
            }
            if (/\/cdn\/shop\/files\//i.test(b)) {
              debug('✅ ALLOWED: Shopify files path (product image):', b.substring(b.lastIndexOf('/') + 1));
            }
            if (/(shop.?nav|memorial|collection|kova.?box|cust_)/i.test(b)) {
              debug('❌ BLOCKED: Junk pattern:', b.substring(b.lastIndexOf('/') + 1));
              continue;
            }
            // COMPREHENSIVE JUNK PATTERNS
            if (/_web\.png/i.test(b)) {
              debug('❌ BLOCKED: Feature icon:', b.substring(b.lastIndexOf('/') + 1));
              continue;
            }
            if (/_modal_/i.test(b)) {
              debug('❌ BLOCKED: Material swatch:', b.substring(b.lastIndexOf('/') + 1));
              continue;
            }
            if (/yotpo\.com/i.test(b)) {
              debug('❌ BLOCKED: Review image:', b.substring(b.lastIndexOf('/') + 1));
              continue;
            }
            if (/-\d{3}\.png/i.test(b)) {
              debug('❌ BLOCKED: Technical sample:', b.substring(b.lastIndexOf('/') + 1));
              continue;
            }
            if (/(boucle|basketweave|velvet)/i.test(b)) {
              debug('❌ BLOCKED: Fabric pattern:', b.substring(b.lastIndexOf('/') + 1));
              continue;
            }
            if (/cushion-image/i.test(b)) {
              debug('❌ BLOCKED: Component image:', b.substring(b.lastIndexOf('/') + 1));
              continue;
            }
            if (/cld\.accentuate\.io/i.test(b)) {
              debug('❌ BLOCKED: Accentuate CDN junk:', b.substring(b.lastIndexOf('/') + 1));
              continue;
            }
            
            const upgradedUrl = upgradeCDNUrl(b); // Apply universal CDN URL upgrades
            enrichedUrls.push({ 
              url: upgradedUrl, 
              element: el, 
              index: i,
              containerSelector: sel // Track which selector found this image
            });
          }
        }
      }
    }
    } catch(e) {
      console.warn('[DEBUG] gatherImagesBySelector error:', e.message);
      debug('❌ Image gathering failed, returning empty array');
      return [];
    }
    
    // Log container performance stats before filtering
    debug(`📊 CONTAINER STATS [${sel}]:`, {
      found: containerStats.elementsFound,
      extracted: containerStats.imagesExtracted,
      types: Array.from(containerStats.containerTypes),
      parents: Array.from(containerStats.parentSelectors).slice(0, 3) // Limit output
    });
    
    debug(`🖼️ Raw enriched URLs collected: ${enrichedUrls.length}`);
    const filtered = await hybridUniqueImages(enrichedUrls);
    debug(`🖼️ After hybrid filtering: ${filtered.length} images`);
    
    // Log container performance after filtering
    const finalCount = filtered.length;
    const successRate = containerStats.elementsFound > 0 ? (finalCount / containerStats.elementsFound * 100).toFixed(1) : '0.0';
    debug(`🎯 CONTAINER PERFORMANCE [${sel}]: ${finalCount} final images (${successRate}% success rate)`);
    
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

  /* ---------- HELPER FUNCTIONS ---------- */
  function getTextOnly(element) {
    if (!element) return "";
    // Clone element to avoid modifying original
    const clone = element.cloneNode(true);
    // Remove all images and their content
    clone.querySelectorAll('img, svg, picture').forEach(img => img.remove());
    // Remove elements with background images
    clone.querySelectorAll('[style*="background-image"]').forEach(el => el.remove());
    return clone.textContent.trim();
  }

  /* ---------- GENERIC EXTRACTORS ---------- */
  function getTitle() {
    const sels = ['h1', '.product-title', '[itemprop="name"]'];
    for (const sel of sels) { const v = txt(q(sel)); if (v) { mark('title', { selectors:[sel], attr:'text', method:'generic' }); return v; } }
    const v = (document.title || '').trim(); if (v) mark('title', { selectors:['document.title'], attr:'text', method:'fallback' });
    return v || null;
  }
  function getBrand() {
    // First try JSON-LD structured data - FOCUSED ON MAIN PRODUCT AREA
    const productContainers = ['#ivImageBlock', '#iv-tab-view-container', '.iv-box'];
    const jsonLdScripts = [];
    
    // Try focused containers first
    for (const container of productContainers) {
      const containerEl = document.querySelector(container);
      if (containerEl) {
        jsonLdScripts.push(...containerEl.querySelectorAll('script[type="application/ld+json"]'));
      }
    }
    
    // Fallback to page-wide if nothing found in containers
    if (jsonLdScripts.length === 0) {
      jsonLdScripts.push(...document.querySelectorAll('script[type="application/ld+json"]'));
    }
    
    for (const b of jsonLdScripts) {
      try {
        const data = JSON.parse(b.textContent.trim());
        const arr = Array.isArray(data) ? data : [data];
        for (const node of arr) {
          const types = [].concat(node?.["@type"]||[]).map(String);
          if (types.some(t=>/product/i.test(t))) {
            const brand = node.brand?.name || node.brand || node.manufacturer?.name || "";
            if (brand && brand.trim()) {
              mark('brand', { selectors:['script[type="application/ld+json"]'], attr:'json', method:'jsonld' });
              return brand.trim();
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
      // Try focused containers first
      let el = null;
      for (const container of productContainers) {
        const containerEl = document.querySelector(container);
        if (containerEl) {
          el = containerEl.querySelector(sel);
          if (el) break;
        }
      }
      
      // Fallback to page-wide if nothing found in containers
      if (!el) {
        el = document.querySelector(sel);
      }
      if (el) {
        let brandText = "";
        if (sel.includes('data-brand')) {
          brandText = el.getAttribute('data-brand') || "";
        } else {
          // Get text only, exclude any image content
          brandText = el.content || el.getAttribute("content") || getTextOnly(el) || "";
        }
        if (brandText && brandText.trim()) {
          mark('brand', { selectors:[sel], attr: el.content || el.getAttribute("content") ? 'content' : 'text', method:'css' });
          return brandText.trim();
        }
      }
    }
    
    // Try to extract brand from breadcrumbs - FOCUSED ON MAIN PRODUCT AREA
    let breadcrumb = null;
    
    // Try focused containers first
    for (const container of productContainers) {
      const containerEl = document.querySelector(container);
      if (containerEl) {
        breadcrumb = containerEl.querySelector('.breadcrumb, nav[aria-label*="breadcrumb"], [class*="breadcrumb"]');
        if (breadcrumb) break;
      }
    }
    
    // Fallback to page-wide if nothing found in containers
    if (!breadcrumb) {
      breadcrumb = document.querySelector('.breadcrumb, nav[aria-label*="breadcrumb"], [class*="breadcrumb"]');
    }
    if (breadcrumb) {
      const links = breadcrumb.querySelectorAll('a');
      // Look for brand in second or third breadcrumb item (often: Home > Brand > Category > Product)
      for (let i = 1; i < Math.min(links.length - 1, 4); i++) {
        const text = (links[i].textContent || "").trim();
        if (text && text.length >= 3 && text.length <= 20 && !/^(home|shop|all|products?|category|categories)$/i.test(text)) {
          mark('brand', { selectors:['.breadcrumb a'], attr:'text', method:'breadcrumb' });
          return text;
        }
      }
    }
    
    // Try to extract brand from URL path
    const path = location.pathname;
    const pathMatch = path.match(/\/(?:brand|brands|manufacturer)\/([^\/]+)/i);
    if (pathMatch) {
      const brandFromPath = pathMatch[1].replace(/[-_]/g, ' ').trim();
      if (brandFromPath && brandFromPath.length >= 3) {
        mark('brand', { selectors:['url-path'], attr:'text', method:'url' });
        return brandFromPath;
      }
    }
    
    // Try common brand patterns in product titles
    const title = (document.querySelector('h1')?.textContent || "").trim();
    if (title) {
      // Look for patterns like "Nike Air Max" where first word could be brand
      const titleWords = title.split(/\s+/);
      if (titleWords.length >= 2) {
        const firstWord = titleWords[0];
        // Check if first word looks like a brand (capitalized, reasonable length)
        if (firstWord && /^[A-Z][a-zA-Z]{2,15}$/.test(firstWord) && 
            !/(the|new|sale|buy|shop|get|free|best|top|hot|limited|special|exclusive)$/i.test(firstWord)) {
          mark('brand', { selectors:['h1-first-word'], attr:'text', method:'title' });
          return firstWord;
        }
      }
    }
    
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
      ['[data-js-pricelabel]','data-js-pricelabel'], // Aesop and similar sites
      ['[data-test*=price]','text'],
      ['[data-testid*=price]','text'],
      ['.price','text'],
      ['.product-price','text'],
      ['.c-product-price','text'], // Aesop price container
      ['.c-product-main__price','text'] // Aesop main price
    ];
    for (const [sel,at] of pairs) {
      const el = q(sel);
      const raw = at==='text' ? txt(el) : attr(el,at);
      let val = normalizeMoneyPreferSale(raw);
      // Always run refinement even if initial val is null - it can find price in attributes
      if (el) val = refinePriceWithContext(el, val);
      if (val) { mark('price', { selectors:[sel], attr:at, method:'generic' }); return val; }
    }
    const prod = scanJSONLDProducts()[0];
    if (prod) {
      const val = normalizeMoneyPreferSale(ldPickPrice(prod));
      if (val) { mark('price', { selectors:['script[type="application/ld+json"]'], attr:'text', method:'jsonld-fallback' }); return val; }
    }
    return null;
  }
  // B1 Comprehensive Collection - Single unified A1 call
  async function getImagesUnified({ doc = document, observeMs = 1200 } = {}) {
    debug(`🚀 B1 COMPREHENSIVE: Starting on ${window.location.hostname} - single A1 call`);
    
    // TARGETED COMPREHENSIVE SELECTORS - Effective + Focused
    const B1_SELECTORS = [
      // Primary product galleries (specific containers)
      '.product-gallery img', '.product-photos img', '.product-images img',
      '.gallery img', '.image-gallery img', '.media-gallery img',
      '.product-media img', '.product-photo img',

      // Proven e-commerce patterns (specific, not broad)
      '.product-gallery-main img', '.product-gallery-thumb img',
      '.swiper-wrapper img', '.carousel-inner img', '.slider-track img',

      // Flexible pattern matching (catches site variations) 
      '[class*="zoom-modal"] img', '[class*="product-media"] img', '[class*="product-slides"] img',
      '[class*="gallery"] img', '[class*="product-carousel"] img', '[class*="product-slider"] img',

      // High-quality CDN patterns (product areas only)
      '.product-detail img[src*="shopify"]', '.pdp img[src*="cdn"]',
      '[data-product] img[src*="amazonaws"]', '[data-gallery] img[src*="cloudinary"]',

      // Targeted semantic containers (not all main/article content)
      '.product-detail figure img', '.main-product figure img', 
      '[role="main"] .product-images img', '.content-product img',

      // Proven gallery data attributes
      '[data-gallery] img', '[data-product-gallery] img', '[data-product-image] img',
      '.pdp-gallery img', '.item-gallery img'
    ];
    
    const UNIFIED_SELECTOR = B1_SELECTORS.join(', ');

    // B1 SELECTOR PERFORMANCE TRACKING - Before processing
    debug('📊 B1 SELECTOR PERFORMANCE ANALYSIS:');
    const b1SelectorStats = [];
    let totalB1Found = 0;
    const foundSelectors = [];
    
    for (const sel of B1_SELECTORS) {
      const elementCount = document.querySelectorAll(sel).length;
      totalB1Found += elementCount;
      b1SelectorStats.push({
        selector: sel,
        found: elementCount
      });
      // Only log selectors that actually found elements (reduce noise)
      if (elementCount > 0) {
        foundSelectors.push(`"${sel}" (${elementCount})`);
        debug(`📊 B1: "${sel}" → found:${elementCount} elements`);
      }
    }
    
    // Concise summary instead of spam
    if (foundSelectors.length > 0) {
      debug(`✅ B1 ACTIVE SELECTORS: ${foundSelectors.join(', ')}`);
    } else {
      debug(`❌ B1 NO MATCHES: All ${B1_SELECTORS.length} selectors found 0 elements`);
    }
    
    debug(`📊 B1 PRE-PROCESSING: ${totalB1Found} total elements from ${B1_SELECTORS.length} selectors`);
    
    // SMART FALLBACK DETECTION - When all selectors fail, discover actual page structure
    if (totalB1Found === 0) {
      debug('🔍 B1 FAILURE ANALYSIS: All selectors empty, analyzing page structure...');
      
      // Discover what images actually exist on the page
      const allPageImages = document.querySelectorAll('img');
      debug(`📊 DISCOVERY: Found ${allPageImages.length} total images on page`);
      
      if (allPageImages.length > 0) {
        // Analyze container patterns for actionable recommendations
        const containerPatterns = new Map();
        const productHints = [];
        
        Array.from(allPageImages).slice(0, 20).forEach(img => { // Sample first 20 images
          // Find meaningful parent containers
          let parent = img.parentElement;
          for (let i = 0; i < 3 && parent; i++) {
            const classList = parent.classList;
            const className = parent.className || '';
            const id = parent.id || '';
            
            // Look for product-related patterns in class names
            if (className && (className.includes('product') || className.includes('pdp') || 
                             className.includes('gallery') || className.includes('media') ||
                             className.includes('carousel') || className.includes('slider'))) {
              const containerKey = classList.length > 0 ? `.${Array.from(classList)[0]} img` : 
                                 id ? `#${id} img` : parent.tagName.toLowerCase() + ' img';
              const count = (containerPatterns.get(containerKey) || 0) + 1;
              containerPatterns.set(containerKey, count);
              
              // Track potential product containers
              if (className.includes('product') || className.includes('pdp')) {
                productHints.push(containerKey);
              }
              break; // Found a meaningful container
            }
            parent = parent.parentElement;
          }
        });
        
        // Provide actionable recommendations
        if (containerPatterns.size > 0) {
          debug('💡 RECOMMENDED SELECTORS (based on actual page structure):');
          const sortedContainers = Array.from(containerPatterns.entries())
            .sort((a, b) => b[1] - a[1]) // Sort by image count
            .slice(0, 5);
            
          sortedContainers.forEach(([selector, count]) => {
            const isProbablyProduct = productHints.includes(selector) || 
                                    selector.includes('product') || selector.includes('pdp');
            const priority = isProbablyProduct ? '🎯 HIGH PRIORITY' : count > 5 ? '⚠️ HIGH VOLUME' : '💡 CANDIDATE';
            debug(`   ${priority}: ${selector} (${count} images)`);
          });
          
          if (productHints.length > 0) {
            debug(`🎯 TOP RECOMMENDATIONS: ${[...new Set(productHints)].join(', ')}`);
          }
        } else {
          debug('📋 PAGE STRUCTURE: No clear container patterns detected');
          // Show some sample image locations for manual inspection
          const sampleImages = Array.from(allPageImages).slice(0, 3).map(img => {
            const src = img.src || img.getAttribute('data-src') || 'no-src';
            const fileName = src.substring(src.lastIndexOf('/') + 1, src.indexOf('?') > 0 ? src.indexOf('?') : undefined) || 'unknown';
            return `${fileName} (parent: ${img.parentElement?.tagName || 'unknown'})`;
          });
          debug(`📋 SAMPLE IMAGES: ${sampleImages.join(', ')}`);
        }
      } else {
        debug('🚫 DISCOVERY: No images found on page at all');
      }
    }
    
    debug('📍 B1: Using single combined A1 gatherImagesBySelector call');
    
    try {
      // Single A1 call with all selectors combined - runs A1 pipeline ONCE
      const allImages = await gatherImagesBySelector(UNIFIED_SELECTOR);
      debug(`🔍 B1 COMPREHENSIVE: Single A1 call found ${allImages.length} images`);
      
      // B1 POST-PROCESSING ANALYSIS
      const overallB1Success = totalB1Found > 0 ? ((allImages.length / totalB1Found) * 100).toFixed(1) : 0;
      debug(`📊 B1 SUMMARY: ${totalB1Found} total elements found, ${allImages.length} kept (${overallB1Success}% overall success)`);
      
      // Store B1 stats globally for final summary
      globalThis.__tg_b1SelectorStats = {
        selectors: b1SelectorStats.map(s => ({...s, kept: 0, successRate: '0.0'})), // B1 doesn't track individual kept
        totalFound: totalB1Found,
        totalKept: allImages.length,
        overallSuccess: overallB1Success
      };
      
      // Identify problem selectors (finding many elements but contributing to low overall success)
      const highVolumeSelectors = b1SelectorStats.filter(s => s.found > 10);
      const lowVolumeSelectors = b1SelectorStats.filter(s => s.found === 0);
      
      if (highVolumeSelectors.length > 0) {
        debug(`🔍 B1 HIGH VOLUME SELECTORS: ${highVolumeSelectors.map(s => `"${s.selector}" (${s.found})`).join(', ')}`);
      }
      if (lowVolumeSelectors.length > 0) {
        // Only show count, not the full list (reduces log noise)
        debug(`❌ B1 EMPTY SELECTORS: ${lowVolumeSelectors.length} selectors found no elements`);
      }
      
      debug(`✅ COMPREHENSIVE FINAL: ${allImages.length} images (processed once by A1 system)`);
      
      return allImages.slice(0, 30);
    } catch (e) {
      debug(`⚠️ B1: Error with unified selector:`, e.message);
      return [];
    }
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
        
        // URLs already filtered by gatherImagesBySelector() -> hybridUniqueImages()
        mark('images', { selectors:[sel], attr:'src', method:'site-specific', urls: urls.slice(0,30) }); 
        return urls.slice(0,30); 
      }
    }
    
    const gallerySels = [
      // TARGETED GALLERY SELECTORS - Specific but comprehensive
      // Primary product galleries (direct targeting)
      '.product-gallery img', '.product-images img', '.product-media img', '.product-photo img',
      '.image-gallery img', '.media-gallery img', '.gallery img',
      
      // Proven e-commerce gallery containers  
      '.pdp-gallery img', '.main-image img', '.hero-image img',
      '[data-product-gallery] img', '[data-gallery] img', '[data-product-image] img',
      
      // Amazon + major retailers (proven patterns)
      '#imageBlock img', '#altImages img', '[data-a-dynamic-image]',
      '.product-single__photo img', '.flickity-viewport img',
      
      // Modern carousel/slider frameworks (targeted)
      '.swiper-wrapper img', '.carousel-inner img', '.slider-container img',
      '.pdp-media img', '.product__media img',
      
      // Flexible pattern matching (catches site variations) 
      '[class*="zoom-modal"] img', '[class*="product-media"] img', '[class*="product-slides"] img',
      '[class*="gallery"] img', '[class*="product-carousel"] img', '[class*="product-slider"] img',
      
      // Specific semantic containers (not all figures/articles)
      '.product-detail figure img', '.main-product figure img', 
      '[role="main"] .gallery img', '.content-product .gallery img'
    ];
    
    // SELECTOR PERFORMANCE TRACKING
    debug('📊 A1 SELECTOR PERFORMANCE ANALYSIS:');
    const selectorStats = [];
    for (const sel of gallerySels) {
      const elementCount = document.querySelectorAll(sel).length;
      const urls = await gatherImagesBySelector(sel);
      const kept = urls.length;
      const successRate = elementCount > 0 ? ((kept / elementCount) * 100).toFixed(1) : 0;
      
      selectorStats.push({
        selector: sel,
        found: elementCount,
        kept: kept,
        successRate: successRate
      });
      
      debug(`📊 A1: "${sel}" → found:${elementCount}, kept:${kept} (${successRate}% success)`);
      
      if (urls.length >= 3) {
        debug(`✅ A1 SUCCESS: "${sel}" provided sufficient images (${kept})`);
        // URLs already filtered by gatherImagesBySelector() -> hybridUniqueImages()
        mark('images', { selectors:[sel], attr:'src', method:'generic-gallery', urls: urls.slice(0,30) }); 
        return urls.slice(0,30); 
      }
    }
    
    // A1 SUMMARY
    const totalFound = selectorStats.reduce((sum, stat) => sum + stat.found, 0);
    const totalKept = selectorStats.reduce((sum, stat) => sum + stat.kept, 0);
    const overallSuccess = totalFound > 0 ? ((totalKept / totalFound) * 100).toFixed(1) : 0;
    debug(`📊 A1 SUMMARY: ${totalFound} total elements found, ${totalKept} kept (${overallSuccess}% overall success)`);
    
    // Store A1 stats globally for final summary
    globalThis.__tg_a1SelectorStats = {
      selectors: selectorStats,
      totalFound: totalFound,
      totalKept: totalKept,
      overallSuccess: overallSuccess
    };
    
    // Identify best and worst performers
    const goodSelectors = selectorStats.filter(s => s.found > 0 && parseFloat(s.successRate) > 50);
    const junkSelectors = selectorStats.filter(s => s.found > 5 && parseFloat(s.successRate) === 0);
    
    if (goodSelectors.length > 0) {
      debug(`✅ A1 GOOD SELECTORS: ${goodSelectors.map(s => `"${s.selector}" (${s.successRate}%)`).join(', ')}`);
    }
    if (junkSelectors.length > 0) {
      debug(`❌ A1 JUNK SELECTORS: ${junkSelectors.map(s => `"${s.selector}" (${s.found} found, 0 kept)`).join(', ')}`);
    }
    const og = q('meta[property="og:image"]')?.content;
    
    // SMART FALLBACK - Never use bare 'img' selector, use targeted fallbacks
    const fallbackSelectors = [
      '[data-product] img',
      '[class*="product"] img', 
      '[class*="gallery"] img',
      '[class*="media"] img',
      'main img',
      '[role="main"] img',
      'section img',
      'article img'
    ].join(', ');
    
    const all = await gatherImagesBySelector(fallbackSelectors);
    
    // URLs already filtered by gatherImagesBySelector() -> hybridUniqueImages()
    const combined = (og ? [og] : []).concat(all);
    const uniq = await uniqueImages(combined);
    mark('images', { selectors:['targeted-fallbacks'], attr:'src', method:'smart-fallback', urls: uniq.slice(0,30) });
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
      
      // Clear previous selector performance stats for clean tracking
      globalThis.__tg_a1SelectorStats = null;
      globalThis.__tg_b1SelectorStats = null;
      
      // Reset line counter for each scrape operation
      if (typeof window !== 'undefined') {
        window.__tg_debugLineCounter = 0;
      }
      
      log('🚀 SCRAPE START', { host, href: location.href, mode });

      // GLOBAL FLAG: Disable memory completely (custom handlers take priority)
      const DISABLE_MEMORY = true;
      const mem = DISABLE_MEMORY ? {} : loadMemory(host);
      
      if (DISABLE_MEMORY) {
        debug('🚫 MEMORY DISABLED - Custom handlers take priority');
      } else {
        debug('🧠 LOADED MEMORY:', {
          host,
          hasMemory: Object.keys(mem).length > 0,
          fields: Object.keys(mem),
          memoryData: mem
        });
      }

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
        
        // Skip memory when disabled, go directly to custom/generic handlers
        if (!DISABLE_MEMORY) {
          title = await fromMemory('title', mem.title);
          debug('📝 TITLE FROM MEMORY:', title);
        }
        if (!title) {
          // Try custom handler before falling back to generic
          if (typeof getCustomHandlers === 'function') {
            try {
              const ch = getCustomHandlers();
              if (ch?.title && typeof ch.title === 'function') {
                debug('🧩 TITLE: Trying custom handler...');
                const customTitle = await Promise.resolve(ch.title(document));
                if (customTitle && typeof customTitle === 'string') {
                  title = customTitle.trim();
                  mark('title', { selectors: ['custom'], attr: 'custom', method: 'custom-handler' });
                  debug('🧩 CUSTOM TITLE SUCCESS:', title);
                } else {
                  debug('🧩 CUSTOM TITLE MISS: returned', typeof customTitle, customTitle);
                }
              } else {
                debug('🧩 NO CUSTOM TITLE HANDLER AVAILABLE');
              }
            } catch (e) { 
              debug('❌ Custom title handler error:', e.message); 
            }
          }
          
          if (!title) {
            debug('📝 TITLE: Falling back to generic...');
            title = getTitle();
            debug('📝 TITLE FROM GENERIC:', title);
          }
        }
        
        if (!DISABLE_MEMORY) {
          brand = await fromMemory('brand', mem.brand);
          debug('🏷️ BRAND FROM MEMORY:', brand);
        }
        if (!brand) {
          debug('🏷️ BRAND: Falling back to generic...');
          brand = getBrand();
          debug('🏷️ BRAND FROM GENERIC:', brand);
        }
        
        if (!DISABLE_MEMORY) {
          description = await fromMemory('description', mem.description);
          debug('📄 DESCRIPTION FROM MEMORY:', description);
        }
        if (!description) {
          debug('📄 DESCRIPTION: Falling back to generic...');
          description = getDescription();
          debug('📄 DESCRIPTION FROM GENERIC:', description);
        }
        
        if (!DISABLE_MEMORY) {
          price = await fromMemory('price', mem.price);
          debug('💰 PRICE FROM MEMORY:', price);
        }
        if (!price) {
          // Try custom handler before falling back to generic
          if (typeof getCustomHandlers === 'function') {
            try {
              const ch = getCustomHandlers();
              if (ch?.price && typeof ch.price === 'function') {
                debug('🧩 PRICE: Trying custom handler...');
                const customPrice = await Promise.resolve(ch.price(document));
                if (customPrice && typeof customPrice === 'string') {
                  price = customPrice.trim();
                  mark('price', { selectors: ['custom'], attr: 'custom', method: 'custom-handler' });
                  debug('🧩 CUSTOM PRICE SUCCESS:', price);
                } else {
                  debug('🧩 CUSTOM PRICE MISS: returned', typeof customPrice, customPrice);
                }
              } else {
                debug('🧩 NO CUSTOM PRICE HANDLER AVAILABLE');
              }
            } catch (e) { 
              debug('❌ Custom price handler error:', e.message); 
            }
          }
          
          if (!price) {
            debug('💰 PRICE: Falling back to generic...');
            price = getPriceGeneric();
            debug('💰 PRICE FROM GENERIC:', price);
          }
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
            images = (await uniqueImages(customImages)).slice(0, 30);
          } else {
            // Merge and dedupe memory + custom
            let combinedImages = await uniqueImages(memoryImages.concat(customImages));
            
            // Fall back to parallel collection (A1 + B1) if still insufficient
            if (combinedImages.length < 3) {
              debug('🖼️ IMAGES: Custom insufficient, running parallel A1+B1 collection...');
              
              // Run both A1 and B1 simultaneously for comprehensive coverage
              const parallelImages = await collectImagesCombined({ doc: document, observeMs: 1000 });
              debug('🖼️ PARALLEL IMAGES:', { count: parallelImages.length, breakdown: parallelImages.slice(0, 3) });
              
              // If parallel collection succeeded, use those results directly (already processed)
              if (parallelImages.length > 0) {
                debug('✅ PARALLEL SUCCESS: Using processed ImageCandidates directly - skipping legacy filtering');
                // Convert ImageCandidates to simple format for final output
                images = parallelImages.slice(0, 30).map(img => img.upgradedUrl || img.url);
              } else {
                // Only run legacy uniqueImages if parallel collection failed
                const parallelUrls = parallelImages.map(img => img.upgradedUrl || img.url);
                combinedImages = await uniqueImages(combinedImages.concat(parallelUrls));
                images = combinedImages.slice(0, 30);
              }
            } else {
              images = combinedImages.slice(0, 30);
            }
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
      
      // COMPREHENSIVE SELECTOR PERFORMANCE FINAL SUMMARY
      debug('📊 ═══════════════════════════════════════════════════════════════');
      debug('📊 COMPREHENSIVE SELECTOR PERFORMANCE FINAL SUMMARY');
      debug('📊 ═══════════════════════════════════════════════════════════════');
      debug(`📊 SITE: ${window.location.hostname}`);
      debug(`📊 FINAL IMAGES KEPT: ${images?.length || 0}`);
      debug(`📊 MODE: ${mode}`);
      
      // DETAILED SELECTOR BREAKDOWN  
      if (globalThis.__tg_a1SelectorStats || globalThis.__tg_b1SelectorStats) {
        debug('📊 SELECTOR BREAKDOWN SUMMARY:');
        
        // Show A1 detailed results
        if (globalThis.__tg_a1SelectorStats) {
          const a1Stats = globalThis.__tg_a1SelectorStats;
          debug(`📊 A1 GENERIC SELECTORS:`);
          a1Stats.selectors.forEach(stat => {
            const status = stat.kept > 0 ? '✅ WINNER!' : stat.found > 5 ? '❌ JUNK!' : stat.found > 0 ? '⚠️ LOW' : '❌ EMPTY';
            debug(`📊   ${stat.selector}: ${stat.found} found, ${stat.kept} kept (${stat.successRate}% - ${status})`);
          });
          debug(`📊 A1 TOTAL: ${a1Stats.totalFound} found, ${a1Stats.totalKept} kept (${a1Stats.overallSuccess}% success)`);
        }
        
        // Show B1 detailed results  
        if (globalThis.__tg_b1SelectorStats) {
          const b1Stats = globalThis.__tg_b1SelectorStats;
          debug(`📊 B1 COMPREHENSIVE SELECTORS:`);
          b1Stats.selectors.forEach(stat => {
            const status = stat.found > 10 ? '🔍 HIGH VOL' : stat.found > 0 ? '⚠️ LOW VOL' : '❌ EMPTY';
            debug(`📊   ${stat.selector}: ${stat.found} found (${status})`);
          });
          debug(`📊 B1 TOTAL: ${b1Stats.totalFound} found, ${b1Stats.totalKept} kept (${b1Stats.overallSuccess}% success)`);
        }
      }
      
      // Show final winning selector
      if (__used && __used.images) {
        debug(`📊 WINNING METHOD: ${__used.images.selectors.join(', ')} (${__used.images.method})`);
      }
      
      debug('📊 ═══════════════════════════════════════════════════════════════');
      debug('📊 END SELECTOR PERFORMANCE SUMMARY');
      debug('📊 ═══════════════════════════════════════════════════════════════');
      
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
