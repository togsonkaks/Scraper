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
        if (text && text.length > 5) {
          return {
            text: text,
            selector: sel,
            attr: 'text'
          };
        }
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
      if (text && text.length > 5) {
        return {
          text: text,
          selector: sel,
          attr: 'text'
        };
      }
    }
  }
  
  // Final fallback: og:title meta tag
  const ogTitle = T(document.querySelector('meta[property="og:title"]')?.content);
  if (ogTitle) {
    return {
      text: ogTitle,
      selector: 'meta[property="og:title"]',
      attr: 'content'
    };
  }
  return null;
}

function getBrandGeneric() {
  // First try JSON-LD structured data
  for (const b of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(b.textContent.trim());
      const arr = Array.isArray(data) ? data : [data];
      for (const node of arr) {
        const types = [].concat(node?.["@type"]||[]).map(String);
        if (types.some(t=>/product/i.test(t))) {
          const brand = node.brand?.name || node.brand || node.manufacturer?.name || "";
          if (brand && T(brand)) {
            return {
              text: T(brand),
              selector: 'script[type="application/ld+json"]',
              attr: 'json'
            };
          }
        }
      }
    } catch {}
  }
  
  // Extended brand selectors with more variations
  const brandSelectors = [
    'meta[property="product:brand"]',
    'meta[name="brand"]', 
    'meta[property="og:brand"]',
    '[itemprop="brand"] [itemprop="name"]',
    '[itemprop="brand"]',
    '[data-brand]',
    '.brand, .product-brand, .product__brand',
    '.manufacturer, .product-manufacturer',
    '[class*="brand"]:not([class*="branding"])',
    '.vendor, .product-vendor'
  ];
  
  for (const sel of brandSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      let brandText = "";
      if (sel.includes('data-brand')) {
        brandText = el.getAttribute('data-brand') || "";
      } else {
        brandText = el.content || el.getAttribute("content") || el.textContent || "";
      }
      if (brandText && T(brandText)) {
        return {
          text: T(brandText),
          selector: sel,
          attr: el.content || el.getAttribute("content") ? 'content' : 'text'
        };
      }
    }
  }
  
  // Try to extract brand from breadcrumbs
  const breadcrumb = document.querySelector('.breadcrumb, nav[aria-label*="breadcrumb"], [class*="breadcrumb"]');
  if (breadcrumb) {
    const links = breadcrumb.querySelectorAll('a');
    // Look for brand in second or third breadcrumb item (often: Home > Brand > Category > Product)
    for (let i = 1; i < Math.min(links.length - 1, 4); i++) {
      const text = T(links[i].textContent);
      if (text && text.length >= 3 && text.length <= 20 && !/^(home|shop|all|products?|category|categories)$/i.test(text)) {
        return {
          text: text,
          selector: '.breadcrumb a',
          attr: 'text'
        };
      }
    }
  }
  
  // Try to extract brand from URL path
  const path = location.pathname;
  const pathMatch = path.match(/\/(?:brand|brands|manufacturer)\/([^\/]+)/i);
  if (pathMatch) {
    const brandFromPath = pathMatch[1].replace(/[-_]/g, ' ').trim();
    if (brandFromPath && brandFromPath.length >= 3) {
      return {
        text: brandFromPath,
        selector: 'url-path',
        attr: 'text'
      };
    }
  }
  
  // Try common brand patterns in product titles
  const title = T(document.querySelector('h1')?.textContent);
  if (title) {
    // Look for patterns like "Nike Air Max" where first word could be brand
    const titleWords = title.split(/\s+/);
    if (titleWords.length >= 2) {
      const firstWord = titleWords[0];
      // Check if first word looks like a brand (capitalized, reasonable length)
      if (firstWord && /^[A-Z][a-zA-Z]{2,15}$/.test(firstWord) && 
          !/(the|new|sale|buy|shop|get|free|best|top|hot|limited|special|exclusive)$/i.test(firstWord)) {
        return {
          text: firstWord,
          selector: 'h1-first-word',
          attr: 'text'
        };
      }
    }
  }
  
  return null;
}

Object.assign(globalThis, { getTitleGeneric, getBrandGeneric });
