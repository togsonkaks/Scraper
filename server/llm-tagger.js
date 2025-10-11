const OpenAI = require('openai');
require('dotenv').config();
const postgres = require('postgres');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const sql = postgres(process.env.DATABASE_URL);

/**
 * Load existing categories from database and build hierarchical paths
 * @returns {Promise<string[]>} Array of category paths like ["Men > Fashion > Footwear", ...]
 */
async function loadExistingCategoryPaths() {
  try {
    const categories = await sql`
      SELECT category_id, name, slug, parent_id, level
      FROM categories
      ORDER BY level ASC, name ASC
    `;
    
    if (categories.length === 0) {
      return [];
    }
    
    // Build parent-child map
    const categoryMap = new Map();
    categories.forEach(cat => {
      categoryMap.set(cat.category_id, cat);
    });
    
    // Build full paths for each category
    const paths = [];
    categories.forEach(cat => {
      const path = [];
      let current = cat;
      
      // Walk up the tree to build full path
      while (current) {
        path.unshift(current.name);
        current = current.parent_id ? categoryMap.get(current.parent_id) : null;
      }
      
      if (path.length > 0) {
        paths.push(path.join(' > '));
      }
    });
    
    // Remove duplicates and sort
    return [...new Set(paths)].sort();
  } catch (error) {
    console.error('Error loading categories:', error);
    return [];
  }
}

/**
 * Extract hierarchical categories and 5-6 high-quality keywords from product data using LLM
 * @param {Object} productData - The scraped product data
 * @param {string} productData.title - Product title
 * @param {string} productData.description - Product description
 * @param {string} productData.specs - Product specifications
 * @param {Array<string>} productData.breadcrumbs - Breadcrumb array
 * @param {string} productData.brand - Product brand
 * @param {Object} productData.jsonLd - JSON-LD structured data (prioritized source)
 * @returns {Promise<Object>} { categories: string[], keywords: string[], confidence: number }
 */
async function extractTagsWithLLM(productData) {
  const { title, description, specs, breadcrumbs, brand, jsonLd } = productData;
  
  // Load existing category structure from database
  const existingPaths = await loadExistingCategoryPaths();

  // Format JSON-LD data for better readability in prompt
  let jsonLdInfo = 'N/A';
  if (jsonLd && typeof jsonLd === 'object') {
    const relevantFields = {};
    const priorityKeys = ['name', 'category', 'gender', 'color', 'material', 'brand', 'sku', 'productID', 'model', 'style', 'audience'];
    for (const key of priorityKeys) {
      if (jsonLd[key]) {
        relevantFields[key] = jsonLd[key];
      }
    }
    if (Object.keys(relevantFields).length > 0) {
      jsonLdInfo = JSON.stringify(relevantFields, null, 2);
    }
  }

  // Format existing category paths for LLM
  const categoryContext = existingPaths.length > 0 
    ? `\n📂 EXISTING CATEGORY TAXONOMY (${existingPaths.length} paths):\n${existingPaths.map(p => `   - ${p}`).join('\n')}`
    : '\n📂 EXISTING CATEGORY TAXONOMY: None (you can create new paths)';

  const prompt = `Analyze this e-commerce product and extract:
1. HIERARCHICAL CATEGORIES - Full category path from general to specific
2. 5-6 HIGH-QUALITY KEYWORDS/TAGS - Brand, product line, and descriptive attributes

Product Data:
- Title: ${title || 'N/A'}
- Brand: ${brand || 'N/A'}
- JSON-LD Structured Data (⭐ PRIORITIZE THIS): ${jsonLdInfo}
- Breadcrumbs: ${Array.isArray(breadcrumbs) ? breadcrumbs.join(' > ') : (breadcrumbs || 'N/A')}
- Description: ${description?.substring(0, 500) || 'N/A'}
- Specs: ${specs?.substring(0, 300) || 'N/A'}
${categoryContext}

CATEGORY EXTRACTION RULES (STRICT TAXONOMY MATCHING):
1. **PRIORITY 1**: Match product to EXISTING category paths above
   - Look for the closest matching path in the existing taxonomy
   - Use the EXACT path format (e.g., "Men > Fashion > Footwear > Shoes > Sneakers")
   - Match as deeply as possible (prefer full path over partial)

2. **PRIORITY 2**: If NO good match exists (>70% certainty), suggest a NEW path
   - Follow hierarchy: Gender/Age → Department → Category → Subcategory
   - Example NEW path: ["Unisex", "Accessories", "Tech", "Phone Cases"]
   - Mark confidence lower (0.6-0.7) when suggesting new paths

3. Extract from JSON-LD first, then breadcrumbs, then title/description

4. Return as array: ["Men", "Fashion", "Footwear", "Shoes", "Sneakers"]

KEYWORD/TAG EXTRACTION RULES (FLEXIBLE ATTRIBUTES):
1. MUST include (if available):
   - Brand name (e.g., "Allbirds")
   - Product line/model (e.g., "Tree-Glider")

2. Add 3-4 DESCRIPTIVE TAGS (these are NOT categories):
   - Style descriptors: "casual-shoes", "running-shoe", "athletic", "minimalist"
   - Materials: "merino-wool", "mesh", "leather", "recycled"
   - Colors: "black", "white", "natural"
   - Features: "lightweight", "waterproof", "breathable"

3. IMPORTANT: Style words like "casual", "running", "athletic" are TAGS, not categories
   - ❌ WRONG: Category = "Men > Footwear > Casual Shoes"
   - ✅ RIGHT: Category = "Men > Fashion > Footwear > Shoes > Sneakers", Tags = ["casual-shoes", "athletic"]

4. Skip generic words (shoes, product, item) and words already in category path
5. Max 6 keywords total

Respond in JSON format:
{
  "categories": ["Level1", "Level2", "Level3", "Level4"],
  "keywords": ["brand", "product-model", "style-tag", "material", "color", "feature"],
  "confidence": 0.85,
  "reasoning": "Brief explanation - mention if existing path matched or new path suggested",
  "isNewPath": false
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 500
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    return {
      categories: result.categories || [],
      keywords: result.keywords || [],
      confidence: result.confidence || 0.7,
      reasoning: result.reasoning || '',
      isNewPath: result.isNewPath || false
    };
  } catch (error) {
    console.error('LLM tagging error:', error);
    throw new Error(`LLM tagging failed: ${error.message}`);
  }
}

/**
 * Retry LLM tagging with user feedback
 * @param {Object} productData - Original product data
 * @param {string} feedback - User's feedback about what was wrong
 * @returns {Promise<Object>} New suggestions
 */
async function retryWithFeedback(productData, feedback) {
  const { title, description, specs, breadcrumbs, brand, jsonLd } = productData;
  
  // Load existing category structure from database
  const existingPaths = await loadExistingCategoryPaths();

  // Format JSON-LD data for better readability in prompt
  let jsonLdInfo = 'N/A';
  if (jsonLd && typeof jsonLd === 'object') {
    const relevantFields = {};
    const priorityKeys = ['name', 'category', 'gender', 'color', 'material', 'brand', 'sku', 'productID', 'model', 'style', 'audience'];
    for (const key of priorityKeys) {
      if (jsonLd[key]) {
        relevantFields[key] = jsonLd[key];
      }
    }
    if (Object.keys(relevantFields).length > 0) {
      jsonLdInfo = JSON.stringify(relevantFields, null, 2);
    }
  }

  // Format existing category paths for LLM
  const categoryContext = existingPaths.length > 0 
    ? `\n📂 EXISTING CATEGORY TAXONOMY (${existingPaths.length} paths):\n${existingPaths.map(p => `   - ${p}`).join('\n')}`
    : '\n📂 EXISTING CATEGORY TAXONOMY: None (you can create new paths)';

  const prompt = `The previous tagging attempt was rejected with this feedback: "${feedback}"

Please re-analyze this product and provide better suggestions.

Product Data:
- Title: ${title || 'N/A'}
- Brand: ${brand || 'N/A'}
- JSON-LD Structured Data (⭐ PRIORITIZE THIS): ${jsonLdInfo}
- Breadcrumbs: ${Array.isArray(breadcrumbs) ? breadcrumbs.join(' > ') : (breadcrumbs || 'N/A')}
- Description: ${description?.substring(0, 500) || 'N/A'}
- Specs: ${specs?.substring(0, 300) || 'N/A'}
${categoryContext}

IMPORTANT RULES:
1. **MATCH EXISTING CATEGORY PATHS** from the taxonomy above - don't invent new ones unless no match exists
2. Style words like "casual", "running", "athletic" are TAGS, not categories
3. Consider the user's feedback when making corrections
4. Prioritize JSON-LD structured data if available

Respond in JSON format:
{
  "categories": ["Level1", "Level2", "Level3", "Level4"],
  "keywords": ["brand", "product-model", "style-tag", "material", "color"],
  "confidence": 0.85,
  "reasoning": "How this addresses the feedback and matches existing taxonomy",
  "isNewPath": false
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 500
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    return {
      categories: result.categories || [],
      keywords: result.keywords || [],
      confidence: result.confidence || 0.7,
      reasoning: result.reasoning || '',
      isNewPath: result.isNewPath || false
    };
  } catch (error) {
    console.error('LLM retry error:', error);
    throw new Error(`LLM retry failed: ${error.message}`);
  }
}

module.exports = {
  extractTagsWithLLM,
  retryWithFeedback
};
