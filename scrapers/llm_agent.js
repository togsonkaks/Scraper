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

async function proposeSelectors({ html, label, url, provider = {}, evalFunction = null }) {
  const name = (provider.name || env('LLM_PROVIDER', 'openai')).toLowerCase();
  
  // Get LLM suggestions
  let llmResponse;
  if (name === 'anthropic') {
    llmResponse = await anthropicPropose({ html, label, url, model: provider.model || env('ANTHROPIC_MODEL','claude-3-haiku-20240307'), apiKey: provider.apiKey || env('ANTHROPIC_API_KEY') });
  } else {
    llmResponse = await openaiPropose({ html, label, url, model: provider.model || env('OPENAI_MODEL','gpt-4o-mini'), apiKey: provider.apiKey || env('OPENAI_API_KEY') });
  }
  
  // Return raw candidates if no eval function provided (backwards compatibility)
  if (!evalFunction || !llmResponse.candidates || !llmResponse.candidates.length) {
    return llmResponse.candidates || [];
  }
  
  // Test candidates in the actual page
  const testResults = await testCandidatesInPage(llmResponse.candidates, label, evalFunction);
  const ranked = validateAndRank(testResults, label);
  
  // Return the best working selector or empty array if none work
  const bestResult = ranked.find(r => r.validated || r.success);
  if (bestResult) {
    return {
      ok: true,
      selectors: [bestResult.selector],
      allCandidates: ranked,
      chosenValue: bestResult.validatedValue || bestResult.value
    };
  }
  
  return {
    ok: false,
    selectors: [],
    allCandidates: ranked,
    error: 'No candidates passed validation'
  };
}

module.exports = { proposeSelectors };
