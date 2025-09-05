// generic title + brand (unchanged logic)
function getTitleGeneric() {
  return T(document.querySelector("h1")?.innerText) ||
         T(document.querySelector('meta[property="og:title"]')?.content) ||
         null;
}

function getBrandGeneric() {
  for (const b of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(b.textContent.trim());
      const arr = Array.isArray(data) ? data : [data];
      for (const node of arr) {
        const types = [].concat(node?.["@type"]||[]).map(String);
        if (types.some(t=>/product/i.test(t))) {
          const brand = node.brand?.name || node.brand || node.manufacturer?.name || "";
          if (brand && T(brand)) return T(brand);
        }
      }
    } catch {}
  }
  const metaBrand =
    document.querySelector('meta[property="product:brand"]')?.content ||
    document.querySelector('meta[name="brand"]')?.content ||
    document.querySelector('[itemprop="brand"] [itemprop="name"]')?.textContent ||
    document.querySelector('[itemprop="brand"]')?.getAttribute("content") ||
    document.querySelector('[itemprop="brand"]')?.textContent || "";
  return T(metaBrand) || null;
}

Object.assign(globalThis, { getTitleGeneric, getBrandGeneric });
