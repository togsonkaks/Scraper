require('dotenv').config();
const postgres = require('postgres');

const connectionString = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
const sql = postgres(connectionString);

let tagTaxonomy = [];
let categoryTree = [];
let isInitialized = false;

async function initializeTaxonomy(force = false) {
  if (isInitialized && !force) return;
  
  try {
    // Load all tags with their semantic types
    tagTaxonomy = await sql`
      SELECT name, slug, tag_type 
      FROM tags 
      ORDER BY tag_type, name
    `;
    
    // Load all categories with hierarchy
    categoryTree = await sql`
      SELECT category_id, name, slug, parent_id, level
      FROM categories
      ORDER BY level, name
    `;
    
    isInitialized = true;
    console.log(`✅ Auto-tagger initialized: ${tagTaxonomy.length} tags, ${categoryTree.length} categories`);
    
    // DEBUG: Check if "indigo" and "Jeans" exist
    const hasIndigo = tagTaxonomy.some(t => t.name.toLowerCase() === 'indigo');
    const hasJeans = categoryTree.some(c => c.name.toLowerCase() === 'jeans');
    console.log(`  🎨 Has "indigo" tag: ${hasIndigo}`);
    console.log(`  👖 Has "Jeans" category: ${hasJeans} (${categoryTree.filter(c => c.name.toLowerCase() === 'jeans').length} instances)`);
  } catch (error) {
    console.error('❌ Auto-tagger initialization failed:', error.message);
  }
}

function normalizeText(text) {
  if (!text) return '';
  return text.toLowerCase().trim();
}

function createSlug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Generate ALL possible singular/plural variations of a word
 * Handles: dress/dresses, glass/glasses, berry/berries, knife/knives, etc.
 * @param {string} word - The word to generate variations for
 * @returns {string[]} - Array of all possible forms (always includes original)
 */
function generatePluralVariations(word) {
  if (!word) return [];
  
  const lower = word.toLowerCase();
  const variations = new Set([word]); // Always include original
  
  // IRREGULAR PLURALS (common in products)
  const irregulars = {
    'man': 'men', 'woman': 'women', 'child': 'children', 'person': 'people',
    'foot': 'feet', 'tooth': 'teeth', 'goose': 'geese', 'mouse': 'mice',
    'ox': 'oxen', 'sheep': 'sheep', 'deer': 'deer', 'fish': 'fish'
  };
  
  // Check if word is irregular
  for (const [sing, plur] of Object.entries(irregulars)) {
    if (lower === sing) variations.add(plur);
    if (lower === plur) variations.add(sing);
  }
  
  // PATTERN 1: Ends with -ies (berry → berries, fly → flies)
  if (lower.endsWith('ies') && lower.length > 3) {
    const singular = lower.slice(0, -3) + 'y'; // berries → berry
    variations.add(singular);
  } else if (lower.endsWith('y') && lower.length > 1 && !'aeiou'.includes(lower[lower.length - 2])) {
    const plural = lower.slice(0, -1) + 'ies'; // berry → berries
    variations.add(plural);
  }
  
  // PATTERN 2: Ends with -ves (knife → knives, wolf → wolves)
  if (lower.endsWith('ves') && lower.length > 3) {
    const singular = lower.slice(0, -3) + 'f'; // knives → knife
    variations.add(singular);
    const singularFe = lower.slice(0, -3) + 'fe'; // wives → wife
    variations.add(singularFe);
  } else if ((lower.endsWith('f') || lower.endsWith('fe')) && lower.length > 2) {
    const stem = lower.endsWith('fe') ? lower.slice(0, -2) : lower.slice(0, -1);
    const plural = stem + 'ves'; // knife → knives, wife → wives
    variations.add(plural);
  }
  
  // PATTERN 3: Ends with -sses, -xes, -zes, -shes, -ches (glass → glasses, box → boxes)
  if (lower.endsWith('sses')) {
    const singular = lower.slice(0, -2); // glasses → glass
    variations.add(singular);
  } else if (lower.endsWith('ss') || lower.endsWith('x') || lower.endsWith('z') || 
             lower.endsWith('sh') || lower.endsWith('ch')) {
    const plural = lower + 'es'; // glass → glasses, box → boxes
    variations.add(plural);
  } else if (lower.endsWith('xes') || lower.endsWith('zes') || lower.endsWith('shes') || lower.endsWith('ches')) {
    const singular = lower.slice(0, -2); // boxes → box
    variations.add(singular);
  }
  
  // PATTERN 4: Ends with -oes (tomato → tomatoes, hero → heroes)
  if (lower.endsWith('oes') && lower.length > 3) {
    const singular = lower.slice(0, -2); // tomatoes → tomato
    variations.add(singular);
  } else if (lower.endsWith('o') && !'aeiou'.includes(lower[lower.length - 2])) {
    const plural = lower + 'es'; // tomato → tomatoes
    variations.add(plural);
  }
  
  // PATTERN 5: Regular -s ending (dress → dresses needs both!)
  if (lower.endsWith('s') && !lower.endsWith('ss')) {
    const singular = lower.slice(0, -1); // dresses → dresse, then we try dress
    variations.add(singular);
    // Also try removing just the 's' for regular plurals
    if (singular.endsWith('se')) {
      variations.add(singular.slice(0, -1)); // dresse → dress
    }
  }
  
  // PATTERN 6: Add regular -s plural if not already ending in s
  if (!lower.endsWith('s')) {
    variations.add(lower + 's'); // dress → dresss (covers edge cases)
    variations.add(lower + 'es'); // dress → dresses
  }
  
  // PATTERN 7: Always try both +s and +es regardless
  variations.add(lower + 's');
  variations.add(lower + 'es');
  
  // Return unique variations with original capitalization pattern
  const result = Array.from(variations).map(v => {
    // Preserve original capitalization pattern
    if (word[0] === word[0].toUpperCase()) {
      return v.charAt(0).toUpperCase() + v.slice(1);
    }
    return v;
  });
  
  return result;
}

/**
 * Smart color detection with 2-tier priority system
 * Tier 1: title + URL (most reliable)
 * Tier 2: specs + description + JSON-LD (fallback)
 * Max 2 colors: first color + check for "and"/"," pattern
 * 
 * @param {Object} productData - The product data
 * @param {string} tier1Text - Title + URL + breadcrumbs + JSON-LD
 * @param {string} tier2Text - Specs + brand
 * @param {string} tier3Text - Description
 * @returns {Array} - Array of matched color tag objects (max 2)
 */
function detectColors(productData, tier1Text, tier2Text, tier3Text) {
  // Get all color tags from taxonomy
  const allColorTags = tagTaxonomy.filter(t => t.type === 'colors');
  
  // Helper function to find colors in text with position tracking
  const findColorsInText = (text) => {
    const found = [];
    const lowerText = text.toLowerCase();
    
    allColorTags.forEach(colorTag => {
      // Generate all variations for this color
      const variations = generatePluralVariations(colorTag.name);
      
      variations.forEach(variant => {
        // Word boundary regex to match the color
        const regex = new RegExp(`\\b${variant.toLowerCase()}\\b`, 'i');
        const match = lowerText.match(regex);
        
        if (match) {
          found.push({
            tag: colorTag,
            position: match.index,
            matchedAs: variant
          });
        }
      });
    });
    
    // Sort by position (earliest first)
    return found.sort((a, b) => a.position - b.position);
  };
  
  // Helper to check if two colors are connected by "and" or ","
  const areColorsConnected = (text, color1Pos, color2Pos) => {
    const between = text.substring(color1Pos, color2Pos).toLowerCase();
    // Check for patterns like "red and blue", "red, blue", "red & blue"
    return /\band\b|,|&/.test(between);
  };
  
  // TIER 1: Check title + URL first (highest priority)
  const tier1Colors = findColorsInText(tier1Text);
  
  if (tier1Colors.length > 0) {
    const firstColor = tier1Colors[0];
    const result = [firstColor.tag];
    
    // Check if there's a second color connected by "and" or ","
    if (tier1Colors.length > 1) {
      const secondColor = tier1Colors[1];
      if (areColorsConnected(tier1Text, firstColor.position, secondColor.position)) {
        result.push(secondColor.tag);
      }
    }
    
    console.log(`  🎨 Colors detected (Tier 1 - title/URL): ${result.map(c => c.name).join(', ')}`);
    return result;
  }
  
  // TIER 2: Fallback to specs + description + JSON-LD
  const tier2FullText = `${tier2Text} ${tier3Text}`;
  const tier2Colors = findColorsInText(tier2FullText);
  
  if (tier2Colors.length > 0) {
    const firstColor = tier2Colors[0];
    const result = [firstColor.tag];
    
    // Check if there's a second color connected by "and" or ","
    if (tier2Colors.length > 1) {
      const secondColor = tier2Colors[1];
      if (areColorsConnected(tier2FullText, firstColor.position, secondColor.position)) {
        result.push(secondColor.tag);
      }
    }
    
    console.log(`  🎨 Colors detected (Tier 2 - specs/description): ${result.map(c => c.name).join(', ')}`);
    return result;
  }
  
  console.log('  🎨 No colors detected');
  return [];
}

// Phrase Override System: Handles edge cases BEFORE keyword matching
// Supports excludeIf for context-aware matching
const PHRASE_OVERRIDES = [
  // Pool & Water Products (higher priority)
  { phrase: 'pool float', categoryPath: 'Home & Garden > Garden & Outdoor > Pool & Spa > Pool Float' },
  
  // Beds (multiple contexts with exclusions)
  { phrase: 'tanning bed', excludeIf: ['pool', 'float', 'inflatable', 'lounger'], categoryPath: 'Beauty & Personal Care > Tanning > Tanning Beds' },
  { phrase: 'dog bed', categoryPath: 'Pet Supplies > Dog > Beds & Furniture' },
  { phrase: 'cat bed', categoryPath: 'Pet Supplies > Cat > Beds & Furniture' },
  { phrase: 'pet bed', categoryPath: 'Pet Supplies > Beds & Furniture' },
  { phrase: 'truck bed', categoryPath: 'Automotive > Truck Accessories > Bed Accessories' },
  { phrase: 'flower bed', categoryPath: 'Home & Garden > Garden & Outdoor > Landscaping' },
  
  // Other common collisions
  { phrase: 'watch band', categoryPath: 'Jewelry & Watches > Watch Accessories > Bands' },
  { phrase: 'phone case', categoryPath: 'Electronics > Mobile Accessories > Cases' },
  { phrase: 'guitar case', categoryPath: 'Musical Instruments > Instrument Accessories > Cases' },
  { phrase: 'sofa cover', categoryPath: 'Home & Garden > Furniture > Living Room > Slipcovers' },
  { phrase: 'book cover', categoryPath: 'Books & Media > Book Accessories > Book Covers' }
];

// Category Synonym Mapping: Maps common variations to canonical category names
// This allows matching "trousers" to "Pants", "trainers" to "Sneakers", etc.
const CATEGORY_SYNONYMS = {
  // Bottoms synonyms
  'trousers': 'Pants',
  'slacks': 'Pants',
  'chinos': 'Pants',
  
  // Tops synonyms
  'jumper': 'Sweater',
  'pullover': 'Sweater',
  'tee': 'T-Shirt',
  'tee-shirt': 'T-Shirt',
  
  // Footwear synonyms
  'trainers': 'Sneakers',
  'kicks': 'Sneakers',
  'tennis-shoes': 'Sneakers',
  'running-shoes': 'Sneakers',
  
  // Outerwear synonyms
  'parka': 'Coat',
  'windbreaker': 'Jacket',
  'blazer': 'Jacket',
  
  // Accessories synonyms
  'purse': 'Handbags',
  'tote': 'Bags',
  'backpack': 'Bags',
  'rucksack': 'Bags'
};

function checkPhraseOverrides(productData) {
  // Combine all text for phrase checking
  const allText = [
    productData.title || '',
    productData.description || '',
    Array.isArray(productData.breadcrumbs) ? productData.breadcrumbs.join(' ') : (productData.breadcrumbs || ''),
    productData.url || ''
  ].join(' ').toLowerCase();
  
  // Check each phrase override (in order - first match wins)
  for (const override of PHRASE_OVERRIDES) {
    const pattern = new RegExp(`\\b${override.phrase}\\b`, 'i');
    if (pattern.test(allText)) {
      // Check excludeIf conditions
      if (override.excludeIf && Array.isArray(override.excludeIf)) {
        const hasExclusion = override.excludeIf.some(keyword => {
          const excludePattern = new RegExp(`\\b${keyword}\\b`, 'i');
          return excludePattern.test(allText);
        });
        
        if (hasExclusion) {
          console.log(`  ⏭️  PHRASE SKIP: Found "${override.phrase}" but excluded due to context (${override.excludeIf.join(', ')})`);
          continue; // Skip this override and check next one
        }
      }
      
      console.log(`  🎯 PHRASE OVERRIDE: Found "${override.phrase}" → ${override.categoryPath}`);
      return override.categoryPath;
    }
  }
  
  return null; // No override found
}

function matchTags(text, tagType = null) {
  const normalizedText = normalizeText(text);
  const matches = [];
  
  const tagsToCheck = tagType 
    ? tagTaxonomy.filter(t => t.tag_type === tagType)
    : tagTaxonomy;
  
  for (const tag of tagsToCheck) {
    // Generate ALL plural/singular variations (pocket/pockets, zipper/zippers, etc.)
    const variations = generatePluralVariations(tag.name);
    
    // Check if ANY variation matches in the text
    let hasMatch = false;
    for (const variant of variations) {
      const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
      if (pattern.test(normalizedText)) {
        hasMatch = true;
        break;
      }
    }
    
    if (hasMatch) {
      matches.push({
        name: tag.name,
        slug: tag.slug,
        type: tag.tag_type
      });
    }
  }
  
  return matches;
}

function matchCategories(text, productData = {}) {
  if (!text) return [];
  
  const normalizedText = normalizeText(text);
  const matches = [];
  
  // Prepare weighted text sources for frequency counting
  const textSources = {
    breadcrumbs: normalizeText(Array.isArray(productData.breadcrumbs) 
      ? productData.breadcrumbs.join(' ') 
      : (productData.breadcrumbs || '')),
    title: normalizeText(productData.title || ''),
    url: normalizeText(productData.url || ''),
    description: normalizeText(productData.description || ''),
    specs: normalizeText(productData.specs || '')
  };
  
  // Search ALL categories - no gender filtering (weighted scoring handles gendered products naturally)
  const categoriesToSearch = categoryTree;
  
  // Search for category NAMES in product data with frequency counting
  for (const category of categoriesToSearch) {
    // Generate ALL plural/singular variations (dress/dresses, glass/glasses, etc.)
    const variations = generatePluralVariations(category.name);
    
    // Create regex patterns for all variations
    const patterns = variations.map(variant => {
      const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`, 'gi');
    });
    
    // Also check for synonyms (e.g., "trousers" should match "Pants")
    const synonymPatterns = [];
    for (const [synonym, canonical] of Object.entries(CATEGORY_SYNONYMS)) {
      if (canonical.toLowerCase() === category.name.toLowerCase()) {
        const escapedSynonym = synonym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        synonymPatterns.push(new RegExp(`\\b${escapedSynonym}\\b`, 'gi'));
      }
    }
    
    let hasMatch = false;
    
    // Check direct name patterns
    for (const pattern of patterns) {
      if (pattern.test(normalizedText)) {
        hasMatch = true;
        break;
      }
    }
    
    // Check synonym patterns if no direct match
    if (!hasMatch) {
      for (const pattern of synonymPatterns) {
        if (pattern.test(normalizedText)) {
          hasMatch = true;
          break;
        }
      }
    }
    
    if (hasMatch) {
      const fullPath = buildCategoryPath(category.category_id);
      
      // Count frequency across weighted sources (using all plural patterns + synonyms)
      let frequencyScore = 0;
      let breadcrumbMatches = 0;
      let titleMatches = 0;
      let urlMatches = 0;
      let descriptionMatches = 0;
      let specsMatches = 0;
      
      // Count matches for all patterns (singular + plurals)
      for (const pattern of patterns) {
        breadcrumbMatches += (textSources.breadcrumbs.match(pattern) || []).length;
        titleMatches += (textSources.title.match(pattern) || []).length;
        urlMatches += (textSources.url.match(pattern) || []).length;
        descriptionMatches += (textSources.description.match(pattern) || []).length;
        specsMatches += (textSources.specs.match(pattern) || []).length;
      }
      
      // Also count synonym matches
      for (const pattern of synonymPatterns) {
        breadcrumbMatches += (textSources.breadcrumbs.match(pattern) || []).length;
        titleMatches += (textSources.title.match(pattern) || []).length;
        urlMatches += (textSources.url.match(pattern) || []).length;
        descriptionMatches += (textSources.description.match(pattern) || []).length;
        specsMatches += (textSources.specs.match(pattern) || []).length;
      }
      
      // Weighted scoring: URL (6x) > Title (4x) > Breadcrumbs (3x) > Specs (2x) = Description (2x)
      // URL and title are cleanest/most consistent, breadcrumbs can be messy
      frequencyScore = (urlMatches * 6) + (titleMatches * 4) + (breadcrumbMatches * 3) + 
                       (specsMatches * 2) + (descriptionMatches * 2);
      
      // DEPTH BONUS: Add +50 points per level to heavily favor specific categories over generic parents
      // This ensures "Fashion > Men > Clothing > Jacket" beats "Fashion > Men"
      const depthBonus = fullPath.length * 50;
      const finalScore = frequencyScore + depthBonus;
      
      matches.push({
        id: category.category_id,
        name: category.name,
        slug: category.slug,
        parent_id: category.parent_id,
        level: category.level,
        matchedPath: fullPath.map(p => p.name).join(' > ').toLowerCase(),
        pathDepth: fullPath.length,
        frequencyScore: finalScore,
        rawFrequency: frequencyScore,
        depthBonus: depthBonus,
        matchDetails: { breadcrumbMatches, titleMatches, urlMatches, descriptionMatches, specsMatches }
      });
    }
  }
  
  // Sort by FINAL score (frequency + depth bonus), prioritizing deeper/more specific categories
  matches.sort((a, b) => {
    return b.frequencyScore - a.frequencyScore;
  });
  
  return matches;
}

function buildCategoryPath(categoryId) {
  const path = [];
  let currentId = categoryId;
  
  while (currentId) {
    const category = categoryTree.find(c => c.category_id === currentId);
    if (!category) break;
    
    path.unshift({
      id: category.category_id,
      name: category.name,
      slug: category.slug,
      level: category.level
    });
    
    currentId = category.parent_id;
  }
  
  return path;
}

function calculateConfidence(tagsByType) {
  let score = 0;
  
  if (tagsByType.colors?.length > 0) score += 0.10;
  if (tagsByType.materials?.length > 0) score += 0.15;
  if (tagsByType.activities?.length > 0) score += 0.10;
  if (tagsByType.styles?.length > 0) score += 0.15;
  if (tagsByType.features?.length > 0) score += 0.15;
  if (tagsByType.fit?.length > 0) score += 0.10;
  if (tagsByType.occasions?.length > 0) score += 0.10;
  if (tagsByType.categories?.length > 0) score += 0.15;
  
  return Math.min(score, 0.95).toFixed(2);
}

function extractUrlKeywords(url) {
  if (!url) return '';
  
  try {
    // Extract path from URL (e.g., "/women/apparel/jackets/eco-myles-canvas-field-jacket-green/W5BL0BWL372.html")
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    
    // Remove common file extensions and product codes
    const cleanedParts = pathParts
      .map(part => part.replace(/\.(html|php|aspx)$/i, ''))
      .filter(part => !/^[A-Z0-9]{8,}$/i.test(part)); // Remove product codes like "W5BL0BWL372"
    
    // Join with spaces and replace hyphens/underscores with spaces
    const urlText = cleanedParts.join(' ').replace(/[-_]/g, ' ');
    
    return urlText;
  } catch (e) {
    return '';
  }
}

/**
 * Comprehensive unified gender detection with tiered search and exhaustive keywords
 * @param {Object} productData - All product data
 * @param {string} categoryPath - Final category path (e.g., "Fashion > Women > Clothing")
 * @returns {Object} { gender: string|null, source: string, confidence: string }
 */
function detectGender(productData, categoryPath = null) {
  // Exhaustive gender keyword patterns (no global flag to avoid stateful .test() issues)
  const WOMEN_KEYWORDS = /\b(woman|women|womens|lady|ladies|female|girl|girls|mom|mother|mommy|mum|mama|daughter|sister|aunt|aunty|auntie|niece|grandmother|grandma|granny|nana|miss|mrs|ms|ma'am|madam|madame|queen|empress|princess|duchess|goddess|wife|girlfriend|bride|bridesmaid|fiancée|maternity|nursing|bridal|bra|lingerie|dress|skirt|blouse|heels|purse|handbag|señora|señorita|femme|feminine|her|hers|she)\b/i;
  
  const MEN_KEYWORDS = /\b(man|men|mens|gentleman|gentlemen|male|boy|boys|guy|guys|dad|father|daddy|papa|son|brother|uncle|nephew|grandfather|grandpa|gramps|pop|mr|sir|mister|señor|king|emperor|prince|duke|lord|husband|boyfriend|groom|groomsman|fiancé|beard|shave|razor|tie|necktie|tuxedo|suit|cologne|masculine|homme|his|him|he)\b/i;
  
  const KIDS_KEYWORDS = /\b(baby|infant|toddler|child|children|kids|youth|junior|teen|teenager|adolescent)\b/i;
  
  const UNISEX_KEYWORDS = /\b(unisex|gender-neutral|everyone|all-gender|non-binary)\b/i;
  
  // Helper to find ALL genders in text (detects conflicts)
  const findAllGenders = (text) => {
    if (!text) return [];
    const normalized = normalizeText(text);
    const foundGenders = [];
    
    // Check each gender type independently
    if (UNISEX_KEYWORDS.test(normalized)) foundGenders.push('unisex');
    if (WOMEN_KEYWORDS.test(normalized)) foundGenders.push('women');
    if (MEN_KEYWORDS.test(normalized)) foundGenders.push('men');
    if (KIDS_KEYWORDS.test(normalized)) foundGenders.push('kids');
    
    return foundGenders;
  };
  
  // Helper to check tier for single gender (skip if 0 or 2+ genders found)
  const checkTierForGender = (text) => {
    const genders = findAllGenders(text);
    
    // If exactly 1 gender found, return it (including "unisex")
    if (genders.length === 1) return genders[0];
    
    // If 0 genders → skip (return null)
    // If 2+ genders → conflict! skip (return null)
    return null;
  };
  
  // TIER 0: Breadcrumbs (highest confidence - retailer's structured categorization)
  // Breadcrumbs are the most reliable because they're how the retailer categorizes the product
  // This prevents collision issues like "baby tee" (women's style) being tagged as kids
  const breadcrumbText = Array.isArray(productData.breadcrumbs) 
    ? productData.breadcrumbs.join(' ') 
    : (productData.breadcrumbs || '');
  
  const tier0Gender = checkTierForGender(breadcrumbText);
  if (tier0Gender) {
    return { gender: tier0Gender, source: 'breadcrumbs', confidence: 'highest' };
  }
  
  // TIER 1: Title + URL + JSON-LD (high confidence)
  // Stringify entire JSON-LD to capture gender info in ANY field (captions, descriptions, etc.)
  let jsonLdText = '';
  if (productData.jsonLd && typeof productData.jsonLd === 'object') {
    try {
      jsonLdText = JSON.stringify(productData.jsonLd);
    } catch (e) {
      jsonLdText = '';
    }
  }
  
  const tier1Text = [
    productData.title || '',
    extractUrlKeywords(productData.url || ''),
    jsonLdText
  ].join(' ');
  
  const tier1Gender = checkTierForGender(tier1Text);
  if (tier1Gender) {
    const source = jsonLdText && checkTierForGender(jsonLdText) ? 'title/url/json-ld' : 'title/url';
    return { gender: tier1Gender, source, confidence: 'high' };
  }
  
  // TIER 2: Specs (medium confidence)
  const tier2Gender = checkTierForGender(productData.specs || '');
  if (tier2Gender) {
    return { gender: tier2Gender, source: 'specs', confidence: 'medium' };
  }
  
  // TIER 3: Description (lower confidence)
  const tier3Gender = checkTierForGender(productData.description || '');
  if (tier3Gender) {
    return { gender: tier3Gender, source: 'description', confidence: 'low' };
  }
  
  // TIER 4: Extract from category path (fallback)
  if (categoryPath) {
    const pathLower = categoryPath.toLowerCase();
    if (pathLower.includes('unisex')) return { gender: 'unisex', source: 'category-path', confidence: 'fallback' };
    if (pathLower.includes('women')) return { gender: 'women', source: 'category-path', confidence: 'fallback' };
    if (pathLower.includes('men') && !pathLower.includes('women')) return { gender: 'men', source: 'category-path', confidence: 'fallback' };
    if (pathLower.includes('kids') || pathLower.includes('boys') || pathLower.includes('girls')) {
      return { gender: 'kids', source: 'category-path', confidence: 'fallback' };
    }
  }
  
  return { gender: null, source: 'none', confidence: 'none' };
}

async function autoTag(productData) {
  // Initialize taxonomy if needed
  await initializeTaxonomy();
  
  // Normalize breadcrumbs
  let breadcrumbsArray = [];
  
  if (productData.breadcrumbs) {
    if (Array.isArray(productData.breadcrumbs)) {
      breadcrumbsArray = productData.breadcrumbs;
    } else if (typeof productData.breadcrumbs === 'string') {
      breadcrumbsArray = productData.breadcrumbs.split(/\s*[/>|›»]\s*/).filter(Boolean);
    }
  }
  
  // Filter out product title from breadcrumbs
  const filteredBreadcrumbs = breadcrumbsArray.filter((crumb, idx) => {
    const isLastCrumb = idx === breadcrumbsArray.length - 1;
    const matchesTitle = productData.title && 
      normalizeText(crumb).includes(normalizeText(productData.title.substring(0, 30)));
    return !(isLastCrumb && matchesTitle);
  });
  
  // Extract keywords from URL
  const urlKeywords = extractUrlKeywords(productData.url);
  
  // Stringify JSON-LD to capture ALL fields (category, brand, etc.)
  let jsonLdText = '';
  if (productData.jsonLd && typeof productData.jsonLd === 'object') {
    try {
      jsonLdText = JSON.stringify(productData.jsonLd);
    } catch (e) {
      jsonLdText = '';
    }
  }
  
  // Build search text with weighted priority (title and URL first, then breadcrumbs, then rest)
  const tier1Text = [
    productData.title || '',
    urlKeywords,
    filteredBreadcrumbs.join(' '),
    jsonLdText  // Include JSON-LD in tier 1 (highest priority)
  ].join(' ');
  
  const tier2Text = [
    productData.specs || '',
    productData.brand || ''
  ].join(' ');
  
  const tier3Text = productData.description || '';
  
  // Combine all tiers (tier 1 gets weighted by appearing multiple times in matching)
  const searchText = `${tier1Text} ${tier2Text} ${tier3Text}`;
  
  console.log('🔍 AUTO-TAGGER DEBUG:');
  console.log('  📝 Title:', productData.title?.substring(0, 80));
  console.log('  🔗 URL keywords:', urlKeywords?.substring(0, 80));
  console.log('  🏷️ Breadcrumbs:', Array.isArray(filteredBreadcrumbs) ? filteredBreadcrumbs.join(' > ') : filteredBreadcrumbs);
  console.log('  📊 JSON-LD:', jsonLdText ? jsonLdText.substring(0, 150) + '...' : 'none');
  console.log('  📄 Description:', productData.description?.substring(0, 100));
  console.log('  🔤 Search text length:', searchText.length, 'chars');
  
  // Match all tags from search text
  let allMatchedTags = matchTags(searchText);
  console.log('  ✅ Matched tags:', allMatchedTags.length, '→', allMatchedTags.map(t => t.name).join(', '));
  
  // Group tags by semantic type
  const tagsByType = {
    colors: allMatchedTags.filter(t => t.type === 'colors'),
    materials: allMatchedTags.filter(t => t.type === 'materials'),
    activities: allMatchedTags.filter(t => t.type === 'activities'),
    styles: allMatchedTags.filter(t => t.type === 'styles'),
    features: allMatchedTags.filter(t => t.type === 'features'),
    fit: allMatchedTags.filter(t => t.type === 'fit'),
    occasions: allMatchedTags.filter(t => t.type === 'occasions')
  };
  
  // EARLY gender detection (without category path) - for product metadata only
  const earlyGenderResult = detectGender(productData, null);
  let gender = earlyGenderResult.gender;
  
  if (gender) {
    console.log(`  👤 Gender (early): ${gender} [${earlyGenderResult.source}, ${earlyGenderResult.confidence}]`);
  } else {
    console.log('  👤 Gender (early): not detected yet');
  }
  
  // STEP 1: Check for phrase overrides FIRST (handles edge cases)
  const phraseOverride = checkPhraseOverrides(productData);
  
  // Match categories from ALL product data with frequency scoring (no gender filtering)
  let matchedCategories = [];
  if (!phraseOverride) {
    matchedCategories = matchCategories(searchText, productData);
    console.log('  📂 Matched categories:', matchedCategories.length, '→', 
      matchedCategories.map(c => `${c.name} (score: ${c.frequencyScore}, lvl ${c.level})`).join(', '));
  } else {
    console.log('  📂 Using phrase override, skipping normal category matching');
  }
  
  // Find primary category (phrase override OR best match from frequency scoring)
  let primaryCategory = null;
  let categoryPath = [];
  
  if (phraseOverride) {
    // Use phrase override directly
    primaryCategory = phraseOverride;
    console.log('  ✨ FINAL PATH (OVERRIDE):', primaryCategory);
  } else if (matchedCategories.length > 0) {
    // Pick the HIGHEST SCORING category (already sorted by frequency score + depth)
    const bestMatch = matchedCategories[0];
    
    console.log('  🎯 Best category match:', bestMatch.name, 
      `(score: ${bestMatch.frequencyScore}, lvl ${bestMatch.level}, id: ${bestMatch.id})`);
    console.log('    Match details:', JSON.stringify(bestMatch.matchDetails));
    
    categoryPath = buildCategoryPath(bestMatch.id);
    
    // Store full hierarchy path as string (consistent with LLM format)
    primaryCategory = categoryPath.map(c => c.name).join(' > ');
    
    console.log('  ✨ FINAL PATH:', primaryCategory);
  } else {
    console.log('  ⚠️ NO CATEGORIES MATCHED!');
  }
  
  // Category-aware tag filtering: Remove nonsense tags based on department
  if (primaryCategory) {
    const department = primaryCategory.split(' > ')[0].toLowerCase();
    
    // Define valid tag types for each department
    const departmentTagRules = {
      'fashion': ['colors', 'materials', 'fit', 'styles', 'occasions'],
      'tools & hardware': ['tool-types', 'materials', 'features', 'activities'],
      'automotive': ['automotive', 'materials', 'features'],
      'sports & outdoors': ['activities', 'materials', 'features', 'colors', 'styles'],
      'kitchen & dining': ['kitchen', 'materials', 'features', 'colors'],
      'home & garden': ['materials', 'features', 'colors', 'styles'],
      'beauty & personal care': ['beauty', 'features', 'occasions'],
      'electronics': ['features', 'materials'],
      'pet supplies': ['materials', 'features'],
      'toys & games': ['features', 'materials', 'occasions'],
      'office & school': ['materials', 'features'],
      'health & wellness': ['features', 'occasions'],
      'baby & kids': ['materials', 'features', 'occasions', 'fit'],
      'books & media': ['features', 'occasions'],
      'grocery & food': ['features', 'occasions'],
      'jewelry & watches': ['materials', 'styles', 'occasions'],
      'luggage & travel': ['materials', 'features', 'styles'],
      'musical instruments': ['features', 'materials'],
      'arts & crafts': ['materials', 'features']
    };
    
    const allowedTypes = departmentTagRules[department] || [];
    
    if (allowedTypes.length > 0) {
      const originalTagCount = allMatchedTags.length;
      
      // Filter tags by allowed types
      allMatchedTags = allMatchedTags.filter(tag => allowedTypes.includes(tag.type));
      
      // Update tagsByType
      tagsByType.colors = allMatchedTags.filter(t => t.type === 'colors');
      tagsByType.materials = allMatchedTags.filter(t => t.type === 'materials');
      tagsByType.activities = allMatchedTags.filter(t => t.type === 'activities');
      tagsByType.styles = allMatchedTags.filter(t => t.type === 'styles');
      tagsByType.features = allMatchedTags.filter(t => t.type === 'features');
      tagsByType.fit = allMatchedTags.filter(t => t.type === 'fit');
      tagsByType.occasions = allMatchedTags.filter(t => t.type === 'occasions');
      
      if (originalTagCount > allMatchedTags.length) {
        console.log(`  🚫 Filtered ${originalTagCount} → ${allMatchedTags.length} tags for department: ${department}`);
      }
    }
  }
  
  // FINAL gender detection with category path fallback (Tier 4)
  const finalGenderResult = detectGender(productData, primaryCategory);
  gender = finalGenderResult.gender;
  
  if (gender) {
    console.log(`  👤 Gender (final): ${gender} [${finalGenderResult.source}, ${finalGenderResult.confidence}]`);
  } else {
    console.log('  👤 Gender (final): not detected');
  }
  
  const confidence = calculateConfidence(tagsByType);
  
  return {
    primaryCategory,
    categoryPath,
    gender,
    tags: allMatchedTags,
    tagsByType,
    matchedCategories,
    confidenceScore: parseFloat(confidence),
    needsLLMEnrichment: parseFloat(confidence) < 0.70
  };
}

// Force refresh taxonomy (for self-learning)
async function refreshTaxonomy() {
  return initializeTaxonomy(true);
}

module.exports = { autoTag, initializeTaxonomy, refreshTaxonomy };
