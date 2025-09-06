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

  function nearestProductRoot() {
    const h1 = q("h1");
    let node = h1;
    while (node) {
      const cls = (node.className || "") + " " + (node.id || "");
      if (/(pdp|product|__product|detail|details|gallery|media|image)/i.test(cls)) return node;
      node = node.parentElement;
    }
    return (
      q('[role="region"][aria-label*="gallery" i]') ||
      q('[aria-roledescription="carousel" i]') ||
      q('[data-testid*="gallery" i]') ||
      q(".gallery, .pdp, .product, [class*='Product'], [class*='Gallery']") ||
      document.body
    );
  }
  const root = nearestProductRoot();

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

  // ---------- Filters / allow-list ----------
  const EXT_ALLOW = /\.(jpe?g|png|webp|avif)(\?|#|$)/i;
  const BAD_PATH =
    /(\/|^)(plp|listing|category|promo|cms|ad|recommend|recs|similar|also|upsell|sprite|icons?|iconography|favicons?|size[_-]?chart|swatch|colorway|variant|placeholder)\b/i;
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

  const ensure = (u, w = 0, h = 0, from = "", element = null) => {
    try {
      if (!u) return;
      u = upgradeUrl(u);
      if (!looksHttp(u)) return;

      if (BAD_HOST.test(u)) return;
      if (!EXT_ALLOW.test(u)) return;               // block svg, gif, etc.
      if (BAD_PATH.test(u)) return;
      if (BAD_CONTENT.test(u)) return;              // block charts, graphs, analytics images

      const key = urlKey(u);
      if (!candidates.has(key))
        candidates.set(key, { url: u, w, h, hits: 0, from: new Set(), element });
      const rec = candidates.get(key);
      rec.hits++;
      rec.from.add(from);
      if (w * h > rec.w * rec.h) { rec.w = w; rec.h = h; rec.url = u; }
      if (element && !rec.element) rec.element = element; // Store first element reference
    } catch {}
  };

  function addFromImg(img) {
    const w = img.naturalWidth || 0,
          h = img.naturalHeight || 0;

    [
      "data-photoswipe-src","data-zoom-image","data-zoom","data-large","data-large-image",
      "data-src-large","data-hires","data-original"
    ].forEach((a) => {
      const v = img.getAttribute(a);
      if (v) ensure(v, w, h, "hires");
    });

    const src = img.currentSrc || img.src;
    if (src) ensure(src, w, h, "img");

    keepBiggestFromSrcset(img.getAttribute("srcset")).forEach((u) =>
      ensure(u, w, h, "srcset")
    );

    const a = img.closest("a[href]");
    if (a && EXT_ALLOW.test(a.getAttribute("href")))
      ensure(a.href, w, h, "anchor");
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

  // ---------- scoring / filters ----------
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
      
      // Enhanced content filtering - check element context if available
      if (r.element) {
        const altText = (r.element.alt || '').toLowerCase();
        const title = (r.element.title || '').toLowerCase();
        const parentText = (r.element.closest('[class*="chart"], [class*="graph"], [class*="data"], [class*="analytics"]')?.textContent || '').toLowerCase();
        
        // Skip images with chart/graph context (more comprehensive)
        if (/(chart|graph|data|analytics|metric|statistic|diagram|visualization|dashboard|report|stats|trend|performance|analysis|insights|roi|conversion|revenue|growth|bar|line|pie|donut|scatter)/i.test(altText + ' ' + title + ' ' + parentText)) {
          console.log(`[DEBUG] Filtering out analytical image: ${r.url.split('/').pop()}`);
          return false;
        }
        
        // Additional filename checks for common chart image patterns
        const filename = r.url.split('/').pop().toLowerCase();
        if (/(chart|graph|stats|data|metric|analytics|dashboard|report|performance|trend|roi|conversion)[-_\.]/.test(filename)) {
          console.log(`[DEBUG] Filtering out analytical filename: ${filename}`);
          return false;
        }
        
        // Skip images in obvious non-product containers
        if (r.element.closest('.sidebar, .footer, .header, [class*="related"], [class*="recommend"], [class*="similar"], [class*="also-"], [class*="you-may"]')) {
          console.log(`[DEBUG] Filtering out non-product container image: ${r.url.split('/').pop()}`);
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
        console.log(`[DEBUG] Image ${r.url.substring(r.url.lastIndexOf('/') + 1)} - Area score: ${s - relevanceScore}, Relevance score: ${relevanceScore}, Total: ${s}`);
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
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const finalUrls = scored.slice(0, 20).map((r) => r.url);
  console.log("[DEBUG] collectImagesFromPDP found", finalUrls.length, "images:", finalUrls.slice(0, 3));
  return finalUrls;
}

Object.assign(globalThis, { collectImagesFromPDP });