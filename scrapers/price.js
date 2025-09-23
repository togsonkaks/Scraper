// full price stack (exact behavior)
const CURRENCY = /[$€£¥₹]|\b(AED|AUD|BRL|CAD|CHF|CNY|DKK|EUR|GBP|HKD|IDR|ILS|INR|JPY|KRW|MXN|MYR|NOK|NZD|PHP|PLN|RON|RUB|SAR|SEK|SGD|THB|TRY|TWD|USD|VND|ZAR)\b/i;
const NUM = /\d+[\d.,\s]*\d|\d/;

const normalizeMoney = (raw) => {
  if (!raw) return null;
  let s = T(raw).replace(/\u00A0/g," ");
  if (/(was|list|regular|original|compare|mrp|save|you save|discount|off|rebate|coupon)/i.test(s)) return null;
  const m = s.match(/(\$|€|£|¥|₹|\b[A-Z]{3}\b)\s*([0-9][0-9.,\s]*)/i);
  if (!m) return null;
  let cur = m[1];
  let num = m[2];
  num = num.replace(/\s/g,"");
  const lastComma = num.lastIndexOf(",");
  const lastDot = num.lastIndexOf(".");
  
  // Enhanced decimal parsing logic
  if (lastComma > lastDot && lastDot !== -1) {
    // European format: "1.234,56" (period for thousands, comma for decimal)
    num = num.replace(/\./g,"").replace(/,/g,".");
  } else if (lastComma !== -1 && lastDot === -1) {
    // US format with thousands separator only: "1,234" (no decimal cents)
    num = num.replace(/,/g,"");
  } else {
    // US format: "1,234.56" or just "64.99" (comma for thousands, period for decimal)
    num = num.replace(/,/g,"");
  }
  return `${cur}${num}`;
};
// helpers
function parsePrice(txt) {
  if (!txt) return null;
  const s = String(txt).replace(/[, ]+/g,'').trim();
  const m = s.match(/([€£$]|USD|GBP|EUR)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
  return m ? parseFloat(m[2]) : null;
}

// 3) BonBonBon
function PRICE_BONBONBON() {
  if (!/bonbonbon\.com$/i.test(location.hostname)) return null;
  // current price is in the main price container
  const el = document.querySelector(
    '.product_price_main .product_price, .product_price_main [data-product-price], .product__price .money, .product_price'
  );
  return parsePrice(el?.textContent || el?.getAttribute('data-product-price'));
}

// 6) Commense / TheCommense
function PRICE_COMMENSE() {
  if (!/commense\.com|thecommense\.com$/i.test(location.hostname)) return null;
  // prefer current price; ignore "origin/regular" if present
  const el =
    document.querySelector('.product__main .product_price .money') ||
    document.querySelector('.product__main .product_price, span[id^="ProductPrice-"]');
  return parsePrice(el?.textContent);
}

// 10) Kirrin Finch
function PRICE_KIRRIN() {
  if (!/kirrinfinch\.com$/i.test(location.hostname)) return null;
  // page shows `$ 415` in [data-price]; also expose .money in some templates
  const el =
    document.querySelector('[data-price]') ||
    document.querySelector('.product-price .money, .product__price .money');
  return parsePrice(el?.textContent || el?.getAttribute('data-price'));
}

// 11) Mahabis
function PRICE_MAHABIS() {
  if (!/mahabis\.com$/i.test(location.hostname)) return null;
  // sale block shows final price in .pricea .money (or #bundlePrice .money)
  const el =
    document.querySelector('#bundlePrice .money') ||
    document.querySelector('.pricea .money, .product-details-wrap .money');
  return parsePrice(el?.textContent);
}

function priceFromJSON() {
  for (const b of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(b.textContent.trim());
      const arr = Array.isArray(data) ? data : [data];
      for (const node of arr) {
        const types = [].concat(node?.["@type"]||[]).map(String);
        if (!types.some(t=>/product/i.test(t))) continue;
        const cur = node.priceCurrency || node.offers?.priceCurrency || "";
        const offers = []
          .concat(node.offers || [])
          .map(o => o?.priceSpecification?.price || o?.price || o?.lowPrice || o?.highPrice)
          .filter(Boolean);
        if (offers.length) {
          const val = offers.find(v => /\d/.test(String(v)));
          if (val != null) return normalizeMoney(`${cur ? cur + " " : ""}${val}`);
        }
      }
    } catch {}
  }

  const shopify = document.querySelector('script[type="application/json"][id*="ProductJson" i], script[type="application/json"][data-product-json]');
  if (shopify) {
    try {
      const p = JSON.parse(shopify.textContent.trim());
      const cents =
        p?.price ??
        p?.selected_variant?.price ??
        p?.variants?.find(v=>v?.available)?.price ??
        p?.price_min ?? null;
      if (cents != null) {
        const n = Number(cents);
        if (!Number.isNaN(n)) return "$" + (n >= 1000 ? (n/100).toFixed(2) : n.toFixed(2));
      }
    } catch {}
  }

  const next = document.querySelector('#__NEXT_DATA__');
  if (next) {
    try {
      const j = JSON.parse(next.textContent.trim());
      const guess = JSON.stringify(j).match(/"price"\s*:\s*"?([0-9][0-9.,]*)"?/i);
      if (guess) {
        const val = normalizeMoney(guess[1]);
        if (val) return val;
      }
    } catch {}
  }
  return null;
}

function getPriceGeneric() {
  const j = priceFromJSON();
  if (j) return {
    text: j,
    selector: 'script[type="application/ld+json"]',
    attr: 'json'
  };

  const meta = document.querySelector("meta[itemprop='price']")?.getAttribute("content");
  if (meta) {
    const m = normalizeMoney(meta);
    if (m) return {
      text: m,
      selector: "meta[itemprop='price']",
      attr: 'content'
    };
  }
  
  const microElements = [...document.querySelectorAll("[itemprop='price'], [property='product:price:amount']")];
  for (const el of microElements) {
    const val = el.getAttribute("content") || el.textContent;
    const normalized = normalizeMoney(val);
    if (normalized) {
      return {
        text: normalized,
        selector: el.matches("[itemprop='price']") ? "[itemprop='price']" : "[property='product:price:amount']",
        attr: el.getAttribute("content") ? 'content' : 'text'
      };
    }
  }

  const BAD_WORDS = /(was|list|regular|original|compare|mrp|strik(e|ed)|previous|save|you save|discount|off|rebate|coupon)/i;
  const GOOD_WORDS = /(now|current|final|sale|deal|price|buy)/i;

  const selHints = [
    '.price ins .amount',
    '.price__current, .price__final, .product-sales-price',
    '.price-item--sale, .price--sale',
    '[data-price-type="finalPrice"] [data-price-amount]',
    '.pdp-price, .product-price, .current-price, .sale-price, .final-price',
    '[data-testid*="price"]',
    '.price .amount, .Price, [class*="price"] .amount',
    '[id*="price"] .amount, [id*="price"] .a-offscreen',
    '.a-price .a-offscreen',
    '.price, [class*="price"], [id*="price"]'
  ];
  const bucket = new Set();

  const addIfMoney = (el, baseScore, selectorHint = null) => {
    if (!el) return;
    const text = T(el.textContent);
    if (!text || !CURRENCY.test(text) || !NUM.test(text)) return;
    const deco = getComputedStyle(el).textDecorationLine || "";
    const isStruck = /line-through/i.test(deco) || /^(del|s|strike)$/i.test(el.tagName);
    if (isStruck) return;
    const near = T((el.closest('[class],[id]') || el.parentElement || {}).textContent || "");
    if (BAD_WORDS.test(near)) return;

    let score = baseScore;
    if (GOOD_WORDS.test(near)) score += 2;
    if (text.length <= 14) score += 1;
    const val = normalizeMoney(text);
    if (!val) return;
    
    // Generate a specific selector for this element
    let elementSelector = selectorHint;
    if (!elementSelector) {
      if (el.id) {
        elementSelector = `#${el.id}`;
      } else if (el.className) {
        const classes = el.className.split(' ').filter(c => c.trim());
        if (classes.length > 0) {
          elementSelector = `${el.tagName.toLowerCase()}.${classes.join('.')}`;
        } else {
          elementSelector = el.tagName.toLowerCase();
        }
      } else {
        elementSelector = el.tagName.toLowerCase();
      }
    }
    
    bucket.add(JSON.stringify({score, val, selector: elementSelector}));
  };

  // First, try to find main product container and search within it
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
  
  // If we found a product container, search within it first with higher scores
  if (productContainer) {
    selHints.forEach((s, i) => {
      productContainer.querySelectorAll(s).forEach(el => addIfMoney(el, 20 - i, s)); // Higher scores for scoped elements
    });
    
    // Look for CTA buttons within the product container
    const scopedCtas = [...productContainer.querySelectorAll('button, a')]
      .filter(b => /add to cart|buy now|checkout|add to bag|add to basket/i.test(T(b.textContent)));
    scopedCtas.forEach(btn => {
      const scope = btn.closest('form, section, div, article') || productContainer;
      scope.querySelectorAll('*').forEach(el => addIfMoney(el, 15));
    });
  }
  
  // Then search document-wide with lower scores as fallback
  selHints.forEach((s, i) => {
    document.querySelectorAll(s).forEach(el => addIfMoney(el, 10 - i, s));
  });

  const ctas = [...document.querySelectorAll('button, a')]
    .filter(b => /add to cart|buy now|checkout|add to bag|add to basket/i.test(T(b.textContent)));
  ctas.forEach(btn => {
    const scope = btn.closest('form, section, div, article') || document.body;
    scope.querySelectorAll('*').forEach(el => addIfMoney(el, 5));
  });

  [...document.querySelectorAll('body *:not(script):not(style):not(noscript)')]
    .slice(0, 1500)
    .forEach(el => addIfMoney(el, 1));

  if (bucket.size) {
    const best = [...bucket]
      .map(s => JSON.parse(s))
      .sort((a,b)=> b.score - a.score)[0];
    if (best?.val) {
      return {
        text: best.val,
        selector: best.selector,
        attr: 'text'
      };
    }
  }
  return null;
}

Object.assign(globalThis, { getPriceGeneric, normalizeMoney, CURRENCY, NUM });
