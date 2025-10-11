const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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

  const prompt = `Analyze this e-commerce product and extract:
1. HIERARCHICAL CATEGORIES - Full category path from general to specific (e.g., Women > Shoes > Sneakers > Running)
2. 5-6 HIGH-QUALITY KEYWORDS - Brand, product line, and key attributes

Product Data:
- Title: ${title || 'N/A'}
- Brand: ${brand || 'N/A'}
- JSON-LD Structured Data (⭐ PRIORITIZE THIS): ${jsonLdInfo}
- Breadcrumbs: ${Array.isArray(breadcrumbs) ? breadcrumbs.join(' > ') : (breadcrumbs || 'N/A')}
- Description: ${description?.substring(0, 500) || 'N/A'}
- Specs: ${specs?.substring(0, 300) || 'N/A'}

CATEGORY EXTRACTION RULES:
1. PRIORITIZE JSON-LD structured data (category, gender, audience fields) - this is the most reliable source
2. Extract the FULL category path with all intermediate levels (don't skip levels)
3. Order: Gender/Age → Type → Style → Specific Use
4. Examples:
   - Women > Shoes > Sneakers > Running (not Women > Shoes > Running)
   - Men > Clothing > Tops > T-Shirts (not Men > Clothing > T-Shirts)
   - Home > Furniture > Bedroom > Beds (not Home > Bedroom > Beds)
5. If JSON-LD is incomplete, use breadcrumbs/title/description as fallback
6. Return as array: ["Women", "Shoes", "Sneakers", "Running"]

KEYWORD EXTRACTION RULES:
1. MUST include (if available):
   - Brand name (e.g., "Nike")
   - Product line + model combined (e.g., "Air Force 270", not separate)
2. PRIORITIZE extracting from JSON-LD fields (color, material, style, model)
3. Fill remaining 3-4 slots with:
   - Materials (mesh, leather, cotton)
   - Colors (white, black, blue)
   - Style/use case (athletic, casual, running)
   - Key features (cushioned, waterproof, lightweight)
4. Skip generic words (shoes, product, item)
5. Skip words already in category path
6. Order by confidence (most certain first)
7. Max 6 keywords total

Respond in JSON format:
{
  "categories": ["Level1", "Level2", "Level3", "Level4"],
  "keywords": ["brand", "product-line-model", "attribute1", "attribute2", "attribute3", "attribute4"],
  "confidence": 0.85,
  "reasoning": "Brief explanation of choices (mention if JSON-LD was used)"
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
      reasoning: result.reasoning || ''
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

  const prompt = `The previous tagging attempt was rejected with this feedback: "${feedback}"

Please re-analyze this product and provide better suggestions.

Product Data:
- Title: ${title || 'N/A'}
- Brand: ${brand || 'N/A'}
- JSON-LD Structured Data (⭐ PRIORITIZE THIS): ${jsonLdInfo}
- Breadcrumbs: ${Array.isArray(breadcrumbs) ? breadcrumbs.join(' > ') : (breadcrumbs || 'N/A')}
- Description: ${description?.substring(0, 500) || 'N/A'}
- Specs: ${specs?.substring(0, 300) || 'N/A'}

Apply the same rules as before but consider the user's feedback. Remember to prioritize JSON-LD structured data if available.

Respond in JSON format:
{
  "categories": ["Level1", "Level2", "Level3", "Level4"],
  "keywords": ["brand", "product-line-model", "attribute1", "attribute2", "attribute3"],
  "confidence": 0.85,
  "reasoning": "How this addresses the feedback"
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
      reasoning: result.reasoning || ''
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
