require('dotenv').config();
const postgres = require('postgres');

const connectionString = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
const sql = postgres(connectionString);

let tagTaxonomy = [];
let categoryTree = [];
let isInitialized = false;

async function initializeTaxonomy() {
  if (isInitialized) return;
  
  try {
    // Load all tags with their semantic types
    tagTaxonomy = await sql`
      SELECT name, slug, tag_type 
      FROM tag_taxonomy 
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

function matchCategories(text) {
  if (!text) return [];
  
  const normalizedText = normalizeText(text);
  const matches = [];
  
  // Search for category NAMES in product data (like tag matching)
  for (const category of categoryTree) {
    const pattern = new RegExp(`\\b${category.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(normalizedText)) {
      const fullPath = buildCategoryPath(category.category_id);
      matches.push({
        id: category.category_id,
        name: category.name,
        slug: category.slug,
        parent_id: category.parent_id,
        level: category.level,
        matchedPath: fullPath.map(p => p.name).join(' > ').toLowerCase(),
        pathDepth: fullPath.length
      });
    }
  }
  
  // Sort by path depth (prefer deeper/most specific matches)
  matches.sort((a, b) => b.pathDepth - a.pathDepth);
  
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
  console.log('  🏷️ Breadcrumbs:', filteredBreadcrumbs.join(' > '));
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
  const breadcrumbText = normalizeText(productData.breadcrumbs?.join(' ') || '');
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
  
  // Match categories from ALL product data (same as tags)
  let matchedCategories = matchCategories(searchText);
  console.log('  📂 Matched categories:', matchedCategories.length, '→', 
    matchedCategories.map(c => `${c.name} (lvl ${c.level})`).join(', '));
  
  // Find primary category (deepest/most specific level category)
  let primaryCategory = null;
  let categoryPath = [];
  
  if (matchedCategories.length > 0) {
    // Always pick the deepest (most specific) category match
    const deepestCategory = matchedCategories.reduce((prev, current) => 
      (current.level > prev.level) ? current : prev
    );
    
    console.log('  🎯 Deepest category:', deepestCategory.name, `(lvl ${deepestCategory.level}, id: ${deepestCategory.id})`);
    
    categoryPath = buildCategoryPath(deepestCategory.id);
    
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

module.exports = { autoTag, initializeTaxonomy };
