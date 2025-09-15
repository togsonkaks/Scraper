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

  // ===== UTILS (unified orchestrator utilities) =====
  const IMG_EXT_RE = /\.(jpe?g|png|webp|avif|gif)$/i;
  const MONEY_RE   = /(\$|£|€|¥)?\s?([0-9]{1,3}(?:[.,][0-9]{3})*|[0-9]+)(?:[.,]?[0-9]{2})?/g;

  function cleanText(n) {
    return (n?.textContent || '').replace(/\s+/g,' ').trim();
  }

  function jsonNum(s) {
    const n = parseFloat(String(s||'').replace(/[^\d.]/g,''));
    return isFinite(n) ? n : null;
  }

  function getJsonLd(document) {
    const out = [];
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const t = s.textContent.trim();
        if (!t) continue;
        const v = JSON.parse(t);
        out.push(v);
      } catch {}
    }
    return out;
  }
  function findProductNode(ld) {
    for (const j of ld) {
      if (!j) continue;
      if (j['@type'] === 'Product') return j;
      if (Array.isArray(j['@graph'])) {
        const p = j['@graph'].find(n => n && n['@type'] === 'Product');
        if (p) return p;
      }
    }
    return null;
  }

  // --- price helpers ---
  function pickLowestNumber(str) {
    if (!str) return null;
    let best = null;
    for (const m of String(str).matchAll(MONEY_RE)) {
      const n = parseFloat(m[0].replace(/[^\d.]/g,''));
      if (!isNaN(n)) best = (best==null || n < best) ? n : best;
    }
    return best;
  }
  function numberFromAttrs(el) {
    if (!el) return null;
    const candidates = [
      el.getAttribute('content'),
      el.getAttribute('data-price'),
      el.getAttribute('aria-label'),
      el.getAttribute('aria-valuetext'),
    ].filter(Boolean).join(' ');
    return pickLowestNumber(candidates);
  }
  function scanAncestorForPrice(el, maxHops=3) {
    let cur = el;
    for (let i=0; i<=maxHops && cur; i++, cur = cur.parentElement) {
      const val = pickLowestNumber(cleanText(cur));
      if (val != null) return val;
    }
    return null;
  }

  // --- image helpers ---
  function collectImgCandidates(root, variantContext = null) {
    // Use active gallery root if variant context is provided
    if (variantContext?.activeGalleryRoot && variantContext.activeGalleryRoot !== document) {
      root = variantContext.activeGalleryRoot;
      debug(`🎯 Using active gallery root for collection: ${root.className || root.tagName}`);
    }
    
    // Progressive fallback relaxation system
    let fallbackLevel = 0; // 0 = strict, 1 = no slide checks, 2 = no variant checks
    let finalResults = [];
    
    while (fallbackLevel <= 2 && finalResults.length < 3) {
      const list = [];
      const enrichedList = [];
      
      debug(`🔄 COLLECTION ATTEMPT (level ${fallbackLevel}):`, {
        checkVisibility: true,
        checkSlides: fallbackLevel < 1,
        checkVariants: fallbackLevel < 2,
        target: '≥3 images'
      });
      
      // Helper to check if element should be included (with progressive relaxation)
      const shouldIncludeElement = (el, url) => {
        // Always check visibility (never relax this)
        if (!isVisibleElement(el)) {
          debug(`⏭️ SKIP invisible element: ${url?.slice(0, 50)}`);
          return false;
        }
        
        // Check if element is in active slide (relax at level 1+)
        if (fallbackLevel < 1 && !isActiveSlideElement(el)) {
          debug(`⏭️ SKIP inactive slide: ${url?.slice(0, 50)}`);
          return false;
        }
        
        // Check variant match if context available (relax at level 2+)
        if (fallbackLevel < 2 && variantContext?.selectedVariantKey && url) {
          if (!isVariantMatch(url, variantContext.selectedVariantKey)) {
            debug(`⏭️ SKIP variant mismatch: ${url?.slice(0, 50)} (want: ${variantContext.selectedVariantKey})`);
            return false;
          }
        }
        
        return true;
      };
      
      // Target picture elements first (where the gold is!)
      for (const picture of root.querySelectorAll('picture')) {
        if (!shouldIncludeElement(picture)) continue;
        
        for (const source of picture.querySelectorAll('source[srcset]')) {
          const srcset = source.getAttribute('srcset');
          if (srcset) {
            // Get the largest from srcset
            const urls = srcset.split(',').map(item => {
              const parts = item.trim().split(/\s+/);
              return { url: parts[0], descriptor: parts[1] || '' };
            });
            // Prefer largest by descriptor (2000w > 1000w) or last as fallback
            const largest = urls.sort((a, b) => {
              const aW = parseInt(a.descriptor.replace('w', '')) || 0;
              const bW = parseInt(b.descriptor.replace('w', '')) || 0;
              return bW - aW;
            })[0];
            
            if (largest?.url && shouldIncludeElement(picture, largest.url)) {
              list.push(largest.url);
              enrichedList.push({ url: largest.url, element: picture, source: 'picture-srcset' });
              debug(`✅ INCLUDED picture srcset: ${largest.url.slice(0, 80)}`);
            }
          }
        }
        
        // Also check img inside picture as fallback
        const img = picture.querySelector('img');
        if (img) {
          const src = img.getAttribute('src');
          if (src && shouldIncludeElement(img, src)) {
            list.push(src);
            enrichedList.push({ url: src, element: img, source: 'picture-img' });
            debug(`✅ INCLUDED picture img: ${src.slice(0, 80)}`);
          }
        }
      }

      // Regular img elements (but prefer picture elements above)
      for (const img of root.querySelectorAll('img:not(picture img)')) {
        if (!shouldIncludeElement(img)) continue;
        
        const src = img.getAttribute('src');
        if (src && shouldIncludeElement(img, src)) {
          list.push(src);
          enrichedList.push({ url: src, element: img, source: 'img-src' });
          debug(`✅ INCLUDED img src: ${src.slice(0, 80)}`);
        }
        
        const srcset = img.getAttribute('srcset');
        if (srcset) {
          const urls = srcset.split(',').map(item => {
            const parts = item.trim().split(/\s+/);
            return { url: parts[0], descriptor: parts[1] || '' };
          });
          const largest = urls.sort((a, b) => {
            const aW = parseInt(a.descriptor.replace('w', '')) || 0;
            const bW = parseInt(b.descriptor.replace('w', '')) || 0;
            return bW - aW;
          })[0];
          
          if (largest?.url && shouldIncludeElement(img, largest.url)) {
            list.push(largest.url);
            enrichedList.push({ url: largest.url, element: img, source: 'img-srcset' });
            debug(`✅ INCLUDED img srcset: ${largest.url.slice(0, 80)}`);
          }
        }
      }
      
      // CSS background-image (common in sliders)
      const bgElems = root.querySelectorAll('[style*="background-image"]');
      for (const el of bgElems) {
        if (!shouldIncludeElement(el)) continue;
        
        const m = (el.getAttribute('style')||'').match(/url\((['"]?)(.*?)\1\)/);
        if (m && m[2] && shouldIncludeElement(el, m[2])) {
          list.push(m[2]);
          enrichedList.push({ url: m[2], element: el, source: 'bg-image' });
          debug(`✅ INCLUDED bg-image: ${m[2].slice(0, 80)}`);
        }
      }
      
      const currentResults = enrichedList.length > 0 ? enrichedList : list.map(url => ({ url, element: null, source: 'legacy' }));
      
      debug(`📊 COLLECTION LEVEL ${fallbackLevel} RESULTS:`, {
        found: currentResults.length,
        target: 3,
        sufficientImages: currentResults.length >= 3
      });
      
      // If we have enough images, use these results
      if (currentResults.length >= 3) {
        finalResults = currentResults;
        debug(`✅ SUCCESS at fallback level ${fallbackLevel}:`, {
          images: finalResults.length,
          variantFiltering: fallbackLevel < 2 ? 'enabled' : 'disabled',
          slideFiltering: fallbackLevel < 1 ? 'enabled' : 'disabled'
        });
        break;
      }
      
      // Save current results and try next level
      if (currentResults.length > finalResults.length) {
        finalResults = currentResults;
      }
      
      // Log fallback progression
      if (fallbackLevel === 0 && currentResults.length < 3) {
        debug(`🔄 RELAXING CONSTRAINTS: Removing active-slide requirement (${currentResults.length} < 3 images)`);
      } else if (fallbackLevel === 1 && currentResults.length < 3) {
        debug(`🔄 RELAXING CONSTRAINTS: Removing variant-match requirement (${currentResults.length} < 3 images)`);
      }
      
      fallbackLevel++;
    }
    
    debug(`🖼️ FINAL VARIANT-AWARE COLLECTION:`, {
      images: finalResults.length,
      fallbackLevel: Math.max(0, fallbackLevel - 1),
      variantKey: variantContext?.selectedVariantKey,
      galleryRoot: variantContext?.activeGalleryRoot?.className || 'document'
    });
    
    return finalResults;
  }
  function filterImageUrls(urls=[]) {
    const seen = new Set();
    const out  = [];
    for (let item of urls) {
      if (!item) continue;
      
      // Handle both string URLs and enriched objects {url, element, source}
      const u = typeof item === 'string' ? item : (item.url || null);
      if (!u) continue;
      
      if (!/^https?:/i.test(u)) continue;
      if (u.startsWith('data:')) continue;
      const bare = String(u).split('?')[0];
      if (!IMG_EXT_RE.test(bare)) continue;
      if (/(sprite|logo|icon|badge|swatch|poster|play|video|360|favicon)/i.test(bare)) continue;

      // canonicalize filename (strip simple CDN transforms)
      const key = bare.replace(/\/(?:cache|fit|transform|w_\d+|h_\d+)\/.+?\//g, '/');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(u);
    }
    return out.slice(0, 20);
  }
  function isGoodImages(arr){ return Array.isArray(arr) && arr.length >= 3; }

  /* ---------- UNIVERSAL IMAGE CONSTANTS (LQIP-aware) ---------- */
  // ---- UNIVERSAL SIZE HINT REGEXES (comprehensive CDN support) ----
  const RX_SRCSET_W   = /\s(\d{2,4})w(?:\s|$)/i;                       // "2000w"
  const RX_W_SEG      = /(?:^|\/)[whmwx][_ -]?(\d{2,4})(?=[\/._-]|$)/i;// "/w_375/" "/h-800" "/x1200"
  const RX_W_QS       = /[?&](?:im?width|mw|maxw?|w|wid|width)=(\d{2,4})\b/i;
  const RX_H_QS       = /[?&](?:h|height)=(\d{2,4})\b/i;
  const RX_SIZE_SEG   = /(?:^|\/)(\$size_|\$Size_|Size[_-])(\d{3,4})(?=\/|$)/i;  // "/Size_2000/" or "/$size_2000/"
  const RX_PAIR_X     = /(?:^|[\W_])(\d{3,4})[x×](\d{3,4})(?:[\W_]|$)/i;// "2000x2000" "800x1200"
  const RX_AMZ_SX     = /[_-]SX(\d{2,4})[_-]/i;                        // "SX679" (Amazon)
  const RX_CLOUDINARY = /\/upload\/[^/]*?w_(\d{2,4})/i;                 // Cloudinary "w_2000"
  const RX_IMGIX_QS   = /[?&](?:auto=[^&]*&)?w=(\d{2,4})\b/i;          // imgix
  const RX_AEM_IMW    = /[?&](?:imwidth|width)=(\d{2,4})\b/i;          // Adobe AEM
  const RX_SHOPIFY    = /_(\d{3,4})x\.\w+\b/i;                          // Shopify "_2000x.jpg"

  // Universal size extraction - returns { w, h, confidence, reasons:[] }
  function estimateSizeFromHints(url, srcsetItem = '') {
    let w = 0, h = 0, conf = 0; const reasons = [];

    const take = (val, bonus, reason) => {
      if (val && val > w) { w = val; conf += bonus; reasons.push(reason + ':' + val); }
    };

    // Highest confidence first
    let m;
    if ((m = url.match(RX_SIZE_SEG)))    take(+m[2], 6, 'Size_####');
    if ((m = srcsetItem.match(RX_SRCSET_W))) take(+m[1], 5, 'srcset ####w');
    if ((m = url.match(RX_PAIR_X)))      { take(+m[1], 5, 'pairX'); h = +m[2]; }
    if ((m = url.match(RX_CLOUDINARY)))  take(+m[1], 4, 'cloudinary w_');
    if ((m = url.match(RX_SHOPIFY)))     take(+m[1], 4, 'shopify _####x');
    if ((m = url.match(RX_W_SEG)))       take(+m[1], 3, 'path w_####/h_####');
    if ((m = url.match(RX_W_QS)))        take(+m[1], 3, 'qs w=');
    if ((m = url.match(RX_IMGIX_QS)))    take(+m[1], 3, 'imgix w=');
    if ((m = url.match(RX_AEM_IMW)))     take(+m[1], 3, 'aem width=');
    if ((m = url.match(RX_AMZ_SX)))      take(+m[1], 2, 'amazon SX####');
    if ((m = url.match(RX_H_QS)))        { h = +m[1]; conf += 1; reasons.push('qs h=' + h); }

    return { w, h, confidence: conf, reasons };
  }

  // Junk detection patterns  
  const JUNK_HINTS_NEW = ['/thumb', '/thumbnail', '/mini', '/sprite', '/logo', '/banner', '/icon', '/swatch', '/color', '/placeholder', '/poster', '/360/', '/video'];
  
  function looksLikeJunk(url) { 
    const u = url.toLowerCase(); 
    return JUNK_HINTS_NEW.some(h => u.includes(h)); 
  }

  /* ---------- VARIANT CONTEXT RESOLVER ---------- */
  // Detects the currently selected product variant to target precise images
  
  function createVariantContext() {
    const ctx = {
      selectedVariantKey: null,
      activeGalleryRoot: null,
      detectionMethod: 'none',
      debugInfo: []
    };
    
    // 1. Detect selected variant from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const urlVariant = urlParams.get('variant') || urlParams.get('color') || urlParams.get('variantId');
    if (urlVariant) {
      ctx.selectedVariantKey = normalizeVariantKey(urlVariant);
      ctx.detectionMethod = 'url_param';
      ctx.debugInfo.push(`URL variant: ${urlVariant} -> ${ctx.selectedVariantKey}`);
    }
    
    // 2. Detect from URL path (e.g., /product/black, /earbuds-black)
    if (!ctx.selectedVariantKey) {
      const pathColors = ['black', 'white', 'blue', 'red', 'green', 'pink', 'gold', 'silver', 'gray', 'grey', 'bone', 'plasma', 'leopard', 'primer'];
      const path = window.location.pathname.toLowerCase();
      for (const color of pathColors) {
        if (path.includes(`-${color}`) || path.includes(`_${color}`) || path.includes(`/${color}`)) {
          ctx.selectedVariantKey = color;
          ctx.detectionMethod = 'url_path';
          ctx.debugInfo.push(`Path variant: ${color}`);
          break;
        }
      }
    }
    
    // 3. Detect from active DOM elements (swatches, selects)
    if (!ctx.selectedVariantKey) {
      const activeSwatches = [
        'input[type="radio"]:checked[name*="color"]',
        'input[type="radio"]:checked[name*="variant"]',
        '[aria-selected="true"][data-color]',
        '[aria-selected="true"][data-variant]',
        '.selected[data-color]',
        '.active[data-variant]',
        '.is-selected[data-color]',
        'select[name*="variant"] option:checked',
        'select[name*="color"] option:checked'
      ];
      
      for (const sel of activeSwatches) {
        const el = document.querySelector(sel);
        if (el) {
          const variant = el.getAttribute('data-color') || el.getAttribute('data-variant') || 
                         el.getAttribute('value') || el.textContent?.trim();
          if (variant) {
            ctx.selectedVariantKey = normalizeVariantKey(variant);
            ctx.detectionMethod = 'dom_active';
            ctx.debugInfo.push(`DOM active: ${sel} -> ${variant} -> ${ctx.selectedVariantKey}`);
            break;
          }
        }
      }
    }
    
    // 4. Detect from platform-specific JSON (Shopify, WooCommerce)
    if (!ctx.selectedVariantKey) {
      try {
        // Shopify
        if (window.ShopifyAnalytics?.meta?.selectedVariantId) {
          const variantId = window.ShopifyAnalytics.meta.selectedVariantId;
          ctx.selectedVariantKey = String(variantId);
          ctx.detectionMethod = 'shopify_analytics';
          ctx.debugInfo.push(`Shopify variant ID: ${variantId}`);
        }
        
        // Check for Shopify product JSON
        const productScript = document.querySelector('script[data-product-json]');
        if (productScript && !ctx.selectedVariantKey) {
          const productData = JSON.parse(productScript.textContent);
          if (productData.selected_or_first_available_variant?.id) {
            ctx.selectedVariantKey = String(productData.selected_or_first_available_variant.id);
            ctx.detectionMethod = 'shopify_product_json';
            ctx.debugInfo.push(`Shopify product JSON variant: ${ctx.selectedVariantKey}`);
          }
        }
      } catch (e) {
        ctx.debugInfo.push(`Platform JSON error: ${e.message}`);
      }
    }
    
    // 5. Find active gallery root
    ctx.activeGalleryRoot = findActiveGalleryRoot();
    
    debug('🎯 VARIANT CONTEXT:', ctx);
    return ctx;
  }
  
  function normalizeVariantKey(variant) {
    if (!variant) return null;
    return String(variant).toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/^(method360|stilla|attract)/, '') // Remove product prefixes
      .substring(0, 20); // Limit length
  }
  
  function findActiveGalleryRoot() {
    // Look for the main product gallery container
    const candidates = [
      '.swa-pdp-grid__carousel-area', // Swarovski
      '.product-single__photos', // Shopify
      '.product-gallery',
      '.product-images',
      '.product-media',
      '.gallery-wrap',
      '.image-gallery',
      '.pdp-gallery',
      '[class*="ProductMedia"]', // Target
      '[data-testid*="image"]',
      '.slick-slider:not(.product-recommendations)', // Slick but not related products
      '.swiper-container:not(.related-products)',
      '.main-product-slider'
    ];
    
    for (const sel of candidates) {
      const gallery = document.querySelector(sel);
      if (gallery && isVisibleElement(gallery)) {
        debug(`📍 Active gallery root found: ${sel}`);
        return gallery;
      }
    }
    
    // Fallback: find gallery near title/price
    const title = document.querySelector('h1, .product-title, [itemprop="name"]');
    if (title) {
      const nearbyGallery = title.closest('main, .product, .pdp')?.querySelector('.gallery, .product-images, .slider');
      if (nearbyGallery) {
        debug('📍 Active gallery root found near title');
        return nearbyGallery;
      }
    }
    
    debug('⚠️ No active gallery root found, using document');
    return document;
  }
  
  function isVisibleElement(el) {
    if (!el) return false;
    if (el.offsetParent === null) return false; // Hidden
    if (el.style.display === 'none') return false;
    if (el.style.visibility === 'hidden') return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if (el.getBoundingClientRect().width === 0) return false;
    return true;
  }
  
  function extractVariantKeyFromUrl(url) {
    if (!url) return null;
    
    // Extract variant indicators from image URL
    const patterns = [
      /[-_](black|white|blue|red|green|pink|gold|silver|gray|grey|bone|plasma|leopard|primer)(?:[-_.]|$)/i,
      /method360[-_]([\w]+)/i, // Skullcandy patterns
      /stilla[-_]([\w]+)/i, // Swarovski patterns  
      /\/(\w+)[-_](\w+)[-_](\w+)\//i // General product_variant_color pattern
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return normalizeVariantKey(match[1]);
      }
    }
    
    return null;
  }
  
  function isVariantMatch(url, selectedVariantKey) {
    if (!selectedVariantKey) return true; // No variant detected, include all
    
    const urlVariantKey = extractVariantKeyFromUrl(url);
    if (!urlVariantKey) return true; // No variant in URL, probably generic
    
    return urlVariantKey === selectedVariantKey;
  }
  
  function isActiveSlideElement(el) {
    if (!el) return true; // Default to include
    
    // Check if element is in an active slide
    const activeSlideClasses = [
      'slick-current', 'slick-active',
      'swiper-slide-active', 'swiper-slide-next', 'swiper-slide-prev',
      'fotorama__active', 'fotorama__loaded--img',
      'flex-active-slide',
      'is-selected', 'is-active',
      'active', 'current'
    ];
    
    // Check element and its ancestors for active slide indicators
    let current = el;
    for (let i = 0; i < 5 && current; i++) {
      // Check if this element has active classes
      if (activeSlideClasses.some(cls => current.classList?.contains(cls))) {
        return true;
      }
      
      // Check if this element is marked as selected
      if (current.getAttribute('aria-selected') === 'true') {
        return true;
      }
      
      current = current.parentElement;
    }
    
    // If no active indicators found, check visibility
    return isVisibleElement(el);
  }

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
    if (/\b(mozu\.com|shopify\.com|cloudinary\.com|imgix\.net|fastly\.com|amazonaws\.com\/.*\/(images?|media|assets)|cloudfront\.net|asos-media\.com|scene7\.com|swarovski\.com|asset\.swarovski\.com)\b/i.test(u)) return true;
    
    // Image-related paths (expanded)
    if (/\/(images?|media|assets|photos?|pics?|gallery|products)\//i.test(u)) return true;
    
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
  
  // Estimate file size from URL patterns (fast approximation)
  function estimateFileSize(url) {
    // Use universal size extraction for better estimates
    const { w } = estimateSizeFromHints(url);
    
    if (w > 0) {
      // Width-based estimates with CDN awareness
      const isCDN = /(?:swarovski|adoredvintage|alicdn|amazonaws|shopifycdn|akamaized|fastly|cloudfront|imgix|cloudinary|scene7|asos-media|cdn-tp3\.mozu|assets\.adidas)\.com/i.test(url);
      
      if (w >= 2000) return 200000; // ~200KB for very large
      if (w >= 1200) return 150000; // ~150KB for large images
      if (w >= 800) return 100000;  // ~100KB for medium-large
      if (w >= 400) return isCDN ? 80000 : 50000;   // CDN: ~80KB, others: ~50KB for medium
      if (w >= 200) return isCDN ? 60000 : 25000;    // CDN: ~60KB, others: ~25KB for small
      return 8000; // ~8KB for tiny
    }
    
    // Fallback estimates
    if (/\.(jpg|jpeg)($|\?)/i.test(url)) return 80000;   // ~80KB default JPG
    if (/\.(png)($|\?)/i.test(url)) return 100000;       // ~100KB default PNG
    if (/\.(webp)($|\?)/i.test(url)) return 50000;       // ~50KB default WebP
    if (/\.(gif)($|\?)/i.test(url)) return 20000;        // ~20KB default GIF
    
    return 50000; // ~50KB default
  }

  // Enhanced canonical grouping for LQIP variant detection
  function canonicalKey(url) {
    try {
      const u = new URL(url);
      // Strip all size/format/quality transforms
      ['w','width','h','height','fit','auto','q','quality','fm','format'].forEach(p => u.searchParams.delete(p));
      
      let path = u.pathname;
      // Normalize size containers and transforms for variant grouping
      path = path.replace(/\/(\$size_|\$Size_|Size[_-])\d{3,4}\//ig, '/Size_XXXX/')
                 .replace(/\/w[_-]\d{2,4}(?=\/|\.|_|-)/ig, '/w_XX')
                 .replace(/_\d{3,4}x\./ig, '_XXXx.')
                 .replace(/[_-]SX\d{2,4}[_-]/ig, '_SXXX_');
      
      return `${u.host}${path}`;
    } catch { 
      return url.replace(/[?#].*$/, ''); 
    }
  }

  // Universal image scoring with LQIP awareness 
  function scoreImageURL(url, element = null, elementIndex = 0, srcsetItem = '') {
    if (!url) return 0;
    
    const { w, confidence } = estimateSizeFromHints(url, srcsetItem);
    let score = 50; // Base score

    // Size bonus/penalty from *any* hint we detected (CRITICAL FIX)
    if (w >= 2000) score += 40;
    else if (w >= 1600) score += 30;
    else if (w >= 1200) score += 20;
    else if (w >= 800)  score += 10;
    else if (w > 0 && w < 450) score -= 50;     // Red-flag small thumbs (LQIP detection)

    // Double-bonus if we saw the very strong Size_#### path
    if (/\/(\$size_|\$Size_|Size[_-])(?:2000|1600|1440|1080)\//i.test(url)) score += 20;

    // Vendor "w_####" that's still big gets some love too
    if (/\/w[_-](?:2000|1600|1440|1200)(?:[\/._-]|$)/i.test(url)) score += 12;

    // Junk/UI elements sink
    if (looksLikeJunk(url)) score -= 60;

    // Position bias for first few gallery images (but gated by size)
    if (elementIndex <= 2 && (w === 0 || w >= 500)) score += 18; 
    else if (elementIndex <= 6 && (w === 0 || w >= 500)) score += 8;

    // Quality bonuses (gated by size to prevent small images getting bonuses)
    if (w === 0 || w >= 500) {
      if (/\.(webp|avif)($|\?)/i.test(url)) score += 10;
      if (/(format|fm)=(webp|avif)/i.test(url)) score += 10;
      if (/f_auto/i.test(url)) score += 8; // Cloudinary auto format
      
      // CDN bonuses
      if (/\b(assets?|static|cdn|media|img)\./i.test(url)) score += 15;
      if (/\b(swarovski\.com|asset\.swarovski\.com|cloudinary\.com|imgix\.net|shopify\.com)\b/i.test(url)) score += 15;
    }

    // Confidence tiebreaker
    score += Math.min(confidence, 8);

    // Aggressive penalties for UI/navigation elements
    if (/\b(banner|logo|bg|background|header|footer|nav|navigation|menu)\b/i.test(url)) score -= 50;
    if (/\b(sprite|icon|badge|placeholder|loading|spinner)\b/i.test(url)) score -= 80;
    
    // Element-based context
    if (element) {
      const className = element.className || '';
      const id = element.id || '';
      const combined = (className + ' ' + id).toLowerCase();
      
      if (/\b(main|hero|primary|featured|product-image|gallery-main)\b/i.test(combined)) score += 20;
      if (/\b(thumb|thumbnail|small|mini|icon)\b/i.test(combined)) score -= 30;
    }

    return Math.max(0, score);
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

  // LQIP-aware hybrid unique images with adaptive filtering (OVERRIDE)
  async function hybridUniqueImages(enrichedUrls, variantContext = null) {
    debug('🔄 HYBRID FILTERING UNIQUE IMAGES...', { inputCount: enrichedUrls.length, variantKey: variantContext?.selectedVariantKey });
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
      
      // Apply score threshold (minimum 30 points - lowered for LQIP cases)
      const score = scoreImageURL(abs, enriched.element, enriched.index);
      if (score < 30) {
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
    
    // Select best scoring image from each group, with LQIP awareness
    const bestImages = [];
    for (const [canonical, candidates] of groups) {
      if (candidates.length === 1) {
        // Only one candidate, use it
        const candidate = candidates[0];
        bestImages.push({ ...candidate, canonical });
        addImageDebugLog('debug', `✅ SINGLE IMAGE (score: ${candidate.score}): ${candidate.url.slice(0, 100)}`, candidate.url, candidate.score, true);
        filtered.kept++;
      } else {
        // Multiple candidates - prefer high-quality over LQIP
        const { w: width } = estimateSizeFromHints(candidates[0].url);
        const nonLQIP = candidates.filter(c => {
          const { w } = estimateSizeFromHints(c.url);
          return w === 0 || w >= 450; // Non-LQIP candidates
        });
        
        let bestCandidate;
        if (nonLQIP.length > 0) {
          // Pick highest scoring non-LQIP
          bestCandidate = nonLQIP.reduce((best, current) => 
            current.score > best.score ? current : best
          );
        } else {
          // All are LQIP, pick highest score
          bestCandidate = candidates.reduce((best, current) => 
            current.score > best.score ? current : best
          );
        }
        
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
    
    // Adaptive file size filtering with LQIP awareness
    const sizeFilteredImages = [];
    
    for (const img of bestImages) {
      const { w } = estimateSizeFromHints(img.url);
      
      // Trusted CDNs bypass size checks
      if (/(?:swarovski\.com|asset\.swarovski\.com|adoredvintage\.com|cdn-tp3\.mozu\.com|assets\.adidas\.com|cdn\.shop|shopify|cloudfront|amazonaws|scene7)/i.test(img.url)) {
        sizeFilteredImages.push(img);
        addImageDebugLog('debug', `🔒 TRUSTED CDN BYPASS: ${img.url.slice(0, 100)}`, img.url, img.score, true);
        continue;
      }
      
      // High scores bypass size checks 
      if (img.score >= 70) {
        sizeFilteredImages.push(img);
        addImageDebugLog('debug', `🎯 HIGH SCORE BYPASS (${img.score}): ${img.url.slice(0, 100)}`, img.url, img.score, true);
        continue;
      }
      
      // Adaptive size thresholds based on detected width
      const estimatedSize = estimateFileSize(img.url);
      let threshold = 20000; // Default 20KB
      
      if (w >= 1200) threshold = 60000;      // 60KB for large
      else if (w >= 800) threshold = 40000;  // 40KB for medium-large  
      else if (w >= 400) threshold = 20000;  // 20KB for medium
      else threshold = 10000;                // 10KB for small
      
      if (estimatedSize >= threshold) {
        sizeFilteredImages.push(img);
        addImageDebugLog('debug', `📏 SIZE OK (${Math.round(estimatedSize/1000)}KB≥${Math.round(threshold/1000)}KB): ${img.url.slice(0, 100)}`, img.url, img.score, true);
      } else {
        addImageDebugLog('debug', `📉 TOO SMALL (${Math.round(estimatedSize/1000)}KB<${Math.round(threshold/1000)}KB): ${img.url.slice(0, 100)}`, img.url, img.score, false);
        filtered.smallFile++;
      }
    }
    
    // Safety fallback: if no images remain, return top 3 by score
    if (sizeFilteredImages.length === 0 && bestImages.length > 0) {
      const topByScore = bestImages.sort((a, b) => b.score - a.score).slice(0, 3);
      sizeFilteredImages.push(...topByScore);
      addImageDebugLog('warn', `⚠️ SAFETY FALLBACK: Returning top ${topByScore.length} by score`, '', 0, false);
    }
    
    // Sort by score (highest first) and limit
    sizeFilteredImages.sort((a, b) => b.score - a.score);
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
  
  async function gatherImagesBySelector(sel, variantContext = null) {
    debug('🔍 GATHERING IMAGES with selector:', sel);
    
    // Create variant context if not provided
    if (!variantContext) {
      variantContext = createVariantContext();
    }
    
    const elements = qa(sel);
    debug(`📊 Found ${elements.length} elements for selector:`, sel);
    
    const enrichedUrls = []; // Now includes element info
    
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      debugElement(el, `Image element ${i}`);
      
      // Use the enhanced collectImgCandidates on the element's container
      // This ensures consistent picture/srcset parsing
      const container = el.closest('picture') || el.parentElement || el;
      const urls = collectImgCandidates(container, variantContext);
      
      debug(`🔗 Found ${urls.length} URLs for element ${i}:`, urls.slice(0, 3));
      
      // Handle enriched format from collectImgCandidates
      if (urls.length > 0 && typeof urls[0] === 'object' && urls[0].url) {
        // Already enriched format
        urls.forEach((enriched, idx) => {
          enrichedUrls.push({ 
            url: enriched.url, 
            element: enriched.element || el, 
            index: i,
            source: enriched.source 
          });
        });
      } else {
        // Legacy format - convert to enriched
        urls.forEach(url => {
          if (url) {
            enrichedUrls.push({ url, element: el, index: i, source: 'legacy' });
          }
        });
      }
      
      // Also check the element itself for data attributes (with variant filtering)
      const dataAttrs = {
        'data-src': el.getAttribute('data-src'),
        'data-image': el.getAttribute('data-image'), 
        'data-zoom-image': el.getAttribute('data-zoom-image'),
        'data-large': el.getAttribute('data-large')
      };
      
      for (const [attr, value] of Object.entries(dataAttrs)) {
        if (value) {
          // Apply variant filtering to data attributes too
          if (variantContext?.selectedVariantKey && !isVariantMatch(value, variantContext.selectedVariantKey)) {
            debug(`⏭️ SKIP data attr variant mismatch: ${attr}=${value.slice(0, 50)}`);
            continue;
          }
          
          debug(`✅ Found ${attr}:`, value.slice(0, 100));
          enrichedUrls.push({ url: value, element: el, index: i, source: attr });
        }
      }
    }
    
    debug(`🖼️ Raw enriched URLs collected: ${enrichedUrls.length}`);
    const filtered = await hybridUniqueImages(enrichedUrls, variantContext);
    debug(`🖼️ After hybrid filtering: ${filtered.length} images`);
    
    return filtered;
  }

  /* ---------- MEMORY RESOLUTION ---------- */
  async function fromMemory(field, memEntry, variantContext = null) {
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
      const prod = findProductNode(getJsonLd(document));
      
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
          const urls = await gatherImagesBySelector(sel, variantContext);
          if (urls.length) { 
            debug(`✅ MEMORY IMAGES SUCCESS: ${urls.length} variant-filtered images found`);
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
    log('📝 [ORCHESTRATOR] Calling getTitle()...');
    const sels = ['h1', '.product-title', '[itemprop="name"]'];
    log('📝 [ORCHESTRATOR] Trying selectors:', sels);
    for (const sel of sels) { 
      const el = q(sel);
      const v = txt(el); 
      log(`📝 [ORCHESTRATOR] Selector "${sel}":`, el ? 'found element' : 'not found', v ? `-> "${v}"` : '-> no text');
      if (v) { 
        mark('title', { selectors:[sel], attr:'text', method:'generic' }); 
        log('📝 [ORCHESTRATOR] TITLE SUCCESS:', { text: v, selector: sel, attr: 'text' });
        return v; 
      } 
    }
    const v = (document.title || '').trim(); 
    log('📝 [ORCHESTRATOR] Fallback to document.title:', v ? `"${v}"` : 'empty');
    if (v) mark('title', { selectors:['document.title'], attr:'text', method:'fallback' });
    const result = v || null;
    log('📝 [ORCHESTRATOR] TITLE RESULT:', result);
    return result;
  }
  // ===== getBrand (unified with enhanced logic) =====
  function getBrand() {
    log('🏷️ [UNIFIED] Calling getBrand()...');
    const ld = getJsonLd(document);
    const product = findProductNode(ld);

    // 1) JSON-LD brand.name
    const jsonBrand = product?.brand && (product.brand.name || product.brand);
    if (jsonBrand) {
      const s = String(jsonBrand).trim();
      if (/^[\p{L}\s.&'-]{2,24}$/u.test(s)) {
        mark('brand', { selectors:['jsonld:brand'], attr:'jsonld', method:'jsonld-priority' });
        return s;
      }
    }

    // 2) Microdata/meta
    const metaBrand = document.querySelector('[itemprop="brand"], meta[name="brand"]');
    const metaVal = metaBrand?.getAttribute('content') || cleanText(metaBrand);
    if (metaVal && /^[\p{L}\s.&'-]{2,24}$/u.test(metaVal.trim())) {
      const sel = metaBrand?.tagName === 'META' ? 'meta[name=brand]' : '[itemprop=brand]';
      mark('brand', { selectors:[sel], attr:'content', method:'microdata' });
      return metaVal.trim();
    }

    // 3) Heuristic near title
    const h1 = document.querySelector('h1');
    const brandNode = h1 ? (h1.closest('article, main, section') || document).querySelector('.brand,[class*="brand"]') : document.querySelector('.brand,[class*="brand"]');
    const guess = cleanText(brandNode);
    if (guess && /^[\p{L}\s.&'-]{2,24}$/u.test(guess)) {
      mark('brand', { selectors:['.brand*'], attr:'text', method:'heuristic' });
      return guess;
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
    const prod = findProductNode(getJsonLd(document));
    if (prod && prod.description) { mark('description', { selectors:['script[type="application/ld+json"]'], attr:'text', method:'jsonld-fallback' }); return prod.description; }
    return null;
  }
  // ===== getPrice (augmented with attrs → ancestor → JSON-LD hierarchy) =====
  function getPrice(document, memorySel) {
    // A) Try existing orchestrator logic FIRST and validate it
    let val = null, selUsed = null;
    try {
      const pairs = [
        ['[itemprop="price"]','content'],
        ['[data-test*=price]','text'],
        ['[data-testid*=price]','text'],
        ['[class*="price"]','text'],
        ['.product-price','text']
      ];
      for (const [sel,at] of pairs) {
        const el = q(sel);
        const raw = at==='text' ? txt(el) : attr(el,at);
        let legacy = normalizeMoneyPreferSale(raw);
        if (legacy && el) legacy = refinePriceWithContext(el, legacy);
        if (legacy) { 
          val = legacy; 
          selUsed = sel;
          break;
        }
      }
    } catch {}

    // quick validator
    const good = (n) => isFinite(n) && n > 1 && n < 10000;
    const asNum = (x) => typeof x === 'number' ? x : jsonNum(x);

    // If legacy numeric is good → return immediately
    if (good(asNum(val))) {
      mark('price', { selectors:[selUsed], attr:'mixed', method:'orchestrator-first' });
      return asNum(val);
    }

    // B) Strength 1: memory selector → attrs → ancestor block (pick LOWEST)
    const tryPriceFromElement = (sel) => {
      const el = sel ? document.querySelector(sel) : null;
      if (!el) return null;
      const attrN = numberFromAttrs(el);
      if (attrN != null) return { n: attrN, sel, via:'attrs' };
      const blockN = scanAncestorForPrice(el, 3);
      if (blockN != null) return { n: blockN, sel, via:'block' };
      return null;
    };

    let best = null;

    if (memorySel) best = tryPriceFromElement(memorySel);

    // C) Strength 2: common price selectors with the same rule
    if (!best) {
      const sels = [
        '[itemprop="price"]',
        'meta[itemprop="price"]',
        '[data-testid*="price"]',
        '.price,.Price,.product-price,[class*="price"]'
      ];
      for (const s of sels) {
        best = tryPriceFromElement(s);
        if (best) break;
      }
    }

    // D) Strength 3: JSON-LD fallback
    if (!best) {
      const product = findProductNode(getJsonLd(document));
      const n = jsonNum(product?.offers?.price);
      if (n != null) best = { n, sel: 'jsonld:offers.price', via:'jsonld' };
    }

    // E) Choose return
    if (best && good(best.n)) {
      mark('price', { selectors:[best.sel], attr:best.via, method:'unified-enhanced' });
      return best.n;
    }

    // last resort — even if legacy was bad, return it to avoid empty
    mark('price', { selectors:[selUsed || 'none'], attr:'fallback', method:'last-resort' });
    return good(asNum(val)) ? asNum(val) : null;
  }
  // ===== getImagesGeneric (augmented with filtering → gallery → page fallback) =====
  async function getImagesGeneric(document, memorySel, variantContext = null) {
    // A) Your existing logic FIRST
    let urls = []; let selUsed = null;
    try {
      const hostname = window.location.hostname.toLowerCase().replace(/^www\./, '');
      debug('🖼️ Getting generic images for hostname:', hostname);
      
      // Site-specific selectors for problematic sites
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
        'acehardware.com': ['.product-gallery img', '.mz-productimages img'],
        'target.com': [
          '.ProductMedia img', 
          '[data-test*="image"] img',
          '[data-testid*="image"] img', 
          '.pdp-MediaContainer img',
          '[class*="ProductMedia"] img'
        ],
        'swarovski.com': [
          '.swa-pdp-grid__carousel-area picture',
          '.swa-product-carousel picture', 
          '.swa-pdp-grid__carousel-area img',
          '.swa-product-carousel img',
          'picture[data-thumbnail-sm]',
          '.swa-pdp-grid__carousel-area source[srcset]'
        ]
      };
      
      // Try site-specific selectors first
      const siteSelectors = siteSpecificSelectors[hostname] || [];
      for (const sel of siteSelectors) {
        debug(`🎯 Trying variant-aware site-specific selector for ${hostname}:`, sel);
        const siteUrls = await gatherImagesBySelector(sel, variantContext);
        if (siteUrls.length >= 3) {
          debug(`✅ Site-specific success: ${siteUrls.length} images found`);
          urls = siteUrls; selUsed = sel;
          break;
        }
      }
      
      if (!urls.length) {
        const gallerySels = [
          '.product-media img','.gallery img','.image-gallery img','.product-images img','.product-gallery img',
          '[class*=gallery] img','.slider img','.thumbnails img','.pdp-gallery img','[data-testid*=image] img'
        ];
        for (const sel of gallerySels) {
          const galleryUrls = await gatherImagesBySelector(sel, variantContext);
          if (galleryUrls.length >= 3) { 
            urls = galleryUrls; selUsed = sel;
            break; 
          }
        }
      }
    } catch {}
    
    // B) Hard filter & dedupe whatever you already found
    urls = filterImageUrls(urls);

    // If enough → done
    if (isGoodImages(urls)) {
      mark('images', { selectors:[selUsed], attr:'src', method:'orchestrator-first', urls: urls.slice(0,30) });
      return { values: urls, selector: selUsed || null };
    }

    // C) Strength 1: memory selector (if any)
    const tryFromSel = (sel) => {
      const nodes = [...document.querySelectorAll(sel)];
      if (!nodes.length) return null;
      const gathered = [];
      for (const n of nodes) {
        const enrichedCandidates = collectImgCandidates(n, variantContext);
        gathered.push(...enrichedCandidates);
      }
      const cleaned = filterImageUrls(gathered);
      return cleaned.length >= 3 ? cleaned : null;
    };

    if (memorySel) {
      const attempt = tryFromSel(memorySel);
      if (attempt) {
        urls = attempt; selUsed = memorySel;
        return { values: urls, selector: selUsed };
      }
    }

    // D) Strength 2: common gallery selectors
    const guesses = [
      '[class*="gallery"] img',
      '.product-media img',
      '.pdp-gallery img',
      '[data-testid*="image"] img',
      '.slick-slide img, .swiper-slide img'
    ];
    for (const g of guesses) {
      const attempt = tryFromSel(g);
      if (attempt) { urls = attempt; selUsed = g; break; }
    }
    if (isGoodImages(urls)) {
      mark('images', { selectors:[selUsed], attr:'src', method:'unified-enhanced', urls: urls.slice(0,30) });
      return { values: urls, selector: selUsed };
    }

    // E) Strength 3: whole-page harvest fallback
    const enrichedAll = collectImgCandidates(document, variantContext);
    const all = filterImageUrls(enrichedAll);
    if (all.length >= 3) {
      urls = all; selUsed = 'page:all';
      mark('images', { selectors:[selUsed], attr:'src', method:'page-fallback', urls: urls.slice(0,30) });
      return { values: urls, selector: selUsed };
    }

    // F) return best-effort (even if <3)
    mark('images', { selectors:[selUsed || 'none'], attr:'src', method:'best-effort', urls: urls.slice(0,30) });
    return { values: urls, selector: selUsed };
  }

  // ===== getSpecsAndTags (unified with fallbacks, tags/gender removed) =====
  function getSpecsAndTags() {
    log('📋 [UNIFIED] Calling getSpecsAndTags()...');
    let specs = [], tags = [];

    try {
      // A) Try collectSpecs (primary source)
      if (typeof collectSpecs === 'function') {
        specs = collectSpecs(10) || [];
        log('📋 [UNIFIED] collectSpecs returned:', specs.length, 'items');
      }
    } catch (e) {
      log('📋 [UNIFIED] collectSpecs failed:', e.message);
    }

    // B) Fallback specs extraction if primary failed
    if (!specs.length) {
      log('📋 [UNIFIED] No specs from collectSpecs, trying fallback...');
      const specContainers = document.querySelectorAll('[class*="spec"], [class*="detail"], [class*="feature"], [class*="attribute"]');
      for (const container of specContainers) {
        const items = container.querySelectorAll('li, dt, tr');
        for (const item of Array.from(items).slice(0, 10)) {
          const text = cleanText(item);
          if (text && text.length > 5 && text.length < 100) {
            specs.push(text);
          }
        }
        if (specs.length >= 5) break;
      }
    }

    // C) Try collectTags (primary source) - but filter out gender-related tags
    try {
      if (typeof collectTags === 'function') {
        const rawTags = collectTags(12) || [];
        // Filter out gender/demographic tags as per user request
        tags = rawTags.filter(tag => {
          const lower = tag.toLowerCase();
          return !/(women|womens|woman|ladies|female|men|mens|man|boys|girls|boy|girl|unisex|gender)/i.test(lower);
        });
        log('📋 [UNIFIED] collectTags returned:', rawTags.length, 'raw,', tags.length, 'filtered');
      }
    } catch (e) {
      log('📋 [UNIFIED] collectTags failed:', e.message);
    }

    // D) Fallback tags extraction if primary failed  
    if (!tags.length) {
      log('📋 [UNIFIED] No tags from collectTags, trying fallback...');
      const tagElements = document.querySelectorAll('[class*="chip"], [class*="pill"], [class*="tag"], [class*="badge"], [class*="category"]');
      for (const el of Array.from(tagElements).slice(0, 12)) {
        const text = cleanText(el);
        if (text && text.length > 2 && text.length < 30) {
          const lower = text.toLowerCase();
          // Apply same gender filter to fallback tags
          if (!/(women|womens|woman|ladies|female|men|mens|man|boys|girls|boy|girl|unisex|gender)/i.test(lower)) {
            tags.push(text);
          }
        }
      }
    }

    // E) Mark and return results
    mark('specs', { selectors:['collectSpecs+fallback'], attr:'text', method:'unified-enhanced', values: specs.slice(0,10) });
    mark('tags', { selectors:['collectTags+fallback'], attr:'text', method:'unified-enhanced', values: tags.slice(0,12) });
    
    log('📋 [UNIFIED] FINAL RESULT:', { specs: specs.length, tags: tags.length });
    return {
      specs: specs.slice(0, 10),
      tags: tags.slice(0, 12)
    };
  }

  // LLM FALLBACK: Use AI to discover image selectors when all else fails  
  async function tryLLMImageFallback(document, variantContext = null) {
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
          const urls = await gatherImagesBySelector(selector, variantContext);
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
          price = getPrice(document, mem.price);
          debug('💰 PRICE FROM GENERIC:', price);
        }
        
        // images = await fromMemory('images', mem.images);  // Skip memory for images
        debug('🖼️ IMAGES: Skipping memory in normal mode');
        images = [];
        
        // VARIANT-AWARE IMAGE COLLECTION
        {
          debug('🖼️ IMAGES: Starting variant-aware collection...');
          
          // Create variant context for precise targeting
          const variantContext = createVariantContext();
          debug('🎯 VARIANT CONTEXT CREATED:', {
            selectedVariant: variantContext.selectedVariantKey,
            detectionMethod: variantContext.detectionMethod,
            activeGallery: variantContext.activeGalleryRoot?.className || 'document',
            debugInfo: variantContext.debugInfo
          });
          
          const memoryImages = images || [];
          
          // Try custom handlers first (with variant context)
          let customImages = [];
          if (typeof getCustomHandlers === 'function') {
            try {
              const ch = getCustomHandlers();
              if (ch?.images && typeof ch.images === 'function') {
                debug('🧩 IMAGES: Trying custom handler...');
                const customResult = await Promise.resolve(ch.images(document, variantContext));
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
            // Merge and dedupe memory + custom (with variant context)
            let combinedImages = await uniqueImages(memoryImages.concat(customImages));
            
            // Fall back to generic only if still insufficient (with variant context)
            if (combinedImages.length < 3) {
              debug('🖼️ IMAGES: Custom insufficient, getting variant-aware generic images...');
              const genericImagesResult = await getImagesGeneric(document, mem.images, variantContext);
              const genericImages = genericImagesResult.values || [];
              debug('🖼️ VARIANT-AWARE GENERIC IMAGES:', { count: genericImages.length, images: genericImages.slice(0, 3) });
              combinedImages = await uniqueImages(combinedImages.concat(genericImages));
            }
          
            images = combinedImages.slice(0, 30);
          }
          debug('🖼️ FINAL VARIANT-FILTERED IMAGES:', { count: images.length, images: images.slice(0, 3) });
          
          // LLM FALLBACK: If no images found, try AI-powered selector discovery (with variant context)
          if (images.length === 0 && mode !== 'memoryOnly') {
            debug('🤖 IMAGES: Zero images found, activating variant-aware LLM fallback...');
            try {
              const llmImages = await tryLLMImageFallback(document, variantContext);
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
      // Extract specs using unified function (tags dropped per requirements)
      let specs = [];
      if (mode !== 'memoryOnly') {
        debug('📋 SPECS & TAGS: Extracting...');
        const specsAndTags = getSpecsAndTags();
        specs = specsAndTags.specs || [];
        // tags removed per requirements - no longer extracting
        debug('📋 SPECS RESULT:', { specs: specs.length });
      }

      const payload = { title, brand, description, price, specs, url: location.href, images, timestamp: new Date().toISOString(), mode };
      
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
        images: images?.length || 0,
        specs: specs?.length || 0,
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