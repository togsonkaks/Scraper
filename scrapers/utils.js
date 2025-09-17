// shared helpers (exact behavior preserved)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (s) => (s || "").toString().replace(/\s+/g, " ").trim();
const uniq = (a) => [...new Set(a)];
const looksHttp = (u) => /^https?:\/\//i.test(u || "");

// tokenization stopwords (used in images module)
const STOP = new Set([
  "the","a","an","and","or","for","with","of","to","in","by","on",
  "this","that","from","at","is","are","be","it","you","your","our",
  "men","womens","women","woman","man","mens","girls","boys","unisex",
  "size","sizes","new","sale","now","off","deal","shop","buy","add",
  "color","colours","colour","colors","black","white","red","blue","green","grey","gray","beige","brown",
  "us","uk","eu"
]);
const tokenize = (s) => T(s)
  .toLowerCase()
  .replace(/[|\-–—_:/,(){}$+@™®©%^*<>]/g," ")
  .replace(/\s+/g," ")
  .split(" ")
  .filter(w => w && !STOP.has(w) && !/^\d+$/.test(w));

// UNIVERSAL IMAGE FILTER - blocks junk images before processing
function shouldKeepImage(url, imgElement = null) {
  if (!url || url.length < 10) {
    console.log(`[DEBUG] BLOCKED: URL too short`);
    return false;
  }
  
  // SHOPIFY ALLOW-LIST: For Albany Park and other Shopify sites
  if (/albanypark\.com/.test(url) && /\/cdn\/shop\//.test(url)) {
    if (!/\/cdn\/shop\/products\//.test(url)) {
      console.log(`[DEBUG] BLOCKED: Shopify non-product path: ${url.substring(url.lastIndexOf('/') + 1)}`);
      return false;
    }
  }
  
  // Block obvious error patterns
  if (/(transparent-pixel|grey-pixel|error|404|not-found|placeholder\.)/i.test(url)) {
    console.log(`[DEBUG] BLOCKED: Error pattern: ${url.substring(url.lastIndexOf('/') + 1)}`);
    return false;
  }
  
  // Block navigation sprites and UI elements
  if (/(sprite|nav-sprite|icon-sprite|ui-sprite)/i.test(url)) {
    console.log(`[DEBUG] BLOCKED: Sprite pattern: ${url.substring(url.lastIndexOf('/') + 1)}`);
    return false;
  }
  
  // Block obvious non-product patterns
  if (/(tracking|analytics|pixel|beacon|1x1|blank\.)/i.test(url)) {
    console.log(`[DEBUG] BLOCKED: Tracking pattern: ${url.substring(url.lastIndexOf('/') + 1)}`);
    return false;
  }
  
  // Block review platforms (never product images) - including all subdomains
  if (/(?:^|\.)(stamped\.io|trustpilot\.com|reviews\.io|yotpo\.com|bazaarvoice\.com)(?:\/|$)/.test(url)) {
    console.log(`[DEBUG] BLOCKED: Review platform: ${url.substring(url.lastIndexOf('/') + 1)}`);
    return false;
  }
  
  // Block app store badges and social media icons
  if (/(app-store|google-play|apple-store|download|badge|social|facebook|twitter|instagram|pinterest)/.test(url)) {
    console.log(`[DEBUG] BLOCKED: Social/badge pattern: ${url.substring(url.lastIndexOf('/') + 1)}`);
    return false;
  }
  
  // Block COMMENSE app store badges specifically
  if (/img\.shopoases\.com/.test(url)) {
    console.log(`[DEBUG] BLOCKED: Shopify badge platform: ${url.substring(url.lastIndexOf('/') + 1)}`);
    return false;
  }
  
  // Block page URLs that aren't real images (like Adidas product pages)
  if (/\/(us|uk|ca|au)\/.*-(shoes|clothing|apparel|boots|sneakers|shirts|pants)\//.test(url)) {
    console.log(`[DEBUG] BLOCKED: Product page URL: ${url.substring(url.lastIndexOf('/') + 1)}`);
    return false;
  }
  
  // AGGRESSIVE JUNK FILTERING with better patterns
  const fileName = url.substring(url.lastIndexOf('/') + 1).toLowerCase();
  
  // Block material swatches (case-insensitive filename check)
  if (/^cust[_-]/.test(fileName)) {
    console.log(`[DEBUG] BLOCKED: Material swatch: ${fileName}`);
    return false;
  }
  
  // Block promotional banners
  if (/(memorial|labor|holiday|sale|bfcm|black.?friday|cyber.?monday)/.test(fileName)) {
    console.log(`[DEBUG] BLOCKED: Promotional banner: ${fileName}`);
    return false;
  }
  
  // Block navigation images
  if (/(shop.?nav|collection|nav.?desktop|nav.?mobile|kova.?box.?shop)/.test(fileName)) {
    console.log(`[DEBUG] BLOCKED: Navigation image: ${fileName}`);
    return false;
  }
  
  // Block /cdn/shop/files/ path (Shopify promotional content)
  if (/\/cdn\/shop\/files\//.test(url)) {
    console.log(`[DEBUG] BLOCKED: Shopify files path: ${fileName}`);
    return false;
  }
  
  return true;
}

Object.assign(globalThis, { sleep, T, uniq, looksHttp, STOP, tokenize, shouldKeepImage });