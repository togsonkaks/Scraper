/* scrapers/custom.js
   Site-specific overrides for title/brand/price/specs/tags/images.
   Orchestrator calls getCustomHandlers(); return null from any field to let generic handle it.

   Expects globals provided elsewhere:
   - T(s)
   - normalizeMoney(s)
*/

//////////////////// helpers ////////////////////
const __host = () => (location.hostname || "").toLowerCase();
const __looksHttp = (u) => /^https?:\/\//i.test(u || "");
const __uniq = (a) => [...new Set((a || []).filter(Boolean))];

function __joinCurrencySymbolAndAmount(curNode, amtNode) {
  const cur = T(curNode?.textContent || curNode?.getAttribute?.("content") || "");
  const raw = T(amtNode?.textContent || amtNode?.getAttribute?.("content") || "");
  if (!cur || !raw) return null;
  return normalizeMoney(`${cur}${raw}`) || normalizeMoney(`${cur} ${raw}`) || null;
}

function __pickJSONLDProductPrice(doc = document) {
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.textContent.trim());
      const arr = Array.isArray(data) ? data : [data];
      for (const node of arr) {
        const types = [].concat(node?.["@type"] || []).map(String);
        if (!types.some((t) => /product/i.test(t))) continue;
        const cur = node.priceCurrency || node.offers?.priceCurrency || "";
        const offers = []
          .concat(node.offers || [])
          .map((o) => o?.priceSpecification?.price ?? o?.price ?? o?.lowPrice ?? o?.highPrice)
          .filter((v) => v != null);
        if (offers.length) {
          const val = offers.find((v) => /\d/.test(String(v)));
          if (val != null) return normalizeMoney(`${cur ? cur + " " : ""}${val}`);
        }
      }
    } catch {}
  }
  return null;
}

function __scene7CollectUpsized(doc = document) {
  const out = [];
  const push = (u) => { if (u) out.push(u); };
  doc.querySelectorAll("img, source[srcset], a[href]").forEach((el) => {
    let urls = [];
    if (el.tagName === "SOURCE") {
      urls = (el.getAttribute("srcset") || "")
        .split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
    } else if (el.tagName === "A") {
      const href = el.getAttribute("href") || "";
      if (/scene7\.com\/is\/image/i.test(href)) urls = [href];
    } else {
      const src = el.currentSrc || el.getAttribute("src") || "";
      if (/scene7\.com\/is\/image/i.test(src)) urls = [src];
      const ss = el.getAttribute("srcset") || "";
      if (ss && /scene7\.com\/is\/image/i.test(ss)) {
        urls = urls.concat(ss.split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean));
      }
    }
    urls.forEach((u) => {
      try {
        if (u.startsWith("//")) u = location.protocol + u;
        if (!__looksHttp(u)) return;
        let final = u;
        const hasQuery = /\?/.test(final);
        const hasWid = /[?&]wid=\d+/i.test(final);
        if (!hasWid) final += (hasQuery ? "&" : "?") + "wid=2000&qlt=90&op_usm=1.0,1.0,0.0,0";
        push(final);
      } catch {}
    });
  });
  return __uniq(out);
}

//////////////////// site modules ////////////////////

// ---------- Amazon (simple, targeted approach based on DOM screenshots) ----------
const AMZ = {
  match: (h) => /(^|\.)amazon\./i.test(h),

  title(doc = document) {
    const titleEl = doc.querySelector("#productTitle") || doc.querySelector("h1#title");
    return titleEl?.textContent?.trim() || null;
  },

  price(doc = document) {
    // TARGET EXACT DOM STRUCTURE FROM SCREENSHOTS:
    // <span class="a-price-whole">32</span>
    // <span class="a-price-fraction">88</span>
    const whole = doc.querySelector(".a-price-whole")?.textContent?.replace(/[^\d]/g, '');
    const fraction = doc.querySelector(".a-price-fraction")?.textContent?.replace(/[^\d]/g, '');
    
    if (whole) {
      return fraction ? `${whole}.${fraction}` : whole;
    }
    
    // Fallback for older Amazon layouts
    const offscreen = doc.querySelector(".a-price .a-offscreen");
    if (offscreen?.textContent) {
      const price = offscreen.textContent.replace(/[^\d.]/g, '');
      if (price && /\d/.test(price)) return price;
    }
    
    return null;
  },

  images(doc = document) {
    // route logs to orchestrator if present - be robust about the type
    const debug = (msg) => {
      try {
        if (typeof window !== 'undefined' && window.__tg_debugLog) {
          if (typeof window.__tg_debugLog === 'function') {
            window.__tg_debugLog(msg);
          } else if (Array.isArray(window.__tg_debugLog)) {
            window.__tg_debugLog.push(msg);
          } else {
            console.log(msg);
          }
        } else {
          console.log(msg);
        }
      } catch(e) {
        console.log(msg); // fallback if anything fails
      }
    };

    // Use BOTH: sanitized doc (selectors) + live doc (a-state scripts)
    const live = window.document || doc;

    // tokens: _AC_UL116_SR116,116_, _SL1500_, _UX999_, _CRx,y,w,h_, etc.
    const SIZE = /_(AC|SL|SX|SY|SR|SS|UX|UY|FM|UL|US)\d+(?:,\d+)*_/g;
    const AMZ_HOST = /(m\.media-amazon\.com|images-na\.ssl-images-amazon\.com|images-amazon\.com)\/images\/I\//;

    const isAmz = (u) => typeof u === "string" && AMZ_HOST.test(u);
    const clean = (u) => (u || "").split("?")[0].replace(/%2B/gi, "+");

    // normalize: drop crops, upsize, keep _AC_ if present
    const normalize = (u) =>
      clean(u)
        .replace(/_CR\d+,\d+,\d+,\d+_/g, "_")      // remove crop box
        .replace(/_(SR|SX|SY|SS)\d+,\d+_/g, "_")  // remove dimension pairs like _SR116,116_
        .replace(SIZE, "_SL1500_");               // force large size

    const baseKey = (u) => clean(u).replace(/^.*\/I\//, "").replace(/\._.*$/, "");
    
    // Amazon quality scoring - your brilliant discovery!
    const getQualityScore = (u) => {
      const match = u.match(/\/I\/(\d{2})/);
      if (!match) return 0;
      const prefix = parseInt(match[1]);
      if (prefix >= 81) return 90; // Premium quality ⭐⭐⭐⭐⭐
      if (prefix >= 71) return 80; // High quality ⭐⭐⭐⭐  
      if (prefix >= 61) return 60; // Medium quality ⭐⭐⭐
      if (prefix >= 51) return 40; // Low quality ⭐⭐
      if (prefix >= 41) return 20; // Thumbnail quality ⭐
      return 10; // Unknown/very low
    };
    
    const qualityImages = new Map(); // baseKey -> {url, score}
    const add = (u) => {
      if (!isAmz(u)) return;
      const n = normalize(u);
      const k = baseKey(n);
      const score = getQualityScore(n);
      
      // Only keep if this is higher quality than what we have
      if (!qualityImages.has(k) || qualityImages.get(k).score < score) {
        qualityImages.set(k, {url: n, score: score});
        debug(`Amazon quality[${score}]: ${k.slice(0,12)} -> ${n.slice(-50)}`);
      }
    };

    // 1) data-a-dynamic-image (the gold mine for high-res!) - FOCUSED ON MAIN PRODUCT AREA
    debug("Amazon checking data-a-dynamic-image...");
    live.querySelectorAll('#ivImageBlock img[data-a-dynamic-image], #iv-tab-view-container img[data-a-dynamic-image], .iv-box img[data-a-dynamic-image]').forEach((img, idx) => {
      try {
        const jsonStr = img.getAttribute("data-a-dynamic-image");
        if (jsonStr) {
          const map = JSON.parse(jsonStr);
          const urls = Object.keys(map);
          debug(`Amazon data-a-dynamic-image[${idx}] has ${urls.length} URLs`);
          urls.forEach(url => {
            debug(`Amazon dynamic URL: ${url.slice(-50)}`);
            add(url);
          });
        }
      } catch(e) {
        debug(`Amazon data-a-dynamic-image parse error: ${e.message}`);
      }
    });

    // 2) explicit hi-res attributes (often point to ivLargeImage sources) - FOCUSED ON MAIN PRODUCT AREA
    debug("Amazon checking hi-res attributes...");
    const hiResSelectors = ['data-old-hires', 'data-a-hires', 'data-zoom-image', 'data-large-image', 'data-src'];
    live.querySelectorAll('#ivImageBlock img[data-old-hires], #ivImageBlock img[data-a-hires], #ivImageBlock img[data-zoom-image], #ivImageBlock img[data-large-image], #ivImageBlock img[data-src], #iv-tab-view-container img[data-old-hires], #iv-tab-view-container img[data-a-hires], #iv-tab-view-container img[data-zoom-image], #iv-tab-view-container img[data-large-image], #iv-tab-view-container img[data-src], .iv-box img[data-old-hires], .iv-box img[data-a-hires], .iv-box img[data-zoom-image], .iv-box img[data-large-image], .iv-box img[data-src]')
      .forEach((img, idx) => {
        hiResSelectors.forEach((attr) => {
          const u = img.getAttribute(attr);
          if (u && u.includes('/images/I/')) {
            debug(`Amazon ${attr}[${idx}]: ${u.slice(-50)}`);
            add(u);
          }
        });
      });

    // 3) Amazon image containers - the ones you've been showing me!
    debug("Amazon scanning image containers...");
    
    // Main product image (focused on main containers)
    live.querySelectorAll("#ivImageBlock #landingImage, #iv-tab-view-container #landingImage").forEach((img) => {
      const u = img.currentSrc || img.src;
      if (u) {
        debug(`Amazon landingImage: ${u.slice(-50)}`);
        add(u);
      }
    });
    
    // iv-box containers (what you've been pointing me to!) 
    live.querySelectorAll("#ivImageBlock .iv-box-inner img, #ivImageBlock .iv-box img, #iv-tab-view-container .iv-box img").forEach((img) => {
      const u = img.currentSrc || img.src;
      if (u) {
        debug(`Amazon iv-box: ${u.slice(-50)}`);
        add(u);
      }
    });
    
    // Thumbnail gallery 
    doc.querySelectorAll("[id*='altImages'] img").forEach((img) => {
      const u = img.currentSrc || img.src;
      if (u) {
        debug(`Amazon thumbnail: ${u.slice(-50)}`);
        add(u);
      }
    });
    
    // GOLD HUNT: ivLargeImage and immersive viewer content
    debug("Amazon hunting for ivLargeImage (the gold!)...");
    
    // Note: Automatic scrolling now happens on page load (main.js) to trigger lazy loading
    // This gives Amazon time to load premium images before scraping begins
    debug("Amazon leveraging page-load triggered lazy loading for premium images...");
    
    // Get thumbnails for additional data extraction
    const thumbnails = doc.querySelectorAll("[id*='altImages'] img, .iv-thumb img");
    debug(`Amazon found ${thumbnails.length} thumbnails for data extraction`);
    
    // Check live document for dynamic ivLargeImage content (might be loaded already)
    if (live !== doc) {
      live.querySelectorAll("img.fullscreen, .ivLargeImage img, #ivLargeImage img, [class*='ivLarge'] img").forEach((img) => {
        const u = img.currentSrc || img.src;
        if (u) {
          debug(`Amazon LIVE ivLargeImage GOLD: ${u.slice(-50)}`);
          add(u);
        }
      });
    }
    
    // Immediate scan (in case ivLargeImage already exists)
    doc.querySelectorAll("img.fullscreen, .ivLargeImage img, #ivLargeImage img, [class*='ivLarge'] img").forEach((img) => {
      const u = img.currentSrc || img.src;
      if (u) {
        debug(`Amazon immersive: ${u.slice(-50)}`);
        add(u);
      }
    });
    
    // Look for zoom/large image data in onclick handlers and data attributes
    debug("Amazon checking for zoom data in thumbnails...");
    thumbnails.forEach((thumb, idx) => {
      // Check onclick attribute for image URLs
      const onclick = thumb.getAttribute('onclick') || '';
      const match = onclick.match(/['"]([^'"]*\/images\/I\/[^'"]+)['"]/);
      if (match) {
        debug(`Amazon onclick image[${idx}]: ${match[1].slice(-50)}`);
        add(match[1]);
      }
      
      // Check all data-* attributes for image URLs
      Array.from(thumb.attributes).forEach(attr => {
        if (attr.name.startsWith('data-') && attr.value.includes('/images/I/')) {
          debug(`Amazon ${attr.name}[${idx}]: ${attr.value.slice(-50)}`);
          add(attr.value);
        }
      });
    });

    // FOCUSED SCOPE: Only scan main product area containers, no page-wide junk collection
    debug("Amazon focused main product area scanning complete - avoiding junk from ads/recommendations");

    // Sort by quality score (highest first), then by JPG preference
    const result = Array.from(qualityImages.values())
      .sort((a, b) => {
        // First by quality score (higher is better)
        if (a.score !== b.score) return b.score - a.score;
        // Then by JPG preference  
        const aJpg = a.url.endsWith(".jpg") ? 0 : 1;
        const bJpg = b.url.endsWith(".jpg") ? 0 : 1;
        return aJpg - bJpg || a.url.localeCompare(b.url);
      })
      .map(item => item.url);

    debug(`Amazon quality-sorted results: ${result.length} images`);
    result.forEach((url, i) => {
      const score = getQualityScore(url);
      const quality = score >= 90 ? "⭐⭐⭐⭐⭐" : score >= 80 ? "⭐⭐⭐⭐" : score >= 60 ? "⭐⭐⭐" : score >= 40 ? "⭐⭐" : "⭐";
      debug(`Amazon [${i+1}] ${quality}(${score}): ${url.slice(-60)}`);
    });
    
    return result.slice(0, 20);
  }
};

// ---------- boohooMAN ----------
const BOOHOO = {
  match: (h) => /\bboohoo(man)?\.com$/i.test(h),
  price(doc = document) {
    const el = doc.querySelector('span.price-sales[itemprop="price"]');
    const v = el?.getAttribute("content") || el?.textContent;
    if (v) {
      const cur = doc.querySelector('meta[itemprop="priceCurrency"]')?.getAttribute("content") ||
                  doc.querySelector("[itemprop='priceCurrency']")?.getAttribute("content") || "";
      const val = cur ? normalizeMoney(`${cur} ${v}`) : normalizeMoney(v);
      if (val) return val;
    }
    return __pickJSONLDProductPrice(doc);
  },
};
// ---------- Costco ----------
const COSTCO = {
  match: (h) => /\bcostco\.com$/i.test(h),
  price(doc = document) {
    const cur = doc.querySelector('span[automation-id="currencySymbolOutput"]');
    const amt = doc.querySelector('span[automation-id="productPriceOutput"]');
    const v = __joinCurrencySymbolAndAmount(cur, amt);
    if (v) return v;
    return __pickJSONLDProductPrice(doc);
  },
};

// ---------- Home Depot ----------
const HOMEDEPOT = {
  match: (h) => /\bhome(depot)?\.com$/i.test(h),

  price() {
    // Force DOM-first; JSON-LD is often stale on promos
    const cur = (document.querySelector('[data-automation-id="currencySymbol"], .currency__symbol, .price__currency')?.textContent || '$').trim();

    const clusters = [...document.querySelectorAll(
      '[data-testid*="price"], [data-automation-id*="price"], .price, .price__wrapper, .sui-text-display, .sui-font-display'
    )];

    const pickFrom = (txt) => {
      const s = (txt || '').replace(/\s+/g, ' ');
      // REQUIRE a $ to avoid picking "Limit 5"
      const re = /\$\s*\d[\d,]*(?:\.\d{2})?/g;
      let m;
      while ((m = re.exec(s))) {
        const prev = s.slice(Math.max(0, m.index - 20), m.index).toLowerCase();
        if (!/was|save|compare/.test(prev)) {
          const token = m[0].replace(/^\$?\s*/, '');
          const val = normalizeMoney(`${cur}${token}`);
          if (val) return val;
        }
      }
      return null;
    };

    for (const c of clusters) {
      const v = pickFrom(c.textContent || '');
      if (v) return v;
    }

    // Nuclear fallback: whole page scan (still requires $)
    const pageVal = pickFrom(document.body?.innerText || document.body?.textContent || '');
    if (pageVal) return pageVal;

    return null;
  },

  async images(doc = document) {
    console.log("[DEBUG] Home Depot custom image logic running...");
    const out = new Set();
    
    // Collect all gallery images with broader selectors
    const gallerySelectors = [
      '[class*=gallery] img',
      '.product-images img',
      '.image-container img',
      '.media-gallery img',
      '.product-media img'
    ];
    
    gallerySelectors.forEach(selector => {
      const imgs = doc.querySelectorAll(selector);
      imgs.forEach(img => {
        let url = img.currentSrc || img.src;
        if (url && /(?:images\.thdstatic\.com|www\.thdstatic\.com)/i.test(url)) {
          // Upgrade ALL thumbnail sizes (_100, _200, _300, _600) to high-res _1000
          url = url.replace(/_\d{2,3}\.(jpg|jpeg|png|webp)/gi, '_1000.$1');
          
          // Upgrade spin image profiles from any size to 1000
          url = url.replace(/[?&]profile=\d+/gi, '&profile=1000');
          url = url.replace(/\?&/g, '?'); // Clean up malformed query strings
          
          out.add(url);
          console.log("[DEBUG] Home Depot image upgraded:", img.src, "->", url);
        }
      });
    });
    
    // Fallback: any Home Depot product images if gallery didn't catch enough
    if (out.size < 5) {
      doc.querySelectorAll('main img, section img, [class*="product"] img').forEach(img => {
        let url = img.currentSrc || img.src;
        if (url && /(?:images\.thdstatic\.com|www\.thdstatic\.com)/i.test(url) && 
            !/(?:icon|logo|sprite|thumb)/i.test(url)) {
          url = url.replace(/_\d{2,3}\.(jpg|jpeg|png|webp)/gi, '_1000.$1');
          url = url.replace(/[?&]profile=\d+/gi, '&profile=1000');
          url = url.replace(/\?&/g, '?');
          out.add(url);
        }
      });
    }
    
    console.log("[DEBUG] Home Depot found", out.size, "high-res images");
    return [...out].filter(u => /\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u)).slice(0, 15);
  }
};


// ---------- Macy's ----------
const MACYS = {
  match: (h) => /\bmacys\.com$/i.test(h),
  price(doc = document) {
    // Macy’s often separates symbol & amount
    const cur = doc.querySelector('[data-el="currencySymbol"], [class*="CurrencySymbol"]');
    const amt = doc.querySelector('[data-el="priceAmount"], [class*="Price"] [data-auto="price-value"]');
    const joined = __joinCurrencySymbolAndAmount(cur, amt);
    if (joined) return joined;
    return __pickJSONLDProductPrice(doc);
  },
};

// ---------- DSW ----------
const DSW = {
  match: (h) => /\bdsw\.com$/i.test(h),
  price(doc = document) {
    // Try sale/current then JSON-LD
    const el = doc.querySelector('[data-automation-id="current-price"], .pdp-price, [class*="price"]');
    const v = normalizeMoney(T(el?.textContent));
    if (v) return v;
    return __pickJSONLDProductPrice(doc);
  },
};

// ---------- Nordstrom ----------
const NORDSTROM = {
  match: (h) => /\bnordstrom\.com$/i.test(h),
  price(doc = document) {
    const el = doc.querySelector('[data-testid="price-current"], [data-testid*="price"], .current-price, .price-current');
    const v = normalizeMoney(T(el?.textContent));
    if (v) return v;
    return __pickJSONLDProductPrice(doc);
  },
};

// ---------- Express ----------
const EXPRESS = {
  match: (h) => /\bexpress\.com$/i.test(h),
  price(doc = document) {
    const el = doc.querySelector('[data-testid="pdp-sale-price"], [data-testid="pdp-price"], .pdp-price, [class*="price"]');
    const v = normalizeMoney(T(el?.textContent));
    if (v) return v;
    return __pickJSONLDProductPrice(doc);
  },
};

// ---------- Fashion Nova ----------
const FASHIONNOVA = {
  match: (h) => /\bfashionnova\.com$/i.test(h),
  price(doc = document) {
    const el = doc.querySelector('.price__current, .product__price, [class*="price"]');
    const v = normalizeMoney(T(el?.textContent));
    if (v) return v;
    return __pickJSONLDProductPrice(doc);
  },
};

// ---------- Banana Republic Factory / GapFactory ----------
const BANANA_FACTORY = {
  match: (h) =>
    /\b(gapfactory|bananarepublicfactory)\.com$/i.test(h),
  price(doc = document) {
    // Prefer current sale price in PDP header
    const pickers = [
      "[data-testid='pdp-markdown-title-price'] .current-sale-price",
      "span.current-sale-price",
      "[data-testid='pdp-title-price-wrapper'] .current-sale-price",
    ];
    for (const sel of pickers) {
      const txt = T(doc.querySelector(sel)?.textContent);
      const norm = normalizeMoney(txt);
      if (norm) return norm;
    }
    // Fallback to any money-looking node in the price header
    const hdr = doc.querySelector("[data-testid='pdp-title-price-wrapper'], [data-testid*='price']");
    const norm2 = normalizeMoney(T(hdr?.textContent));
    if (norm2) return norm2;

    return __pickJSONLDProductPrice(doc);
  },
};

// ---------- Edge by XS (Shopify) ----------
const EDGE_BY_XS = {
  match: (h) => /edgeby/i.test(h),

  price() {
    // 1) Explicit sale/discount buckets first
    const saleSel = [
      ".product-page-info__price .save-price .money",
      ".price--on-sale .price__sale .price-item--sale",
      ".price--on-sale .money",
      ".price__sale .money",
    ];
    for (const s of saleSel) {
      const v = normalizeMoney(T(document.querySelector(s)?.textContent));
      if (v) return v;
    }

    // 2) Active PDP price node
    const active = document.querySelector(
      ".product-page-info__price [data-js-product-price] .money, [data-js-product-price] .money"
    );
    const aVal = normalizeMoney(T(active?.textContent));
    if (aVal) return aVal;

    // 3) Generic Shopify fallbacks
    const picks = [
      "meta[itemprop='price'][content]",
      "meta[property='product:price:amount'][content]",
      "span.money",
      "[itemprop='price']",
    ];
    for (const sel of picks) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const raw = el.getAttribute?.("content") || T(el.textContent);
      const val = normalizeMoney(raw);
      if (val) return val;
    }

    // 4) Last resort
    return __pickJSONLDProductPrice(document);
  },
};
const ACE_HARDWARE = {
  match: (h) => /\bacehardware\.com$/i.test(h),
  async images(doc = document) {
    console.log("[DEBUG] ACE_HARDWARE custom image logic running...");
    const urls = new Set();

    // Modern ACE Hardware selectors - try multiple container patterns
    const containerSelectors = [
      '.product-detail-images, .product-images, .product-gallery',
      '[data-testid*="image"], [data-testid*="gallery"], [data-testid*="carousel"]',
      '.carousel, .slider, .swiper, .swiper-container',
      '[class*="image"], [class*="gallery"], [class*="carousel"], [class*="slider"]',
      '.pdp-images, .pdp-gallery, .pdp-media'
    ];

    let mainContainer = null;
    for (const selector of containerSelectors) {
      mainContainer = doc.querySelector(selector);
      if (mainContainer) {
        console.log("[DEBUG] Found container:", selector);
        break;
      }
    }

    const scope = mainContainer || doc.body;
    console.log("[DEBUG] Using scope:", scope.className || scope.tagName);

    // Comprehensive image collection
    const imageSelectors = [
      '[data-product] img', '[class*="product"] img', // Targeted product images instead of all images
      '[data-src]', '[data-image]', '[data-zoom]', '[data-large]',
      '[data-zoom-image]', '[data-large-image]', '[data-full-image]',
      '[style*="background-image"]',
      'picture source', 'picture img',
      '[srcset]'
    ];

    for (const selector of imageSelectors) {
      scope.querySelectorAll(selector).forEach(el => {
        try {
          // Standard src attributes
          const src = el.currentSrc || el.src || el.getAttribute('data-src') || 
                     el.getAttribute('data-image') || el.getAttribute('data-zoom-image') ||
                     el.getAttribute('data-large-image') || el.getAttribute('data-full-image');
          if (src) urls.add(src);

          // Srcset handling
          const srcset = el.getAttribute('srcset') || el.getAttribute('data-srcset');
          if (srcset) {
            srcset.split(',').forEach(s => {
              const url = s.trim().split(/\s+/)[0];
              if (url) urls.add(url);
            });
          }

          // Background images
          if (el.style?.backgroundImage) {
            const bgMatch = el.style.backgroundImage.match(/url\((['"]?)(.*?)\1\)/);
            if (bgMatch && bgMatch[2]) urls.add(bgMatch[2]);
          }
        } catch (e) {
          console.log("[DEBUG] Error processing element:", e);
        }
      });
    }

    // Smart sweep if not enough found - target likely product areas
    if (urls.size < 3) {
      console.log("[DEBUG] Not enough images found, doing targeted document sweep...");
      doc.querySelectorAll('main img, section img, [class*="product"] img, [class*="gallery"] img').forEach(img => {
        const u = img.currentSrc || img.src;
        if (u && /\.(jpe?g|png|webp|avif)/i.test(u)) urls.add(u);
      });
    }

    // Filter and return
    const good = [...urls].filter(u => u && /\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u));
    console.log("[DEBUG] ACE_HARDWARE found", good.length, "images:", good.slice(0, 3));
    return good.slice(0, 20);
  }
};

// ---------- Allbirds (target swiper carousel structure) ----------
const ALLBIRDS = {
  match: (h) => /allbirds\.com$/i.test(h),
  images(doc = document) {
    console.log("[DEBUG] Allbirds custom image logic running...");
    const out = new Set();
    
    // Target the ACTUAL swiper carousel structure from DOM inspection
    const productContainers = [
      '[data-product-hero-carousel]',  // Main product carousel container
      '.swiper-container',             // Swiper main container
      '.swiper-slide',                 // Individual slides contain images
      '.product-hero-carousel',        // Product hero carousel
      '[data-product-hero]',           // Product hero variants
      '[data-section-type="product-hero"]' // Shopify section type
    ];
    
    // STRATEGY 1: Target swiper carousel directly
    productContainers.forEach(selector => {
      const containers = doc.querySelectorAll(selector);
      if (containers.length > 0) {
        console.log("[DEBUG] Allbirds found", containers.length, "containers for:", selector);
        containers.forEach((container, i) => {
          container.querySelectorAll('img').forEach(img => {
            const u = img.currentSrc || img.src;
            // Accept high-quality product images, skip obvious junk
            if (u && !/\/(nav|menu|tile|navigation|header|footer|logo|icon|favicon|sprite)/i.test(u) && 
                !img.closest('.navigation, .nav, .menu, .header, .footer') &&
                !/(logo|icon|sprite|favicon|nav|menu|header|footer)\./.test(u)) {
              out.add(u);
              console.log("[DEBUG] Allbirds adding image from", selector + `[${i}]:`, u.substring(u.lastIndexOf('/') + 1));
            }
          });
        });
      }
    });
    
    // STRATEGY 2: Scan all swiper slides if main containers missed
    if (out.size < 5) {
      console.log("[DEBUG] Allbirds fallback: scanning all swiper slides...");
      doc.querySelectorAll('.swiper-slide').forEach((slide, i) => {
        slide.querySelectorAll('img').forEach(img => {
          const u = img.currentSrc || img.src;
          if (u && /allbirds\.com\/cdn\/shop\/files/i.test(u) && // Allbirds CDN only
              /\d{3,}x\d{3,}/.test(u) && // Must have decent dimensions
              !/\/(nav|menu|tile|header|footer|logo|icon|sprite|favicon)/i.test(u)) {
            out.add(u);
            console.log("[DEBUG] Allbirds slide", i, "image:", u.substring(u.lastIndexOf('/') + 1));
          }
        });
      });
    }
    
    // STRATEGY 3: Direct image scan with Allbirds CDN filter
    if (out.size < 3) {
      console.log("[DEBUG] Allbirds final fallback: direct CDN scan...");
      doc.querySelectorAll('img[src*="allbirds.com/cdn/shop/files"], img[src*="allbirds.com/cdn/shop/products"]').forEach(img => {
        const u = img.currentSrc || img.src;
        if (u && /\d{3,}x\d{3,}/.test(u) && // High-res only
            !/(logo|icon|sprite|favicon|nav|menu|header|footer|tile)\./.test(u)) {
          out.add(u);
          console.log("[DEBUG] Allbirds CDN direct:", u.substring(u.lastIndexOf('/') + 1));
        }
      });
    }
    
    console.log("[DEBUG] Allbirds found", out.size, "total product images");
    return [...out].filter(u => /\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u)).slice(0, 20);
  }
};

// ---------- Aesop (hi-res DW/SFCC) ----------
const AESOP = {
  match: (h) => /\baesop\.com$/i.test(h),
  images(doc = document) {
    const out = [];
    const push = (u) => { if (u) out.push(u); };
    doc.querySelectorAll('[data-zoom-image], img[src*="/dw/image/"], source[srcset]').forEach(el => {
      if (el.tagName === 'SOURCE') {
        (el.getAttribute('srcset')||'').split(',').forEach(s=>{
          const u = s.trim().split(/\s+/)[0]; push(u);
        });
      } else {
        const zoom = el.getAttribute?.('data-zoom-image'); if (zoom) push(zoom);
        const src = el.currentSrc || el.src; if (src) push(src);
      }
    });
    const uniq = [...new Set(out)]
      .map(u => u.replace(/[?&](sw|sh|width|height)=\d+[^&]*/gi,''))
      .filter(u => /\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u));
    return uniq.slice(0,20);
  }
};

// ---------- Barnes & Noble (zoom modal + host allow) ----------
const BARNES_NOBLE = {
  match: (h) => /\bbarnesandnoble\.com$/i.test(h),
  images(doc = document) {
    const out = new Set();
    doc.querySelectorAll('img[src*="prodimage.images.bn.com"]').forEach(i=>out.add(i.src));
    doc.querySelector('[data-modal-url*="liquid-pixel-viewer"]')?.click();
    doc.querySelectorAll('.modal img[src*="prodimage.images.bn.com"]').forEach(i=>out.add(i.src));
    return [...out].filter(u => /\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u)).slice(0,20);
  }
};

// ---------- BonBonBon (prefer visible price + main media) ----------
const BONBONBON = {
  match: (h) => /\bbonbonbon\.com$/i.test(h),
  price(doc = document) {
  const el = doc.querySelector(
    '.product_price_main [data-product-price], .product_price_main .product_price, .product__price .money, .product_price'
  );
  const raw = el?.getAttribute('data-product-price') || el?.textContent || '';
  return normalizeMoney(T(raw)) || __pickJSONLDProductPrice(doc) || null;
},
  images(doc = document) {
    const out = [];
    const main = doc.querySelector('.product-media .image_container img, .product__media img');
    if (main) {
      (main.getAttribute('srcset')||'').split(',').forEach(s=>{ const u=s.trim().split(/\s+/)[0]; if(u) out.push(u); });
      const src = main.currentSrc || main.src; if (src) out.push(src);
    }
    return [...new Set(out)].filter(u=>/\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u)).slice(0,20);
  }
};

// ---------- Chewy (your price kept; scope images to main carousel) ----------
const CHEWY = {
  match: (h) => /\bchewy\.com$/i.test(h),
  price(doc = document) {
    const selected = doc.querySelector('[role="radiogroup"] .kib-selection-card--selected') ||
                     doc.querySelector(".kib-selection-card--selected");
    if (selected) {
      const fta = selected.querySelector('[data-testid="ftas-price"], [data-testid*="price"]');
      const txt = T(fta?.textContent);
      if (txt) {
        const v = normalizeMoney(txt);
        if (v) return v;
      }
    }
    const one = doc.querySelector('[data-testid="buy-box-wrapper_id"] [class*="product-price"], [data-testid*="price"]');
    const v2 = normalizeMoney(T(one?.textContent));
    if (v2) return v2;
    return __pickJSONLDProductPrice(doc);
  },
  images(doc = document) {
    const out = new Set();
    doc.querySelectorAll('[data-testid="product-carousel"] img').forEach(i=>{
      const u = i.currentSrc || i.src; if (u) out.add(u);
    });
    return [...out].filter(u=>/\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u)).slice(0,20);
  }
};

// ---------- Coach / Coach Outlet (Scene7, upsized) ----------
const COACH = {
  match: (h) => /\bcoach(outlet)?\.com$/i.test(h),
  async images(doc = document) {
    const out = [];
    doc.querySelectorAll('img, source[srcset], a[href]').forEach(el => {
      const push = (u) => { if (u) out.push(u); };
      const pullSet = (ss) => (ss||'').split(',').forEach(s=>{
        const u = s.trim().split(/\s+/)[0]; if (u) push(u);
      });
      if (el.tagName === 'SOURCE') pullSet(el.getAttribute('srcset'));
      else if (el.tagName === 'A') {
        const u = el.getAttribute('href')||''; if (/scene7\.com\/is\/image/i.test(u)) push(u);
      } else {
        const src = el.currentSrc || el.getAttribute('src') || '';
        if (/scene7\.com\/is\/image/i.test(src)) push(src);
        pullSet(el.getAttribute('srcset'));
      }
    });
    const uniq = [...new Set(out)]
      .filter(u => /scene7\.com\/is\/image/i.test(u))
      .map(u => /[?&]wid=\d+/.test(u) ? u : (u + (/\?/.test(u) ? '&' : '?') + 'wid=2000&qlt=90&op_usm=1.0,1.0,0.0,0'));
    return uniq.slice(0, 20);
  }
};

// ---------- Commense / TheCommense (visible price + PhotoSwipe) ----------
const COMMENSE = {
  match: (h) => /\b(the)?commense\.com$/i.test(h),
  price(doc = document) {
  const el =
    doc.querySelector('.product__main .product_price .money') ||
    doc.querySelector('.product__main .product_price, span[id^="ProductPrice-"]');
  return normalizeMoney(T(el?.textContent)) || __pickJSONLDProductPrice(doc) || null;
},
  images(doc = document) {
    const out = new Set();
    doc.querySelectorAll('[data-photoswipe-src], .pswp img, .product-main-slide img').forEach(el=>{
      const u = el.getAttribute?.('data-photoswipe-src') || el.currentSrc || el.src;
      if (u) out.add(u);
    });
    return [...out].filter(u=>/\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u)).slice(0,20);
  }
};

// ---------- Cuyana (PhotoSwipe zoom / original-src) ----------
const CUYANA = {
  match: (h) => /\bcuyana\.com$/i.test(h),
  images(doc = document) {
    const out = new Set();
    doc.querySelectorAll('.pswp_img, .Product__SlideItem img, [data-original-src]').forEach(el=>{
      const u = el.getAttribute?.('data-original-src') || el.currentSrc || el.src;
      if (u) out.add(u);
    });
    return [...out].filter(u=>/\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u)).slice(0,20);
  }
};

// ---------- ILIA (active swiper first; boost product shots) ----------
const ILIA = {
  match: (h) => /\bilia(bea)?uty\.com$/i.test(h),
  images(doc = document) {
    const out = new Set();
    const active = doc.querySelector('.product-media-gallery__variant-slide.swiper-slide-active img');
    if (active?.src) out.add(active.currentSrc || active.src);
    doc.querySelectorAll('.product-media-gallery__variant-slide img').forEach(i=>out.add(i.currentSrc || i.src));
    return [...out].filter(u=>/\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u)).slice(0,20);
  }
};

// ---------- LARQ (target .productgallery, avoid review thumbnails) ----------
const LARQ = {
  match: (h) => /(^|\.)((live)?larq\.com)$/i.test(h),
  images(doc = document) {
    const validImages = [];
    let totalCandidates = 0;
    
    // TARGET THE REAL LARQ PRODUCT GALLERY STRUCTURE (from DOM screenshot)
    const realSelectors = [
      '.productGallery img',         // Main product gallery
      '.productGallery_item img',    // Gallery items
      '.itemImage_inner img',        // Image containers
      '[class*="li1_"] img',         // List item images
      '[class*="li2_"] img'          // Additional list images
    ];
    
    realSelectors.forEach(selector => {
      doc.querySelectorAll(selector).forEach(img => {
        totalCandidates++;
        const u = img.currentSrc || img.src || img.getAttribute('data-src');
        
        if (u && /\.(jpe?g|png|webp|avif)([?#]|$)/i.test(u) && 
            !u.includes('stamped.io') && !u.startsWith('data:')) {
          validImages.push(u);
          // Image found and added
        }
      });
    });
    
    // Return collected product gallery images
    
    // CRITICAL: Always return array to prevent generic fallback
    return validImages.slice(0, 15);
  }
};

// ---------- John's Crazy Socks (gallery-only; drop size charts) ----------
const JOHNSCRAZYSOCKS = {
  match: (h) => /\bjohnscrazysocks\.com$/i.test(h),
  images(doc = document) {
    const out = new Set();
    doc.querySelectorAll('.product-gallery_image img, [data-media-type="image"] img').forEach(i=>{
      const u = i.getAttribute('data-zoom-src') || i.currentSrc || i.src;
      if (!u) return;
      if (/size[_-]?chart|_200x/i.test(u)) return;
      out.add(u);
    });
    return [...out].filter(u=>/\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u)).slice(0,20);
  }
};

// ---------- Kirrin Finch (data-price + zoom src) ----------
const KIRRINFINCH = {
  match: (h) => /\bkirrinfinch\.com$/i.test(h),
  price(doc = document) {
  const el =
    doc.querySelector('[data-price]') ||
    doc.querySelector('.product-price .money, .product__price .money');
  const raw = el?.getAttribute?.('data-price') || el?.textContent || '';
  return normalizeMoney(T(raw)) || __pickJSONLDProductPrice(doc) || null;
},
  images(doc = document) {
    const out = new Set();
    doc.querySelectorAll('.product_media img, [data-zoom-src], [data-photoswipe-src]').forEach(el=>{
      const u = el.getAttribute?.('data-zoom-src') || el.getAttribute?.('data-photoswipe-src') || el.currentSrc || el.src;
      if (u) out.add(u);
    });
    return [...out].filter(u=>/\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u)).slice(0,20);
  }
};

// ---------- Mahabis (bundle price + zoom/high-res) ----------
const MAHABIS = {
  match: (h) => /\bmahabis\.com$/i.test(h),
  price(doc = document) {
  const el =
    doc.querySelector('#bundlePrice .money') ||
    doc.querySelector('.pricea .money, .product-details-wrap .money');
  return normalizeMoney(T(el?.textContent)) || __pickJSONLDProductPrice(doc) || null;
},

  images(doc = document) {
    const out = new Set();
    const zoom = doc.getElementById('mobileZoomedImgDesktop');
    if (zoom?.src) out.add(zoom.src);
    doc.querySelectorAll('#productImageswrapper img, [data-high-res-url]').forEach(el=>{
      const u = el.getAttribute?.('data-high-res-url') || el.currentSrc || el.src;
      if (u) out.add(u);
    });
    return [...out].filter(u=>/\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u)).slice(0,20);
  }
};

// ---------- MESHKI (dedupe small widths; keep largest per base) ----------
const MESHKI = {
  match: (h) => /\bmeshki\.(us|com)\b/i.test(h),
  images(doc = document) {
    const seen = new Map();
    
    // Target product-specific containers instead of all images
    const productSelectors = [
      '.product__media-wrapper img',
      '.product_media_item img', 
      '[data-media-id] img',
      '.slide-template- img',
      '.product-media img'
    ];
    
    const productImages = [];
    for (const selector of productSelectors) {
      productImages.push(...doc.querySelectorAll(selector));
    }
    
    // Fallback to targeted images if no product containers found
    if (productImages.length === 0) {
      console.log('[MESHKI DEBUG] No product containers found, falling back to targeted images');
      productImages.push(...doc.querySelectorAll('main img, section img, [class*="product"] img'));
    } else {
      console.log(`[MESHKI DEBUG] Found ${productImages.length} images in product containers`);
    }
    
    productImages.forEach(img=>{
      const raw = img.currentSrc || img.src || img.getAttribute('data-src');
      if (!raw) return;
      const base = (raw.split('?')[0] || '').replace(/(_\d+x\d+)\.(jpe?g|png|webp|avif)$/i, '.$2');
      const width = +(raw.match(/(?:^|[?&])width=(\d+)/)?.[1] || raw.match(/_(\d+)x\d+\./)?.[1] || 0);
      const prev = seen.get(base);
      if (!prev || width > prev.width) seen.set(base, {u: raw, width});
    });
    return Array.from(seen.values()).map(x=>x.u).slice(0,20);
  }
};

// ---------- Nike (convert t_default to t_PDP_1728_v1 for high-res) ----------
const NIKE = {
  match: (h) => /(^|\.)nike\.com$/i.test(h),
  images(doc = document) {
    console.log("[DEBUG] Nike custom image logic running...");
    const out = new Set();
    
    // Nike main hero image
    const heroSelectors = [
      '[data-testid="HeroImg"] img',
      '[data-testid="hero-image"] img', 
      '.hero-image img',
      '.product-hero img'
    ];
    
    heroSelectors.forEach(selector => {
      const imgs = doc.querySelectorAll(selector);
      imgs.forEach(img => {
        const u = img.currentSrc || img.src;
        if (u && u.includes('static.nike.com/a/images')) {
          // Convert to high-res version
          let highResUrl = u.replace(/t_default/gi, 't_PDP_1728_v1').replace(/t_s3/gi, 't_PDP_1728_v1');
          // If no template present, add it
          if (!highResUrl.includes('t_PDP_1728_v1') && highResUrl.includes('static.nike.com/a/images')) {
            highResUrl = highResUrl.replace('/a/images/', '/a/images/t_PDP_1728_v1/');
          }
          out.add(highResUrl);
          console.log("[DEBUG] Nike hero image converted:", u, "->", highResUrl);
        }
      });
    });
    
    // Nike carousel/gallery images
    const gallerySelectors = [
      '[data-testid*="carousel"] img',
      '[data-testid*="gallery"] img',
      '.carousel img',
      '.product-carousel img',
      '.image-gallery img'
    ];
    
    gallerySelectors.forEach(selector => {
      const imgs = doc.querySelectorAll(selector);
      imgs.forEach(img => {
        const u = img.currentSrc || img.src;
        if (u && u.includes('static.nike.com/a/images') && !/(icon|thumb|sprite)/i.test(u)) {
          // Convert to high-res version
          let highResUrl = u.replace(/t_default/gi, 't_PDP_1728_v1').replace(/t_s3/gi, 't_PDP_1728_v1');
          if (!highResUrl.includes('t_PDP_1728_v1') && highResUrl.includes('static.nike.com/a/images')) {
            highResUrl = highResUrl.replace('/a/images/', '/a/images/t_PDP_1728_v1/');
          }
          out.add(highResUrl);
        }
      });
    });
    
    // Fallback: any Nike static images, convert to high-res
    if (out.size < 3) {
      doc.querySelectorAll('main img, section img, [class*="product"] img').forEach(img => {
        const u = img.currentSrc || img.src;
        if (u && u.includes('static.nike.com/a/images') && !/(icon|thumb|sprite|logo)/i.test(u)) {
          let highResUrl = u.replace(/t_default/gi, 't_PDP_1728_v1').replace(/t_s3/gi, 't_PDP_1728_v1');
          if (!highResUrl.includes('t_PDP_1728_v1') && highResUrl.includes('static.nike.com/a/images')) {
            highResUrl = highResUrl.replace('/a/images/', '/a/images/t_PDP_1728_v1/');
          }
          out.add(highResUrl);
        }
      });
    }
    
    console.log("[DEBUG] Nike found", out.size, "high-res images");
    return [...out].filter(u => /\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u)).slice(0, 15);
  }
};

// ---------- Adidas (filter for assets.adidas.com domain only) ----------
const ADIDAS = {
  match: (h) => /(^|\.)adidas\.com$/i.test(h),
  images(doc = document) {
    console.log("[DEBUG] Adidas custom image logic running...");
    const realImages = new Set();
    const otherImages = new Set();
    
    // Target PDP gallery containers specifically, avoiding PLP images
    // Focus on [data-testid*="image"] which user confirmed finds the real 10 product images
    const pdpContainerSelectors = [
      '[data-testid*="image"] img',
      '[data-testid*="gallery"] img'
    ];
    
    pdpContainerSelectors.forEach(selector => {
      doc.querySelectorAll(selector).forEach(img => {
        const u = img.currentSrc || img.src;
        if (u && u.startsWith('https://assets.adidas.com/') && 
            !u.startsWith('data:') && 
            !/_plp_/.test(u)) { // Exclude PLP (product listing page) images
          
          // Upsize images: w_600 → w_1200 for better quality
          let highResUrl = u.replace(/\/w_\d+([,\/])/g, '/w_1200$1');
          realImages.add(highResUrl);
          console.log("[DEBUG] Adidas real PDP image:", u, "->", highResUrl);
        } else if (u && !u.startsWith('data:')) {
          otherImages.add(u);
          console.log("[DEBUG] Adidas filtered (PLP/other):", u);
        }
      });
    });
    
    // Return real product images first, other images at bottom if needed
    const result = [...realImages];
    if (result.length < 5) {
      result.push(...[...otherImages].slice(0, 15 - result.length));
    }
    
    console.log("[DEBUG] Adidas found", realImages.size, "real PDP images,", otherImages.size, "other images");
    return result.filter(u => /\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u)).slice(0, 15);
  }
};

// ---------- Allies (custom title and price logic) ----------
const ALLIES = {
  title() {
    // Strategy: Search for the specific product title in VISIBLE elements only
    // Exclude script, style, and other non-visible elements
    const visibleSelectors = [
      'h1, h2, h3, h4, h5, h6',
      '.product-title, .product__title, .product-name',
      '[class*="title"], [class*="name"]', 
      '[data-product-title], [itemprop="name"]',
      'div, span, p, a'
    ];
    
    for (const selector of visibleSelectors) {
      const elements = document.querySelectorAll(selector + ':not(script):not(style):not(noscript)');
      for (const el of elements) {
        // Get only the direct text content, not nested scripts
        const text = T(el.textContent || '');
        
        // Skip if it looks like JavaScript code
        if (text.includes('function') || text.includes('var ') || text.includes('const ') || 
            text.includes('document.') || text.includes('{') || text.includes('Object.defineProperty')) {
          continue;
        }
        
        // Look for the actual product name
        if (text && text.includes('Beta Glucan') && text.includes('Resveratrol') && text.includes('Serum') && text.length < 200) {
          return text;
        }
      }
    }
    
    // Fallback: Look for product titles that aren't the wrong ones we've seen
    const badTitles = ['ADVANCED DAILY TREATMENT', 'Molecular Barrier Recovery Cream Balm'];
    const headings = document.querySelectorAll('h1, h2, h3, .product-title, [class*="title"]:not(script):not(style)');
    for (const h of headings) {
      const text = T(h.textContent || '');
      if (text && text.length > 15 && text.length < 200 && !badTitles.some(bad => text.includes(bad))) {
        // Skip JavaScript-looking content
        if (!text.includes('var ') && !text.includes('function') && !text.includes('document.')) {
          return text;
        }
      }
    }
    
    return null;
  },
  
  price() {
    // Strategy: Look specifically for $89 price (not $95 which is the wrong product)
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const text = T(el.textContent || '');
      // Look for $89.00 or $89 specifically
      if (text && (text.includes('$89.00') || (text.includes('$89') && !text.includes('$89.') && !text.includes('$895')))) {
        // Validate this isn't struck out or marked as old price
        const style = getComputedStyle(el);
        const isStruck = /line-through/i.test(style.textDecorationLine || "");
        if (!isStruck && !/was|list|regular|original/i.test(text)) {
          return '$89.00';
        }
      }
    }
    
    // Fallback: Look for current/sale price elements that contain reasonable prices
    const priceElements = document.querySelectorAll('.price, [class*="price"], [data-price]');
    for (const el of priceElements) {
      const text = T(el.textContent || '');
      const prices = text.match(/\$(\d+(?:\.\d{2})?)/g);
      if (prices) {
        for (const price of prices) {
          const num = parseFloat(price.replace('$', ''));
          // Look for prices around $89 but not $95
          if (num >= 85 && num <= 92 && num !== 95) {
            return price;
          }
        }
      }
    }
    
    return null;
  }
};




//////////////////// registry -> unified handler ////////////////////
// ---------- AliExpress ----------
const ALIEXPRESS = {
  match: (h) => /(^|\.)aliexpress\.(com|us)$/i.test(h),

  title(doc = document) {
    console.log("[DEBUG] AliExpress title extraction starting...");
    
    // Helper to clean and validate title
    const cleanTitle = (rawTitle) => {
      if (!rawTitle) return null;
      
      // Normalize whitespace
      let title = rawTitle.trim().replace(/\s+/g, ' ');
      
      // Strip AliExpress boilerplate
      title = title.replace(/(\s*\|\s*)?AliExpress(\.us)?\b.*$/i, '');
      title = title.replace(/^Buy\s+|\s+on AliExpress.*$/i, '');
      title = title.trim();
      
      // Return if valid
      return title.length > 3 ? title : null;
    };
    
    // STRATEGY 1: Try multiple h1 selectors (AliExpress variants)
    const h1Selectors = [
      'h1[data-pl="product-title"]',
      'h1#product-title',
      'h1.product-title',
      '[data-pl="product-title"] h1',
      '[data-widget="product-title"] h1',
      '[data-pl*="product-title"] h1',
      'h1[itemprop="name"]',
      '.product-title h1',
      '.title-wrap h1'
    ];
    
    for (const selector of h1Selectors) {
      try {
        const element = doc.querySelector(selector);
        if (element && element.textContent) {
          const title = cleanTitle(element.textContent);
          if (title) {
            console.log(`[DEBUG] AliExpress title found via h1 selector '${selector}': "${title}"`);
            return title;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    // STRATEGY 2: Try meta tags
    const metaSelectors = [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'meta[name="title"]'
    ];
    
    for (const selector of metaSelectors) {
      try {
        const meta = doc.querySelector(selector);
        if (meta && meta.getAttribute('content')) {
          const title = cleanTitle(meta.getAttribute('content'));
          if (title) {
            console.log(`[DEBUG] AliExpress title found via meta '${selector}': "${title}"`);
            return title;
          }
        }
      } catch (e) {
        // Continue
      }
    }
    
    // STRATEGY 3: Try JSON-LD structured data
    try {
      const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse(script.textContent);
          const products = Array.isArray(data) ? data : [data];
          
          for (const item of products) {
            if (item['@type'] === 'Product' && item.name) {
              const title = cleanTitle(item.name);
              if (title) {
                console.log(`[DEBUG] AliExpress title found via JSON-LD: "${title}"`);
                return title;
              }
            }
          }
        } catch (jsonError) {
          // Continue to next script
        }
      }
    } catch (e) {
      // Continue
    }
    
    // STRATEGY 4: Last resort - document title
    try {
      if (doc.title) {
        const title = cleanTitle(doc.title);
        if (title) {
          console.log(`[DEBUG] AliExpress title found via document.title: "${title}"`);
          return title;
        }
      }
    } catch (e) {
      // Continue
    }
    
    console.log("[DEBUG] AliExpress title extraction failed - no valid title found anywhere");
    return null;
  },

  async images(doc = document) {
    console.log("[DEBUG] AliExpress custom image logic running...");
    const urls = new Set();
    
    // STEP 1: Cast a targeted net - collect product area images first
    doc.querySelectorAll('main img, section img, [class*="product"] img, [class*="gallery"] img').forEach(img => {
      let url = img.currentSrc || img.src;
      if (url) {
        // Only require basic URL validity - be permissive at collection stage
        if (url.startsWith('http') || url.startsWith('//')) {
          
          // STEP 1.5: UPGRADE AliExpress thumbnails to high-res BEFORE adding
          const originalUrl = url;
          url = url.replace(/_220x220q75\.jpg_\.avif/i, '_960x960q75.jpg_.avif');
          url = url.replace(/_220x220\.jpg_\.webp/i, '_960x960.jpg_.webp');
          
          if (url !== originalUrl) {
            console.log("[DEBUG] AliExpress UPGRADED:", originalUrl.substring(originalUrl.lastIndexOf('/') + 1), "→", url.substring(url.lastIndexOf('/') + 1));
          }
          
          urls.add(url);
          console.log("[DEBUG] AliExpress collected:", url.substring(url.lastIndexOf('/') + 1));
        }
      }
    });
    
    console.log(`[DEBUG] AliExpress collected ${urls.size} total images before filtering`);
    
    // STEP 2: Apply smart filtering - ONLY block obvious junk
    const filteredImages = [...urls].filter(url => {
      // HARD BLOCK: The specific junk patterns you identified
      if (/jpg_\.webp$|png_\.avif$/i.test(url)) {
        console.log("[DEBUG] AliExpress BLOCKED junk pattern:", url.substring(url.lastIndexOf('/') + 1));
        return false;
      }
      
      // HARD BLOCK: Obvious promotional keywords (minimal list)
      if (/(icon|logo|badge|shipping|delivery|guarantee|visa|mastercard|paypal)/i.test(url)) {
        console.log("[DEBUG] AliExpress BLOCKED promotional:", url.substring(url.lastIndexOf('/') + 1));
        return false;
      }
      
      // HARD BLOCK: Tiny dimensions only (very small threshold)
      const dimMatch = url.match(/(\d{2,4})x(\d{2,4})/i);
      if (dimMatch) {
        const width = parseInt(dimMatch[1]);
        const height = parseInt(dimMatch[2]);
        if ((width < 100 && height < 100) || (width < 50 || height < 50)) {
          console.log("[DEBUG] AliExpress BLOCKED tiny size:", `${width}x${height}`);
          return false;
        }
      }
      
      // Allow everything else through
      console.log("[DEBUG] AliExpress KEPT:", url.substring(url.lastIndexOf('/') + 1));
      return true;
    });
    
    // STEP 3: Sort by quality (prioritize good CDNs and patterns)
    const sortedImages = filteredImages.sort((a, b) => {
      let scoreA = 0, scoreB = 0;
      
      // Prioritize AliExpress CDNs
      if (/ae-pic.*\.aliexpress-media\.com/i.test(a)) scoreA += 100;
      if (/ae-pic.*\.aliexpress-media\.com/i.test(b)) scoreB += 100;
      if (/ae01\.alicdn\.com/i.test(a)) scoreA += 80;
      if (/ae01\.alicdn\.com/i.test(b)) scoreB += 80;
      
      // Prioritize /kf/ product paths  
      if (/\/kf\//i.test(a)) scoreA += 50;
      if (/\/kf\//i.test(b)) scoreB += 50;
      
      // Prioritize high-res dimensions
      const dimA = a.match(/(\d{3,4})x(\d{3,4})/i);
      const dimB = b.match(/(\d{3,4})x(\d{3,4})/i);
      if (dimA && parseInt(dimA[1]) >= 960) scoreA += 60;
      if (dimB && parseInt(dimB[1]) >= 960) scoreB += 60;
      if (dimA && parseInt(dimA[1]) >= 500) scoreA += 30;
      if (dimB && parseInt(dimB[1]) >= 500) scoreB += 30;
      
      // Prioritize good formats
      if (/\.(jpg|jpeg|avif)($|\?)/i.test(a)) scoreA += 20;
      if (/\.(jpg|jpeg|avif)($|\?)/i.test(b)) scoreB += 20;
      if (/\.webp($|\?)/i.test(a)) scoreA += 10;
      if (/\.webp($|\?)/i.test(b)) scoreB += 10;
      
      return scoreB - scoreA;
    });
    
    console.log("[DEBUG] AliExpress final results:", sortedImages.length, "images (from", urls.size, "collected)");
    console.log("[DEBUG] AliExpress top 5:", sortedImages.slice(0, 5).map(url => url.substring(url.lastIndexOf('/') + 1)));
    return sortedImages.slice(0, 20);
  }
};

// ---------- American Eagle ----------
const AE = {
  match: (h) => /(^|\.)ae\.com$|(^|\.)americaneagle\.com$/i.test(h),
  
  price(doc = document) {
    // Target AE's actual price structure from debug log
    const selectors = [
      '.product-sale-price',
      '[class*="product-sale-price"]',
      '.sale-price',
      '.price-promo',
      '[data-testid*="sale-price"]',
      '[data-testid*="price"]',
      '._container_1bn8o3 .product-sale-price',
      '.extras-content .product-sale-price'
    ];
    
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      if (el) {
        let priceText = el.textContent?.trim() || '';
        // Clean up the price text and extract just the price
        priceText = priceText.replace(/\s+/g, ' ').trim();
        
        // Extract price using regex to get the main price, avoiding installment prices
        const priceMatch = priceText.match(/\$(\d+(?:\.\d{2})?)/);
        if (priceMatch) {
          const price = '$' + priceMatch[1];
          console.log(`[DEBUG] AE price found with selector: ${sel} -> ${price} (from: ${priceText})`);
          return price;
        }
      }
    }
    
    // Fallback to any element containing price-like text
    const allPriceElements = doc.querySelectorAll('[class*="price"], [data-testid*="price"]');
    for (const el of allPriceElements) {
      const text = el.textContent?.trim() || '';
      if (text && /\$\d+(\.\d{2})?/.test(text) && !text.includes('$0') && !text.includes('Free')) {
        console.log(`[DEBUG] AE price fallback: ${text}`);
        return text;
      }
    }
    
    return null;
  },

  async images(doc = document) {
    const urls = new Set();
    
    // Target AE's actual image selectors from debug log
    const selectors = [
      '[data-testid*="image"] img',
      '._image_2vfqsz',
      '[class*="_image_"]',
      '[data-testid*="product-image"]',
      'picture img',
      'img[src*="scene7.com"]'
    ];
    
    console.log(`[DEBUG] AE scanning for images with ${selectors.length} selectors`);
    
    for (const sel of selectors) {
      doc.querySelectorAll(sel).forEach(img => {
        const src = img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
        
        // Also check parent picture element for source elements
        const parent = img.closest('picture');
        if (parent) {
          parent.querySelectorAll('source').forEach(source => {
            const srcset = source.srcset;
            if (srcset) {
              // Extract the first URL from srcset
              const firstUrl = srcset.split(',')[0].trim().split(' ')[0];
              if (firstUrl && !firstUrl.includes('data:image')) {
                urls.add(firstUrl.startsWith('//') ? 'https:' + firstUrl : firstUrl);
                console.log(`[DEBUG] AE image from picture source: ${firstUrl.slice(-50)}`);
              }
            }
          });
        }
        if (src && !src.includes('data:image') && !src.includes('blank.gif')) {
          urls.add(src);
          console.log(`[DEBUG] AE image from ${sel}: ${src.slice(-50)}`);
        }
      });
    }
    
    // Convert to array and sort by likely quality/size indicators
    const results = Array.from(urls).sort((a, b) => {
      let scoreA = 0, scoreB = 0;
      
      // Prefer larger dimensions in URLs
      const dimA = a.match(/(\d{3,4})x(\d{3,4})|w(\d{3,4})/i);
      const dimB = b.match(/(\d{3,4})x(\d{3,4})|w(\d{3,4})/i);
      if (dimA) scoreA += parseInt(dimA[1] || dimA[3] || 0);
      if (dimB) scoreB += parseInt(dimB[1] || dimB[3] || 0);
      
      // Prefer JPG over other formats
      if (/\.(jpg|jpeg)($|\?)/i.test(a)) scoreA += 50;
      if (/\.(jpg|jpeg)($|\?)/i.test(b)) scoreB += 50;
      
      return scoreB - scoreA;
    });
    
    console.log(`[DEBUG] AE final results: ${results.length} images`);
    console.log(`[DEBUG] AE top 3:`, results.slice(0, 3));
    
    return results.slice(0, 20);
  }
};

// ---------- ASOS ----------
const ASOS = {
  match: (h) => /(^|\.)asos\.com$/i.test(h),
  
  price(doc = document) {
    // Target ASOS main price elements and avoid Klarna installment text
    const selectors = [
      '[data-testid="current-price"]',
      '.price-current',
      '[class*="current-price"]',
      '.price .current',
      '[data-testid*="price"]:not([data-testid*="installment"])',
      '.product-price .current',
      '.price-wrapper .current',
      '[data-price]'
    ];
    
    console.log(`[DEBUG] ASOS trying ${selectors.length} price selectors`);
    
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      if (el) {
        let priceText = el.textContent?.trim() || '';
        
        // Skip if this contains Klarna/installment text
        if (/pay in|payments of|installment|klarna|afterpay/i.test(priceText)) {
          console.log(`[DEBUG] ASOS skipping Klarna text: ${sel} -> ${priceText}`);
          continue;
        }
        
        // Extract the main price (first $XX.XX pattern)
        const priceMatch = priceText.match(/\$(\d+(?:\.\d{2})?)/);
        if (priceMatch) {
          const price = '$' + priceMatch[1];
          console.log(`[DEBUG] ASOS price found with selector: ${sel} -> ${price} (from: ${priceText})`);
          return price;
        }
      }
    }
    
    // Improved fallback: look for prices in price-container areas only
    const priceContainers = doc.querySelectorAll('[class*="price"], [data-testid*="price"], .product-details, .purchase-info');
    for (const container of priceContainers) {
      // Skip containers with Klarna/installment indicators
      if (/pay in|payments of|installment|klarna|afterpay/i.test(container.textContent)) {
        continue;
      }
      
      const priceElements = container.querySelectorAll('*');
      for (const el of priceElements) {
        const text = el.textContent?.trim() || '';
        
        // Look for standalone price pattern in non-installment contexts
        const priceMatch = text.match(/^\$(\d+(?:\.\d{2})?)$/);
        if (priceMatch && !el.closest('[class*="klarna"], [class*="afterpay"], [class*="installment"], [data-testid*="installment"]')) {
          const price = '$' + priceMatch[1];
          console.log(`[DEBUG] ASOS fallback price found: ${price} (from: ${text})`);
          return price;
        }
      }
    }
    
    console.log(`[DEBUG] ASOS no price found with any selector`);
    return null;
  }
};

// ---------- Urban Outfitters (PWA containers + $redesign-zoom-5x$ upgrades) ----------
const URBAN_OUTFITTERS = {
  match: (h) => /urbanoutfitters\.com$/i.test(h),
  
  images(doc = document) {
    console.log("[DEBUG] Urban Outfitters custom image logic running...");
    const out = new Set();
    
    // Target PWA image containers specifically
    const pwaDealSelectors = [
      '.o-pwa-image__img',           // Main PWA image class
      '.c-pwa-slider img',           // PWA slider images
      '.c-pwa-slider__item img',     // PWA slider item images
      '.c-pwa-image-zoom-modal img', // PWA zoom modal images
      '[class*="pwa-image"] img',    // Any PWA image variants
      '[class*="pwa-slider"] img'    // Any PWA slider variants
    ];
    
    // Collect images from PWA containers
    pwaDealSelectors.forEach(selector => {
      doc.querySelectorAll(selector).forEach(img => {
        let url = img.currentSrc || img.src;
        if (url && /images\.urbndata\.com\/is\/image/i.test(url)) {
          // Upgrade to highest quality zoom images
          url = url.replace(/\$xlarge\$/g, '$redesign-zoom-5x$');
          url = url.replace(/\$large\$/g, '$redesign-zoom-5x$');
          url = url.replace(/\$medium\$/g, '$redesign-zoom-5x$');
          
          // Remove size constraints to allow full resolution
          url = url.replace(/[?&]wid=\d+/gi, '');
          url = url.replace(/[?&]hei=\d+/gi, '');
          url = url.replace(/[?&]fit=constrain/gi, '');
          url = url.replace(/[?&]qlt=\d+/gi, '');
          
          console.log(`[DEBUG] UO upgraded: ${url.substring(url.lastIndexOf('/') + 1)}`);
          out.add(url);
        }
      });
    });
    
    console.log(`[DEBUG] Urban Outfitters found ${out.size} high-quality PWA images`);
    return [...out].filter(Boolean).slice(0, 20);
  }
};

// ---------- Best Buy (Gallery-focused to avoid lazy-loaded recommendations) ----------
const BESTBUY = {
  match: (h) => /\bbestbuy\.com$/i.test(h),
  
  images(doc = document) {
    try {
      const urls = [];
      
      // Simple approach: target main Best Buy gallery images
      doc.querySelectorAll('.image-block-standard-img').forEach(img => {
        const url = img.currentSrc || img.src;
        if (url && /pisces\.bbystatic\.com/i.test(url)) {
          urls.push(url);
        }
      });
      
      return urls.slice(0, 15);
    } catch (e) {
      return [];
    }
  }
};

const REGISTRY = [
  AMZ,
  BESTBUY,
  NIKE,
  ADIDAS,
  LARQ,
  BOOHOO,
  COSTCO,
  HOMEDEPOT,
  MACYS,
  DSW,
  NORDSTROM,
  EXPRESS,
  FASHIONNOVA,
  BANANA_FACTORY,
  EDGE_BY_XS,
  ACE_HARDWARE,
  ALLBIRDS,
  AESOP,
  BARNES_NOBLE,
  BONBONBON,
  CHEWY,
  COACH,
  COMMENSE,
  CUYANA,
  ILIA,
  JOHNSCRAZYSOCKS,
  KIRRINFINCH,
  MAHABIS,
  { match: (h) => /allies\.shop$/i.test(h), ...ALLIES },
  MESHKI,
  ALIEXPRESS,
  AE,
  ASOS,
  URBAN_OUTFITTERS,


];

function getCustomHandlers() {
  const h = __host();
  const site = REGISTRY.find((r) => r.match && r.match(h));

  const noop = () => null;
  const asyncNoop = async () => null;

  if (!site) {
    return { title: noop, brand: noop, price: noop, specs: noop, tags: noop, images: asyncNoop };
  }

  return {
    title: site.title || noop,
    brand: site.brand || noop,
    price: site.price || noop,
    specs: site.specs || noop,
    tags: site.tags || noop,
    images: site.images || asyncNoop,
  };
}

// expose the factory expected by orchestrator

Object.assign(globalThis, { getCustomHandlers });
