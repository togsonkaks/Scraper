  // ---- UNIVERSAL SIZE HINT REGEXES (comprehensive CDN support) ----
  const RX_SRCSET_W   = /\s(\d{2,4})w(?:\s|$)/i;                       // "2000w"
  const RX_W_SEG      = /(?:^|\/)[whmwx][_ -]?(\d{2,4})(?=[\/._-]|$)/i;// "/w_375/" "/h-800" "/x1200"
  const RX_W_QS       = /[?&](?:im?width|mw|maxw?|w|wid|width)=(\d{2,4})\b/i;
  const RX_H_QS       = /[?&](?:h|height)=(\d{2,4})\b/i;
  const RX_SIZE_SEG   = /(?:^|\/)(\$size_|\$Size_|Size[_-])(\d{3,4})(?=\/|$)/i;  // "/Size_2000/" or "/$size_2000/"
  const RX_PAIR_X     = /(?:^|[\W_])(\d{3,4})[x×](\d{3,4})(?:[\W_]|$)/i;// "2000x2000" "800×1200"
  const RX_AMZ_SX     = /[_-]SX(\d{2,4})[_-]/i;                        // "SX679" (Amazon)
  const RX_CLOUDINARY = /\/upload\/[^/]*?w_(\d{2,4})/i;                 // Cloudinary "w_2000"
  const RX_IMGIX_QS   = /[?&](?:auto=[^&]*&)?w=(\d{2,4})\b/i;          // imgix
  const RX_AEM_IMW    = /[?&](?:imwidth|width)=(\d{2,4})\b/i;          // Adobe AEM
  const RX_SHOPIFY    = /_(\d{3,4})x\.\w+\b/i;                          // Shopify "…_2000x.jpg"

  // Universal size extraction - returns { w, h, confidence, reasons:[] }
  function estimateSizeFromHints(url, srcsetItem = '') {
    let w = 0, h = 0, conf = 0; const reasons = [];

    const take = (val, bonus, reason) => {
      if (val && val > w) { w = val; conf += bonus; reasons.push(reason + ':' + val); }
    };

    // Highest confidence first
    let m;
    if ((m = url.match(RX_SIZE_SEG)))    take(+m[2], 6, 'Size_####');
    if ((m = srcsetItem.match(RX_SRCSET_W))) take(+m[1], 5, 'srcset ####w');
    if ((m = url.match(RX_PAIR_X)))      { take(+m[1], 5, 'pairX'); h = +m[2]; }
    if ((m = url.match(RX_CLOUDINARY)))  take(+m[1], 4, 'cloudinary w_');
    if ((m = url.match(RX_SHOPIFY)))     take(+m[1], 4, 'shopify _####x');
    if ((m = url.match(RX_W_SEG)))       take(+m[1], 3, 'path w_####/h_####');
    if ((m = url.match(RX_W_QS)))        take(+m[1], 3, 'qs w=');
    if ((m = url.match(RX_IMGIX_QS)))    take(+m[1], 3, 'imgix w=');
    if ((m = url.match(RX_AEM_IMW)))     take(+m[1], 3, 'aem width=');
    if ((m = url.match(RX_AMZ_SX)))      take(+m[1], 2, 'amazon SX####');
    if ((m = url.match(RX_H_QS)))        { h = +m[1]; conf += 1; reasons.push('qs h=' + h); }

    return { w, h, confidence: conf, reasons };
  }

  // Junk detection patterns
  const JUNK_HINTS = ['/thumb', '/thumbnail', '/mini', '/sprite', '/logo', '/banner', '/icon', '/swatch', '/color', '/placeholder', '/poster', '/360/', '/video'];
  
  function looksLikeJunk(url) { 
    const u = url.toLowerCase(); 
    return JUNK_HINTS.some(h => u.includes(h)); 
  }

  // Universal image scoring with LQIP awareness and size-based penalties
  function scoreImageURL(url, element = null, elementIndex = 0, srcsetItem = '') {
    if (!url) return 0;
    
    const { w, confidence } = estimateSizeFromHints(url, srcsetItem);
    let score = 50; // Base score

    // Size bonus/penalty from *any* hint we detected
    if (w >= 2000) score += 40;
    else if (w >= 1600) score += 30;
    else if (w >= 1200) score += 20;
    else if (w >= 800)  score += 10;
    else if (w > 0 && w < 450) score -= 50;     // Red-flag small thumbs (LQIP detection)

    // Double-bonus if we saw the very strong Size_#### path
    if (/\/(\$size_|\$Size_|Size[_-])(?:2000|1600|1440|1080)\//i.test(url)) score += 20;

    // Vendor "w_####" that's still big gets some love too
    if (/\/w[_-](?:2000|1600|1440|1200)(?:[\/._-]|$)/i.test(url)) score += 12;

    // Junk/UI elements sink
    if (looksLikeJunk(url)) score -= 60;

    // Position bias for first few gallery images (but gated by size)
    if (elementIndex <= 2 && (w === 0 || w >= 500)) score += 18; 
    else if (elementIndex <= 6 && (w === 0 || w >= 500)) score += 8;

    // Quality bonuses (gated by size)
    if (w === 0 || w >= 500) {
      if (/\.(webp|avif)($|\?)/i.test(url)) score += 10;
      if /(format|fm)=(webp|avif)/i.test(url)) score += 10;
      if (/f_auto/i.test(url)) score += 8; // Cloudinary auto format
      
      // CDN bonuses
      if (/\b(assets?|static|cdn|media|img)\./i.test(url)) score += 15;
      if (/\b(swarovski\.com|asset\.swarovski\.com|cloudinary\.com|imgix\.net|shopify\.com)\b/i.test(url)) score += 15;
    }

    // Confidence tiebreaker
    score += Math.min(confidence, 8);

    // Aggressive penalties for UI/navigation elements
    if (/\b(banner|logo|bg|background|header|footer|nav|navigation|menu)\b/i.test(url)) score -= 50;
    if (/\b(sprite|icon|badge|placeholder|loading|spinner)\b/i.test(url)) score -= 80;
    
    // Element-based context
    if (element) {
      const className = element.className || '';
      const id = element.id || '';
      const combined = (className + ' ' + id).toLowerCase();
      
      if (/\b(main|hero|primary|featured|product-image|gallery-main)\b/i.test(combined)) score += 20;
      if (/\b(thumb|thumbnail|small|mini|icon)\b/i.test(combined)) score -= 30;
    }

    return Math.max(0, score);
  }

  // Enhanced canonical grouping for LQIP variant detection
  function canonicalKeyV2(url) {
    try {
      const u = new URL(url);
      // Strip all size/format/quality transforms
      ['w','width','h','height','fit','auto','q','quality','fm','format'].forEach(p => u.searchParams.delete(p));
      
      let path = u.pathname;
      // Normalize size containers and transforms
      path = path.replace(/\/(\$size_|\$Size_|Size[_-])\d{3,4}\//ig, '/Size_XXXX/')
                 .replace(/\/w[_-]\d{2,4}(?=\/|\.|_|-)/ig, '/w_XX')
                 .replace(/_\d{3,4}x\./ig, '_XXXx.')
                 .replace(/[_-]SX\d{2,4}[_-]/ig, '_SXXX_');
      
      return `${u.host}${path}`;
    } catch { 
      return url.replace(/[?#].*$/, ''); 
    }
  }

  // Final width detection - returns last effective width from transforms
  function finalWidth(url) {
    const { w } = estimateSizeFromHints(url);
    return w || 0;
  }

  // LQIP detection
  function isLQIP(url, width = 0) {
    const w = width || finalWidth(url);
    return w <= 400 || /\b(blur|placeholder|lqip|thumb)\b/i.test(url) || /q[_=][1-4]\d\b/i.test(url);
  }