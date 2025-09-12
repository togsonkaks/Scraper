// scrapers/images.js
// exact image collector
// NOTE: relies on global utils: T, uniq, looksHttp from utils.js

async function collectImagesFromPDP() {
    if (window.__TAGGLO_IMAGES_ALREADY_RAN__) return [];
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

  // --- tiny helpers ---
  const q = (sel, scope=document) => scope.querySelector(sel);
  const qa = (sel, scope=document) => Array.from(scope.querySelectorAll(sel));

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

  // ---------- helpers for bg images + swiper/slider wake ----------
  function __bgUrlsFrom(el) {
    const out = [];
    const pull = (v) => {
      if (!v) return;
      const m = String(v).match(/url\((['"]?)(.*?)\1\)/gi);
      if (!m) return;
      m.forEach(tok => {
        const mm = tok.match(/url\((['"]?)(.*?)\1\)/i);
        if (mm && mm[2]) out.push(mm[2]);
      });
    };
    try { pull(el.style?.backgroundImage); } catch {}
    try { pull(getComputedStyle(el).backgroundImage); } catch {}
    return out;
  }

  async function __wakeSwiperGalleries(scope=document) {
    const slides = scope.querySelectorAll('.swiper-slide, [class*="swiper-"], [data-swiper-slide-index], .slick-slide, .glide__slide, .splide__slide');
    if (!slides.length) return;
    slides.forEach((s,i) => {
      try {
        s.dispatchEvent(new Event('mouseenter', {bubbles:true}));
        s.dispatchEvent(new Event('mouseover', {bubbles:true}));
        if (i < 10) s.scrollIntoView({block:'nearest', inline:'nearest'});
      } catch {}
    });
    await new Promise((r)=>setTimeout(r,140));
  }
  // --------------------------------------------------------

  async function wakeLazy(scope) {
    const h = Math.max(2000, document.body.scrollHeight);
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 60));
    window.scrollTo(0, h);
    await new Promise((r) => setTimeout(r, 140));
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 60));

    // common lazy attrs & photoswipe source promotion
    scope.querySelectorAll("img, [data-src], [data-srcset], [data-photoswipe-src], [data-image], [data-large-image], [data-zoom-image]").forEach((el) => {
      try {
        const img = el.tagName === "IMG" ? el : el.querySelector("img");
        if (img) {
          img.loading = "eager";
          img.decoding = "sync";
          const ds =
            img.getAttribute("data-photoswipe-src") ||
            img.getAttribute("data-zoom-image") ||
            img.getAttribute("data-image") ||
            img.getAttribute("data-large-image") ||
            img.getAttribute("data-src") ||
            img.getAttribute("data-original") ||
            img.getAttribute("data-lazy");
          if (ds && !img.src) img.src = ds;
          const dss = img.getAttribute("data-srcset") || img.getAttribute("data-lazy-srcset");
          if (dss && !img.getAttribute("srcset")) img.setAttribute("srcset", dss);
        }
      } catch {}
    });

    // click open common zoom modals if present (B&N, PhotoSwipe, etc.)
    const zoomBtns = scope.querySelectorAll('[data-modal], [data-zoom], [data-testid="image-magnify"], button[title*="zoom" i], .product__photo-zoom, .js-photoswipe__zoom');
    zoomBtns.forEach(btn => { try { btn.click(); } catch {} });
    await __wakeSwiperGalleries(scope);
  }

  // ---------- Context-Aware Filters / allow-list ----------
  const EXT_ALLOW = /\.(jpe?g|png|webp|avif)(\?|#|$)/i;
  // Remove 'cms' from BAD_PATH as it's used by legitimate CDNs like Ace Hardware
  const BAD_PATH =
    /(\/|^)(plp|listing|category|promo|ad|recommend|recs|similar|also|upsell|sprite|icons?|iconography|favicons?|size[_-]?chart|swatch|colorway|variant|placeholder)\b/i;
  
  // Known product CDNs that don't require extensions
  const TRUSTED_PRODUCT_CDNS = [
    /cdn-tp3\.mozu\.com/i,           // Ace Hardware
    /assets\.adidas\.com/i,          // Adidas
    /cdn\.shopify\.com/i,           // Shopify stores
    /m\.media-amazon\.com/i,        // Amazon
    /images-na\.ssl-images-amazon\.com/i, // Amazon
    /scene7\.com/i,                 // Adobe Scene7 CDN
    /demandware\.static/i,          // Salesforce Commerce Cloud
  ];
  
  // Check if URL is from a trusted product CDN
  function isTrustedProductCDN(url) {
    return TRUSTED_PRODUCT_CDNS.some(pattern => pattern.test(url));
  }
  
  // Pre-validate URL to catch broken/error images
  function preValidateUrl(url) {
    if (!url || url.length < 10) return false;
    
    // Block obvious error patterns
    if (/(transparent-pixel|grey-pixel|error|404|not-found|placeholder\.)/i.test(url)) return false;
    
    // Block navigation sprites and UI elements
    if (/(sprite|nav-sprite|icon-sprite|ui-sprite)/i.test(url)) return false;
    
    // Block obvious non-product patterns
    if (/(tracking|analytics|pixel|beacon|1x1|blank\.)/i.test(url)) return false;
    
    // Block review platforms (never product images)
    if (/(stamped\.io|trustpilot\.com|reviews\.io|yotpo\.com)/.test(url)) return false;
    
    // Block app store badges and social media icons
    if (/(app-store|google-play|apple-store|download|badge|social|facebook|twitter|instagram|pinterest)/.test(url)) return false;
    
    // Block COMMENSE app store badges specifically
    if (/img\.shopoases\.com/.test(url)) return false;
    
    // Block page URLs that aren't real images (like Adidas product pages)
    if (/\/(us|uk|ca|au)\/.*-(shoes|clothing|apparel|boots|sneakers|shirts|pants)\//.test(url)) return false;
    
    return true;
  }
  
  // Extract actual dimensions from URL patterns
  function extractDimensionsFromUrl(url) {
    let w = 0, h = 0;
    
    // Shopify: _640x640
    const shopifyMatch = url.match(/_(\d+)x(\d+)/i);
    if (shopifyMatch) {
      w = parseInt(shopifyMatch[1]);
      h = parseInt(shopifyMatch[2]);
    }
    
    // SFCC/Demandware: ?sw=600&sh=400
    const sfccWMatch = url.match(/[?&]sw=(\d+)/i);
    const sfccHMatch = url.match(/[?&]sh=(\d+)/i);
    if (sfccWMatch) w = parseInt(sfccWMatch[1]);
    if (sfccHMatch) h = parseInt(sfccHMatch[1]);
    
    // Generic patterns: 523x, width=600, etc.
    if (!w) {
      const widthMatch = url.match(/(\d{3,4})x\./) || url.match(/[?&]w(?:idth)?=(\d+)/i);
      if (widthMatch) w = parseInt(widthMatch[1]);
    }
    if (!h) {
      const heightMatch = url.match(/x(\d{3,4})\./) || url.match(/[?&]h(?:eight)?=(\d+)/i);
      if (heightMatch) h = parseInt(heightMatch[1]);
    }
    
    return { w, h };
  }
  const BAD_NAME =
    /(logo|loading|spinner|placeholder|cookie|consent|banner|hero-banner|header-?banner|badge|ribbon|reward|tracking|pixel|close|arrow|prev|next|play|pause|thumbnail|thumbs?|_56x|_112x|_200x)(\.|-|_|\/)/i;
  const BAD_HOST =
    /(doubleclick|googletag|google-analytics|bat\.bing|cookielaw|consent|quantserve|hotjar|optimizely|branch\.io|facebook|gstatic|segment|tealium|moatads|criteo|adnxs|taboola)/i;
  
  // Filter out chart/graph/analytical images by filename and content patterns
  const BAD_CONTENT = /(chart|graph|analytics|data|metric|statistic|diagram|plot|visualization|infographic|table|spreadsheet|csv|excel|\bchart\b|\bgraph\b|\bdata\b|dashboard|report|stats|trend|performance|analysis|insights|roi|conversion|revenue|sales-chart|bar-chart|line-chart|pie-chart)/i;
  const TINY_HINT = /(^|_|-)(16|24|32|40|48|64|80|96|120|150|180|200)(x|_|-)?(16|24|32|40|48|64|80|96|120|150|180|200)?(\.|$)/i;

  // normalize obvious CDN “small → big” patterns (Shopify, DW/SFCC, Scene7)
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

      // SFCC (Demandware): .../dw/image/v2/... ?sw=600&sh=600 → bump if small
      if (/\/dw\/image\/v2\//i.test(url)) {
        url = url.replace(/[?&](sw|sh)=\d+/gi, "");
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

  const candidates = new Map();
  console.log("[DEBUG] Image collection starting with", candidates.size, "candidates");

  function urlKey(u) {
    try {
      const a = document.createElement("a");
      a.href = u;
      return a.protocol + '//' + a.host + a.pathname; // strip query/hash
    } catch { return u; }
  }

  const ensure = (u, w = 0, h = 0, from = "", imgElement = null) => {
    try {
      if (!u) return;
      
      // Pre-validate before any processing
      if (!preValidateUrl(u)) return;
      
      u = upgradeUrl(u);
      if (!looksHttp(u)) return;

      if (BAD_HOST.test(u)) return;
      
      // Context-aware filtering: check for product context before applying hard filters
      const isFromProductGallery = from && from.startsWith('gallery-');
      const isTrustedCDN = isTrustedProductCDN(u);
      const isInProductContainer = imgElement && imgElement.closest('.product, .pdp, [class*="Product"], [data-testid*="product"], [data-testid*="gallery"], [data-testid*="image"]');
      
      // Apply context-aware extension filtering
      if (!EXT_ALLOW.test(u)) {
        // Allow URLs without extensions if they're from trusted sources
        if (!(isTrustedCDN || isFromProductGallery || isInProductContainer)) {
          console.log(`[DEBUG] Blocked no-extension URL (not in product context): ${u.substring(u.lastIndexOf('/') + 1)}`);
          return;
        }
      }
      
      // Apply context-aware path filtering
      if (BAD_PATH.test(u)) {
        // Allow some "bad" paths if they're from product contexts
        if (!(isTrustedCDN || isFromProductGallery)) {
          console.log(`[DEBUG] Blocked bad path URL: ${u.substring(u.lastIndexOf('/') + 1)}`);
          return;
        }
      }
      
      if (BAD_CONTENT.test(u)) return;              // block charts, graphs, analytics images

      // Try to extract dimensions from URL if not provided
      if ((!w || !h) && u) {
        const extracted = extractDimensionsFromUrl(u);
        if (extracted.w > w) w = extracted.w;
        if (extracted.h > h) h = extracted.h;
      }

      const key = urlKey(u);
      if (!candidates.has(key))
        candidates.set(key, { url: u, w, h, hits: 0, from: new Set(), element: imgElement });
      const rec = candidates.get(key);
      rec.hits++;
      rec.from.add(from);
      if (imgElement && !rec.element) rec.element = imgElement;
      if (w * h > rec.w * rec.h) { rec.w = w; rec.h = h; rec.url = u; }
    } catch {}
  };

  function addFromImg(img) {
    const w = img.naturalWidth || parseInt(img.width) || 0,
          h = img.naturalHeight || parseInt(img.height) || 0;

    [
      "data-photoswipe-src","data-zoom-image","data-zoom","data-large","data-large-image",
      "data-src-large","data-hires","data-original"
    ].forEach((a) => {
      const v = img.getAttribute(a);
      if (v) ensure(v, w, h, "hires", img);
    });

    const src = img.currentSrc || img.src;
    if (src) ensure(src, w, h, "img", img);

    keepBiggestFromSrcset(img.getAttribute("srcset")).forEach((u) => {
      // For srcset, try to extract width from descriptor
      const srcsetParts = img.getAttribute("srcset") || "";
      const match = srcsetParts.match(new RegExp(u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(\\d+)w'));
      const srcsetW = match ? parseInt(match[1]) : w;
      ensure(u, srcsetW, h, "srcset", img);
    });

    const a = img.closest("a[href]");
    if (a) {
      const href = a.getAttribute("href");
      if (href && (EXT_ALLOW.test(href) || isTrustedProductCDN(href)))
        ensure(a.href, w, h, "anchor", img);
    }
  }

  function addFromPicture(pic) {
    pic.querySelectorAll("source[srcset]").forEach((s) => {
      keepBiggestFromSrcset(s.getAttribute("srcset")).forEach((u) =>
        ensure(u, 0, 0, "picture")
      );
    });
    const img = pic.querySelector("img");
    if (img) addFromImg(img);
  }

  function addFromNoscript(scope) {
    scope.querySelectorAll("noscript").forEach((ns) => {
      try {
        const tmp = document.createElement("div");
        tmp.innerHTML = ns.textContent || ns.innerHTML || "";
        tmp.querySelectorAll("img").forEach(addFromImg);
        tmp.querySelectorAll("source[srcset]").forEach((s) => {
          keepBiggestFromSrcset(s.getAttribute("srcset")).forEach((u) =>
            ensure(u, 0, 0, "noscript")
          );
        });
      } catch {}
    });
  }

  function addMeta() {
    [
      'meta[property="og:image:secure_url"]',
      'meta[property="og:image:url"]',
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'link[rel="image_src"]',
    ].forEach((sel) => {
      const el = q(sel);
      const u = el?.content || el?.href;
      if (u) ensure(u, 0, 0, "meta");
    });
  }

  // ---- RUN COLLECTORS ----
  await wakeLazy(root);

  // standard sources
  root.querySelectorAll("picture").forEach(addFromPicture);
  root.querySelectorAll("img").forEach(addFromImg);
  addFromNoscript(root);
  addMeta();

  // background-image / swiper / lazy attrs on non-imgs
  root.querySelectorAll('[style*="background-image"], .swiper-slide, [class*="swiper-"], .slick-slide, .glide__slide, .splide__slide, [data-bg], [data-background]').forEach(el => {
    __bgUrlsFrom(el).forEach(u => ensure(u, 0, 0, "bg"));
    const dataBg = el.getAttribute("data-bg") || el.getAttribute("data-background");
    if (dataBg) ensure(dataBg, 0, 0, "bg-data");
    // sometimes slides carry data-zoom-image on the wrapper
    ["data-photoswipe-src","data-zoom-image","data-large-image","data-image","data-gallery-image"].forEach(a=>{
      const v = el.getAttribute(a);
      if (v) ensure(v, 0, 0, "zoom-attr");
    });
  });

  // Barnes & Noble / PhotoSwipe modal (if open)
  document.querySelectorAll('.pswp img, .modal-body img, [class*="zoom"] img').forEach(addFromImg);

  // Wide fallback sweep if few found
  console.log("[DEBUG] After initial collection:", candidates.size, "candidates");
  if (candidates.size < 3) {
    console.log("[DEBUG] Too few candidates, doing wide sweep...");
    await wakeLazy(document);
    await __wakeSwiperGalleries(document);

    document.querySelectorAll("picture").forEach(addFromPicture);
    document.querySelectorAll("img").forEach(addFromImg);
    addFromNoscript(document);
    addMeta();

    document.querySelectorAll('[style*="background-image"], .swiper-slide, [class*="swiper-"], .slick-slide, .glide__slide, .splide__slide, [data-bg], [data-background]').forEach(el => {
      __bgUrlsFrom(el).forEach(u => ensure(u, 0, 0, "bg"));
      const dataBg = el.getAttribute("data-bg") || el.getAttribute("data-background");
      if (dataBg) ensure(dataBg, 0, 0, "bg-data");
      ["data-photoswipe-src","data-zoom-image","data-large-image","data-image","data-gallery-image"].forEach(a=>{
        const v = el.getAttribute(a);
        if (v) ensure(v, 0, 0, "zoom-attr");
      });
    });

    document.querySelectorAll('.pswp img, .modal-body img, [class*="zoom"] img').forEach(addFromImg);
    console.log("[DEBUG] After wide sweep:", candidates.size, "candidates");
  }

  // ---------- gallery-based collection first ----------
  // If we found product galleries, prioritize images from those containers
  if (productGalleries.length > 0) {
    console.log('[DEBUG] Using gallery-based collection');
    for (const gallery of productGalleries) {
      for (const img of gallery.images) {
        if (img.src || img.currentSrc) {
          const w = img.naturalWidth || parseInt(img.width) || 0;
          const h = img.naturalHeight || parseInt(img.height) || 0;
          ensure(img.currentSrc || img.src, w, h, `gallery-${gallery.priority}`, img);
          
          // Also check for data attributes on gallery images
          ["data-src", "data-original", "data-large", "data-zoom-image", "data-large-image"].forEach(attr => {
            const val = img.getAttribute(attr);
            if (val) ensure(val, w, h, `gallery-${gallery.priority}-${attr}`, img);
          });
        }
      }
    }
  }

  // ---------- scoring / filters with ORDER PRESERVATION ----------
  const overlap = (s) => {
    const low = s.toLowerCase();
    let hits = 0;
    for (const t of titleTokens) if (t.length >= 3 && low.includes(t)) hits++;
    return hits;
  };

  const scored = [...candidates.values()]
    .filter((r) => {
      const clean = (r.url.split("?")[0] || "");
      if (BAD_NAME.test(clean)) return false;
      if (TINY_HINT.test(clean)) return false;
      if (BAD_CONTENT.test(clean)) return false; // Additional check for charts/graphs
      // kill obvious promos/carusel nav thumbs by dimension hints in path
      if (/(promo|topnav|carousel|thumb|tile|banner|pod|badge|awards?)\b/i.test(clean)) return false;
      
      // Enhanced but less restrictive content filtering
      if (r.element) {
        const altText = (r.element.alt || '').toLowerCase();
        const title = (r.element.title || '').toLowerCase();
        const parentText = (r.element.closest('[class*="chart"], [class*="graph"], [class*="analytics"]')?.textContent || '').toLowerCase();
        
        // Only skip obvious analytical content (be more permissive)
        if (/(chart|graph|analytics|dashboard|report|statistics|diagram|visualization)/i.test(altText + ' ' + title) ||
            /(chart|graph|analytics|dashboard|report)[-_\.]/.test(r.url.split('/').pop().toLowerCase())) {
          console.log(`[DEBUG] Filtering out analytical image: ${r.url.split('/').pop()}`);
          return false;
        }
        
        // Skip images in obvious non-product containers (but be less strict)
        if (r.element.closest('.sidebar, .footer, .header-nav, [class*="navigation"], .menu')) {
          console.log(`[DEBUG] Filtering out navigation/sidebar image: ${r.url.split('/').pop()}`);
          return false;
        }
        
        // Skip very obvious non-product images by filename
        const filename = r.url.split('/').pop().toLowerCase();
        if (/(logo|icon|avatar|profile|banner|ad|advertisement|promo|thumb|thumbnail)[-_\.]/.test(filename) && !/product|item|shoe|sneaker|apparel|clothing/.test(filename)) {
          console.log(`[DEBUG] Filtering out non-product filename: ${filename}`);
          return false;
        }
      }
      
      return true;
    })
    .map((r) => {
      const nameBits = (r.url.split("?")[0].split("/").pop() || "");
      const rel = overlap(nameBits);
      let s = 0;
      const area = r.w * r.h;
      s += area >= 1600 * 1600 ? 12 : area >= 1200 * 1200 ? 9 : area >= 800 * 800 ? 6 : area >= 500 * 500 ? 4 : 0;
      
      // Add relevance scoring based on image positioning and context
      if (r.element) {
        const relevanceScore = scoreImageRelevance(r.url, r.element);
        s += relevanceScore;
        
        // Extra bonus for gallery images
        if (r.from && Array.from(r.from).some(src => src.startsWith('gallery-'))) {
          s += 25; // Strong bonus for gallery images
          console.log(`[DEBUG] Gallery image bonus: ${r.url.substring(r.url.lastIndexOf('/') + 1)}`);
        }
        
        console.log(`[DEBUG] Image ${r.url.substring(r.url.lastIndexOf('/') + 1)} - Area: ${s - relevanceScore - (r.from && Array.from(r.from).some(src => src.startsWith('gallery-')) ? 25 : 0)}, Relevance: ${relevanceScore}, Total: ${s}`);
      }
      if (r.w && r.h) {
        const ar = r.w / Math.max(1, r.h);
        if (ar > 3.2 || ar < 0.3) s -= 6; // banner-ish or too tall
      }
      s += 2 * rel;                                // title overlap
      if (r.from.has("picture") || r.from.has("hires") || r.from.has("srcset")) s += 4;
      if (r.from.has("bg") || r.from.has("bg-data")) s += 2;
      if (/hero|main|default|primary|front|product|zoom|large|full|pdp/i.test(r.url)) s += 2;

      // gentle allow-list nudges by host for tricky sites
      if (/scene7\.com\/is\/image/i.test(r.url)) s += 3;                   // Coach
      if (/prodimage\.images\.bn\.com|prodimage\.images\.bn-?com/i.test(r.url)) s += 3; // B&N

      return { ...r, score: s };
    })
    .filter((r) => r.score > 0);

  // ========== ORDER PRESERVATION LOGIC ==========
  // Instead of reordering by score, preserve gallery order and mark the best image
  let finalUrls = [];
  let bestIndex = -1;
  let bestScore = 0;
  let primaryUrl = '';
  
  // If we found product galleries, prioritize their order
  if (productGalleries.length > 0 && productGalleries[0].images.length > 0) {
    console.log('[DEBUG] Using gallery order preservation');
    
    // Create a mapping of URLs to scores for lookup
    const urlToScore = new Map();
    scored.forEach(item => {
      const key = urlKey(item.url);
      urlToScore.set(key, item);
    });
    
    // Process gallery images in their original DOM order
    for (const gallery of productGalleries) {
      for (let i = 0; i < gallery.images.length && finalUrls.length < 20; i++) {
        const img = gallery.images[i];
        const imgSrc = img.currentSrc || img.src;
        if (imgSrc) {
          const key = urlKey(imgSrc);
          const scoreData = urlToScore.get(key);
          if (scoreData && scoreData.score > 0) {
            finalUrls.push(scoreData.url);
            
            // Track the best scoring image for marking
            if (scoreData.score > bestScore) {
              bestScore = scoreData.score;
              bestIndex = finalUrls.length - 1;
              primaryUrl = scoreData.url;
            }
          }
        }
      }
    }
    
    console.log(`[DEBUG] Gallery order preserved: ${finalUrls.length} images, best at index ${bestIndex}`);
  }
  
  // Fallback: if no gallery found or not enough images, use traditional scoring
  if (finalUrls.length < 3) {
    console.log('[DEBUG] Using traditional score-based ordering');
    const sortedScored = scored.sort((a, b) => b.score - a.score);
    finalUrls = sortedScored.slice(0, 20).map((r) => r.url);
    bestIndex = finalUrls.length > 0 ? 0 : -1;
    primaryUrl = finalUrls.length > 0 ? finalUrls[0] : '';
  }

  console.log("[DEBUG] collectImagesFromPDP found", finalUrls.length, "images:", finalUrls.slice(0, 3));
  if (bestIndex >= 0) {
    console.log(`[DEBUG] Best image at position ${bestIndex + 1}: ${primaryUrl.substring(primaryUrl.lastIndexOf('/') + 1)}`);
  }
  
  // For backwards compatibility, return just the URLs array
  // Enhanced metadata available via collectImagesFromPDPEnhanced() if needed
  return finalUrls;
}

Object.assign(globalThis, { collectImagesFromPDP });