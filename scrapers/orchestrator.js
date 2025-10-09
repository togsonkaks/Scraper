
/**
 * orchestrator.js — FINAL w/ memoryOnly mode
 * - mode: 'memoryOnly' => use ONLY saved selectors (no fallbacks)
 * - currency-aware price + ancestor scan
 * - images strict filtering + urls tracking
 * - __tg_lastSelectorsUsed populated for all fields
 */
(function () {
  const DEBUG = true;
  const DEBUG_IMG = true; // Toggle for image-specific debug logs (set false in production)
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
  
  // Global mapping to track which selector found each URL
  const urlToSelectorMap = new Map();

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
  
  // Image-specific debug helper (can be silenced in production)
  const dbg = (...args) => {
    if (DEBUG_IMG) {
      console.log(...args);
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
      // Load from file-based system only (via injected memory)
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
      
      // No memory found
      return {};
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
  const JUNK_IMG = /(\.svg($|\?))|sprite|\/logo[\._-]|icon|badge|placeholder|thumb|spinner|loading|prime|favicon|video\.jpg|judgeme\.imgix\.net|\b(visa|mastercard|paypal|amex|discover|apple-?pay|google-?pay|klarna|afterpay|jcb|unionpay|maestro|diners-?club)\b|(payment|credit-?card|pay-?method|checkout|billing|shipping|warranty|trial|interest[-_]?free|premium[-_]?materials?|hypoallergenic)[-_]?(icon|logo|img|image|badge)/i;
  const BASE64ISH_SEG = /\/[A-Za-z0-9+/_]{80,}(?==|$|\?)/;
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
  
  // Consolidated junk image filtering - eliminates duplicate logic
  function isJunkImage(url, element = null, reason = null) {
    if (!url) return { blocked: true, reason: 'empty URL' };
    
    // Shopify files filtering first
    if (shouldBlockShopifyFiles(url, element)) {
      return { blocked: true, reason: 'Shopify theme asset' };
    }
    
    // Comprehensive junk patterns (consolidated from 3+ locations)
    if (/_web\.png/i.test(url)) {
      return { blocked: true, reason: 'Feature icon' };
    }
    if (/_modal_/i.test(url)) {
      return { blocked: true, reason: 'Material swatch' };
    }
    if (/yotpo\.com/i.test(url)) {
      return { blocked: true, reason: 'Review image' };
    }
    if (/-\d{3}\.png/i.test(url)) {
      return { blocked: true, reason: 'Technical sample' };
    }
    if (/(boucle|basketweave|velvet)/i.test(url)) {
      return { blocked: true, reason: 'Fabric pattern' };
    }
    if (/cushion-image/i.test(url)) {
      return { blocked: true, reason: 'Component image' };
    }
    if (/cld\.accentuate\.io/i.test(url)) {
      return { blocked: true, reason: 'Accentuate CDN junk' };
    }
    if (/(shop.?nav|memorial|collection|kova.?box|cust_)/i.test(url)) {
      return { blocked: true, reason: 'Navigation/collection junk' };
    }
    
    return { blocked: false, reason: null };
  }
  
  // ⚠️ CRITICAL FUNCTION - DO NOT REMOVE CDN UPGRADE PATTERNS ⚠️
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
    
    // BJ'S WHOLESALE CLUB: Scene7 CDN upgrades
    if (/bjs\.scene7\.com\/is\/image/i.test(url)) {
      // Upgrade any BJ's quality parameter to zoom quality (future-proof)
      upgraded = upgraded.replace(/\$bjs-[^$]+\$/g, '$bjs-zoom$');
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED BJ's CDN URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
      }
    }
    
    // COACH: Scene7 CDN upgrades  
    if (/coach\.scene7\.com\/is\/image/i.test(url)) {
      // Upgrade thumbnail template to ProductZoom for proper aspect ratio
      upgraded = upgraded.replace(/\$desktopThumbnail\$/g, '$desktopProductZoom$');
      
      // Add high-resolution parameters if not present
      if (!upgraded.includes('wid=')) {
        upgraded += (upgraded.includes('?') ? '&' : '?') + 'wid=2000&qlt=90&op_usm=1.0,1.0,0.0,0';
      }
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED Coach CDN URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
      }
    }
    
    // AMERICAN EAGLE OUTFITTERS: Scene7 CDN upgrades
    if (/s7d2\.scene7\.com.*aeo/i.test(url)) {
      // Downgrade mdg to md templates for better quality (md is better than mdg for AEO)
      upgraded = upgraded.replace(/\$pdp-mdg-opt\$/g, '$pdp-md-opt$');
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED AEO CDN URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
      }
    }
    
    // BOOHOO/BOOHOOMAN: Upgrade thumbnail dimensions to high-quality
    if (/mediahub\.boohooman\.com/i.test(url)) {
      // Upgrade any small dimensions to full-size (w=112, w=556, etc → w=1000&h=1500)
      upgraded = upgraded.replace(/([?&])w=(\d+)&h=(\d+)/gi, (match, sep, w, h) => {
        const width = parseInt(w);
        const height = parseInt(h);
        if (width < 1000 || height < 1500) {
          return `${sep}w=1000&h=1500`;
        }
        return match;
      });
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED BoohooMAN CDN URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
      }
    }
    
    // SHOPIFY CDN: Upgrade small dimensions to high-quality versions
    if (/\/cdn\/shop\//i.test(url) || /cdn\.shopify\.com/i.test(url)) {
      // Upgrade 2-digit dimensions: _94x → _1020x, _97x → _1020x, etc.
      upgraded = upgraded.replace(/_(\d{2})x(\.|\?|$)/gi, '_1020x$2');
      
      // Upgrade 3-digit dimensions: 523x → 1020x, 640x → 1020x, etc.
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
    
    // ⚠️ CRITICAL: MOZU CDN (ACE HARDWARE) - RECENTLY RESTORED - DO NOT REMOVE ⚠️
    if (/cdn-tp3\.mozu\.com/i.test(url)) {
      // Convert ?max=100 to ?quality=60 for small images
      upgraded = upgraded.replace(/\?max=\d+/gi, '?quality=60');
      
      // For URLs with quality, strip all constraining parameters after it
      if (/[?&]quality=\d+/i.test(upgraded)) {
        // Keep only the base URL + ?quality=60, remove everything else
        upgraded = upgraded.replace(/(\?quality=\d+).*$/i, '$1');
      }
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED Mozu CDN URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
      }
    }
    
    // BACKCOUNTRY CDN: Upgrade from 'large' to high-resolution '1200' images
    if (/content\.backcountry\.com\/images\/items\/large\//i.test(url)) {
      upgraded = upgraded.replace(/\/large\//gi, '/1200/');
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED Backcountry CDN URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
      }
    }
    
    // KOHL'S: Upgrade wid/hei parameters for higher quality
    if (/media\.kohlsimg\.com/i.test(url)) {
      // Upgrade smaller dimensions to high quality: wid=390&hei=390 → wid=1500&hei=1500
      upgraded = upgraded.replace(/([?&])wid=\d+/gi, '$1wid=1500');
      upgraded = upgraded.replace(/([?&])hei=\d+/gi, '$1hei=1500');
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED Kohl's CDN URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
      }
    }
    
    // CLOUDINARY: Universal upgrade for small dimensions to high-quality
    if (/res\.cloudinary\.com/i.test(url)) {
      // Convert any width ≤500 to w_1280 for high-quality images
      upgraded = upgraded.replace(/w_(\d+)/g, (match, width) => {
        const w = parseInt(width);
        if (w <= 500) {
          return 'w_1280';
        }
        return match;
      });
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED Cloudinary URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
      }
    }
    
    // REFORMATION: Path-based width parameter upgrades
    if (/thereformation\.com/i.test(url)) {
      // Upgrade /w_500/ or smaller to /w_1000/ for higher quality
      upgraded = upgraded.replace(/\/w_(\d+)\//g, (match, width) => {
        const w = parseInt(width);
        if (w <= 500) {
          return '/w_1000/';
        }
        return match;
      });
      
      // Upgrade device pixel ratio from 2.0 to 3.0 for sharper images
      upgraded = upgraded.replace(/\/dpr_2\.0\//g, '/dpr_3.0/');
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED Reformation URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
      }
    }
    
    // ETSY CDN: Upgrade small thumbnail dimensions to high-quality
    if (/i\.etsystatic\.com/i.test(url)) {
      // Upgrade common small dimensions to 1200x1200
      upgraded = upgraded.replace(/il_300x300/g, 'il_1200x1200');
      upgraded = upgraded.replace(/il_340x270/g, 'il_1200x1200');
      upgraded = upgraded.replace(/il_500x400/g, 'il_1200x1200');
      upgraded = upgraded.replace(/il_600x480/g, 'il_1200x1200');
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED Etsy CDN URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
      }
    }
    
    // IKEA CDN: Upgrade to highest quality available
    if (/ikea\.com\/.*\/images\//i.test(url)) {
      // Always upgrade to xxxl quality (highest available)
      upgraded = upgraded.replace(/\?f=(u|s|xxs|xs|s|m|l|xl|xxl)/g, '?f=xxxl');
      
      // Add xxxl quality if no f parameter exists
      if (!/\?f=/i.test(upgraded) && /\.jpg|\.png|\.webp/i.test(upgraded)) {
        const separator = upgraded.includes('?') ? '&' : '?';
        upgraded += `${separator}f=xxxl`;
      }
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED IKEA CDN URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
      }
    }
    
    // WALGREENS: Upgrade all image sizes to highest quality (900.jpg)
    if (/prodimg\/\d+\//i.test(url)) {
      // Upgrade /155.jpg, /130.jpg, /100.jpg, /450.jpg, etc. → /900.jpg
      upgraded = upgraded.replace(/\/(\d+)\.jpg$/i, '/900.jpg');
      
      // Also handle variant images like 2_100.jpg → 2_900.jpg
      upgraded = upgraded.replace(/\/(\d+)_(\d+)\.jpg$/i, '/$1_900.jpg');
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED Walgreens CDN URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
      }
    }
    
    // LTWEBSTATIC (SHEIN/MUSERA/MISSGUIDED): Remove thumbnail suffixes for full-size images
    if (/ltwebstatic\.com/i.test(url)) {
      // Remove all _thumbnail_XXXx patterns (e.g., _thumbnail_900x, _thumbnail_220x293, _thumbnail_405x552)
      // Preserves file extension (.webp, .jpg, etc.)
      upgraded = upgraded.replace(/_thumbnail_\d+x\d*(?=\.)/gi, '');
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED LTWEBSTATIC CDN URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
      }
    }
    
    // TEMU: Upgrade Alibaba Cloud imageView2 dimensions to high-quality
    if (/kwcdn\.com/i.test(url)) {
      // Upgrade width parameter: w/180 → w/1200, w/800 → w/1200, etc.
      upgraded = upgraded.replace(/\/w\/(\d+)\//g, (match, width) => {
        const w = parseInt(width);
        if (w < 1200) {
          return '/w/1200/';
        }
        return match;
      });
      
      // Boost quality: q/70 → q/90 for sharper images
      upgraded = upgraded.replace(/\/q\/(\d+)\//g, (match, quality) => {
        const q = parseInt(quality);
        if (q < 90) {
          return '/q/90/';
        }
        return match;
      });
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED Temu CDN URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
      }
    }
    
    // BARNES & NOBLE: Upgrade rectangular dimensions to square (full product image)
    if (/prodimage\.images-bn\.com/i.test(url)) {
      // Convert any sWxH to square using larger dimension
      upgraded = upgraded.replace(/s(\d+)x(\d+)/gi, (match, w, h) => {
        const maxDim = Math.max(parseInt(w), parseInt(h));
        return `s${maxDim}x${maxDim}`;
      });
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED Barnes & Noble CDN URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
      }
    }
    
    // SWAROVSKI: Upgrade dimensions to highest quality (2000px)
    if (/asset\.swarovski\.com/i.test(url)) {
      // Upgrade $size_XXX to $size_2000 (e.g., $size_360 → $size_2000)
      upgraded = upgraded.replace(/\$size_\d+/gi, '$size_2000');
      
      // Upgrade width parameter: w_XXX to w_2000 (e.g., w_95 → w_2000)
      upgraded = upgraded.replace(/\bw_(\d+)/gi, (match, width) => {
        const w = parseInt(width);
        if (w < 2000) {
          return 'w_2000';
        }
        return match;
      });
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED Swarovski CDN URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
      }
    }
    
    // REVOLVE: Upgrade /ct/ directory to /uv/ for higher quality images
    if (/revolveassets\.com\/images\/p4\/n\/ct\//i.test(url)) {
      // Convert /ct/ (compressed thumbnail) to /uv/ (uncompressed/high quality)
      upgraded = upgraded.replace(/\/ct\//gi, '/uv/');
      
      if (upgraded !== url) {
        debug(`✨ UPGRADED Revolve CDN URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
      }
    }
    
    // Clean up trailing ? or &
    upgraded = upgraded.replace(/\?(&|$)/, '').replace(/&$/, '');
    
    if (upgraded !== url && !/cdn\.shocho\.co/i.test(url) && !/res\.cloudinary\.com/i.test(url)) {
      debug(`✨ UPGRADED CDN URL: ${url.substring(url.lastIndexOf('/') + 1)} -> ${upgraded.substring(upgraded.lastIndexOf('/') + 1)}`);
    }
    
    return upgraded;
  }

  // Product ID extraction and caching for relevance filtering
  let _cachedProductId = null;
  let _cachedProductKeywords = null;
  
  function extractProductIdFromUrl(url) {
    // Extract 6-11 alphanumeric chars after / or _ and before _ 
    const match = url.match(/[/_]([a-zA-Z0-9]{6,11})_/);
    return match ? match[1] : null;
  }
  
  function findMainProductId() {
    if (_cachedProductId !== null) return _cachedProductId;
    
    // First try URL pattern extraction
    const urlPath = window.location.pathname;
    const urlPatterns = [
      /\/([A-Z0-9]+)\.html/i,    // NastyGal/Debenhams: /BGG08376.html
      /\/prd-(\d+)\//,           // Kohl's: /prd-7663979/
      /\/product\/([^\/]+)/,     // Generic: /product/ABC123/  
      /\/dp\/([^\/]+)/,          // Amazon: /dp/B08XYZ/
      /\/A-(\d+)/,               // Target: /A-54321/
      /\/products\/([^\/]+)/     // Shopify: /products/product-name/
    ];
    
    for (const pattern of urlPatterns) {
      const match = urlPath.match(pattern);
      if (match) {
        _cachedProductId = match[1];
        debug(`🎯 PRODUCT ID from URL: ${_cachedProductId}`);
        return _cachedProductId;
      }
    }
    
    // Fallback: analyze all images on page to find most frequent ID
    const allImages = Array.from(document.querySelectorAll('img')).map(img => img.src || img.dataset.src).filter(Boolean);
    const productIds = allImages.map(extractProductIdFromUrl).filter(Boolean);
    
    if (productIds.length > 0) {
      const counts = {};
      productIds.forEach(id => counts[id] = (counts[id] || 0) + 1);
      _cachedProductId = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
      debug(`🎯 PRODUCT ID from frequency analysis: ${_cachedProductId} (${counts[_cachedProductId]} occurrences)`);
      return _cachedProductId;
    }
    
    _cachedProductId = ''; // Cache empty result to avoid re-computation
    return '';
  }
  
  function getProductKeywords() {
    if (_cachedProductKeywords !== null) return _cachedProductKeywords;
    
    const urlPath = window.location.pathname;
    const pathSegments = urlPath.split('/').filter(s => s.length > 0);
    
    // Try to find the descriptive product slug (usually second-to-last or last segment)
    // Skip segments that look like product IDs (all caps/numbers, short codes)
    let productSlug = '';
    for (let i = pathSegments.length - 1; i >= 0; i--) {
      const segment = pathSegments[i];
      // Skip if it looks like a product ID: CMM09851, 12345, SKU-123, etc
      if (/^[A-Z0-9\-_]{3,15}$/i.test(segment) || /\.(html?|php|aspx?)$/i.test(segment)) {
        continue; // Skip product IDs and file extensions
      }
      // Found a descriptive slug with multiple words
      if (segment.includes('-') || segment.length > 15) {
        productSlug = segment;
        break;
      }
    }
    
    // Extract meaningful keywords from slug
    _cachedProductKeywords = productSlug
      .replace(/[._]/g, '-') // Normalize separators
      .split('-')
      .filter(part => part.length > 3) // Filter words longer than 3 chars (skip "set", "for", etc)
      .filter(part => !/^\d+$/.test(part)) // Skip pure numbers
      .map(part => part.toLowerCase());
      
    return _cachedProductKeywords;
  }

  // ⚠️ CRITICAL FUNCTION - Multi-layered image quality scoring algorithm ⚠️
  // Enhanced image quality scoring function with aggressive filtering  
  function scoreImageURL(url, element = null, elementIndex = 0, isImgFallback = false, selector = '', fromSrcset = false, fromZoomAttr = false, fromLargeAttr = false) {
    if (!url) return 0;
    
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
      /[?&]\$n_(\d+)w?\b/i,  // ASOS patterns: ?$n_640w, ?$n_1920
      /[wh](\d+)_/i  // TheOutnet format: w1020_, h800_
    ];
    
    let detectedSize = 0;
    for (const pattern of sizePatterns) {
      const match = url.match(pattern);
      if (match) {
        detectedSize = Math.max(detectedSize, parseInt(match[1]));
      }
    }
    
    if (detectedSize > 0) {
      if (detectedSize >= 1200) score += 100;
      else if (detectedSize >= 800) score += 80;
      else if (detectedSize >= 600) score += 60;
      else if (detectedSize >= 400) score += 30;
      else if (detectedSize < 200) score += 10; // Almost nothing for tiny images
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
    
    // ENHANCED: PDP vs PLP patterns (Product Detail Page vs Product List Page)
    if (/\/PDP_|_PDP_|product-detail/i.test(url)) score += 40; // Product Detail Page images (good!)
    if (/\/PLP_|_PLP_|product-list/i.test(url)) score -= 40; // Product List Page images (cross-sell)
    
    // Aggressive semantic penalties for navigation/UI elements
    if (/\b(womens?-clothing|mens?-clothing|best-sellers?|new-arrivals?|accessories|shop-by|featured-edit|wellness|searchburger)\b/i.test(url)) score -= 70;
    
    // Navigation URL patterns penalty - catches NAV images that escape element-based detection
    if (/_NAV_|\/NAV\/|-NAV-|NAV_WOMEN|NAV_MEN|NAV_DESK|_DESK(?:TOP)?_|LIFESTYLE_DESK|JOURNAL_|STORES_NAV/i.test(url)) score -= 150;
    
    // Unified promotional content penalty - eliminates promotional images
    // Compound terms (substring match): flyout_mens, etc.
    if (/(flyout|banner|advertisement|campaign|marketing|bullet-point|feedback)/i.test(url)) score -= 200;
    // Short words (word boundary): avoid matching "adoredvintage.com" for "ad"
    if (/\b(ad|logo|bg|background|header|footer|nav|navigation|menu|sidebar)\b/i.test(url)) score -= 200;
    if (/\b(sprite|icon|badge|placeholder|loading|spinner|pixel\.gif|grey-pixel)\b/i.test(url)) score -= 80;
    
    // Soft penalty for any "logo" keyword (including product names like "LogoHalfZipSweater")
    // Note: Hard filter already blocks /logo.png, /logo-header.jpg via JUNK_IMG regex
    if (/logo/i.test(url)) score -= 10;
    if (/\b(warranty|insurance|coverage|support|claim)\b/i.test(url)) score -= 55;
    
    // Mobile icon penalty: Only penalize .png files with specific icon keywords (conservative)
    if (/\.png/i.test(url) && /\b(truck|delivery|hanger)\b/i.test(url)) score -= 20;
    
    // Community/review image penalties
    if (/aicid=community/i.test(url)) score -= 45;
    if (/community-reviews/i.test(url)) score -= 45;
    
    // Enhanced position-based bonuses (early images more likely to be main product)
    // DISABLED during img fallback - position is meaningless when scraping entire page
    if (!isImgFallback) {
      if (elementIndex < 10) score += 30; // Top 10 images
      if (elementIndex < 5) score += 10;  // Top 5 images get extra
      if (elementIndex < 3) score += 10;  // Top 3 images get more
      if (elementIndex < 1) score += 10;  // First image gets most (total: +60)
    }
    
    // Srcset quality bonus (images from srcset often higher quality)
    if (fromSrcset) {
      score += 15;
    }
    
    // Data-attribute bonuses (special attributes indicate high-quality images)
    if (fromZoomAttr) {
      score += 25; // data-zoom-image, data-zoom-src are high-quality
    }
    if (fromLargeAttr) {
      score += 20; // data-large, data-full-src are high-quality
    }
    
    // Selector-based scoring (check selector path for gallery/cross-sell keywords)
    if (selector) {
      const selectorLower = selector.toLowerCase();
      
      // GOOD SELECTORS: Product gallery indicators (+25)
      if (/modal-opener|product__modal|zoom-gallery|product-gallery|slideshow-main|carousel-product|media-viewer|product__media-viewer|detail_zoom|prd-detail|detail.*zoom/i.test(selectorLower)) {
        score += 25;
      }
      // GOOD SELECTORS: General gallery indicators (+20)
      else if (/slidecount|mainimage|main-image|primary.*image|slideshow|carousel-main|gallery-container|detail|zoom/i.test(selectorLower)) {
        score += 20;
      }
      
      // BAD SELECTORS: Cross-sell/recommendation containers (-40)
      if (/lb-spc|lightbox.*shop|recommendation|cross-sell|related-products|you-may-also|recently-viewed|upsell-product|prd-card|card_imagecontainer|product-card|item-card/i.test(selectorLower)) {
        score -= 40;
      }
    }
    
    // Element-based bonuses if element provided
    if (element) {
      const className = element.className || '';
      const id = element.id || '';
      const combined = (className + ' ' + id).toLowerCase();
      
      // ENHANCED: Gallery container bonuses (prioritize product gallery images)
      // Removed "product-image" to prevent cross-sell bonus, kept main gallery keywords
      if (/\b(main|hero|primary|featured|gallery-main|product-gallery|media-gallery|image-gallery|product-media|slideshow|carousel|zoom-gallery)\b/i.test(combined)) score += 50;
      if (/\b(gallery|product-thumb|media-item|slide-item|zoom-item)\b/i.test(combined)) score += 35;
      
      // Thumbnail penalties  
      if (/\b(thumb|thumbnail|small|mini|icon)\b/i.test(combined)) score -= 10;
      
      // ENHANCED: Navigation container penalties (reduce cross-sell noise)
      if (/\b(banner|ad|sidebar|nav|navigation|header|footer|menu|cross-sell|upsell|related|recommended)\b/i.test(combined)) score -= 60;
      if (/nav-/i.test(combined) || /-nav/i.test(combined) || /Sept.*Nav/i.test(combined)) score -= 70; // Specific nav patterns like "Sept_Nav"
      
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
    
    // Note: Keyword matching logic moved to final selection phase to avoid repeated execution
    // All relevance-based scoring now happens once at the end in the FINAL RELEVANCE GATE
    
    return Math.max(0, score);
  }
  
  const pickFromSrcset = (srcset) => {
    if (!srcset) return null;
    // If it's already a complete URL (no width descriptors AND no commas), use it directly
    // This handles SSENSE-style data-srcset with commas in CDN params
    if (/^https?:\/\//i.test(srcset) && !srcset.includes(',') && !/\s+\d+w$/i.test(srcset)) {
      return srcset.trim();
    }
    // Otherwise, parse as standard srcset with density descriptors (1x, 2x) or width descriptors
    const parts = srcset.split(',').map(s => s.trim());
    
    // Check if we have width descriptors (e.g., "700w", "1400w")
    const hasWidthDescriptor = parts.some(p => /\s+\d+w$/i.test(p));
    
    if (hasWidthDescriptor) {
      // Parse width descriptors and return the HIGHEST width URL
      let maxWidth = 0;
      let bestUrl = null;
      
      parts.forEach(part => {
        const match = part.match(/^(.+?)\s+(\d+)w$/i);
        if (match) {
          const url = match[1].trim();
          const width = parseInt(match[2], 10);
          if (width > maxWidth) {
            maxWidth = width;
            bestUrl = url;
          }
        }
      });
      
      if (bestUrl) return bestUrl;
    }
    
    // For density descriptors (1x, 2x) or no descriptor, take the FIRST entry
    const first = parts[0] || '';
    const url = first.split(' ')[0];
    return url || null;
  };
  const toAbs = (u) => { try { return new URL(u, location.href).toString(); } catch { return u; } };
  const canonicalKey = (u) => {
    try {
      const url = new URL(u, location.href);
      url.hash = ''; url.search='';
      let p = url.pathname;
      
      // Strip CDN path parameters (like /w_500/, /dpr_2.0/)
      p = p.replace(/\/((w|h|c|q|dpr|ar|f)_[^/]+)/g,'/');
      
      // Strip size-based suffixes from filename, but preserve view suffixes
      // Strip: _640x, _1020x, _300x480 (dimensions)
      // Keep: _V1, _V2, _V3 (view numbers), _front, _back (view names)
      const lastSlash = p.lastIndexOf('/');
      if (lastSlash !== -1) {
        let filename = p.substring(lastSlash + 1);
        const basename = filename.substring(0, filename.lastIndexOf('.')) || filename;
        const ext = filename.substring(filename.lastIndexOf('.')) || '';
        
        // Strip dimension patterns: _640x, _1020x, _300x480, etc.
        let normalizedBase = basename.replace(/_\d+x\d*/g, '');
        
        p = p.substring(0, lastSlash + 1) + normalizedBase + ext;
      }
      
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


  // ⚠️ OLD FUNCTION - REPLACED BY processImages() - KEPT FOR REFERENCE ⚠️
  // ⚠️ CRITICAL FUNCTION - Core deduplication and filtering pipeline ⚠️
  // Hybrid unique images with score threshold and file size filtering
  /* COMMENTED OUT - MERGED INTO processImages()
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
      
      // Apply CDN upgrades before scoring and processing
      enriched.url = upgradeCDNUrl(enriched.url);
      
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
      
      // Apply score threshold (minimum 40 points)
      const score = scoreImageURL(abs, enriched.element, enriched.index, isImgFallback, enriched.selector, enriched.fromSrcset, enriched.fromZoomAttr, enriched.fromLargeAttr);
      if (score < 40) {
        addImageDebugLog('debug', `📉 LOW SCORE REJECTED (${score}): ${abs.slice(0, 100)} | Found by: ${enriched.selector}`, abs, score, false);
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
        score: score,
        selector: enriched.selector || 'unknown'
      });
    }
    
    // Select best scoring image from each group, maintain DOM order
    const bestImages = [];
    for (const [canonical, candidates] of groups) {
      if (candidates.length === 1) {
        // Only one candidate, use it
        const candidate = candidates[0];
        bestImages.push({ ...candidate, canonical });
        addImageDebugLog('debug', `✅ SINGLE IMAGE (score: ${candidate.score}): ${candidate.url.slice(0, 100)} | Found by: ${candidate.selector}`, candidate.url, candidate.score, true);
        filtered.kept++;
      } else {
        // Multiple candidates, pick highest score
        let bestCandidate = candidates.reduce((best, current) => 
          current.score > best.score ? current : best
        );
        
        bestImages.push({ ...bestCandidate, canonical });
        addImageDebugLog('debug', `✅ BEST OF ${candidates.length} (score: ${bestCandidate.score}): ${bestCandidate.url.slice(0, 100)} | Found by: ${bestCandidate.selector}`, bestCandidate.url, bestCandidate.score, true);
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
    
    // Pixel-count competition: Within similar images, boost the one with highest pixel count
    function getPixelCount(url) {
      const dimensionalPatterns = [
        /s(\d+)x(\d+)/i,              // Barnes & Noble: s1200x630
        /(\d+)x(\d+)(?:_|\.|$)/i,     // Generic: 1200x630
        /w(\d+)_h(\d+)/i,             // Some CDNs: w1200_h630
        /w(\d+)xh(\d+)/i              // CDNs with x separator: w2500xh2000
      ];
      
      for (const pattern of dimensionalPatterns) {
        const match = url.match(pattern);
        if (match) {
          const width = parseInt(match[1]);
          const height = parseInt(match[2]);
          return width * height;
        }
      }
      
      // Shopify single dimension patterns (treat as square)
      const shopifyMatch = url.match(/_(\d+)x/i);  // _1200x format
      if (shopifyMatch) {
        const dimension = parseInt(shopifyMatch[1]);
        return dimension * dimension;  // Square it for pixel count
      }
      
      return 0;
    }
    
    function getBaseImageUrl(url) {
      // Strip dimensional patterns to group similar images
      return url
        .replace(/s(\d+)x(\d+)/g, '')
        .replace(/(\d+)x(\d+)(?:_|\.|$)/g, '')
        .replace(/w(\d+)_h(\d+)/g, '')
        .replace(/w(\d+)xh(\d+)/g, '')      // w2500xh2000 format
        .replace(/_(\d+)x/g, '');           // Shopify _1200x format
    }
    
    // Group similar images and boost winner in each group
    const imageGroups = new Map();
    sizeFilteredImages.forEach(img => {
      const baseUrl = getBaseImageUrl(img.url);
      if (!imageGroups.has(baseUrl)) {
        imageGroups.set(baseUrl, []);
      }
      imageGroups.get(baseUrl).push(img);
    });
    
    // Apply pixel-count bonuses within each group
    imageGroups.forEach(group => {
      if (group.length > 1) {
        const winner = group.reduce((max, img) => 
          getPixelCount(img.url) > getPixelCount(max.url) ? img : max
        );
        winner.score += 25; // +25 bonus for highest pixel count in group
        debug(`🏆 PIXEL WINNER: ${winner.url.substring(winner.url.lastIndexOf('/') + 1)} (+25 bonus, score now ${winner.score})`);
      }
    });
    
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
    
    const finalImages = sizeFilteredImages.slice(0, 50);
    const finalUrls = finalImages.map(img => img.url);
    
    // Update urlToSelectorMap with final processed URLs and their selectors
    finalImages.forEach(img => {
      if (img.selector) {
        urlToSelectorMap.set(img.url, img.selector);
      }
    });
    
    if (sizeFilteredImages.length > 50) {
      addImageDebugLog('warn', `⚠️ IMAGE LIMIT REACHED (50), keeping first 50 by DOM order`, '', 0, false);
    }
    
    debug('🖼️ HYBRID FILTERING RESULTS:', filtered);
    debug('🖼️ FINAL IMAGES:', finalUrls.slice(0, 5).map(url => url.slice(0, 80)));
    
    // Return raw URLs without keyword matching - relevance ranking moved to caller
    return finalUrls;
  }
  */ // END hybridUniqueImages - MERGED INTO processImages()

  // ⚠️ OLD FUNCTION - REPLACED BY inline logic in processImages() - KEPT FOR REFERENCE ⚠️
  // Simple deduplication without processing - no more legacy filtering
  /* COMMENTED OUT - MERGED INTO processImages()
  async function uniqueImages(urls) {
    debug('🔗 SIMPLE DEDUPLICATION:', { inputCount: urls.length });
    const seen = new Set();
    const unique = [];
    for (const url of urls) {
      if (url && !seen.has(url)) {
        seen.add(url);
        unique.push(url);
      }
    }
    debug('🔗 DEDUPLICATED:', { outputCount: unique.length });
    return unique;
  }
  */ // END uniqueImages - MERGED INTO processImages()
  
  // ⚠️ OLD FUNCTION - REPLACED BY processImages() - KEPT FOR REFERENCE ⚠️
  // Simple raw URL extraction without processing
  /* COMMENTED OUT - MERGED INTO processImages()
  async function gatherRawImageUrls(sel) {
    debug('🔗 GATHERING RAW URLs with selector:', sel);
    
    const elements = qa(sel);
    const urls = [];
    
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const attrs = {
        src: el.src,
        'data-src': el.getAttribute('data-src'),
        'data-lazy': el.getAttribute('data-lazy'),
        'data-image': el.getAttribute('data-image'),
        srcset: el.srcset
      };
      
      // Extract URL from various attributes
      let url = null;
      if (attrs.src && attrs.src !== location.href && !attrs.src.includes('data:')) {
        url = attrs.src;
      } else if (attrs['data-src']) {
        url = attrs['data-src'];
      } else if (attrs['data-lazy']) {
        url = attrs['data-lazy'];
      } else if (attrs['data-image']) {
        url = attrs['data-image'];
      } else if (attrs.srcset) {
        url = pickFromSrcset(attrs.srcset);
      }
      
      if (url) {
        // Apply CDN upgrades but skip all scoring/filtering
        const upgraded = upgradeCDNUrl(url);
        const absolute = toAbs(upgraded);
        if (absolute && absolute !== url) {
          debug(`✨ UPGRADED CDN URL: ${url.slice(-80)} -> ${absolute.slice(-80)}`);
        }
        urls.push(absolute);
      }
    }
    
    debug(`🔗 RAW EXTRACTION: ${urls.length} URLs from ${elements.length} elements`);
    return urls;
  }
  */ // END gatherRawImageUrls - MERGED INTO processImages()
  
  // ⚠️ OLD FUNCTION - REPLACED BY processImages() - KEPT FOR REFERENCE ⚠️
  /* COMMENTED OUT - MERGED INTO processImages()
  async function gatherImagesBySelector(sel, observeMs = 0) {
    dbg('🔍 GATHERING IMAGES with selector:', sel);
    
    const allElements = qa(sel);
    
    // Conservative filtering - only exclude obvious recommendation containers
    const elements = allElements.filter(el => {
      // Check element and immediate parents for obvious recommendation patterns
      let current = el;
      for (let i = 0; i < 3 && current; i++) {
        const className = (current.className || '').toLowerCase();
        const id = (current.id || '').toLowerCase();
        
        // Only exclude very specific recommendation patterns
        if (className.includes('related-products') || 
            className.includes('recommendations') || 
            className.includes('you-might-also-like') ||
            id.includes('related-products') ||
            id.includes('recommendations')) {
          dbg(`🚫 EXCLUDED: Found recommendation container in ${current.tagName}.${className}`);
          return false;
        }
        current = current.parentElement;
      }
      return true;
    });
    
    dbg(`📊 Found ${allElements.length} total elements, ${elements.length} after conservative filtering for selector:`, sel);
    if (allElements.length !== elements.length) {
      dbg(`🚫 FILTERED OUT: ${allElements.length - elements.length} obvious recommendation containers`);
    }
    
    // Skip processing if no elements found - eliminates 12+ lines of wasteful filtering/scoring
    if (elements.length === 0) {
      dbg(`🚫 SKIPPING: No elements found`);
      return [];
    }
    
    const enrichedUrls = []; // Now includes element info
    
    debug(`🔍 Processing ${elements.length} image elements...`);
    
    try {
      for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      // Only log first 3 elements to reduce spam
      if (i < 3) {
        debugElement(el, `Image element #${i+1}`);
      }
      
      const attrs = {
        src: el.getAttribute('src') || el.currentSrc,
        'data-src': el.getAttribute('data-src'),
        'data-image': el.getAttribute('data-image'),
        'data-zoom-image': el.getAttribute('data-zoom-image'),
        'data-large': el.getAttribute('data-large'),
        srcset: el.getAttribute('srcset'),
        'data-srcset': el.getAttribute('data-srcset')
      };
      
      dbg('📋 Image attributes:', attrs);
      
      const s1 = attrs.src || attrs['data-src'] || attrs['data-image'] || 
                 attrs['data-zoom-image'] || attrs['data-large'];
      if (s1) {
        dbg('✅ Found image URL from attributes:', s1.slice(0, 100));
        
        // Consolidated junk filtering
        const junkCheck = isJunkImage(s1, el);
        if (junkCheck.blocked) {
          dbg(`❌ BLOCKED [${junkCheck.reason}]:`, s1.substring(s1.lastIndexOf('/') + 1));
          continue;
        }
        
        // Show positive confirmation for Shopify product images
        if (/\/cdn\/shop\/files\//i.test(s1)) {
          dbg('✅ ALLOWED: Shopify files path (product image):', s1.substring(s1.lastIndexOf('/') + 1));
        }
        
        const upgradedUrl = upgradeCDNUrl(s1); // Apply universal CDN URL upgrades
        enrichedUrls.push({ url: upgradedUrl, element: el, index: i, selector: sel });
        urlToSelectorMap.set(upgradedUrl, sel); // Track selector for this URL
      }
      
      const ss = attrs['data-srcset'] || attrs.srcset;
      const best = pickFromSrcset(ss); 
      if (best) {
        dbg('✅ Found image URL from srcset:', best.slice(0, 100));
        
        // Consolidated junk filtering
        const junkCheck = isJunkImage(best, el);
        if (junkCheck.blocked) {
          dbg(`❌ BLOCKED [${junkCheck.reason}]:`, best.substring(best.lastIndexOf('/') + 1));
          continue;
        }
        
        // Show positive confirmation for Shopify product images
        if (/\/cdn\/shop\/files\//i.test(best)) {
          dbg('✅ ALLOWED: Shopify files path (product image):', best.substring(best.lastIndexOf('/') + 1));
        }
        
        const upgradedUrl = upgradeCDNUrl(best); // Apply universal CDN URL upgrades
        enrichedUrls.push({ url: upgradedUrl, element: el, index: i, selector: sel });
        urlToSelectorMap.set(upgradedUrl, sel); // Track selector for this URL
      }
      
      // Check picture parent
      if (el.parentElement && el.parentElement.tagName.toLowerCase()==='picture') {
        dbg('📸 Checking picture parent for sources...');
        for (const src of el.parentElement.querySelectorAll('source')) {
          const b = pickFromSrcset(src.getAttribute('data-srcset') || src.getAttribute('srcset')); 
          if (b) {
            dbg('✅ Found image URL from picture source:', b.slice(0, 100));
            
            // Consolidated junk filtering
            const junkCheck = isJunkImage(b, src);
            if (junkCheck.blocked) {
              dbg(`❌ BLOCKED [${junkCheck.reason}]:`, b.substring(b.lastIndexOf('/') + 1));
              continue;
            }
            
            // Show positive confirmation for Shopify product images
            if (/\/cdn\/shop\/files\//i.test(b)) {
              dbg('✅ ALLOWED: Shopify files path (product image):', b.substring(b.lastIndexOf('/') + 1));
            }
            
            const upgradedUrl = upgradeCDNUrl(b); // Apply universal CDN URL upgrades
            enrichedUrls.push({ url: upgradedUrl, element: el, index: i, selector: sel });
            urlToSelectorMap.set(upgradedUrl, sel); // Track selector for this URL
          }
        }
      }
    }
    } catch(e) {
      console.warn('[DEBUG] gatherImagesBySelector error:', e.message);
      dbg('❌ Image gathering failed, returning empty array');
    }
    
    dbg(`🖼️ Raw enriched URLs collected: ${enrichedUrls.length}`);
    const immediateImages = await hybridUniqueImages(enrichedUrls);
    dbg(`🖼️ After hybrid filtering: ${immediateImages.length} immediate images`);
    
    // Phase 2: Lazy Loading (optional)
    if (observeMs > 0) {
      dbg(`⏳ LAZY LOADING: Observing for ${observeMs}ms for additional images...`);
      
      // Track new images that appear
      const lazyImages = [];
      
      // Set up lightweight MutationObserver  
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          // Check for new img elements
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Direct img element
              if (node.tagName === 'IMG') {
                const imgUrl = node.src || node.getAttribute('data-src');
                if (imgUrl && !lazyImages.includes(imgUrl)) {
                  dbg(`🔍 LAZY: New img element found: ${imgUrl.slice(0, 80)}`);
                  lazyImages.push(imgUrl);
                }
              }
              // img elements within added nodes
              const imgs = node.querySelectorAll ? node.querySelectorAll('img') : [];
              imgs.forEach(img => {
                const imgUrl = img.src || img.getAttribute('data-src');
                if (imgUrl && !lazyImages.includes(imgUrl)) {
                  dbg(`🔍 LAZY: New nested img found: ${imgUrl.slice(0, 80)}`);
                  lazyImages.push(imgUrl);
                }
              });
            }
          });
          
          // Check for src changes on existing images
          if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
            const imgUrl = mutation.target.src;
            if (imgUrl && !lazyImages.includes(imgUrl)) {
              dbg(`🔍 LAZY: Src change detected: ${imgUrl.slice(0, 80)}`);
              lazyImages.push(imgUrl);
            }
          }
        });
      });
      
      // Observe the document for changes
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'srcset', 'data-src', 'data-srcset', 'data-image', 'data-zoom-image', 'data-large']
      });
      
      // Wait for the specified time
      await new Promise(resolve => setTimeout(resolve, observeMs));
      
      // Stop observing
      observer.disconnect();
      
      if (lazyImages.length > 0) {
        dbg(`🎯 LAZY LOADING: Found ${lazyImages.length} additional images`);
        
        // Convert lazy images to enriched format
        const lazyEnriched = lazyImages.map((url, index) => ({
          url: upgradeCDNUrl(url),
          element: null,
          index: immediateImages.length + index
        }));
        
        // Filter lazy images and combine with immediate images
        const filteredLazy = await hybridUniqueImages(lazyEnriched);
        const combinedImages = immediateImages.concat(filteredLazy);
        dbg(`🚀 LAZY LOADING COMPLETE: ${immediateImages.length} immediate + ${filteredLazy.length} lazy = ${combinedImages.length} total`);
        
        return combinedImages;
      } else {
        dbg(`📭 LAZY LOADING: No additional images found during observation`);
      }
    }
    
    return immediateImages;
  }
  */ // END gatherImagesBySelector - MERGED INTO processImages()

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
      if (field === 'sku') {
        const v = prod.sku || prod.productID || prod.gtin13 || prod.mpn || null;
        if (v) mark('sku', { selectors:['script[type="application/ld+json"]'], attr:'text', method:'jsonld' });
        return v;
      }
      if (field === 'images') {
        const arr = ldPickImages(prod);
        if (arr.length) {
          mark('images', { selectors:['script[type="application/ld+json"]'], attr:'text', method:'jsonld' });
          // Simple deduplication inline
          const seen = new Set();
          const unique = [];
          for (const url of arr) {
            if (url && !seen.has(url)) {
              seen.add(url);
              unique.push(url);
              // Track selector for JSON-LD images
              urlToSelectorMap.set(url, 'script[type="application/ld+json"]');
            }
          }
          return unique.slice(0,30);
        }
        const og = q('meta[property="og:image"]')?.content;
        if (og) {
          // Track selector for og:image
          urlToSelectorMap.set(og, 'meta[property="og:image"]');
        }
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
          // Check if this is a metadata selector (meta tag or JSON-LD)
          if (sel.includes('meta[property') || sel.includes('script[type="application/ld+json"]')) {
            if (sel.includes('meta[property="og:image"]')) {
              // Extract from og:image meta tag
              const metaEl = q(sel);
              if (metaEl) {
                const url = metaEl.getAttribute('content');
                if (url) {
                  const finalUrl = upgradeCDNUrl(url.startsWith('//') ? 'https:' + url : url);
                  urlToSelectorMap.set(finalUrl, sel);
                  debug(`✅ SAVED SELECTOR SUCCESS [images]: Found og:image`);
                  mark('images', { selectors:[sel], attr:'content', method:'saved' });
                  return [finalUrl];
                }
              }
            } else if (sel.includes('script[type="application/ld+json"]')) {
              // Extract from JSON-LD
              const scripts = qa('script[type="application/ld+json"]');
              for (const script of scripts) {
                try {
                  const data = JSON.parse(script.textContent);
                  const prod = Array.isArray(data) ? data.find(d => d['@type'] === 'Product') : (data['@type'] === 'Product' ? data : null);
                  if (prod) {
                    const arr = ldPickImages(prod);
                    if (arr.length) {
                      const urls = arr.map(url => {
                        const finalUrl = upgradeCDNUrl(url.startsWith('//') ? 'https:' + url : url);
                        urlToSelectorMap.set(finalUrl, sel);
                        return finalUrl;
                      });
                      debug(`✅ SAVED SELECTOR SUCCESS [images]: Found ${urls.length} JSON-LD images`);
                      mark('images', { selectors:[sel], attr:'text', method:'saved' });
                      return urls.slice(0,30);
                    }
                  }
                } catch (e) {}
              }
            }
            debug(`❌ SAVED SELECTOR returned 0 images: ${sel}`);
            continue;
          }
          
          // Direct extraction for saved image selectors (no scoring)
          const imgs = qa(sel);
          if (imgs && imgs.length > 0) {
            const urls = [];
            for (const img of imgs) {
              // Smart attribute extraction with placeholder detection
              let url = null;
              
              // STEP 1: Try saved attribute first (backward compatibility)
              const savedAttr = memEntry.attr || 'src';
              const primaryUrl = savedAttr === 'src' ? img.src : img.getAttribute(savedAttr);
              
              // STEP 2: Check if it's a real URL (not a placeholder)
              if (isRealImageUrl(primaryUrl)) {
                url = primaryUrl;
                debug(`✅ Primary attribute (${savedAttr}) has real URL`);
              } else {
                // STEP 3: Placeholder detected - try alternatives
                if (primaryUrl) {
                  debug(`⚠️ Placeholder detected in ${savedAttr}: ${primaryUrl.substring(0, 50)}...`);
                }
                
                // Try alternative attributes in priority order
                const alternatives = [
                  { name: 'srcset', value: img.getAttribute('srcset') },
                  { name: 'data-srcset', value: img.getAttribute('data-srcset') },
                  { name: 'data-src', value: img.getAttribute('data-src') },
                  { name: 'currentSrc', value: img.currentSrc },
                  { name: 'data-image', value: img.getAttribute('data-image') },
                  { name: 'data-zoom-image', value: img.getAttribute('data-zoom-image') },
                  { name: 'data-large', value: img.getAttribute('data-large') }
                ];
                
                for (const alt of alternatives) {
                  if (!alt.value) continue;
                  
                  // Handle srcset specially (pick best quality)
                  if (alt.name === 'srcset' || alt.name === 'data-srcset') {
                    const srcsetUrl = pickFromSrcset(alt.value);
                    if (isRealImageUrl(srcsetUrl)) {
                      url = srcsetUrl;
                      debug(`✅ Found real URL in ${alt.name}`);
                      break;
                    }
                  } else {
                    if (isRealImageUrl(alt.value)) {
                      url = alt.value;
                      debug(`✅ Found real URL in ${alt.name}`);
                      break;
                    }
                  }
                }
                
                if (!url) {
                  debug(`❌ No real URL found in any attribute for this image`);
                }
              }
              
              if (url) {
                // Normalize protocol-relative URLs
                if (url.startsWith('//')) {
                  url = 'https:' + url;
                }
                const finalUrl = upgradeCDNUrl(url);
                urls.push(finalUrl);
                // Track selector for this URL
                urlToSelectorMap.set(finalUrl, sel);
              }
            }
            if (urls.length > 0) {
              debug(`✅ SAVED SELECTOR SUCCESS [images]: Found ${urls.length} images`);
              mark('images', { selectors:[sel], attr:'src', method:'saved' });
              // Simple deduplication
              const seen = new Set();
              const unique = [];
              for (const url of urls) {
                if (url && !seen.has(url)) {
                  seen.add(url);
                  unique.push(url);
                }
              }
              return unique.slice(0,30);
            }
          }
          debug(`❌ SAVED SELECTOR returned 0 images: ${sel}`);
          continue;
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
  // Validate if URL is a real image (not a placeholder)
  function isRealImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    // Reject data URLs (base64 placeholders)
    if (url.startsWith('data:')) return false;
    
    // Accept real URLs:
    // - http:// or https://
    // - // (protocol-relative)
    // - www. (with or without protocol)
    // - / (relative paths)
    return /^(https?:)?\/\/|^www\.|^\//.test(url);
  }
  
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
  
  function getBreadcrumbs() {
    // Helper: Validate breadcrumb structure
    function isValidBreadcrumb(text, itemCount) {
      if (!text || text.length < 5) return false;
      // Check for separators (›, /, |, >, »)
      const hasSeparator = /[›>\/|»]/.test(text);
      // Check item count (typically 2-6 items)
      const validCount = itemCount >= 2 && itemCount <= 8;
      return hasSeparator && validCount;
    }
    
    // Helper: Clean and filter breadcrumb items
    function cleanBreadcrumbItems(items) {
      // STEP 1: Text splitting for concatenated strings like "BackHome/Women/Shoes"
      const splitItems = items.flatMap(item => {
        if (!item) return [];
        
        // Detect concatenated navigation terms (BackHome, HomeShop, etc.)
        // Split "BackHome" → ["Back", "Home"], "HomeShop" → ["Home", "Shop"]
        let processed = item.replace(/\b(Back|Return|Previous)(Home|Shop|Store)\b/gi, '$1/$2');
        
        // Smart split for concatenated words using capital letters (HomeTool → Home/Tool)
        // Match: uppercase letter followed by lowercase, then another uppercase (camelCase/PascalCase)
        processed = processed.replace(/([a-z])([A-Z])/g, '$1/$2');
        
        // Split by common separators: /, >, |, ›, »
        const parts = processed.split(/\s*[/>|›»]\s*/);
        
        // If we got multiple parts from splitting, return them; otherwise return original
        return parts.filter(Boolean);
      });
      
      // STEP 2: Normalize and filter junk
      const cleaned = splitItems
        .map(item => {
          // Normalize separators - remove literal "/" and clean up
          let clean = item.replace(/^\/+|\/+$/g, '').trim();
          // Remove empty or very short items
          if (clean.length === 0 || clean === '/' || clean === '|' || clean === '>') return null;
          return clean;
        })
        .filter(Boolean)
        .filter((item, index) => {
          // Remove navigation junk terms (exact match only, case insensitive)
          const junkTerms = /^(back|return|go back|← back|‹ back|previous|shop|shop all|store|all products|products|all categories|categories|main menu|menu|start|index|root|←|→|‹|›)$/i;
          if (junkTerms.test(item)) return false;
          
          // Remove "Home" only if it's exactly that word (not "Home-Goods", "Homeware", etc.)
          // Only filter first item if it's exactly "Home"
          if (index === 0 && /^home$/i.test(item)) return false;
          
          return true;
        });
      
      return cleaned;
    }
    
    // Helper: Extract and format breadcrumb text from links
    function extractFromLinks(container) {
      const links = container.querySelectorAll('a, li > span, [itemprop="name"]');
      if (links.length < 2) return null;
      
      const items = Array.from(links)
        .map(link => link.textContent.trim())
        .filter(text => text && text.length > 0 && text.length < 50); // Reasonable item length
      
      // Clean up junk items
      const cleanedItems = cleanBreadcrumbItems(items);
      
      if (cleanedItems.length < 2) return null;
      const breadcrumbText = cleanedItems.join(' > ');
      
      // Return array instead of string for better tag matching
      return isValidBreadcrumb(breadcrumbText, cleanedItems.length) ? cleanedItems : null;
    }
    
    // PRIORITY 1: JSON-LD BreadcrumbList (most reliable, hidden structured data)
    try {
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse(script.textContent.trim());
          const arr = Array.isArray(data) ? data : [data];
          
          for (const node of arr) {
            const types = [].concat(node?.["@type"]||[]).map(String);
            
            // Check for BreadcrumbList
            if (types.some(t => /breadcrumb/i.test(t))) {
              const items = node.itemListElement || [];
              if (Array.isArray(items) && items.length >= 2) {
                const rawItems = items
                  .map(item => item.name || item.item?.name || '')
                  .filter(Boolean);
                
                // Apply same cleanup logic
                const cleanedItems = cleanBreadcrumbItems(rawItems);
                
                if (cleanedItems.length >= 2) {
                  mark('breadcrumbs', { selectors:['script[type="application/ld+json"]'], attr:'json', method:'jsonld' });
                  // Return array instead of string for better tag matching
                  return cleanedItems;
                }
              }
            }
          }
        } catch {}
      }
    } catch {}
    
    // PRIORITY 2: Semantic attributes (aria-label, role, itemprop)
    const semanticSelectors = [
      '[aria-label*="breadcrumb" i]',
      '[role="navigation"][aria-label*="breadcrumb" i]',
      'nav[aria-label*="breadcrumb" i]',
      '[itemprop="breadcrumb"]',
      'nav[role="navigation"] ol, nav[role="navigation"] ul'
    ];
    
    for (const sel of semanticSelectors) {
      const el = q(sel);
      if (el) {
        const result = extractFromLinks(el);
        if (result) {
          mark('breadcrumbs', { selectors:[sel], attr:'text', method:'semantic' });
          return result;
        }
      }
    }
    
    // PRIORITY 3: Class patterns (.breadcrumb*)
    const classSelectors = [
      '.breadcrumb, .breadcrumbs',
      '[class*="breadcrumb"]',
      'nav[class*="breadcrumb"]',
      '.woocommerce-breadcrumb',
      '.yoast-breadcrumb'
    ];
    
    for (const sel of classSelectors) {
      const el = q(sel);
      if (el) {
        const result = extractFromLinks(el);
        if (result) {
          mark('breadcrumbs', { selectors:[sel], attr:'text', method:'class-pattern' });
          return result;
        }
      }
    }
    
    // PRIORITY 4: Structural pattern (consecutive links with separators near top)
    // Look for nav/ol/ul elements in the upper portion of the page with 2-6 consecutive links
    const containers = document.querySelectorAll('nav, ol, ul, div');
    const candidates = [];
    
    for (const container of containers) {
      // Position filter: skip elements too far down (beyond 3000px typically not breadcrumbs)
      const rect = container.getBoundingClientRect();
      const scrollY = window.scrollY || window.pageYOffset;
      const absoluteTop = rect.top + scrollY;
      
      if (absoluteTop > 3000) continue; // Skip elements too far down
      
      // Skip footer/header navigation patterns
      const containerClass = (container.className || '').toLowerCase();
      const containerId = (container.id || '').toLowerCase();
      const parentClass = (container.parentElement?.className || '').toLowerCase();
      
      if (/footer|header|sidebar|menu|nav-|navigation-main|site-nav/.test(containerClass + ' ' + containerId + ' ' + parentClass)) {
        continue;
      }
      
      const links = container.querySelectorAll(':scope > a, :scope > li > a, :scope > span > a');
      if (links.length >= 2 && links.length <= 8) {
        // Detect vertical navigation (links stacked vertically)
        let isVertical = false;
        if (links.length >= 3) {
          const rects = Array.from(links).map(link => link.getBoundingClientRect());
          // Check if links are vertically stacked (Y positions differ by more than 20px)
          const yPositions = rects.map(r => Math.round(r.top));
          const uniqueYPositions = new Set(yPositions);
          
          // If most links have different Y positions, it's vertical navigation
          if (uniqueYPositions.size >= links.length * 0.7) {
            isVertical = true;
          }
        }
        
        if (isVertical) continue; // Skip vertical navigation
        
        const items = Array.from(links)
          .map(link => link.textContent.trim())
          .filter(text => text && text.length > 0 && text.length < 50);
        
        if (items.length >= 2) {
          // Reject diverse category lists that look like site navigation
          // Real breadcrumbs have hierarchical progression, not diverse categories
          const looksLikeNavigation = items.some(item => 
            /^(new|sale|shop|gifts|accessories|about|contact|blog|account|cart|checkout)$/i.test(item)
          );
          
          if (looksLikeNavigation) continue;
          
          const cleanedItems = cleanBreadcrumbItems(items);
          if (cleanedItems.length >= 2) {
            const breadcrumbText = cleanedItems.join(' > ');
            if (isValidBreadcrumb(breadcrumbText, cleanedItems.length)) {
              // Store candidate with priority based on position
              candidates.push({
                items: cleanedItems, // Store array, not string
                text: breadcrumbText,
                position: absoluteTop,
                score: absoluteTop < 500 ? 100 : (absoluteTop < 1000 ? 50 : 10)
              });
            }
          }
        }
      }
    }
    
    // Return the highest-priority candidate (top-most position)
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score || a.position - b.position);
      mark('breadcrumbs', { selectors:['structural-pattern'], attr:'text', method:'structural' });
      // Return array instead of string for better tag matching
      return candidates[0].items;
    }
    
    return null;
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
  
  function getSKU() {
    // PRIORITY 1: JSON-LD structured data (most reliable)
    try {
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse(script.textContent.trim());
          const arr = Array.isArray(data) ? data : [data];
          
          for (const node of arr) {
            const types = [].concat(node?.["@type"]||[]).map(String);
            if (types.some(t => /product/i.test(t))) {
              // Check for multiple SKU field names
              const sku = node.sku || node.productID || node.gtin13 || node.mpn || node.itemID;
              if (sku && typeof sku === 'string' && sku.trim()) {
                mark('sku', { selectors:['script[type="application/ld+json"]'], attr:'json', method:'jsonld' });
                return sku.trim();
              }
            }
          }
        } catch {}
      }
    } catch {}
    
    // PRIORITY 2: Meta tags & Microdata
    const metaSelectors = [
      'meta[itemprop="sku"]',
      'meta[itemprop="productID"]',
      'meta[property="product:sku"]',
      'meta[name="sku"]',
      '[itemprop="sku"]',
      '[itemprop="productID"]'
    ];
    
    for (const sel of metaSelectors) {
      const el = q(sel);
      if (el) {
        const sku = el.getAttribute('content') || el.textContent.trim();
        if (sku && sku.length > 0) {
          mark('sku', { selectors:[sel], attr: el.hasAttribute('content') ? 'content' : 'text', method:'meta' });
          return sku;
        }
      }
    }
    
    // PRIORITY 3: DOM data attributes (narrow to product container)
    const productContainer = q('.product, .product-detail, #product, [data-product-id], .product-info, .product-main') || document.body;
    
    const dataSelectors = [
      '[data-sku]',
      '[data-product-id]',
      '[data-itemid]',
      '[data-pid]',
      '[data-product-sku]',
      'input[name="sku"]',
      'input[name="productId"]',
      'input[type="hidden"][name*="sku" i]',
      'input[type="hidden"][name*="product" i][name*="id" i]'
    ];
    
    for (const sel of dataSelectors) {
      const el = productContainer.querySelector(sel);
      if (el) {
        const sku = el.getAttribute('data-sku') || 
                    el.getAttribute('data-product-id') || 
                    el.getAttribute('data-itemid') || 
                    el.getAttribute('data-pid') || 
                    el.getAttribute('data-product-sku') ||
                    el.value;
        if (sku && sku.trim() && sku.length > 0 && sku.length < 100) {
          mark('sku', { selectors:[sel], attr:'data', method:'dom-attr' });
          return sku.trim();
        }
      }
    }
    
    // PRIORITY 4: Text pattern matching (SKU:, Item #, Model #, etc.)
    const textContainers = productContainer.querySelectorAll('.product-details, .product-info, .sku, .item-number, .model-number, [class*="sku" i]');
    const skuPatterns = [
      /(?:SKU|Item\s*#?|Product\s*Code|Article\s*#?|Model\s*#?|UPC|MPN)[\s:]+([A-Z0-9-]{3,30})/i,
      /(?:Style\s*#?)[\s:]+([A-Z0-9-]{3,20})/i
    ];
    
    for (const container of textContainers) {
      const text = container.textContent.trim();
      for (const pattern of skuPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          mark('sku', { selectors:['.product-info'], attr:'text', method:'pattern' });
          return match[1].trim();
        }
      }
    }
    
    // PRIORITY 5: URL-based extraction (product URLs often have SKU)
    const urlPatterns = [
      /\/product\/([A-Z0-9-]+)/i,
      /\/item\/([A-Z0-9-]+)/i,
      /\/p\/([A-Z0-9-]+)/i,
      /[?&]sku=([A-Z0-9-]+)/i,
      /[?&]pid=([A-Z0-9-]+)/i
    ];
    
    for (const pattern of urlPatterns) {
      const match = location.href.match(pattern);
      if (match && match[1] && match[1].length >= 3) {
        mark('sku', { selectors:['url'], attr:'text', method:'url' });
        return match[1];
      }
    }
    
    return null;
  }
  
  function getDescription() {
    // Helper: Filter out promotional fluff
    function isPromotionalFluff(text) {
      if (!text || text.length < 20) return true; // Too short to be real description
      const fluffPatterns = /^(shop |buy |get |order |see all |view all |free shipping|sale|limited time|exclusive)/i;
      return fluffPatterns.test(text.trim());
    }
    
    // Helper: Extract text from element (including hidden accordion content)
    function extractText(el) {
      if (!el) return null;
      
      // Reject elements inside cart/bag/checkout containers
      const cartContainer = el.closest('[class*="cart" i], [id*="cart" i], [class*="bag" i], [id*="bag" i], [class*="checkout" i], [id*="checkout" i], [class*="minicart" i], [id*="minicart" i]');
      if (cartContainer) {
        debug(`🚫 REJECTED: Description element inside cart/bag/checkout container`);
        return null;
      }
      
      // Get all text content, even from hidden elements (aria-expanded="false")
      const text = el.textContent.trim();
      return text || null;
    }
    
    let metaDescription = null; // Save meta as last resort
    
    // PRIORITY 1: Data attributes (most reliable for modern sites)
    const dataAttributeSelectors = [
      '[data-testid*="description" i]',
      '[id*="description" i]:not(meta)',
      '[data-test*="description" i]',
      '[data-content*="description" i]'
    ];
    
    for (const sel of dataAttributeSelectors) {
      const el = q(sel);
      const text = extractText(el);
      if (text && !isPromotionalFluff(text) && text.length > 50) {
        debug(`✅ DESCRIPTION from data attribute: ${sel.slice(0, 50)}`);
        mark('description', { selectors:[sel], attr:'text', method:'data-attribute' });
        return text;
      }
    }
    
    // PRIORITY 2: Semantic classes and itemprop
    const semanticSelectors = [
      '.product-description',
      '[itemprop="description"]',
      '.description',
      '#description',
      '.product-details',
      '.product-info'
    ];
    
    for (const sel of semanticSelectors) {
      const el = q(sel);
      const text = extractText(el);
      if (text && !isPromotionalFluff(text) && text.length > 50) {
        debug(`✅ DESCRIPTION from semantic selector: ${sel}`);
        mark('description', { selectors:[sel], attr:'text', method:'semantic' });
        return text;
      }
    }
    
    // PRIORITY 3: Check accordion/tab sections specifically
    const accordionSelectors = [
      '[role="region"]',
      '.accordion-content',
      '.tab-content',
      '[aria-expanded]'
    ];
    
    for (const sel of accordionSelectors) {
      const elements = qa(sel);
      for (const el of elements) {
        const text = extractText(el);
        if (!text || isPromotionalFluff(text) || text.length <= 50) continue;
        
        // Check if element itself has description keywords
        const elClass = el.className || '';
        const elId = el.id || '';
        const hasDescriptionKeyword = /description/i.test(elClass + ' ' + elId);
        
        // Or check if it has a parent with description keywords
        const container = el.closest('[class*="description" i], [id*="description" i]');
        
        if (hasDescriptionKeyword || container) {
          debug(`✅ DESCRIPTION from accordion: ${sel}`);
          mark('description', { selectors:[sel], attr:'text', method:'accordion' });
          return text;
        }
      }
    }
    
    // PRIORITY 4: JSON-LD structured data
    const prod = scanJSONLDProducts()[0];
    if (prod && prod.description) {
      const text = String(prod.description).trim();
      if (!isPromotionalFluff(text) && text.length > 50) {
        debug('✅ DESCRIPTION from JSON-LD');
        mark('description', { selectors:['script[type="application/ld+json"]'], attr:'text', method:'jsonld' });
        return text;
      }
    }
    
    // PRIORITY 5: Meta tags (last resort, usually SEO fluff)
    const metaPairs = [
      ['meta[name="description"]','content'],
      ['meta[property="og:description"]','content']
    ];
    
    for (const [sel,at] of metaPairs) {
      const v = attr(q(sel),at);
      if (v && v.length > 30) {
        metaDescription = v;
        debug(`⚠️ DESCRIPTION from meta tag (fallback): ${sel}`);
        mark('description', { selectors:[sel], attr:at, method:'meta-fallback' });
        return v;
      }
    }
    
    return null;
  }
  
  function getSpecs() {
    // Helper: Extract specs from list elements
    function extractSpecsList(container) {
      const specs = [];
      const items = container.querySelectorAll('li, tr');
      
      for (const item of items) {
        const text = item.textContent.trim();
        if (text && text.length > 3 && text.length < 200) {
          // Skip promotional/navigation items
          if (!/^(shop|buy|add to|view|see|free|sale|limited)/i.test(text)) {
            specs.push(text);
          }
        }
      }
      
      return specs.length >= 2 ? specs.join('\n') : null;
    }
    
    // PRIORITY 1: Data attributes (most reliable)
    const dataAttributeSelectors = [
      '[data-testid*="spec" i]',
      '[data-testid*="specification" i]',
      '[id*="specification" i]',
      '[data-test*="spec" i]'
    ];
    
    for (const sel of dataAttributeSelectors) {
      const el = q(sel);
      if (el) {
        const specs = extractSpecsList(el);
        if (specs) {
          debug(`✅ SPECS from data attribute: ${sel.slice(0, 50)}`);
          mark('specs', { selectors:[sel], attr:'text', method:'data-attribute' });
          return specs;
        }
      }
    }
    
    // PRIORITY 2: Common class patterns
    const classSelectors = [
      '.specifications',
      '.specs',
      '.product-specs',
      '.product-specifications',
      '[class*="specification" i]',
      '[class*="specs" i]',
      '.product-attributes',
      '.product-features'
    ];
    
    for (const sel of classSelectors) {
      const el = q(sel);
      if (el) {
        const specs = extractSpecsList(el);
        if (specs) {
          debug(`✅ SPECS from class selector: ${sel}`);
          mark('specs', { selectors:[sel], attr:'text', method:'class-pattern' });
          return specs;
        }
      }
    }
    
    // PRIORITY 3: Look for bullet lists in accordion sections
    const accordions = qa('[role="region"], .accordion-content, [aria-expanded]');
    for (const accordion of accordions) {
      const container = accordion.closest('[class*="spec" i], [id*="spec" i]');
      if (container) {
        const specs = extractSpecsList(accordion);
        if (specs) {
          debug('✅ SPECS from accordion section');
          mark('specs', { selectors:['accordion-specs'], attr:'text', method:'accordion' });
          return specs;
        }
      }
    }
    
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
  // Helper: Compute actual CSS path from element (shows real container, not just 'img')
  function getElementPath(el) {
    if (!el || !el.tagName) return 'unknown';
    
    const parts = [];
    let current = el;
    let depth = 0;
    
    // Walk up to 3 levels to capture meaningful context
    while (current && depth < 3) {
      let part = current.tagName.toLowerCase();
      
      // Add ID if present (most specific)
      if (current.id) {
        part = `#${current.id}`;
        parts.unshift(part);
        break; // ID is specific enough, stop here
      }
      
      // Add first class if present (helps identify container)
      const classes = (current.className || '').toString().trim().split(/\s+/).filter(c => c);
      if (classes.length > 0) {
        part = `${part}.${classes[0]}`;
      }
      
      parts.unshift(part);
      current = current.parentElement;
      depth++;
    }
    
    return parts.join(' > ');
  }

  // ⚠️ NEW MERGED ARCHITECTURE: Complete image processing pipeline in single function ⚠️
  // Process images with complete pipeline: extraction → filtering → scoring → ranking
  // Accepts either a selector string OR an array of elements
  async function processImages(selectorOrElements, observeMs = 1200, isImgFallback = false) {
    const isElementArray = Array.isArray(selectorOrElements);
    const selector = isElementArray ? 'element-array' : selectorOrElements;
    dbg('🔍 PROCESSING IMAGES with', isElementArray ? `${selectorOrElements.length} elements` : `selector: ${selector}`, 'observeMs:', observeMs, isImgFallback ? '⚠️ IMG FALLBACK MODE' : '');
    
    // Phase 1: Lazy Loading (optional but recommended, skip if pre-collected elements)
    if (observeMs > 0 && !isElementArray) {
      dbg(`⏳ LAZY LOADING: Observing for ${observeMs}ms for lazy-loaded images...`);
      
      // Lightweight MutationObserver to catch lazy-loaded images
      const lazyLoadedUrls = [];
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === 'IMG') {
                const imgUrl = node.src || node.getAttribute('data-src');
                if (imgUrl && !lazyLoadedUrls.includes(imgUrl)) {
                  dbg(`🔍 LAZY: New img element: ${imgUrl.slice(0, 80)}`);
                  lazyLoadedUrls.push(imgUrl);
                }
              }
              const imgs = node.querySelectorAll ? node.querySelectorAll('img') : [];
              imgs.forEach(img => {
                const imgUrl = img.src || img.getAttribute('data-src');
                if (imgUrl && !lazyLoadedUrls.includes(imgUrl)) {
                  dbg(`🔍 LAZY: New nested img: ${imgUrl.slice(0, 80)}`);
                  lazyLoadedUrls.push(imgUrl);
                }
              });
            }
          });
          if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
            const imgUrl = mutation.target.src;
            if (imgUrl && !lazyLoadedUrls.includes(imgUrl)) {
              dbg(`🔍 LAZY: Src change: ${imgUrl.slice(0, 80)}`);
              lazyLoadedUrls.push(imgUrl);
            }
          }
        });
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'srcset', 'data-src', 'data-srcset', 'data-image', 'data-zoom-image', 'data-large']
      });
      
      await new Promise(resolve => setTimeout(resolve, observeMs));
      observer.disconnect();
      
      if (lazyLoadedUrls.length > 0) {
        dbg(`🎯 LAZY LOADING: Found ${lazyLoadedUrls.length} additional images`);
      }
    }
    
    // Phase 2: Element finding and filtering
    const allElements = isElementArray ? selectorOrElements : qa(selectorOrElements);
    const elements = allElements.filter(el => {
      let current = el;
      for (let i = 0; i < 3 && current; i++) {
        const className = (current.className || '').toLowerCase();
        const id = (current.id || '').toLowerCase();
        if (className.includes('related-products') || 
            className.includes('recommendations') || 
            className.includes('you-might-also-like') ||
            id.includes('related-products') ||
            id.includes('recommendations')) {
          dbg(`🚫 EXCLUDED: Recommendation container in ${current.tagName}.${className}`);
          return false;
        }
        current = current.parentElement;
      }
      return true;
    });
    
    dbg(`📊 Found ${allElements.length} total elements, ${elements.length} after filtering`);
    
    if (elements.length === 0) {
      dbg(`🚫 SKIPPING: No elements found`);
      return [];
    }
    
    // Phase 3: URL extraction with enriched metadata
    const enrichedUrls = [];
    debug(`🔍 Processing ${elements.length} image elements...`);
    
    try {
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (i < 3) debugElement(el, `Image element #${i+1}`);
        
        const attrs = {
          src: el.getAttribute('src') || el.currentSrc,
          'data-src': el.getAttribute('data-src'),
          'data-image': el.getAttribute('data-image'),
          'data-zoom-image': el.getAttribute('data-zoom-image'),
          'data-large': el.getAttribute('data-large'),
          srcset: el.getAttribute('srcset'),
          'data-srcset': el.getAttribute('data-srcset')
        };
        
        // Compute actual CSS path for better debugging (shows real container, not just 'img')
        const actualPath = getElementPath(el);
        
        // Extract from main attributes - UPGRADE CDN FIRST, then check junk
        const s1 = attrs.src || attrs['data-src'] || attrs['data-image'] || 
                   attrs['data-zoom-image'] || attrs['data-large'];
        if (s1) {
          const upgraded = upgradeCDNUrl(s1);  // ✨ UPGRADE FIRST - transforms URLs to best form
          const junkCheck = isJunkImage(upgraded, el);  // Check upgraded URL for junk
          if (!junkCheck.blocked) {
            // Flag high-quality data attributes
            const isZoomAttr = !!attrs['data-zoom-image'];
            const isLargeAttr = !!attrs['data-large'];
            enrichedUrls.push({ url: upgraded, element: el, index: i, selector: actualPath, fromZoomAttr: isZoomAttr, fromLargeAttr: isLargeAttr });
            urlToSelectorMap.set(upgraded, actualPath);
          } else {
            dbg(`❌ BLOCKED [${junkCheck.reason}]:`, upgraded.substring(upgraded.lastIndexOf('/') + 1));
          }
        }
        
        // Extract from srcset - UPGRADE CDN FIRST, then check junk
        if (attrs['data-srcset'] || attrs.srcset) {
          const best = pickFromSrcset(attrs['data-srcset'] || attrs.srcset);
          if (best) {
            const upgraded = upgradeCDNUrl(best);  // ✨ UPGRADE FIRST
            const junkCheck = isJunkImage(upgraded, el);
            if (!junkCheck.blocked) {
              enrichedUrls.push({ url: upgraded, element: el, index: i, selector: actualPath, fromSrcset: true });
              urlToSelectorMap.set(upgraded, actualPath);
            } else {
              dbg(`❌ BLOCKED [${junkCheck.reason}]:`, upgraded.substring(upgraded.lastIndexOf('/') + 1));
            }
          }
        }
        
        // Check picture parent for additional sources - UPGRADE CDN FIRST, then check junk
        if (el.parentElement && el.parentElement.tagName.toLowerCase() === 'picture') {
          for (const src of el.parentElement.querySelectorAll('source')) {
            const b = pickFromSrcset(src.getAttribute('data-srcset') || src.getAttribute('srcset'));
            if (b) {
              const upgraded = upgradeCDNUrl(b);  // ✨ UPGRADE FIRST
              const junkCheck = isJunkImage(upgraded, src);
              if (!junkCheck.blocked) {
                enrichedUrls.push({ url: upgraded, element: el, index: i, selector: actualPath, fromSrcset: true });
                urlToSelectorMap.set(upgraded, actualPath);
              }
            }
          }
        }
      }
    } catch(e) {
      console.warn('[DEBUG] processImages error:', e.message);
      dbg('❌ Image processing failed, returning empty array');
      return [];
    }
    
    dbg(`🖼️ Raw enriched URLs collected: ${enrichedUrls.length}`);
    
    // Phase 4: Deduplication + Scoring + Size Filtering (merged from hybridUniqueImages)
    debug('🔄 FILTERING & SCORING UNIQUE IMAGES...', { inputCount: enrichedUrls.length });
    const groups = new Map();
    const filtered = { empty: 0, invalid: 0, junk: 0, lowScore: 0, smallFile: 0, duplicateGroups: 0, kept: 0 };
    
    for (const enriched of enrichedUrls) {
      if (!enriched.url) {
        filtered.empty++;
        continue;
      }
      
      const abs = toAbs(enriched.url);
      
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
      
      const score = scoreImageURL(abs, enriched.element, enriched.index, isImgFallback, enriched.selector, enriched.fromSrcset, enriched.fromZoomAttr, enriched.fromLargeAttr);
      if (score < 40) {
        addImageDebugLog('debug', `📉 LOW SCORE REJECTED (${score}): ${abs.slice(0, 100)} | Found by: ${enriched.selector}`, abs, score, false);
        filtered.lowScore++;
        continue;
      }
      
      // ✅ SCORE PASSED! Now upgrade CDN URL for high-quality images
      const upgraded = upgradeCDNUrl(abs);
      urlToSelectorMap.set(upgraded, enriched.selector || selector);
      
      const canonical = canonicalKey(upgraded);
      if (!groups.has(canonical)) groups.set(canonical, []);
      groups.get(canonical).push({ url: upgraded, element: enriched.element, index: enriched.index, score, selector: enriched.selector });
    }
    
    // Select best scoring image from each group
    const bestImages = [];
    for (const [canonical, candidates] of groups) {
      if (candidates.length === 1) {
        const candidate = candidates[0];
        bestImages.push({ ...candidate, canonical });
        addImageDebugLog('debug', `✅ SINGLE IMAGE (score: ${candidate.score}): ${candidate.url.slice(0, 100)} | Found by: ${candidate.selector}`, candidate.url, candidate.score, true);
        filtered.kept++;
      } else {
        let bestCandidate = candidates.reduce((best, current) => 
          current.score > best.score ? current : best
        );
        bestImages.push({ ...bestCandidate, canonical });
        addImageDebugLog('debug', `✅ BEST OF ${candidates.length} (score: ${bestCandidate.score}): ${bestCandidate.url.slice(0, 100)} | Found by: ${bestCandidate.selector}`, bestCandidate.url, bestCandidate.score, true);
        filtered.duplicateGroups++;
        filtered.kept++;
      }
    }
    
    bestImages.sort((a, b) => a.index - b.index);
    
    // Phase 5: File size filtering
    const sizeFilteredImages = [];
    const fileSizeCheckPromises = [];
    
    for (const img of bestImages) {
      if (/(?:adoredvintage\.com|cdn-tp3\.mozu\.com|assets\.adidas\.com|cdn\.shop|shopify|cloudfront|amazonaws|scene7)/i.test(img.url)) {
        sizeFilteredImages.push(img);
        addImageDebugLog('debug', `🔒 TRUSTED CDN BYPASS: ${img.url.slice(0, 100)}`, img.url, img.score, true);
        continue;
      }
      if (img.score >= 65 && estimateFileSize(img.url) >= 15000) {
        sizeFilteredImages.push(img);
        addImageDebugLog('debug', `🎯 HIGH SCORE + SIZE OK (${img.score}): ${img.url.slice(0, 100)}`, img.url, img.score, true);
        continue;
      } else if (img.score >= 50 && /[?&](f_auto|q_auto|w[_=]\d+|h[_=]\d+)/i.test(img.url)) {
        sizeFilteredImages.push(img);
        addImageDebugLog('debug', `🔧 CDN OPTIMIZED (${img.score}): ${img.url.slice(0, 100)}`, img.url, img.score, true);
        continue;
      }
      
      const estimatedSize = estimateFileSize(img.url);
      if (estimatedSize >= 50000) {
        sizeFilteredImages.push(img);
        addImageDebugLog('debug', `📏 SIZE OK (est: ${Math.round(estimatedSize/1000)}KB): ${img.url.slice(0, 100)}`, img.url, img.score, true);
      } else if (estimatedSize >= 20000 && img.score >= 40) {
        fileSizeCheckPromises.push(
          checkFileSize(img.url).then(actualSize => ({ img, actualSize, estimatedSize }))
        );
      } else {
        addImageDebugLog('debug', `📉 TOO SMALL (est: ${Math.round(estimatedSize/1000)}KB): ${img.url.slice(0, 100)}`, img.url, img.score, false);
        filtered.smallFile++;
      }
    }
    
    // Check borderline cases
    if (fileSizeCheckPromises.length > 0) {
      debug(`📏 CHECKING ACTUAL FILE SIZES for ${fileSizeCheckPromises.length} borderline images...`);
      const sizeResults = await Promise.all(fileSizeCheckPromises);
      for (const { img, actualSize } of sizeResults) {
        if (img.score >= 65 && estimateFileSize(img.url) >= 15000) {
          sizeFilteredImages.push(img);
          addImageDebugLog('debug', `🎯 HIGH SCORE + SIZE OK (${img.score}): ${img.url.slice(0, 100)}`, img.url, img.score, true);
        } else if (img.score >= 50 && /[?&](f_auto|q_auto|w[_=]\d+|h[_=]\d+)/i.test(img.url)) {
          sizeFilteredImages.push(img);
          addImageDebugLog('debug', `🔧 CDN OPTIMIZED (${img.score}): ${img.url.slice(0, 100)}`, img.url, img.score, true);
        } else if (actualSize && actualSize >= 100000) {
          sizeFilteredImages.push(img);
          addImageDebugLog('debug', `📏 SIZE VERIFIED (${Math.round(actualSize/1000)}KB): ${img.url.slice(0, 100)}`, img.url, img.score, true);
        } else if (!actualSize && (img.score >= 95 || /\b(assets?|cdn|media)\./i.test(img.url))) {
          sizeFilteredImages.push(img);
          addImageDebugLog('debug', `📏 SIZE CHECK FAILED (CORS?) - keeping high-score/CDN: ${img.url.slice(0, 100)}`, img.url, img.score, true);
        } else if (actualSize && actualSize < 5000 && !/w[_=]\d{3,}|h[_=]\d{3,}/i.test(img.url)) {
          addImageDebugLog('debug', `📉 TRULY TINY REJECTED (${Math.round(actualSize/1000)}KB): ${img.url.slice(0, 100)}`, img.url, img.score, false);
          filtered.smallFile++;
        } else {
          sizeFilteredImages.push(img);
          addImageDebugLog('debug', `📊 BORDERLINE KEPT (${actualSize ? Math.round(actualSize/1000) : '?'}KB): ${img.url.slice(0, 100)}`, img.url, img.score, true);
        }
      }
    }
    
    // Phase 6: Pixel count competition
    const getPixelCount = (url) => {
      const dimensionalPatterns = [
        /s(\d+)x(\d+)/i,
        /(\d+)x(\d+)(?:_|\.|$)/i,
        /w(\d+)_h(\d+)/i,
        /w(\d+)xh(\d+)/i
      ];
      for (const pattern of dimensionalPatterns) {
        const match = url.match(pattern);
        if (match) return parseInt(match[1]) * parseInt(match[2]);
      }
      const shopifyMatch = url.match(/_(\d+)x/i);
      if (shopifyMatch) {
        const dimension = parseInt(shopifyMatch[1]);
        return dimension * dimension;
      }
      return 0;
    };
    
    const getBaseImageUrl = (url) => {
      return url
        .replace(/s(\d+)x(\d+)/g, '')
        .replace(/(\d+)x(\d+)(?:_|\.|$)/g, '')
        .replace(/w(\d+)_h(\d+)/g, '')
        .replace(/w(\d+)xh(\d+)/g, '')
        .replace(/_(\d+)x/g, '');
    };
    
    const imageGroups = new Map();
    sizeFilteredImages.forEach(img => {
      const baseUrl = getBaseImageUrl(img.url);
      if (!imageGroups.has(baseUrl)) imageGroups.set(baseUrl, []);
      imageGroups.get(baseUrl).push(img);
    });
    
    imageGroups.forEach(group => {
      if (group.length > 1) {
        const winner = group.reduce((max, img) => 
          getPixelCount(img.url) > getPixelCount(max.url) ? img : max
        );
        winner.score += 25;
        debug(`🏆 PIXEL WINNER: ${winner.url.substring(winner.url.lastIndexOf('/') + 1)} (+25 bonus, score now ${winner.score})`);
      }
    });
    
    // Phase 7: Final ranking (score → size → DOM order)
    sizeFilteredImages.sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      const sizeA = estimateFileSize(a.url);
      const sizeB = estimateFileSize(b.url);
      const sizeDiff = sizeB - sizeA;
      if (sizeDiff !== 0) return sizeDiff;
      return a.index - b.index;
    });
    
    debug('🏆 TOP SCORED IMAGES:', sizeFilteredImages.slice(0, 5).map(img => 
      `${img.url.substring(img.url.lastIndexOf('/') + 1)} (score: ${img.score})`));
    
    const finalImages = sizeFilteredImages.slice(0, 50);
    
    // Phase 6.5: Load images and check actual dimensions for small image penalty
    debug(`📐 LOADING IMAGES: Checking dimensions for ${finalImages.length} images...`);
    const dimensionCheckPromises = finalImages.map(async (img) => {
      try {
        const loadedImg = new Image();
        loadedImg.crossOrigin = 'anonymous';
        
        await new Promise((resolve, reject) => {
          loadedImg.onload = resolve;
          loadedImg.onerror = reject;
          setTimeout(reject, 3000); // 3s timeout per image
          loadedImg.src = img.url;
        });
        
        const width = loadedImg.naturalWidth;
        const height = loadedImg.naturalHeight;
        
        // Apply -50 penalty for small images (<400x400)
        if (width < 400 || height < 400) {
          img.score -= 50;
          debug(`📉 SMALL IMAGE PENALTY (-50): ${width}x${height} - ${img.url.substring(img.url.lastIndexOf('/') + 1)} (score now ${img.score})`);
        } else {
          debug(`✅ GOOD SIZE: ${width}x${height} - ${img.url.substring(img.url.lastIndexOf('/') + 1)}`);
        }
      } catch (e) {
        // If image fails to load, keep original score
        debug(`⚠️ DIMENSION CHECK FAILED (keeping score): ${img.url.substring(img.url.lastIndexOf('/') + 1)}`);
      }
      return img;
    });
    
    await Promise.all(dimensionCheckPromises);
    
    // Re-sort after dimension penalties
    finalImages.sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      const sizeA = estimateFileSize(a.url);
      const sizeB = estimateFileSize(b.url);
      const sizeDiff = sizeB - sizeA;
      if (sizeDiff !== 0) return sizeDiff;
      return a.index - b.index;
    });
    
    debug('🏆 TOP IMAGES AFTER DIMENSION CHECK:', finalImages.slice(0, 5).map(img => 
      `${img.url.substring(img.url.lastIndexOf('/') + 1)} (score: ${img.score})`));
    
    const finalUrls = finalImages.map(img => img.url);
    
    finalImages.forEach(img => {
      if (img.selector) urlToSelectorMap.set(img.url, img.selector);
    });
    
    if (sizeFilteredImages.length > 50) {
      addImageDebugLog('warn', `⚠️ IMAGE LIMIT REACHED (50), keeping first 50 by ranking`, '', 0, false);
    }
    
    // Phase 8: Universal ?width= upgrade for FIRST 3 URLs with ?width= pattern (dual-version strategy)
    // Scans entire list to find first 3 URLs with ?width= params, upgrades those specific ones
    debug(`🔧 PHASE 8: Scanning ${finalUrls.length} URLs to find first 3 with ?width= pattern...`);
    
    const finalUrlsWithUpgrades = [];
    let upgradesAdded = 0;
    
    for (let i = 0; i < finalUrls.length; i++) {
      const url = finalUrls[i];
      finalUrlsWithUpgrades.push(url); // Always add original
      
      // Check if this URL has ?width= pattern (and we haven't upgraded 3 yet)
      if (upgradesAdded < 3) {
        const widthMatch = url.match(/[?&]width=(\d+)/i);
        if (widthMatch) {
          const currentWidth = parseInt(widthMatch[1]);
          debug(`🔍 Found ?width=${currentWidth} at position ${i} (match #${upgradesAdded + 1})`);
          
          // Only upgrade if current width is small (≤800px)
          if (currentWidth <= 800) {
            const upgradedUrl = url.replace(/([?&])width=\d+/i, '$1width=1200');
            if (upgradedUrl !== url) {
              finalUrlsWithUpgrades.push(upgradedUrl); // Insert immediately after original
              upgradesAdded++;
              debug(`🔄 UPGRADE #${upgradesAdded}: ?width=${currentWidth} → ?width=1200 (position ${i})`);
            }
          } else {
            debug(`⏭️ Skipping ?width=${currentWidth} (already high-res)`);
          }
        }
      }
    }
    
    debug(`✅ PHASE 8 COMPLETE: Added ${upgradesAdded} upgrades, ${finalUrlsWithUpgrades.length} total URLs`);

    
    debug('🖼️ PROCESSING RESULTS:', filtered);
    debug('🖼️ FINAL IMAGES:', finalUrlsWithUpgrades.slice(0, 5).map(url => url.slice(0, 80)));
    
    // 🆕 SMART FALLBACK: If ≤4 images, combine with img fallback and re-filter
    if (finalUrlsWithUpgrades.length <= 4 && selector !== 'img') {
      debug(`⚠️ SMART FALLBACK: Only ${finalUrlsWithUpgrades.length} images, triggering img fallback...`);
      const imgFallbackUrls = await processImages('img', 0, true); // true = img fallback mode
      debug(`✅ IMG FALLBACK: Got ${imgFallbackUrls.length} additional images`);
      
      // Combine both results
      const combinedUrls = [...finalUrlsWithUpgrades, ...imgFallbackUrls];
      debug(`🔄 COMBINING: ${finalUrlsWithUpgrades.length} (gallery) + ${imgFallbackUrls.length} (img) = ${combinedUrls.length} total`);
      
      // Simple deduplication (both arrays already filtered)
      const seen = new Set();
      const dedupedUrls = [];
      for (const url of combinedUrls) {
        if (url && !seen.has(url)) {
          seen.add(url);
          dedupedUrls.push(url);
        }
      }
      
      debug(`✅ SMART FALLBACK COMPLETE: ${dedupedUrls.length} images after deduplication`);
      return dedupedUrls.slice(0, 30);
    }
    
    return finalUrlsWithUpgrades;
  }

  // NEW SIMPLIFIED ORCHESTRATOR: Selector strategy + lazy loading coordination
  async function getImagesGeneric() {
    const hostname = window.location.hostname.toLowerCase().replace(/^www\./, '');
    const callStack = new Error().stack.split('\n').slice(1, 4).map(line => line.trim()).join(' -> ');
    debug('🖼️ Getting generic images for hostname:', hostname);
    debug('📍 CALL TRACE:', callStack);
    
    // Site-specific selectors
    const siteSpecificSelectors = {
      'adoredvintage.com': ['.product-gallery img', '.rimage__img', '[class*="product-image"] img'],
      'allbirds.com': ['.product-image-wrapper img', '.ProductImages img', 'main img[src*="shopify"]'],
      'amazon.com': [
        '[data-csa-c-element-id*="image"] img',
        '[class*="ivImages"] img', 
        '[id*="ivImage"] img',
        '.iv-tab img',
        '[id*="altImages"] img',
        '[class*="imagesThumbnail"] img',
        'img[src*="images-amazon.com"]',
        'img[src*="ssl-images-amazon.com"]',
        'img[src*="m.media-amazon.com"]',
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
      const urls = await processImages(sel, 0);
      if (urls.length >= 1) {
        debug(`✅ Site-specific success: ${urls.length} images found`);
        mark('images', { selectors:[sel], attr:'src', method:'site-specific', urls: urls.slice(0,30) }); 
        return urls.slice(0,30); 
      }
    }
    
    // Collect from ALL gallery selectors (including picture/source for responsive images)
    const gallerySels = [
      '.product-media img','.gallery img','.image-gallery img','.product-images img','.product-gallery img',
      '.product_media_item img','.product__media-item img.image__img','img.image_img','img.image__img',
      '[class*=gallery] img','[class*="slider-image"] img','[class*="slider-img"] img','.thumbnails img','.pdp-gallery img','[data-testid*=image] img',
      '.big-picture img','[class*="big-picture"] img',
      '#mainProductImage','#zoomImage',
      '.product-media picture source','.gallery picture source','.product-gallery picture source','.pdp-gallery picture source',
      '.pdp-images__desktop picture source','[class*="pdp-image"] picture source',
      '[class*=gallery] picture source'
    ];
    
    // Step 1: Collect RAW elements from ALL selectors first (no processing yet)
    let allGalleryElements = [];
    const usedSelectors = [];
    for (const sel of gallerySels) {
      debug(`🎯 Collecting elements with gallery selector: '${sel}'`);
      const elements = Array.from(document.querySelectorAll(sel));
      if (elements.length > 0) {
        debug(`✅ Found ${elements.length} elements with selector: '${sel}'`);
        allGalleryElements = allGalleryElements.concat(elements);
        usedSelectors.push(sel);
      }
    }
    
    // Step 2: Process ONCE on all collected elements (scores, filters, upgrades happen once)
    if (allGalleryElements.length > 0) {
      debug(`🔄 Processing ${allGalleryElements.length} total elements from ${usedSelectors.length} selectors...`);
      const urls = await processImages(allGalleryElements, 0);
      if (urls.length > 0) {
        debug(`✅ Gallery processing complete: ${urls.length} images after scoring/filtering`);
        mark('images', { selectors: usedSelectors, attr:'src', method:'gallery-combined', urls: urls.slice(0,30) });
        return urls.slice(0,30);
      }
    }
    
    // Final fallback to broad 'img' (only if gallery found nothing)
    debug(`🖼️ All gallery selectors found nothing, falling back to broad 'img'`);
    const og = q('meta[property="og:image"]')?.content;
    const urls = await processImages('img', 0, true); // true = img fallback mode (disable position bonuses)
    const ogUpgraded = og ? upgradeCDNUrl(og) : null;
    if (ogUpgraded) {
      // Track selector for og:image fallback
      urlToSelectorMap.set(ogUpgraded, 'meta[property="og:image"]');
    }
    const combined = (ogUpgraded ? [ogUpgraded] : []).concat(urls);
    
    // Simple deduplication for final fallback
    const seen = new Set();
    const unique = [];
    for (const url of combined) {
      if (url && !seen.has(url)) {
        seen.add(url);
        unique.push(url);
      }
    }
    
    mark('images', { selectors:['img'], attr:'src', method:'generic-fallback', urls: unique.slice(0,30) });
    return unique.slice(0,30);
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
          const urls = await processImages(selector, 0);
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
      
      // Start automatic debug logging to database
      let sessionId = null;
      if (typeof window !== 'undefined' && window.startDebugLogging) {
        sessionId = window.startDebugLogging(location.href);
        log(`💾 DEBUG LOGGER: Session ${sessionId} started for ${host}`);
      }
      
      log('🚀 SCRAPE START', { host, href: location.href, mode });

      // GLOBAL FLAG: Use memory for scoring bonuses (not replacement)
      const DISABLE_MEMORY = false;
      const mem = DISABLE_MEMORY ? {} : loadMemory(host);
      
      // Store memory globally for scoring function access
      globalThis.__tg_currentMemory = mem;
      
      if (DISABLE_MEMORY) {
        debug('🚫 MEMORY DISABLED - Custom handlers take priority');
      } else {
        debug('🧠 LOADED MEMORY FOR SCORING:', {
          host,
          hasMemory: Object.keys(mem).length > 0,
          fields: Object.keys(mem),
          memoryData: mem
        });
      }

      let title=null, brand=null, description=null, price=null, breadcrumbs=null, specs=null, sku=null, images=null;

      if (mode === 'memoryOnly') {
        debug('🔒 MEMORY-ONLY MODE - using saved selectors only');
        title = await fromMemory('title', mem.title);
        brand = await fromMemory('brand', mem.brand);
        description = await fromMemory('description', mem.description);
        price = await fromMemory('price', mem.price);
        breadcrumbs = await fromMemory('breadcrumbs', mem.breadcrumbs);
        specs = await fromMemory('specs', mem.specs);
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
        
        // Wait 500ms for accordion content to render before extracting description/specs
        debug('⏳ Waiting 500ms for accordion content to render...');
        await new Promise(resolve => setTimeout(resolve, 500));
        debug('✅ Accordion render delay complete');
        
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
          breadcrumbs = await fromMemory('breadcrumbs', mem.breadcrumbs);
          debug('🍞 BREADCRUMBS FROM MEMORY:', breadcrumbs);
        }
        if (!breadcrumbs) {
          debug('🍞 BREADCRUMBS: Falling back to generic...');
          breadcrumbs = getBreadcrumbs();
          debug('🍞 BREADCRUMBS FROM GENERIC:', breadcrumbs);
        }
        
        // Extract specs (new field)
        if (!DISABLE_MEMORY) {
          specs = await fromMemory('specs', mem.specs);
          debug('📋 SPECS FROM MEMORY:', specs);
        }
        if (!specs) {
          debug('📋 SPECS: Falling back to generic...');
          specs = getSpecs();
          debug('📋 SPECS FROM GENERIC:', specs);
        }
        
        // Extract SKU (new field)
        if (!DISABLE_MEMORY) {
          sku = await fromMemory('sku', mem.sku);
          debug('🔢 SKU FROM MEMORY:', sku);
        }
        if (!sku) {
          debug('🔢 SKU: Falling back to generic...');
          sku = getSKU();
          debug('🔢 SKU FROM GENERIC:', sku);
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
        
        // PRIORITY 1: Try saved selectors (direct extraction, no scoring)
        images = [];
        if (mem.images) {
          debug('✅ Found saved selectors for images');
          images = await fromMemory('images', mem.images);
          if (images && images.length > 0) {
            debug(`🎯 Extracted ${images.length} images from saved selectors`);
          } else {
            debug('⚠️ Saved selectors returned 0 images');
            images = [];
          }
        } else {
          debug('❌ No saved selector for images');
        }
        
        // PRIORITY 2: If no saved images, try custom handler
        if (images.length === 0) {
          debug('🔧 Trying custom handler...');
          let customImages = [];
          if (typeof getCustomHandlers === 'function') {
            try {
              const ch = getCustomHandlers();
              if (ch?.images && typeof ch.images === 'function') {
                const customResult = await Promise.resolve(ch.images(document));
                if (customResult && Array.isArray(customResult)) {
                  customImages = customResult.filter(Boolean).map(url => upgradeCDNUrl(url));
                  mark('images', { selectors: ['custom'], attr: 'custom', method: 'custom-handler' });
                  debug('✅ Custom handler found ' + customImages.length + ' images');
                  images = customImages;
                }
              }
            } catch (e) { 
              debug('❌ Custom handler error:', e.message); 
            }
          }
          
          // PRIORITY 3: If still no images, use generic scraper with scoring
          if (images.length === 0) {
            debug('🔍 Falling back to generic scraper...');
            const genericImages = await getImagesGeneric();
            debug('✅ Generic scraper found ' + genericImages.length + ' images');
            images = genericImages;
          }
        }
        
        // Process and dedupe all sources
        {
          let allSources = images;
          
          // Process and dedupe all sources
          if (allSources.length === 0) {
            dbg('🚫 PIPELINE: No candidates → returning empty');
            images = [];
          } else {
            // Simple deduplication inline
            const seen = new Set();
            const unique = [];
            for (const url of allSources) {
              if (url && !seen.has(url)) {
                seen.add(url);
                unique.push(url);
              }
            }
            images = unique.slice(0, 30);
          }
          debug('🖼️ FINAL IMAGES:', { count: images.length, images: images.slice(0, 3) });
          
          // FINAL RELEVANCE GATE: Run keyword matching once on final screened list for ranking
          if (images && images.length > 1) {
            const mainProductId = findMainProductId();
            const productKeywords = getProductKeywords();
            
            if (productKeywords.length > 0) {
              debug(`🔍 FINAL RELEVANCE CHECK: Running keyword matching on ${images.length} final images`);
              debug(`🔍 Keywords: [${productKeywords.join(', ')}]`);
              debug(`🔍 Main Product ID: "${mainProductId}"`);
              
              // Apply relevance-based scoring and ranking to final list
              const scoredImages = [];
              
              for (const url of images) {
                // Ensure url is a string for safe string operations
                const urlStr = String(url || '');
                if (!urlStr) continue; // Skip empty URLs
                
                let relevanceScore = 0;
                const matchedKeywords = [];
                const scoreBreakdown = [];
                const selector = String(urlToSelectorMap.get(urlStr) || 'unknown');
                
                // 1. SELECTOR HIERARCHY SCORING (Primary filter)
                const selectorLower = selector.toLowerCase();
                if (selectorLower.match(/product-(main|gallery|primary|media)|primary-image/)) {
                  relevanceScore += 100;
                  scoreBreakdown.push('main-gallery:+100');
                } else if (selectorLower.match(/zoom|photoswipe|panzoom|swiper|splide|slide/)) {
                  relevanceScore += 75;
                  scoreBreakdown.push('carousel:+75');
                } else if (selectorLower.match(/recommendation|related|cross-sell|upsell|similar|suggested/)) {
                  relevanceScore -= 50;
                  scoreBreakdown.push('cross-sell:-50');
                }
                
                // 2. PRODUCT ID MATCH (Secondary refinement)
                if (mainProductId) {
                  const imageProductId = extractProductIdFromUrl(urlStr);
                  if (imageProductId === mainProductId) {
                    relevanceScore += 50;
                    scoreBreakdown.push('pid:+50');
                  }
                }
                
                // 3. KEYWORD MATCH (Tertiary boost)
                if (productKeywords.length > 0) {
                  const filename = urlStr.toLowerCase().replace(/[^a-z0-9]/g, ' ');
                  for (const keyword of productKeywords) {
                    if (filename.includes(keyword)) {
                      matchedKeywords.push(keyword);
                      relevanceScore += 50;
                    }
                  }
                  if (matchedKeywords.length > 0) {
                    const keywordPoints = matchedKeywords.length * 50;
                    scoreBreakdown.push(`kw:+${keywordPoints}`);
                  }
                }
                
                // Consolidated single-line log with score breakdown
                const breakdown = scoreBreakdown.length > 0 ? scoreBreakdown.join(' ') : 'no-match:0';
                debug(`🎯 Score=${relevanceScore} [${breakdown}] | ${urlStr.slice(-60)} | selector: ${selector.slice(0, 40)}`);
                
                scoredImages.push({ url: urlStr, score: relevanceScore });
              }
              
              // Sort by relevance score (highest first), keeping original order for ties
              scoredImages.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return 0; // Maintain original order for equal scores
              });
              
              const reorderedUrls = scoredImages.map(item => item.url);
              const highScoreCount = scoredImages.filter(item => item.score > 0).length;
              debug(`🎯 RELEVANCE RANKING: ${highScoreCount} with matches, scores: [${scoredImages.slice(0, 5).map(i => i.score).join(', ')}]`);
              images = reorderedUrls; // Update the final images array with ranked results
            }
          }
          
          // CONTAINER CONSENSUS: Group images by parent container to filter cross-sell/history
          if (images.length > 6) {
            debug('🏛️ CONTAINER CONSENSUS: Analyzing top 6 images for main gallery...');
            
            // Step 1: Get selectors for top 6 images
            const top6 = images.slice(0, 6);
            const containerCounts = {};
            
            for (const url of top6) {
              const selector = urlToSelectorMap.get(url);
              if (selector) {
                // Extract parent container (everything before the last ' > ')
                const lastSep = selector.lastIndexOf(' > ');
                const container = lastSep > 0 ? selector.substring(0, lastSep) : selector;
                containerCounts[container] = (containerCounts[container] || 0) + 1;
              }
            }
            
            // Step 2: Find container with 2+ matches in top 6
            let winningContainer = null;
            for (const [container, count] of Object.entries(containerCounts)) {
              if (count >= 2) {
                winningContainer = container;
                debug(`🏆 WINNING CONTAINER: "${container}" (${count} matches in top 6)`);
                break;
              }
            }
            
            // Step 3: Reorder if winning container found
            if (winningContainer) {
              const mainGallery = [];
              const others = [];
              
              for (const url of images) {
                const selector = urlToSelectorMap.get(url);
                if (selector && selector.startsWith(winningContainer)) {
                  mainGallery.push(url);
                } else {
                  others.push(url);
                }
              }
              
              images = [...mainGallery, ...others];
              debug(`🔄 CONTAINER REORDER: ${mainGallery.length} main gallery images, ${others.length} others`);
            } else {
              debug('⏭️ CONTAINER CONSENSUS: No dominant container (all <2 matches), keeping original order');
            }
          }
          
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

      // Normalize all image URLs (fix protocol-relative URLs)
      if (Array.isArray(images)) {
        images = images.map(url => {
          if (url && url.startsWith('//')) {
            return 'https:' + url;
          }
          return url;
        });
      }
      
      // Create enriched images data with selector information
      const enrichedImages = [];
      if (Array.isArray(images)) {
        images.forEach(url => {
          const selector = urlToSelectorMap.get(url) || 'unknown';
          enrichedImages.push({ url, selector });
        });
      }
      
      const payload = { 
        title, 
        brand, 
        description, 
        specs,
        sku,
        breadcrumbs,
        price, 
        url: location.href, 
        images, 
        enrichedImages,  // New field with selector information
        timestamp: new Date().toISOString(), 
        mode 
      };
      
      debug('✅ SCRAPE COMPLETE - FINAL RESULTS:', {
        title: title?.slice(0, 50),
        brand,
        description: description?.slice(0, 50),
        specs: specs?.slice(0, 50),
        breadcrumbs: breadcrumbs?.slice(0, 50),
        price,
        imageCount: images?.length || 0,
        firstImages: images?.slice(0, 3),
        selectorsUsed: __used
      });
      
      log('✅ SCRAPE SUCCESS:', {
        title: !!title,
        brand: !!brand, 
        description: !!description,
        specs: !!specs,
        breadcrumbs: !!breadcrumbs,
        price: !!price,
        images: images?.length || 0
      });
      
      globalThis.__tg_lastSelectorsUsed = __used;
      
      // Stop debug logging and save to database
      if (typeof window !== 'undefined' && window.stopDebugLogging) {
        await window.stopDebugLogging();
        log('💾 DEBUG LOGGER: Session saved to database');
      }
      
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

  // ⚠️ CRITICAL FUNCTIONALITY VALIDATION ⚠️
  // Auto-validation to detect missing critical functionality
  function validateCriticalSystems() {
    const issues = [];
    
    // Check CDN upgrade patterns
    const cdnUpgradeFunction = upgradeCDNUrl.toString();
    if (!cdnUpgradeFunction.includes('cdn-tp3.mozu.com')) {
      issues.push('CRITICAL: Mozu CDN upgrade pattern missing');
    }
    if (!cdnUpgradeFunction.includes('cdn.shocho.co')) {
      issues.push('CRITICAL: Shocho CDN upgrade pattern missing');
    }
    if (!cdnUpgradeFunction.includes('cdn/shop')) {
      issues.push('CRITICAL: Shopify CDN upgrade pattern missing');
    }
    
    // Check core functions exist
    if (typeof scoreImageURL !== 'function') {
      issues.push('CRITICAL: Image scoring function missing');
    }
    if (typeof hybridUniqueImages !== 'function') {
      issues.push('CRITICAL: Deduplication function missing');
    }
    if (typeof isJunkImage !== 'function') {
      issues.push('CRITICAL: Junk filtering function missing');
    }
    
    // Check JUNK_IMG pattern exists
    if (!JUNK_IMG || !JUNK_IMG.test) {
      issues.push('CRITICAL: Junk image pattern missing');
    }
    
    // Log validation results
    if (issues.length > 0) {
      console.error('🚨 CRITICAL SYSTEM VALIDATION FAILED:');
      issues.forEach(issue => console.error(`  - ${issue}`));
    } else {
      console.log('✅ CRITICAL SYSTEM VALIDATION PASSED: All systems intact');
    }
    
    return issues.length === 0;
  }
  
  // Run validation on load
  try {
    validateCriticalSystems();
  } catch (e) {
    console.error('🚨 VALIDATION ERROR:', e);
  }

  Object.assign(globalThis, { scrapeProduct, validateCriticalSystems });
})();