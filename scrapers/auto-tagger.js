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

function matchCategories(breadcrumbs) {
  if (!breadcrumbs || breadcrumbs.length === 0) return [];
  
  const matches = [];
  const breadcrumbText = breadcrumbs.join(' ').toLowerCase();
  
  for (const category of categoryTree) {
    const categoryName = category.name.toLowerCase();
    if (breadcrumbText.includes(categoryName)) {
      matches.push({
        id: category.category_id,
        name: category.name,
        slug: category.slug,
        parent_id: category.parent_id,
        level: category.level
      });
    }
  }
  
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
  
  // Build search text
  const searchText = [
    productData.title || '',
    productData.description || '',
    filteredBreadcrumbs.join(' '),
    productData.brand || '',
    productData.tags || '',
    productData.specs || ''
  ].join(' ');
  
  // Match all tags
  const allMatchedTags = matchTags(searchText);
  
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
  
  // Match categories from breadcrumbs
  const matchedCategories = matchCategories(filteredBreadcrumbs);
  
  // Find primary category (deepest level category)
  let primaryCategory = null;
  let categoryPath = [];
  
  if (matchedCategories.length > 0) {
    const deepestCategory = matchedCategories.reduce((prev, current) => 
      (current.level > prev.level) ? current : prev
    );
    
    primaryCategory = {
      id: deepestCategory.id,
      name: deepestCategory.name,
      slug: deepestCategory.slug
    };
    
    categoryPath = buildCategoryPath(deepestCategory.id);
  }
  
  // Detect gender from tags or text
  let gender = null;
  const genderMatches = searchText.match(/\b(men|women|unisex|boys|girls|kids)\b/gi);
  if (genderMatches && genderMatches.length > 0) {
    gender = genderMatches[0].toLowerCase();
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
