const _maybeFetch = global.fetch || require('node-fetch');
const fetch = (...args) => _maybeFetch(...args);

function env(n, d){ return process.env[n] ?? d; }

const SYSTEM = `You extract resilient CSS selectors for ecommerce product pages.

OUTPUT FORMAT: JSON object with label and candidates array, strongest selectors first:
{
  "label": "price", 
  "candidates": ["[itemprop='price']", "[data-testid='price']", ".price .money", ".product-price"]
}

SELECTOR PRIORITY (strongest to weakest):
1. JSON-LD: script[type="application/ld+json"] data extraction
2. Microdata: [itemprop="name|price|brand|description|image"]  
3. Data attributes: [data-testid], [data-price], [data-name]
4. Semantic classes: .product-title, .price, .brand-name
5. Meta tags: meta[property="og:title|og:price"], meta[name="description"]

FIELD-SPECIFIC PATTERNS:

TITLE: Look for product name, avoid navigation
- h1, h2 near product info
- [itemprop="name"]
- .product-title, .product-name, .item-title
- meta[property="og:title"]

PRICE: Numeric values with currency, avoid discounts/percentages  
- [itemprop="price"], [itemprop="offers"] [itemprop="price"]
- [data-price], [data-testid*="price"]
- .price, .money, .cost, .product-price
- Elements containing $ € £ ¥ symbols

BRAND: Manufacturer/brand name, avoid legal suffixes
- [itemprop="brand"]
- .brand, .manufacturer, .brand-name
- Elements near logos but containing text

DESCRIPTION: Product details, avoid marketing copy
- [itemprop="description"]  
- meta[name="description"]
- .description, .product-description, .details
- Paragraph tags near product info

IMAGES: Product gallery images, avoid logos/sprites
- .product-gallery img, .gallery img
- [itemprop="image"]
- img[src*="product"], picture source
- meta[property="og:image"]

AVOID: Random IDs, navigation elements, footer content, social sharing, breadcrumbs.
PREFER: Selectors that work across product pages on the same domain.`;

function buildUser(html, label, url) {
  const trimmed = String(html || '').slice(0, 120000);
  return `URL: ${url}\nField: ${label}\nHTML:\n${trimmed}`;
}

function safeParseResponse(s) {
  try { 
    const x = JSON.parse(s);
    if (x && x.candidates && Array.isArray(x.candidates)) {
      return {
        label: x.label,
        candidates: x.candidates.filter(v => typeof v === 'string').slice(0, 4)
      };
    }
  } catch {}
  
  // Fallback: try to extract array for backwards compatibility
  const m = String(s).match(/\[[\s\S]*\]/);
  if (m) { 
    try { 
      const arr = JSON.parse(m[0]); 
      if (Array.isArray(arr)) {
        return { candidates: arr.filter(v => typeof v === 'string').slice(0, 4) };
      }
    } catch {} 
  }
  
  return { candidates: [] };
}

// Field-specific validation functions
function validateTitle(text) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();
  if (clean.length < 5 || clean.length > 180) return null;
  if (clean === clean.toUpperCase() && clean.length > 20) return null; // Avoid all caps
  if (/^(home|shop|cart|account|login|menu)/i.test(clean)) return null; // Avoid nav text
  return clean;
}

function validatePrice(text) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();
  
  // Extract numeric value
  const numMatch = clean.match(/[\d,]+\.?\d*/);
  if (!numMatch) return null;
  
  const num = parseFloat(numMatch[0].replace(/,/g, ''));
  if (isNaN(num) || num < 1 || num > 10000) return null;
  
  // Must contain currency symbol or be in price context
  if (!/[$€£¥₹]|price|cost|usd|eur|gbp/i.test(clean)) return null;
  
  return clean;
}

function validateBrand(text) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();
  if (clean.length < 2 || clean.length > 50) return null;
  
  // Remove common legal suffixes unless they seem intentional
  const withoutSuffix = clean.replace(/\s+(Inc\.?|LLC\.?|Ltd\.?|Co\.?)$/i, '');
  if (withoutSuffix.length < 2) return clean; // Keep original if removal makes it too short
  
  return withoutSuffix;
}

function validateDescription(text) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();
  if (clean.length < 60) return null;
  
  // Avoid obvious marketing boilerplate
  if (/^(buy now|shop now|free shipping|best price)/i.test(clean)) return null;
  
  return clean;
}

function validateImages(urls) {
  if (!Array.isArray(urls)) return [];
  
  return urls
    .filter(url => typeof url === 'string' && url.trim())
    .filter(url => {
      const clean = url.trim();
      // Must be http/https
      if (!clean.match(/^https?:\/\//)) return false;
      
      // Check for image extensions or CDN patterns
      if (clean.match(/\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i)) return true;
      if (clean.includes('format=') || clean.includes('f_auto')) return true; // CDN params
      
      return false;
    })
    .filter(url => {
      // Remove logos, sprites, icons
      if (url.match(/logo|sprite|icon|favicon|social/i)) return false;
      return true;
    })
    .slice(0, 6); // Limit to 6 images
}

async function openaiPropose({ html, label, url, model, apiKey }) {
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');
  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: buildUser(html, label, url) }
    ],
    temperature: 0.1, max_tokens: 500
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST', headers:{ 'Authorization':`Bearer ${apiKey}`, 'Content-Type':'application/json' }, body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content?.trim() || '{}';
  return safeParseResponse(txt);
}

async function anthropicPropose({ html, label, url, model, apiKey }) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  const body = { model, max_tokens:500, temperature:0.1, system:SYSTEM, messages:[{ role:'user', content: buildUser(html,label,url) }] };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', headers:{ 'x-api-key':apiKey, 'anthropic-version':'2023-06-01', 'Content-Type':'application/json' }, body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const data = await res.json();
  const txt = (data.content?.[0]?.text || '{}').trim();
  return safeParseResponse(txt);
}

// Test candidate selectors and return validated results
async function testCandidatesInPage(candidates, field, evalFunction) {
  if (!candidates || !candidates.length || !evalFunction) return [];
  
  const testCode = `(() => {
    const qa = (s) => Array.from(document.querySelectorAll(s));
    const txt = (el) => (el && (el.textContent||'').trim()) || null;
    const pickFromSrcset = (ss) => { 
      if(!ss) return null; 
      const p = ss.split(',').map(s => s.trim()); 
      const last = p[p.length-1] || ''; 
      return (last.split(' ')[0]) || null; 
    };
    const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
    
    const candidates = ${JSON.stringify(candidates)};
    const field = ${JSON.stringify(field)};
    const results = [];
    
    for (const selector of candidates) {
      try {
        let value = null;
        
        if (field === 'images') {
          const urls = [];
          for (const el of qa(selector)) {
            const s1 = el.getAttribute('src') || el.currentSrc || 
                      el.getAttribute('data-src') || el.getAttribute('data-image') || 
                      el.getAttribute('data-zoom-image') || el.getAttribute('data-large');
            if (s1) urls.push(s1);
            
            const ss = el.getAttribute('srcset'); 
            const best = pickFromSrcset(ss); 
            if (best) urls.push(best);
            
            if (el.parentElement && el.parentElement.tagName.toLowerCase() === 'picture') {
              for (const src of el.parentElement.querySelectorAll('source')) {
                const b = pickFromSrcset(src.getAttribute('srcset')); 
                if (b) urls.push(b);
              }
            }
          }
          value = uniq(urls);
        } else {
          const el = document.querySelector(selector);
          if (el) {
            // Try text content first, then common attributes
            value = txt(el) || el.getAttribute('content') || el.getAttribute('value') || el.getAttribute('data-value');
          }
        }
        
        if (value && (Array.isArray(value) ? value.length > 0 : String(value).trim())) {
          results.push({ selector, value, success: true });
        } else {
          results.push({ selector, value: null, success: false });
        }
      } catch (error) {
        results.push({ selector, value: null, success: false, error: error.message });
      }
    }
    
    return results;
  })()`;
  
  return await evalFunction(testCode);
}

// Validate and rank selector results
function validateAndRank(testResults, field) {
  const validators = {
    title: validateTitle,
    price: validatePrice, 
    brand: validateBrand,
    description: validateDescription,
    images: validateImages
  };
  
  const validator = validators[field];
  if (!validator) return testResults;
  
  return testResults
    .map(result => {
      if (!result.success || !result.value) return { ...result, validated: false };
      
      const validated = validator(result.value);
      return {
        ...result,
        validated: !!validated,
        validatedValue: validated
      };
    })
    .sort((a, b) => {
      // Prioritize validated results
      if (a.validated && !b.validated) return -1;
      if (!a.validated && b.validated) return 1;
      
      // Then by success
      if (a.success && !b.success) return -1;
      if (!a.success && b.success) return 1;
      
      return 0;
    });
}

async function proposeSelectors({ html, label, url, provider = {}, evalFunction = null, fields = null }) {
  
  // Support both single field (label) and multi-field (fields) requests
  const requestedFields = fields || [label];
  
  // If we have eval function, optimize with product detection and heuristics
  if (evalFunction) {
    // Execute product detection in the browser context
    const optimizeCode = `(() => {
      // Inline product detection functions for browser context
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
      
      function hasProductType(data) {
        if (!data) return false;
        if (data['@type'] === 'Product') return true;
        if (Array.isArray(data['@type']) && data['@type'].includes('Product')) return true;
        if (data['@graph']) {
          return data['@graph'].some(item => hasProductType(item));
        }
        if (typeof data === 'object') {
          return Object.values(data).some(value => 
            typeof value === 'object' && hasProductType(value)
          );
        }
        return false;
      }
      
      function hasEcommerceSignals(container) {
        const signals = [
          '[itemtype*="Offer"]', '[itemprop*="price"]', '.price', '[data-price]',
          'meta[property*="price"]', '.cost', '.amount',
          '[data-add-to-cart]', '[data-product-id]', '.add-to-cart', '.add-to-bag',
          'button[type="submit"][name*="add"]', '.buy-now', '.purchase',
          '.product-image', '.product-gallery', '.product-photos', '.hero-image',
          '[data-zoom]', '.zoom-image', '.product-slider',
          '.variant', '.option', '.size-selector', '.color-selector',
          '[data-variant]', '.product-options', '.attribute-selector',
          '[itemtype*="Product"]', '[itemprop*="name"]', '[itemprop*="description"]'
        ];
        
        let signalCount = 0;
        for (const signal of signals) {
          if (container.querySelector(signal)) signalCount++;
        }
        
        const text = container.textContent.toLowerCase();
        const textSignals = ['add to cart', 'add to bag', 'buy now', 'in stock', 'out of stock', 'select size'];
        for (const textSignal of textSignals) {
          if (text.includes(textSignal)) signalCount++;
        }
        
        return signalCount >= 3;
      }
      
      function isValidProductRoot(container) {
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
        
        const textContent = container.textContent.trim();
        if (textContent.length < 100) return false;
        
        const images = container.querySelectorAll('img');
        if (images.length < 1) return false;
        
        return true;
      }
      
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
        
        return bestContainer || document.body;
      }
      
      function calculateProductScore(container) {
        let score = 0;
        
        const images = container.querySelectorAll('img');
        score += Math.min(images.length * 5, 25);
        
        const priceElements = container.querySelectorAll('.price, [itemprop*="price"], [data-price]');
        score += priceElements.length * 10;
        
        const cartButtons = container.querySelectorAll('.add-to-cart, .add-to-bag, [data-add-to-cart]');
        score += cartButtons.length * 15;
        
        const structuredElements = container.querySelectorAll('[itemtype], [itemprop]');
        score += structuredElements.length * 3;
        
        const navElements = container.querySelectorAll('nav, .nav, .navigation, .menu');
        score -= navElements.length * 20;
        
        return score;
      }
      
      function trimToProductArea(document, productRoot) {
        if (!productRoot) {
          productRoot = findProductRoot(document);
        }
        
        const clone = productRoot.cloneNode(true);
        
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
        
        // Limit repeated elements
        limitRepeatedElements(clone, 'img', 10);
        limitRepeatedElements(clone, 'a', 20);
        limitRepeatedElements(clone, 'button', 10);
        
        truncateLongText(clone);
        
        return clone.outerHTML;
      }
      
      function limitRepeatedElements(container, tagName, maxCount) {
        const elements = container.querySelectorAll(tagName);
        if (elements.length > maxCount) {
          for (let i = maxCount; i < elements.length; i++) {
            elements[i].remove();
          }
        }
      }
      
      function truncateLongText(container) {
        const textElements = container.querySelectorAll('p, div, span');
        for (const el of textElements) {
          if (el.children.length === 0) {
            const text = el.textContent;
            if (text.length > 500) {
              el.textContent = text.substring(0, 500) + '...';
            }
          }
        }
      }
      
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
        const structuredTitle = document.querySelector('[itemprop="name"], [property="og:title"], meta[name="title"]');
        if (structuredTitle) {
          const title = structuredTitle.content || structuredTitle.textContent;
          if (title && title.trim().length > 5 && title.trim().length < 200) {
            return { selector: getSelector(structuredTitle), value: title.trim() };
          }
        }
        
        const productRoot = findProductRoot(document);
        const h1 = productRoot.querySelector('h1');
        if (h1) {
          const title = h1.textContent.trim();
          if (title.length > 5 && title.length < 200 && !isNavigationText(title)) {
            return { selector: 'h1', value: title };
          }
        }
        
        return false;
      }
      
      function hasGoodPrice(document) {
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
            if (price && /[\\d.,]/.test(price)) {
              return { selector, value: price.trim() };
            }
          }
        }
        
        return false;
      }
      
      function hasGoodBrand(document) {
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
            value: images.slice(0, 6)
          };
        }
        
        return false;
      }
      
      function getSelector(element) {
        if (element.getAttribute('itemprop')) {
          return '[itemprop="' + element.getAttribute('itemprop') + '"]';
        }
        if (element.getAttribute('property')) {
          return '[property="' + element.getAttribute('property') + '"]';
        }
        if (element.name) {
          return 'meta[name="' + element.name + '"]';
        }
        return element.tagName.toLowerCase();
      }
      
      function isNavigationText(text) {
        const navPatterns = [
          /^(home|shop|products|categories|menu|search|cart|account)$/i,
          /^(sign in|log in|register|checkout)$/i,
          /^[<>]+$/,
          /^\\d+$/
        ];
        
        return navPatterns.some(pattern => pattern.test(text.trim()));
      }
      
      function isProductImage(src) {
        const badPatterns = [
          /logo/i, /icon/i, /sprite/i, /badge/i, /flag/i,
          /header/i, /footer/i, /nav/i, /menu/i,
          /1x1/i, /placeholder/i, /loading/i
        ];
        
        return !badPatterns.some(pattern => pattern.test(src));
      }
      
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
      
      // Main execution
      const fields = ${JSON.stringify(requestedFields)};
      const { needLLM, heuristicResults } = getFieldsNeedingLLM(fields, document);
      const productRoot = findProductRoot(document);
      const trimmedHTML = trimToProductArea(document, productRoot);
      
      return {
        needLLM,
        heuristicResults,
        trimmedHTML,
        originalSize: document.documentElement.outerHTML.length,
        trimmedSize: trimmedHTML.length
      };
    })()`;
    
    const optimization = await evalFunction(optimizeCode);
    
    // If no fields need LLM (all have good heuristics), return heuristic results
    if (optimization.needLLM.length === 0) {
      const results = {};
      for (const [field, heuristic] of Object.entries(optimization.heuristicResults)) {
        results[field] = {
          ok: true,
          selectors: [heuristic.selector],
          chosenValue: heuristic.value,
          source: 'heuristic'
        };
      }
      
      // For single field requests, return the field result directly for backward compatibility
      if (requestedFields.length === 1) {
        return results[requestedFields[0]] || { ok: false, error: 'No heuristic found' };
      }
      
      return { ok: true, results, tokensSaved: optimization.originalSize - optimization.trimmedSize };
    }
    
    // Use trimmed HTML for LLM call (massive token savings)
    html = optimization.trimmedHTML;
    
    // Log the optimization results
    console.log(`🎯 Product optimization: ${optimization.originalSize} → ${optimization.trimmedHTML.length} chars (${Math.round((1 - optimization.trimmedHTML.length/optimization.originalSize) * 100)}% reduction)`);
    console.log(`📊 Fields needing LLM: ${optimization.needLLM.length}/${requestedFields.length} (${requestedFields.length - optimization.needLLM.length} skipped via heuristics)`);
    
    // Continue with only fields that need LLM
    const fieldsToProcess = optimization.needLLM;
    const heuristicResults = optimization.heuristicResults;
    
    // Get LLM suggestions for remaining fields
    const llmResponse = await getLLMSuggestions(html, fieldsToProcess, url, provider);
    
    // Process results for each field
    const allResults = {};
    
    // Add heuristic results
    for (const [field, heuristic] of Object.entries(heuristicResults)) {
      allResults[field] = {
        ok: true,
        selectors: [heuristic.selector],
        chosenValue: heuristic.value,
        source: 'heuristic'
      };
    }
    
    // Test and validate LLM suggestions
    for (const field of fieldsToProcess) {
      if (llmResponse[field] && llmResponse[field].candidates) {
        const testResults = await testCandidatesInPage(llmResponse[field].candidates, field, evalFunction);
        const ranked = validateAndRank(testResults, field);
        
        const bestResult = ranked.find(r => r.validated || r.success);
        if (bestResult) {
          allResults[field] = {
            ok: true,
            selectors: [bestResult.selector],
            allCandidates: ranked,
            chosenValue: bestResult.validatedValue || bestResult.value,
            source: 'llm'
          };
        } else {
          allResults[field] = {
            ok: false,
            selectors: [],
            allCandidates: ranked,
            error: 'No candidates passed validation',
            source: 'llm'
          };
        }
      } else {
        allResults[field] = {
          ok: false,
          error: 'LLM provided no candidates',
          source: 'llm'
        };
      }
    }
    
    // For single field requests, return the field result directly for backward compatibility
    if (requestedFields.length === 1) {
      return allResults[requestedFields[0]] || { ok: false, error: 'Field not processed' };
    }
    
    return { 
      ok: true, 
      results: allResults, 
      optimization: {
        originalSize: optimization.originalSize,
        trimmedSize: optimization.trimmedHTML.length,
        tokensSaved: optimization.originalSize - optimization.trimmedHTML.length,
        fieldsSkipped: requestedFields.length - optimization.needLLM.length
      }
    };
  }
  
  // Fallback to old behavior if no eval function (backward compatibility)
  const name = (provider.name || env('LLM_PROVIDER', 'openai')).toLowerCase();
  
  let llmResponse;
  if (name === 'anthropic') {
    llmResponse = await anthropicPropose({ html, label, url, model: provider.model || env('ANTHROPIC_MODEL','claude-3-haiku-20240307'), apiKey: provider.apiKey || env('ANTHROPIC_API_KEY') });
  } else {
    llmResponse = await openaiPropose({ html, label, url, model: provider.model || env('OPENAI_MODEL','gpt-4o-mini'), apiKey: provider.apiKey || env('OPENAI_API_KEY') });
  }
  
  return llmResponse.candidates || [];
}

/**
 * Get LLM suggestions for multiple fields in a single batched request
 */
async function getLLMSuggestions(html, fields, url, provider = {}) {
  if (!fields || fields.length === 0) {
    return {};
  }
  
  const name = (provider.name || env('LLM_PROVIDER', 'openai')).toLowerCase();
  
  if (fields.length === 1) {
    // Single field - use existing functions
    const field = fields[0];
    let response;
    if (name === 'anthropic') {
      response = await anthropicPropose({ html, label: field, url, model: provider.model || env('ANTHROPIC_MODEL','claude-3-haiku-20240307'), apiKey: provider.apiKey || env('ANTHROPIC_API_KEY') });
    } else {
      response = await openaiPropose({ html, label: field, url, model: provider.model || env('OPENAI_MODEL','gpt-4o-mini'), apiKey: provider.apiKey || env('OPENAI_API_KEY') });
    }
    return { [field]: response };
  }
  
  // Multiple fields - batch request
  try {
    if (name === 'anthropic') {
      return await anthropicBatchPropose({ html, fields, url, model: provider.model || env('ANTHROPIC_MODEL','claude-3-haiku-20240307'), apiKey: provider.apiKey || env('ANTHROPIC_API_KEY') });
    } else {
      return await openAIBatchPropose({ html, fields, url, model: provider.model || env('OPENAI_MODEL','gpt-4o-mini'), apiKey: provider.apiKey || env('OPENAI_API_KEY') });
    }
  } catch (error) {
    console.error('Batch LLM request failed:', error);
    // Fallback: return empty results for all fields
    const fallback = {};
    fields.forEach(field => {
      fallback[field] = { candidates: [] };
    });
    return fallback;
  }
}

/**
 * OpenAI batch multi-field proposal
 */
async function openAIBatchPropose({ html, fields, url, model = 'gpt-4o-mini', apiKey }) {
  const apiUrl = 'https://api.openai.com/v1/chat/completions';
  
  const fieldExamples = {
    title: 'h1, [itemprop="name"], .product-title, .title',
    price: '[itemprop="price"], .price, .cost, [data-price]',
    brand: '[itemprop="brand"], .brand, .manufacturer, [data-brand]',
    description: '[itemprop="description"], .description, .product-description, .details',
    images: '.product-image img, .gallery img, [itemprop="image"], .hero-image img'
  };
  
  const fieldDescriptions = fields.map(field => {
    return `**${field}**: CSS selectors to extract ${field} (examples: ${fieldExamples[field] || 'selector examples'})`;
  }).join('\n');
  
  const prompt = `You are a CSS selector expert. Analyze this product page HTML and provide the best CSS selectors for extracting these fields:

${fieldDescriptions}

IMPORTANT: Return valid JSON with this exact structure:
{
  "${fields[0]}": {"candidates": ["selector1", "selector2", "selector3", "selector4"]},
  ${fields.slice(1).map(f => `"${f}": {"candidates": ["selector1", "selector2", "selector3", "selector4"]}`).join(',\n  ')}
}

For each field, provide 4 ranked selectors (best first). Prioritize:
1. JSON-LD structured data: script[type="application/ld+json"] content
2. Microdata: [itemtype], [itemprop] attributes  
3. Open Graph/meta: [property], meta[name]
4. Semantic classes: .product-*, .item-*, etc.

HTML to analyze:
${html}`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    
    return safeParseResponse(content.trim());
  } catch (error) {
    console.error('OpenAI batch proposal failed:', error);
    // Fallback: empty results for all fields
    const fallback = {};
    fields.forEach(field => {
      fallback[field] = { candidates: [] };
    });
    return fallback;
  }
}

/**
 * Anthropic batch multi-field proposal
 */
async function anthropicBatchPropose({ html, fields, url, model = 'claude-3-haiku-20240307', apiKey }) {
  const apiUrl = 'https://api.anthropic.com/v1/messages';
  
  const fieldExamples = {
    title: 'h1, [itemprop="name"], .product-title, .title',
    price: '[itemprop="price"], .price, .cost, [data-price]',
    brand: '[itemprop="brand"], .brand, .manufacturer, [data-brand]',
    description: '[itemprop="description"], .description, .product-description, .details',
    images: '.product-image img, .gallery img, [itemprop="image"], .hero-image img'
  };
  
  const fieldDescriptions = fields.map(field => {
    return `**${field}**: CSS selectors to extract ${field} (examples: ${fieldExamples[field] || 'selector examples'})`;
  }).join('\n');
  
  const prompt = `You are a CSS selector expert. Analyze this product page HTML and provide the best CSS selectors for extracting these fields:

${fieldDescriptions}

IMPORTANT: Return valid JSON with this exact structure:
{
  "${fields[0]}": {"candidates": ["selector1", "selector2", "selector3", "selector4"]},
  ${fields.slice(1).map(f => `"${f}": {"candidates": ["selector1", "selector2", "selector3", "selector4"]}`).join(',\n  ')}
}

For each field, provide 4 ranked selectors (best first). Prioritize:
1. JSON-LD structured data: script[type="application/ld+json"] content
2. Microdata: [itemtype], [itemprop] attributes  
3. Open Graph/meta: [property], meta[name]
4. Semantic classes: .product-*, .item-*, etc.

HTML to analyze:
${html}`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '{}';
    
    return safeParseResponse(content.trim());
  } catch (error) {
    console.error('Anthropic batch proposal failed:', error);
    // Fallback: empty results for all fields
    const fallback = {};
    fields.forEach(field => {
      fallback[field] = { candidates: [] };
    });
    return fallback;
  }
}

module.exports = { proposeSelectors };
