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
  document.querySelectorAll('[class*="chip"],[class*="pill"],[class*="tag"],[class*="badge"]').forEach(el => {
    const t = T(el.textContent); if (t) tags.push(t);
  });
  const ATTR=/(material|fabric|composition|care|wash|fit|rise|inseam|length|dimensions?|weight|capacity|volume|sku|style|model|color|colour|size range|waist|bust|hip|heel|shaft|calf|origin)/i;
  document.querySelectorAll("tr,li,dt").forEach(el=>{
    const s=T(el.textContent);
    if (ATTR.test(s)) {
      const m = s.match(/^(.*?)[\s:–-]+(.*)$/);
      const val = m ? T(m[2]) : s;
      const key = m ? T(m[1]).toLowerCase() : "";
      if (val) tags.push(key ? `${key}: ${val}` : val);
    }
  });
  const selected = document.querySelector('[aria-checked="true"][role="radio"], .selected, [data-selected="true"]');
  const swatchText = T(selected?.textContent);
  if (swatchText && /color|colour|tone|shade/i.test(selected?.parentElement?.textContent||"")) {
    tags.push(`color: ${swatchText}`);
  }
  const metaKw = document.querySelector('meta[name="keywords"]')?.content || "";
  if (metaKw) metaKw.split(",").slice(0,6).map(T).forEach(k => { if (k && k.length <= 30) tags.push(k); });
  const crumb = document.querySelector('.breadcrumb, nav[aria-label*=crumb], [class*="crumb"]');
  if (crumb) {
    const parts = T(crumb.textContent).split(/>|\//).map(T).filter(Boolean);
    if (parts.length) tags.push(parts[parts.length-1]);
  }
  return uniq(tags).map(t=>t.replace(/\s{2,}/g," ")).filter(t=>t && t.length<=40).slice(0,limit);
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
