// scrapers/images.js
// exact image collector
// NOTE: relies on global utils: T, uniq, looksHttp from utils.js

async function collectImagesFromPDP() {
    if (window.__TAGGLO_IMAGES_ALREADY_RAN__) return [];
window.__TAGGLO_IMAGES_ALREADY_RAN__ = true;
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

  function urlKey(u) {
    try {
      const a = document.createElement("a");
      a.href = u;
      return a.protocol + '//' + a.host + a.pathname; // strip query/hash
    } catch { return u; }
  }

  const ensure = (u, w = 0, h = 0, from = "") => {
    try {
      if (!u) return;
      u = upgradeUrl(u);
      if (!looksHttp(u)) return;

      if (BAD_HOST.test(u)) return;
      if (!EXT_ALLOW.test(u)) return;               // block svg, gif, etc.
      if (BAD_PATH.test(u)) return;

      const key = urlKey(u);
      if (!candidates.has(key))
        candidates.set(key, { url: u, w, h, hits: 0, from: new Set() });
      const rec = candidates.get(key);
      rec.hits++;
      rec.from.add(from);
      if (w * h > rec.w * rec.h) { rec.w = w; rec.h = h; rec.url = u; }
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
  if (candidates.size < 3) {
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
      // kill obvious promos/carusel nav thumbs by dimension hints in path
      if (/(promo|topnav|carousel|thumb|tile|banner|pod|badge|awards?)\b/i.test(clean)) return false;
      return true;
    })
    .map((r) => {
      const nameBits = (r.url.split("?")[0].split("/").pop() || "");
      const rel = overlap(nameBits);
      let s = 0;
      const area = r.w * r.h;
      s += area >= 1600 * 1600 ? 12 : area >= 1200 * 1200 ? 9 : area >= 800 * 800 ? 6 : area >= 500 * 500 ? 4 : 0;
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

  return scored.slice(0, 20).map((r) => r.url);
}

Object.assign(globalThis, { collectImagesFromPDP });