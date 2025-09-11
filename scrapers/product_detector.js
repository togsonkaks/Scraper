// Product root detection and HTML optimization for LLM efficiency
// Reduces token usage by 90-95% by focusing on product-specific content

/**
 * Find the main product container using smart signals
 */
function findProductRoot(document) {
  // 1. Try schema.org signals first (highest confidence)
  let root = document.querySelector('[itemtype*="Product"]');
  if (root && isValidProductRoot(root)) return root;
  
  // 2. Try JSON-LD structured data
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      if (hasProductType(data)) {
        // Find closest meaningful container
        const container = script.closest('main, article, [role="main"], .product, .product-detail, .product-page') || 
                         script.parentElement;
        if (container && isValidProductRoot(container)) return container;
      }
    } catch (e) {
      // Invalid JSON, skip
    }
  }
  
  // 3. Try semantic containers with e-commerce signals
  const semanticCandidates = document.querySelectorAll('main, article, [role="main"]');
  for (const candidate of semanticCandidates) {
    if (hasEcommerceSignals(candidate)) return candidate;
  }
  
  // 4. Try containers with product-specific classes
  const classCandidates = document.querySelectorAll(
    '.product, .product-detail, .product-page, .product-info, .pdp, ' +
    '.product-container, .product-main, .item-detail, .product-view'
  );
  for (const candidate of classCandidates) {
    if (hasEcommerceSignals(candidate)) return candidate;
  }
  
  // 5. Fallback: find container with highest product signal density
  return findByProductDensity(document);
}

/**
 * Check if data contains Product type (supports nested structures)
 */
function hasProductType(data) {
  if (!data) return false;
  
  // Direct type check
  if (data['@type'] === 'Product') return true;
  
  // Array of types
  if (Array.isArray(data['@type']) && data['@type'].includes('Product')) return true;
  
  // Nested in @graph
  if (data['@graph']) {
    return data['@graph'].some(item => hasProductType(item));
  }
  
  // Recursive check for nested objects
  if (typeof data === 'object') {
    return Object.values(data).some(value => 
      typeof value === 'object' && hasProductType(value)
    );
  }
  
  return false;
}

/**
 * Check if container has strong e-commerce signals
 */
function hasEcommerceSignals(container) {
  const signals = [
    // Price indicators
    '[itemtype*="Offer"]', '[itemprop*="price"]', '.price', '[data-price]',
    'meta[property*="price"]', '.cost', '.amount',
    
    // Add to cart/bag buttons
    '[data-add-to-cart]', '[data-product-id]', '.add-to-cart', '.add-to-bag',
    'button[type="submit"][name*="add"]', '.buy-now', '.purchase',
    
    // Product images/gallery
    '.product-image', '.product-gallery', '.product-photos', '.hero-image',
    '[data-zoom]', '.zoom-image', '.product-slider',
    
    // Variants/options
    '.variant', '.option', '.size-selector', '.color-selector',
    '[data-variant]', '.product-options', '.attribute-selector',
    
    // Structured data
    '[itemtype*="Product"]', '[itemprop*="name"]', '[itemprop*="description"]'
  ];
  
  // Count signals in this container
  let signalCount = 0;
  for (const signal of signals) {
    if (container.querySelector(signal)) signalCount++;
  }
  
  // Also check for text signals
  const text = container.textContent.toLowerCase();
  const textSignals = ['add to cart', 'add to bag', 'buy now', 'in stock', 'out of stock', 'select size'];
  for (const textSignal of textSignals) {
    if (text.includes(textSignal)) signalCount++;
  }
  
  return signalCount >= 3; // Need at least 3 signals for confidence
}

/**
 * Validate that a potential root is actually a good product container
 */
function isValidProductRoot(container) {
  // Skip if it's navigation/header/footer
  const negativeSignals = [
    'nav', 'header', 'footer', 'aside',
    '.site-header', '.site-footer', '.site-nav', '.navigation',
    '.breadcrumb', '.recommendations', '.related-products',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]'
  ];
  
  for (const signal of negativeSignals) {
    if (container.matches && container.matches(signal)) return false;
    if (container.closest && container.closest(signal) === container) return false;
  }
  
  // Must have some minimum content (not just wrapper)
  const textContent = container.textContent.trim();
  if (textContent.length < 100) return false;
  
  // Should have some images (product photos)
  const images = container.querySelectorAll('img');
  if (images.length < 1) return false;
  
  return true;
}

/**
 * Find container with highest product signal density (fallback)
 */
function findByProductDensity(document) {
  const allContainers = document.querySelectorAll('div, section, main, article');
  let bestContainer = null;
  let bestScore = 0;
  
  for (const container of allContainers) {
    if (!isValidProductRoot(container)) continue;
    
    const score = calculateProductScore(container);
    if (score > bestScore) {
      bestScore = score;
      bestContainer = container;
    }
  }
  
  // Fallback to body if nothing found
  return bestContainer || document.body;
}

/**
 * Calculate product relevance score for a container
 */
function calculateProductScore(container) {
  let score = 0;
  
  // Product images (high value)
  const images = container.querySelectorAll('img');
  score += Math.min(images.length * 5, 25); // Cap at 5 images
  
  // Price elements
  const priceElements = container.querySelectorAll('.price, [itemprop*="price"], [data-price]');
  score += priceElements.length * 10;
  
  // Add to cart buttons
  const cartButtons = container.querySelectorAll('.add-to-cart, .add-to-bag, [data-add-to-cart]');
  score += cartButtons.length * 15;
  
  // Structured data
  const structuredElements = container.querySelectorAll('[itemtype], [itemprop]');
  score += structuredElements.length * 3;
  
  // Penalty for navigation elements
  const navElements = container.querySelectorAll('nav, .nav, .navigation, .menu');
  score -= navElements.length * 20;
  
  return score;
}

/**
 * Trim HTML to product area and remove junk content
 */
function trimToProductArea(document, productRoot = null) {
  if (!productRoot) {
    productRoot = findProductRoot(document);
  }
  
  // Clone to avoid modifying original
  const clone = productRoot.cloneNode(true);
  
  // Remove unwanted elements
  const unwantedSelectors = [
    'nav', 'header', 'footer', 'aside',
    '.site-header', '.site-footer', '.site-nav',
    '.breadcrumb', '.navigation', '.menu',
    '.recommendations', '.related-products', '.you-may-also-like',
    '.reviews', '.review-section', '.comments',
    '.ads', '.advertisement', '.promo-banner',
    'script', 'style', 'noscript'
  ];
  
  for (const selector of unwantedSelectors) {
    const elements = clone.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  }
  
  // Limit repeated elements to reduce tokens
  limitRepeatedElements(clone, 'img', 10); // Max 10 images
  limitRepeatedElements(clone, 'a', 20);   // Max 20 links
  limitRepeatedElements(clone, 'button', 10); // Max 10 buttons
  
  // Truncate long text content
  truncateLongText(clone);
  
  return clone.outerHTML;
}

/**
 * Limit repeated elements to prevent token explosion
 */
function limitRepeatedElements(container, tagName, maxCount) {
  const elements = container.querySelectorAll(tagName);
  if (elements.length > maxCount) {
    // Keep first maxCount elements, remove the rest
    for (let i = maxCount; i < elements.length; i++) {
      elements[i].remove();
    }
  }
}

/**
 * Truncate extremely long text content
 */
function truncateLongText(container) {
  const textElements = container.querySelectorAll('p, div, span');
  for (const el of textElements) {
    if (el.children.length === 0) { // Only text nodes
      const text = el.textContent;
      if (text.length > 500) {
        el.textContent = text.substring(0, 500) + '...';
      }
    }
  }
}

/**
 * Check if we already have good heuristic data for a field (skip LLM)
 */
function hasGoodHeuristic(field, document) {
  switch (field) {
    case 'title':
      return hasGoodTitle(document);
    case 'price':
      return hasGoodPrice(document);
    case 'brand':
      return hasGoodBrand(document);
    case 'description':
      return hasGoodDescription(document);
    case 'images':
      return hasGoodImages(document);
    default:
      return false;
  }
}

function hasGoodTitle(document) {
  // Check for structured data title
  const structuredTitle = document.querySelector('[itemprop="name"], [property="og:title"], meta[name="title"]');
  if (structuredTitle) {
    const title = structuredTitle.content || structuredTitle.textContent;
    if (title && title.trim().length > 5 && title.trim().length < 200) {
      return { selector: getSelector(structuredTitle), value: title.trim() };
    }
  }
  
  // Check for h1 in product area
  const productRoot = findProductRoot(document);
  const h1 = productRoot.querySelector('h1');
  if (h1) {
    const title = h1.textContent.trim();
    if (title.length > 5 && title.length < 200 && !isNavigationText(title)) {
      return { selector: getProductScopedSelector(h1, productRoot), value: title };
    }
  }
  
  return false;
}

function hasGoodPrice(document) {
  // Check for structured price data
  const priceSelectors = [
    '[itemprop="price"]',
    '[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
    '[data-price]',
    '.price[data-value]'
  ];
  
  for (const selector of priceSelectors) {
    const el = document.querySelector(selector);
    if (el) {
      const price = el.content || el.getAttribute('data-value') || el.textContent;
      if (price && /[\d.,]/.test(price)) {
        return { selector, value: price.trim() };
      }
    }
  }
  
  return false;
}

function hasGoodBrand(document) {
  // Check for structured brand data
  const brandSelectors = [
    '[itemprop="brand"]',
    '[property="product:brand"]',
    'meta[property="og:brand"]',
    '[data-brand]'
  ];
  
  for (const selector of brandSelectors) {
    const el = document.querySelector(selector);
    if (el) {
      const brand = el.content || el.getAttribute('data-brand') || el.textContent;
      if (brand && brand.trim().length > 1 && brand.trim().length < 50) {
        return { selector, value: brand.trim() };
      }
    }
  }
  
  return false;
}

function hasGoodDescription(document) {
  // Check for structured description
  const descSelectors = [
    '[itemprop="description"]',
    '[property="og:description"]',
    'meta[name="description"]',
    '[data-description]'
  ];
  
  for (const selector of descSelectors) {
    const el = document.querySelector(selector);
    if (el) {
      const desc = el.content || el.getAttribute('data-description') || el.textContent;
      if (desc && desc.trim().length > 50) {
        return { selector, value: desc.trim() };
      }
    }
  }
  
  return false;
}

function hasGoodImages(document) {
  // Check for structured image data
  const imageSelectors = [
    '[itemprop="image"]',
    '[property="og:image"]',
    '[data-product-image]',
    '.product-image img',
    '.hero-image img'
  ];
  
  const productRoot = findProductRoot(document);
  const images = [];
  
  for (const selector of imageSelectors) {
    const elements = productRoot.querySelectorAll(selector);
    for (const el of elements) {
      const src = el.src || el.content || el.getAttribute('data-src');
      if (src && isProductImage(src)) {
        images.push(src);
      }
    }
  }
  
  if (images.length > 0) {
    return { 
      selector: imageSelectors.find(s => productRoot.querySelector(s)),
      value: images.slice(0, 6) // Limit to 6 images
    };
  }
  
  return false;
}

/**
 * Helper functions
 */
function getSelector(element) {
  if (element.getAttribute('itemprop')) {
    return `[itemprop="${element.getAttribute('itemprop')}"]`;
  }
  if (element.getAttribute('property')) {
    return `[property="${element.getAttribute('property')}"]`;
  }
  if (element.name) {
    return `meta[name="${element.name}"]`;
  }
  return element.tagName.toLowerCase();
}

function getProductScopedSelector(element, productRoot) {
  // Try to create a selector scoped to the product area
  const tagName = element.tagName.toLowerCase();
  const className = element.className ? `.${element.className.split(' ')[0]}` : '';
  
  // Check if selector is unique within product root
  const candidate = tagName + className;
  if (productRoot.querySelectorAll(candidate).length === 1) {
    return candidate;
  }
  
  return tagName; // Fallback to tag name
}

function isNavigationText(text) {
  const navPatterns = [
    /^(home|shop|products|categories|menu|search|cart|account)$/i,
    /^(sign in|log in|register|checkout)$/i,
    /^[<>]+$/, // Arrow characters
    /^\d+$/ // Just numbers
  ];
  
  return navPatterns.some(pattern => pattern.test(text.trim()));
}

function isProductImage(src) {
  // Filter out common non-product images
  const badPatterns = [
    /logo/i, /icon/i, /sprite/i, /badge/i, /flag/i,
    /header/i, /footer/i, /nav/i, /menu/i,
    /1x1/i, /placeholder/i, /loading/i
  ];
  
  return !badPatterns.some(pattern => pattern.test(src));
}

/**
 * Get all fields that need LLM analysis (skip those with good heuristics)
 */
function getFieldsNeedingLLM(fields, document) {
  const needLLM = [];
  const heuristicResults = {};
  
  for (const field of fields) {
    const heuristic = hasGoodHeuristic(field, document);
    if (heuristic) {
      heuristicResults[field] = heuristic;
    } else {
      needLLM.push(field);
    }
  }
  
  return { needLLM, heuristicResults };
}

module.exports = {
  findProductRoot,
  trimToProductArea,
  hasEcommerceSignals,
  isValidProductRoot,
  hasGoodHeuristic,
  getFieldsNeedingLLM
};