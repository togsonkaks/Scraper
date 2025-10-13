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
  
  // Search for category NAMES in product data with frequency counting
  for (const category of categoryTree) {
    const escapedName = category.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Match both singular and plural forms (e.g., "Float" and "Floats")
    const patterns = [
      new RegExp(`\\b${escapedName}\\b`, 'gi'),
      new RegExp(`\\b${escapedName}s\\b`, 'gi'), // Plural with 's'
      new RegExp(`\\b${escapedName}es\\b`, 'gi')  // Plural with 'es'
    ];
    
    let hasMatch = false;
    for (const pattern of patterns) {
      if (pattern.test(normalizedText)) {
        hasMatch = true;
        break;
      }
    }
    
    if (hasMatch) {
      const fullPath = buildCategoryPath(category.category_id);
      
      // Count frequency across weighted sources (using all plural patterns)
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
  
  // Detect gender FIRST (from breadcrumbs and product text)
  let gender = null;
  
  // Priority 1: Check breadcrumbs (most reliable)
  const breadcrumbText = normalizeText(
    Array.isArray(productData.breadcrumbs) 
      ? productData.breadcrumbs.join(' ') 
      : (productData.breadcrumbs || '')
  );
  const breadcrumbGenderMatch = breadcrumbText.match(/\b(men|women|unisex|boys|girls|kids)\b/gi);
  
  if (breadcrumbGenderMatch && breadcrumbGenderMatch.length > 0) {
    gender = breadcrumbGenderMatch[0].toLowerCase();
    console.log('  👤 Gender from breadcrumbs:', gender);
  } else {
    // Priority 2: Check all product text
    const textGenderMatch = searchText.match(/\b(men|women|unisex|boys|girls|kids)\b/gi);
    if (textGenderMatch && textGenderMatch.length > 0) {
      gender = textGenderMatch[0].toLowerCase();
      console.log('  👤 Gender from text:', gender);
    }
  }
  
  // Priority 3: Infer from product keywords if no explicit gender found
  if (!gender) {
    const womenKeywords = /\b(woman|women|girl|girls|lady|ladies|female|miss|mrs|ms|her|hers|she|bridal|bride|femme|feminine|goddess|gown|dress|blouse|skirt|heels|bra|pink|rose-gold|mauve|lavender|cowgirl)\b/gi;
    const menKeywords = /\b(man|men|boy|boys|male|gentleman|gentlemen|mr|his|him|he|groom|masculine|tie|necktie|tuxedo|beard|shave|razor|cowboy)\b/gi;
    
    if (womenKeywords.test(searchText)) {
      gender = 'women';
      console.log('  👤 Gender inferred from keywords:', gender);
    } else if (menKeywords.test(searchText)) {
      gender = 'men';
      console.log('  👤 Gender inferred from keywords:', gender);
    }
  }
  
  // STEP 1: Check for phrase overrides FIRST (handles edge cases)
  const phraseOverride = checkPhraseOverrides(productData);
  
  // Match categories from ALL product data with frequency scoring
  let matchedCategories = [];
  if (!phraseOverride) {
    matchedCategories = matchCategories(searchText, productData);
    console.log('  📂 Matched categories:', matchedCategories.length, '→', 
      matchedCategories.map(c => `${c.name} (score: ${c.frequencyScore}, lvl ${c.level})`).join(', '));
  } else {
    console.log('  📂 Using phrase override, skipping normal category matching');
  }
  
  // FILTER categories by detected gender (if we have one)
  if (gender && matchedCategories.length > 1) {
    const genderKeyword = gender === 'boys' || gender === 'girls' ? 'kids' : gender;
    
    // Split path into segments and check for EXACT match (avoid "men" matching "women")
    const genderedCategories = matchedCategories.filter(cat => {
      const pathSegments = cat.matchedPath.split(' > ').map(s => s.trim().toLowerCase());
      return pathSegments.includes(genderKeyword);
    });
    
    if (genderedCategories.length > 0) {
      console.log(`  🎯 Filtered ${matchedCategories.length} → ${genderedCategories.length} categories using gender: ${gender}`);
      matchedCategories = genderedCategories;
    }
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
