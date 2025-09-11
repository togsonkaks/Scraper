
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
    const monetary = parseMoneyTokens(s);
    if (monetary.length) return preferFirst ? monetary[0] : Math.min(...monetary);
    const fallback = [];
    String(s).replace(/(\d+(?:\.\d+)?)(?!\s*%)/g, (m, g1) => { const n = parseFloat(g1); if (isFinite(n)) fallback.push(n); return m; });
    return fallback.length ? (preferFirst ? fallback[0] : Math.min(...fallback)) : null;
  }
  function normalizeMoneyPreferSale(raw, preferFirst = false) {
    if (raw == null) return null;
    const val = bestPriceFromString(String(raw), preferFirst);
    return val == null ? null : String(val);
  }
  function refinePriceWithContext(el, baseVal, fromMemory = false) {
    try {
      if (!el) return baseVal;
      const attrFirst = attr(el, 'content') || attr(el, 'data-price') || attr(el, 'aria-label');
      const attrVal = normalizeMoneyPreferSale(attrFirst, fromMemory);
      if (attrVal) return attrVal;
      
      // If this is from memory selector, don't override - trust the user's selector
      if (fromMemory && baseVal) return baseVal;
      
      // Only hunt for "better" prices in generic mode
      let node = el;
      let best = baseVal != null ? parseFloat(baseVal) : Infinity;
      for (let i=0; i<3 && node; i++, node = node.parentElement) {
        const t = (node.textContent || '').trim();
        const cand = bestPriceFromString(t);
        if (cand != null && cand < best) best = cand;
      }
      return isFinite(best) && best !== Infinity ? String(best) : baseVal;
    } catch { return baseVal; }
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
    const seen = new Set(); const out = [];
    for (const u of urls) {
      if (!u) continue;
      const abs = toAbs(u);
      if (!looksLikeImageURL(abs)) continue;
      if (JUNK_IMG.test(abs) || BASE64ISH_SEG.test(abs)) continue;
      const key = canonicalKey(abs);
      if (!seen.has(key)) { seen.add(key); out.push(abs); }
    }
    return out;
  }
  function gatherImagesBySelector(sel) {
    const urls = [];
    for (const el of qa(sel)) {
      const s1 = el.getAttribute('src') || el.currentSrc ||
                 el.getAttribute('data-src') || el.getAttribute('data-image') ||
                 el.getAttribute('data-zoom-image') || el.getAttribute('data-large');
      if (s1) urls.push(s1);
      const ss = el.getAttribute('srcset'); const best = pickFromSrcset(ss); if (best) urls.push(best);
      if (el.parentElement && el.parentElement.tagName.toLowerCase()==='picture') {
        for (const src of el.parentElement.querySelectorAll('source')) {
          const b = pickFromSrcset(src.getAttribute('srcset')); if (b) urls.push(b);
        }
      }
    }
    return uniqueImages(urls);
  }

  /* ---------- MEMORY RESOLUTION ---------- */
  function fromMemory(field, memEntry) {
    if (!memEntry || !Array.isArray(memEntry.selectors)) return null;

    if (memEntry.selectors.some(s => /^script\[type="application\/ld\+json"\]$/i.test(s))) {
      const prod = scanJSONLDProducts()[0];
      if (!prod) return null;
      if (field === 'price') {
        const v = normalizeMoneyPreferSale(ldPickPrice(prod));
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

    for (const sel of memEntry.selectors) {
      try {
        if (!sel) continue;
        if (field === 'images') {
          const urls = gatherImagesBySelector(sel);
          if (urls.length) { mark('images', { selectors:[sel], attr:'src', method:'css', urls: urls.slice(0,30) }); return urls.slice(0,30); }
        } else {
          const el = q(sel); if (!el) continue;
          const a = memEntry.attr || 'text';
          const raw = a === 'text' ? txt(el) : attr(el, a);
          let val = field === 'price' ? normalizeMoneyPreferSale(raw, true) : raw;  // preferFirst=true for memory selectors
          if (field === 'price') val = refinePriceWithContext(el, val, true);  // fromMemory=true
          if (val) { mark(field, { selectors:[sel], attr:a, method:'css' }); return val; }
        }
      } catch (e) {}
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
      log('scrape start', { host, href: location.href, mode });

      const mem = loadMemory(host);

      let title=null, brand=null, description=null, price=null, images=null;

      if (mode === 'memoryOnly') {
        title = fromMemory('title', mem.title);
        brand = fromMemory('brand', mem.brand);
        description = fromMemory('description', mem.description);
        price = fromMemory('price', mem.price);
        images = fromMemory('images', mem.images);
      } else {
        title = fromMemory('title', mem.title) || getTitle();
        brand = fromMemory('brand', mem.brand) || getBrand();
        description = fromMemory('description', mem.description) || getDescription();
        price = fromMemory('price', mem.price) || getPriceGeneric();
        images = fromMemory('images', mem.images);
        if (!images || images.length < 3) {
          const memoryImages = images || [];
          const genericImages = getImagesGeneric();
          // Append and deduplicate generic images to memory images instead of replacing
          images = uniqueImages(memoryImages.concat(genericImages)).slice(0, 30);
        }
      }

      const payload = { title, brand, description, price, url: location.href, images, timestamp: new Date().toISOString(), mode };
      globalThis.__tg_lastSelectorsUsed = __used;
      return payload;
    } catch (e) {
      return { __error: (e && e.stack) || String(e), __stage: 'scrapeProduct' };
    }
  }

  Object.assign(globalThis, { scrapeProduct });
})();
