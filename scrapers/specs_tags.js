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
  const workingSelectors = [];

  // Method 1: Chip/pill/tag/badge elements
  const chipElements = document.querySelectorAll('[class*="chip"],[class*="pill"],[class*="tag"],[class*="badge"]');
  if (chipElements.length > 0) {
    chipElements.forEach(el => {
      const t = T(el.textContent); 
      if (t) {
        tags.push(t);
        workingSelectors.push('[class*="chip"],[class*="pill"],[class*="tag"],[class*="badge"]');
      }
    });
  }

  // Method 2: Attribute extraction from table rows, list items, and definition terms
  const ATTR=/(material|fabric|composition|care|wash|fit|rise|inseam|length|dimensions?|weight|capacity|volume|sku|style|model|color|colour|size range|waist|bust|hip|heel|shaft|calf|origin)/i;
  const attrElements = document.querySelectorAll("tr,li,dt");
  if (attrElements.length > 0) {
    attrElements.forEach(el=>{
      const s=T(el.textContent);
      if (ATTR.test(s)) {
        const m = s.match(/^(.*?)[\s:–-]+(.*)$/);
        const val = m ? T(m[2]) : s;
        const key = m ? T(m[1]).toLowerCase() : "";
        if (val) {
          tags.push(key ? `${key}: ${val}` : val);
          workingSelectors.push("tr,li,dt");
        }
      }
    });
  }

  // Method 3: Selected color swatches
  const selected = document.querySelector('[aria-checked="true"][role="radio"], .selected, [data-selected="true"]');
  const swatchText = T(selected?.textContent);
  if (swatchText && /color|colour|tone|shade/i.test(selected?.parentElement?.textContent||"")) {
    tags.push(`color: ${swatchText}`);
    workingSelectors.push('[aria-checked="true"][role="radio"], .selected, [data-selected="true"]');
  }

  // Method 4: Meta keywords
  const metaKw = document.querySelector('meta[name="keywords"]')?.content || "";
  if (metaKw) {
    const metaTagsAdded = metaKw.split(",").slice(0,6).map(T).filter(k => k && k.length <= 30);
    if (metaTagsAdded.length > 0) {
      metaTagsAdded.forEach(k => tags.push(k));
      workingSelectors.push('meta[name="keywords"]');
    }
  }

  // Method 5: Breadcrumb navigation
  const crumb = document.querySelector('.breadcrumb, nav[aria-label*=crumb], [class*="crumb"]');
  if (crumb) {
    const parts = T(crumb.textContent).split(/>|\//).map(T).filter(Boolean);
    if (parts.length) {
      tags.push(parts[parts.length-1]);
      workingSelectors.push('.breadcrumb, nav[aria-label*=crumb], [class*="crumb"]');
    }
  }

  const finalTags = uniq(tags).map(t=>t.replace(/\s{2,}/g," ")).filter(t=>t && t.length<=40).slice(0,limit);
  
  // If we found tags, return with selector tracking
  if (finalTags.length > 0) {
    const uniqueSelectors = [...new Set(workingSelectors)];
    return {
      tags: finalTags,
      selector: uniqueSelectors.join(', '),
      attr: 'text',
      method: 'multi-source'
    };
  }
  
  return null;
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

// Alias for orchestrator compatibility
function collectTagsGeneric(document, limit = 12) {
  return collectTags(limit);
}

Object.assign(globalThis, { collectSpecs, collectTags, collectTagsGeneric, guessGender, getSKU });
