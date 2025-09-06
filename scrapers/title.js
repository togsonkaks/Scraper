// generic title + brand (improved with product container scoping)
function getTitleGeneric() {
  // First, try to find the main product container
  const productContainers = [
    '.product-detail, .product-details, .product-main, .product-container',
    '#product, #product-detail, #product-main',
    '[data-product], [data-product-detail]',
    '.pdp, .product-page, .item-detail',
    'main .product, article .product',
    '.product-info, .product-content'
  ];
  
  let productContainer = null;
  for (const selector of productContainers) {
    productContainer = document.querySelector(selector);
    if (productContainer) break;
  }
  
  // If we found a product container, search within it first
  if (productContainer) {
    const scopedSelectors = [
      'h1', 'h2',
      '.product-title, .product__title, .product-name',
      '[data-product-title], [itemprop="name"]'
    ];
    
    for (const sel of scopedSelectors) {
      const el = productContainer.querySelector(sel);
      if (el) {
        const text = T(el.innerText || el.textContent);
        if (text && text.length > 5) return text;
      }
    }
  }
  
  // Fallback: try document-wide search but prioritize product-related selectors
  const globalSelectors = [
    '.product-title, .product__title, .product-name',
    '[data-product-title], [itemprop="name"]',
    'h1:not(nav h1):not(header h1):not(.site-title)',
    'h1'
  ];
  
  for (const sel of globalSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = T(el.innerText || el.textContent);
      if (text && text.length > 5) return text;
    }
  }
  
  // Final fallback: og:title meta tag
  return T(document.querySelector('meta[property="og:title"]')?.content) || null;
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
