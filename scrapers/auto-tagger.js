const fs = require('fs');
const path = require('path');

const keywords = JSON.parse(fs.readFileSync(path.join(__dirname, 'keywords.json'), 'utf8'));

function normalizeText(text) {
  if (!text) return '';
  return text.toLowerCase().trim();
}

function createSlug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function matchKeywords(text, keywordGroup) {
  const normalizedText = normalizeText(text);
  const matches = new Set();
  
  for (const [key, terms] of Object.entries(keywordGroup)) {
    for (const term of terms) {
      const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (pattern.test(normalizedText)) {
        matches.add(key);
        break;
      }
    }
  }
  
  return Array.from(matches);
}

function calculateConfidence(results) {
  let score = 0;
  
  if (results.gender.length > 0) score += 0.15;
  if (results.primaryCategory) score += 0.30;
  if (results.materials.length > 0) score += 0.10;
  if (results.styles.length > 0) score += 0.15;
  if (results.features.length > 0) score += 0.15;
  if (results.colors.length > 0) score += 0.10;
  if (results.occasions.length > 0) score += 0.05;
  
  return Math.min(score, 0.95).toFixed(2);
}

function autoTag(productData) {
  // Normalize breadcrumbs to handle both string and array formats
  let breadcrumbsText = '';
  let breadcrumbsArray = [];
  
  if (productData.breadcrumbs) {
    if (Array.isArray(productData.breadcrumbs)) {
      breadcrumbsArray = productData.breadcrumbs;
      breadcrumbsText = productData.breadcrumbs.join(' ');
    } else if (typeof productData.breadcrumbs === 'string') {
      breadcrumbsText = productData.breadcrumbs;
      // Try to split string breadcrumbs by common separators
      breadcrumbsArray = productData.breadcrumbs.split(/\s*[/>|›»]\s*/).filter(Boolean);
    }
  }
  
  const searchText = [
    productData.title || '',
    productData.description || '',
    breadcrumbsText,
    productData.brand || '',
    productData.tags || '',
    productData.specs || ''
  ].join(' ');
  
  const results = {
    gender: matchKeywords(searchText, keywords.gender),
    categories: matchKeywords(searchText, keywords.categories),
    materials: matchKeywords(searchText, keywords.materials),
    styles: matchKeywords(searchText, keywords.styles),
    features: matchKeywords(searchText, keywords.features),
    colors: matchKeywords(searchText, keywords.colors),
    occasions: matchKeywords(searchText, keywords.occasions)
  };
  
  let primaryCategory = null;
  let categoryHierarchy = [];
  
  if (breadcrumbsArray.length > 0) {
    const filteredBreadcrumbs = breadcrumbsArray.filter((crumb, idx) => {
      const isLastCrumb = idx === breadcrumbsArray.length - 1;
      const matchesTitle = productData.title && 
        normalizeText(crumb) === normalizeText(productData.title);
      return !(isLastCrumb && matchesTitle);
    });
    
    categoryHierarchy = filteredBreadcrumbs.map(crumb => ({
      name: crumb,
      slug: createSlug(crumb)
    }));
    
    if (categoryHierarchy.length > 0) {
      primaryCategory = categoryHierarchy[categoryHierarchy.length - 1].slug;
    }
  }
  
  if (!primaryCategory && results.categories.length > 0) {
    primaryCategory = results.categories[0];
  }
  
  const allTags = [
    ...results.gender,
    ...results.materials,
    ...results.styles,
    ...results.features,
    ...results.colors,
    ...results.occasions
  ];
  
  const uniqueTags = Array.from(new Set(allTags)).map(tag => ({
    name: tag.replace(/_/g, ' '),
    slug: createSlug(tag),
    type: getTagType(tag)
  }));
  
  const confidence = calculateConfidence(results);
  
  return {
    primaryCategory,
    categoryHierarchy,
    gender: results.gender.length > 0 ? results.gender[0] : null,
    tags: uniqueTags,
    allCategories: results.categories,
    confidenceScore: parseFloat(confidence),
    needsLLMEnrichment: parseFloat(confidence) < 0.70
  };
}

function getTagType(tag) {
  for (const [type, group] of Object.entries(keywords)) {
    if (type === 'categories') continue;
    for (const [key, terms] of Object.entries(group)) {
      if (key === tag) return type;
    }
  }
  return 'general';
}

module.exports = { autoTag };
