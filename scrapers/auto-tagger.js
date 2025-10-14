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
    const pattern = new RegExp(`\\b${tag.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(normalizedText)) {
      matches.push({
        name: tag.name,
        slug: tag.slug,
        type: tag.tag_type
      });
    }
  }
  
  return matches;
}

function matchCategories(text, productData = {}, detectedGender = null) {
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
  
  // Filter categories by gender BEFORE matching (if gender detected)
  let categoriesToSearch = categoryTree;
  if (detectedGender) {
    const genderKeyword = detectedGender === 'boys' || detectedGender === 'girls' ? 'kids' : detectedGender;
    categoriesToSearch = categoryTree.filter(category => {
      const fullPath = buildCategoryPath(category.category_id);
      const pathSegments = fullPath.map(p => p.name.toLowerCase());
      return pathSegments.includes(genderKeyword);
    });
    console.log(`  🔍 Pre-filtered categories: ${categoryTree.length} → ${categoriesToSearch.length} (gender: ${genderKeyword})`);
  }
  
  // Search for category NAMES in product data with frequency counting
  for (const category of categoriesToSearch) {
    const escapedName = category.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Match both singular and plural forms bidirectionally
    const patterns = [
      new RegExp(`\\b${escapedName}\\b`, 'gi') // Exact match
    ];
    
    // If category is plural (ends with 's'), also try singular
    if (category.name.toLowerCase().endsWith('s')) {
      // Remove trailing 's' for singular (Sandals → Sandal)
      const singularName = category.name.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      patterns.push(new RegExp(`\\b${singularName}\\b`, 'gi'));
    } else {
      // If category is singular, try plural forms
      patterns.push(new RegExp(`\\b${escapedName}s\\b`, 'gi'));   // Add 's'
      patterns.push(new RegExp(`\\b${escapedName}es\\b`, 'gi'));  // Add 'es'
    }
    
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
  // Exhaustive gender keyword patterns
  const WOMEN_KEYWORDS = /\b(woman|women|lady|ladies|female|girl|girls|mom|mother|mommy|mum|mama|daughter|sister|aunt|aunty|auntie|niece|grandmother|grandma|granny|nana|miss|mrs|ms|ma'am|madam|madame|queen|empress|princess|duchess|goddess|wife|girlfriend|bride|bridesmaid|fiancée|maternity|nursing|bridal|bra|lingerie|dress|skirt|blouse|heels|purse|handbag|señora|señorita|femme|feminine|her|hers|she)\b/gi;
  
  const MEN_KEYWORDS = /\b(man|men|gentleman|gentlemen|male|boy|boys|guy|guys|dad|father|daddy|papa|son|brother|uncle|nephew|grandfather|grandpa|gramps|pop|mr|sir|mister|señor|king|emperor|prince|duke|lord|husband|boyfriend|groom|groomsman|fiancé|beard|shave|razor|tie|necktie|tuxedo|suit|cologne|masculine|homme|his|him|he)\b/gi;
  
  const KIDS_KEYWORDS = /\b(baby|infant|toddler|child|children|kids|youth|junior|teen|teenager|adolescent)\b/gi;
  
  const UNISEX_KEYWORDS = /\b(unisex|gender-neutral|everyone|all-gender|non-binary)\b/gi;
  
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
  
  // Build search text with weighted priority (title and URL first, then breadcrumbs, then rest)
  const tier1Text = [
    productData.title || '',
    urlKeywords,
    filteredBreadcrumbs.join(' ')
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
  
  // EARLY gender detection (without category path) - used for filtering categories
  const earlyGenderResult = detectGender(productData, null);
  let gender = earlyGenderResult.gender;
  
  if (gender) {
    console.log(`  👤 Gender (early): ${gender} [${earlyGenderResult.source}, ${earlyGenderResult.confidence}]`);
  } else {
    console.log('  👤 Gender (early): not detected yet');
  }
  
  // STEP 1: Check for phrase overrides FIRST (handles edge cases)
  const phraseOverride = checkPhraseOverrides(productData);
  
  // Match categories from ALL product data with frequency scoring
  // Pass detected gender to FILTER categories BEFORE matching (not after)
  let matchedCategories = [];
  if (!phraseOverride) {
    matchedCategories = matchCategories(searchText, productData, gender);
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
