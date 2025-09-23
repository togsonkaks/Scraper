// specs, tags, gender, sku (unchanged)
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
  
  // Look for structured product attributes (more selective)
  const ATTR=/(material|fabric|composition|care|wash|fit|rise|inseam|length|dimensions?|weight|capacity|volume|sku|style|model|color|colour|size|waist|bust|hip|heel|shaft|calf|origin|brand|type|category)/i;
  document.querySelectorAll("tr,li,dt").forEach(el=>{
    // Only check if the element is within a product details section
    const inProductSection = el.closest('[class*="product"], [class*="detail"], [class*="spec"], [class*="attribute"], [class*="info"], main, [role="main"]');
    if (!inProductSection) return;
    
    const s = T(el.textContent);
    if (ATTR.test(s) && s.length <= 60) {
      const m = s.match(/^(.*?)[\s:–-]+(.*)$/);
      const val = m ? T(m[2]) : s;
      const key = m ? T(m[1]).toLowerCase() : "";
      if (val && val.length <= 30) tags.push(key ? `${key}: ${val}` : val);
    }
  });
  
  // Selected color/variant (high quality signal)
  const selected = document.querySelector('[aria-checked="true"][role="radio"], .selected, [data-selected="true"]');
  const swatchText = T(selected?.textContent);
  if (swatchText && swatchText.length <= 20 && /color|colour|tone|shade/i.test(selected?.parentElement?.textContent||"")) {
    tags.push(`color: ${swatchText}`);
  }
  
  // Only use meta keywords if they look product-related (not just SEO spam)
  const metaKw = document.querySelector('meta[name="keywords"]')?.content || "";
  if (metaKw) {
    metaKw.split(",").slice(0,4).map(T).forEach(k => { 
      if (k && k.length <= 25 && !/^(shop|buy|sale|deals?|free|best|top|new|popular|trending|fashion|style)$/i.test(k)) {
        tags.push(k); 
      }
    });
  }
  
  // Category from breadcrumb (last meaningful item, not "home")
  const crumb = document.querySelector('.breadcrumb, nav[aria-label*=crumb], [class*="crumb"]');
  if (crumb) {
    const parts = T(crumb.textContent).split(/>|\//).map(T).filter(Boolean);
    const lastPart = parts[parts.length-1];
    if (lastPart && lastPart.length <= 25 && !/^(home|shop|all|products?)$/i.test(lastPart)) {
      tags.push(lastPart);
    }
  }
  
  return uniq(tags)
    .map(t => t.replace(/\s{2,}/g," ").trim())
    .filter(t => t && t.length >= 2 && t.length <= 40)
    .slice(0, limit);
}

function guessGender() {
  const text = (document.body.innerText || "").toLowerCase();
  const url  = location.href.toLowerCase();
  const crumbs = (document.querySelector('.breadcrumb, nav[aria-label*=crumb], [class*="crumb"]')?.innerText || "").toLowerCase();
  const hay = url + " " + crumbs + " " + text;
  if (/(^|\b)(women|womens|woman|ladies|female|womenswear)(\b|$)/i.test(hay)) return "women";
  if (/(^|\b)(men|mens|man|menswear)(\b|$)/i.test(hay)) return "men";
  if (/(^|\b)(girls|girl)(\b|$)/i.test(hay)) return "girls";
  if (/(^|\b)(boys|boy)(\b|$)/i.test(hay)) return "boys";
  if (/\bunisex\b/i.test(hay)) return "unisex";
  return null;
}

function getSKU() {
  for (const b of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(b.textContent.trim());
      const arr = Array.isArray(data) ? data : [data];
      for (const node of arr) {
        const types = [].concat(node?.["@type"]||[]).map(String);
        if (types.some(t=>/product/i.test(t))) {
          const sku = node.sku || node.productID || node.mpn || node.gtin13 || node.gtin || "";
          if (sku) return T(sku);
        }
      }
    } catch {}
  }
  const metaSku = document.querySelector('meta[property="product:retailer_item_id"]')?.content ||
                  document.querySelector('meta[itemprop="sku"]')?.content ||
                  document.querySelector('[itemprop="sku"]')?.textContent || "";
  return T(metaSku) || null;
}

Object.assign(globalThis, { collectSpecs, collectTags, guessGender, getSKU });
